import { Injectable, Logger, BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThanOrEqual } from 'typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import { AccountDeletionRequestEntity, DeletionRequestStatus } from './entities/account-deletion-request.entity';
import { UsersService } from '../user/user.service';
import { now } from '../../common/utils/timezone.util';

@Injectable()
export class AccountDeletionService {
  private readonly logger = new Logger(AccountDeletionService.name);

  /** Grace period in days before permanent deletion */
  private readonly GRACE_PERIOD_DAYS = 30;

  constructor(
    @InjectRepository(AccountDeletionRequestEntity)
    private readonly deletionRepository: Repository<AccountDeletionRequestEntity>,
    private readonly usersService: UsersService,
  ) {}

  /**
   * Request account deletion (authenticated user).
   * 1. Deactivates the account immediately (isActive = false)
   * 2. Creates a deletion record scheduled for 30 days from now
   */
  async requestDeletion(userId: string, reason?: string, ip?: string): Promise<{
    success: boolean;
    message: string;
    scheduledDeletionDate: Date;
  }> {
    // Check for existing pending deletion request
    const existing = await this.deletionRepository.findOne({
      where: { userId, status: DeletionRequestStatus.PENDING },
    });

    if (existing) {
      throw new ConflictException(
        `Account deletion already requested. Your account is scheduled for permanent deletion on ${existing.scheduledDeletionDate.toISOString().split('T')[0]}.`,
      );
    }

    // Calculate scheduled deletion date (30 days from now)
    const scheduledDate = new Date(now());
    scheduledDate.setDate(scheduledDate.getDate() + this.GRACE_PERIOD_DAYS);

    // Step 1: Deactivate the user immediately
    try {
      await this.usersService.softDelete(userId);
      this.logger.log(`User ${userId} deactivated for account deletion request`);
    } catch (error) {
      this.logger.error(`Failed to deactivate user ${userId}: ${error.message}`);
      throw new BadRequestException('Failed to deactivate account. Please try again.');
    }

    // Step 2: Create the deletion request record
    const deletionRequest = this.deletionRepository.create({
      userId,
      reason: reason || null,
      status: DeletionRequestStatus.PENDING,
      scheduledDeletionDate: scheduledDate,
      requesterIp: ip || null,
      createdAt: now(),
      updatedAt: now(),
    });

    await this.deletionRepository.save(deletionRequest);
    this.logger.log(`Account deletion request created for user ${userId}, scheduled for ${scheduledDate.toISOString()}`);

    return {
      success: true,
      message: `Your account has been deactivated and is scheduled for permanent deletion on ${scheduledDate.toISOString().split('T')[0]}. You can cancel this within ${this.GRACE_PERIOD_DAYS} days by contacting support.`,
      scheduledDeletionDate: scheduledDate,
    };
  }

  /**
   * Cancel a pending deletion request (re-activate the account).
   * Can be called by the user (if they regain access) or an admin.
   */
  async cancelDeletion(userId: string, cancelledBy?: string): Promise<{
    success: boolean;
    message: string;
  }> {
    const request = await this.deletionRepository.findOne({
      where: { userId, status: DeletionRequestStatus.PENDING },
    });

    if (!request) {
      throw new NotFoundException('No pending deletion request found for this account.');
    }

    // Re-activate the user
    try {
      await this.usersService.activate(userId);
      this.logger.log(`User ${userId} re-activated after deletion cancellation`);
    } catch (error) {
      this.logger.error(`Failed to re-activate user ${userId}: ${error.message}`);
      throw new BadRequestException('Failed to re-activate account. Please contact support.');
    }

    // Update the deletion request
    request.status = DeletionRequestStatus.CANCELLED;
    request.cancelledBy = cancelledBy || userId;
    request.updatedAt = now();
    await this.deletionRepository.save(request);

    this.logger.log(`Account deletion cancelled for user ${userId}`);

    return {
      success: true,
      message: 'Account deletion has been cancelled. Your account is now active again.',
    };
  }

  /**
   * Get the current deletion status for a user.
   */
  async getDeletionStatus(userId: string): Promise<{
    hasPendingDeletion: boolean;
    status?: string;
    scheduledDeletionDate?: Date;
    requestedAt?: Date;
    reason?: string;
  }> {
    const request = await this.deletionRepository.findOne({
      where: { userId, status: DeletionRequestStatus.PENDING },
    });

    if (!request) {
      return { hasPendingDeletion: false };
    }

    return {
      hasPendingDeletion: true,
      status: request.status,
      scheduledDeletionDate: request.scheduledDeletionDate,
      requestedAt: request.createdAt,
      reason: request.reason,
    };
  }

  /**
   * CRON JOB: Runs daily at 2:00 AM (Sri Lanka time) to permanently delete
   * accounts whose 30-day grace period has expired.
   */
  @Cron('0 0 2 * * *', { name: 'account-deletion-purge', timeZone: 'Asia/Colombo' })
  async processScheduledDeletions(): Promise<void> {
    this.logger.log('🗑️ Running scheduled account deletion purge...');

    const currentDate = now();

    // Find all PENDING requests whose scheduled deletion date has passed
    const expiredRequests = await this.deletionRepository.find({
      where: {
        status: DeletionRequestStatus.PENDING,
        scheduledDeletionDate: LessThanOrEqual(currentDate),
      },
    });

    if (expiredRequests.length === 0) {
      this.logger.log('No accounts due for permanent deletion.');
      return;
    }

    this.logger.log(`Found ${expiredRequests.length} account(s) due for permanent deletion.`);

    let successCount = 0;
    let failCount = 0;

    for (const request of expiredRequests) {
      try {
        // Permanently delete the user
        await this.usersService.remove(request.userId);

        // Mark deletion as completed
        request.status = DeletionRequestStatus.COMPLETED;
        request.completedAt = now();
        request.updatedAt = now();
        await this.deletionRepository.save(request);

        successCount++;
        this.logger.log(`✅ Permanently deleted user ${request.userId}`);
      } catch (error) {
        failCount++;
        this.logger.error(`❌ Failed to permanently delete user ${request.userId}: ${error.message}`);
      }
    }

    this.logger.log(`🗑️ Account deletion purge complete: ${successCount} deleted, ${failCount} failed.`);
  }
}
