import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AsyncEmailService } from '../../../common/services/async-email.service';
import { InstantSmsService } from '../../sms/services/instant-sms.service';
import { SmslenzProvider } from '../../sms/providers/smslenz.provider';
import { InstituteEntity } from '../../institute/entities/institute.entity';
import { getCurrentSriLankaISO } from '../../../common/utils/timezone.util';

/**
 * 📧📱 USER NOTIFICATION SERVICE
 * 
 * Handles all user notification logic (email, SMS)
 * Separated from controller for better architecture
 * 
 * BENEFITS:
 * ✅ Single Responsibility - Only handles notifications
 * ✅ Reusable - Can be called from anywhere
 * ✅ Testable - Easy to unit test
 * ✅ Maintainable - Changes in one place
 * ✅ System-Level SMS - Uses environment variables (not institute-specific)
 */

export interface WelcomeNotificationParams {
  email: string;
  phoneNumber?: string;
  nameWithInitials?: string;
  firstName?: string;
  userId: string;
  instituteId?: string;
}

@Injectable()
export class UserNotificationService {
  private readonly logger = new Logger(UserNotificationService.name);

  constructor(
    private readonly asyncEmailService: AsyncEmailService,
    private readonly instantSmsService: InstantSmsService,
    private readonly configService: ConfigService,
    private readonly smslenzProvider: SmslenzProvider,
    @InjectRepository(InstituteEntity)
    private readonly instituteRepository: Repository<InstituteEntity>,
  ) {}

  /**
   * Send welcome notifications (Email + SMS) to newly created user
   * 
   * ✅ INDEPENDENT NOTIFICATIONS:
   * - Email and SMS sent in parallel
   * - If email fails, SMS still sent
   * - If SMS fails, email still sent
   * - Neither blocks user creation
   * 
   * 🛡️ BULLETPROOF ERROR HANDLING:
   * - Never throws errors (even on catastrophic failures)
   * - All errors caught and logged
   * - User creation always succeeds
   * 
   * @param params - User details for notification
   * @returns void (fire-and-forget pattern)
   */
  async sendWelcomeNotifications(params: WelcomeNotificationParams): Promise<void> {
    try {
      const { email, phoneNumber, nameWithInitials, firstName, userId, instituteId } = params;

      // Use nameWithInitials if available, otherwise fallback to firstName, or 'User'
      const displayName = nameWithInitials || firstName || 'User';

      this.logger.log(
        `📧📱 Starting welcome notifications for user ${userId} ` +
        `(Email: ${email}, Name: ${displayName}, Phone: ${phoneNumber || 'N/A'})`
      );

      // Validate input parameters
      if (!email || !userId) {
        this.logger.warn(
          `⚠️ Missing required parameters for welcome notifications. ` +
          `UserId: ${userId || 'MISSING'}, Email: ${email || 'MISSING'}`
        );
        return; // Silent return - don't throw
      }

      // 🔥 PARALLEL EXECUTION - Both notifications sent independently
      // If one fails, the other still continues
      const notifications: Promise<void>[] = [];

      // 1. EMAIL (PRIMARY) - Always send
      notifications.push(
        Promise.resolve()
          .then(() => this.sendWelcomeEmail(email, displayName, userId))
          .catch((error) => {
            this.logger.error(`❌ Email notification failed for user ${userId}: ${error.message}`);
            // Swallow error - don't propagate
          })
      );

      // 2. SMS (SECONDARY) - Only if phone number provided
      if (phoneNumber) {
        notifications.push(
          this.sendWelcomeSms(phoneNumber, displayName, userId, instituteId || 'system')
            .catch((error) => {
              this.logger.error(`❌ SMS notification failed for user ${userId}: ${error.message}`);
              // Swallow error - don't propagate
            })
        );
      }

      // Execute all notifications in parallel, continue even if some fail
      await Promise.allSettled(notifications);
      
      this.logger.log(`✅ Welcome notifications processing completed for user ${userId}`);
    } catch (error) {
      // 🛡️ ULTIMATE CATCH-ALL: Even if something catastrophic happens, log and continue
      this.logger.error(
        `❌ Catastrophic error in sendWelcomeNotifications: ${error.message}`,
        error.stack
      );
      // Never throw - this is a fire-and-forget operation
    }
  }

  /**
   * Send welcome email to newly created user
   * 
   * 🛡️ BULLETPROOF: Never throws errors - email failure won't affect SMS or user creation
   * @private
   */
  private sendWelcomeEmail(email: string, nameWithInitials: string, userId: string): void {
    try {
      // Validate inputs
      if (!email || !nameWithInitials || !userId) {
        this.logger.warn(`⚠️ Invalid email parameters. Email: ${email}, UserId: ${userId}`);
        return; // Silent return
      }

      // Validate email format
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        this.logger.warn(`⚠️ Invalid email format: ${email} for user ${userId}`);
        return; // Silent return
      }

      // Fire-and-forget email sending (async, non-blocking)
      this.asyncEmailService.sendRegistrationEmailAsync({
        userEmail: email,
        userName: nameWithInitials,
        accountEmail: email,
        registrationDate: getCurrentSriLankaISO(),
        studentId: userId, // Include User ID in email
      });
    } catch (error) {
      // Log error but don't throw - email failure shouldn't block SMS or user creation
      this.logger.error(
        `❌ Failed to queue welcome email to ${email} for user ${userId}: ${error?.message || 'Unknown error'}`,
        error?.stack
      );
      // Silent failure - never throw
    }
  }

  /**
   * Send welcome SMS to newly created user
   * 
   * 🔧 SYSTEM-LEVEL SMS: Uses environment variables (DEFAULT_SMS_MASK_ID, etc.)
   * 🛡️ BULLETPROOF: Never throws errors - SMS failure won't affect email or user creation
   * @private
   */
  private async sendWelcomeSms(
    phoneNumber: string,
    nameWithInitials: string,
    userId: string,
    instituteId: string,
  ): Promise<void> {
    try {
      // Validate inputs
      if (!phoneNumber || !nameWithInitials || !userId) {
        this.logger.warn(`⚠️ Invalid SMS parameters. Phone: ${phoneNumber}, UserId: ${userId}`);
        return; // Silent return
      }

      // Validate phone number format before attempting to send
      // Expected format: +947XXXXXXXX (Sri Lankan format)
      const sriLankanPhoneRegex = /^\+947[0-9]{8}$/;
      if (!sriLankanPhoneRegex.test(phoneNumber)) {
        this.logger.warn(
          `⚠️ Invalid phone number format for welcome SMS: ${phoneNumber}. ` +
          `Expected: +947XXXXXXXX. Skipping SMS for user ${userId}`,
        );
        return; // Silent return - don't throw
      }

      // 🔧 Get system-level SMS configuration from environment variables
      let systemMaskId: string;
      try {
        systemMaskId = this.configService.get<string>('DEFAULT_SMS_MASK_ID', 'SurakshaLMS');
      } catch (configError) {
        this.logger.error(`❌ Error reading SMS config: ${configError?.message}`);
        return; // Silent return
      }
      
      if (!systemMaskId) {
        this.logger.warn(`⚠️ System SMS mask ID not configured (DEFAULT_SMS_MASK_ID), skipping SMS for user ${userId}`);
        return; // Silent return - don't throw
      }

      // Fetch institute name if instituteId is provided
      let instituteName = '';
      if (instituteId) {
        try {
          const institute = await this.instituteRepository.findOne({
            where: { id: instituteId },
            select: ['name'],
          });
          if (institute?.name) {
            instituteName = institute.name;
          }
        } catch (error) {
          this.logger.warn(`⚠️ Could not fetch institute name for ID ${instituteId}: ${error?.message}`);
        }
      }

      const appUrl = this.configService.get<string>('APP_URL') ||
        this.configService.get<string>('FRONTEND_URL') ||
        'https://lms.suraksha.lk';

      const playStoreUrl = this.configService.get<string>('APP_DOWNLOAD_URL') ||
        'https://play.google.com/store/apps/details?id=lk.suraksha.lms';

      let message = 
        `Welcome to Suraksha LMS!\n\n` +
        `Your account has been successfully created.\n` +
        `User ID: ${userId}\n\n` +
        `Download our mobile app: ${playStoreUrl}\n` +
        `Or visit: ${appUrl}\n\n` +
        `Thank you,\n` +
        `Suraksha LMS`;
      
      if (instituteName) {
        message += `\n${instituteName}`;
      }

      // Validate SmslenzProvider is available
      if (!this.smslenzProvider || typeof this.smslenzProvider.sendSms !== 'function') {
        this.logger.error(`❌ SmslenzProvider not available for user ${userId}`);
        return; // Silent return
      }

      // 🚀 Send SMS using system-level SMSlenz credentials (bypasses institute validation)
      // Uses SMSLENZ_USER_ID, SMSLENZ_API_KEY, and DEFAULT_SMS_MASK_ID from .env
      const smsResponse = await this.smslenzProvider.sendSms({
        senderId: systemMaskId, // Use system mask ID from .env (e.g., 'SurakshaLMS')
        contact: phoneNumber,
        message,
      });

      if (smsResponse.success) {
        this.logger.log(
          `✅ Welcome SMS sent successfully to ${phoneNumber} for user ${userId}`
        );
      } else {
        // Log prominently when SMS fails
        this.logger.error(
          `❌ [CRITICAL] SMS DELIVERY FAILED for user ${userId}\n` +
          `   Phone: ${phoneNumber}\n` +
          `   Error: ${smsResponse.error || smsResponse.message}\n` +
          `   User created successfully but SMS not delivered`
        );
      }
    } catch (error) {
      // 🛡️ COMPREHENSIVE ERROR HANDLING - NEVER throw, only log
      const errorMessage = error?.message || 'Unknown error';
      const errorStack = error?.stack;

      if (errorMessage.includes('Invalid phone number')) {
        this.logger.warn(
          `⚠️ Invalid phone number format, cannot send SMS to ${phoneNumber} for user ${userId}`,
        );
      } else if (errorMessage.includes('Insufficient credits')) {
        this.logger.error(
          `❌ Insufficient SMS credits, cannot send system welcome SMS for user ${userId}`,
        );
      } else if (errorMessage.includes('timeout') || errorMessage.includes('ETIMEDOUT')) {
        this.logger.error(
          `❌ SMS service timeout for user ${userId}, phone: ${phoneNumber}`,
        );
      } else if (errorMessage.includes('Network') || errorMessage.includes('ECONNREFUSED')) {
        this.logger.error(
          `❌ SMS service network error for user ${userId}`,
        );
      } else {
        this.logger.error(
          `❌ Failed to send system welcome SMS to ${phoneNumber} for user ${userId}: ${errorMessage}`,
          errorStack,
        );
      }
      // Silent failure - never throw, don't block email or user creation
    }
  }

  /**
   * Send email only (for cases where SMS not needed)
   * 🛡️ BULLETPROOF: Never throws errors
   */
  async sendWelcomeEmailOnly(email: string, firstName: string, userId: string): Promise<void> {
    try {
      this.sendWelcomeEmail(email, firstName, userId);
    } catch (error) {
      this.logger.error(
        `❌ Error in sendWelcomeEmailOnly for user ${userId}: ${error?.message || 'Unknown error'}`,
        error?.stack
      );
      // Silent failure - never throw
    }
  }

  /**
   * Send SMS only (for cases where email already sent)
   * 🛡️ BULLETPROOF: Never throws errors
   */
  async sendWelcomeSmsOnly(
    phoneNumber: string,
    firstName: string,
    userId: string,
    instituteId: string,
  ): Promise<void> {
    try {
      await this.sendWelcomeSms(phoneNumber, firstName, userId, instituteId);
    } catch (error) {
      this.logger.error(
        `❌ Error in sendWelcomeSmsOnly for user ${userId}: ${error?.message || 'Unknown error'}`,
        error?.stack
      );
      // Silent failure - never throw
    }
  }
}
