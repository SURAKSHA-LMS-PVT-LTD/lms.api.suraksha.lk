import {
  Injectable, Logger, UnauthorizedException, NotFoundException, ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import * as crypto from 'crypto';
import { InstituteLoginSessionEntity, InstituteSessionLoginMethod } from '../entities/institute-login-session.entity';
import { InstituteUserEntity } from '../../modules/institute_mudules/institue_user/entities/institue_user.entity';

export interface SessionCheckResult {
  /** true  → under limit, proceed with login */
  allowed: boolean;
  /** How many active sessions exist right now */
  activeCount: number;
  /** Configured device limit (always a positive number when allowed=false) */
  maxDevices: number;
  /** Active sessions list (id, deviceLabel, ipAddress, createdAt, lastActiveAt, scopeHost) */
  activeSessions: ActiveSessionDto[];
  /**
   * When true: over-limit login must be BLOCKED (strict enforcement).
   * When false (default): over-limit login should auto-kick the oldest session (relaxed).
   */
  isStrict: boolean;
}

export interface ActiveSessionDto {
  id: string;
  deviceLabel: string | null;
  ipAddress: string | null;
  scopeHost: string | null;
  loginMethod: string;
  createdAt: Date;
  lastActiveAt: Date;
}

@Injectable()
export class InstituteSessionService {
  private readonly logger = new Logger(InstituteSessionService.name);

  constructor(
    @InjectRepository(InstituteLoginSessionEntity)
    private readonly sessionRepo: Repository<InstituteLoginSessionEntity>,
    @InjectRepository(InstituteUserEntity)
    private readonly instituteUserRepo: Repository<InstituteUserEntity>,
  ) {}

  // ── Helpers ─────────────────────────────────────────────────────────────────

  /** SHA-256 of the token string for safe storage / lookup. */
  static hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  /** Parse a User-Agent string into a short human label. */
  static parseDeviceLabel(userAgent?: string): string | null {
    if (!userAgent) return null;
    const ua = userAgent.slice(0, 512);

    let os = 'Unknown OS';
    if (/Windows NT 10/i.test(ua)) os = 'Windows 10/11';
    else if (/Windows NT 6\.3/i.test(ua)) os = 'Windows 8.1';
    else if (/Mac OS X/i.test(ua)) os = 'macOS';
    else if (/Android/i.test(ua)) {
      const m = ua.match(/Android ([\d.]+)/);
      os = m ? `Android ${m[1]}` : 'Android';
    } else if (/iPhone|iPad/i.test(ua)) os = 'iOS';
    else if (/Linux/i.test(ua)) os = 'Linux';

    let browser = 'Browser';
    if (/Edg\//i.test(ua)) browser = 'Edge';
    else if (/OPR\//i.test(ua)) browser = 'Opera';
    else if (/Chrome\//i.test(ua)) browser = 'Chrome';
    else if (/Safari\//i.test(ua)) browser = 'Safari';
    else if (/Firefox\//i.test(ua)) browser = 'Firefox';

    return `${browser} on ${os}`;
  }

  // ── Core operations ─────────────────────────────────────────────────────────

  /**
   * Check whether a user can open a new session.
   * Cleans up expired sessions first, then compares against max_devices_per_user.
   */
  async checkSessionLimit(
    instituteId: string,
    userId: string,
  ): Promise<SessionCheckResult> {
    // Expire stale sessions
    await this.expireStale(instituteId, userId);

    // Fetch institute settings
    const institute = await this.sessionRepo.manager.query(
      `SELECT custom_login_enabled, is_session_limit_enabled, default_sessions_per_user_count, is_strict_session_limit FROM institutes WHERE id = ?`,
      [instituteId]
    ).then(res => res[0]);

    if (!institute) return { allowed: true, activeCount: 0, maxDevices: 0, activeSessions: [], isStrict: false };

    // Performance optimization: skip limit checks if feature disabled
    if (!institute.custom_login_enabled || !institute.is_session_limit_enabled) {
      return { allowed: true, activeCount: 0, maxDevices: 0, activeSessions: [], isStrict: false };
    }

    const isStrict: boolean = !!institute.is_strict_session_limit;

    // Fetch institute user specific limit
    const iu = await this.instituteUserRepo.findOne({
      where: { instituteId, userId },
      select: ['maxDevicesPerUser'],
    } as any);

    // If user has a custom limit, use it. Otherwise, use the institute's default limit.
    // maxDevicesPerUser = null means "use institute default"; 0 is not a valid value.
    const perUserLimit: number | null = (iu as any)?.maxDevicesPerUser ?? null;
    const maxDevices: number = perUserLimit !== null && perUserLimit > 0
      ? perUserLimit
      : Math.max(1, institute.default_sessions_per_user_count ?? 1);

    // Fetch active sessions (newest first so activeSessions[0] is the most recently used)
    const activeSessions = await this.sessionRepo.find({
      where: { instituteId, userId, isActive: true },
      order: { lastActiveAt: 'DESC' },
    });

    const activeCount = activeSessions.length;
    const allowed = activeCount < maxDevices;

    return {
      allowed,
      activeCount,
      maxDevices,
      isStrict,
      activeSessions: activeSessions.map(s => ({
        id: s.id,
        deviceLabel: s.deviceLabel,
        ipAddress: s.ipAddress,
        scopeHost: s.scopeHost,
        loginMethod: s.loginMethod,
        createdAt: s.createdAt,
        lastActiveAt: s.lastActiveAt,
      })),
    };
  }

  /**
   * Create a new session record after successful login.
   * refreshToken is hashed before storage.
   */
  async createSession(params: {
    instituteId: string;
    userId: string;
    userIdByInstitute: string;
    refreshToken: string;
    loginMethod: InstituteSessionLoginMethod;
    scopeHost?: string | null;
    ipAddress?: string | null;
    userAgent?: string | null;
    refreshExpiresInSeconds: number;
  }): Promise<InstituteLoginSessionEntity> {
    const tokenHash = InstituteSessionService.hashToken(params.refreshToken);
    const deviceLabel = InstituteSessionService.parseDeviceLabel(params.userAgent ?? undefined);
    const expiresAt = new Date(Date.now() + params.refreshExpiresInSeconds * 1000);

    const session = this.sessionRepo.create({
      instituteId: params.instituteId,
      userId: params.userId,
      userIdByInstitute: params.userIdByInstitute,
      tokenHash,
      deviceLabel,
      ipAddress: params.ipAddress ?? null,
      loginMethod: params.loginMethod,
      scopeHost: params.scopeHost ?? null,
      isActive: true,
      lastActiveAt: new Date(),
      expiresAt,
    });

    return this.sessionRepo.save(session);
  }

  /**
   * Deactivate a single session by its ID.
   * Admin can revoke any session in their institute.
   * User can only revoke their own.
   */
  async deactivateSession(
    sessionId: string,
    { requestingUserId, requestingInstituteId, isAdmin }: { requestingUserId: string; requestingInstituteId: string; isAdmin: boolean },
    reason = 'MANUAL_LOGOUT',
  ): Promise<void> {
    const session = await this.sessionRepo.findOne({ where: { id: sessionId } });
    if (!session) throw new NotFoundException('Session not found');

    if (session.instituteId !== requestingInstituteId) {
      throw new ForbiddenException('Session does not belong to this institute');
    }
    if (!isAdmin && session.userId !== requestingUserId) {
      throw new ForbiddenException('Cannot revoke another user\'s session');
    }

    await this.sessionRepo.update(sessionId, {
      isActive: false,
      deactivatedReason: reason,
    });

    this.logger.log(`✅ Session ${sessionId} deactivated (reason=${reason}) by user=${requestingUserId}`);
  }

  /**
   * Deactivate the oldest N sessions for a user (to make room for a new one).
   * Returns the number of sessions deactivated.
   */
  async deactivateOldestSessions(
    instituteId: string,
    userId: string,
    count = 1,
  ): Promise<number> {
    const oldest = await this.sessionRepo.find({
      where: { instituteId, userId, isActive: true },
      order: { lastActiveAt: 'ASC' },
      take: count,
    });

    if (oldest.length === 0) return 0;

    const ids = oldest.map(s => s.id);
    await this.sessionRepo
      .createQueryBuilder()
      .update(InstituteLoginSessionEntity)
      .set({ isActive: false, deactivatedReason: 'REPLACED_BY_NEW_SESSION' })
      .where('id IN (:...ids)', { ids })
      .execute();

    this.logger.log(`🔄 Deactivated ${oldest.length} old session(s) for user=${userId}, institute=${instituteId}`);
    return oldest.length;
  }

  /**
   * Deactivate ALL sessions for a user in an institute.
   */
  async deactivateAllSessions(
    instituteId: string,
    userId: string,
    reason = 'ADMIN_FORCED_LOGOUT',
  ): Promise<number> {
    const result = await this.sessionRepo
      .createQueryBuilder()
      .update(InstituteLoginSessionEntity)
      .set({ isActive: false, deactivatedReason: reason })
      .where('instituteId = :instituteId AND userId = :userId AND isActive = :isActive', { instituteId, userId, isActive: true })
      .execute();

    const count = result.affected ?? 0;
    this.logger.log(`🔄 Deactivated ${count} session(s) for user=${userId}, institute=${instituteId} (reason=${reason})`);
    return count;
  }

  /**
   * Validate that a token's scope_host matches the requesting host.
   * Called on every protected request in a subdomain/custom-domain context.
   */
  async validateTokenScope(tokenHash: string, requestHost: string): Promise<boolean> {
    const session = await this.sessionRepo.findOne({
      where: { tokenHash, isActive: true },
      select: ['scopeHost', 'loginMethod'],
    } as any);

    if (!session) return false;
    if (!session.scopeHost) return true; // MAIN login — no scope restriction
    return session.scopeHost === requestHost;
  }

  /**
   * Touch lastActiveAt for a session identified by token hash.
   * Call this on any authenticated request.
   */
  async touchSession(tokenHash: string): Promise<void> {
    await this.sessionRepo.update({ tokenHash }, { lastActiveAt: new Date() });
  }

  // ── Admin / listing ─────────────────────────────────────────────────────────

  /**
   * List all active sessions for an institute (admin view).
   */
  async listInstituteSessions(
    instituteId: string,
    opts: { userId?: string; page?: number; limit?: number },
  ) {
    const page  = Math.max(1, opts.page  ?? 1);
    const limit = Math.min(100, Math.max(1, opts.limit ?? 20));
    const skip  = (page - 1) * limit;

    const qb = this.sessionRepo.createQueryBuilder('s')
      .where('s.instituteId = :instituteId', { instituteId })
      .andWhere('s.isActive = :isActive', { isActive: true });

    if (opts.userId) {
      qb.andWhere('s.userId = :userId', { userId: opts.userId });
    }

    qb.orderBy('s.lastActiveAt', 'DESC').skip(skip).take(limit);

    const [sessions, total] = await qb.getManyAndCount();

    // Fetch limits for these users
    const uniqueUserIds = [...new Set(sessions.map(s => s.userId))];
    let userLimits: Record<string, number | null> = {};
    if (uniqueUserIds.length > 0) {
      const users = await this.instituteUserRepo.find({
        where: { instituteId, userId: In(uniqueUserIds) },
        select: ['userId', 'maxDevicesPerUser']
      } as any);
      users.forEach(u => {
        userLimits[u.userId] = (u as any).maxDevicesPerUser;
      });
    }

    return {
      data: sessions.map(s => ({
        id: s.id,
        userId: s.userId,
        userIdByInstitute: s.userIdByInstitute,
        deviceLabel: s.deviceLabel,
        ipAddress: s.ipAddress,
        loginMethod: s.loginMethod,
        scopeHost: s.scopeHost,
        createdAt: s.createdAt,
        lastActiveAt: s.lastActiveAt,
        expiresAt: s.expiresAt,
        maxDevicesPerUser: userLimits[s.userId] ?? null,
      })),
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  /** Set or clear the per-user device limit for a user in an institute. */
  async setDeviceLimit(instituteId: string, userId: string, maxDevices: number | null): Promise<void> {
    await this.instituteUserRepo.update(
      { instituteId, userId },
      { maxDevicesPerUser: maxDevices } as any,
    );
    this.logger.log(`⚙️ Device limit set to ${maxDevices ?? 'unlimited'} for user=${userId}, institute=${instituteId}`);
  }

  // ── Maintenance ─────────────────────────────────────────────────────────────

  /** Mark expired sessions inactive. Called on login and can be run as cron. */
  async expireStale(instituteId?: string, userId?: string): Promise<void> {
    const qb = this.sessionRepo.createQueryBuilder()
      .update(InstituteLoginSessionEntity)
      .set({ isActive: false, deactivatedReason: 'EXPIRED' })
      .where('expiresAt < NOW() AND isActive = :isActive', { isActive: true });

    if (instituteId) qb.andWhere('instituteId = :instituteId', { instituteId });
    if (userId)      qb.andWhere('userId = :userId',      { userId });

    await qb.execute();
  }
}
