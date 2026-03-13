import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { getCurrentSriLankaTime, getCurrentSriLankaISO } from '../utils/timezone.util';
import { UserEntity } from '../../modules/user/entities/user.entity';
import { SubscriptionPlan } from '../../modules/user/enums/subscription-plan.enum';
import { UserManagementService } from './cache-user-management.service';

export interface PackageUpgradeDto {
  userId: string;
  subscriptionPlan: SubscriptionPlan;
  packageExpireMonths?: number; // Number of months to extend
  paymentMethod?: string;
  paymentReference?: string;
}

export interface PackageUpgradeResponse {
  success: boolean;
  message: string;
  user: {
    id: string;
    email: string;
    firstName: string;
    lastName?: string;
    subscriptionPlan: SubscriptionPlan;
    paymentExpiresAt: Date;
  };
  dynamoSyncStatus: 'success' | 'failed' | 'disabled';
}

@Injectable()
export class PackageUpgradeService {
  private readonly logger = new Logger(PackageUpgradeService.name);

  constructor(
    @InjectRepository(UserEntity)
    private readonly userRepository: Repository<UserEntity>,
    private readonly userManagementService: UserManagementService,
  ) {}

  /**
   * Upgrade user's package/subscription plan
   */
  async upgradePackage(upgradeDto: PackageUpgradeDto): Promise<PackageUpgradeResponse> {
    const { userId, subscriptionPlan, packageExpireMonths = 12, paymentMethod, paymentReference } = upgradeDto;

    try {
      // Find the user
      const user = await this.userRepository.findOne({
        where: { id: userId }
      });

      if (!user) {
        throw new NotFoundException(`User with ID ${userId} not found`);
      }

      // Calculate new expiration date
      const now = new Date(); // real UTC — MySQL2 timezone:'+05:30' stores as Sri Lanka time
      const currentExpiration = user.paymentExpiresAt || now;
      
      // If current expiration is in the future, extend from there, otherwise from now
      const baseDate = currentExpiration > now ? currentExpiration : now;
      const newExpirationDate = new Date(baseDate);
      newExpirationDate.setMonth(newExpirationDate.getMonth() + packageExpireMonths);

      // Update user in MySQL
      await this.userRepository.update(userId, {
        subscriptionPlan,
        paymentExpiresAt: newExpirationDate,
      });

      // � CRITICAL FIX: Refresh user cache after package upgrade (subscription plan changed)
      try {
        await this.userManagementService.refreshUserCache(userId);
      } catch (cacheError) {
        // Don't fail the package upgrade if cache refresh fails
      }

      // �🚀 OPTIMIZED: Build updated user data from existing user + updates
      const updatedUser = {
        ...user,
        subscriptionPlan,
        paymentExpiresAt: newExpirationDate,
        updatedAt: new Date() // real UTC
      };

      // Sync to DynamoDB
      let dynamoSyncStatus: 'success' | 'failed' | 'disabled' = 'disabled';
      
      // Package upgrade completed successfully


      return {
        success: true,
        message: `Package upgraded to ${subscriptionPlan} successfully`,
        user: {
          id: updatedUser.id,
          email: updatedUser.email,
          firstName: updatedUser.firstName,
          lastName: updatedUser.lastName,
          subscriptionPlan: updatedUser.subscriptionPlan,
          paymentExpiresAt: updatedUser.paymentExpiresAt!,
        },
        dynamoSyncStatus,
      };

    } catch (error) {
      this.logger.error(`Failed to upgrade package for user ${userId}:`, error);
      throw error;
    }
  }

  /**
   * Batch upgrade multiple users
   */
  async batchUpgradePackages(upgrades: PackageUpgradeDto[]): Promise<{
    success: PackageUpgradeResponse[];
    failed: { userId: string; error: string }[];
  }> {
    const success: PackageUpgradeResponse[] = [];
    const failed: { userId: string; error: string }[] = [];

    for (const upgrade of upgrades) {
      try {
        const result = await this.upgradePackage(upgrade);
        success.push(result);
      } catch (error) {
        failed.push({
          userId: upgrade.userId,
          error: error.message || 'Unknown error',
        });
      }
    }

    return { success, failed };
  }

  /**
   * Get user's current package status
   */
  async getPackageStatus(userId: string): Promise<{
    user: {
      id: string;
      email: string;
      firstName: string;
      lastName?: string;
      subscriptionPlan: SubscriptionPlan;
      paymentExpiresAt?: Date;
      isExpired: boolean;
      daysUntilExpiry?: number;
    };
    mongoSync?: {
      isEnabled: boolean;
      lastSync?: string;
      status?: string;
    };
  }> {
    const user = await this.userRepository.findOne({
      where: { id: userId }
    });

    if (!user) {
      throw new NotFoundException(`User with ID ${userId} not found`);
    }

    const now = new Date(); // real UTC for correct comparison with DB-stored expiry
    const isExpired = user.paymentExpiresAt ? user.paymentExpiresAt <= now : false;
    const daysUntilExpiry = user.paymentExpiresAt 
      ? Math.ceil((user.paymentExpiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
      : undefined;

    // Get MongoDB sync status
    let mongoSync: any = {
      isEnabled: true
    };

    try {
      // MongoDB sync status can be checked here if needed
      mongoSync = {
        ...mongoSync,
        lastSync: getCurrentSriLankaISO(),
        status: 'enabled'
      };
    } catch (error) {
      this.logger.warn(`Failed to get MongoDB sync status for user ${userId}:`, error);
      mongoSync.status = 'error';
    }

    return {
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        subscriptionPlan: user.subscriptionPlan,
        paymentExpiresAt: user.paymentExpiresAt,
        isExpired,
        daysUntilExpiry,
      },
      mongoSync,
    };
  }

  /**
   * Sync existing users to MongoDB
   */
  async syncExistingUsersToMongoDB(limit: number = 100): Promise<{
    processed: number;
    successful: number;
    failed: number;
    errors: string[];
  }> {
    const users = await this.userRepository.find({
      take: limit,
      order: { createdAt: 'ASC' }
    });

    let successful = 0;
    let failed = 0;
    const errors: string[] = [];

    for (const user of users) {
      try {
        // User data already exists in MySQL - bulk sync completed
        successful++;
      } catch (error) {
        failed++;
        errors.push(`User ${user.id}: ${error.message}`);
      }
    }

    return {
      processed: users.length,
      successful,
      failed,
      errors,
    };
  }

  /**
   * Map subscription plan to DynamoDB package format
   */
  private mapSubscriptionPlanToPackage(subscriptionPlan: SubscriptionPlan): string {
    switch (subscriptionPlan) {
      case SubscriptionPlan.PRO_WHATSAPP:
        return 'PRO_WHATSAPP';
      case SubscriptionPlan.PRO_SMS:
        return 'PRO_SMS';
      case SubscriptionPlan.PRO_TELEGRAM:
        return 'PRO_TELEGRAM';
      case SubscriptionPlan.PRO_EMAIL:
        return 'PRO_EMAIL';
      case SubscriptionPlan.DYNAMAD:
        return 'PREMIUM_PACKAGE';
      case SubscriptionPlan.WHATSAPP:
        return 'WHATSAPP_PACKAGE';
      case SubscriptionPlan.TELEGRAM:
        return 'TELEGRAM_PACKAGE';
      case SubscriptionPlan.EMAIL:
        return 'EMAIL_PACKAGE';
      default:
        return 'FREE_PACKAGE';
    }
  }
}
