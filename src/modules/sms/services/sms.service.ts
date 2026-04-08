import { Injectable, Logger, BadRequestException, ForbiddenException, NotFoundException, InternalServerErrorException, OnModuleDestroy } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { v4 as uuidv4 } from 'uuid';

// Entities
import { InstituteSmsCredentialsEntity, SmsVerificationStage } from '../entities/institute-sms-credentials.entity';
import { InstituteSmsPaymentSubmissionEntity, PaymentSubmissionStatus } from '../entities/institute-sms-payment-submission.entity';
import { InstituteSmsMessageEntity, SmsMessageStatus, SmsMessageType, RecipientFilterType } from '../entities/institute-sms-message.entity';
import { UserEntity } from '../../user/entities/user.entity';
import { InstituteEntity } from '../../institute/entities/institute.entity';
import { InstituteUserEntity } from '../../institute_mudules/institue_user/entities/institue_user.entity';
import { InstituteClassStudentEntity } from '../../institute_class_modules/institute_class_student/entities/institute_class_student.entity';
import { InstituteClassSubjectEntity } from '../../institute_class_modules/institute_class_subject/entities/institute_class_subject.entity';
import { StudentEntity } from '../../student/entities/student.entity';
import { ParentEntity } from '../../parent/entities/parent.entity';

// DTOs
import {
  SendCustomSmsDto,
  SendBulkSmsDto,
  GetRecipientCountDto,
  SmsPaymentSubmissionDto,
  SmsResponseDto,
  RecipientCountResponseDto,
  PaymentSubmissionResponseDto,
  SmsCredentialsStatusDto,
  SmsStatisticsDto,
  SmsProcessingContextDto,
  SmsDeliveryResultDto,
  SmsRecipientFilterDto
} from '../dto/sms.dto';

// Services
import { NotificationLoggingService } from '../../../common/services/notification-logging.service';
import { SmsProviderService, BulkSmsResult } from './sms-provider.service';
import { EnhancedEmailService } from '../../../common/services/enhanced-email.service';
import { AsyncEmailService } from '../../../common/services/async-email.service';
import { CloudStorageService } from '../../../common/services/cloud-storage.service';
import { InstituteCreditsService } from '../../notification-credits/services/institute-credits.service';
import { CreditTransactionType } from '../../notification-credits/entities/institute-credit-transaction.entity';

// Interfaces
import { RecipientBreakdown } from '../interfaces/sms-internal.interface';

// Enums
import { UserType } from '../../user/enums/user-type.enum';
import { SmsMessageHistoryResponseDto } from '../dto/sms.dto';
import { now, nowTimestamp, getCurrentSriLankaISO } from '../../../common/utils/timezone.util';

/**
 * OPTIMIZED SMS SERVICE WITH LOCAL CACHING & DEFERRED CREDIT DEDUCTION
 * 
 * FEATURES:
 * 1. ✅ Local in-memory caching (no external dependencies)
 * 2. ✅ Fire-and-forget DynamoDB logging
 * 3. ✅ Deferred credit deduction after successful delivery
 * 4. ✅ Batch processing with optimal performance
 * 5. ✅ Background processing for non-blocking operations
 * 6. ✅ Comprehensive DTOs for type safety
 */

interface CacheItem<T> {
  data: T;
  timestamp: number;
  expires: number;
}

@Injectable()
export class SmsService implements OnModuleDestroy {
  private readonly logger = new Logger(SmsService.name);

  // LOCAL CACHING SYSTEM (with max-size limits to prevent memory leaks)
  private static readonly MAX_CACHE_ENTRIES = 5000;
  private readonly credentialsCache = new Map<string, CacheItem<InstituteSmsCredentialsEntity>>();
  private readonly recipientCache = new Map<string, CacheItem<any[]>>();
  private readonly countCache = new Map<string, CacheItem<RecipientCountResponseDto>>();
  private cacheCleanupInterval: ReturnType<typeof setInterval> | null = null;
  
  // CACHE CONFIGURATION
  // ⚡ OPTIMIZED: Short TTL for credentials (credits change frequently)
  private readonly CACHE_TTL = {
    CREDENTIALS: 120000,  // 2 minutes (credits change on every SMS send)
    RECIPIENTS: 900000,   // 15 minutes (moderate frequency)
    COUNT: 600000,        // 10 minutes (frequently queried)
  };

  private readonly BATCH_SIZE = 50;
  private readonly MAX_CONCURRENT_BATCHES = 5;

  constructor(
    @InjectRepository(InstituteSmsCredentialsEntity)
    private readonly smsCredentialsRepository: Repository<InstituteSmsCredentialsEntity>,
    @InjectRepository(InstituteSmsPaymentSubmissionEntity)
    private readonly paymentSubmissionRepository: Repository<InstituteSmsPaymentSubmissionEntity>,
    @InjectRepository(InstituteSmsMessageEntity)
    private readonly smsMessageRepository: Repository<InstituteSmsMessageEntity>,
    @InjectRepository(UserEntity)
    private readonly userRepository: Repository<UserEntity>,
    @InjectRepository(InstituteEntity)
    private readonly instituteRepository: Repository<InstituteEntity>,
    @InjectRepository(InstituteUserEntity)
    private readonly instituteUserRepository: Repository<InstituteUserEntity>,
    @InjectRepository(InstituteClassStudentEntity)
    private readonly instituteClassStudentRepository: Repository<InstituteClassStudentEntity>,
    @InjectRepository(InstituteClassSubjectEntity)
    private readonly instituteClassSubjectRepository: Repository<InstituteClassSubjectEntity>,
    @InjectRepository(StudentEntity)
    private readonly studentRepository: Repository<StudentEntity>,
    @InjectRepository(ParentEntity)
    private readonly parentRepository: Repository<ParentEntity>,
    private readonly dataSource: DataSource,
    private readonly configService: ConfigService,
    private readonly notificationLoggingService: NotificationLoggingService,
    private readonly smsProviderService: SmsProviderService,
    private readonly enhancedEmailService: EnhancedEmailService,
    private readonly asyncEmailService: AsyncEmailService,
    private readonly cloudStorageService: CloudStorageService,
    private readonly instituteCreditsService: InstituteCreditsService,
  ) {
    this.initializeCacheCleanup();
  }

  /**
   * 📱 Send SMS to custom numbers with deferred credit deduction
   * 
   * CREDIT FLOW:
   * 1. ✅ Check sufficient credits BEFORE sending (fail fast if insufficient)
   * 2. ✅ Create message record (status: QUEUED, credits_used: 0)
   * 3. ✅ Send SMS in background (non-blocking)
   * 4. ✅ Deduct credits ONLY after successful delivery
   * 5. ✅ Update message status and credits_used
   * 
   * This ensures credits are only deducted for successfully delivered messages.
   */
  async sendCustomSms(
    instituteId: string,
    userId: string,
    userType: UserType,
    dto: SendCustomSmsDto
  ): Promise<SmsResponseDto> {
    const startTime = nowTimestamp();

    try {
      // Validate inputs
      if (!instituteId) {
        throw new BadRequestException('Institute ID is required');
      }

      if (!userId) {
        throw new BadRequestException('User ID is required');
      }

      if (!dto.customRecipients || dto.customRecipients.length === 0) {
        throw new BadRequestException('At least one recipient is required');
      }

      if (!dto.messageTemplate?.trim()) {
        throw new BadRequestException('Message template is required');
      }

      // Normalize customRecipients - handle both "number" and "phoneNumber" fields
      dto.customRecipients = dto.customRecipients.map(recipient => ({
        ...recipient,
        number: recipient.number || recipient.phoneNumber || '',
      }));

      // Validate all recipients have phone numbers
      const missingNumbers = dto.customRecipients.filter(r => !r.number?.trim());
      if (missingNumbers.length > 0) {
        throw new BadRequestException('All recipients must have a phone number (use "number" or "phoneNumber" field)');
      }

      // 1. Validate credentials with caching
      const credentials = await this.getCachedCredentials(instituteId, userType);
      
      // 2. AUTHORIZATION CHECKS (BEFORE processing)
      
      // 2a. Validate mask authorization
      this.validateMaskAuthorization(credentials, dto.maskId);
      
      // 2b. Validate bulk send limit
      const maxBulkLimit = this.configService.get<number>('SMS_MAX_BULK_COUNT_DEFAULT', 1000);
      this.validateBulkLimit(dto.customRecipients.length, maxBulkLimit);
      
      // 2c. Validate sufficient credits (ONLY control mechanism - no daily/monthly tracking)
      await this.validateSufficientCredits(credentials, dto.customRecipients.length);

      // 3. Prepare recipients
      const recipients = dto.customRecipients.map(recipient => ({
        phoneNumber: this.normalizePhoneNumber(recipient.number),
        name: recipient.name || 'Customer',
        firstName: recipient.name?.split(' ')[0] || 'Customer',
        lastName: recipient.name?.split(' ').slice(1).join(' ') || '',
      }));

      // 4. Create message record (no credit deduction yet)
      const context: SmsProcessingContextDto = {
        instituteId,
        userId,
        userType,
        messageType: SmsMessageType.CUSTOM_NUMBERS,
        recipientFilterType: RecipientFilterType.CUSTOM,
        messageTemplate: dto.messageTemplate,
        recipients,
        credentials: {
          maskId: dto.maskId,
          displayName: dto.maskId,
          phoneNumber: '',
          isActive: credentials.isActive,
        },
        scheduledAt: dto.isNow ? now() : dto.scheduledAt,
        filterCriteria: { 
          recipientTypes: [RecipientFilterType.CUSTOM],
          customNumbers: dto.customRecipients, // ✅ Store custom recipients for later retrieval
          instituteId,
        },
        requestedMaskId: dto.maskId,
      };

      const messageRecord = await this.createMessageRecord(context);

      // 5. Messages are created with PENDING_VERIFICATION status
      // They will be processed only after admin approval via approveCampaign()
      // ✅ IMPORTANT: Even if isNow=true or scheduledAt is in the past,
      //    the message will ONLY send after admin approval
      //    When approved, it sends IMMEDIATELY regardless of scheduledAt time

      const processingTime = Date.now() - startTime;

      return {
        success: true,
        message: 'SMS created successfully. Awaiting admin approval. Will send immediately after approval regardless of scheduled time.',
        messageId: messageRecord.id,
        totalRecipients: recipients.length,
        status: SmsMessageStatus.PENDING_VERIFICATION,
        estimatedCredits: recipients.length,
        processingTime: `${processingTime}ms`
      };
    } catch (error) {
      this.logger.error(`❌ Error in sendCustomSms for institute ${instituteId}: ${error.message}`, error.stack);
      
      if (error instanceof BadRequestException || error instanceof ForbiddenException || error instanceof NotFoundException) {
        throw error;
      }
      
      throw new InternalServerErrorException(`Failed to send custom SMS: ${error.message}`);
    }
  }

  /**
   * 📢 Send bulk SMS with deferred credit deduction
   * 
   * CREDIT FLOW:
   * 1. ✅ Check sufficient credits BEFORE sending (fail fast if insufficient)
   * 2. ✅ Fetch and cache recipients (optimized queries)
   * 3. ✅ Create message record (status: QUEUED, credits_used: 0)
   * 4. ✅ Send SMS in background (non-blocking, batched processing)
   * 5. ✅ Deduct credits ONLY after successful delivery
   * 6. ✅ Update message status and credits_used
   * 
   * This ensures credits are only deducted for successfully delivered messages.
   */
  async sendBulkSms(
    instituteId: string,
    userId: string,
    userType: UserType,
    dto: SendBulkSmsDto
  ): Promise<SmsResponseDto> {
    const startTime = nowTimestamp();

    try {
      // Validate inputs
      if (!instituteId) {
        throw new BadRequestException('Institute ID is required');
      }

      if (!userId) {
        throw new BadRequestException('User ID is required');
      }

      if (!dto.recipientTypes || dto.recipientTypes.length === 0) {
        throw new BadRequestException('At least one recipient type is required');
      }

      if (!dto.messageTemplate?.trim()) {
        throw new BadRequestException('Message template is required');
      }

      // 1. Validate credentials with caching
      const credentials = await this.getCachedCredentials(instituteId, userType);

      // 2. Get recipients with caching
      const filterDto: SmsRecipientFilterDto = {
        recipientTypes: dto.recipientTypes,
        classIds: dto.classIds,
        subjectIds: dto.subjectIds
      };

      const recipients = await this.getCachedRecipients(instituteId, filterDto);
      
      if (recipients.length === 0) {
        throw new BadRequestException('No valid recipients found with the specified filters');
      }

      // 3. AUTHORIZATION CHECKS (BEFORE processing)
      
      // 3a. Validate mask authorization
      this.validateMaskAuthorization(credentials, dto.maskId);
      
      // 3b. Validate bulk send limit (max 1000 per request by default)
      const maxBulkLimit = this.configService.get<number>('SMS_MAX_BULK_COUNT_DEFAULT', 1000);
      this.validateBulkLimit(recipients.length, maxBulkLimit);
      
      // 3c. Validate sufficient credits (ONLY control mechanism - no daily/monthly tracking)
      await this.validateSufficientCredits(credentials, recipients.length);

      // 4. Create message record (no credit deduction yet)
      const context: SmsProcessingContextDto = {
        instituteId,
        userId,
        userType,
        messageType: this.determineSmsType(dto.recipientTypes[0], dto.classIds, dto.subjectIds),
        recipientFilterType: dto.recipientTypes[0], // Use first type as primary
        messageTemplate: dto.messageTemplate,
        recipients,
        credentials: {
          maskId: dto.maskId,
          displayName: dto.maskId,
          phoneNumber: '',
          isActive: credentials.isActive,
        },
        scheduledAt: dto.isNow ? now() : dto.scheduledAt,
        filterCriteria: {
          recipientTypes: dto.recipientTypes,
          classIds: dto.classIds,
          subjectIds: dto.subjectIds,
          instituteId,
        },
        requestedMaskId: dto.maskId,
      };

      const messageRecord = await this.createMessageRecord(context);

      // 5. Messages are created with PENDING_VERIFICATION status
      // They will be processed only after admin approval via approveCampaign()
      // ✅ IMPORTANT: Even if isNow=true or scheduledAt is in the past,
      //    the message will ONLY send after admin approval
      //    When approved, it sends IMMEDIATELY regardless of scheduledAt time

      const processingTime = nowTimestamp() - startTime;

      return {
        success: true,
        message: 'Bulk SMS created successfully. Awaiting admin approval. Will send immediately after approval regardless of scheduled time.',
        messageId: messageRecord.id,
        totalRecipients: recipients.length,
        status: SmsMessageStatus.PENDING_VERIFICATION,
        estimatedCredits: recipients.length,
        processingTime: `${processingTime}ms`
      };
    } catch (error) {
      this.logger.error(`❌ Error in sendBulkSms for institute ${instituteId}: ${error.message}`, error.stack);
      
      if (error instanceof BadRequestException || error instanceof ForbiddenException || error instanceof NotFoundException) {
        throw error;
      }
      
      throw new InternalServerErrorException(`Failed to send bulk SMS: ${error.message}`);
    }
  }

  /**
   * 📊 Get recipient count with caching
   */
  async getRecipientCount(
    instituteId: string,
    dto: GetRecipientCountDto
  ): Promise<RecipientCountResponseDto> {
    const cacheKey = this.generateCacheKey('count', instituteId, dto);
    const cached = this.getFromCache(this.countCache, cacheKey);
    
    if (cached) {
      return { ...cached, cached: true };
    }

    // ⚡ OPTIMIZED: Use COUNT queries instead of fetching all data
    const breakdown = await this.getRecipientCountByType(instituteId, dto);
    const totalCount = breakdown.students + breakdown.teachers + breakdown.parents + breakdown.admin;
    
    const result: RecipientCountResponseDto = {
      estimatedCount: totalCount,
      breakdown,
      filterDetails: { 
        recipientTypes: dto.recipientTypes,
        classIds: dto.classIds,
        subjectIds: dto.subjectIds,
        instituteId 
      },
      cached: false,
      estimatedCredits: totalCount
    };

    this.setCache(this.countCache, cacheKey, result, this.CACHE_TTL.COUNT);
    return result;
  }

  /**
   * 💰 Submit payment with validation
   */
  async submitPayment(
    instituteId: string,
    userId: string,
    dto: SmsPaymentSubmissionDto
  ): Promise<PaymentSubmissionResponseDto> {

    try {
      // Validate required fields
      if (!instituteId) {
        throw new BadRequestException('Institute ID is required');
      }

      if (!userId) {
        throw new BadRequestException('User ID is required');
      }

      if (!dto.requestedCredits || dto.requestedCredits <= 0) {
        throw new BadRequestException('Requested credits must be a positive number');
      }

      if (!dto.paymentAmount || dto.paymentAmount <= 0) {
        throw new BadRequestException('Payment amount must be a positive number');
      }

      if (!dto.paymentMethod?.trim()) {
        throw new BadRequestException('Payment method is required');
      }

      // Create payment submission entity
      const timestamp = now();
      const submissionEntity = this.paymentSubmissionRepository.create({
        instituteId,
        submittedBy: userId,
        requestedCredits: dto.requestedCredits,
        paymentAmount: dto.paymentAmount,
        paymentMethod: dto.paymentMethod.trim(),
        paymentReference: dto.paymentReference?.trim() || null,
        submissionNotes: dto.submissionNotes?.trim() || null,
        status: PaymentSubmissionStatus.PENDING,
        paymentSlipUrl: dto.paymentSlipUrl || null,
        paymentSlipFilename: dto.paymentSlipFilename || null,
        submittedAt: now(),
        createdAt: timestamp,
        updatedAt: timestamp
      });
      const submission = await this.paymentSubmissionRepository.save(submissionEntity);

      // 📧 Send payment submission confirmation email (FIRE-AND-FORGET - Zero blocking)
      // ⚡ OPTIMIZED: Parallel database queries instead of sequential
      const [submitter, institute] = await Promise.all([
        this.userRepository.findOne({ where: { id: userId } }),
        this.instituteRepository.findOne({ where: { id: instituteId } })
      ]);
      
      if (submitter && submitter.email) {
        this.asyncEmailService.sendPaymentSubmissionEmailAsync({
          userEmail: submitter.email,
          userName: `${submitter.firstName} ${submitter.lastName}`.trim() || 'User',
          submissionId: submission.id,
          instituteId,
          instituteName: institute?.name || 'Institute',
          instituteSystemContactEmail: institute?.systemContactEmail || null,
          instituteSystemContactPhone: institute?.systemContactPhoneNumber || null,
          requestedCredits: dto.requestedCredits,
          paymentAmount: dto.paymentAmount,
          paymentMethod: dto.paymentMethod.trim(),
          paymentReference: dto.paymentReference?.trim() || '',
          submissionNotes: dto.submissionNotes?.trim() || '',
          paymentSlipUrl: dto.paymentSlipUrl || '',
          submittedAt: getCurrentSriLankaISO(),
        });
        // ✅ Email sent asynchronously - execution continues immediately
      }

      return {
        success: true,
        submissionId: submission.id,
        requestedCredits: dto.requestedCredits,
        paymentAmount: dto.paymentAmount,
        status: PaymentSubmissionStatus.PENDING,
        message: 'Payment submission created successfully. Please wait for admin verification.'
      };
    } catch (error) {
      this.logger.error(`❌ Error in submitPayment for institute ${instituteId}: ${error.message}`, error.stack);
      
      if (error instanceof BadRequestException || error instanceof ForbiddenException || error instanceof NotFoundException) {
        throw error;
      }
      
      throw new InternalServerErrorException(`Failed to submit payment: ${error.message}`);
    }
  }

  /**
   * 📊 Get credentials status
   */
  async getCredentialsStatus(instituteId: string): Promise<SmsCredentialsStatusDto> {
    if (!instituteId) {
      throw new BadRequestException('Institute ID is required');
    }

    try {
      const credentials = await this.getCachedCredentials(instituteId, UserType.USER_WITHOUT_PARENT);

      if (!credentials) {
        throw new NotFoundException(`SMS credentials not found for institute ${instituteId}`);
      }

      // Get balance from centralized credits service
      const creditBalance = await this.instituteCreditsService.getBalance(instituteId);

      return {
        verificationStage: credentials.verificationStage,
        availableCredits: creditBalance.balance || 0,
        totalCreditsGranted: creditBalance.totalPurchased || 0,
        totalCreditsUsed: creditBalance.totalUsed || 0,
        senderMasks: credentials.senderMasks || [],
        isActive: credentials.isActive || false
      };
    } catch (error) {
      this.logger.error(`❌ Error getting credentials status for institute ${instituteId}: ${error.message}`);
      
      if (error instanceof NotFoundException || error instanceof ForbiddenException || error instanceof BadRequestException) {
        throw error;
      }
      
      throw new InternalServerErrorException(`Failed to retrieve SMS credentials status: ${error.message}`);
    }
  }

  /**
   * 📈 Get SMS statistics
   */
  async getSmsStatistics(instituteId: string, period: string = 'month'): Promise<SmsStatisticsDto> {
    const fromDate = new Date(nowTimestamp() - (period === 'month' ? 30 : 7) * 24 * 60 * 60 * 1000);

    const stats = await this.smsMessageRepository
      .createQueryBuilder('sms')
      .select([
        'COUNT(*) as totalMessages',
        'SUM(sms.totalRecipients) as totalRecipients',
        'SUM(sms.successfulSends) as successfulSends', 
        'SUM(sms.failedSends) as failedSends',
        'SUM(sms.creditsUsed) as totalCreditsUsed'
      ])
      .where('sms.instituteId = :instituteId', { instituteId })
      .andWhere('sms.createdAt >= :fromDate', { fromDate })
      .getRawOne();

    return {
      period: `Last ${period === 'month' ? 30 : 7} days`,
      totalMessages: parseInt(stats.totalMessages, 10) || 0,
      totalRecipients: parseInt(stats.totalRecipients, 10) || 0,
      successfulSends: parseInt(stats.successfulSends, 10) || 0,
      failedSends: parseInt(stats.failedSends, 10) || 0,
      totalCreditsUsed: parseInt(stats.totalCreditsUsed, 10) || 0,
      successRate: stats.totalRecipients > 0 
        ? `${((stats.successfulSends / stats.totalRecipients) * 100).toFixed(2)}%`
        : '0%'
    };
  }

  /**
   * 🔍 Get pending verifications (Admin only)
   */
  async getPendingVerifications(page: number, limit: number): Promise<any> {
    const [submissions, total] = await this.paymentSubmissionRepository
      .createQueryBuilder('submission')
      .select([
        'submission.id',
        'submission.instituteId',
        'submission.submittedBy',
        'submission.requestedCredits',
        'submission.paymentAmount',
        'submission.paymentMethod',
        'submission.paymentReference',
        'submission.paymentSlipUrl',
        'submission.paymentSlipFilename',
        'submission.submissionNotes',
        'submission.status',
        'submission.submittedAt',
        'submission.createdAt',
      ])
      .where('submission.status = :status', { status: PaymentSubmissionStatus.PENDING })
      .orderBy('submission.submittedAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    // Transform relative paths to full URLs
    const verificationsWithFullUrls = submissions.map(submission => ({
      ...submission,
      paymentSlipUrl: submission.paymentSlipUrl 
        ? this.cloudStorageService.getFullUrl(submission.paymentSlipUrl)
        : null
    }));

    return {
      verifications: verificationsWithFullUrls,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit)
    };
  }

  /**
   * 📄 Get single payment submission by ID
   */
  async getPaymentSubmission(submissionId: string, requestingUserId?: string): Promise<any> {
    if (!submissionId) {
      throw new BadRequestException('Submission ID is required');
    }

    const submission = await this.paymentSubmissionRepository
      .createQueryBuilder('submission')
      .select([
        'submission.id',
        'submission.instituteId',
        'submission.submittedBy',
        'submission.requestedCredits',
        'submission.paymentAmount',
        'submission.paymentMethod',
        'submission.paymentReference',
        'submission.paymentSlipUrl',
        'submission.paymentSlipFilename',
        'submission.submissionNotes',
        'submission.status',
        'submission.creditsGranted',
        'submission.costPerCredit',
        'submission.verifiedBy',
        'submission.verifiedAt',
        'submission.rejectionReason',
        'submission.adminNotes',
        'submission.submittedAt',
        'submission.createdAt',
        'submission.updatedAt',
      ])
      .where('submission.id = :submissionId', { submissionId })
      .getOne();

    if (!submission) {
      throw new NotFoundException(`Payment submission ${submissionId} not found`);
    }

    // Transform relative path to full URL
    if (submission.paymentSlipUrl) {
      submission.paymentSlipUrl = this.cloudStorageService.getFullUrl(submission.paymentSlipUrl);
    }

    return submission;
  }

  /**
   * 📋 Get payment submissions for a specific institute
   * Institute Admin can view their own submissions
   * SUPERADMIN can view any institute's submissions
   */
  async getInstitutePaymentSubmissions(
    instituteId: string,
    page: number = 1,
    limit: number = 10,
    status?: PaymentSubmissionStatus
  ): Promise<any> {

    if (!instituteId) {
      throw new BadRequestException('Institute ID is required');
    }

    if (page < 1) page = 1;
    if (limit < 1) limit = 10;
    if (limit > 100) limit = 100;

    const queryBuilder = this.paymentSubmissionRepository
      .createQueryBuilder('submission')
      .select([
        'submission.id',
        'submission.instituteId',
        'submission.submittedBy',
        'submission.requestedCredits',
        'submission.paymentAmount',
        'submission.paymentMethod',
        'submission.paymentReference',
        'submission.paymentSlipUrl',
        'submission.paymentSlipFilename',
        'submission.submissionNotes',
        'submission.status',
        'submission.creditsGranted',
        'submission.costPerCredit',
        'submission.verifiedBy',
        'submission.verifiedAt',
        'submission.rejectionReason',
        'submission.adminNotes',
        'submission.submittedAt',
        'submission.createdAt',
        'submission.updatedAt',
      ])
      .where('submission.instituteId = :instituteId', { instituteId })
      .orderBy('submission.submittedAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    // Filter by status if provided
    if (status) {
      queryBuilder.andWhere('submission.status = :status', { status });
    }

    const [submissions, total] = await queryBuilder.getManyAndCount();

    // Transform relative paths to full URLs
    const submissionsWithFullUrls = submissions.map(submission => {
      const json = typeof submission.toJSON === 'function' ? submission.toJSON() : submission;
      return {
        ...json,
        paymentSlipUrl: submission.paymentSlipUrl 
          ? this.cloudStorageService.getFullUrl(submission.paymentSlipUrl)
          : null
      };
    });

    return {
      submissions: submissionsWithFullUrls,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      instituteId
    };
  }

  /**
   * 📜 Get SMS message history for an institute (paginated)
   */
  async getMessageHistory(
    instituteId: string,
    page: number = 1,
    limit: number = 10,
    status?: SmsMessageStatus,
  ): Promise<SmsMessageHistoryResponseDto> {
    if (!instituteId) {
      throw new BadRequestException('Institute ID is required');
    }

    if (page < 1) page = 1;
    if (limit < 1) limit = 10;
    if (limit > 100) limit = 100;

    const where: any = { instituteId };
    if (status) {
      where.status = status;
    }

    const [items, total] = await this.smsMessageRepository.findAndCount({
      where,
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
      select: [
        'id',
        'messageType',
        'recipientFilterType',
        'messageTemplate',
        'totalRecipients',
        'successfulSends',
        'failedSends',
        'creditsUsed',
        'status',
        'maskIdUsed',
        'createdAt',
      ],
    });

    return {
      items: items.map(i => ({
        id: i.id,
        messageType: i.messageType,
        recipientFilterType: i.recipientFilterType,
        messageTemplate: i.messageTemplate,
        totalRecipients: i.totalRecipients,
        successfulSends: i.successfulSends,
        failedSends: i.failedSends,
        creditsUsed: i.creditsUsed,
        status: i.status,
        maskIdUsed: i.maskIdUsed,
        createdAt: i.createdAt?.toISOString?.() || (i as any).createdAt,
      })),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * ✅ Verify payment submission (Admin only)
   * Uses centralized credits service for credit granting.
   */
  async verifyPayment(
    submissionId: string,
    adminUserId: string,
    dto: any
  ): Promise<any> {
    const submission = await this.paymentSubmissionRepository.findOne({
      where: { id: submissionId }
    });

    if (!submission) {
      throw new NotFoundException(`Payment submission ${submissionId} not found`);
    }

    if (submission.status !== PaymentSubmissionStatus.PENDING) {
      throw new BadRequestException(`Submission ${submissionId} has already been processed`);
    }

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      let creditsGranted = 0;

      if (dto.action === 'APPROVE') {
        creditsGranted = dto.creditsToGrant || submission.requestedCredits;

        // Grant credits via centralized credits service
        await this.instituteCreditsService.grantCreditsWithManager(
          queryRunner.manager,
          submission.instituteId,
          {
            amount: creditsGranted,
            type: CreditTransactionType.TOP_UP,
            referenceType: 'SMS_PAYMENT',
            referenceId: submissionId,
            description: `SMS payment #${submissionId} verified — ${creditsGranted} credits`,
          },
          adminUserId,
        );

        // Update submission status
        await queryRunner.manager.update(InstituteSmsPaymentSubmissionEntity, submissionId, {
          status: PaymentSubmissionStatus.VERIFIED,
          verifiedBy: adminUserId,
          verifiedAt: now(),
          creditsGranted,
          adminNotes: dto.adminNotes,
        });
      } else {
        // Reject submission
        await queryRunner.manager.update(InstituteSmsPaymentSubmissionEntity, submissionId, {
          status: PaymentSubmissionStatus.REJECTED,
          verifiedBy: adminUserId,
          verifiedAt: now(),
          rejectionReason: dto.rejectionReason,
          adminNotes: dto.adminNotes,
        });
      }

      await queryRunner.commitTransaction();

      // Clear cache
      this.invalidateInstituteCache(submission.instituteId);

      // 📧 Send email notification (FIRE-AND-FORGET)
      const [submitter, institute] = await Promise.all([
        this.userRepository.findOne({ where: { id: submission.submittedBy } }),
        this.instituteRepository.findOne({ where: { id: submission.instituteId } })
      ]);
      
      if (submitter && submitter.email) {
        if (dto.action === 'APPROVE') {
          this.asyncEmailService.sendPaymentApprovedEmailAsync({
            userEmail: submitter.email,
            userName: `${submitter.firstName} ${submitter.lastName}`.trim() || 'User',
            submissionId,
            instituteId: submission.instituteId,
            instituteName: institute?.name || 'Institute',
            instituteSystemContactEmail: institute?.systemContactEmail || null,
            instituteSystemContactPhone: institute?.systemContactPhoneNumber || null,
            creditsGranted,
            verifiedAt: getCurrentSriLankaISO(),
            adminNotes: dto.adminNotes || 'Payment verified successfully. Credits have been added to your account.',
          });
        } else {
          this.asyncEmailService.sendPaymentRejectedEmailAsync({
            userEmail: submitter.email,
            userName: `${submitter.firstName} ${submitter.lastName}`.trim() || 'User',
            submissionId,
            instituteId: submission.instituteId,
            instituteName: institute?.name || 'Institute',
            instituteSystemContactEmail: institute?.systemContactEmail || null,
            instituteSystemContactPhone: institute?.systemContactPhoneNumber || null,
            rejectionReason: dto.rejectionReason || 'Payment verification failed',
            verifiedAt: getCurrentSriLankaISO(),
            adminNotes: dto.adminNotes || 'Please resubmit your payment with correct documentation.',
          });
        }
      }

      return {
        success: true,
        submissionId,
        action: dto.action,
        creditsGranted,
        message: dto.action === 'APPROVE' 
          ? `Payment approved and ${creditsGranted} credits granted`
          : 'Payment submission rejected',
        verifiedAt: getCurrentSriLankaISO()
      };

    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * 📋 Get pending campaign approvals (SUPERADMIN only)
   */
  async getPendingCampaignApprovals(
    page: number = 1,
    limit: number = 10,
    instituteId?: string
  ): Promise<any> {

    const queryBuilder = this.smsMessageRepository
      .createQueryBuilder('message')
      .leftJoinAndSelect('message.institute', 'institute')
      .leftJoinAndSelect('message.sender', 'sender')
      .where('message.status = :status', { status: SmsMessageStatus.PENDING_VERIFICATION })
      .orderBy('message.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    if (instituteId) {
      queryBuilder.andWhere('message.instituteId = :instituteId', { instituteId });
    }

    const [campaigns, total] = await queryBuilder.getManyAndCount();

    const approvals = campaigns.map(campaign => ({
      messageId: campaign.id,
      instituteId: campaign.instituteId,
      instituteName: campaign.institute?.name || 'Unknown Institute',
      sentBy: campaign.sentBy,
      senderName: campaign.sender 
        ? `${campaign.sender.firstName} ${campaign.sender.lastName}`.trim() 
        : 'Unknown User',
      messageType: campaign.messageType,
      recipientType: campaign.recipientFilterType,
      totalRecipients: campaign.totalRecipients,
      messageTemplate: campaign.messageTemplate,
      estimatedCredits: campaign.totalRecipients,
      status: campaign.status,
      createdAt: campaign.createdAt?.toISOString() || new Date().toISOString(),
      scheduledAt: campaign.scheduledAt?.toISOString(),
      filterCriteria: campaign.filterCriteria,
      maskIdUsed: campaign.maskIdUsed,
    }));

    return {
      approvals,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit)
    };
  }

  /**
   * ✅ Approve a campaign (SUPERADMIN only)
   */
  async approveCampaign(
    messageId: string,
    adminId: string,
    adminNotes?: string
  ): Promise<any> {

    const message = await this.smsMessageRepository.findOne({ 
      where: { id: messageId },
      relations: ['institute']
    });

    if (!message) {
      throw new NotFoundException(`Campaign ${messageId} not found`);
    }

    if (message.status !== SmsMessageStatus.PENDING_VERIFICATION) {
      throw new BadRequestException(
        `Campaign ${messageId} is not pending approval. Current status: ${message.status}`
      );
    }

    // Get recipients BEFORE changing status to avoid stuck APPROVED campaigns
    const recipients = await this.getRecipientsFromMessage(message);

    if (!recipients || recipients.length === 0) {
      throw new BadRequestException(`No recipients found for campaign ${messageId}`);
    }

    // Update status to APPROVED only after recipients are confirmed
    message.status = SmsMessageStatus.APPROVED;
    message.approvedBy = adminId;
    message.approvedAt = now();
    await this.smsMessageRepository.save(message);

    // ✅ IMPORTANT: Send IMMEDIATELY after approval, regardless of scheduledAt time
    // Even if message was scheduled for past/future, approval triggers instant sending
    // This ensures approved messages don't wait for old scheduled times

    // Queue the campaign for immediate sending (non-blocking)
    setImmediate(() => {
      this.processSmsWithDeferredDeduction(
        messageId, 
        recipients, 
        message.messageTemplate, 
        message.instituteId
      ).catch(error => 
        this.logger.error(`❌ SMS processing failed for campaign ${messageId}: ${error.message}`)
      );
    });

    return {
      success: true,
      message: 'Campaign approved and queued for immediate sending',
      messageId: message.id,
      status: message.status,
      approvedBy: adminId,
      approvedAt: message.approvedAt.toISOString(),
      adminNotes,
      totalRecipients: recipients.length
    };
  }

  /**
   * ❌ Reject a campaign (SUPERADMIN only)
   */
  async rejectCampaign(
    messageId: string,
    adminId: string,
    rejectionReason: string,
    adminNotes?: string
  ): Promise<any> {

    const message = await this.smsMessageRepository.findOne({ 
      where: { id: messageId } 
    });

    if (!message) {
      throw new NotFoundException(`Campaign ${messageId} not found`);
    }

    if (message.status !== SmsMessageStatus.PENDING_VERIFICATION) {
      throw new BadRequestException(
        `Campaign ${messageId} is not pending approval. Current status: ${message.status}`
      );
    }

    // Update status to REJECTED
    message.status = SmsMessageStatus.REJECTED;
    message.rejectionReason = rejectionReason;
    await this.smsMessageRepository.save(message);


    return {
      success: true,
      message: 'Campaign rejected',
      messageId: message.id,
      status: message.status,
      rejectionReason,
      adminNotes
    };
  }

  /**
   * 🎭 Create/Add a new sender mask for an institute
   * SUPERADMIN or Institute Admin only
   */
  async createSenderMask(
    instituteId: string,
    maskData: {
      maskId: string;
      displayName: string;
      phoneNumber: string;
      isActive: boolean;
    },
    userId?: string
  ): Promise<any> {

    // Validate instituteId
    if (!instituteId || instituteId.toString().trim() === '') {
      throw new BadRequestException('Valid Institute ID is required');
    }

    // Validate maskData
    if (!maskData.maskId?.trim()) {
      throw new BadRequestException('Mask ID is required');
    }

    if (!maskData.displayName?.trim()) {
      throw new BadRequestException('Display name is required');
    }

    if (!maskData.phoneNumber?.trim()) {
      throw new BadRequestException('Phone number is required');
    }

    try {
      // Get existing credentials for this institute
      let credentials = await this.smsCredentialsRepository.findOne({
        where: { instituteId: instituteId.toString() }
      });

      if (!credentials) {
        
        // Generate UUID for the credentials record (database uses VARCHAR(36) UUIDs, not auto-increment)
        const credentialsId = uuidv4();
        
        // Check if there's an orphaned record with empty ID (database corruption)
        const corruptedRecords = await this.smsCredentialsRepository
          .createQueryBuilder('creds')
          .where('creds.id = :emptyId OR LENGTH(creds.id) = 0', { emptyId: '' })
          .getMany();
        
        if (corruptedRecords.length > 0) {
          this.logger.warn(`⚠️ Found ${corruptedRecords.length} corrupted SMS credentials records with empty IDs - please run cleanup`);
        }
        
        // Create entity with explicitly set UUID
        const newCredentials = new InstituteSmsCredentialsEntity();
        newCredentials.id = credentialsId; // Set UUID explicitly (not auto-increment!)
        newCredentials.instituteId = instituteId.toString();
        newCredentials.currentCredits = 0;
        newCredentials.totalPurchased = 0;
        newCredentials.totalUsed = 0;
        newCredentials.verificationStage = SmsVerificationStage.PRE_APPROVED;
        newCredentials.isActive = true;
        newCredentials.senderMasks = [];
        newCredentials.createdBy = userId || null; // FK references users.id, must be a valid user ID (not instituteId)
        
        try {
          // Save with explicit UUID
          credentials = await this.smsCredentialsRepository.save(newCredentials);
          
          // Log the result for debugging
          
          // Verify the ID was saved correctly
          if (!credentials.id || credentials.id === '' || credentials.id.length !== 36) {
            this.logger.error(`⚠️ Invalid ID after save: "${credentials.id}" (length: ${credentials.id?.length})`);
            throw new Error('Failed to save credentials with valid UUID');
          }
          
        } catch (saveError) {
          this.logger.error(`❌ Failed to save credentials: ${saveError.message}`, saveError.stack);
          throw saveError;
        }
      }

      // Initialize senderMasks array if null
      if (!credentials.senderMasks) {
        credentials.senderMasks = [];
      }

      // Check if mask already exists
      const existingMask = credentials.senderMasks.find(m => m.maskId === maskData.maskId);
      if (existingMask) {
        throw new BadRequestException(
          `Sender mask '${maskData.maskId}' already exists for this institute. Use update endpoint to modify it.`
        );
      }

      // Add new mask
      credentials.senderMasks.push({
        maskId: maskData.maskId.trim(),
        displayName: maskData.displayName.trim(),
        phoneNumber: this.normalizePhoneNumber(maskData.phoneNumber),
        isActive: maskData.isActive
      });

      // Save credentials
      await this.smsCredentialsRepository.save(credentials);

      // Clear cache
      this.invalidateInstituteCache(instituteId);


      return {
        success: true,
        message: 'Sender mask created successfully',
        mask: {
          maskId: maskData.maskId.trim(),
          displayName: maskData.displayName.trim(),
          phoneNumber: this.normalizePhoneNumber(maskData.phoneNumber),
          isActive: maskData.isActive
        },
        instituteId
      };
    } catch (error) {
      this.logger.error(`❌ Error creating sender mask for institute ${instituteId}: ${error.message}`, error.stack);
      
      if (error instanceof BadRequestException) {
        throw error;
      }
      
      // Handle duplicate key errors
      if (error.code === 'ER_DUP_ENTRY' || error.message?.includes('Duplicate entry')) {
        // Check if it's a duplicate instituteId
        if (error.message?.includes('institute_id')) {
          throw new BadRequestException(
            `SMS credentials already exist for institute ${instituteId}. This should not happen - please contact support.`
          );
        }
        // Check if it's a duplicate PRIMARY key (shouldn't happen with auto-increment)
        if (error.message?.includes('PRIMARY')) {
          this.logger.error(`⚠️ CRITICAL: Primary key duplicate error for institute ${instituteId}. This indicates a database issue.`);
          throw new InternalServerErrorException(
            'Database error: Unable to generate unique ID. Please try again or contact support if the issue persists.'
          );
        }
      }
      
      throw new InternalServerErrorException(`Failed to create sender mask: ${error.message}`);
    }
  }

  /**
   * 📋 Get all sender masks for an institute
   */
  async getSenderMasks(instituteId: string): Promise<any> {
    if (!instituteId) {
      throw new BadRequestException('Institute ID is required');
    }

    try {
      const credentials = await this.smsCredentialsRepository.findOne({
        where: { instituteId }
      });

      if (!credentials) {
        return {
          success: true,
          masks: [],
          total: 0,
          instituteId
        };
      }

      const masks = credentials.senderMasks || [];

      return {
        success: true,
        masks,
        total: masks.length,
        instituteId
      };
    } catch (error) {
      this.logger.error(`❌ Error getting sender masks: ${error.message}`);
      throw new InternalServerErrorException(`Failed to get sender masks: ${error.message}`);
    }
  }

  /**
   * 🔍 Get recipients from message filter criteria
   * Helper method to reconstruct recipient list from saved campaign
   */
  private async getRecipientsFromMessage(message: InstituteSmsMessageEntity): Promise<any[]> {
    const filterCriteria = message.filterCriteria;

    if (!filterCriteria) {
      this.logger.warn(`⚠️ No filter criteria found for message ${message.id}`);
      return [];
    }

    // Handle custom numbers
    if (filterCriteria.customNumbers && Array.isArray(filterCriteria.customNumbers)) {
      return filterCriteria.customNumbers.map(recipient => ({
        phoneNumber: this.normalizePhoneNumber(recipient.number),
        name: recipient.name || 'Customer',
        firstName: recipient.name?.split(' ')[0] || 'Customer',
        lastName: recipient.name?.split(' ').slice(1).join(' ') || '',
      }));
    }

    // Handle filtered recipients (students, teachers, etc.)
    const recipientFilter: SmsRecipientFilterDto = {
      recipientTypes: [message.recipientFilterType],
      classIds: filterCriteria.classIds,
      subjectIds: filterCriteria.subjectIds
    };

    return await this.getRecipientsByFilter(message.instituteId, recipientFilter);
  }

  // PRIVATE METHODS

  /**
   * 🎯 Core SMS processing with deferred credit deduction
   * 
   * BACKGROUND PROCESSING FLOW:
   * 1. Update message status to SENDING
   * 2. Fire-and-forget DynamoDB logging (non-blocking)
   * 3. Send SMS in optimized batches (50 per batch, 5 concurrent)
   * 4. ⚠️ CRITICAL: Deduct credits ONLY after successful sends
   * 5. Update final message status with delivery results
   * 
   * Credits are NOT deducted upfront - only for successfully delivered messages.
   * This runs in background using setImmediate() - does not block API response.
   */
  private async processSmsWithDeferredDeduction(
    messageId: string,
    recipients: any[],
    messageTemplate: string,
    instituteId: string
  ): Promise<void> {
    const startTime = Date.now();
    
    try {
      // 1. Message is already APPROVED, just set sentAt timestamp
      await this.smsMessageRepository.update(messageId, {
        sentAt: now()
      });

      // 2. Fire-and-forget DynamoDB logging
      this.logToDynamoDBFireAndForget(messageId, recipients, messageTemplate, instituteId);

      // 3. Send SMS in batches
      const deliveryResult = await this.sendSmsInBatches(messageId, recipients, messageTemplate);

      // 4. Deferred credit deduction - only for successful sends
      if (deliveryResult.successful > 0) {
        await this.deductCreditsAfterDelivery(instituteId, deliveryResult.successful);
      }

      // 5. Update final message status
      await this.updateMessageFinalStatus(messageId, deliveryResult);

      const processingTime = Date.now() - startTime;

    } catch (error) {
      this.logger.error(`❌ SMS processing failed for message ${messageId}: ${error.message}`);
      
      await this.smsMessageRepository.update(messageId, {
        status: SmsMessageStatus.FAILED,
        errorMessage: error.message,
        completedAt: now()
      });
    }
  }

  /**
   * 📤 Send SMS using provider service with automatic chunking
   * 
   * This method uses the SMS provider service (SMSlenz.lk) to send messages.
   * Automatically handles bulk sending with 500 recipients per batch.
   * 
   * Example: 1500 recipients → 3 batches (500 × 3)
   */
  private async sendSmsInBatches(
    messageId: string,
    recipients: any[],
    messageTemplate: string
  ): Promise<SmsDeliveryResultDto> {
    try {
      // Get credentials for this message
      const message = await this.smsMessageRepository.findOne({
        where: { id: messageId }
      });

      if (!message) {
        throw new Error(`Message ${messageId} not found`);
      }

      const credentials = await this.smsCredentialsRepository.findOne({
        where: { instituteId: message.instituteId, isActive: true }
      });

      if (!credentials) {
        throw new Error(`SMS credentials not found for institute ${message.instituteId}`);
      }

      // ✅ ALWAYS USE SYSTEM CREDENTIALS FROM .ENV (NEVER DATABASE CREDENTIALS)
      // Only use institute's sender mask for personalization
      const userId = this.configService.get('SMSLENZ_USER_ID');
      const apiKey = this.configService.get('SMSLENZ_API_KEY');
      
      if (!userId || !apiKey) {
        throw new Error(
          'System SMS credentials not configured. ' +
          'Please set SMSLENZ_USER_ID and SMSLENZ_API_KEY in .env file.'
        );
      }
      
      // ✅ Use the sender mask that was requested when creating the message
      // This ensures we use the approved mask that passed validation
      const senderId = message.maskIdUsed || credentials.senderMasks?.[0]?.maskId || 'SMSlenzDEMO';


      // Extract phone numbers from recipients (NO PERSONALIZATION - just phone numbers)
      const phoneNumbers = recipients
        .map(r => r.phoneNumber)
        .filter(phone => phone && phone.length > 5);

      if (phoneNumbers.length === 0) {
        throw new Error('No valid phone numbers to send SMS');
      }

      // Call provider service - it handles chunking automatically
      // Example: 1500 numbers → provider splits into 3 batches of 500
      const result: BulkSmsResult = await this.smsProviderService.sendBulkSms(
        userId,
        apiKey,
        senderId,
        phoneNumbers,
        messageTemplate // Plain message, no personalization
      );

      return {
        messageId,
        successful: result.totalSent,
        failed: result.totalFailed,
        totalRecipients: phoneNumbers.length
      };

    } catch (error) {
      this.logger.error(`❌ SMS provider error: ${error.message}`);
      
      return {
        messageId,
        successful: 0,
        failed: recipients.length,
        totalRecipients: recipients.length
      };
    }
  }

  /**
   * 💾 Local caching methods
   */
  private async getCachedCredentials(instituteId: string, userType: UserType): Promise<InstituteSmsCredentialsEntity> {
    const cacheKey = `credentials-${instituteId}`;
    const cached = this.getFromCache(this.credentialsCache, cacheKey);
    
    if (cached) {
      return cached;
    }

    // System admin bypass
    if (userType === UserType.SUPERADMIN) {
      let credentials = await this.smsCredentialsRepository.findOne({
        where: { instituteId, isActive: true }
      });

      if (!credentials) {
        credentials = await this.createUnlimitedCredentials(instituteId);
      }

      this.setCache(this.credentialsCache, cacheKey, credentials, this.CACHE_TTL.CREDENTIALS);
      return credentials;
    }

    // Regular user validation
    const credentials = await this.smsCredentialsRepository.findOne({
      where: { instituteId, isActive: true }
    });

    if (!credentials) {
      throw new ForbiddenException(`SMS credentials not configured for institute ${instituteId}`);
    }

    this.setCache(this.credentialsCache, cacheKey, credentials, this.CACHE_TTL.CREDENTIALS);
    return credentials;
  }

  private async getCachedRecipients(instituteId: string, dto: SmsRecipientFilterDto): Promise<any[]> {
    const cacheKey = this.generateCacheKey('recipients', instituteId, dto);
    const cached = this.getFromCache(this.recipientCache, cacheKey);
    
    if (cached) {
      return cached;
    }

    const recipients = await this.getRecipientsByFilter(instituteId, dto);
    this.setCache(this.recipientCache, cacheKey, recipients, this.CACHE_TTL.RECIPIENTS);
    
    return recipients;
  }

  // Utility methods
  private getFromCache<T>(cache: Map<string, CacheItem<T>>, key: string): T | null {
    const item = cache.get(key);
    
    if (!item || Date.now() > item.expires) {
      cache.delete(key);
      return null;
    }
    
    return item.data;
  }

  private setCache<T>(cache: Map<string, CacheItem<T>>, key: string, data: T, ttl: number): void {
    cache.set(key, {
      data,
      timestamp: Date.now(),
      expires: Date.now() + ttl
    });
  }

  private generateCacheKey(prefix: string, ...parts: any[]): string {
    return `${prefix}-${parts.map(p => typeof p === 'object' ? JSON.stringify(p) : p).join('-')}`;
  }

  private initializeCacheCleanup(): void {
    this.cacheCleanupInterval = setInterval(() => {
      this.cleanExpiredCache();
    }, 300000); // Clean every 5 minutes
  }

  onModuleDestroy(): void {
    if (this.cacheCleanupInterval) {
      clearInterval(this.cacheCleanupInterval);
      this.cacheCleanupInterval = null;
    }
  }

  private cleanExpiredCache(): void {
    const now = Date.now();
    let cleanedCount = 0;

    [this.credentialsCache, this.recipientCache, this.countCache].forEach(cache => {
      cache.forEach((item, key) => {
        if (now > item.expires) {
          cache.delete(key);
          cleanedCount++;
        }
      });
      // Enforce max size after TTL cleanup — remove oldest entries (FIFO)
      if (cache.size > SmsService.MAX_CACHE_ENTRIES) {
        const excess = cache.size - SmsService.MAX_CACHE_ENTRIES;
        let removed = 0;
        for (const key of cache.keys()) {
          if (removed >= excess) break;
          cache.delete(key);
          removed++;
          cleanedCount++;
        }
      }
    });

    if (cleanedCount > 0) {
    }
  }

  /**
   * 🗑️ Invalidate all caches for an institute
   */
  private invalidateInstituteCache(instituteId: string): void {
    this.credentialsCache.delete(`credentials-${instituteId}`);
    
    // Clear recipient caches for this institute
    const recipientKeys = Array.from(this.recipientCache.keys())
      .filter(key => key.includes(instituteId));
    recipientKeys.forEach(key => this.recipientCache.delete(key));
    
    // Clear count caches
    const countKeys = Array.from(this.countCache.keys())
      .filter(key => key.includes(instituteId));
    countKeys.forEach(key => this.countCache.delete(key));
  }

  // Additional helper methods would go here...
  
  /**
   * 🔐 AUTHORIZATION: Validate mask ID authorization
   * Ensures the requested mask is approved and active for this institute
   */
  private validateMaskAuthorization(credentials: InstituteSmsCredentialsEntity, requestedMaskId: string): void {
    if (!requestedMaskId) {
      throw new BadRequestException('Mask ID is required for SMS sending');
    }

    // If no sender masks configured, reject
    if (!credentials.senderMasks || credentials.senderMasks.length === 0) {
      throw new ForbiddenException(
        `No approved sender masks configured. Please configure SMS sender masks before sending messages.`
      );
    }

    // Check if requested mask is in the approved list and active
    const authorizedMask = credentials.senderMasks.find(
      mask => mask.maskId === requestedMaskId && mask.isActive === true
    );

    if (!authorizedMask) {
      const approvedMaskIds = credentials.senderMasks
        .filter(m => m.isActive)
        .map(m => m.maskId)
        .join(', ');
      
      throw new ForbiddenException(
        `Unauthorized mask ID '${requestedMaskId}'. Approved masks: ${approvedMaskIds || 'None'}`
      );
    }

  }

  /**
   * 🔐 AUTHORIZATION: Validate bulk send limits
   * Prevents sending too many messages in a single request
   */
  private validateBulkLimit(recipientCount: number, maxBulkLimit: number = 1000): void {
    if (recipientCount > maxBulkLimit) {
      throw new ForbiddenException(
        `Bulk send limit exceeded. Maximum ${maxBulkLimit} recipients allowed per request. You have ${recipientCount} recipients.`
      );
    }

  }

  /**
   * 🔐 AUTHORIZATION: Validate sufficient credits
   * Ensures enough credits are available for sending
   */
  private async validateSufficientCredits(credentials: InstituteSmsCredentialsEntity, required: number): Promise<void> {
    // UNLIMITED accounts bypass credit check
    if (credentials.verificationStage === SmsVerificationStage.UNLIMITED) {
      return;
    }

    // ✅ ALWAYS USE SYSTEM CREDENTIALS FROM .ENV
    const hasEnvCredentials = this.configService.get('SMSLENZ_USER_ID') && this.configService.get('SMSLENZ_API_KEY');
    
    if (!hasEnvCredentials) {
      throw new ForbiddenException(
        `System SMS provider credentials not configured. ` +
        `Please set SMSLENZ_USER_ID and SMSLENZ_API_KEY in .env file.`
      );
    }

    // ✅ Use centralized credits service for balance check
    await this.instituteCreditsService.validateSufficientCredits(credentials.instituteId, required);
  }

  private normalizePhoneNumber(phone: string): string {
    if (!phone) return '';
    
    const cleaned = phone.replace(/\D/g, '');
    
    if (cleaned.startsWith('0')) {
      return '+94' + cleaned.substring(1);
    }
    
    if (cleaned.startsWith('94')) {
      return '+' + cleaned;
    }
    
    if (cleaned.startsWith('7') && cleaned.length === 9) {
      return '+94' + cleaned;
    }
    
    return '+' + cleaned;
  }

  private chunkArray<T>(array: T[], size: number): T[][] {
    const chunks = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }

  // Placeholder implementations for methods that need to be implemented based on your schema
  private async createMessageRecord(context: SmsProcessingContextDto): Promise<InstituteSmsMessageEntity> {
    const messageEntity = new InstituteSmsMessageEntity();
    messageEntity.instituteId = context.instituteId;
    messageEntity.sentBy = context.userId;
    messageEntity.messageType = context.messageType as SmsMessageType;
    messageEntity.recipientFilterType = context.recipientFilterType;
    messageEntity.messageTemplate = context.messageTemplate;
    messageEntity.totalRecipients = context.recipients.length;
    messageEntity.creditsUsed = 0;
    messageEntity.status = SmsMessageStatus.PENDING_VERIFICATION;
    messageEntity.maskIdUsed = context.requestedMaskId;
    messageEntity.filterCriteria = context.filterCriteria;
    messageEntity.scheduledAt = context.scheduledAt;
    messageEntity.createdAt = now();

    return await this.smsMessageRepository.save(messageEntity);
  }

  private async getRecipientsByFilter(instituteId: string, dto: SmsRecipientFilterDto): Promise<any[]> {
    try {
      // ⚡ OPTIMIZED: Single UNION ALL query instead of multiple queries
      const includeStudents = dto.recipientTypes.includes(RecipientFilterType.STUDENTS) || dto.recipientTypes.includes(RecipientFilterType.ALL);
      const includeTeachers = dto.recipientTypes.includes(RecipientFilterType.TEACHERS) || dto.recipientTypes.includes(RecipientFilterType.ALL);
      const includeParents = dto.recipientTypes.includes(RecipientFilterType.PARENTS) || dto.recipientTypes.includes(RecipientFilterType.ALL);
      const includeAdmin = dto.recipientTypes.includes(RecipientFilterType.ADMIN) || dto.recipientTypes.includes(RecipientFilterType.ALL);
      const includeCustom = dto.recipientTypes.includes(RecipientFilterType.CUSTOM);

      if (includeCustom) {
        // Custom numbers are handled elsewhere (in sendCustomSms)
        return [];
      }

      // ✅ SECURITY FIX: Use TypeORM QueryBuilder instead of raw SQL with string concatenation
      // This prevents SQL injection by using parameterized queries
      
      // Build queries for each recipient type using safe QueryBuilder
      const queryPromises: Promise<any[]>[] = [];

      if (includeStudents) {
        // CASE 1: Only Institute ID → Get all students
        if (!dto.classIds?.length && !dto.subjectIds?.length) {
          const studentQuery = this.dataSource
            .createQueryBuilder()
            .select([
              'u.id as userId',
              "CONCAT(COALESCE(u.first_name, ''), ' ', COALESCE(u.last_name, '')) as name",
              "COALESCE(u.first_name, 'Student') as firstName",
              "COALESCE(u.last_name, '') as lastName",
              'u.phone_number as phoneNumber',
              "'STUDENT' as userType",
              "'STUDENT' as recipientType"
            ])
            .from('institute_user', 'iu')
            .innerJoin('users', 'u', 'u.id = iu.user_id')
            .where('iu.institute_id = :instituteId', { instituteId })
            .andWhere("iu.institute_user_type = 'STUDENT'")
            .andWhere("iu.status = 'ACTIVE'")
            .andWhere('u.is_active = 1')
            .andWhere('u.phone_number IS NOT NULL')
            .andWhere('LENGTH(u.phone_number) > 5')
            .distinct(true);
          
          queryPromises.push(studentQuery.getRawMany());
        }
        // CASE 2: Institute + Class IDs (no subjects)
        else if (dto.classIds?.length > 0 && !dto.subjectIds?.length) {
          const studentQuery = this.dataSource
            .createQueryBuilder()
            .select([
              'u.id as userId',
              "CONCAT(COALESCE(u.first_name, ''), ' ', COALESCE(u.last_name, '')) as name",
              "COALESCE(u.first_name, 'Student') as firstName",
              "COALESCE(u.last_name, '') as lastName",
              'u.phone_number as phoneNumber',
              "'STUDENT' as userType",
              "'STUDENT' as recipientType"
            ])
            .from('institute_class_students', 'ics')
            .innerJoin('users', 'u', 'u.id = ics.student_user_id')
            .where('ics.institute_id = :instituteId', { instituteId })
            .andWhere('ics.institute_class_id IN (:...classIds)', { classIds: dto.classIds })
            .andWhere('ics.is_active = 1')
            .andWhere('u.is_active = 1')
            .andWhere('u.phone_number IS NOT NULL')
            .andWhere('LENGTH(u.phone_number) > 5')
            .distinct(true);
          
          queryPromises.push(studentQuery.getRawMany());
        }
        // CASE 3: Institute + Class IDs + Subject IDs
        else if (dto.classIds?.length > 0 && dto.subjectIds?.length > 0) {
          const studentQuery = this.dataSource
            .createQueryBuilder()
            .select([
              'u.id as userId',
              "CONCAT(COALESCE(u.first_name, ''), ' ', COALESCE(u.last_name, '')) as name",
              "COALESCE(u.first_name, 'Student') as firstName",
              "COALESCE(u.last_name, '') as lastName",
              'u.phone_number as phoneNumber',
              "'STUDENT' as userType",
              "'STUDENT' as recipientType"
            ])
            .from('institute_class_subject_students', 'icss')
            .innerJoin('users', 'u', 'u.id = icss.student_id')
            .where('icss.institute_id = :instituteId', { instituteId })
            .andWhere('icss.class_id IN (:...classIds)', { classIds: dto.classIds })
            .andWhere('icss.subject_id IN (:...subjectIds)', { subjectIds: dto.subjectIds })
            .andWhere('icss.is_active = 1')
            .andWhere('u.is_active = 1')
            .andWhere('u.phone_number IS NOT NULL')
            .andWhere('LENGTH(u.phone_number) > 5')
            .distinct(true);
          
          queryPromises.push(studentQuery.getRawMany());
        }
        // CASE 4: Institute + Subject IDs only (no classes)
        else if (!dto.classIds?.length && dto.subjectIds?.length > 0) {
          const studentQuery = this.dataSource
            .createQueryBuilder()
            .select([
              'u.id as userId',
              "CONCAT(COALESCE(u.first_name, ''), ' ', COALESCE(u.last_name, '')) as name",
              "COALESCE(u.first_name, 'Student') as firstName",
              "COALESCE(u.last_name, '') as lastName",
              'u.phone_number as phoneNumber',
              "'STUDENT' as userType",
              "'STUDENT' as recipientType"
            ])
            .from('institute_class_subject_students', 'icss')
            .innerJoin('users', 'u', 'u.id = icss.student_id')
            .where('icss.institute_id = :instituteId', { instituteId })
            .andWhere('icss.subject_id IN (:...subjectIds)', { subjectIds: dto.subjectIds })
            .andWhere('icss.is_active = 1')
            .andWhere('u.is_active = 1')
            .andWhere('u.phone_number IS NOT NULL')
            .andWhere('LENGTH(u.phone_number) > 5')
            .distinct(true);
          
          queryPromises.push(studentQuery.getRawMany());
        }
      }

      if (includeTeachers) {
        const teacherQuery = this.dataSource
          .createQueryBuilder()
          .select([
            'u.id as userId',
            "CONCAT(COALESCE(u.first_name, ''), ' ', COALESCE(u.last_name, '')) as name",
            "COALESCE(u.first_name, 'Teacher') as firstName",
            "COALESCE(u.last_name, '') as lastName",
            'u.phone_number as phoneNumber',
            "'TEACHER' as userType",
            "'TEACHER' as recipientType"
          ])
          .from('institute_user', 'iu')
          .innerJoin('users', 'u', 'u.id = iu.user_id')
          .where('iu.institute_id = :instituteId', { instituteId })
          .andWhere("iu.institute_user_type = 'TEACHER'")
          .andWhere('u.is_active = 1')
          .andWhere('u.phone_number IS NOT NULL')
          .andWhere('LENGTH(u.phone_number) > 5')
          .distinct(true);
        
        queryPromises.push(teacherQuery.getRawMany());
      }

      if (includeParents) {
        const parentQueryBuilder = this.dataSource
          .createQueryBuilder()
          .select([
            'u.id as userId',
            "CONCAT(COALESCE(u.first_name, ''), ' ', COALESCE(u.last_name, '')) as name",
            "COALESCE(u.first_name, 'Parent') as firstName",
            "COALESCE(u.last_name, '') as lastName",
            'u.phone_number as phoneNumber',
            "'PARENT' as userType",
            "'PARENT' as recipientType"
          ])
          .from('institute_class_students', 'ics')
          .innerJoin('students', 's', 's.user_id = ics.student_user_id')
          .innerJoin('parents', 'p', 'p.user_id = s.father_id OR p.user_id = s.mother_id OR p.user_id = s.guardian_id')
          .innerJoin('users', 'u', 'u.id = p.user_id')
          .where('ics.institute_id = :instituteId', { instituteId })
          .andWhere('ics.is_active = 1')
          .andWhere('p.is_active = 1')
          .andWhere('u.is_active = 1')
          .andWhere('u.phone_number IS NOT NULL')
          .andWhere('LENGTH(u.phone_number) > 5')
          .distinct(true);
        
        // Apply class filter if provided
        if (dto.classIds?.length > 0) {
          parentQueryBuilder.andWhere('ics.institute_class_id IN (:...classIds)', { classIds: dto.classIds });
        }
        
        queryPromises.push(parentQueryBuilder.getRawMany());
      }

      if (includeAdmin) {
        const adminQuery = this.dataSource
          .createQueryBuilder()
          .select([
            'u.id as userId',
            "CONCAT(COALESCE(u.first_name, ''), ' ', COALESCE(u.last_name, '')) as name",
            "COALESCE(u.first_name, 'Admin') as firstName",
            "COALESCE(u.last_name, '') as lastName",
            'u.phone_number as phoneNumber',
            'iu.institute_user_type as userType',
            "'ADMIN' as recipientType"
          ])
          .from('institute_user', 'iu')
          .innerJoin('users', 'u', 'u.id = iu.user_id')
          .where('iu.institute_id = :instituteId', { instituteId })
          .andWhere("iu.institute_user_type = 'INSTITUTE_ADMIN'")
          .andWhere('u.is_active = 1')
          .andWhere('u.phone_number IS NOT NULL')
          .andWhere('LENGTH(u.phone_number) > 5')
          .distinct(true);
        
        queryPromises.push(adminQuery.getRawMany());
      }

      if (queryPromises.length === 0) {
        return [];
      }

      // Execute all queries in parallel and combine results
      const allResults = await Promise.all(queryPromises);
      const rawRecipients = allResults.flat();
      // Remove duplicates based on userId (in case of overlaps)
      const uniqueRecipients = Array.from(
        new Map(rawRecipients.map((r: any) => [r.userId, r])).values()
      );
      return uniqueRecipients;
      
    } catch (error) {
      this.logger.error(`❌ Error fetching recipients: ${error.message}`, error.stack);
      throw new BadRequestException(`Failed to fetch recipients: ${error.message}`);
    }
  }

  /**
   * ⚡ OPTIMIZED: Get recipient count using COUNT queries (no data fetching)
   * This is 10-100x faster than fetching all records and counting them
   */
  private async getRecipientCountByType(
    instituteId: string,
    dto: SmsRecipientFilterDto
  ): Promise<RecipientBreakdown> {
    const includeStudents = dto.recipientTypes.includes(RecipientFilterType.STUDENTS) || dto.recipientTypes.includes(RecipientFilterType.ALL);
    const includeTeachers = dto.recipientTypes.includes(RecipientFilterType.TEACHERS) || dto.recipientTypes.includes(RecipientFilterType.ALL);
    const includeParents = dto.recipientTypes.includes(RecipientFilterType.PARENTS) || dto.recipientTypes.includes(RecipientFilterType.ALL);
    const includeAdmin = dto.recipientTypes.includes(RecipientFilterType.ADMIN) || dto.recipientTypes.includes(RecipientFilterType.ALL);

    const breakdown: RecipientBreakdown = {
      students: 0,
      teachers: 0,
      parents: 0,
      admin: 0
    };

    try {
      // ⚡ COUNT STUDENTS
      if (includeStudents) {
        let studentQuery = '';
        let studentParams: any[] = [];
        
        // Case 1: No filters - count all students
        if (!dto.classIds?.length && !dto.subjectIds?.length) {
          studentQuery = `
            SELECT COUNT(DISTINCT u.id) as count
            FROM institute_user iu
            INNER JOIN users u ON u.id = iu.user_id
            WHERE iu.institute_id = ?
              AND iu.institute_user_type = 'STUDENT'
              AND iu.status = 'ACTIVE'
              AND u.is_active = 1
              AND u.phone_number IS NOT NULL
              AND u.phone_number != ''
          `;
          studentParams = [instituteId];
        }
        // Case 2: Classes only
        else if (dto.classIds?.length > 0 && !dto.subjectIds?.length) {
          const classPlaceholders = dto.classIds.map(() => '?').join(', ');
          studentQuery = `
            SELECT COUNT(DISTINCT u.id) as count
            FROM institute_class_students ics
            INNER JOIN users u ON u.id = ics.student_user_id
            WHERE ics.institute_id = ?
              AND ics.institute_class_id IN (${classPlaceholders})
              AND ics.is_active = 1
              AND u.is_active = 1
              AND u.phone_number IS NOT NULL
              AND u.phone_number != ''
          `;
          studentParams = [instituteId, ...dto.classIds];
        }
        // Case 3: Both classes and subjects
        else if (dto.classIds?.length > 0 && dto.subjectIds?.length > 0) {
          const classPlaceholders = dto.classIds.map(() => '?').join(', ');
          const subjectPlaceholders = dto.subjectIds.map(() => '?').join(', ');
          studentQuery = `
            SELECT COUNT(DISTINCT u.id) as count
            FROM institute_class_subject_students icss
            INNER JOIN users u ON u.id = icss.student_id
            WHERE icss.institute_id = ?
              AND icss.class_id IN (${classPlaceholders})
              AND icss.subject_id IN (${subjectPlaceholders})
              AND icss.is_active = 1
              AND u.is_active = 1
              AND u.phone_number IS NOT NULL
              AND u.phone_number != ''
          `;
          studentParams = [instituteId, ...dto.classIds, ...dto.subjectIds];
        }
        // Case 4: Subjects only
        else if (!dto.classIds?.length && dto.subjectIds?.length > 0) {
          const subjectPlaceholders = dto.subjectIds.map(() => '?').join(', ');
          studentQuery = `
            SELECT COUNT(DISTINCT u.id) as count
            FROM institute_class_subject_students icss
            INNER JOIN users u ON u.id = icss.student_id
            WHERE icss.institute_id = ?
              AND icss.subject_id IN (${subjectPlaceholders})
              AND icss.is_active = 1
              AND u.is_active = 1
              AND u.phone_number IS NOT NULL
              AND u.phone_number != ''
          `;
          studentParams = [instituteId, ...dto.subjectIds];
        }

        if (studentQuery) {
          const result = await this.dataSource.query(studentQuery, studentParams);
          breakdown.students = parseInt(result[0]?.count || '0', 10);
        }
      }

      // ⚡ COUNT TEACHERS
      if (includeTeachers) {
        const teacherQuery = `
          SELECT COUNT(DISTINCT u.id) as count
          FROM institute_user iu
          INNER JOIN users u ON u.id = iu.user_id
          WHERE iu.institute_id = ?
            AND iu.institute_user_type = 'TEACHER'
            AND iu.status = 'ACTIVE'
            AND u.is_active = 1
            AND u.phone_number IS NOT NULL
            AND u.phone_number != ''
        `;
        const result = await this.dataSource.query(teacherQuery, [instituteId]);
        breakdown.teachers = parseInt(result[0]?.count || '0', 10);
      }

      // ⚡ COUNT PARENTS
      if (includeParents) {
        let parentQuery = '';
        let parentParams: any[] = [];
        
        if (dto.classIds?.length > 0) {
          const classPlaceholders = dto.classIds.map(() => '?').join(', ');
          parentQuery = `
            SELECT COUNT(DISTINCT u.id) as count
            FROM institute_class_students ics
            INNER JOIN students s ON s.user_id = ics.student_user_id
            INNER JOIN parents p ON (p.user_id = s.father_id OR p.user_id = s.mother_id OR p.user_id = s.guardian_id)
            INNER JOIN users u ON u.id = p.user_id
            WHERE ics.institute_id = ?
              AND ics.institute_class_id IN (${classPlaceholders})
              AND ics.is_active = 1
              AND s.is_active = 1
              AND p.is_active = 1
              AND u.is_active = 1
              AND u.phone_number IS NOT NULL
              AND u.phone_number != ''
          `;
          parentParams = [instituteId, ...dto.classIds];
        } else {
          parentQuery = `
            SELECT COUNT(DISTINCT u.id) as count
            FROM institute_class_students ics
            INNER JOIN students s ON s.user_id = ics.student_user_id
            INNER JOIN parents p ON (p.user_id = s.father_id OR p.user_id = s.mother_id OR p.user_id = s.guardian_id)
            INNER JOIN users u ON u.id = p.user_id
            WHERE ics.institute_id = ?
              AND ics.is_active = 1
              AND s.is_active = 1
              AND p.is_active = 1
              AND u.is_active = 1
              AND u.phone_number IS NOT NULL
              AND u.phone_number != ''
          `;
          parentParams = [instituteId];
        }
        
        const result = await this.dataSource.query(parentQuery, parentParams);
        breakdown.parents = parseInt(result[0]?.count || '0', 10);
      }

      // ⚡ COUNT ADMINS
      if (includeAdmin) {
        const adminQuery = `
          SELECT COUNT(DISTINCT u.id) as count
          FROM institute_user iu
          INNER JOIN users u ON u.id = iu.user_id
          WHERE iu.institute_id = ?
            AND iu.institute_user_type = 'INSTITUTE_ADMIN'
            AND iu.status = 'ACTIVE'
            AND u.is_active = 1
            AND u.phone_number IS NOT NULL
            AND u.phone_number != ''
        `;
        const result = await this.dataSource.query(adminQuery, [instituteId]);
        breakdown.admin = parseInt(result[0]?.count || '0', 10);
      }
      return breakdown;
      
    } catch (error) {
      this.logger.error(`❌ Error getting recipient counts: ${error.message}`, error.stack);
      throw new BadRequestException(`Failed to get recipient counts: ${error.message}`);
    }
  }

  private async getStudentRecipients(instituteId: string, dto: SmsRecipientFilterDto): Promise<any[]> {
    let studentUserIds: string[] = [];

    // CASE 1: Only Institute ID → Get all students from institute_user table
    if (!dto.classIds?.length && !dto.subjectIds?.length) {
      const instituteUsers = await this.instituteUserRepository
        .createQueryBuilder('iu')
        .where('iu.instituteId = :instituteId', { instituteId })
        .andWhere('iu.instituteUserType = :userType', { userType: 'STUDENT' })
        .andWhere('iu.status = :status', { status: 'ACTIVE' })
        .getMany();
      
      studentUserIds = instituteUsers.map(iu => iu.userId);
    }
    // CASE 2: Institute + Class IDs (no subjects) → Get from institute_class_students
    else if (dto.classIds?.length > 0 && !dto.subjectIds?.length) {
      const classStudents = await this.instituteClassStudentRepository
        .createQueryBuilder('ics')
        .where('ics.instituteId = :instituteId', { instituteId })
        .andWhere('ics.classId IN (:...classIds)', { classIds: dto.classIds })
        .andWhere('ics.isActive = :isActive', { isActive: true })
        .getMany();
      
      studentUserIds = classStudents.map(cs => cs.studentUserId);
    }
    // CASE 3: Institute + Class IDs + Subject IDs → Get from institute_class_subject_students
    else if (dto.classIds?.length > 0 && dto.subjectIds?.length > 0) {
      const subjectStudents = await this.dataSource
        .createQueryBuilder()
        .select('icss.student_id', 'studentId')
        .from('institute_class_subject_students', 'icss')
        .where('icss.institute_id = :instituteId', { instituteId })
        .andWhere('icss.class_id IN (:...classIds)', { classIds: dto.classIds })
        .andWhere('icss.subject_id IN (:...subjectIds)', { subjectIds: dto.subjectIds })
        .andWhere('icss.is_active = :isActive', { isActive: true })
        .getRawMany();
      
      studentUserIds = subjectStudents.map(s => s.studentId);
    }
    // CASE 4: Institute + Subject IDs only (no classes) → Get from institute_class_subject_students
    else if (!dto.classIds?.length && dto.subjectIds?.length > 0) {
      const subjectStudents = await this.dataSource
        .createQueryBuilder()
        .select('icss.student_id', 'studentId')
        .from('institute_class_subject_students', 'icss')
        .where('icss.institute_id = :instituteId', { instituteId })
        .andWhere('icss.subject_id IN (:...subjectIds)', { subjectIds: dto.subjectIds })
        .andWhere('icss.is_active = :isActive', { isActive: true })
        .getRawMany();
      
      studentUserIds = subjectStudents.map(s => s.studentId);
    }

    if (studentUserIds.length === 0) {
      return [];
    }

    // Get unique student user IDs
    studentUserIds = [...new Set(studentUserIds)];
    // Now get user details for these students
    const users = await this.userRepository
      .createQueryBuilder('user')
      .where('user.id IN (:...userIds)', { userIds: studentUserIds })
      .andWhere('user.isActive = :isActive', { isActive: true })
      .getMany();
    const recipients = users.map(user => {
      const phoneNumber = this.normalizePhoneNumber(user.phoneNumber);
      return {
        userId: user.id,
        name: `${user.firstName || ''} ${user.lastName || ''}`.trim(),
        firstName: user.firstName || 'Student',
        lastName: user.lastName || '',
        phoneNumber: phoneNumber,
        userType: 'STUDENT',
        recipientType: 'STUDENT'
      };
    }).filter(r => r.phoneNumber && r.phoneNumber.length > 5);
    return recipients;
  }

  private async getTeacherRecipients(instituteId: string, dto: SmsRecipientFilterDto): Promise<any[]> {
    const queryBuilder = this.instituteUserRepository
      .createQueryBuilder('instituteUser')
      .leftJoinAndSelect('instituteUser.user', 'user')
      .where('instituteUser.instituteId = :instituteId', { instituteId })
      .andWhere('instituteUser.instituteUserType = :userType', { userType: 'TEACHER' })
      .andWhere('user.isActive = :isActive', { isActive: true });

    // Filter by subject IDs if specified
    if (dto.subjectIds && dto.subjectIds.length > 0) {
      queryBuilder
        .leftJoin('instituteUser.classSubjects', 'classSubject')
        .andWhere('classSubject.subjectId IN (:...subjectIds)', { subjectIds: dto.subjectIds });
    }

    // Filter by class IDs if specified (teachers assigned to specific classes)
    if (dto.classIds && dto.classIds.length > 0) {
      queryBuilder
        .leftJoin('instituteUser.classSubjects', 'teacherClass')
        .andWhere('teacherClass.classId IN (:...classIds)', { classIds: dto.classIds });
    }

    const teachers = await queryBuilder.getMany();

    return teachers.map(instituteUser => ({
      userId: instituteUser.user?.id,
      name: `${instituteUser.user?.firstName || ''} ${instituteUser.user?.lastName || ''}`.trim(),
      firstName: instituteUser.user?.firstName || 'Teacher',
      lastName: instituteUser.user?.lastName || '',
      phoneNumber: this.normalizePhoneNumber(instituteUser.user?.phoneNumber),
      userType: 'TEACHER',
      recipientType: 'TEACHER'
    })).filter(r => r.phoneNumber && r.phoneNumber.length > 5);
  }

  private async getParentRecipients(instituteId: string, dto: SmsRecipientFilterDto): Promise<any[]> {
    // Get parents through student-parent relationships
    const queryBuilder = this.instituteClassStudentRepository
      .createQueryBuilder('classStudent')
      .innerJoin('classStudent.student', 'student')
      .where('classStudent.instituteId = :instituteId', { instituteId })
      .andWhere('classStudent.isActive = :isActive', { isActive: true });

    // Filter by class IDs if specified
    if (dto.classIds && dto.classIds.length > 0) {
      queryBuilder.andWhere('classStudent.classId IN (:...classIds)', { classIds: dto.classIds });
    }

    const classStudents = await queryBuilder.getMany();
    
    // Get unique student IDs
    const studentIds = [...new Set(classStudents.map(cs => cs.studentUserId))];
    
    if (studentIds.length === 0) {
      return [];
    }

    // Get all students with their parent relationships
    const students = await this.studentRepository
      .createQueryBuilder('student')
      .where('student.userId IN (:...studentIds)', { studentIds })
      .andWhere('student.isActive = :isActive', { isActive: true })
      .getMany();

    // Collect unique parent IDs
    const parentIds = new Set<string>();
    students.forEach(student => {
      if (student.fatherId) parentIds.add(student.fatherId);
      if (student.motherId) parentIds.add(student.motherId);
      if (student.guardianId) parentIds.add(student.guardianId);
    });

    if (parentIds.size === 0) {
      return [];
    }

    // Get parent users
    const parents = await this.parentRepository
      .createQueryBuilder('parent')
      .innerJoinAndSelect('parent.user', 'user')
      .where('parent.userId IN (:...parentIds)', { parentIds: Array.from(parentIds) })
      .andWhere('parent.isActive = :isActive', { isActive: true })
      .andWhere('user.isActive = :isActive', { isActive: true })
      .getMany();

    return parents.map(parent => ({
      userId: parent.user?.id,
      name: `${parent.user?.firstName || ''} ${parent.user?.lastName || ''}`.trim(),
      firstName: parent.user?.firstName || 'Parent',
      lastName: parent.user?.lastName || '',
      phoneNumber: this.normalizePhoneNumber(parent.user?.phoneNumber),
      userType: 'PARENT',
      recipientType: 'PARENT'
    })).filter(r => r.phoneNumber && r.phoneNumber.length > 5);
  }

  private async getAdminRecipients(instituteId: string): Promise<any[]> {
    const admins = await this.instituteUserRepository
      .createQueryBuilder('instituteUser')
      .leftJoinAndSelect('instituteUser.user', 'user')
      .where('instituteUser.instituteId = :instituteId', { instituteId })
      .andWhere('instituteUser.instituteUserType IN (:...userTypes)', { 
        userTypes: ['INSTITUTE_ADMIN'] 
      })
      .andWhere('user.isActive = :isActive', { isActive: true })
      .getMany();

    return admins.map(instituteUser => ({
      userId: instituteUser.user?.id,
      name: `${instituteUser.user?.firstName || ''} ${instituteUser.user?.lastName || ''}`.trim(),
      firstName: instituteUser.user?.firstName || 'Admin',
      lastName: instituteUser.user?.lastName || '',
      phoneNumber: this.normalizePhoneNumber(instituteUser.user?.phoneNumber),
      userType: instituteUser.instituteUserType,
      recipientType: 'ADMIN'
    })).filter(r => r.phoneNumber && r.phoneNumber.length > 5);
  }

  private createRecipientBreakdown(recipients: any[]): any {
    return {
      students: recipients.filter(r => r.userType === 'STUDENT').length,
      teachers: recipients.filter(r => r.userType === 'TEACHER').length,
      parents: recipients.filter(r => r.userType === 'PARENT').length,
      admin: recipients.filter(r => r.userType === 'ADMIN').length,
    };
  }

  private determineSmsType(recipientType: RecipientFilterType, classIds?: string[], subjectIds?: string[]): string {
    if (recipientType === RecipientFilterType.CUSTOM) return SmsMessageType.CUSTOM_NUMBERS;
    if (recipientType !== RecipientFilterType.ALL) return SmsMessageType.USER_TYPE_BASED;
    if (classIds?.length || subjectIds?.length) return SmsMessageType.CLASS_BASED;
    return SmsMessageType.BULK_INSTITUTE_USERS;
  }

  private logToDynamoDBFireAndForget(messageId: string, recipients: any[], messageTemplate: string, instituteId: string): void {
    setImmediate(async () => {
      try {
        for (const recipient of recipients) {
          await this.notificationLoggingService.logSmsNotification({
            messageId,
            phoneNumber: recipient.phoneNumber,
            recipientName: recipient.name,
            messageContent: messageTemplate,
            instituteId,
            recipientType: 'SMS_RECIPIENT',
            status: 'QUEUED',
          });
        }
      } catch (error) {
        this.logger.warn(`⚠️ DynamoDB logging failed for message ${messageId}: ${error.message}`);
      }
    });
  }

  private async deductCreditsAfterDelivery(instituteId: string, successfulSends: number): Promise<void> {
    try {
      await this.instituteCreditsService.deductCredits(instituteId, {
        amount: successfulSends,
        type: CreditTransactionType.SMS_SEND,
        referenceType: 'SMS_DELIVERY',
        description: `SMS delivery: ${successfulSends} messages sent`,
      });
    } catch (error) {
      this.logger.error(`❌ Failed to deduct credits for institute ${instituteId}: ${error.message}`);
      // Fallback: atomic deduction without ledger
      await this.instituteCreditsService.deductCreditsAtomic(instituteId, successfulSends);
    }

    // Invalidate cache
    this.invalidateInstituteCache(instituteId);
  }

  private async updateMessageFinalStatus(messageId: string, result: SmsDeliveryResultDto): Promise<void> {
    const status = result.failed === 0 ? SmsMessageStatus.SENT : 
                   result.successful === 0 ? SmsMessageStatus.FAILED : 
                   SmsMessageStatus.PARTIALLY_SENT;

    await this.smsMessageRepository.update(messageId, {
      status,
      successfulSends: result.successful,
      failedSends: result.failed,
      creditsUsed: result.successful,
      completedAt: now()
    });
  }

  private async createUnlimitedCredentials(instituteId: string): Promise<InstituteSmsCredentialsEntity> {
    return await this.smsCredentialsRepository.save({
      id: uuidv4(),
      instituteId,
      isActive: true,
      verificationStage: SmsVerificationStage.UNLIMITED,
      currentCredits: 0,
      totalPurchased: 0,
      totalUsed: 0,
      dailyUsed: 0,
      monthlyUsed: 0,
      senderMasks: [{
        maskId: 'SYSTEM_ADMIN',
        displayName: 'System Admin',
        phoneNumber: 'N/A',
        isActive: true
      }],
      createdAt: now(),
      updatedAt: now(),
    });
  }

  /**
   * 🧪 TEST METHODS FOR EMAIL SERVICE
   */

  /**
   * Test email service connection
   */
  async testEmailService(): Promise<{ success: boolean; message: string; details?: any }> {
    try {
      const result = await this.enhancedEmailService.testConnection();
      return result;
    } catch (error) {
      this.logger.error(`Email service test failed: ${error.message}`);
      return {
        success: false,
        message: `Email service test failed: ${error.message}`,
        details: {
          error: error.message,
          stack: error.stack
        }
      };
    }
  }

  /**
   * Send test payment submission email
   */
  async testPaymentSubmissionEmail(
    email: string,
    userName: string
  ): Promise<{ success: boolean; message: string }> {
    try {
      const result = await this.enhancedEmailService.sendPaymentSubmissionEmail({
        userEmail: email,
        userName: userName,
        submissionId: 'TEST-' + Date.now(),
        instituteId: 'TEST-INSTITUTE',
        requestedCredits: 5000,
        paymentAmount: 25000.00,
        paymentMethod: 'Bank Transfer',
        paymentReference: 'TEST-REF-' + Date.now(),
        submissionNotes: 'This is a test payment submission email',
        paymentSlipUrl: '',
        submittedAt: getCurrentSriLankaISO(),
      });

      if (result) {
        return {
          success: true,
          message: `Test payment submission email sent successfully to ${email}`
        };
      } else {
        return {
          success: false,
          message: `Failed to send test email - email service may be disabled or misconfigured`
        };
      }
    } catch (error) {
      this.logger.error(`Test payment submission email failed: ${error.message}`);
      return {
        success: false,
        message: `Error: ${error.message}`
      };
    }
  }

  /**
   * Send test payment approved email
   */
  async testPaymentApprovedEmail(
    email: string,
    userName: string
  ): Promise<{ success: boolean; message: string }> {
    try {
      const result = await this.enhancedEmailService.sendPaymentApprovedEmail({
        userEmail: email,
        userName: userName,
        submissionId: 'TEST-' + Date.now(),
        instituteId: 'TEST-INSTITUTE',
        creditsGranted: 5000,
        verifiedAt: getCurrentSriLankaISO(),
        adminNotes: 'This is a test payment approved email. Your payment has been verified and credits have been added to your account.',
      });

      if (result) {
        return {
          success: true,
          message: `Test payment approved email sent successfully to ${email}`
        };
      } else {
        return {
          success: false,
          message: `Failed to send test email - email service may be disabled or misconfigured`
        };
      }
    } catch (error) {
      this.logger.error(`Test payment approved email failed: ${error.message}`);
      return {
        success: false,
        message: `Error: ${error.message}`
      };
    }
  }

  /**
   * Send test payment rejected email
   */
  async testPaymentRejectedEmail(
    email: string,
    userName: string
  ): Promise<{ success: boolean; message: string }> {
    try {
      const result = await this.enhancedEmailService.sendPaymentRejectedEmail({
        userEmail: email,
        userName: userName,
        submissionId: 'TEST-' + Date.now(),
        instituteId: 'TEST-INSTITUTE',
        rejectionReason: 'Unclear payment slip - Unable to verify transaction details',
        verifiedAt: getCurrentSriLankaISO(),
        adminNotes: 'This is a test payment rejected email. Please resubmit with a clear payment slip showing: Transaction ID, Amount, Date, and Bank details.',
      });

      if (result) {
        return {
          success: true,
          message: `Test payment rejected email sent successfully to ${email}`
        };
      } else {
        return {
          success: false,
          message: `Failed to send test email - email service may be disabled or misconfigured`
        };
      }
    } catch (error) {
      this.logger.error(`Test payment rejected email failed: ${error.message}`);
      return {
        success: false,
        message: `Error: ${error.message}`
      };
    }
  }
}
