import { Injectable, Logger, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SmsSenderMaskEntity, SenderMaskStatus } from '../entities/sms-sender-mask.entity';
import { getCurrentSriLankaISO } from '../../../common/utils/timezone.util';

/**
 * Sender Mask Service
 * 
 * Manages SMS sender masks for institutes
 * Validates that users can only send from their institute's approved masks
 */
@Injectable()
export class SenderMaskService {
  private readonly logger = new Logger(SenderMaskService.name);

  constructor(
    @InjectRepository(SmsSenderMaskEntity)
    private readonly maskRepository: Repository<SmsSenderMaskEntity>,
  ) {}

  /**
   * Get approved sender mask for institute
   * If maskId provided, validate it belongs to institute
   * Otherwise, return default mask for institute
   */
  async getApprovedMask(instituteId: string, maskId?: string): Promise<SmsSenderMaskEntity> {
    let mask: SmsSenderMaskEntity;

    if (maskId) {
      // User specified a mask - validate it belongs to their institute and is approved
      mask = await this.maskRepository.findOne({
        where: {
          id: maskId,
          instituteId,
          status: SenderMaskStatus.APPROVED,
        },
      });

      if (!mask) {
        throw new ForbiddenException(
          `Sender mask ${maskId} not found or not approved for your institute`,
        );
      }
    } else {
      // No mask specified - use institute's default
      mask = await this.maskRepository.findOne({
        where: {
          instituteId,
          isDefault: true,
          status: SenderMaskStatus.APPROVED,
        },
      });

      if (!mask) {
        throw new NotFoundException(
          `No approved default sender mask found for institute ${instituteId}. Please request a sender mask first.`,
        );
      }
    }

    return mask;
  }

  /**
   * Get all masks for an institute
   */
  async getInstituteMasks(instituteId: string): Promise<SmsSenderMaskEntity[]> {
    return this.maskRepository.find({
      where: { instituteId },
      order: { isDefault: 'DESC', createdAt: 'DESC' },
    });
  }

  /**
   * Get approved masks only for an institute
   */
  async getApprovedMasks(instituteId: string): Promise<SmsSenderMaskEntity[]> {
    return this.maskRepository.find({
      where: {
        instituteId,
        status: SenderMaskStatus.APPROVED,
      },
      order: { isDefault: 'DESC', createdAt: 'DESC' },
    });
  }

  /**
   * Request a new sender mask
   */
  async requestMask(
    instituteId: string,
    maskId: string,
    displayName: string,
    phoneNumber?: string,
  ): Promise<SmsSenderMaskEntity> {
    // Check if mask ID already exists
    const existing = await this.maskRepository.findOne({ where: { maskId } });
    if (existing) {
      throw new BadRequestException(`Sender mask ID "${maskId}" is already taken`);
    }

    // Check if this will be the first mask (make it default)
    const existingMasks = await this.maskRepository.find({ where: { instituteId } });
    const isFirst = existingMasks.length === 0;

    const timestamp = getCurrentSriLankaISO();
    const mask = this.maskRepository.create({
      instituteId,
      maskId,
      displayName,
      phoneNumber,
      isDefault: isFirst,
      status: SenderMaskStatus.PENDING,
      createdAt: timestamp,
      updatedAt: timestamp,
    });

    await this.maskRepository.save(mask);

    return mask;
  }

  /**
   * Approve a sender mask (admin only)
   */
  async approveMask(maskIdOrId: string, approvedBy: string): Promise<SmsSenderMaskEntity> {
    const mask = await this.maskRepository.findOne({
      where: [{ id: maskIdOrId }, { maskId: maskIdOrId }],
    });

    if (!mask) {
      throw new NotFoundException(`Sender mask not found`);
    }

    mask.status = SenderMaskStatus.APPROVED;
    mask.approvedAt = new Date();
    mask.approvedBy = approvedBy;

    await this.maskRepository.save(mask);

    return mask;
  }

  /**
   * Reject a sender mask (admin only)
   */
  async rejectMask(
    maskIdOrId: string,
    rejectionReason: string,
  ): Promise<SmsSenderMaskEntity> {
    const mask = await this.maskRepository.findOne({
      where: [{ id: maskIdOrId }, { maskId: maskIdOrId }],
    });

    if (!mask) {
      throw new NotFoundException(`Sender mask not found`);
    }

    mask.status = SenderMaskStatus.REJECTED;
    mask.rejectionReason = rejectionReason;

    await this.maskRepository.save(mask);

    return mask;
  }

  /**
   * Set a mask as default for institute
   */
  async setDefaultMask(instituteId: string, maskId: string): Promise<void> {
    // Remove default from all other masks
    await this.maskRepository.update(
      { instituteId, isDefault: true },
      { isDefault: false },
    );

    // Set this mask as default
    const result = await this.maskRepository.update(
      { instituteId, id: maskId },
      { isDefault: true },
    );

    if (result.affected === 0) {
      throw new NotFoundException(`Mask not found for this institute`);
    }

  }

  /**
   * Get mask by ID
   */
  async getMaskById(maskId: string): Promise<SmsSenderMaskEntity> {
    const mask = await this.maskRepository.findOne({ where: { id: maskId } });
    if (!mask) {
      throw new NotFoundException(`Sender mask not found`);
    }
    return mask;
  }

  /**
   * Get pending masks (admin only)
   */
  async getPendingMasks(): Promise<SmsSenderMaskEntity[]> {
    return this.maskRepository.find({
      where: { status: SenderMaskStatus.PENDING },
      order: { createdAt: 'ASC' },
    });
  }
}
