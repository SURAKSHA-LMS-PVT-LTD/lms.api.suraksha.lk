import {
  Injectable,
  Logger,
  InternalServerErrorException,
  BadRequestException,
  UnauthorizedException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import * as crypto from 'crypto';
import { InstituteDriveTokenEntity } from '../entities/institute-drive-token.entity';
import { InstituteDriveFileEntity } from '../entities/institute-drive-file.entity';
import { TokenEncryptionService } from '../../user-drive-access/services/token-encryption.service';
import {
  InstituteDrivePurpose,
  INSTITUTE_DRIVE_FOLDER_NAMES,
  InstituteDriveStatusDto,
  InstituteDriveAccessTokenDto,
  InstituteFolderResponseDto,
  GetInstituteFolderDto,
} from '../dto/institute-drive.dto';

/**
 * Institute Google Drive Service
 * ================================
 * Manages a Google Drive connection that belongs to an **institute**, not to any
 * individual user.  This solves the disappearing-file problem: when a teacher leaves,
 * files stay because the Drive is owned by the institute account.
 *
 * WHO CAN USE WHAT:
 * - Institute Admin: connect / disconnect the institute Drive, view status.
 * - Teachers (in that institute): get a short-lived access token to upload directly
 *   to the institute Drive, get organised folder IDs, register uploaded files.
 * - Students (read-only): access links to homework questions, lecture documents.
 *
 * FOLDER STRUCTURE ON INSTITUTE DRIVE:
 * Suraksha LMS/
 *   {InstituteName}/                        ← one per institute (using Drive API)
 *     Grade {N} - {ClassName}/             ← e.g. "Grade 10 - 10A"
 *       {SubjectName}/                     ← e.g. "Mathematics"
 *         Lecture Documents/
 *         Lecture Recordings/
 *         Homework Questions/
 *         Homework Submissions/
 *         Homework Corrections/
 *         Exam Documents/
 *
 * If grade / className / subjectName are omitted, files land in
 * "Suraksha LMS / {InstituteName} / {PurposeFolder}".
 */
@Injectable()
export class InstituteDriveService {
  private readonly logger = new Logger(InstituteDriveService.name);

  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly callbackUri: string;
  private readonly frontendUrl: string;

  private readonly scopes = [
    'https://www.googleapis.com/auth/drive.file',
    'openid',
    'https://www.googleapis.com/auth/userinfo.email',
    'https://www.googleapis.com/auth/userinfo.profile',
  ];

  // In-memory access token cache: key = instituteId
  private static readonly MAX_CACHE_SIZE = 500;
  private readonly tokenCache = new Map<string, { token: string; expiresAt: Date }>();

  constructor(
    @InjectRepository(InstituteDriveTokenEntity)
    private readonly tokenRepo: Repository<InstituteDriveTokenEntity>,
    @InjectRepository(InstituteDriveFileEntity)
    private readonly fileRepo: Repository<InstituteDriveFileEntity>,
    private readonly http: HttpService,
    private readonly config: ConfigService,
    private readonly encryption: TokenEncryptionService,
  ) {
    this.clientId = this.config.get<string>('GOOGLE_CLIENT_ID');
    this.clientSecret = this.config.get<string>('GOOGLE_CLIENT_SECRET');
    // Resolve callback URI — explicit env var > derive from drive callback > derive from base redirect
    this.callbackUri =
      this.config.get<string>('GOOGLE_INSTITUTE_DRIVE_CALLBACK_URI') ||
      this.config.get<string>('GOOGLE_DRIVE_CALLBACK_URI')?.replace(
        '/drive-access/callback',
        '/institute-drive/callback',
      ) ||
      this.config.get<string>('GOOGLE_REDIRECT_URI')?.replace(
        '/auth/google/callback',
        '/institute-drive/callback',
      );
    this.frontendUrl = this.config.get<string>('FRONTEND_URL') || 'https://lms.suraksha.lk';

    if (!this.clientId || !this.clientSecret) {
      this.logger.warn('Google OAuth credentials not configured — institute Drive will be unavailable');
    }
    if (!this.callbackUri) {
      this.logger.warn('GOOGLE_INSTITUTE_DRIVE_CALLBACK_URI is not set — institute Drive OAuth will fail');
    }
  }

  // ======================================================================
  // CONNECTION STATUS
  // ======================================================================

  async getConnectionStatus(instituteId: string): Promise<InstituteDriveStatusDto> {
    const record = await this.tokenRepo.findOne({ where: { instituteId } });
    return InstituteDriveStatusDto.fromEntity(record);
  }

  // ======================================================================
  // OAUTH — CONNECT
  // ======================================================================

  /**
   * Generate the Google OAuth consent URL for an institute admin to connect
   * the institute's Google Drive.
   *
   * @param instituteId - The institute being connected
   * @param adminUserId - The admin performing the connection (stored for audit)
   * @param returnUrl   - Frontend path to redirect to after success (web only)
   */
  generateAuthUrl(
    instituteId: string,
    adminUserId: string,
    returnUrl = '/institute-settings?tab=integrations',
  ): { authUrl: string; state: string } {
    const stateData = JSON.stringify({ type: 'institute', instituteId, adminUserId, returnUrl });
    const statePayload = Buffer.from(stateData).toString('base64url');
    const stateSecret = process.env.JWT_SECRET || '';
    const hmac = crypto
      .createHmac('sha256', stateSecret)
      .update(statePayload)
      .digest('base64url');
    const state = `${statePayload}.${hmac}`;

    const params = new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: this.callbackUri,
      response_type: 'code',
      scope: this.scopes.join(' '),
      access_type: 'offline',
      prompt: 'consent',
      state,
      include_granted_scopes: 'true',
    });

    return {
      authUrl: `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`,
      state,
    };
  }

  /**
   * Verify the OAuth state HMAC returned by Google.
   * Returns parsed { instituteId, adminUserId, returnUrl }.
   */
  verifyState(rawState: string): { instituteId: string; adminUserId: string; returnUrl: string } {
    const parts = rawState.split('.');
    if (parts.length !== 2) throw new BadRequestException('Invalid state parameter format');

    const [statePayload, hmacSignature] = parts;
    const stateSecret = process.env.JWT_SECRET || '';
    const expectedHmac = crypto
      .createHmac('sha256', stateSecret)
      .update(statePayload)
      .digest('base64url');

    if (!crypto.timingSafeEqual(Buffer.from(hmacSignature), Buffer.from(expectedHmac))) {
      throw new BadRequestException('Invalid state signature — possible CSRF attack');
    }

    const parsed = JSON.parse(Buffer.from(statePayload, 'base64url').toString('utf-8'));
    if (parsed.type !== 'institute') {
      throw new BadRequestException('State type mismatch');
    }

    return {
      instituteId: parsed.instituteId,
      adminUserId: parsed.adminUserId,
      returnUrl: parsed.returnUrl || '/institute-settings?tab=integrations',
    };
  }

  /**
   * Handle the OAuth callback code.
   * Exchanges it for tokens and persists the encrypted refresh token.
   */
  async handleOAuthCallback(
    code: string,
    instituteId: string,
    adminUserId: string,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<{ success: boolean; googleEmail: string; googleDisplayName: string }> {
    const tokenData = await this.exchangeCodeForTokens(code);

    if (!tokenData.refresh_token) {
      throw new BadRequestException(
        'Google did not provide a refresh token. ' +
        'Please revoke access at https://myaccount.google.com/permissions and try again.',
      );
    }

    const userInfo = await this.getGoogleUserInfo(tokenData.access_token);
    const encryptedRefresh = this.encryption.encrypt(tokenData.refresh_token);
    const expiresAt = new Date(Date.now() + (tokenData.expires_in || 3600) * 1000);
    const now = new Date();

    let record = await this.tokenRepo.findOne({ where: { instituteId } });

    if (record) {
      record.encryptedRefreshToken = encryptedRefresh;
      record.googleEmail = userInfo.email;
      record.googleDisplayName = userInfo.name;
      record.googleProfilePicture = userInfo.picture;
      record.grantedScopes = tokenData.scope;
      record.accessTokenExpiresAt = expiresAt;
      record.isActive = true;
      record.consecutiveFailures = 0;
      record.lastFailureReason = null;
      record.connectedByUserId = adminUserId;
      record.authorizedIp = ipAddress;
      record.authorizedUserAgent = userAgent;
      await this.tokenRepo.save(record);
    } else {
      record = this.tokenRepo.create({
        instituteId,
        connectedByUserId: adminUserId,
        encryptedRefreshToken: encryptedRefresh,
        googleEmail: userInfo.email,
        googleDisplayName: userInfo.name,
        googleProfilePicture: userInfo.picture,
        grantedScopes: tokenData.scope,
        accessTokenExpiresAt: expiresAt,
        isActive: true,
        consecutiveFailures: 0,
        refreshCount: 0,
        authorizedIp: ipAddress,
        authorizedUserAgent: userAgent,
      });
      await this.tokenRepo.save(record);
    }

    this.evictCacheIfNeeded();
    this.tokenCache.set(instituteId, { token: tokenData.access_token, expiresAt });

    this.logger.log(`Institute Drive connected: institute=${instituteId} email=${userInfo.email}`);
    return { success: true, googleEmail: userInfo.email, googleDisplayName: userInfo.name };
  }

  // ======================================================================
  // DISCONNECT
  // ======================================================================

  async disconnect(instituteId: string): Promise<{ success: boolean; message: string }> {
    const record = await this.tokenRepo.findOne({ where: { instituteId } });
    if (!record) return { success: true, message: 'No institute Drive connection found' };

    try {
      const refreshToken = this.encryption.decrypt(record.encryptedRefreshToken);
      await this.revokeTokenAtGoogle(refreshToken);
    } catch (err: any) {
      this.logger.warn(`Token revocation failed for institute ${instituteId}: ${err?.message}`);
    }

    await this.tokenRepo.remove(record);
    this.tokenCache.delete(instituteId);

    this.logger.log(`Institute Drive disconnected: institute=${instituteId}`);
    return { success: true, message: 'Institute Drive disconnected' };
  }

  // ======================================================================
  // ACCESS TOKEN DISPENSING (teachers use this to upload directly to Drive)
  // ======================================================================

  /**
   * Return a short-lived Google access token for direct upload to the institute Drive.
   *
   * Only teachers / admins of the institute should call this.
   * Authorization (role check) is enforced in the controller.
   */
  async getAccessToken(instituteId: string): Promise<InstituteDriveAccessTokenDto> {
    const accessToken = await this.getValidAccessToken(instituteId);
    const record = await this.tokenRepo.findOne({ where: { instituteId, isActive: true } });

    const cached = this.tokenCache.get(instituteId);
    const expiresAt = cached?.expiresAt || new Date(Date.now() + 3600 * 1000);
    const expiresIn = Math.max(0, Math.floor((expiresAt.getTime() - Date.now()) / 1000));

    await this.tokenRepo.update({ instituteId }, { lastUsedAt: new Date() });

    return {
      accessToken,
      expiresIn,
      expiresAt: expiresAt.toISOString(),
      googleEmail: record?.googleEmail || '',
      clientId: this.clientId,
    };
  }

  // ======================================================================
  // FOLDER MANAGEMENT — structured, class-wise hierarchy
  // ======================================================================

  /**
   * Return the Google Drive folder ID that matches the requested context.
   *
   * Folder path built:
   *  Suraksha LMS / {InstituteName} [/ Grade N - ClassName] [/ SubjectName] / PurposeName
   *
   * All intermediate folders are created if they don't exist (idempotent).
   */
  async getUploadFolder(
    instituteId: string,
    instituteName: string,
    dto: GetInstituteFolderDto,
  ): Promise<InstituteFolderResponseDto> {
    const accessToken = await this.getValidAccessToken(instituteId);

    const purposeFolder = INSTITUTE_DRIVE_FOLDER_NAMES[dto.purpose] || 'General';

    // Build folder path segments (skip undefined ones)
    const segments: string[] = ['Suraksha LMS', instituteName];

    if (dto.grade !== undefined && dto.grade !== null) {
      const classLabel =
        dto.className && dto.className.trim()
          ? `Grade ${dto.grade} - ${dto.className.trim()}`
          : `Grade ${dto.grade}`;
      segments.push(classLabel);
    } else if (dto.className && dto.className.trim()) {
      segments.push(dto.className.trim());
    }

    if (dto.subjectName && dto.subjectName.trim()) {
      segments.push(dto.subjectName.trim());
    }

    segments.push(purposeFolder);

    // Recursively find-or-create each folder in the chain
    let parentId: string | null = null;
    for (const seg of segments) {
      parentId = await this.findOrCreateFolder(accessToken, seg, parentId);
    }

    return {
      folderId: parentId,
      folderPath: segments.join(' / '),
    };
  }

  // ======================================================================
  // FILE REGISTRATION (after direct upload by teacher)
  // ======================================================================

  async registerUploadedFile(
    instituteId: string,
    uploadedByUserId: string,
    driveFileId: string,
    options: {
      purpose: InstituteDrivePurpose;
      referenceType?: string;
      referenceId?: string;
      subjectName?: string;
      className?: string;
      grade?: number;
      folderPath?: string;
    },
  ): Promise<InstituteDriveFileEntity> {
    const accessToken = await this.getValidAccessToken(instituteId);

    // Verify file exists on Drive (prevents spoofing)
    const meta = await this.getDriveFileMetadata(accessToken, driveFileId);
    if (!meta) {
      throw new BadRequestException(
        'File not found on Google Drive. Ensure it was uploaded successfully.',
      );
    }

    // Idempotency check
    const existing = await this.fileRepo.findOne({
      where: { driveFileId, instituteId, isActive: true },
    });
    if (existing) return existing;

    const record = this.fileRepo.create({
      instituteId,
      uploadedByUserId,
      driveFileId,
      driveWebViewLink: meta.webViewLink || `https://drive.google.com/file/d/${driveFileId}/view`,
      driveWebContentLink: meta.webContentLink || null,
      driveFolderId: meta.parents?.[0] || null,
      driveFolderPath: options.folderPath || null,
      fileName: meta.name,
      mimeType: meta.mimeType,
      fileSize: meta.size ? parseInt(meta.size, 10) : null,
      purpose: options.purpose,
      referenceType: options.referenceType || null,
      referenceId: options.referenceId || null,
      subjectName: options.subjectName || null,
      className: options.className || null,
      grade: options.grade ?? null,
      isActive: true,
    });

    const saved = await this.fileRepo.save(record);
    await this.tokenRepo.update({ instituteId }, { lastUsedAt: new Date() });

    this.logger.log(
      `Institute file registered: institute=${instituteId} file=${meta.name} (${driveFileId})`,
    );
    return saved;
  }

  // ======================================================================
  // FILE LISTING
  // ======================================================================

  async listFiles(
    instituteId: string,
    filters: {
      purpose?: string;
      referenceType?: string;
      referenceId?: string;
      grade?: number;
      className?: string;
      page?: number;
      limit?: number;
    },
  ): Promise<{ data: InstituteDriveFileEntity[]; total: number }> {
    const page = Math.max(filters.page || 1, 1);
    const limit = Math.min(filters.limit || 20, 100);

    const qb = this.fileRepo
      .createQueryBuilder('f')
      .where('f.instituteId = :instituteId', { instituteId })
      .andWhere('f.isActive = true')
      .orderBy('f.uploadedAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    if (filters.purpose) qb.andWhere('f.purpose = :purpose', { purpose: filters.purpose });
    if (filters.referenceType) qb.andWhere('f.referenceType = :rt', { rt: filters.referenceType });
    if (filters.referenceId) qb.andWhere('f.referenceId = :ri', { ri: filters.referenceId });
    if (filters.grade != null) qb.andWhere('f.grade = :grade', { grade: filters.grade });
    if (filters.className) qb.andWhere('f.className = :cn', { cn: filters.className });

    const [data, total] = await qb.getManyAndCount();
    return { data, total };
  }

  async deleteFile(
    instituteId: string,
    fileId: string,
  ): Promise<{ success: boolean; message: string }> {
    const file = await this.fileRepo.findOne({ where: { id: fileId, instituteId, isActive: true } });
    if (!file) throw new NotFoundException('File not found');

    try {
      const accessToken = await this.getValidAccessToken(instituteId);
      await firstValueFrom(
        this.http.delete(`https://www.googleapis.com/drive/v3/files/${file.driveFileId}`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        }),
      );
    } catch (err: any) {
      this.logger.warn(`Drive delete failed for ${file.driveFileId}: ${err?.message}`);
    }

    file.isActive = false;
    await this.fileRepo.save(file);
    return { success: true, message: 'File deleted' };
  }

  // ======================================================================
  // STORAGE INFO
  // ======================================================================

  async getStorageInfo(instituteId: string): Promise<{
    limit: number | null;
    usage: number;
    usageInDrive: number;
    usageInDriveTrash: number;
  }> {
    const accessToken = await this.getValidAccessToken(instituteId);
    const res = await firstValueFrom(
      this.http.get('https://www.googleapis.com/drive/v3/about', {
        headers: { Authorization: `Bearer ${accessToken}` },
        params: { fields: 'storageQuota' },
      }),
    );
    const q = res.data.storageQuota || {};
    return {
      limit: q.limit ? parseInt(q.limit, 10) : null, // null = unlimited (Workspace)
      usage: parseInt(q.usage || '0', 10),
      usageInDrive: parseInt(q.usageInDrive || '0', 10),
      usageInDriveTrash: parseInt(q.usageInDriveTrash || '0', 10),
    };
  }

  // ======================================================================
  // FOLDER LISTING
  // ======================================================================

  async listInstituteFolders(
    instituteId: string,
    instituteName: string,
  ): Promise<Array<{
    id: string;
    name: string;
    createdTime: string;
    modifiedTime: string;
    webViewLink: string;
  }>> {
    const accessToken = await this.getValidAccessToken(instituteId);

    const rootId = await this.findOrCreateFolder(accessToken, 'Suraksha LMS', null);
    const instituteRootId = await this.findOrCreateFolder(accessToken, instituteName, rootId);

    const safeFolderId = instituteRootId.replace(/'/g, "\\'");
    const q = `'${safeFolderId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`;

    const res = await firstValueFrom(
      this.http.get('https://www.googleapis.com/drive/v3/files', {
        headers: { Authorization: `Bearer ${accessToken}` },
        params: {
          q,
          fields: 'files(id,name,createdTime,modifiedTime,webViewLink)',
          orderBy: 'name',
          pageSize: 100,
          spaces: 'drive',
        },
      }),
    );
    return (res.data.files || []) as Array<{
      id: string;
      name: string;
      createdTime: string;
      modifiedTime: string;
      webViewLink: string;
    }>;
  }

  async trashInstituteFolder(
    instituteId: string,
    folderId: string,
  ): Promise<{ success: boolean }> {
    if (!/^[a-zA-Z0-9_-]+$/.test(folderId)) {
      throw new BadRequestException('Invalid folder ID');
    }
    const accessToken = await this.getValidAccessToken(instituteId);
    await firstValueFrom(
      this.http.patch(
        `https://www.googleapis.com/drive/v3/files/${folderId}`,
        { trashed: true },
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
        },
      ),
    );
    this.logger.log(`Institute Drive folder trashed: institute=${instituteId} folder=${folderId}`);
    return { success: true };
  }

  // ======================================================================
  // INTERNAL — token refresh
  // ======================================================================

  private async getValidAccessToken(instituteId: string): Promise<string> {
    const cached = this.tokenCache.get(instituteId);
    if (cached && cached.expiresAt > new Date(Date.now() + 60_000)) {
      return cached.token;
    }

    const record = await this.tokenRepo.findOne({ where: { instituteId, isActive: true } });
    if (!record) {
      throw new UnauthorizedException(
        'This institute does not have a Google Drive connected. ' +
        'An institute admin must connect a Drive via Settings → Integrations.',
      );
    }

    // Auto-deactivate after 5 consecutive failures
    if (record.consecutiveFailures >= 5) {
      record.isActive = false;
      await this.tokenRepo.save(record);
      this.tokenCache.delete(instituteId);
      throw new UnauthorizedException(
        'Institute Drive was auto-disconnected due to repeated failures. Please reconnect.',
      );
    }

    try {
      const refreshToken = this.encryption.decrypt(record.encryptedRefreshToken);
      const fresh = await this.refreshAccessToken(refreshToken);

      if (fresh.refresh_token) {
        record.encryptedRefreshToken = this.encryption.encrypt(fresh.refresh_token);
      }

      const expiresAt = new Date(Date.now() + (fresh.expires_in || 3600) * 1000);
      record.accessTokenExpiresAt = expiresAt;
      record.refreshCount = (record.refreshCount || 0) + 1;
      record.consecutiveFailures = 0;
      record.lastFailureReason = null;
      await this.tokenRepo.save(record);

      this.evictCacheIfNeeded();
      this.tokenCache.set(instituteId, { token: fresh.access_token, expiresAt });
      return fresh.access_token;
    } catch (err: any) {
      record.consecutiveFailures = (record.consecutiveFailures || 0) + 1;
      record.lastFailureReason = err?.message?.substring(0, 500);
      await this.tokenRepo.save(record);
      this.tokenCache.delete(instituteId);

      if (err?.response?.data?.error === 'invalid_grant') {
        record.isActive = false;
        await this.tokenRepo.save(record);
        throw new UnauthorizedException(
          'Institute Drive access was revoked. An admin must reconnect.',
        );
      }

      throw new InternalServerErrorException('Failed to access institute Drive. Please try again.');
    }
  }

  // ======================================================================
  // INTERNAL — Google API helpers
  // ======================================================================

  private async exchangeCodeForTokens(code: string) {
    const res = await firstValueFrom(
      this.http.post(
        'https://oauth2.googleapis.com/token',
        {
          code,
          client_id: this.clientId,
          client_secret: this.clientSecret,
          redirect_uri: this.callbackUri,
          grant_type: 'authorization_code',
        },
        { headers: { 'Content-Type': 'application/json' } },
      ),
    );
    return res.data;
  }

  private async refreshAccessToken(refreshToken: string) {
    const res = await firstValueFrom(
      this.http.post(
        'https://oauth2.googleapis.com/token',
        {
          refresh_token: refreshToken,
          client_id: this.clientId,
          client_secret: this.clientSecret,
          grant_type: 'refresh_token',
        },
        { headers: { 'Content-Type': 'application/json' } },
      ),
    );
    return res.data;
  }

  private async getGoogleUserInfo(accessToken: string) {
    const res = await firstValueFrom(
      this.http.get('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: { Authorization: `Bearer ${accessToken}` },
      }),
    );
    return res.data as { email: string; name: string; picture: string };
  }

  private async revokeTokenAtGoogle(token: string) {
    await firstValueFrom(
      this.http.post(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(token)}`),
    );
  }

  private async getDriveFileMetadata(accessToken: string, fileId: string) {
    try {
      const res = await firstValueFrom(
        this.http.get(`https://www.googleapis.com/drive/v3/files/${fileId}`, {
          headers: { Authorization: `Bearer ${accessToken}` },
          params: { fields: 'id,name,mimeType,size,webViewLink,webContentLink,parents' },
        }),
      );
      return res.data as {
        id: string;
        name: string;
        mimeType: string;
        size?: string;
        webViewLink?: string;
        webContentLink?: string;
        parents?: string[];
      };
    } catch (err: any) {
      if (err?.response?.status === 404) return null;
      this.logger.error(`Drive metadata fetch failed for ${fileId}: ${err?.message}`);
      return null;
    }
  }

  /**
   * Find a folder by name+parent on Google Drive, or create it if it doesn't exist.
   * This is idempotent — safe to call multiple times.
   */
  private async findOrCreateFolder(
    accessToken: string,
    folderName: string,
    parentId: string | null,
  ): Promise<string> {
    // Validate: no control characters in folder names
    if (/[\x00-\x1f]/.test(folderName)) {
      throw new BadRequestException('Invalid folder name');
    }
    if (parentId && !/^[a-zA-Z0-9_-]+$/.test(parentId)) {
      throw new BadRequestException('Invalid parent folder ID');
    }

    const safeName = folderName.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    let q = `name='${safeName}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
    if (parentId) q += ` and '${parentId}' in parents`;

    const search = await firstValueFrom(
      this.http.get('https://www.googleapis.com/drive/v3/files', {
        headers: { Authorization: `Bearer ${accessToken}` },
        params: { q, fields: 'files(id)', spaces: 'drive' },
      }),
    );

    if (search.data.files?.length > 0) return search.data.files[0].id;

    const meta: Record<string, any> = {
      name: folderName,
      mimeType: 'application/vnd.google-apps.folder',
    };
    if (parentId) meta.parents = [parentId];

    const create = await firstValueFrom(
      this.http.post('https://www.googleapis.com/drive/v3/files', meta, {
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        params: { fields: 'id' },
      }),
    );

    this.logger.log(`Created institute Drive folder: "${folderName}" (${create.data.id})`);
    return create.data.id;
  }

  private evictCacheIfNeeded(): void {
    const now = new Date();
    for (const [k, v] of this.tokenCache) {
      if (v.expiresAt < now) this.tokenCache.delete(k);
    }
    if (this.tokenCache.size > InstituteDriveService.MAX_CACHE_SIZE) {
      const excess = this.tokenCache.size - InstituteDriveService.MAX_CACHE_SIZE;
      let removed = 0;
      for (const k of this.tokenCache.keys()) {
        if (removed++ >= excess) break;
        this.tokenCache.delete(k);
      }
    }
  }
}
