import { Injectable, Logger, InternalServerErrorException, BadRequestException, UnauthorizedException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { UserDriveTokenEntity } from '../entities/user-drive-token.entity';
import { UserDriveFileEntity } from '../entities/user-drive-file.entity';
import { TokenEncryptionService } from './token-encryption.service';
import { DriveConnectionStatusDto } from '../dto/drive-connection.dto';
import { DriveUploadPurpose } from '../dto/drive-upload.dto';
import * as crypto from 'crypto';

/**
 * Google Drive Access Management Service.
 * 
 * ARCHITECTURE: Direct-Upload with Secure Token Dispensing
 * =========================================================
 * 
 * 1. User connects Google Drive once (OAuth consent → refresh token stored encrypted)
 * 2. When user wants to upload, frontend requests a short-lived access token from backend
 * 3. Backend decrypts refresh token → gets fresh access token → returns ONLY access token
 * 4. Frontend uploads DIRECTLY to Google Drive using that access token (no proxy)
 * 5. After upload, frontend calls backend to register the file (driveFileId + metadata)
 * 6. Backend verifies the file exists on Drive, stores metadata, sets permissions
 * 
 * WHY DIRECT UPLOAD:
 * - No double bandwidth (file doesn't pass through our server)
 * - No server memory pressure from large files
 * - Faster for the user (single hop to Google)
 * - Resumable uploads work natively with Google's JS client
 * - Our server stays lightweight
 * 
 * SECURITY GUARANTEES:
 * - Refresh tokens NEVER leave the backend (encrypted AES-256-GCM in DB)
 * - Access tokens are short-lived (~1 hour), scoped to drive.file only
 * - Access tokens can only access files created by our OAuth app
 * - Backend verifies every registered file actually exists on Drive
 * - Consecutive failure detection with auto-disconnect
 * - One connection per user
 */
@Injectable()
export class UserDriveAccessService {
  private readonly logger = new Logger(UserDriveAccessService.name);

  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly driveCallbackUri: string;
  private readonly frontendUrl: string;

  private readonly scopes = [
    'https://www.googleapis.com/auth/drive.file',
    'openid',
    'https://www.googleapis.com/auth/userinfo.email',
    'https://www.googleapis.com/auth/userinfo.profile',
  ];

  // In-memory access token cache (userId -> { token, expiresAt })
  // MAX 10,000 entries with LRU-style eviction
  private static readonly MAX_CACHE_SIZE = 10000;
  private readonly accessTokenCache = new Map<string, { token: string; expiresAt: Date }>();

  constructor(
    @InjectRepository(UserDriveTokenEntity)
    private readonly driveTokenRepo: Repository<UserDriveTokenEntity>,
    @InjectRepository(UserDriveFileEntity)
    private readonly driveFileRepo: Repository<UserDriveFileEntity>,
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
    private readonly encryptionService: TokenEncryptionService,
  ) {
    this.clientId = this.configService.get<string>('GOOGLE_CLIENT_ID');
    this.clientSecret = this.configService.get<string>('GOOGLE_CLIENT_SECRET');
    this.driveCallbackUri = this.configService.get<string>('GOOGLE_DRIVE_CALLBACK_URI')
      || this.configService.get<string>('GOOGLE_REDIRECT_URI')?.replace('/auth/google/callback', '/drive-access/callback');
    this.frontendUrl = this.configService.get<string>('FRONTEND_URL') || 'https://lms.suraksha.lk';

    if (!this.clientId || !this.clientSecret) {
      this.logger.warn('Google OAuth credentials not configured — Drive access will be unavailable');
    }
  }

  // ============================================================
  // OAUTH FLOW: Connect / Disconnect
  // ============================================================

  /**
   * Evict expired entries and trim cache to MAX_CACHE_SIZE to prevent memory leaks
   */
  private evictCacheIfNeeded(): void {
    const now = new Date();
    // First pass: remove expired entries
    for (const [key, value] of this.accessTokenCache) {
      if (value.expiresAt < now) {
        this.accessTokenCache.delete(key);
      }
    }
    // Second pass: if still over limit, remove oldest entries (FIFO — Map preserves insertion order)
    if (this.accessTokenCache.size > UserDriveAccessService.MAX_CACHE_SIZE) {
      const excess = this.accessTokenCache.size - UserDriveAccessService.MAX_CACHE_SIZE;
      let removed = 0;
      for (const key of this.accessTokenCache.keys()) {
        if (removed >= excess) break;
        this.accessTokenCache.delete(key);
        removed++;
      }
    }
  }

  generateAuthUrl(userId: string, state?: string): { authUrl: string; state: string } {
    const stateParam = state || `drive_${userId}_${Date.now()}_${crypto.randomBytes(12).toString('base64url')}`;

    const params = new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: this.driveCallbackUri,
      response_type: 'code',
      scope: this.scopes.join(' '),
      access_type: 'offline',
      prompt: 'consent',
      state: stateParam,
      include_granted_scopes: 'true',
    });

    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
    this.logger.log(`Generated Drive auth URL for user ${userId}`);
    return { authUrl, state: stateParam };
  }

  async handleOAuthCallback(
    code: string,
    userId: string,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<{ success: boolean; googleEmail?: string; googleDisplayName?: string; message: string }> {
    try {
      const tokenData = await this.exchangeCodeForTokens(code);

      if (!tokenData.refresh_token) {
        this.logger.error('No refresh token received from Google.');
        throw new BadRequestException(
          'Google did not provide a refresh token. Please revoke access at https://myaccount.google.com/permissions and try again.'
        );
      }

      const googleUserInfo = await this.getGoogleUserInfo(tokenData.access_token);
      const encryptedRefreshToken = this.encryptionService.encrypt(tokenData.refresh_token);

      const now = new Date();
      const expiresAt = new Date(Date.now() + (tokenData.expires_in || 3600) * 1000);

      let existingToken = await this.driveTokenRepo.findOne({ where: { userId } });

      if (existingToken) {
        existingToken.encryptedRefreshToken = encryptedRefreshToken;
        existingToken.googleEmail = googleUserInfo.email;
        existingToken.googleDisplayName = googleUserInfo.name;
        existingToken.googleProfilePicture = googleUserInfo.picture;
        existingToken.grantedScopes = tokenData.scope;
        existingToken.accessTokenExpiresAt = expiresAt;
        existingToken.isActive = true;
        existingToken.consecutiveFailures = 0;
        existingToken.lastFailureReason = null;
        existingToken.authorizedIp = ipAddress;
        existingToken.authorizedUserAgent = userAgent;
        existingToken.updatedAt = now;
        await this.driveTokenRepo.save(existingToken);
      } else {
        const newToken = this.driveTokenRepo.create({
          userId,
          encryptedRefreshToken,
          googleEmail: googleUserInfo.email,
          googleDisplayName: googleUserInfo.name,
          googleProfilePicture: googleUserInfo.picture,
          grantedScopes: tokenData.scope,
          accessTokenExpiresAt: expiresAt,
          isActive: true,
          consecutiveFailures: 0,
          refreshCount: 0,
          authorizedIp: ipAddress,
          authorizedUserAgent: userAgent,
          createdAt: now,
          updatedAt: now,
        });
        await this.driveTokenRepo.save(newToken);
      }

      this.evictCacheIfNeeded();
      this.accessTokenCache.set(userId, { token: tokenData.access_token, expiresAt });

      this.logger.log(`Google Drive connected for user ${userId} (${googleUserInfo.email})`);

      return {
        success: true,
        googleEmail: googleUserInfo.email,
        googleDisplayName: googleUserInfo.name,
        message: 'Google Drive connected successfully',
      };
    } catch (error) {
      this.logger.error(`OAuth callback failed for user ${userId}: ${error.message}`);
      if (error instanceof BadRequestException) throw error;
      throw new InternalServerErrorException('Failed to connect Google Drive');
    }
  }

  async disconnect(userId: string): Promise<{ success: boolean; message: string }> {
    const tokenRecord = await this.driveTokenRepo.findOne({ where: { userId } });

    if (!tokenRecord) {
      return { success: true, message: 'No Google Drive connection found' };
    }

    try {
      const refreshToken = this.encryptionService.decrypt(tokenRecord.encryptedRefreshToken);
      await this.revokeTokenAtGoogle(refreshToken);
      this.logger.log(`Revoked Google token for user ${userId}`);
    } catch (error) {
      this.logger.warn(`Token revocation at Google failed for user ${userId}: ${error.message}`);
    }

    await this.driveTokenRepo.remove(tokenRecord);
    this.accessTokenCache.delete(userId);

    this.logger.log(`Google Drive disconnected for user ${userId}`);
    return { success: true, message: 'Google Drive disconnected and tokens revoked' };
  }

  async getConnectionStatus(userId: string): Promise<DriveConnectionStatusDto> {
    const tokenRecord = await this.driveTokenRepo.findOne({ where: { userId } });
    return DriveConnectionStatusDto.fromEntity(tokenRecord);
  }

  // ============================================================
  // ACCESS TOKEN DISPENSING (for frontend direct upload to Drive)
  // ============================================================

  /**
   * Get a short-lived Google access token for the frontend.
   * 
   * The frontend uses this to upload DIRECTLY to Google Drive.
   * 
   * SECURITY:
   * - Access token is short-lived (~1 hour, set by Google)
   * - Scoped to `drive.file` — can ONLY access files created by our OAuth app
   * - Cannot access user's existing Drive files, contacts, email, etc.
   * - Refresh token stays encrypted in DB, NEVER sent
   * - This is the same model Google's own JS client (gapi) uses
   */
  async getAccessTokenForUpload(userId: string): Promise<{
    accessToken: string;
    expiresIn: number;
    expiresAt: string;
    googleEmail: string;
    clientId: string;
  }> {
    const accessToken = await this.getValidAccessToken(userId);

    const tokenRecord = await this.driveTokenRepo.findOne({ where: { userId, isActive: true } });

    const cached = this.accessTokenCache.get(userId);
    const expiresAt = cached?.expiresAt || new Date(Date.now() + 3600 * 1000);
    const expiresIn = Math.max(0, Math.floor((expiresAt.getTime() - Date.now()) / 1000));

    await this.driveTokenRepo.update({ userId }, { lastUsedAt: new Date(), updatedAt: new Date() });

    return {
      accessToken,
      expiresIn,
      expiresAt: expiresAt.toISOString(),
      googleEmail: tokenRecord?.googleEmail || '',
      clientId: this.clientId, // Frontend needs this for Google Picker / gapi
    };
  }

  // ============================================================
  // FOLDER MANAGEMENT (backend creates folders, frontend uploads into them)
  // ============================================================

  /**
   * Get or create the standard LMS folder structure for a given purpose.
   * Returns the target folder ID so frontend knows where to upload.
   */
  async getUploadFolderId(userId: string, purpose: DriveUploadPurpose): Promise<{
    folderId: string;
    folderPath: string;
  }> {
    // ⚠️  LECTURE_DOCUMENT should NOT reach this path.
    //     Lecture documents are institute-scoped assets; they must be stored in
    //     institute-owned cloud storage via:
    //       POST /api/structured-lectures/upload/document/signed-url  (get URL)
    //       POST /api/structured-lectures/upload/document/verify       (publish)
    //     Storing them in a teacher's personal Drive causes data loss when the
    //     teacher is removed from the institute or revokes Drive access.
    if (purpose === DriveUploadPurpose.LECTURE_DOCUMENT) {
      throw new BadRequestException(
        'Lecture documents must be uploaded to institute-owned cloud storage. ' +
        'Use POST /api/structured-lectures/upload/document/signed-url instead of Google Drive.'
      );
    }

    const accessToken = await this.getValidAccessToken(userId);

    const folderNames: Record<DriveUploadPurpose, string> = {
      [DriveUploadPurpose.HOMEWORK_SUBMISSION]: 'Homework Submissions',
      [DriveUploadPurpose.HOMEWORK_REFERENCE]: 'Homework References',
      [DriveUploadPurpose.HOMEWORK_CORRECTION]: 'Homework Corrections',
      [DriveUploadPurpose.EXAM_SUBMISSION]: 'Exam Submissions',
      [DriveUploadPurpose.PROFILE_DOCUMENT]: 'Profile Documents',
      [DriveUploadPurpose.ID_CARD_PAYMENT]: 'ID Card Payment Receipts',
      [DriveUploadPurpose.LECTURE_DOCUMENT]: 'Lecture Documents', // deprecated — kept for enum exhaustiveness
      [DriveUploadPurpose.GENERAL]: 'General',
    };

    const folderName = folderNames[purpose] || 'General';

    const rootFolderId = await this.findOrCreateFolder(accessToken, 'Suraksha LMS', null);
    const purposeFolderId = await this.findOrCreateFolder(accessToken, folderName, rootFolderId);

    return { folderId: purposeFolderId, folderPath: `Suraksha LMS/${folderName}` };
  }

  /**
   * Create a custom folder in the user's Drive.
   */
  async createFolder(userId: string, folderName: string, parentFolderId?: string): Promise<{
    folderId: string;
    folderName: string;
    webViewLink: string;
  }> {
    const accessToken = await this.getValidAccessToken(userId);

    const metadata: Record<string, any> = {
      name: folderName,
      mimeType: 'application/vnd.google-apps.folder',
    };
    if (parentFolderId) {
      metadata.parents = [parentFolderId];
    }

    const response = await firstValueFrom(
      this.httpService.post('https://www.googleapis.com/drive/v3/files', metadata, {
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        params: { fields: 'id,name,webViewLink' },
      }),
    );

    this.logger.log(`Created Drive folder: ${folderName} (${response.data.id}) for user ${userId}`);

    return {
      folderId: response.data.id,
      folderName: response.data.name,
      webViewLink: response.data.webViewLink || `https://drive.google.com/drive/folders/${response.data.id}`,
    };
  }

  // ============================================================
  // FILE REGISTRATION (after frontend direct upload to Drive)
  // ============================================================

  /**
   * Register a file that was uploaded directly by the frontend to Google Drive.
   * 
   * FLOW:
   * 1. Frontend uploaded file directly to Drive using access token
   * 2. Frontend got back driveFileId from Google
   * 3. Frontend calls this endpoint with driveFileId + metadata
   * 4. Backend VERIFIES the file actually exists on Drive (prevents spoofing)
   * 5. Backend fetches accurate metadata from Drive (doesn't trust frontend)
   * 6. Backend stores the file record in our DB
   * 7. Backend optionally sets sharing permissions
   */
  async registerUploadedFile(
    userId: string,
    driveFileId: string,
    options: {
      purpose: DriveUploadPurpose;
      referenceType?: string;
      referenceId?: string;
      shareWithEmails?: string[];
    },
  ): Promise<UserDriveFileEntity> {
    const accessToken = await this.getValidAccessToken(userId);

    // Verify and get file metadata from Google Drive (don't trust frontend)
    const driveMetadata = await this.getDriveFileMetadata(accessToken, driveFileId);
    if (!driveMetadata) {
      throw new BadRequestException(
        'File not found on Google Drive. Ensure the file was uploaded successfully and the driveFileId is correct.'
      );
    }

    // Check if already registered (idempotency)
    const existing = await this.driveFileRepo.findOne({
      where: { driveFileId, uploadedByUserId: userId, isActive: true },
    });
    if (existing) {
      this.logger.warn(`File ${driveFileId} already registered for user ${userId}`);
      return existing;
    }

    // Set sharing permissions if requested
    let sharingPermissions: Array<{ email: string; role: string; type: string }> = [];
    if (options.shareWithEmails?.length) {
      sharingPermissions = await this.setFilePermissions(accessToken, driveFileId, options.shareWithEmails);
    }

    // Save to DB with Google-verified metadata
    const now = new Date();
    const fileRecord = this.driveFileRepo.create({
      driveFileId,
      driveWebViewLink: driveMetadata.webViewLink || `https://drive.google.com/file/d/${driveFileId}/view`,
      driveWebContentLink: driveMetadata.webContentLink || null,
      driveFolderId: driveMetadata.parents?.[0] || null,
      fileName: driveMetadata.name,
      mimeType: driveMetadata.mimeType,
      fileSize: driveMetadata.size ? parseInt(driveMetadata.size, 10) : null,
      uploadedByUserId: userId,
      purpose: options.purpose,
      referenceType: options.referenceType || null,
      referenceId: options.referenceId || null,
      sharingPermissions: sharingPermissions.length ? JSON.stringify(sharingPermissions) : null,
      isActive: true,
      isDeletedFromDrive: false,
      createdAt: now,
      updatedAt: now,
    });

    const saved = await this.driveFileRepo.save(fileRecord);
    await this.driveTokenRepo.update({ userId }, { lastUsedAt: now, updatedAt: now });

    this.logger.log(`File registered for user ${userId}: ${driveMetadata.name} (${driveFileId})`);
    return saved;
  }

  // ============================================================
  // FILE MANAGEMENT: List, Get, Delete, Download
  // ============================================================

  async listFiles(
    userId: string,
    filters: { purpose?: string; referenceType?: string; referenceId?: string; page?: number; limit?: number },
  ): Promise<{ data: UserDriveFileEntity[]; total: number }> {
    const page = filters.page || 1;
    const limit = Math.min(filters.limit || 20, 100);

    const qb = this.driveFileRepo
      .createQueryBuilder('file')
      .where('file.uploadedByUserId = :userId', { userId })
      .andWhere('file.isActive = :isActive', { isActive: true });

    if (filters.purpose) qb.andWhere('file.purpose = :purpose', { purpose: filters.purpose });
    if (filters.referenceType) qb.andWhere('file.referenceType = :referenceType', { referenceType: filters.referenceType });
    if (filters.referenceId) qb.andWhere('file.referenceId = :referenceId', { referenceId: filters.referenceId });

    qb.orderBy('file.createdAt', 'DESC').skip((page - 1) * limit).take(limit);

    const [data, total] = await qb.getManyAndCount();
    return { data, total };
  }

  async getFile(userId: string, fileId: string): Promise<UserDriveFileEntity> {
    const file = await this.driveFileRepo.findOne({
      where: { id: fileId, uploadedByUserId: userId, isActive: true },
    });
    if (!file) throw new NotFoundException('File not found');
    return file;
  }

  async deleteFile(userId: string, fileId: string): Promise<{ success: boolean; message: string }> {
    const file = await this.getFile(userId, fileId);

    try {
      const accessToken = await this.getValidAccessToken(userId);
      await firstValueFrom(
        this.httpService.delete(`https://www.googleapis.com/drive/v3/files/${file.driveFileId}`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        }),
      );
      file.isDeletedFromDrive = true;
      this.logger.log(`File deleted from Drive: ${file.driveFileId}`);
    } catch (error) {
      this.logger.warn(`Failed to delete from Drive (may already be deleted): ${error.message}`);
    }

    file.isActive = false;
    file.updatedAt = new Date();
    await this.driveFileRepo.save(file);

    return { success: true, message: 'File deleted successfully' };
  }

  /**
   * Proxy-download a file through backend (for when direct Drive URLs don't work,
   * e.g. embedding in iframes, or when the file is private).
   */
  async getFileContent(userId: string, fileId: string): Promise<{ buffer: Buffer; fileName: string; mimeType: string }> {
    const file = await this.getFile(userId, fileId);
    const accessToken = await this.getValidAccessToken(userId);

    const response = await firstValueFrom(
      this.httpService.get(`https://www.googleapis.com/drive/v3/files/${file.driveFileId}?alt=media`, {
        headers: { Authorization: `Bearer ${accessToken}` },
        responseType: 'arraybuffer',
      }),
    );

    return { buffer: Buffer.from(response.data), fileName: file.fileName, mimeType: file.mimeType };
  }

  async verifyFileExists(userId: string, driveFileId: string): Promise<boolean> {
    try {
      const accessToken = await this.getValidAccessToken(userId);
      const response = await firstValueFrom(
        this.httpService.get(`https://www.googleapis.com/drive/v3/files/${driveFileId}`, {
          headers: { Authorization: `Bearer ${accessToken}` },
          params: { fields: 'id' },
        }),
      );
      return !!response.data?.id;
    } catch {
      return false;
    }
  }

  async getFileMetadata(userId: string, driveFileId: string): Promise<{
    id: string; name: string; mimeType: string; size?: string; webViewLink?: string;
  } | null> {
    try {
      const accessToken = await this.getValidAccessToken(userId);
      return await this.getDriveFileMetadata(accessToken, driveFileId);
    } catch {
      return null;
    }
  }

  // ============================================================
  // TOKEN MANAGEMENT (Internal)
  // ============================================================

  private async getValidAccessToken(userId: string): Promise<string> {
    const cached = this.accessTokenCache.get(userId);
    if (cached && cached.expiresAt > new Date(Date.now() + 60 * 1000)) {
      return cached.token;
    }

    const tokenRecord = await this.driveTokenRepo.findOne({ where: { userId, isActive: true } });
    if (!tokenRecord) {
      throw new UnauthorizedException('Google Drive not connected. Please connect your Google Drive first.');
    }

    if (tokenRecord.shouldAutoDisconnect()) {
      tokenRecord.isActive = false;
      tokenRecord.updatedAt = new Date();
      await this.driveTokenRepo.save(tokenRecord);
      this.accessTokenCache.delete(userId);
      throw new UnauthorizedException(
        'Google Drive connection was automatically disconnected due to repeated failures. Please reconnect.'
      );
    }

    try {
      const refreshToken = this.encryptionService.decrypt(tokenRecord.encryptedRefreshToken);
      const newTokenData = await this.refreshAccessToken(refreshToken);

      if (newTokenData.refresh_token) {
        tokenRecord.encryptedRefreshToken = this.encryptionService.encrypt(newTokenData.refresh_token);
      }

      const expiresAt = new Date(Date.now() + (newTokenData.expires_in || 3600) * 1000);
      tokenRecord.accessTokenExpiresAt = expiresAt;
      tokenRecord.refreshCount += 1;
      tokenRecord.consecutiveFailures = 0;
      tokenRecord.lastFailureReason = null;
      tokenRecord.updatedAt = new Date();
      await this.driveTokenRepo.save(tokenRecord);

      this.evictCacheIfNeeded();
      this.accessTokenCache.set(userId, { token: newTokenData.access_token, expiresAt });
      return newTokenData.access_token;
    } catch (error) {
      tokenRecord.consecutiveFailures += 1;
      tokenRecord.lastFailureReason = error.message?.substring(0, 500);
      tokenRecord.updatedAt = new Date();
      await this.driveTokenRepo.save(tokenRecord);
      this.accessTokenCache.delete(userId);

      if (error.response?.data?.error === 'invalid_grant') {
        tokenRecord.isActive = false;
        await this.driveTokenRepo.save(tokenRecord);
        throw new UnauthorizedException('Google Drive access was revoked. Please reconnect your Google Drive.');
      }

      throw new InternalServerErrorException('Failed to access Google Drive. Please try again.');
    }
  }

  // ============================================================
  // GOOGLE API HELPERS (Private)
  // ============================================================

  private async exchangeCodeForTokens(code: string): Promise<{
    access_token: string; refresh_token?: string; expires_in: number; scope: string; token_type: string; id_token?: string;
  }> {
    const response = await firstValueFrom(
      this.httpService.post('https://oauth2.googleapis.com/token', {
        code, client_id: this.clientId, client_secret: this.clientSecret,
        redirect_uri: this.driveCallbackUri, grant_type: 'authorization_code',
      }, { headers: { 'Content-Type': 'application/json' } }),
    );
    return response.data;
  }

  private async refreshAccessToken(refreshToken: string): Promise<{
    access_token: string; expires_in: number; scope: string; token_type: string; refresh_token?: string;
  }> {
    const response = await firstValueFrom(
      this.httpService.post('https://oauth2.googleapis.com/token', {
        refresh_token: refreshToken, client_id: this.clientId,
        client_secret: this.clientSecret, grant_type: 'refresh_token',
      }, { headers: { 'Content-Type': 'application/json' } }),
    );
    return response.data;
  }

  private async getGoogleUserInfo(accessToken: string): Promise<{ email: string; name: string; picture: string }> {
    const response = await firstValueFrom(
      this.httpService.get('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: { Authorization: `Bearer ${accessToken}` },
      }),
    );
    return response.data;
  }

  private async revokeTokenAtGoogle(token: string): Promise<void> {
    await firstValueFrom(
      this.httpService.post(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(token)}`),
    );
  }

  private async getDriveFileMetadata(accessToken: string, fileId: string): Promise<{
    id: string; name: string; mimeType: string; size?: string;
    webViewLink?: string; webContentLink?: string; parents?: string[];
  } | null> {
    try {
      const response = await firstValueFrom(
        this.httpService.get(`https://www.googleapis.com/drive/v3/files/${fileId}`, {
          headers: { Authorization: `Bearer ${accessToken}` },
          params: { fields: 'id,name,mimeType,size,webViewLink,webContentLink,parents' },
        }),
      );
      return response.data;
    } catch (error) {
      if (error.response?.status === 404) return null;
      this.logger.error(`Failed to get Drive file metadata for ${fileId}: ${error.message}`);
      return null;
    }
  }

  private async findOrCreateFolder(accessToken: string, folderName: string, parentId: string | null): Promise<string> {
    // Sanitize folder name for Google Drive API query - escape single quotes and backslashes
    const safeFolderName = folderName.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    // Validate folder name doesn't contain dangerous characters
    if (/[\x00-\x1f]/.test(folderName)) {
      throw new BadRequestException('Invalid folder name');
    }
    let query = `name='${safeFolderName}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
    if (parentId) {
      // Validate parentId is alphanumeric (Google Drive IDs are alphanumeric + dashes/underscores)
      if (!/^[a-zA-Z0-9_-]+$/.test(parentId)) {
        throw new BadRequestException('Invalid parent folder ID');
      }
      query += ` and '${parentId}' in parents`;
    }

    const searchResponse = await firstValueFrom(
      this.httpService.get('https://www.googleapis.com/drive/v3/files', {
        headers: { Authorization: `Bearer ${accessToken}` },
        params: { q: query, fields: 'files(id,name)', spaces: 'drive' },
      }),
    );

    if (searchResponse.data.files?.length > 0) return searchResponse.data.files[0].id;

    const metadata: Record<string, any> = { name: folderName, mimeType: 'application/vnd.google-apps.folder' };
    if (parentId) metadata.parents = [parentId];

    const createResponse = await firstValueFrom(
      this.httpService.post('https://www.googleapis.com/drive/v3/files', metadata, {
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        params: { fields: 'id' },
      }),
    );

    this.logger.log(`Created Drive folder: ${folderName} (${createResponse.data.id})`);
    return createResponse.data.id;
  }

  private async setFilePermissions(accessToken: string, fileId: string, emails: string[]): Promise<Array<{ email: string; role: string; type: string }>> {
    const permissions: Array<{ email: string; role: string; type: string }> = [];

    for (const email of emails) {
      try {
        await firstValueFrom(
          this.httpService.post(`https://www.googleapis.com/drive/v3/files/${fileId}/permissions`,
            { type: 'user', role: 'reader', emailAddress: email },
            { headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' }, params: { sendNotificationEmail: false } },
          ),
        );
        permissions.push({ email, role: 'reader', type: 'user' });
      } catch (error) {
        this.logger.warn(`Failed to share file ${fileId} with ${email}: ${error.message}`);
      }
    }

    return permissions;
  }
}
