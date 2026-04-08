import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Query,
  Req,
  Res,
  Request,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { Response } from 'express';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiBody,
  ApiQuery,
} from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { FlexibleAccessGuard } from '../../auth/guards/flexible-access.guard';
import { RequireAnyOfRoles } from '../../auth/decorators/flexible-access.decorator';
import { UserType } from '../user/enums/user-type.enum';
import { JwtRequest, JwtRequestHelper } from '@common/interfaces/jwt-request.interface';
import { InstituteDriveService } from './services/institute-drive.service';
import {
  InstituteDriveStatusDto,
  InstituteDriveAuthUrlDto,
  InstituteDriveAccessTokenDto,
  GetInstituteFolderDto,
  InstituteFolderResponseDto,
  RegisterInstituteDriveFileDto,
  InstituteDriveFileResponseDto,
  InstituteDriveFileListResponseDto,
  InstituteDriveFileQueryDto,
  InstituteDrivePurpose,
} from './dto/institute-drive.dto';

/**
 * Institute Google Drive Controller
 * ===================================
 *
 * Manages a Google Drive account that belongs to an **institute**, not a personal user.
 * This solves the disappearing-file problem where lecture documents / homework references
 * stored in a teacher's personal Drive vanish when that teacher is removed.
 *
 * ROLE REQUIREMENTS:
 * - Connect / disconnect (admin-only):  role bitmask 2 (INSTITUTE_ADMIN) or SUPERADMIN
 * - Get token / folder / register file: role bitmask 2|4 (admin or teacher) or SUPERADMIN
 * - List files:                         any user with institute access
 * - Delete file:                        admin or teacher who uploaded
 *
 * ENDPOINT OVERVIEW:
 * GET    /institute-drive/:id/status            — Is a Drive connected?
 * GET    /institute-drive/:id/connect           — Generate OAuth URL (admin only)
 * GET    /institute-drive/callback              — OAuth callback (Public — Google redirects here)
 * POST   /institute-drive/:id/disconnect        — Disconnect (admin only)
 * GET    /institute-drive/:id/token             — Short-lived access token (admin | teacher)
 * GET    /institute-drive/:id/folder            — Get/create organised upload folder (admin | teacher)
 * POST   /institute-drive/:id/files/register    — Register uploaded file (admin | teacher)
 * GET    /institute-drive/:id/files             — List files (any institute member)
 * DELETE /institute-drive/:id/files/:fileId     — Delete file (admin | teacher uploader)
 */
@ApiTags('Institute Google Drive')
@Controller('institute-drive')
export class InstituteDriveController {
  constructor(private readonly driveService: InstituteDriveService) {}

  // =========================================================================
  // STATUS
  // =========================================================================

  @Get(':instituteId/status')
  @UseGuards(JwtAuthGuard, FlexibleAccessGuard)
  @RequireAnyOfRoles({ global: [UserType.SUPERADMIN], anyInstituteRole: true })
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Check whether the institute has a Google Drive connected' })
  @ApiParam({ name: 'instituteId', description: 'Institute ID' })
  @ApiResponse({ status: 200, type: InstituteDriveStatusDto })
  async getStatus(
    @Param('instituteId') instituteId: string,
  ): Promise<InstituteDriveStatusDto> {
    return this.driveService.getConnectionStatus(instituteId);
  }

  // =========================================================================
  // CONNECT (admin-only)
  // =========================================================================

  @Get(':instituteId/connect')
  @UseGuards(JwtAuthGuard, FlexibleAccessGuard)
  @RequireAnyOfRoles({ global: [UserType.SUPERADMIN], instituteAdmin: true })
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Generate the Google OAuth consent URL to connect the institute Drive',
    description: `
      **Institute Admin only.**  
      Redirect the admin's browser to the returned \`authUrl\`.  
      After Google consent, the admin is redirected back to:
      \`/institute-drive/callback?code=...&state=...\`  
      which completes the connection automatically.

      FLOW:
      1. Admin calls GET /institute-drive/{id}/connect
      2. Frontend does window.location.href = authUrl
      3. Admin grants access on Google
      4. Google redirects to /institute-drive/callback
      5. Backend stores encrypted refresh token
      6. Admin is redirected to institute settings page
    `,
  })
  @ApiParam({ name: 'instituteId' })
  @ApiQuery({ name: 'returnUrl', required: false, description: 'Relative frontend path to return to after connection' })
  @ApiResponse({ status: 200, type: InstituteDriveAuthUrlDto })
  async connect(
    @Param('instituteId') instituteId: string,
    @Request() req: JwtRequest,
    @Query('returnUrl') returnUrl?: string,
  ): Promise<InstituteDriveAuthUrlDto> {
    const adminUserId = JwtRequestHelper.getUserId(req.user);
    const safeReturn =
      returnUrl && returnUrl.startsWith('/') && !returnUrl.startsWith('//')
        ? returnUrl
        : '/institute-settings?tab=integrations';
    return this.driveService.generateAuthUrl(instituteId, adminUserId, safeReturn);
  }

  // =========================================================================
  // OAUTH CALLBACK (Public — Google redirects here)
  // =========================================================================

  @Get('callback')
  @Public()
  @ApiOperation({
    summary: 'OAuth callback for institute Drive (internal — do not call directly)',
    description: 'Google redirects here after the admin grants consent. Do not call this endpoint directly.',
  })
  @ApiResponse({ status: 302, description: 'Redirects to frontend after connecting (or on error)' })
  async handleCallback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Query('error') error: string,
    @Req() req: any,
    @Res() res: Response,
  ): Promise<void> {
    const webFrontendUrl = process.env.FRONTEND_URL || 'https://lms.suraksha.lk';
    let returnUrl = '/institute-settings?tab=integrations';

    const buildRedirect = (success: boolean, params: Record<string, string>) => {
      const qs = new URLSearchParams(params).toString();
      return `${webFrontendUrl}${returnUrl}?${qs}`;
    };

    try {
      if (error) {
        res.redirect(
          buildRedirect(false, {
            drive_connected: 'false',
            error: error === 'access_denied' ? 'Access denied by user' : `OAuth error: ${error}`,
          }),
        );
        return;
      }

      if (!code || !state) {
        res.redirect(
          buildRedirect(false, { drive_connected: 'false', error: 'Missing code or state' }),
        );
        return;
      }

      const parsed = this.driveService.verifyState(state);
      const { instituteId, adminUserId } = parsed;
      returnUrl = parsed.returnUrl || returnUrl;

      const result = await this.driveService.handleOAuthCallback(
        code,
        instituteId,
        adminUserId,
        req.ip,
        req.headers['user-agent'],
      );

      res.redirect(
        buildRedirect(true, {
          drive_connected: 'true',
          google_email: result.googleEmail || '',
        }),
      );
    } catch (err) {
      res.redirect(
        buildRedirect(false, {
          drive_connected: 'false',
          error: (err as any)?.message || 'Failed to connect institute Drive',
        }),
      );
    }
  }

  // =========================================================================
  // DISCONNECT (admin-only)
  // =========================================================================

  @Post(':instituteId/disconnect')
  @UseGuards(JwtAuthGuard, FlexibleAccessGuard)
  @RequireAnyOfRoles({ global: [UserType.SUPERADMIN], instituteAdmin: true })
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Disconnect the institute Google Drive (admin only)' })
  @ApiParam({ name: 'instituteId' })
  @ApiResponse({ status: 200 })
  async disconnect(
    @Param('instituteId') instituteId: string,
  ): Promise<{ success: boolean; message: string }> {
    return this.driveService.disconnect(instituteId);
  }

  // =========================================================================
  // ACCESS TOKEN — teachers use this to upload directly to the institute Drive
  // =========================================================================

  @Get(':instituteId/token')
  @UseGuards(JwtAuthGuard, FlexibleAccessGuard)
  @RequireAnyOfRoles({ global: [UserType.SUPERADMIN], instituteAdmin: true, teacher: true })
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get a short-lived Google access token for direct upload to the institute Drive',
    description: `
      **Admin or Teacher only.**

      Returns a short-lived (~1 h) Google access token.  
      The frontend uploads files DIRECTLY to the institute Google Drive using this token.  
      The access token is scoped to \`drive.file\` — it can only access files created by our app.

      FLOW:
      1. Teacher calls GET /institute-drive/{id}/token → accessToken
      2. Teacher calls GET /institute-drive/{id}/folder?purpose=...&grade=...&className=...&subjectName=... → folderId
      3. Teacher uploads file directly to Google Drive with accessToken + folderId as parent
      4. Google returns driveFileId
      5. Teacher calls POST /institute-drive/{id}/files/register with driveFileId + metadata
    `,
  })
  @ApiParam({ name: 'instituteId' })
  @ApiResponse({ status: 200, type: InstituteDriveAccessTokenDto })
  async getToken(
    @Param('instituteId') instituteId: string,
  ): Promise<InstituteDriveAccessTokenDto> {
    return this.driveService.getAccessToken(instituteId);
  }

  // =========================================================================
  // FOLDER — returns (or creates) the correct Drive folder for the upload context
  // =========================================================================

  @Get(':instituteId/folder')
  @UseGuards(JwtAuthGuard, FlexibleAccessGuard)
  @RequireAnyOfRoles({ global: [UserType.SUPERADMIN], instituteAdmin: true, teacher: true })
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get the organised Drive folder ID for uploading (creates folder hierarchy if needed)',
    description: `
      **Admin or Teacher only.**

      Returns the Google Drive \`folderId\` where this particular upload should go.  
      Folders are organised as:

      \`\`\`
      Suraksha LMS / {InstituteName} / Grade {N} - {ClassName} / {SubjectName} / {Purpose}
      \`\`\`

      All intermediate folders are created automatically if they don't exist.  
      Pass the returned \`folderId\` as the \`parents\` field when uploading to Drive.

      EXAMPLE:
      \`GET /institute-drive/42/folder?purpose=LECTURE_DOCUMENT&grade=10&className=10A&subjectName=Mathematics\`
      → returns folder: "Suraksha LMS / St. Mary's / Grade 10 - 10A / Mathematics / Lecture Documents"
    `,
  })
  @ApiParam({ name: 'instituteId' })
  @ApiQuery({ name: 'purpose', enum: InstituteDrivePurpose })
  @ApiQuery({ name: 'grade', required: false, type: Number })
  @ApiQuery({ name: 'className', required: false, type: String })
  @ApiQuery({ name: 'subjectName', required: false, type: String })
  @ApiResponse({ status: 200, type: InstituteFolderResponseDto })
  async getFolder(
    @Param('instituteId') instituteId: string,
    @Query('purpose') purpose: InstituteDrivePurpose,
    @Query('grade') grade: string,
    @Query('className') className: string,
    @Query('subjectName') subjectName: string,
    @Req() req: JwtRequest,
  ): Promise<InstituteFolderResponseDto> {
    if (!purpose) throw new BadRequestException('purpose query parameter is required');

    // Fetch institute name for the root folder label
    // (We use a simple lookup — if caller passes instituteName query param we use it,
    //  otherwise fall back to the institute ID as the folder name)
    const instituteName = (req.query?.instituteName as string)?.trim() || `Institute ${instituteId}`;

    const dto: GetInstituteFolderDto = {
      purpose,
      grade: grade ? parseInt(grade, 10) : undefined,
      className: className?.trim() || undefined,
      subjectName: subjectName?.trim() || undefined,
    };

    return this.driveService.getUploadFolder(instituteId, instituteName, dto);
  }

  // =========================================================================
  // FILE REGISTRATION
  // =========================================================================

  @Post(':instituteId/files/register')
  @UseGuards(JwtAuthGuard, FlexibleAccessGuard)
  @RequireAnyOfRoles({ global: [UserType.SUPERADMIN], instituteAdmin: true, teacher: true })
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Register a file after direct upload to the institute Google Drive',
    description: `
      **Admin or Teacher only.**

      After uploading a file directly to Google Drive using the access token from
      GET /institute-drive/{id}/token, call this endpoint to register it in our system.

      Backend VERIFIES the file actually exists on Drive (prevents spoofing), then
      stores the metadata so it can be linked to lectures, homework, etc.
    `,
  })
  @ApiParam({ name: 'instituteId' })
  @ApiBody({ type: RegisterInstituteDriveFileDto })
  @ApiResponse({ status: 201, type: InstituteDriveFileResponseDto })
  async registerFile(
    @Param('instituteId') instituteId: string,
    @Body() dto: RegisterInstituteDriveFileDto,
    @Request() req: JwtRequest,
  ): Promise<InstituteDriveFileResponseDto> {
    const userId = JwtRequestHelper.getUserId(req.user);

    const file = await this.driveService.registerUploadedFile(
      instituteId,
      userId,
      dto.driveFileId,
      {
        purpose: dto.purpose,
        referenceType: dto.referenceType,
        referenceId: dto.referenceId,
        subjectName: dto.subjectName,
        className: dto.className,
        grade: dto.grade,
      },
    );

    return InstituteDriveFileResponseDto.fromEntity(file);
  }

  // =========================================================================
  // FILE LIST
  // =========================================================================

  @Get(':instituteId/files')
  @UseGuards(JwtAuthGuard, FlexibleAccessGuard)
  @RequireAnyOfRoles({ global: [UserType.SUPERADMIN], anyInstituteRole: true })
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List files stored on the institute Drive' })
  @ApiParam({ name: 'instituteId' })
  @ApiResponse({ status: 200, type: InstituteDriveFileListResponseDto })
  async listFiles(
    @Param('instituteId') instituteId: string,
    @Query() query: InstituteDriveFileQueryDto,
  ): Promise<InstituteDriveFileListResponseDto> {

    const limit = query.limit || 20;
    const { data, total } = await this.driveService.listFiles(instituteId, {
      purpose: query.purpose,
      referenceType: query.referenceType,
      referenceId: query.referenceId,
      grade: query.grade,
      className: query.className,
      page: query.page,
      limit,
    });

    return {
      data: data.map(f => InstituteDriveFileResponseDto.fromEntity(f)),
      total,
      page: query.page || 1,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  // =========================================================================
  // FILE DELETE
  // =========================================================================

  @Delete(':instituteId/files/:fileId')
  @UseGuards(JwtAuthGuard, FlexibleAccessGuard)
  @RequireAnyOfRoles({ global: [UserType.SUPERADMIN], instituteAdmin: true, teacher: true })
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete a file from the institute Drive (admin or uploader)' })
  @ApiParam({ name: 'instituteId' })
  @ApiParam({ name: 'fileId', description: 'Internal file record ID' })
  @ApiResponse({ status: 200 })
  async deleteFile(
    @Param('instituteId') instituteId: string,
    @Param('fileId') fileId: string,
  ): Promise<{ success: boolean; message: string }> {
    return this.driveService.deleteFile(instituteId, fileId);
  }

  // =========================================================================
  // STORAGE INFO
  // =========================================================================

  @Get(':instituteId/storage')
  @UseGuards(JwtAuthGuard, FlexibleAccessGuard)
  @RequireAnyOfRoles({ global: [UserType.SUPERADMIN], instituteAdmin: true, teacher: true })
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get Google Drive storage quota for the institute account' })
  @ApiParam({ name: 'instituteId' })
  async getStorage(
    @Param('instituteId') instituteId: string,
  ): Promise<{ limit: number | null; usage: number; usageInDrive: number; usageInDriveTrash: number }> {
    return this.driveService.getStorageInfo(instituteId);
  }

  // =========================================================================
  // FOLDER LISTING & DELETE
  // =========================================================================

  @Get(':instituteId/folders')
  @UseGuards(JwtAuthGuard, FlexibleAccessGuard)
  @RequireAnyOfRoles({ global: [UserType.SUPERADMIN], instituteAdmin: true, teacher: true })
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List top-level Drive folders inside the institute root' })
  @ApiParam({ name: 'instituteId' })
  @ApiQuery({ name: 'instituteName', required: false })
  async listFolders(
    @Param('instituteId') instituteId: string,
    @Query('instituteName') instituteName: string,
  ): Promise<Array<{ id: string; name: string; createdTime: string; modifiedTime: string; webViewLink: string }>> {
    const name = instituteName?.trim() || `Institute ${instituteId}`;
    return this.driveService.listInstituteFolders(instituteId, name);
  }

  @Delete(':instituteId/folders/:folderId')
  @UseGuards(JwtAuthGuard, FlexibleAccessGuard)
  @RequireAnyOfRoles({ global: [UserType.SUPERADMIN], instituteAdmin: true })
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Trash a Drive folder from the institute root (admin only)' })
  @ApiParam({ name: 'instituteId' })
  @ApiParam({ name: 'folderId' })
  async deleteFolder(
    @Param('instituteId') instituteId: string,
    @Param('folderId') folderId: string,
  ): Promise<{ success: boolean }> {
    return this.driveService.trashInstituteFolder(instituteId, folderId);
  }

}
