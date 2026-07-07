import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Query,
  Param,
  Res,
  Req,
  Request,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { Response } from 'express';
import { Public } from '../../common/decorators/public.decorator';
import * as crypto from 'crypto';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiQuery,
  ApiBearerAuth,
  ApiParam,
  ApiBody,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { JwtRequest, JwtRequestHelper } from '@common/interfaces/jwt-request.interface';
import { UserDriveAccessService } from './services/user-drive-access.service';
import {
  DriveConnectionStatusDto,
  DriveAuthUrlDto,
  DriveDisconnectResultDto,
  DriveAccessTokenDto,
} from './dto/drive-connection.dto';
import { RegisterDriveFileDto, DriveUploadPurpose } from './dto/drive-upload.dto';
import { DriveFileQueryDto, DriveFileResponseDto, DriveFileListResponseDto } from './dto/drive-file-query.dto';

/**
 * Google Drive Access Management Controller.
 * 
 * ARCHITECTURE: Direct Upload (Frontend → Google Drive)
 * =====================================================
 * 
 * The frontend uploads files DIRECTLY to Google Drive — files never pass through
 * our backend. Our backend handles:
 * 
 * 1. OAuth connection (one-time consent → refresh token stored encrypted)
 * 2. Access token dispensing (backend refreshes → sends short-lived access token)
 * 3. Folder creation (organized folder structure on user's Drive)
 * 4. File registration (after upload, frontend registers file → backend verifies)
 * 5. File management (list, get, delete, download-proxy)
 * 
 * SECURITY:
 * - Refresh tokens NEVER leave the backend (AES-256-GCM encrypted in DB)
 * - Access tokens are short-lived (~1hr), scoped to drive.file only
 * - Every registered file is verified against Google Drive API
 * - All endpoints require JWT authentication (except OAuth callback)
 * 
 * ENDPOINT OVERVIEW:
 * ==================
 * GET  /drive-access/status              - Check connection status
 * GET  /drive-access/connect             - Get OAuth consent URL
 * GET  /drive-access/callback            - OAuth callback (Google redirects here)
 * POST /drive-access/disconnect          - Revoke & disconnect
 * GET  /drive-access/token               - Get short-lived access token for upload
 * GET  /drive-access/folder              - Get/create organized upload folder
 * POST /drive-access/folder              - Create custom folder
 * POST /drive-access/files/register      - Register a file after direct upload
 * GET  /drive-access/files               - List registered files
 * GET  /drive-access/files/:id           - Get file details
 * GET  /drive-access/files/:id/download  - Download file through backend
 * DELETE /drive-access/files/:id         - Delete file
 */
@ApiTags('Google Drive Access Management')
@Controller('drive-access')
export class UserDriveAccessController {
  constructor(private readonly driveService: UserDriveAccessService) {}

  // ============================================================
  // CONNECTION MANAGEMENT
  // ============================================================

  @Get('status')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Check Google Drive connection status',
    description: 'Returns whether the user has an active Google Drive connection. NEVER returns any tokens.',
  })
  @ApiResponse({ status: 200, type: DriveConnectionStatusDto })
  async getConnectionStatus(@Request() req: JwtRequest): Promise<DriveConnectionStatusDto> {
    const userId = JwtRequestHelper.getUserId(req.user);
    return this.driveService.getConnectionStatus(userId);
  }

  @Get('connect')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Initiate Google Drive connection (one-time)',
    description: `
    Returns a Google OAuth2 consent URL. Frontend should redirect the user to this URL.
    
    FLOW:
    1. Frontend calls GET /drive-access/connect → gets authUrl
    2. Frontend does window.location.href = authUrl (web) or Linking.openURL(authUrl) (mobile)
    3. User grants consent on Google (one-time)
    4. Google redirects to /drive-access/callback
    5. Backend stores encrypted refresh token, redirects to frontend/app
    6. From now on, user can upload directly to Drive without re-authenticating

    PLATFORM PARAM:
    - platform=web  (default) → redirects to https://lms.suraksha.lk after consent
    - platform=mobile         → redirects to lk.suraksha.lms://drive-callback after consent
    `,
  })
  @ApiQuery({ name: 'returnUrl', required: false, description: 'Web-only: relative path to redirect to after connection (default: /profile?tab=apps)', example: '/profile?tab=apps' })
  @ApiQuery({ name: 'platform', required: false, description: 'web (default) or mobile', example: 'mobile' })
  @ApiResponse({ status: 200, type: DriveAuthUrlDto })
  async initiateConnection(
    @Request() req: JwtRequest,
    @Query('returnUrl') returnUrl?: string,
    @Query('platform') platform?: string,
  ): Promise<DriveAuthUrlDto> {
    const userId = JwtRequestHelper.getUserId(req.user);

    const resolvedPlatform = platform === 'mobile' ? 'mobile' : 'web';

    // For web: validate returnUrl is a safe relative path; default to /profile?tab=apps
    const safeReturnUrl = (returnUrl && returnUrl.startsWith('/') && !returnUrl.startsWith('//'))
      ? returnUrl
      : '/profile?tab=apps';

    // Build state payload with user context
    const stateData = JSON.stringify({ userId, returnUrl: safeReturnUrl, platform: resolvedPlatform });
    const statePayload = Buffer.from(stateData).toString('base64url');

    // HMAC-sign the state to prevent forgery (verified in callback)
    const stateSecret = process.env.JWT_SECRET || '';
    const hmac = crypto.createHmac('sha256', stateSecret).update(statePayload).digest('base64url');
    const state = `${statePayload}.${hmac}`;

    // Generate the Google OAuth consent URL
    const result = this.driveService.generateAuthUrl(userId, state);
    return { authUrl: result.authUrl, state: result.state };
  }

  @Get('callback')
  @Public() // OAuth callback must be public - Google redirects here without JWT token
  @ApiOperation({
    summary: 'Google OAuth2 callback (internal — do not call directly)',
    description: 'Google redirects here after consent. Exchanges code for tokens, stores securely, redirects to frontend or mobile app.',
  })
  @ApiResponse({ status: 302, description: 'Redirects to frontend (web) or deep-link (mobile) with success/error' })
  async handleOAuthCallback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Query('error') error: string,
    @Req() req: any,
    @Res() res: Response,
  ): Promise<void> {
    const webFrontendUrl = process.env.FRONTEND_URL || 'https://lms.suraksha.lk';
    const mobileScheme = 'lk.suraksha.lms'; // deep-link scheme for the mobile app
    let returnUrl = '/profile?tab=apps';
    let platform = 'web';

    const buildRedirect = (success: boolean, params: Record<string, string>) => {
      const qs = new URLSearchParams(params).toString();
      if (platform === 'mobile') {
        // Deep-link: lk.suraksha.lms://drive-callback?drive_connected=true&...
        return `${mobileScheme}://drive-callback?${qs}`;
      }
      // Web: absolute https URL — use the stored relative returnUrl
      return `${webFrontendUrl}${returnUrl}?${qs}`;
    };

    try {
      let userId: string;
      try {
        // Verify HMAC signature on state to prevent forgery
        const parts = state.split('.');
        if (parts.length !== 2) {
          throw new BadRequestException('Invalid state parameter format');
        }
        const [statePayload, hmacSignature] = parts;
        const stateSecret = process.env.JWT_SECRET || '';
        const expectedHmac = crypto.createHmac('sha256', stateSecret).update(statePayload).digest('base64url');
        if (!crypto.timingSafeEqual(Buffer.from(hmacSignature), Buffer.from(expectedHmac))) {
          throw new BadRequestException('Invalid state signature — possible CSRF attack');
        }
        const stateData = JSON.parse(Buffer.from(statePayload, 'base64url').toString('utf-8'));
        userId = stateData.userId;
        platform = stateData.platform === 'mobile' ? 'mobile' : 'web';
        returnUrl = stateData.returnUrl || '/profile?tab=apps';
        // Validate returnUrl is a safe relative path (web only)
        if (!returnUrl.startsWith('/') || returnUrl.startsWith('//')) {
          returnUrl = '/profile?tab=apps';
        }
      } catch (stateErr) {
        if (stateErr instanceof BadRequestException) throw stateErr;
        throw new BadRequestException('Invalid state parameter');
      }

      if (error) {
        const errorMessage = error === 'access_denied'
          ? 'Google Drive access was denied'
          : `Google OAuth error: ${error}`;
        res.redirect(buildRedirect(false, { drive_connected: 'false', error: errorMessage }));
        return;
      }

      if (!code) {
        throw new BadRequestException('Authorization code is required');
      }

      const result = await this.driveService.handleOAuthCallback(
        code, userId, req.ip, req.headers['user-agent'],
      );

      res.redirect(buildRedirect(true, {
        drive_connected: 'true',
        google_email: result.googleEmail || '',
      }));
    } catch (err) {
      res.redirect(buildRedirect(false, {
        drive_connected: 'false',
        error: err.message || 'Failed to connect Google Drive',
      }));
    }
  }

  @Post('disconnect')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Disconnect Google Drive',
    description: 'Revokes tokens at Google and removes all stored tokens. User will need to re-authorize.',
  })
  @ApiResponse({ status: 200, type: DriveDisconnectResultDto })
  async disconnect(@Request() req: JwtRequest): Promise<DriveDisconnectResultDto> {
    const userId = JwtRequestHelper.getUserId(req.user);
    return this.driveService.disconnect(userId);
  }

  // ============================================================
  // ACCESS TOKEN DISPENSING (for frontend direct upload)
  // ============================================================

  @Get('token')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get short-lived access token for direct Drive upload',
    description: `
    Returns a short-lived Google access token (~1 hour) that the frontend uses
    to upload files DIRECTLY to Google Drive.
    
    SECURITY:
    - Refresh token stays encrypted in our DB — NEVER sent
    - Access token is scoped to drive.file (can only access files created by our app)
    - Access token expires in ~1 hour (set by Google)
    - This is the same model Google's own JS client (gapi) uses
    
    FRONTEND USAGE:
    1. Call GET /drive-access/token → get accessToken
    2. Use accessToken with Google Drive API or gapi to upload
    3. After upload, call POST /drive-access/files/register with driveFileId
    `,
  })
  @ApiResponse({ status: 200, type: DriveAccessTokenDto })
  @ApiResponse({ status: 401, description: 'Drive not connected' })
  async getAccessToken(@Request() req: JwtRequest): Promise<DriveAccessTokenDto> {
    const userId = JwtRequestHelper.getUserId(req.user);
    return this.driveService.getAccessTokenForUpload(userId);
  }

  // ============================================================
  // FOLDER MANAGEMENT
  // ============================================================

  @Get('folder')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get organized upload folder ID',
    description: `
    Returns the Google Drive folder ID where files should be uploaded for a given purpose.
    Creates the folder structure if it doesn't exist (Suraksha LMS / {Purpose}).
    
    Frontend should pass this folderId as the 'parents' parameter when uploading to Drive.
    `,
  })
  @ApiQuery({ name: 'purpose', enum: DriveUploadPurpose, required: true, description: 'Upload purpose' })
  @ApiResponse({ status: 200, schema: { properties: { folderId: { type: 'string' }, folderPath: { type: 'string' } } } })
  async getUploadFolder(
    @Request() req: JwtRequest,
    @Query('purpose') purpose: DriveUploadPurpose,
  ): Promise<{ folderId: string; folderPath: string }> {
    const userId = JwtRequestHelper.getUserId(req.user);
    if (!purpose) throw new BadRequestException('purpose query parameter is required');
    return this.driveService.getUploadFolderId(userId, purpose);
  }

  @Post('folder')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Create a custom folder in Google Drive',
    description: 'Creates a new folder in the user\'s Google Drive. Optionally specify a parent folder ID.',
  })
  @ApiBody({ schema: { properties: { folderName: { type: 'string' }, parentFolderId: { type: 'string' } }, required: ['folderName'] } })
  @ApiResponse({ status: 201, schema: { properties: { folderId: { type: 'string' }, folderName: { type: 'string' }, webViewLink: { type: 'string' } } } })
  async createFolder(
    @Request() req: JwtRequest,
    @Body('folderName') folderName: string,
    @Body('parentFolderId') parentFolderId?: string,
  ): Promise<{ folderId: string; folderName: string; webViewLink: string }> {
    const userId = JwtRequestHelper.getUserId(req.user);
    if (!folderName) throw new BadRequestException('folderName is required');
    return this.driveService.createFolder(userId, folderName, parentFolderId);
  }

  // ============================================================
  // FILE REGISTRATION & MANAGEMENT
  // ============================================================

  @Post('files/register')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Register a file after direct upload to Google Drive',
    description: `
    After the frontend uploads a file directly to Google Drive, call this endpoint
    to register it in our system.
    
    FLOW:
    1. Frontend uploaded file to Drive using access token from GET /drive-access/token
    2. Google returned a driveFileId
    3. Frontend calls POST /drive-access/files/register with { driveFileId, purpose, ... }
    4. Backend VERIFIES the file exists on Drive (prevents spoofing)
    5. Backend fetches accurate metadata from Drive
    6. Backend stores file record and optionally sets sharing permissions
    7. Returns file metadata
    `,
  })
  @ApiResponse({ status: 201, type: DriveFileResponseDto })
  @ApiResponse({ status: 400, description: 'File not found on Drive' })
  async registerFile(
    @Request() req: JwtRequest,
    @Body() dto: RegisterDriveFileDto,
  ): Promise<DriveFileResponseDto> {
    const userId = JwtRequestHelper.getUserId(req.user);

    const file = await this.driveService.registerUploadedFile(userId, dto.driveFileId, {
      purpose: dto.purpose,
      referenceType: dto.referenceType,
      referenceId: dto.referenceId,
      shareWithEmails: dto.shareWithEmails
        ? dto.shareWithEmails.split(',').map(e => e.trim()).filter(Boolean)
        : undefined,
    });

    return DriveFileResponseDto.fromEntity(file);
  }

  @Get('files')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'List registered files',
    description: 'List all files registered by the current user. Supports filtering by purpose and reference.',
  })
  @ApiResponse({ status: 200, type: DriveFileListResponseDto })
  async listFiles(
    @Request() req: JwtRequest,
    @Query() query: DriveFileQueryDto,
  ): Promise<DriveFileListResponseDto> {
    const userId = JwtRequestHelper.getUserId(req.user);

    const { data, total } = await this.driveService.listFiles(userId, {
      purpose: query.purpose,
      referenceType: query.referenceType,
      referenceId: query.referenceId,
      page: query.page,
      limit: query.limit,
    });

    const limit = query.limit || 20;

    return {
      data: data.map(f => DriveFileResponseDto.fromEntity(f)),
      total,
      page: query.page || 1,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  @Get('files/:id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get file details' })
  @ApiParam({ name: 'id', description: 'File record ID' })
  @ApiResponse({ status: 200, type: DriveFileResponseDto })
  async getFile(
    @Request() req: JwtRequest,
    @Param('id') id: string,
  ): Promise<DriveFileResponseDto> {
    const userId = JwtRequestHelper.getUserId(req.user);
    const file = await this.driveService.getFile(userId, id);
    return DriveFileResponseDto.fromEntity(file);
  }

  @Get('files/:id/download')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Download file through backend (proxy)',
    description: 'For cases where direct Drive URLs don\'t work (embedding, private files). Downloads through our backend.',
  })
  @ApiParam({ name: 'id', description: 'File record ID' })
  @ApiResponse({ status: 200, description: 'File binary content' })
  async downloadFile(
    @Request() req: JwtRequest,
    @Param('id') id: string,
    @Res() res: Response,
  ): Promise<void> {
    const userId = JwtRequestHelper.getUserId(req.user);
    const { buffer, fileName, mimeType } = await this.driveService.getFileContent(userId, id);

    res.set({
      'Content-Type': mimeType,
      'Content-Disposition': `attachment; filename="${encodeURIComponent(fileName)}"`,
      'Content-Length': buffer.length.toString(),
      'Cache-Control': 'private, max-age=3600',
    });

    res.send(buffer);
  }

  @Delete('files/:id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Delete file from Google Drive',
    description: 'Deletes the file from Google Drive and marks it as deleted in our system.',
  })
  @ApiParam({ name: 'id', description: 'File record ID' })
  @ApiResponse({ status: 200 })
  async deleteFile(
    @Request() req: JwtRequest,
    @Param('id') id: string,
  ): Promise<{ success: boolean; message: string }> {
    const userId = JwtRequestHelper.getUserId(req.user);
    return this.driveService.deleteFile(userId, id);
  }
}
