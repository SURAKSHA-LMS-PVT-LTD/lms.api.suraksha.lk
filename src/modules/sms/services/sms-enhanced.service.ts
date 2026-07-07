import { Injectable, Logger, BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { getCurrentSriLankaTime } from '../../../common/utils/timezone.util';

// Entities
import { InstituteSmsCredentialsEntity, SmsVerificationStage } from '../entities/institute-sms-credentials.entity';
import { InstituteSmsMessageEntity, SmsMessageStatus, SmsMessageType, RecipientFilterType } from '../entities/institute-sms-message.entity';
import { UserEntity } from '../../user/entities/user.entity';
import { InstituteUserEntity } from '../../institute_mudules/institue_user/entities/institue_user.entity';
import { StudentEntity } from '../../student/entities/student.entity';

// DTOs
import { SendBulkSmsDto, SmsResponseDto } from '../dto/sms.dto';

// Services
import { SmsProviderService } from './sms-provider.service';

/**
 * 🚀 OPTIMIZED SMS-ONLY SERVICE
 * 
 * KEY FEATURES:
 * 1. ✅ SMS ONLY (no email)
 * 2. ✅ Deduct credits BEFORE sending
 * 3. ✅ No await until sending (fast response)
 * 4. ✅ Optimized unified query
 * 5. ✅ Set-based deduplication
 * 6. ✅ Case-sensitive mask validation
 * 7. ✅ Approval workflow
 * 
 * FLOW:
 * 1. Get credentials (with default fallback)
 * 2. Validate mask (case-sensitive)
 * 3. Query phone numbers (unified, optimized)
 * 4. Calculate cost
 * 5. Deduct credits BEFORE sending
 * 6. Create campaign record
 * 7. Return fast response
 * 8. Send SMS in background (no await)
 */
@Injectable()
export class SmsEnhancedService {
  private readonly logger = new Logger(SmsEnhancedService.name);

  constructor(
    @InjectRepository(InstituteSmsCredentialsEntity)
    private readonly credentialsRepo: Repository<InstituteSmsCredentialsEntity>,
    @InjectRepository(InstituteSmsMessageEntity)
    private readonly messageRepo: Repository<InstituteSmsMessageEntity>,
    @InjectRepository(InstituteUserEntity)
    private readonly instituteUserRepo: Repository<InstituteUserEntity>,
    @InjectRepository(UserEntity)
    private readonly userRepo: Repository<UserEntity>,
    @InjectRepository(StudentEntity)
    private readonly studentRepo: Repository<StudentEntity>,
    private readonly configService: ConfigService,
    private readonly smsProviderService: SmsProviderService,
  ) {}

  /**
   * 📱 OPTIMIZED BULK SMS (SMS ONLY)
   */
  async sendBulkSmsEnhanced(
    instituteId: string,
    userId: string,
    dto: SendBulkSmsDto
  ): Promise<SmsResponseDto> {
    const startTime = Date.now();
    
    try {
      // ============================================================================
      // STEP 1: GET CREDENTIALS (with fallback)
      // ============================================================================
      const credentials = await this.getCredentialsWithFallback(instituteId);

      // ============================================================================
      // STEP 2: VALIDATE MASK (CASE-SENSITIVE)
      // ============================================================================
      this.validateMaskAccess(credentials, dto.maskId);

      // ============================================================================
      // STEP 3: GET PHONE NUMBERS (OPTIMIZED UNIFIED QUERY)
      // ============================================================================
      const phoneNumbers = await this.getRecipientPhoneNumbers(
        instituteId,
        dto.recipientTypes,
        dto.classIds,
        dto.subjectIds
      );

      const totalRecipients = phoneNumbers.size;

      if (totalRecipients === 0) {
        throw new BadRequestException('No recipients found');
      }

      // ============================================================================
      // STEP 4: CALCULATE COST
      // ============================================================================
      const costPerMessage = parseFloat(
        this.configService.get('CREDIT_PER_SMS', '1.0')
      );
      const totalCost = totalRecipients * costPerMessage;

      // ============================================================================
      // STEP 5: CHECK CREDITS & ACTIVE STATUS
      // ============================================================================
      if (!credentials.isActive) {
        throw new ForbiddenException('SMS service is not active');
      }

      if (credentials.currentCredits < totalCost) {
        throw new BadRequestException(
          `Insufficient credits. Required: ${totalCost}, Available: ${credentials.currentCredits}`
        );
      }

      // ============================================================================
      // STEP 6: DETERMINE APPROVAL REQUIRED
      // ============================================================================
      const maxBulkCount = parseInt(
        this.configService.get('SMS_MAX_BULK_COUNT_DEFAULT', '1000')
      );
      
      const requiresApproval = this.determineApprovalRequired(
        credentials.verificationStage,
        maxBulkCount,
        totalRecipients
      );

      const campaignStatus = requiresApproval 
        ? SmsMessageStatus.PENDING_VERIFICATION  // Needs admin approval
        : SmsMessageStatus.APPROVED;             // Auto-approved, ready to send

      // ============================================================================
      // STEP 7: DEDUCT CREDITS ATOMICALLY BEFORE SENDING ✅
      // ============================================================================
      if (!requiresApproval) {
        // Use a single atomic UPDATE to prevent race conditions and partial state
        const deductResult = await this.credentialsRepo
          .createQueryBuilder()
          .update()
          .set({
            currentCredits: () => `GREATEST(current_credits - ${Number(totalCost)}, 0)`,
            totalUsed: () => `total_used + ${Number(totalCost)}`,
          })
          .where('institute_id = :instituteId', { instituteId })
          .andWhere('current_credits >= :totalCost', { totalCost })
          .execute();

        if (deductResult.affected === 0) {
          throw new BadRequestException(
            `Insufficient credits (concurrent deduction detected). Please retry.`
          );
        }
      }

      // ============================================================================
      // STEP 8: CREATE CAMPAIGN RECORD
      // ============================================================================
      const campaign = await this.messageRepo.save({
        instituteId,
        sentBy: userId,
        messageType: SmsMessageType.BULK_INSTITUTE_USERS,
        recipientFilterType: (dto.recipientTypes[0] || RecipientFilterType.STUDENTS) as RecipientFilterType,
        messageTemplate: dto.messageTemplate,
        totalRecipients,
        successfulSends: 0,
        failedSends: 0,
        creditsUsed: requiresApproval ? 0 : totalCost,
        status: campaignStatus,
        maskIdUsed: dto.maskId,
        filterCriteria: {
          classIds: dto.classIds,
          subjectIds: dto.subjectIds,
          recipientTypes: dto.recipientTypes
        }
      });

      // ============================================================================
      // STEP 9: RETURN FAST RESPONSE (NO AWAIT FOR SENDING)
      // ============================================================================
      const response: SmsResponseDto = {
        success: true,
        message: requiresApproval 
          ? 'Campaign created. Pending admin approval.'
          : 'Campaign processing initiated.',
        messageId: campaign.id,
        totalRecipients,
        status: campaignStatus,
        estimatedCredits: totalRecipients,
        processingTime: `${Date.now() - startTime}ms`,
        currentCreditCount: credentials.currentCredits - (requiresApproval ? 0 : totalCost),
        costPerMessage,
        totalCost,
        remainingCreditsAfter: credentials.currentCredits - totalCost,
        requiresApproval,
        maxBulkCountAllowed: maxBulkCount,
        campaignType: 'SMS'
      };

      // ============================================================================
      // STEP 10: SEND SMS (PROMISE-BASED, NO AWAIT) ✅
      // ============================================================================
      if (!requiresApproval) {
        // Call SMS API immediately, handle response asynchronously
        this.sendSmsAndUpdateStatus(
          campaign.id,
          Array.from(phoneNumbers),
          dto.messageTemplate,
          credentials,
          dto.maskId
        ).catch(err => {
          this.logger.error(`❌ SMS API error for campaign ${campaign.id}: ${err.message}`);
        });
      }

      return response;

    } catch (error) {
      this.logger.error(`SMS error: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * 🔑 GET CREDENTIALS WITH DEFAULT FALLBACK
   */
  private async getCredentialsWithFallback(
    instituteId: string
  ): Promise<InstituteSmsCredentialsEntity> {
    
    let credentials = await this.credentialsRepo.findOne({
      where: { instituteId, isActive: true }
    });

    if (!credentials) {
      
      // Return default system credentials
      return {
        instituteId,
        smsUserId: this.configService.get('DEFAULT_SMS_USER_ID'),
        smsApiKey: this.configService.get('DEFAULT_SMS_API_KEY'),
        maskIds: [this.configService.get('DEFAULT_SMS_MASK_ID', 'SurakshaLMS')],
        currentCredits: 999999,
        totalPurchased: 999999,
        totalUsed: 0,
        verificationStage: SmsVerificationStage.UNLIMITED,
        isActive: true,
      } as any;
    }

    return credentials;
  }

  /**
   * 🔒 VALIDATE MASK ACCESS (CASE-SENSITIVE)
   */
  private validateMaskAccess(
    credentials: InstituteSmsCredentialsEntity,
    requestedMaskId: string
  ): void {
    
    const hasMask = credentials.maskIds?.some(
      maskId => maskId === requestedMaskId // Exact match
    );

    if (!hasMask) {
      throw new ForbiddenException(
        `No access to mask: ${requestedMaskId}. Available: ${credentials.maskIds?.join(', ') || 'none'}`
      );
    }
  }

  /**
   * 📞 GET PHONE NUMBERS (OPTIMIZED UNIFIED QUERY)
   */
  private async getRecipientPhoneNumbers(
    instituteId: string,
    recipientTypes: RecipientFilterType[],
    classIds?: string[],
    subjectIds?: string[]
  ): Promise<Set<string>> {
    
    const phoneNumbers = new Set<string>();

    // Process each recipient type
    for (const recipientType of recipientTypes) {
      // Handle PARENT separately
      if (recipientType === RecipientFilterType.PARENTS || recipientType === RecipientFilterType.ALL) {
        const parentPhones = await this.getParentPhoneNumbers(instituteId, classIds);
        parentPhones.forEach(phone => phoneNumbers.add(phone));
      }

      // Handle main user types (STUDENT, TEACHER, ADMIN)
      const userTypes = this.getUserTypesForQuery(recipientType);
      
      if (userTypes.length > 0) {
        const mainPhones = await this.getInstituteUserPhoneNumbers(
          instituteId,
          userTypes,
          classIds,
          subjectIds
        );
        mainPhones.forEach(phone => phoneNumbers.add(phone));
      }
    }

    return phoneNumbers;
  }

  /**
   * 📱 GET INSTITUTE USER PHONE NUMBERS (ONE UNIFIED QUERY)
   */
  private async getInstituteUserPhoneNumbers(
    instituteId: string,
    userTypes: string[],
    classIds?: string[],
    subjectIds?: string[]
  ): Promise<string[]> {
    
    const query = this.instituteUserRepo
      .createQueryBuilder('iu')
      .select('DISTINCT u.phone_number', 'phoneNumber')
      .leftJoin('iu.user', 'u')
      .where('iu.instituteId = :instituteId', { instituteId })
      .andWhere('iu.instituteUserType IN (:...userTypes)', { userTypes })
      .andWhere('iu.status = :status', { status: 'ACTIVE' })
      .andWhere('u.isActive = :isActive', { isActive: true })
      .andWhere('u.phoneNumber IS NOT NULL');

    // Add class filtering
    if (classIds && classIds.length > 0) {
      query.leftJoin(
        'institute_class_students',
        'ics',
        'ics.studentId = iu.id AND iu.instituteUserType = :studentType',
        { studentType: 'STUDENT' }
      );
      
      query.leftJoin(
        'institute_class_subjects',
        'icsubj',
        'icsubj.teacherId = iu.id AND iu.instituteUserType = :teacherType',
        { teacherType: 'TEACHER' }
      );
      
      query.andWhere(
        '(ics.classId IN (:...classIds) OR icsubj.classId IN (:...classIds))',
        { classIds }
      );
    }

    // Add subject filtering
    if (subjectIds && subjectIds.length > 0) {
      if (!classIds || classIds.length === 0) {
        query.leftJoin(
          'institute_class_subjects',
          'icsubj',
          'icsubj.teacherId = iu.id'
        );
      }
      query.andWhere('icsubj.subjectId IN (:...subjectIds)', { subjectIds });
    }

    const results = await query.getRawMany();
    
    return results
      .map(r => r.phoneNumber)
      .filter(phone => phone && phone.length > 5)
      .map(phone => this.normalizePhoneNumber(phone));
  }

  /**
   * 👨‍👩‍👧 GET PARENT PHONE NUMBERS
   */
  private async getParentPhoneNumbers(
    instituteId: string,
    classIds?: string[]
  ): Promise<string[]> {
    
    const query = this.studentRepo
      .createQueryBuilder('s')
      .select([
        'father.phone_number as father_phone',
        'mother.phone_number as mother_phone',
        'guardian.phone_number as guardian_phone'
      ])
      .leftJoin('users', 'father', 'father.id = s.fatherId')
      .leftJoin('users', 'mother', 'mother.id = s.motherId')
      .leftJoin('users', 'guardian', 'guardian.id = s.guardianId')
      .where('s.instituteId = :instituteId', { instituteId });

    if (classIds && classIds.length > 0) {
      query
        .leftJoin('institute_class_students', 'ics', 'ics.studentId = s.id')
        .andWhere('ics.classId IN (:...classIds)', { classIds });
    }

    const students = await query.getRawMany();
    
    const phoneNumbers = new Set<string>();
    
    students.forEach(s => {
      if (s.father_phone) phoneNumbers.add(this.normalizePhoneNumber(s.father_phone));
      if (s.mother_phone) phoneNumbers.add(this.normalizePhoneNumber(s.mother_phone));
      if (s.guardian_phone) phoneNumbers.add(this.normalizePhoneNumber(s.guardian_phone));
    });
    
    return Array.from(phoneNumbers).filter(phone => phone && phone.length > 5);
  }

  /**
   * 📤 SEND SMS AND UPDATE STATUS (PROMISE-BASED)
   * 
   * Flow:
   * 1. Call SMS Lenz API immediately (don't await in main flow)
   * 2. SMS Lenz handles queuing internally
   * 3. When response comes back, update campaign status
   * 4. Return immediately to user (fast response)
   */
  private async sendSmsAndUpdateStatus(
    campaignId: string,
    phoneNumbers: string[],
    messageTemplate: string,
    credentials: InstituteSmsCredentialsEntity,
    maskId: string
  ): Promise<void> {
    
    const startTime = Date.now();
    
    try {
      // Record when API call was initiated
      await this.messageRepo.update(campaignId, {
        sentAt: new Date()
      });

      // Call SMS Lenz API
      // This returns a promise but we handle it asynchronously
      const result = await this.smsProviderService.sendBulkSms(
        credentials.smsUserId || this.configService.get('DEFAULT_SMS_USER_ID'),
        credentials.smsApiKey || this.configService.get('DEFAULT_SMS_API_KEY'),
        maskId,
        phoneNumbers,
        messageTemplate
      );

      const duration = Date.now() - startTime;
      
      // Determine final status based on SMS Lenz response
      const finalStatus = result.totalFailed === 0 
        ? SmsMessageStatus.SENT              // All sent successfully
        : result.totalSent === 0 
          ? SmsMessageStatus.FAILED          // All failed
          : SmsMessageStatus.PARTIALLY_SENT; // Mixed results

      // Update campaign with SMS Lenz response data
      await this.messageRepo.update(campaignId, {
        status: finalStatus,
        successfulSends: result.totalSent,
        failedSends: result.totalFailed,
        completedAt: new Date(),
        deliveryReport: {
          delivered: result.totalSent,
          failed: result.totalFailed,
          pending: 0
        }
      });

    } catch (error) {
      const duration = Date.now() - startTime;
      
      this.logger.error(
        `❌ SMS Lenz API error for campaign ${campaignId} (${duration}ms): ` +
        `${error.message}`
      );
      
      // Update campaign with error status
      await this.messageRepo.update(campaignId, {
        status: SmsMessageStatus.FAILED,
        errorMessage: error.message,
        failedSends: phoneNumbers.length,
        completedAt: new Date()
      });
    }
  }

  /**
   * ✅ DETERMINE APPROVAL REQUIRED BASED ON VERIFICATION STAGE
   * 
   * Logic:
   * - VERIFICATION_REQUIRED: ALWAYS needs approval (every single message)
   * - PRE_APPROVED: Only needs approval if exceeds maxBulkCount
   * - UNLIMITED: NEVER needs approval (full trust)
   */
  private determineApprovalRequired(
    verificationStage: SmsVerificationStage,
    maxBulkCount: number,
    recipientCount: number
  ): boolean {
    
    // VERIFICATION_REQUIRED: ALWAYS needs approval (even for single message)
    if (verificationStage === SmsVerificationStage.VERIFICATION_REQUIRED) {
      return true;
    }
    
    // UNLIMITED: NEVER needs approval (full trust, any volume)
    if (verificationStage === SmsVerificationStage.UNLIMITED) {
      return false;
    }
    
    // PRE_APPROVED: Only needs approval if exceeds max bulk count
    if (verificationStage === SmsVerificationStage.PRE_APPROVED) {
      // No limit set (0 or null) = no approval needed
      if (!maxBulkCount || maxBulkCount === 0) {
        return false;
      }
      
      // Check if exceeds limit
      const requiresApproval = recipientCount > maxBulkCount;
      
      if (requiresApproval) {
        // Approval required
      } else {
        // Approval not required
      }
      
      return requiresApproval;
    }
    
    // Default: require approval (safety net)
    this.logger.warn(`⚠️ Unknown verification stage → Approval REQUIRED (safety default)`);
    return true;
  }

  /**
   * 👨‍💼 ADMIN: APPROVE CAMPAIGN
   */
  async approveCampaign(
    campaignId: string,
    adminId: string,
    notes?: string
  ): Promise<{ success: boolean; message: string }> {
    
    
    const campaign = await this.messageRepo.findOne({
      where: { id: campaignId, status: SmsMessageStatus.PENDING_VERIFICATION }
    });

    if (!campaign) {
      throw new NotFoundException('Pending campaign not found');
    }

    // Get phone numbers again
    const recipientTypesArray = campaign.filterCriteria?.recipientTypes as RecipientFilterType[] 
      || [campaign.recipientFilterType];
      
    const phoneNumbers = await this.getRecipientPhoneNumbers(
      campaign.instituteId,
      recipientTypesArray,
      campaign.filterCriteria?.classIds,
      campaign.filterCriteria?.subjectIds
    );

    if (phoneNumbers.size === 0) {
      throw new BadRequestException('No recipients found for this campaign');
    }

    // Deduct credits now (wasn't deducted when campaign was created)
    const costPerMessage = parseFloat(this.configService.get('CREDIT_PER_SMS', '1.0'));
    const totalCost = phoneNumbers.size * costPerMessage;


    await this.credentialsRepo.decrement(
      { instituteId: campaign.instituteId },
      'currentCredits',
      totalCost
    );

    await this.credentialsRepo.increment(
      { instituteId: campaign.instituteId },
      'totalUsed',
      totalCost
    );

    // Update campaign status to APPROVED (admin approved, ready to send)
    campaign.status = SmsMessageStatus.APPROVED;
    campaign.approvedBy = adminId;
    campaign.approvedAt = new Date();
    campaign.creditsUsed = totalCost;
    await this.messageRepo.save(campaign);


    // Get credentials
    const credentials = await this.getCredentialsWithFallback(campaign.instituteId);

    // Call SMS Lenz API (promise-based, no await - handle response asynchronously)
    this.sendSmsAndUpdateStatus(
      campaignId,
      Array.from(phoneNumbers),
      campaign.messageTemplate,
      credentials,
      campaign.maskIdUsed || this.configService.get('DEFAULT_SMS_MASK_ID')
    ).catch(err => 
      this.logger.error(`❌ SMS API call failed for campaign ${campaignId}: ${err.message}`)
    );

    return {
      success: true,
      message: 'Campaign approved and processing started'
    };
  }

  /**
   * ❌ ADMIN: REJECT CAMPAIGN
   */
  async rejectCampaign(
    campaignId: string,
    adminId: string,
    rejectionReason: string,
    notes?: string
  ): Promise<{ success: boolean; message: string }> {
    
    
    const campaign = await this.messageRepo.findOne({
      where: { id: campaignId, status: SmsMessageStatus.PENDING_VERIFICATION }
    });

    if (!campaign) {
      throw new NotFoundException('Pending campaign not found');
    }

    // Update campaign status to REJECTED (final status)
    campaign.status = SmsMessageStatus.REJECTED;
    campaign.rejectionReason = rejectionReason;
    campaign.approvedBy = adminId;  // Track who rejected
    campaign.approvedAt = new Date();
    await this.messageRepo.save(campaign);


    return {
      success: true,
      message: 'Campaign rejected successfully'
    };
  }

  /**
   * 📋 ADMIN: GET PENDING CAMPAIGN APPROVALS
   */
  async getPendingCampaignApprovals(
    page: number = 1,
    limit: number = 10,
    instituteId?: string
  ): Promise<any> {
    
    const queryBuilder = this.messageRepo
      .createQueryBuilder('message')
      .leftJoinAndSelect('message.institute', 'institute')
      .leftJoinAndSelect('message.sender', 'sender')
      .where('message.status = :status', { 
        status: SmsMessageStatus.PENDING_VERIFICATION 
      })
      .orderBy('message.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    // Optional filter by institute
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
      createdAt: campaign.createdAt.toISOString(),
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
   * 🔧 HELPER METHODS
   */
  private getUserTypesForQuery(recipientType: RecipientFilterType): string[] {
    switch (recipientType) {
      case RecipientFilterType.STUDENTS:
        return ['STUDENT'];
      case RecipientFilterType.TEACHERS:
        return ['TEACHER'];
      case RecipientFilterType.ADMIN:
        return ['INSTITUTE_ADMIN'];
      case RecipientFilterType.ALL:
        return ['STUDENT', 'TEACHER', 'INSTITUTE_ADMIN'];
      default:
        return [];
    }
  }

  private normalizePhoneNumber(phone: string): string {
    if (!phone) return '';
    
    let cleaned = phone.replace(/\D/g, '');
    
    if (cleaned.startsWith('0')) {
      cleaned = '94' + cleaned.substring(1);
    }
    
    if (!cleaned.startsWith('+')) {
      cleaned = '+' + cleaned;
    }
    
    return cleaned;
  }
}
