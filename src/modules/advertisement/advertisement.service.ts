import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AdvertisementEntity, MediaType } from './entities/advertisement.entity';
import { UserType } from '../user/enums/user-type.enum';
import { Gender } from '../user/enums/gender.enum';
import { SubscriptionPlan } from '../user/enums/subscription-plan.enum';
import { AdvertisementResponseDto, AdvertisementListResponseDto, CreateAdvertisementDto } from './dto/advertisement.dto';
import { ManualAdvertisementSendDto, BulkManualAdvertisementSendDto, ManualSendResponseDto, ManualSendTargetType } from './dto/manual-advertisement.dto';
import { getCurrentSriLankaDate, formatSriLankaTime, now } from '../../common/utils/timezone.util';
import { UserEntity } from '../user/entities/user.entity';
import { StudentEntity } from '../student/entities/student.entity';
import { ParentEntity } from '../parent/entities/parent.entity';
import { AttendanceNotificationService } from '../attendance/services/attendance-notification.service';
import { AdvertisementCacheService } from './services/advertisement-cache.service';
import { CloudStorageService } from '../../common/services/cloud-storage.service';

@Injectable()
export class AdvertisementService {
  private readonly logger = new Logger(AdvertisementService.name);

  constructor(
    @InjectRepository(AdvertisementEntity)
    private advertisementRepository: Repository<AdvertisementEntity>,
    @InjectRepository(UserEntity)
    private userRepository: Repository<UserEntity>,
    @InjectRepository(StudentEntity)
    private studentRepository: Repository<StudentEntity>,
    @InjectRepository(ParentEntity)
    private parentRepository: Repository<ParentEntity>,
    private readonly attendanceNotificationService: AttendanceNotificationService,
    private readonly advertisementCacheService: AdvertisementCacheService,
    private readonly cloudStorageService: CloudStorageService,
  ) {}

  async findAll(): Promise<AdvertisementEntity[]> {
    try {
      return await this.advertisementRepository.find({
        select: [
          'id',
          'title',
          'description', 
          'mediaUrl',
          'mediaType',
          'targetUserTypes',
          'targetGenders',
          'minBornYear',
          'maxBornYear',
          'targetSubscriptionPlans',
          'priority',
          'isActive',
          'startDate',
          'endDate',
          'maxSendings',
          'currentSendings',
          'supportivePlatforms',
          'modeOfSending',
          'createdAt',
          'updatedAt'
        ],
        order: { priority: 'DESC', createdAt: 'DESC' },
        take: 100
      });
    } catch (error) {
      this.logger.error(`Failed to fetch advertisements: ${error.message}`, error.stack);
      return [];
    }
  }

  /**
   * PERF-B FIX: Route through the cache service instead of issuing an uncached
   * DB query on every public /active request. The cache service owns the canonical
   * active-ads query (same filters) and a shared TTL, so the matching path and the
   * public endpoint now hit the same warm cache.
   */
  async findActive(): Promise<AdvertisementEntity[]> {
    try {
      return await this.advertisementCacheService.getActiveAdvertisements();
    } catch (error) {
      this.logger.error(`Failed to fetch active advertisements: ${error.message}`, error.stack);
      return [];
    }
  }

  async create(createDto: CreateAdvertisementDto): Promise<AdvertisementEntity> {
    // BUG-B FIX: use now() (real UTC). getCurrentSriLankaISO() produced a fake-UTC
    // value that, combined with mysql2 timezone:'+05:30', double-offset createdAt
    // by ~5h30m and made freshness/age math wrong.
    const timestamp = now();
    const advertisement = this.advertisementRepository.create({
        title: createDto.title,
        accessKey: createDto.accessKey,
        description: createDto.description,
        mediaUrl: createDto.mediaUrl,
        landingUrl: createDto.landingUrl,
        sendingUrl: createDto.sendingUrl,
        supportivePlatforms: createDto.supportivePlatforms || [],
        modeOfSending: createDto.modeOfSending || [],
        mediaType: createDto.mediaType || MediaType.IMAGE,
        targetInstituteIds: createDto.targetInstituteIds || [],
        targetCities: createDto.targetCities || [],
        targetProvinces: createDto.targetProvinces || [],
        targetDistricts: createDto.targetDistricts || [],
        minBornYear: createDto.minBornYear,
        maxBornYear: createDto.maxBornYear,
        targetGenders: createDto.targetGenders || [],
        targetOccupations: createDto.targetOccupations || [],
        targetUserTypes: createDto.targetUserTypes || [],
        targetSubscriptionPlans: createDto.targetSubscriptionPlans || [],
        displayDuration: createDto.displayDuration || 30,
        priority: createDto.priority || 1,
        isActive: createDto.isActive !== false,
        startDate: createDto.startDate,
        endDate: createDto.endDate,
        maxSendings: createDto.maxSendings || 1000,
        currentSendings: 0,
        cascadeToParents: createDto.cascadeToParents || false,
        budget: createDto.budget,
        costPerClick: createDto.costPerClick,
        costPerImpression: createDto.costPerImpression,
        createdAt: timestamp,
        updatedAt: timestamp,
        createdBy: createDto.createdBy || 'system'
      });

      const saved = await this.advertisementRepository.save(advertisement);
      
      // Invalidate cache after creating new advertisement
      await this.advertisementCacheService.invalidateCache();
      
      return saved;
  }

  async findOne(id: string): Promise<AdvertisementEntity | null> {
    try {
      return await this.advertisementRepository.findOne({ where: { id } });
    } catch (error) {
      this.logger.error(`Failed to find advertisement ${id}: ${error.message}`, error.stack);
      return null;
    }
  }

  async update(id: string, updateDto: Partial<CreateAdvertisementDto>): Promise<AdvertisementEntity | null> {
    const updateData: Partial<AdvertisementEntity> = {};
      
      if (updateDto.title !== undefined) updateData.title = updateDto.title;
      if (updateDto.accessKey !== undefined) updateData.accessKey = updateDto.accessKey;
      if (updateDto.description !== undefined) updateData.description = updateDto.description;
      if (updateDto.mediaUrl !== undefined) updateData.mediaUrl = updateDto.mediaUrl;
      if (updateDto.landingUrl !== undefined) updateData.landingUrl = updateDto.landingUrl;
      if (updateDto.sendingUrl !== undefined) updateData.sendingUrl = updateDto.sendingUrl;
      if (updateDto.supportivePlatforms !== undefined) updateData.supportivePlatforms = updateDto.supportivePlatforms;
      if (updateDto.modeOfSending !== undefined) updateData.modeOfSending = updateDto.modeOfSending;
      if (updateDto.mediaType !== undefined) updateData.mediaType = updateDto.mediaType;
      if (updateDto.targetInstituteIds !== undefined) updateData.targetInstituteIds = updateDto.targetInstituteIds;
      if (updateDto.targetCities !== undefined) updateData.targetCities = updateDto.targetCities;
      if (updateDto.targetProvinces !== undefined) updateData.targetProvinces = updateDto.targetProvinces;
      if (updateDto.targetDistricts !== undefined) updateData.targetDistricts = updateDto.targetDistricts;
      if (updateDto.minBornYear !== undefined) updateData.minBornYear = updateDto.minBornYear;
      if (updateDto.maxBornYear !== undefined) updateData.maxBornYear = updateDto.maxBornYear;
      if (updateDto.targetGenders !== undefined) updateData.targetGenders = updateDto.targetGenders;
      if (updateDto.targetOccupations !== undefined) updateData.targetOccupations = updateDto.targetOccupations;
      if (updateDto.targetUserTypes !== undefined) updateData.targetUserTypes = updateDto.targetUserTypes;
      if (updateDto.targetSubscriptionPlans !== undefined) updateData.targetSubscriptionPlans = updateDto.targetSubscriptionPlans;
      if (updateDto.displayDuration !== undefined) updateData.displayDuration = updateDto.displayDuration;
      if (updateDto.priority !== undefined) updateData.priority = updateDto.priority;
      if (updateDto.isActive !== undefined) updateData.isActive = updateDto.isActive;
      if (updateDto.startDate !== undefined) updateData.startDate = new Date(updateDto.startDate);
      if (updateDto.endDate !== undefined) updateData.endDate = new Date(updateDto.endDate);
      if (updateDto.maxSendings !== undefined) updateData.maxSendings = updateDto.maxSendings;
      if (updateDto.cascadeToParents !== undefined) updateData.cascadeToParents = updateDto.cascadeToParents;
      if (updateDto.budget !== undefined) updateData.budget = updateDto.budget;
      if (updateDto.costPerClick !== undefined) updateData.costPerClick = updateDto.costPerClick;
      if (updateDto.costPerImpression !== undefined) updateData.costPerImpression = updateDto.costPerImpression;

      await this.advertisementRepository.update(id, updateData);
      const updated = await this.findOne(id);
      
      // Invalidate cache after updating advertisement
      await this.advertisementCacheService.invalidateCache();
      
      return updated;
  }

  async remove(id: string): Promise<void> {
    await this.advertisementRepository.delete(id);
    await this.advertisementCacheService.invalidateCache();
  }

  // ========================================
  // ENTITY TO DTO TRANSFORMATION METHODS
  // ========================================

  private transformEntityToDto(entity: AdvertisementEntity): AdvertisementResponseDto {
    if (!entity) {
      throw new Error('Advertisement entity is null or undefined');
    }

    return {
      id: entity.id || '',
      title: entity.title || '',
      accessKey: entity.accessKey || '',
      description: entity.description || '',
      mediaUrl: this.cloudStorageService.getFullUrl(entity.mediaUrl) || '',
      landingUrl: entity.landingUrl || null,
      sendingUrl: entity.sendingUrl || null,
      supportivePlatforms: Array.isArray(entity.supportivePlatforms) ? entity.supportivePlatforms : [],
      modeOfSending: Array.isArray(entity.modeOfSending) ? entity.modeOfSending : [],
      mediaType: entity.mediaType || MediaType.IMAGE,
      targetInstituteIds: Array.isArray(entity.targetInstituteIds) ? entity.targetInstituteIds : [],
      targetCities: Array.isArray(entity.targetCities) ? entity.targetCities : [],
      targetProvinces: Array.isArray(entity.targetProvinces) ? entity.targetProvinces : [],
      targetDistricts: Array.isArray(entity.targetDistricts) ? entity.targetDistricts : [],
      minBornYear: entity.minBornYear || null,
      maxBornYear: entity.maxBornYear || null,
      targetGenders: Array.isArray(entity.targetGenders) ? entity.targetGenders : [],
      targetOccupations: Array.isArray(entity.targetOccupations) ? entity.targetOccupations : [],
      targetUserTypes: Array.isArray(entity.targetUserTypes) ? entity.targetUserTypes : [],
      targetSubscriptionPlans: Array.isArray(entity.targetSubscriptionPlans) ? entity.targetSubscriptionPlans : [],
      displayDuration: entity.displayDuration || 30,
      priority: entity.priority || 1,
      isActive: entity.isActive !== undefined ? entity.isActive : true,
      maxSendings: entity.maxSendings || 1000,
      cascadeToParents: entity.cascadeToParents || false,  // 🎯 Include cascade flag
      startDate: entity.startDate,
      endDate: entity.endDate,
      impressions: entity.impressionCount || 0,
      clicks: entity.clickCount || 0,
      sends: entity.currentSendings || 0,
      costPerClick: entity.costPerClick || null,
      costPerImpression: entity.costPerImpression || null,
      createdBy: entity.createdBy || 'system',
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
    };
  }

  async findAllAsDto(page: number = 1, limit: number = 10): Promise<AdvertisementListResponseDto> {
    const skip = (page - 1) * limit;
    const [entities, total] = await this.advertisementRepository.findAndCount({
      skip,
      take: limit,
      order: { createdAt: 'DESC' }
    });

    return {
      advertisements: entities.map(entity => this.transformEntityToDto(entity)),
      total,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      limit
    };
  }

  async findOneAsDto(id: string): Promise<AdvertisementResponseDto | null> {
    const entity = await this.findOne(id);
    return entity ? this.transformEntityToDto(entity) : null;
  }

  async createAsDto(createDto: CreateAdvertisementDto): Promise<AdvertisementResponseDto> {
    const entity = await this.create(createDto);
    return this.transformEntityToDto(entity);
  }

  async updateAsDto(id: string, updateDto: Partial<CreateAdvertisementDto>): Promise<AdvertisementResponseDto | null> {
    const entity = await this.update(id, updateDto);
    return entity ? this.transformEntityToDto(entity) : null;
  }

  // Legacy method names for backward compatibility
  async createAdvertisement(createDto: CreateAdvertisementDto): Promise<AdvertisementEntity> {
    return this.create(createDto);
  }

  async getAllAdvertisements(): Promise<AdvertisementEntity[]> {
    return this.findAll();
  }

  async getActiveAdvertisements(): Promise<AdvertisementEntity[]> {
    return this.findActive();
  }

  async getAdvertisement(id: string): Promise<AdvertisementEntity | null> {
    return this.findOne(id);
  }

  async updateAdvertisement(id: string, updateDto: Partial<CreateAdvertisementDto>): Promise<AdvertisementEntity | null> {
    return this.update(id, updateDto);
  }

  async deleteAdvertisement(id: string): Promise<void> {
    return this.remove(id);
  }

  // ========================================
  // 🎯 MANUAL ADVERTISEMENT SENDING METHODS
  // ========================================

  /**
   * 📤 Send advertisement manually to targeted users
   * Delivery channels are determined by the ad's supportivePlatforms array.
   * Subscription plan is NOT used for channel filtering — only for other features (marks, etc.)
   */
  async sendAdvertisementManually(sendDto: ManualAdvertisementSendDto, adminUserId: string): Promise<ManualSendResponseDto> {
    try {
      
      // 1. Validate advertisement exists and is active
      const advertisement = await this.findOne(sendDto.advertisementId);
      if (!advertisement) {
        throw new NotFoundException('Advertisement not found');
      }

      if (!advertisement.isActive) {
        throw new BadRequestException('Cannot send inactive advertisement');
      }

      // 2. Validate ad has delivery channels configured
      // modeOfSending is the primary delivery channel selector; supportivePlatforms is fallback
      const deliveryChannels = (advertisement.modeOfSending && advertisement.modeOfSending.length > 0)
        ? advertisement.modeOfSending
        : (advertisement.supportivePlatforms || []);
      if (deliveryChannels.length === 0) {
        throw new BadRequestException('Advertisement has no delivery channels configured. Set modeOfSending or supportivePlatforms.');
      }

      // 3. Get targeted users based on criteria
      const targetedUsers = await this.getTargetedUsers(sendDto);

      if (targetedUsers.length === 0) {
        return {
          success: true,
          message: 'No users match the targeting criteria',
          data: {
            campaignId: `manual-${Date.now()}`,
            totalTargeted: 0,
            totalSent: 0,
            totalFailed: 0,
            failedUsers: [],
            sentUsers: [],
            packageBreakdown: {}
          }
        };
      }

      // 4. Build plan breakdown for analytics (no filtering — all targeted users are eligible)
      const packageBreakdown = this.buildPlanBreakdown(targetedUsers);
      
      // 5. Send advertisements to ALL targeted users using ad's supportivePlatforms
      const sendResults = await this.sendAdvertisementToUsers(advertisement, targetedUsers, sendDto.message);

      // 6. Update plan breakdown with actual results
      for (const userId of sendResults.sentUsers) {
        const user = targetedUsers.find(u => u.id === userId);
        if (user) {
          const plan = user.subscriptionPlan || 'BASIC';
          if (packageBreakdown[plan]) packageBreakdown[plan].sent++;
        }
      }
      for (const userId of sendResults.failedUsers) {
        const user = targetedUsers.find(u => u.id === userId);
        if (user) {
          const plan = user.subscriptionPlan || 'BASIC';
          if (packageBreakdown[plan]) packageBreakdown[plan].failed++;
        }
      }

      // 7. Update advertisement send count
      await this.advertisementRepository.increment(
        { id: advertisement.id },
        'currentSendings',
        sendResults.sentUsers.length
      );

      const campaignId = `manual-${Date.now()}-${adminUserId}`;
      
      return {
        success: true,
        message: `Advertisement sent to ${sendResults.sentUsers.length} users via [${deliveryChannels.join(', ')}]`,
        data: {
          campaignId,
          totalTargeted: targetedUsers.length,
          totalSent: sendResults.sentUsers.length,
          totalFailed: sendResults.failedUsers.length,
          failedUsers: sendResults.failedUsers,
          sentUsers: sendResults.sentUsers,
          packageBreakdown
        }
      };

    } catch (error) {
      this.logger.error(`❌ Manual ad send error: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * 📤📤 Send multiple advertisements in bulk with scheduling support
   */
  async sendBulkAdvertisementsManually(bulkSendDto: BulkManualAdvertisementSendDto, adminUserId: string): Promise<ManualSendResponseDto[]> {
    try {
      
      const results: ManualSendResponseDto[] = [];

      for (const campaign of bulkSendDto.campaigns) {
        try {
          const result = await this.sendAdvertisementManually(campaign, adminUserId);
          results.push(result);
        } catch (error) {
          this.logger.error(`❌ Failed to send campaign for ad ${campaign.advertisementId}: ${error.message}`);
          results.push({
            success: false,
            message: `Failed to send advertisement: ${error.message}`,
            data: {
              campaignId: `failed-${Date.now()}`,
              totalTargeted: 0,
              totalSent: 0,
              totalFailed: 0,
              failedUsers: [],
              sentUsers: [],
              packageBreakdown: {}
            }
          });
        }
      }

      return results;
    } catch (error) {
      this.logger.error(`❌ Bulk manual ad send error: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * 🎯 Get users based on targeting criteria
   */
  private async getTargetedUsers(sendDto: ManualAdvertisementSendDto): Promise<UserEntity[]> {
    let query = this.userRepository.createQueryBuilder('user');

    switch (sendDto.targetType) {
      case ManualSendTargetType.ALL_USERS:
        // Get all active users
        query = query.where('user.isActive = :isActive', { isActive: true });
        break;

      case ManualSendTargetType.SPECIFIC_USERS:
        if (!sendDto.specificUserIds || sendDto.specificUserIds.length === 0) {
          throw new BadRequestException('Specific user IDs are required for specific users target type');
        }
        query = query
          .where('user.id IN (:...userIds)', { userIds: sendDto.specificUserIds })
          .andWhere('user.isActive = :isActive', { isActive: true });
        break;

      case ManualSendTargetType.INSTITUTE_USERS:
        if (!sendDto.instituteIds || sendDto.instituteIds.length === 0) {
          throw new BadRequestException('Institute IDs are required for institute users target type');
        }
        query = query
          .where('user.instituteId IN (:...instituteIds)', { instituteIds: sendDto.instituteIds })
          .andWhere('user.isActive = :isActive', { isActive: true });
        break;

      case ManualSendTargetType.SUBSCRIPTION_PLAN_USERS:
        if (!sendDto.subscriptionPlans || sendDto.subscriptionPlans.length === 0) {
          throw new BadRequestException('Subscription plans are required for subscription plan users target type');
        }
        query = query
          .where('user.subscriptionPlan IN (:...plans)', { plans: sendDto.subscriptionPlans })
          .andWhere('user.isActive = :isActive', { isActive: true });
        break;

      case ManualSendTargetType.PARENT_USERS:
        query = query
          .where('user.userType = :userType', { userType: 'PARENT' })
          .andWhere('user.isActive = :isActive', { isActive: true });
        break;

      case ManualSendTargetType.STUDENT_USERS:
        query = query
          .where('user.userType = :userType', { userType: 'STUDENT' })
          .andWhere('user.isActive = :isActive', { isActive: true });
        break;

      default:
        throw new BadRequestException('Invalid target type');
    }

    // Select necessary fields for notification
    return await query
      .select([
        'user.id',
        'user.firstName',
        'user.lastName',
        'user.email',
        'user.phoneNumber',
        'user.telegramId',
        'user.subscriptionPlan',
        'user.userType'
      ])
      .limit(10000) // Safety limit
      .getMany();
  }

  /**
   * 📦 Build subscription plan breakdown for analytics
   * NOTE: Subscription plan is NOT used for ad delivery filtering.
   * Delivery channels come from ad.supportivePlatforms.
   * This method only groups users by plan for reporting purposes.
   */
  private buildPlanBreakdown(
    users: UserEntity[]
  ): { [packageName: string]: { targeted: number; sent: number; failed: number } } {
    const packageBreakdown: { [packageName: string]: { targeted: number; sent: number; failed: number } } = {};

    for (const user of users) {
      const subscriptionPlan = user.subscriptionPlan || 'BASIC';
      if (!packageBreakdown[subscriptionPlan]) {
        packageBreakdown[subscriptionPlan] = { targeted: 0, sent: 0, failed: 0 };
      }
      packageBreakdown[subscriptionPlan].targeted++;
    }

    return packageBreakdown;
  }

  /**
   * 📱 Send advertisement to users via the ad's delivery channels
   * PERF-1 FIX: Sends in concurrent batches of 20 instead of serially to every user.
   * This dramatically reduces total delivery time for large audiences.
   */
  private async sendAdvertisementToUsers(
    advertisement: AdvertisementEntity,
    users: UserEntity[],
    customMessage?: string,
  ): Promise<{ sentUsers: string[]; failedUsers: string[] }> {
    const sentUsers: string[] = [];
    const failedUsers: string[] = [];
    const BATCH_SIZE = 20; // concurrent sends per batch
    // modeOfSending is the primary delivery channel selector; supportivePlatforms is fallback
    const deliveryChannels = (advertisement.modeOfSending && advertisement.modeOfSending.length > 0)
      ? advertisement.modeOfSending
      : (advertisement.supportivePlatforms || []);

    this.logger.log(`📡 Delivering ad "${advertisement.title}" via channels: [${deliveryChannels.join(', ')}] to ${users.length} users (batch size: ${BATCH_SIZE})`);

    // Process in batches of BATCH_SIZE for concurrency
    for (let i = 0; i < users.length; i += BATCH_SIZE) {
      const batch = users.slice(i, i + BATCH_SIZE);

      const batchResults = await Promise.allSettled(
        batch.map(async (user) => {
          const notificationData = {
            studentId: user.id,
            studentName: user.nameWithInitials || `${user.firstName} ${user.lastName || ''}`.trim(),
            parentContact: user.phoneNumber || null,
            parentEmail: user.email || null,
            parentTelegramId: user.telegramId || null,
            attendanceStatus: 'PRESENT' as 'PRESENT' | 'ABSENT',
            date: getCurrentSriLankaDate(),
            time: formatSriLankaTime(new Date()), // new Date() = real UTC; formatSriLankaTime applies Asia/Colombo correctly
            vehicleNumber: null,
            bookhireName: null,
            subscriptionPlan: user.subscriptionPlan || 'BASIC',
            advertisementData: {
              id: advertisement.id,
              mediaUrl: advertisement.mediaUrl,
              mediaType: advertisement.mediaType,
              title: advertisement.title,
              content: customMessage || advertisement.description || `Check out our latest update!`,
              sendingUrl: advertisement.sendingUrl || undefined,
              supportivePlatforms: advertisement.supportivePlatforms || [],
              modeOfSending: advertisement.modeOfSending || [],
            }
          };
          await this.attendanceNotificationService.sendAttendanceNotification(notificationData);
          return user.id;
        })
      );

      for (let j = 0; j < batchResults.length; j++) {
        const result = batchResults[j];
        const user = batch[j];
        if (result.status === 'fulfilled') {
          sentUsers.push(user.id);
        } else {
          failedUsers.push(user.id);
          this.logger.error(`❌ Failed to send advertisement to user ${user.id}: ${result.reason?.message}`);
        }
      }
    }

    return { sentUsers, failedUsers };
  }

  /**
   * 📊 Get manual sending analytics — real data from advertisement table
   * BUG-5 FIX: Previously returned all-zero stub data. Now queries real DB stats.
   */
  async getManualSendAnalytics(adminUserId: string, startDate?: string, endDate?: string): Promise<any> {
    try {
      const qb = this.advertisementRepository
        .createQueryBuilder('ad')
        .select([
          'ad.id',
          'ad.title',
          'ad.currentSendings',
          'ad.maxSendings',
          'ad.impressionCount',
          'ad.clickCount',
          'ad.isActive',
          'ad.createdBy',
          'ad.createdAt',
        ]);

      if (startDate) {
        qb.andWhere('ad.createdAt >= :startDate', { startDate: new Date(startDate) });
      }
      if (endDate) {
        qb.andWhere('ad.createdAt <= :endDate', { endDate: new Date(endDate) });
      }

      const ads = await qb.orderBy('ad.currentSendings', 'DESC').getMany();

      const totalCampaigns = ads.length;
      const totalUsersSent = ads.reduce((sum, ad) => sum + (ad.currentSendings || 0), 0);
      const totalImpressions = ads.reduce((sum, ad) => sum + (ad.impressionCount || 0), 0);
      const totalClicks = ads.reduce((sum, ad) => sum + (ad.clickCount || 0), 0);

      return {
        success: true,
        message: 'Manual send analytics retrieved',
        data: {
          totalCampaigns,
          totalUsersSent,
          totalImpressions,
          totalClicks,
          averageCTR: totalImpressions > 0
            ? parseFloat(((totalClicks / totalImpressions) * 100).toFixed(2))
            : 0,
          topPerformingAds: ads.slice(0, 10).map(ad => ({
            id: ad.id,
            title: ad.title,
            sends: ad.currentSendings,
            maxSendings: ad.maxSendings,
            impressions: ad.impressionCount,
            clicks: ad.clickCount,
            isActive: ad.isActive,
            completionPct: ad.maxSendings > 0
              ? parseFloat(((ad.currentSendings / ad.maxSendings) * 100).toFixed(1))
              : 0,
          })),
        },
      };
    } catch (error) {
      this.logger.error(`Error getting manual send analytics: ${error.message}`);
      throw error;
    }
  }

  /**
   * 🔍 Check advertisement sending (dry-run without actually sending)
   * Returns detailed info about what would happen if the ad was sent
   */
  async checkAdvertisementSending(sendDto: ManualAdvertisementSendDto): Promise<{
    success: boolean;
    message: string;
    data: {
      advertisement: any;
      targeting: {
        totalUsers: number;
        students: number;
        parents: number;
        byInstitute: Record<string, number>;
        bySubscriptionPlan: Record<string, number>;
      };
      delivery: {
        platforms: string[];
        eligibleUsers: number;
        ineligibleUsers: number;
        packageBreakdown: Record<string, any>;
      };
      execution: {
        estimatedDBQueries: number;
        estimatedExecutionTime: string;
        deliveryMode: string;
      };
    };
  }> {
    const startTime = Date.now();
    let dbQueryCount = 0;

    try {

      // Query 1: Get advertisement
      const advertisement = await this.findOne(sendDto.advertisementId);
      dbQueryCount++;

      if (!advertisement) {
        throw new NotFoundException('Advertisement not found');
      }

      // Query 2: Get targeted users
      const targetedUsers = await this.getTargetedUsers(sendDto);
      dbQueryCount++;

      // Calculate user breakdown by actual userType
      // BUG-6 FIX: Use correct UserType enum values instead of USER for both
      const students = targetedUsers.filter(u =>
        u.userType === UserType.USER ||
        u.userType === UserType.USER_WITHOUT_PARENT
      ).length;
      const parents = targetedUsers.filter(u =>
        u.userType === UserType.USER_WITHOUT_STUDENT
      ).length;

      // By institute
      const byInstitute: Record<string, number> = {};
      targetedUsers.forEach(u => {
        const inst = (u as any).instituteId || 'unknown';
        byInstitute[inst] = (byInstitute[inst] || 0) + 1;
      });

      // By subscription plan
      const bySubscriptionPlan: Record<string, number> = {};
      targetedUsers.forEach(u => {
        const plan = u.subscriptionPlan || 'FREE';
        bySubscriptionPlan[plan] = (bySubscriptionPlan[plan] || 0) + 1;
      });

      // Build plan breakdown for analytics (no channel filtering — all targeted users are eligible)
      const packageBreakdown = this.buildPlanBreakdown(targetedUsers);

      // Delivery channels: modeOfSending is primary, supportivePlatforms is fallback
      const deliveryChannels = (advertisement.modeOfSending && advertisement.modeOfSending.length > 0)
        ? advertisement.modeOfSending
        : (advertisement.supportivePlatforms || []);
      const deliveryMode = targetedUsers.length > 100 ? 'batch' : 'real-time';
      const estimatedTime = targetedUsers.length > 100 
        ? `${Math.ceil(targetedUsers.length / 50)} minutes` 
        : `${targetedUsers.length * 0.5} seconds`;

      return {
        success: true,
        message: 'Advertisement sending check completed',
        data: {
          advertisement: {
            id: advertisement.id,
            title: advertisement.title,
            mediaUrl: advertisement.mediaUrl,
            mediaType: advertisement.mediaType,
            isActive: advertisement.isActive,
            supportivePlatforms: deliveryChannels,
            modeOfSending: advertisement.modeOfSending || [],
          },
          targeting: {
            totalUsers: targetedUsers.length,
            students,
            parents,
            byInstitute,
            bySubscriptionPlan,
          },
          delivery: {
            platforms: deliveryChannels,
            eligibleUsers: targetedUsers.length,
            ineligibleUsers: 0,
            packageBreakdown,
          },
          execution: {
            estimatedDBQueries: dbQueryCount + (targetedUsers.length > 0 ? 1 : 0), // +1 for update query
            estimatedExecutionTime: estimatedTime,
            deliveryMode,
          },
        },
      };
    } catch (error) {
      this.logger.error(`❌ Check advertisement sending error: ${error.message}`);
      throw error;
    }
  }
}



