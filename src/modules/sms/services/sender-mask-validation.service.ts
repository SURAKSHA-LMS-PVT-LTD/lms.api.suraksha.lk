import { Injectable, Logger, ForbiddenException, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SenderMaskEntity, SenderMaskStatus } from '../entities/sender-mask.entity';
import { getCurrentSriLankaISO } from '../../../common/utils/timezone.util';

/**
 * Sender Mask Validation Service
 * 
 * CRITICAL SECURITY SERVICE
 * Validates that:
 * 1. Institute owns the sender mask
 * 2. Mask is in ACTIVE status
 * 3. Mask exists in database
 * 
 * NO SMS can be sent without passing these validations
 */
@Injectable()
export class SenderMaskValidationService {
  private readonly logger = new Logger(SenderMaskValidationService.name);

  constructor(
    @InjectRepository(SenderMaskEntity)
    private readonly senderMaskRepository: Repository<SenderMaskEntity>,
  ) {}

  /**
   * CRITICAL: Validate sender mask before SMS sending
   * 
   * Security checks:
   * 1. Mask exists in database
   * 2. Institute owns the mask
   * 3. Mask status is ACTIVE
   * 4. Mask is not suspended
   * 
   * @throws ForbiddenException if validation fails
   * @throws NotFoundException if mask doesn't exist
   */
  async validateMaskForInstitute(maskId: string, instituteId: string): Promise<SenderMaskEntity> {

    // 1. Check if mask exists
    const mask = await this.senderMaskRepository.findOne({
      where: { maskId },
    });

    if (!mask) {
      this.logger.error(`❌ Sender mask '${maskId}' not found in database`);
      throw new NotFoundException(
        `Sender mask '${maskId}' does not exist. Please contact support to register this mask.`,
      );
    }

    // 2. Check institute ownership
    if (mask.instituteId !== instituteId) {
      this.logger.error(
        `❌ SECURITY VIOLATION: Institute ${instituteId} attempted to use mask '${maskId}' owned by institute ${mask.instituteId}`,
      );
      throw new ForbiddenException(
        `Access denied. Sender mask '${maskId}' belongs to another institute. You can only use your own approved sender masks.`,
      );
    }

    // 3. Check if mask is ACTIVE
    if (mask.status !== SenderMaskStatus.ACTIVE) {
      this.logger.warn(`⚠️ Sender mask '${maskId}' is not active. Current status: ${mask.status}`);
      
      const statusMessages = {
        [SenderMaskStatus.PENDING]: 'This sender mask is pending approval. Please wait for provider verification.',
        [SenderMaskStatus.SUSPENDED]: 'This sender mask has been suspended. Please contact support.',
        [SenderMaskStatus.REJECTED]: `This sender mask was rejected. Reason: ${mask.rejectionReason || 'Not specified'}`,
      };

      throw new BadRequestException(
        statusMessages[mask.status] || 'This sender mask cannot be used for sending SMS.',
      );
    }

    return mask;
  }

  /**
   * Get all active masks for an institute
   */
  async getActiveMasks(instituteId: string): Promise<SenderMaskEntity[]> {
    return this.senderMaskRepository.find({
      where: {
        instituteId,
        status: SenderMaskStatus.ACTIVE,
      },
      order: {
        isDefault: 'DESC', // Default mask first
        createdAt: 'ASC',
      },
    });
  }

  /**
   * Get default mask for an institute
   */
  async getDefaultMask(instituteId: string): Promise<SenderMaskEntity> {
    const defaultMask = await this.senderMaskRepository.findOne({
      where: {
        instituteId,
        status: SenderMaskStatus.ACTIVE,
        isDefault: true,
      },
    });

    if (!defaultMask) {
      // If no default, get first active mask
      const firstActiveMask = await this.senderMaskRepository.findOne({
        where: {
          instituteId,
          status: SenderMaskStatus.ACTIVE,
        },
        order: {
          createdAt: 'ASC',
        },
      });

      if (!firstActiveMask) {
        throw new NotFoundException(
          `No active sender masks found for institute ${instituteId}. Please contact support to register a sender mask.`,
        );
      }

      return firstActiveMask;
    }

    return defaultMask;
  }

  /**
   * Get all masks for an institute (admin view)
   */
  async getAllMasks(instituteId: string): Promise<SenderMaskEntity[]> {
    return this.senderMaskRepository.find({
      where: { instituteId },
      order: {
        isDefault: 'DESC',
        status: 'ASC',
        createdAt: 'DESC',
      },
    });
  }

  /**
   * Create a new sender mask request
   */
  async createMaskRequest(
    instituteId: string,
    maskId: string,
    displayName: string,
    notes?: string,
  ): Promise<SenderMaskEntity> {
    // Check if mask ID already exists
    const existingMask = await this.senderMaskRepository.findOne({
      where: { maskId },
    });

    if (existingMask) {
      throw new BadRequestException(
        `Sender mask '${maskId}' is already registered${existingMask.instituteId === instituteId ? ' to your institute' : ' to another institute'}.`,
      );
    }

    // Validate mask ID format (alphanumeric, no spaces, 3-20 chars)
    const maskIdRegex = /^[A-Za-z0-9]{3,20}$/;
    if (!maskIdRegex.test(maskId)) {
      throw new BadRequestException(
        'Invalid sender mask format. Must be 3-20 alphanumeric characters, no spaces.',
      );
    }

    const timestamp = getCurrentSriLankaISO();
    const newMask = this.senderMaskRepository.create({
      instituteId,
      maskId,
      displayName,
      notes,
      status: SenderMaskStatus.PENDING,
      createdAt: timestamp,
      updatedAt: timestamp,
    });

    await this.senderMaskRepository.save(newMask);

    return newMask;
  }

  /**
   * Approve sender mask (admin only)
   */
  async approveMask(
    maskId: string,
    approvedBy: string,
    providerApprovalId?: string,
  ): Promise<SenderMaskEntity> {
    const mask = await this.senderMaskRepository.findOne({
      where: { maskId },
    });

    if (!mask) {
      throw new NotFoundException(`Sender mask '${maskId}' not found`);
    }

    if (mask.status === SenderMaskStatus.ACTIVE) {
      throw new BadRequestException('This sender mask is already active');
    }

    mask.status = SenderMaskStatus.ACTIVE;
    mask.approvedBy = approvedBy;
    mask.approvedAt = new Date();
    mask.providerApprovalId = providerApprovalId;

    await this.senderMaskRepository.save(mask);

    return mask;
  }

  /**
   * Reject sender mask (admin only)
   */
  async rejectMask(maskId: string, rejectionReason: string): Promise<SenderMaskEntity> {
    const mask = await this.senderMaskRepository.findOne({
      where: { maskId },
    });

    if (!mask) {
      throw new NotFoundException(`Sender mask '${maskId}' not found`);
    }

    mask.status = SenderMaskStatus.REJECTED;
    mask.rejectionReason = rejectionReason;

    await this.senderMaskRepository.save(mask);

    return mask;
  }

  /**
   * Suspend sender mask (admin only)
   */
  async suspendMask(maskId: string, reason: string): Promise<SenderMaskEntity> {
    const mask = await this.senderMaskRepository.findOne({
      where: { maskId },
    });

    if (!mask) {
      throw new NotFoundException(`Sender mask '${maskId}' not found`);
    }

    mask.status = SenderMaskStatus.SUSPENDED;
    mask.notes = `Suspended: ${reason}`;

    await this.senderMaskRepository.save(mask);

    this.logger.warn(`⚠️ Sender mask '${maskId}' suspended. Reason: ${reason}`);
    return mask;
  }

  /**
   * Set default mask for institute
   */
  async setDefaultMask(maskId: string, instituteId: string): Promise<SenderMaskEntity> {
    // Validate mask ownership and status
    const mask = await this.validateMaskForInstitute(maskId, instituteId);

    // Remove default flag from other masks
    await this.senderMaskRepository.update(
      { instituteId, isDefault: true },
      { isDefault: false },
    );

    // Set this mask as default
    mask.isDefault = true;
    await this.senderMaskRepository.save(mask);

    return mask;
  }
}
