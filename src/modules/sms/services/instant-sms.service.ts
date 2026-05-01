import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { SmsCampaignEntity, SmsCampaignStatus, SmsCampaignType } from '../entities/sms-campaign.entity';
import { SmslenzProvider } from '../providers/smslenz.provider';
import { SendSingleSmsDto, SendInstantBulkSmsDto, InstantSmsResponseDto, InstantSmsCreditBalanceResponseDto } from '../dto/instant-sms.dto';
import { InstituteUserEntity } from '../../institute_mudules/institue_user/entities/institue_user.entity';
import { UserEntity } from '../../user/entities/user.entity';
import { SenderMaskValidationService } from './sender-mask-validation.service';
import { InstituteCreditsService } from '../../notification-credits/services/institute-credits.service';
import { CreditTransactionType } from '../../notification-credits/entities/institute-credit-transaction.entity';

/**
 * Simplified SMS Service
 * 
 * Features:
 * - Instant sending only (no scheduling)
 * - Same message for all recipients (no templates)
 * - Credits deducted BEFORE sending
 * - Async processing with status updates
 * - Phone number deduplication using Set
 */
@Injectable()
export class InstantSmsService {
  private readonly logger = new Logger(InstantSmsService.name);
  private readonly costPerMessage: number;

  constructor(
    @InjectRepository(SmsCampaignEntity)
    private readonly campaignRepository: Repository<SmsCampaignEntity>,
    @InjectRepository(InstituteUserEntity)
    private readonly instituteUserRepository: Repository<InstituteUserEntity>,
    @InjectRepository(UserEntity)
    private readonly userRepository: Repository<UserEntity>,
    private readonly dataSource: DataSource,
    private readonly smsProvider: SmslenzProvider,
    private readonly configService: ConfigService,
    private readonly senderMaskValidationService: SenderMaskValidationService,
    private readonly instituteCreditsService: InstituteCreditsService,
  ) {
    // Get cost per message from environment (default: 1 credit)
    this.costPerMessage = this.configService.get<number>('SMS_COST_PER_MESSAGE', 1);
  }

  /**
   * Send single SMS instantly
   */
  async sendSingleSms(dto: SendSingleSmsDto, initiatedBy: string): Promise<InstantSmsResponseDto> {
    const startTime = Date.now();

    try {
      // CRITICAL SECURITY: Validate sender mask ownership and status
      const validatedMask = await this.senderMaskValidationService.validateMaskForInstitute(
        dto.maskId,
        dto.instituteId
      );

      // Validate phone number
      if (!this.smsProvider.validatePhoneNumber(dto.contact)) {
        throw new BadRequestException('Invalid phone number format. Expected: +947XXXXXXXX');
      }

      // Check and deduct credits FIRST
      await this.deductCredits(dto.instituteId, this.costPerMessage);

      // Create campaign record with validated mask
      const timestamp = new Date();
      const campaign = this.campaignRepository.create({
        instituteId: dto.instituteId,
        senderId: validatedMask.maskId, // Use validated mask ID
        message: dto.message,
        type: SmsCampaignType.SINGLE,
        status: SmsCampaignStatus.PENDING,
        totalRecipients: 1,
        creditsDeducted: this.costPerMessage,
        initiatedBy,
        providerName: this.smsProvider.getProviderName(),
        createdAt: timestamp,
        updatedAt: timestamp
      });

      const savedCampaign = await this.campaignRepository.save(campaign);

      // Send SMS asynchronously (don't await)
      this.processSingleSms(savedCampaign.id, dto, validatedMask.maskId).catch(error => {
        this.logger.error(`Failed to process SMS campaign ${savedCampaign.id}: ${error.message}`);
      });

      const duration = Date.now() - startTime;

      return {
        success: true,
        message: 'SMS sending initiated',
        campaignId: savedCampaign.id,
        totalRecipients: 1,
        creditsDeducted: this.costPerMessage,
        status: 'SENDING',
      };
    } catch (error) {
      this.logger.error(`❌ Failed to send SMS: ${error.message}`);
      throw error;
    }
  }

  /**
   * Send bulk SMS instantly with user filtering
   */
  async sendBulkSms(dto: SendInstantBulkSmsDto, initiatedBy: string): Promise<InstantSmsResponseDto> {
    const startTime = Date.now();

    try {
      // CRITICAL SECURITY: Validate sender mask ownership and status
      const validatedMask = await this.senderMaskValidationService.validateMaskForInstitute(
        dto.maskId,
        dto.instituteId
      );

      // Extract unique phone numbers based on filters
      const phoneNumbers = await this.extractPhoneNumbers(dto);

      if (phoneNumbers.length === 0) {
        throw new BadRequestException('No valid recipients found with given filters');
      }


      // Calculate required credits
      const requiredCredits = phoneNumbers.length * this.costPerMessage;

      // Check and deduct credits FIRST
      await this.deductCredits(dto.instituteId, requiredCredits);

      // Create campaign record with validated mask
      const timestamp = new Date();
      const campaign = this.campaignRepository.create({
        instituteId: dto.instituteId,
        senderId: validatedMask.maskId, // Use validated mask ID
        message: dto.message,
        type: SmsCampaignType.BULK,
        status: SmsCampaignStatus.PENDING,
        totalRecipients: phoneNumbers.length,
        creditsDeducted: requiredCredits,
        initiatedBy,
        providerName: this.smsProvider.getProviderName(),
        createdAt: timestamp,
        updatedAt: timestamp
      });

      const savedCampaign = await this.campaignRepository.save(campaign);

      // Send SMS asynchronously (don't await)
      this.processBulkSms(savedCampaign.id, dto, phoneNumbers, validatedMask.maskId).catch(error => {
        this.logger.error(`Failed to process bulk SMS campaign ${savedCampaign.id}: ${error.message}`);
      });

      const duration = Date.now() - startTime;

      return {
        success: true,
        message: 'Bulk SMS sending initiated',
        campaignId: savedCampaign.id,
        totalRecipients: phoneNumbers.length,
        creditsDeducted: requiredCredits,
        status: 'SENDING',
      };
    } catch (error) {
      this.logger.error(`❌ Failed to send bulk SMS: ${error.message}`);
      throw error;
    }
  }

  /**
   * Extract unique phone numbers based on filters
   * Uses Set for automatic deduplication
   */
  private async extractPhoneNumbers(dto: SendInstantBulkSmsDto): Promise<string[]> {
    // If manual contacts provided, use them directly
    if (dto.contacts && dto.contacts.length > 0) {
      const uniqueContacts = new Set(dto.contacts.filter(c => this.smsProvider.validatePhoneNumber(c)));
      return Array.from(uniqueContacts);
    }

    // Build query to fetch users from institute
    const query = this.instituteUserRepository
      .createQueryBuilder('iu')
      .leftJoinAndSelect('iu.user', 'user')
      .where('iu.instituteId = :instituteId', { instituteId: dto.instituteId });

    // Apply status filter (default to ACTIVE)
    if (dto.statuses && dto.statuses.length > 0) {
      query.andWhere('iu.status IN (:...statuses)', { statuses: dto.statuses });
    } else {
      query.andWhere('iu.status = :status', { status: 'ACTIVE' });
    }

    // Apply user type filter
    if (dto.userTypes && dto.userTypes.length > 0) {
      query.andWhere('user.userType IN (:...userTypes)', { userTypes: dto.userTypes });
    }

    // Apply class filter — use subquery to find users enrolled in specified classes
    if (dto.classIds && dto.classIds.length > 0) {
      query.andWhere(
        `iu.userId IN (
          SELECT ics.student_user_id FROM institute_class_students ics
          WHERE ics.institute_id = :classInstituteId
            AND ics.institute_class_id IN (:...classIds)
            AND ics.is_active = 1
        )`,
        { classInstituteId: dto.instituteId, classIds: dto.classIds }
      );
    }

    // Apply subject filter — use subquery to find users enrolled in specified subjects
    if (dto.subjectIds && dto.subjectIds.length > 0) {
      query.andWhere(
        `iu.userId IN (
          SELECT icss.student_id FROM institute_class_subject_students icss
          WHERE icss.institute_id = :subjectInstituteId
            AND icss.subject_id IN (:...subjectIds)
            AND icss.is_active = 1
        )`,
        { subjectInstituteId: dto.instituteId, subjectIds: dto.subjectIds }
      );
    }

    const instituteUsers = await query.getMany();

    // Extract and deduplicate phone numbers using Set
    const phoneSet = new Set<string>();
    
    for (const iu of instituteUsers) {
      if (iu.user?.phoneNumber) {
        const formattedPhone = this.formatPhoneNumber(iu.user.phoneNumber);
        if (formattedPhone && this.smsProvider.validatePhoneNumber(formattedPhone)) {
          phoneSet.add(formattedPhone);
        }
      }
    }

    return Array.from(phoneSet);
  }

  /**
   * Format phone number to SMSlenz format (+947XXXXXXXX)
   */
  private formatPhoneNumber(phone: string): string {
    // Remove spaces, dashes, parentheses
    let cleaned = phone.replace(/[\s\-\(\)]/g, '');

    // Handle Sri Lankan numbers
    if (cleaned.startsWith('0')) {
      cleaned = '+94' + cleaned.substring(1);
    } else if (cleaned.startsWith('94')) {
      cleaned = '+' + cleaned;
    } else if (!cleaned.startsWith('+')) {
      cleaned = '+94' + cleaned;
    }

    return cleaned;
  }

  /**
   * Deduct credits from institute balance via centralized credits service.
   * Must be called BEFORE sending SMS to prevent race conditions.
   */
  private async deductCredits(instituteId: string, amount: number): Promise<void> {
    await this.instituteCreditsService.deductCredits(instituteId, {
      amount,
      type: CreditTransactionType.SMS_SEND,
      referenceType: 'SMS_INSTANT',
      description: `Instant SMS: ${amount} credits deducted`,
    });
  }

  /**
   * Process single SMS asynchronously
   */
  private async processSingleSms(campaignId: string, dto: SendSingleSmsDto, validatedMaskId: string): Promise<void> {
    try {
      // Update status to SENDING
      await this.campaignRepository.update(campaignId, { status: SmsCampaignStatus.SENDING });

      // Send via provider using validated mask ID
      const response = await this.smsProvider.sendSms({
        senderId: validatedMaskId,
        contact: dto.contact,
        message: dto.message,
      });

      // Update campaign with result
      if (response.success) {
        await this.campaignRepository.update(campaignId, {
          status: SmsCampaignStatus.SUCCESS,
          successfulSends: 1,
          providerCampaignId: response.data?.campaignId?.toString(),
          providerResponse: response,
          sentAt: new Date(),
        });
      } else {
        await this.campaignRepository.update(campaignId, {
          status: SmsCampaignStatus.FAILED,
          failedSends: 1,
          errorMessage: response.error,
          providerResponse: response,
        });
      }
    } catch (error) {
      this.logger.error(`Failed to process campaign ${campaignId}: ${error.message}`);
      await this.campaignRepository.update(campaignId, {
        status: SmsCampaignStatus.FAILED,
        failedSends: 1,
        errorMessage: error.message,
      });
    }
  }

  /**
   * Process bulk SMS asynchronously
   */
  private async processBulkSms(
    campaignId: string,
    dto: SendInstantBulkSmsDto,
    phoneNumbers: string[],
    validatedMaskId: string,
  ): Promise<void> {
    try {
      // Update status to SENDING
      await this.campaignRepository.update(campaignId, { status: SmsCampaignStatus.SENDING });

      // Send via provider (bulk API) using validated mask ID
      const response = await this.smsProvider.sendBulkSms({
        senderId: validatedMaskId,
        contacts: phoneNumbers,
        message: dto.message,
      });

      // Update campaign with result
      if (response.success) {
        await this.campaignRepository.update(campaignId, {
          status: SmsCampaignStatus.SUCCESS,
          successfulSends: phoneNumbers.length,
          providerCampaignId: response.data?.campaignId?.toString(),
          providerResponse: response,
          sentAt: new Date(),
        });
      } else {
        await this.campaignRepository.update(campaignId, {
          status: SmsCampaignStatus.FAILED,
          failedSends: phoneNumbers.length,
          errorMessage: response.error,
          providerResponse: response,
        });
      }
    } catch (error) {
      this.logger.error(`Failed to process bulk campaign ${campaignId}: ${error.message}`);
      await this.campaignRepository.update(campaignId, {
        status: SmsCampaignStatus.FAILED,
        failedSends: phoneNumbers.length,
        errorMessage: error.message,
      });
    }
  }

  /**
   * Get credit balance for an institute via centralized credits service.
   */
  async getCreditBalance(instituteId: string): Promise<InstantSmsCreditBalanceResponseDto> {
    const balance = await this.instituteCreditsService.getBalance(instituteId);
    return {
      instituteId: balance.instituteId,
      balance: balance.balance,
      totalPurchased: balance.totalPurchased,
      totalUsed: balance.totalUsed,
    };
  }

  /**
   * Top up credits for an institute via centralized credits service.
   */
  async topupCredits(instituteId: string, amount: number): Promise<InstantSmsCreditBalanceResponseDto> {
    const result = await this.instituteCreditsService.grantCredits(instituteId, {
      amount,
      type: CreditTransactionType.TOP_UP,
      referenceType: 'INSTANT_TOPUP',
      description: `Manual top-up: ${amount} credits`,
    });

    const balance = await this.instituteCreditsService.getBalance(instituteId);
    return {
      instituteId: balance.instituteId,
      balance: balance.balance,
      totalPurchased: balance.totalPurchased,
      totalUsed: balance.totalUsed,
    };
  }

  /**
   * Get SMS campaign details
   */
  async getCampaign(campaignId: string): Promise<SmsCampaignEntity> {
    const campaign = await this.campaignRepository.findOne({ where: { id: campaignId } });
    if (!campaign) {
      throw new NotFoundException(`Campaign ${campaignId} not found`);
    }
    return campaign;
  }

  /**
   * Get campaigns for an institute
   */
  async getCampaigns(instituteId: string, limit = 50, offset = 0): Promise<SmsCampaignEntity[]> {
    return this.campaignRepository.find({
      where: { instituteId },
      order: { createdAt: 'DESC' },
      take: limit,
      skip: offset,
    });
  }
}
