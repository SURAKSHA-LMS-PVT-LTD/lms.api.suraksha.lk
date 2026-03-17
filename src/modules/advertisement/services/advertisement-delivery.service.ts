import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { AdvertisementEntity } from '../entities/advertisement.entity';
import { getCurrentSriLankaTime } from '../../../common/utils/timezone.util';
import { AdvertisementMatchingService, UserProfile } from '../advertisement-matching.service';
import { AttendanceNotificationService, AttendanceNotificationData } from '../../attendance/services/attendance-notification.service';
import { UserEntity } from '../../user/entities/user.entity';
import { StudentEntity } from '../../student/entities/student.entity';
import { ParentEntity } from '../../parent/entities/parent.entity';
import { InstituteUserEntity } from '../../institute_mudules/institue_user/entities/institue_user.entity';
import { NOTIFICATION_PACKAGES_CONFIG } from './notification-packages.config';

export interface AdvertisementDeliveryResult {
  success: boolean;
  advertisementId?: string;
  advertisementTitle?: string;
  advertisementUrl?: string;
  advertisementContent?: string;
  advertisementMediaType?: string;
  advertisementSendingUrl?: string;
  supportivePlatforms?: string[];
  modeOfSending?: string[];
  matchScore?: number;
  deliveryMethod: 'database' | 'default' | 'none';
  reason?: string;
  timestamp: Date;
}

export interface AttendanceWithAdvertisement {
  attendanceNotified: boolean;
  advertisementDelivered: boolean;
  notificationChannels: string[];
  advertisement?: {
    id: string;
    title: string;
    mediaUrl: string;
    mediaType: string;
    matchScore?: number;
  };
  deliveryTimestamp: Date;
}

/**
 * Advertisement Delivery Service
 * 
 * Handles the selection, matching, and delivery of advertisements
 * alongside attendance notifications. This service is separated from
 * attendance logic to maintain single responsibility principle.
 * 
 * Features:
 * - Smart advertisement matching based on user profiles
 * - Database-driven ad selection with scoring algorithm
 * - Fallback to default environment-based ads
 * - Impression and click tracking
 * - Analytics and performance monitoring
 */
@Injectable()
export class AdvertisementDeliveryService {
  private readonly logger = new Logger(AdvertisementDeliveryService.name);
  private readonly adsDeliveryEnabled: boolean;
  private readonly isAdsFromDatabase: boolean;
  private readonly defaultAdTitle: string;
  private readonly defaultAdContent: string;
  private readonly defaultAdMediaUrl: string;

  constructor(
    @InjectRepository(AdvertisementEntity)
    private advertisementRepository: Repository<AdvertisementEntity>,
    @InjectRepository(UserEntity)
    private userRepository: Repository<UserEntity>,
    @InjectRepository(StudentEntity)
    private studentRepository: Repository<StudentEntity>,
    @InjectRepository(ParentEntity)
    private parentRepository: Repository<ParentEntity>,
    @InjectRepository(InstituteUserEntity)
    private instituteUserRepository: Repository<InstituteUserEntity>,
    private readonly advertisementMatchingService: AdvertisementMatchingService,
    private readonly attendanceNotificationService: AttendanceNotificationService,
    private readonly dataSource: DataSource,
  ) {
    // Load configuration from environment
    this.adsDeliveryEnabled = process.env.ENABLE_ADVERTISEMENT_DELIVERY === 'true';
    this.isAdsFromDatabase = process.env.IS_ADS_FROM_DB === 'true';
    this.defaultAdTitle = process.env.DEFAULT_AD_TITLE || 'LaaS Platform';
    this.defaultAdContent = process.env.DEFAULT_AD_CONTENT || 'Quality Education Management System';
    this.defaultAdMediaUrl = process.env.DEFAULT_AD_MEDIA_URL || 'https://example.com/ad.jpg';

  }

  /**
   * Send attendance notification with matched advertisement
   * This is the main entry point for attendance + advertisement delivery
   * 
   * @param studentId Student ID for whom attendance is marked
   * @param attendanceData Complete attendance notification data
   * @returns Result including both notification and advertisement delivery status
   */
  async sendAttendanceWithAdvertisement(
    studentId: string,
    attendanceData: AttendanceNotificationData
  ): Promise<AttendanceWithAdvertisement> {
    const startTime = Date.now();
    
    try {
      // Step 1: Select and attach advertisement
      const advertisementResult = await this.selectAdvertisementForUser(studentId, attendanceData.subscriptionPlan);
      
      // Step 2: Attach advertisement to notification data
      if (advertisementResult.success && advertisementResult.advertisementId) {
        attendanceData.advertisementData = {
          id: advertisementResult.advertisementId,
          mediaUrl: advertisementResult.advertisementUrl || this.defaultAdMediaUrl,
          // BUG-4 FIX: Use actual mediaType from the ad, not hardcoded 'IMAGE'
          mediaType: advertisementResult.advertisementMediaType || 'image',
          title: advertisementResult.advertisementTitle || this.defaultAdTitle,
          content: advertisementResult.advertisementContent || this.defaultAdContent,
          sendingUrl: advertisementResult.advertisementSendingUrl,
          supportivePlatforms: advertisementResult.supportivePlatforms || [],
          modeOfSending: advertisementResult.modeOfSending || [],
        };
      }

      // Step 3: Send notification with advertisement to the student
      const notificationResult = await this.attendanceNotificationService.sendAttendanceNotification(attendanceData);

      // Step 4: Record impression if advertisement was delivered successfully
      if (advertisementResult.success && advertisementResult.advertisementId && notificationResult.successfulChannels > 0) {
        await this.recordAdvertisementImpression(advertisementResult.advertisementId, studentId);
      }

      // Step 5: FEAT-4 — cascadeToParents delivery
      // If the matched ad has cascadeToParents=true, send the same ad to student's parents
      if (
        advertisementResult.success &&
        advertisementResult.advertisementId &&
        notificationResult.successfulChannels > 0
      ) {
        // Fetch full ad entity to check cascadeToParents flag
        try {
          const ad = await this.advertisementRepository.findOne({
            where: { id: advertisementResult.advertisementId },
            select: ['id', 'cascadeToParents'],
          });

          if (ad?.cascadeToParents) {
            await this.cascadeAdToParents(studentId, attendanceData);
          }
        } catch (cascadeErr) {
          // Non-fatal — log and continue
          this.logger.warn(`⚠️ cascadeToParents check failed for student ${studentId}: ${cascadeErr.message}`);
        }
      }

      const duration = Date.now() - startTime;

      return {
        attendanceNotified: notificationResult.successfulChannels > 0,
        advertisementDelivered: advertisementResult.success && notificationResult.successfulChannels > 0,
        notificationChannels: notificationResult.results.filter(r => r.success).map(r => r.channel),
        advertisement: advertisementResult.success ? {
          id: advertisementResult.advertisementId!,
          title: advertisementResult.advertisementTitle!,
          mediaUrl: advertisementResult.advertisementUrl!,
          // BUG-4 FIX: propagate real mediaType here too
          mediaType: advertisementResult.advertisementMediaType || 'image',
          matchScore: advertisementResult.matchScore
        } : undefined,
        deliveryTimestamp: getCurrentSriLankaTime()
      };

    } catch (error) {
      this.logger.error(`Error sending attendance with advertisement for student ${studentId}`, error);
      
      // Fallback: Try sending notification without advertisement
      try {
        const fallbackResult = await this.attendanceNotificationService.sendAttendanceNotification(attendanceData);
        return {
          attendanceNotified: fallbackResult.successfulChannels > 0,
          advertisementDelivered: false,
          notificationChannels: fallbackResult.results.filter(r => r.success).map(r => r.channel),
          deliveryTimestamp: getCurrentSriLankaTime()
        };
      } catch (fallbackError) {
        this.logger.error(`Fallback notification also failed for student ${studentId}`, fallbackError);
        return {
          attendanceNotified: false,
          advertisementDelivered: false,
          notificationChannels: [],
          deliveryTimestamp: getCurrentSriLankaTime()
        };
      }
    }
  }

  /**
   * FEAT-4: Cascade advertisement to all parents of a student.
   * Sends the same advertisement (via attendanceData) to father, mother, and guardian.
   * Each parent gets sent individually so one failure doesn't block others.
   */
  private async cascadeAdToParents(
    studentId: string,
    attendanceData: AttendanceNotificationData
  ): Promise<void> {
    try {
      const student = await this.studentRepository.findOne({
        where: { userId: studentId },
        relations: ['father', 'mother', 'guardian', 'father.user', 'mother.user', 'guardian.user'],
        select: {
          userId: true,
          father: { userId: true, user: { id: true, email: true, phoneNumber: true } },
          mother: { userId: true, user: { id: true, email: true, phoneNumber: true } },
          guardian: { userId: true, user: { id: true, email: true, phoneNumber: true } },
        },
      });

      if (!student) return;

      const parents = [student.father, student.mother, student.guardian].filter(Boolean);

      if (parents.length === 0) {
        this.logger.debug(`No parents found to cascade ad for student ${studentId}`);
        return;
      }

      // Build parent notification tasks (non-fatal each)
      const cascadeTasks = parents.map(async (parent) => {
        if (!parent?.user) return;
        try {
          const parentNotificationData: AttendanceNotificationData = {
            ...attendanceData,
            studentId: parent.userId,
            studentName: attendanceData.studentName, // Keep student name for context
            parentContact: parent.user.phoneNumber || null,
            parentEmail: parent.user.email || null,
            parentTelegramId: null,
          };
          await this.attendanceNotificationService.sendAttendanceNotification(parentNotificationData);
          this.logger.debug(`✅ cascadeToParents: ad sent to parent ${parent.userId}`);
        } catch (err) {
          this.logger.warn(`⚠️ cascadeToParents: failed for parent ${parent?.userId}: ${err.message}`);
        }
      });

      await Promise.allSettled(cascadeTasks);
      this.logger.log(`📨 cascadeToParents: cascaded to ${parents.length} parent(s) for student ${studentId}`);
    } catch (err) {
      this.logger.warn(`⚠️ cascadeAdToParents error for student ${studentId}: ${err.message}`);
    }
  }

  /**
   * Select most appropriate advertisement for a user
   * Uses database matching service if enabled, falls back to default ad
   * 
   * @param studentId Student ID to build user profile
   * @param subscriptionPlan User's subscription plan
   * @returns Advertisement delivery result
   */
  async selectAdvertisementForUser(
    studentId: string,
    subscriptionPlan: string
  ): Promise<AdvertisementDeliveryResult> {
    try {
      // Check if advertisements are enabled for this subscription plan
      if (!this.isAdvertisementEnabled(subscriptionPlan)) {
        return {
          success: false,
          deliveryMethod: 'none',
          reason: 'Advertisements disabled for subscription plan',
          timestamp: getCurrentSriLankaTime()
        };
      }

      // Database-driven advertisement selection
      if (this.isAdsFromDatabase) {
        return await this.selectDatabaseAdvertisement(studentId, subscriptionPlan);
      }

      // Default environment-based advertisement
      return this.selectDefaultAdvertisement();

    } catch (error) {
      this.logger.error(`Error selecting advertisement for student ${studentId}`, error);
      return {
        success: false,
        deliveryMethod: 'none',
        reason: `Error: ${error.message}`,
        timestamp: getCurrentSriLankaTime()
      };
    }
  }

  /**
   * Select advertisement from database using matching algorithm
   */
  private async selectDatabaseAdvertisement(
    studentId: string,
    subscriptionPlan: string
  ): Promise<AdvertisementDeliveryResult> {
    try {
      // Build user profile for matching
      const userProfile = await this.buildUserProfile(studentId, subscriptionPlan);
      
      if (!userProfile) {
        this.logger.warn(`Could not build user profile for student ${studentId}, cannot query database (IS_ADS_FROM_DB=true)`);
        return {
          success: false,
          deliveryMethod: 'database',
          reason: 'Could not build user profile for database query',
          timestamp: getCurrentSriLankaTime()
        };
      }

      // Find matching advertisements
      const matches = await this.advertisementMatchingService.findMostMatchingAdvertisements(userProfile, 3);
      
      if (matches.length === 0) {
        this.logger.warn(`No matching advertisements found in database for student ${studentId}, not using default (IS_ADS_FROM_DB=true)`);
        return {
          success: false,
          deliveryMethod: 'database',
          reason: 'No matching advertisements in database',
          timestamp: getCurrentSriLankaTime()
        };
      }

      // Select the best match
      const bestMatch = matches[0];
      
      return {
        success: true,
        advertisementId: bestMatch.advertisement.id,
        advertisementTitle: bestMatch.advertisement.title,
        advertisementUrl: bestMatch.advertisement.mediaUrl,
        advertisementContent: bestMatch.advertisement.description || '',
        advertisementMediaType: bestMatch.advertisement.mediaType || 'image',
        advertisementSendingUrl: bestMatch.advertisement.sendingUrl,
        supportivePlatforms: bestMatch.advertisement.supportivePlatforms || [],
        modeOfSending: bestMatch.advertisement.modeOfSending || [],
        matchScore: bestMatch.matchScore,
        deliveryMethod: 'database',
        timestamp: getCurrentSriLankaTime()
      };

    } catch (error) {
      this.logger.error(`Error selecting database advertisement for student ${studentId}`, error);
      return {
        success: false,
        deliveryMethod: 'database',
        reason: `Database query error: ${error.message}`,
        timestamp: getCurrentSriLankaTime()
      };
    }
  }

  /**
   * Select default advertisement from environment variables
   */
  private selectDefaultAdvertisement(): AdvertisementDeliveryResult {
    return {
      success: true,
      advertisementTitle: this.defaultAdTitle,
      advertisementUrl: this.defaultAdMediaUrl,
      advertisementContent: this.defaultAdContent,
      supportivePlatforms: [],
      modeOfSending: [],
      deliveryMethod: 'default',
      timestamp: getCurrentSriLankaTime()
    };
  }

  /**
   * Build user profile for advertisement matching
   */
  private async buildUserProfile(studentId: string, subscriptionPlan: string): Promise<UserProfile | null> {
    try {
      // Fetch student with related user and parent data
      const student = await this.studentRepository.findOne({
        where: { userId: studentId },
        relations: ['user', 'father', 'mother', 'guardian', 'father.user', 'mother.user', 'guardian.user'],
        select: {
          userId: true,
          user: {
            id: true,
            city: true,
            province: true,
            district: true,
            dateOfBirth: true,
            gender: true,
            userType: true
          },
          father: {
            userId: true,
            occupation: true,
            user: {
              id: true,
              city: true,
              province: true
            }
          },
          mother: {
            userId: true,
            occupation: true
          },
          guardian: {
            userId: true,
            occupation: true
          }
        }
      });

      if (!student || !student.user) {
        this.logger.warn(`Student ${studentId} not found or missing user data`);
        return null;
      }

      // Extract birth year from dateOfBirth
      const birthYear = student.user.dateOfBirth 
        ? new Date(student.user.dateOfBirth).getFullYear() 
        : undefined;

      // Use parent data if available, otherwise use student data
      const parentData = student.father || student.mother || student.guardian;

      // ✅ FIXED: Query institute_users to get actual instituteId for ad targeting
      let instituteId: string | undefined;
      try {
        const instituteUser = await this.instituteUserRepository.findOne({
          where: { userId: studentId, status: 'ACTIVE' as any },
          select: ['instituteId'],
          order: { instituteId: 'ASC' },
        });
        instituteId = instituteUser?.instituteId;
      } catch (err) {
        this.logger.warn(`Could not fetch instituteId for user ${studentId}: ${err.message}`);
      }

      return {
        userId: studentId,
        userType: student.user.userType as any,
        subscriptionPlan: subscriptionPlan as any,
        instituteId,
        city: student.user.city || parentData?.user?.city,
        province: student.user.province || parentData?.user?.province,
        district: student.user.district,
        birthYear: birthYear,
        gender: student.user.gender,
        occupation: parentData?.occupation
      };

    } catch (error) {
      this.logger.error(`Error building user profile for student ${studentId}`, error);
      return null;
    }
  }

  /**
   * Check if advertisements are enabled for subscription plan
   * ✅ Uses isAds flag from notification-packages.config to respect plan settings
   */
  private isAdvertisementEnabled(subscriptionPlan: string): boolean {
    if (!this.adsDeliveryEnabled) return false;
    const packageConfig = NOTIFICATION_PACKAGES_CONFIG.packages[subscriptionPlan?.toUpperCase()];
    return packageConfig?.isAds !== false;
  }

  /**
   * Record advertisement impression (view)
   * ✅ FIXED: Uses atomic increment() instead of findOne+save to prevent race conditions.
   * Only increments impressionCount here — currentSendings is tracked separately
   * by AdvertisementCacheService.trackSending() to avoid double-counting.
   */
  private async recordAdvertisementImpression(advertisementId: string, studentId: string): Promise<void> {
    try {
      await this.advertisementRepository.increment(
        { id: advertisementId },
        'impressionCount',
        1,
      );
    } catch (error) {
      this.logger.warn(`Failed to record impression for ad ${advertisementId}: ${error.message}`);
    }
  }

  /**
   * Record advertisement click (when user interacts)
   * ✅ FIXED: Uses atomic increment() instead of findOne+save to prevent race conditions.
   */
  async recordAdvertisementClick(advertisementId: string, studentId: string): Promise<boolean> {
    try {
      const result = await this.advertisementRepository.increment(
        { id: advertisementId },
        'clickCount',
        1,
      );
      return (result.affected ?? 0) > 0;
    } catch (error) {
      this.logger.warn(`Failed to record click for ad ${advertisementId}: ${error.message}`);
      return false;
    }
  }

  /**
   * Get advertisement delivery statistics
   */
  async getDeliveryStatistics(startDate?: Date, endDate?: Date): Promise<any> {
    try {
      const queryBuilder = this.advertisementRepository
        .createQueryBuilder('ad')
        .select([
          'ad.id',
          'ad.title',
          'ad.currentSendings',
          'ad.maxSendings',
          'ad.impressionCount',
          'ad.clickCount',
          'ad.priority',
          'ad.isActive'
        ]);

      if (startDate) {
        queryBuilder.andWhere('ad.createdAt >= :startDate', { startDate });
      }

      if (endDate) {
        queryBuilder.andWhere('ad.createdAt <= :endDate', { endDate });
      }

      const advertisements = await queryBuilder.getMany();

      const totalImpressions = advertisements.reduce((sum, ad) => sum + ad.impressionCount, 0);
      const totalClicks = advertisements.reduce((sum, ad) => sum + ad.clickCount, 0);
      const totalSendings = advertisements.reduce((sum, ad) => sum + ad.currentSendings, 0);

      return {
        totalAdvertisements: advertisements.length,
        activeAdvertisements: advertisements.filter(ad => ad.isActive).length,
        totalImpressions,
        totalClicks,
        totalSendings,
        averageCTR: totalImpressions > 0 ? (totalClicks / totalImpressions * 100).toFixed(2) : 0,
        deliveryMode: this.isAdsFromDatabase ? 'database' : 'default',
        advertisements: advertisements.map(ad => ({
          id: ad.id,
          title: ad.title,
          impressions: ad.impressionCount,
          clicks: ad.clickCount,
          sendings: ad.currentSendings,
          maxSendings: ad.maxSendings,
          ctr: ad.impressionCount > 0 ? ((ad.clickCount / ad.impressionCount) * 100).toFixed(2) : 0,
          completionRate: ad.maxSendings > 0 ? ((ad.currentSendings / ad.maxSendings) * 100).toFixed(2) : 0
        }))
      };

    } catch (error) {
      this.logger.error('Error getting delivery statistics', error);
      return null;
    }
  }

  /**
   * Get configuration and status information
   */
  getConfiguration(): any {
    return {
      mode: this.isAdsFromDatabase ? 'database' : 'default',
      databaseEnabled: this.isAdsFromDatabase,
      defaultAd: {
        title: this.defaultAdTitle,
        content: this.defaultAdContent,
        mediaUrl: this.defaultAdMediaUrl
      }
    };
  }

  /**
   * Get advertisement deliveries linked to attendance records for a specific user.
   */
  async getUserAdvertisementDeliveryHistory(params: {
    userId: string;
    instituteId?: string;
    startDate?: string;
    endDate?: string;
    limit?: number;
  }): Promise<{
    totalDeliveries: number;
    uniqueAdvertisements: number;
    deliveries: Array<{
      attendanceDate: string;
      attendanceTimestamp: number;
      instituteId: string;
      advertisementId: string;
      advertisementTitle: string | null;
    }>;
  }> {
    const userId = String(params.userId || '').trim();
    if (!userId) {
      return { totalDeliveries: 0, uniqueAdvertisements: 0, deliveries: [] };
    }

    const limit = Math.max(1, Math.min(1000, Number(params.limit) || 200));

    const conditions: string[] = [
      'ar.student_id = ?',
      'ar.advertisement_id IS NOT NULL',
      "TRIM(ar.advertisement_id) <> ''",
    ];
    const queryParams: any[] = [userId];

    if (params.instituteId) {
      conditions.push('ar.institute_id = ?');
      queryParams.push(params.instituteId);
    }
    if (params.startDate) {
      conditions.push('ar.date >= ?');
      queryParams.push(params.startDate);
    }
    if (params.endDate) {
      conditions.push('ar.date <= ?');
      queryParams.push(params.endDate);
    }

    queryParams.push(limit);

    const rows = await this.dataSource.query(
      `
      SELECT
        ar.date AS attendanceDate,
        ar.timestamp AS attendanceTimestamp,
        ar.institute_id AS instituteId,
        ar.advertisement_id AS advertisementId,
        ad.title AS advertisementTitle
      FROM attendance_records ar
      LEFT JOIN advertisements ad ON ad.id = ar.advertisement_id
      WHERE ${conditions.join(' AND ')}
      ORDER BY ar.timestamp DESC
      LIMIT ?
      `,
      queryParams,
    );

    const deliveries = (rows || []).map((row: any) => ({
      attendanceDate: String(row.attendanceDate),
      attendanceTimestamp: Number(row.attendanceTimestamp || 0),
      instituteId: String(row.instituteId || ''),
      advertisementId: String(row.advertisementId || ''),
      advertisementTitle: row.advertisementTitle || null,
    }));

    return {
      totalDeliveries: deliveries.length,
      uniqueAdvertisements: new Set(deliveries.map(d => d.advertisementId)).size,
      deliveries,
    };
  }
}




