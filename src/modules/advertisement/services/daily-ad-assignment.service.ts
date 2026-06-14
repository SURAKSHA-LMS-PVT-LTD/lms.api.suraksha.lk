import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, In } from 'typeorm';
import { DailyAdAssignmentEntity } from '../entities/daily-ad-assignment.entity';
import { AdvertisementEntity } from '../entities/advertisement.entity';
import { UserEntity } from '../../user/entities/user.entity';
import { AdvertisementMatchingService, UserProfile } from '../advertisement-matching.service';
import { NOTIFICATION_PACKAGES_CONFIG } from './notification-packages.config';
import { SubscriptionPlan } from '../../user/enums/subscription-plan.enum';
import { getCurrentSriLankaDate } from '../../../common/utils/timezone.util';

/**
 * Pre-assigned ad served on the attendance hot path. Mirrors the denormalized snapshot
 * stored per user so callers need no join.
 */
export interface AssignedAd {
  id: string;
  mediaUrl?: string;
  mediaType?: string;
  title?: string;
  content?: string;
  sendingUrl?: string;
  supportivePlatforms: string[];
  modeOfSending: string[];
  cascadeToParents: boolean;
}

/**
 * Builds and serves the daily user→ad pre-assignment table.
 *
 * The expensive multi-factor matching runs here once per day (cron + manual button),
 * NOT on the attendance hot path. At scan time, callers use getAssignedAd(userId) —
 * a single indexed lookup.
 */
@Injectable()
export class DailyAdAssignmentService {
  private readonly logger = new Logger(DailyAdAssignmentService.name);
  private isAssigning = false;

  // How many user rows to process per batch when enumerating eligible users.
  private readonly USER_BATCH_SIZE = 1000;

  constructor(
    @InjectRepository(DailyAdAssignmentEntity)
    private readonly assignmentRepository: Repository<DailyAdAssignmentEntity>,
    @InjectRepository(UserEntity)
    private readonly userRepository: Repository<UserEntity>,
    private readonly matchingService: AdvertisementMatchingService,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Plans that carry an ad package, derived from the notification config so there is a
   * single source of truth. Flipping a plan's `isAds` in the config changes eligibility.
   */
  private getAdEligiblePlans(): string[] {
    const packages = NOTIFICATION_PACKAGES_CONFIG.packages as Record<string, { isAds?: boolean }>;
    return Object.entries(packages)
      .filter(([, cfg]) => cfg?.isAds === true)
      .map(([plan]) => plan);
  }

  /**
   * HOT PATH — single indexed lookup. Returns the ad pre-assigned to this user today,
   * or null if there is none (no eligible ad / not yet assigned / stale row). A null
   * result means "send no ad" — never an error.
   */
  async getAssignedAd(userId: string): Promise<AssignedAd | null> {
    try {
      const row = await this.assignmentRepository.findOne({
        where: { userId },
        select: [
          'adId', 'assignedDate', 'mediaUrl', 'mediaType', 'title', 'content',
          'sendingUrl', 'supportivePlatforms', 'modeOfSending', 'cascadeToParents',
        ],
      });

      if (!row) return null;

      // Ignore a stale row left over from a previous day (rebuild may be mid-flight).
      if (row.assignedDate !== getCurrentSriLankaDate()) return null;

      return {
        id: row.adId,
        mediaUrl: row.mediaUrl,
        mediaType: row.mediaType,
        title: row.title,
        content: row.content,
        sendingUrl: row.sendingUrl,
        supportivePlatforms: row.supportivePlatforms || [],
        modeOfSending: row.modeOfSending || [],
        cascadeToParents: row.cascadeToParents || false,
      };
    } catch (error) {
      // Hot path must never throw — degrade to "no ad".
      this.logger.error(`getAssignedAd failed for user ${userId}: ${error.message}`);
      return null;
    }
  }

  /**
   * Daily auto-rebuild at 05:00 Sri Lanka time. The manual admin button calls reassignAll
   * directly for mid-day refreshes after campaign changes.
   */
  @Cron('0 0 5 * * *', { name: 'daily-ad-assignment', timeZone: 'Asia/Colombo' })
  async scheduledReassign(): Promise<void> {
    try {
      await this.reassignAll('cron');
    } catch (error) {
      // Cron must not crash the scheduler — error already logged in reassignAll.
      this.logger.error(`[DailyAds] Scheduled reassign error: ${error.message}`);
    }
  }

  /**
   * Rebuild today's assignments: TRUNCATE then assign the best ad to each eligible user.
   * Guarded against concurrent runs (cron + manual button). Returns a summary.
   */
  async reassignAll(triggeredBy: 'cron' | 'manual' = 'manual'): Promise<{
    assigned: number;
    eligibleUsers: number;
    activeAds: number;
    skippedNoMatch: number;
    date: string;
    durationMs: number;
  }> {
    if (this.isAssigning) {
      this.logger.warn(`[DailyAds] Reassign already running — ${triggeredBy} trigger skipped`);
      return { assigned: 0, eligibleUsers: 0, activeAds: 0, skippedNoMatch: 0, date: getCurrentSriLankaDate(), durationMs: 0 };
    }

    this.isAssigning = true;
    const startedAt = Date.now();
    const today = getCurrentSriLankaDate();
    const eligiblePlans = this.getAdEligiblePlans();

    try {
      // No plan carries ads → clear the table and stop. The hot path will read "no ad".
      if (eligiblePlans.length === 0) {
        await this.truncate();
        this.logger.log(`[DailyAds] No ad-eligible plans configured — table cleared (${triggeredBy})`);
        return { assigned: 0, eligibleUsers: 0, activeAds: 0, skippedNoMatch: 0, date: today, durationMs: Date.now() - startedAt };
      }

      // Pre-load the active ad set once (cached). If there are zero active ads, clear and stop.
      const activeAds = await this.matchingService.getActiveAdvertisementsForAssignment();
      if (activeAds.length === 0) {
        await this.truncate();
        this.logger.log(`[DailyAds] No active ads — table cleared (${triggeredBy})`);
        return { assigned: 0, eligibleUsers: 0, activeAds: 0, skippedNoMatch: 0, date: today, durationMs: Date.now() - startedAt };
      }

      // Rebuild: clear first, then stream eligible users in batches and bulk-insert.
      await this.truncate();

      let eligibleUsers = 0;
      let assigned = 0;
      let skippedNoMatch = 0;
      let offset = 0;

      // eslint-disable-next-line no-constant-condition
      while (true) {
        const users = await this.userRepository.find({
          where: { subscriptionPlan: In(eligiblePlans as SubscriptionPlan[]), isActive: true },
          select: ['id', 'userType', 'subscriptionPlan', 'dateOfBirth', 'gender', 'city', 'district', 'province'],
          order: { id: 'ASC' },
          skip: offset,
          take: this.USER_BATCH_SIZE,
        });

        if (users.length === 0) break;
        eligibleUsers += users.length;

        const rows: Partial<DailyAdAssignmentEntity>[] = [];
        for (const user of users) {
          const profile: UserProfile = {
            userId: String(user.id),
            userType: user.userType,
            subscriptionPlan: user.subscriptionPlan,
            city: user.city || undefined,
            province: user.province || undefined,
            district: user.district || undefined,
            birthYear: user.dateOfBirth ? new Date(user.dateOfBirth).getFullYear() : undefined,
            gender: user.gender || undefined,
          };

          // Match against the pre-loaded active set — no per-user DB read.
          const best = this.matchingService.pickBestFromSet(activeAds, profile);
          if (!best) {
            skippedNoMatch += 1;
            continue;
          }

          rows.push({
            userId: String(user.id),
            adId: best.id,
            assignedDate: today,
            mediaUrl: best.mediaUrl,
            mediaType: best.mediaType,
            title: best.title,
            content: best.content,
            sendingUrl: best.sendingUrl,
            supportivePlatforms: best.supportivePlatforms,
            modeOfSending: best.modeOfSending,
            cascadeToParents: best.cascadeToParents,
          });
        }

        if (rows.length > 0) {
          await this.assignmentRepository.insert(rows);
          assigned += rows.length;
        }

        if (users.length < this.USER_BATCH_SIZE) break;
        offset += this.USER_BATCH_SIZE;
      }

      const durationMs = Date.now() - startedAt;
      this.logger.log(
        `[DailyAds] Reassign complete (${triggeredBy}): assigned=${assigned} eligibleUsers=${eligibleUsers} ` +
        `activeAds=${activeAds.length} skippedNoMatch=${skippedNoMatch} date=${today} took=${durationMs}ms`,
      );

      return { assigned, eligibleUsers, activeAds: activeAds.length, skippedNoMatch, date: today, durationMs };
    } catch (error) {
      this.logger.error(`[DailyAds] Reassign failed (${triggeredBy}): ${error.message}`, error.stack);
      throw error;
    } finally {
      this.isAssigning = false;
    }
  }

  /** Current assignment table summary for admin observability. */
  async getStatus(): Promise<{ date: string; totalAssignments: number; running: boolean }> {
    const today = getCurrentSriLankaDate();
    const totalAssignments = await this.assignmentRepository.count({ where: { assignedDate: today } });
    return { date: today, totalAssignments, running: this.isAssigning };
  }

  /** Fast wipe. TRUNCATE resets the table; falls back to DELETE if TRUNCATE is unavailable. */
  private async truncate(): Promise<void> {
    try {
      await this.dataSource.query('TRUNCATE TABLE daily_ad_assignments');
    } catch (error) {
      this.logger.warn(`[DailyAds] TRUNCATE failed (${error.message}), falling back to DELETE`);
      await this.assignmentRepository.createQueryBuilder().delete().execute();
    }
  }
}
