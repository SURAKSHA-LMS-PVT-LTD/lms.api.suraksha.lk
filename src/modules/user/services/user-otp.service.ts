import { Injectable, BadRequestException, Logger, Inject, forwardRef, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThan } from 'typeorm';
import { UserOtpEntity, OtpType, OtpPurpose } from '../entities/user-otp.entity';
import { UserEntity } from '../entities/user.entity';
import { normalizeSriLankanPhone } from '../../../common/utils/phone-normalizer.util';
import { EnhancedEmailService } from '../../../common/services/enhanced-email.service';
import { SmslenzProvider } from '../../../modules/sms/providers/smslenz.provider';
import { now, nowTimestamp, getCurrentSriLankaDate } from '../../../common/utils/timezone.util';
import * as crypto from 'crypto';

@Injectable()
export class UserOtpService {
  private readonly logger = new Logger(UserOtpService.name);
  private readonly OTP_EXPIRY_MINUTES = 30; // 30 minutes TTL
  private readonly MAX_REQUESTS_PER_DAY = 5; // Total OTP requests per day
  private readonly MAX_REREQUESTS_PER_DAY = 3; // Re-request limit

  constructor(
    @InjectRepository(UserOtpEntity)
    private otpRepository: Repository<UserOtpEntity>,
    @InjectRepository(UserEntity)
    private userRepository: Repository<UserEntity>,
    private readonly enhancedEmailService: EnhancedEmailService,
    private readonly smsProvider: SmslenzProvider,
  ) {}

  /**
   * Generate 6-digit OTP code
   */
  private generateOtpCode(): string {
    return crypto.randomInt(100000, 1000000).toString();
  }

  /**
   * Get today's date in YYYY-MM-DD format
   */
  private getTodayDate(): string {
    return getCurrentSriLankaDate();
  }

  /**
   * Check daily limit for OTP requests
   */
  private async checkDailyLimit(
    identifier: string,
    otpType: OtpType,
  ): Promise<{ allowed: boolean; remaining: number; totalToday: number }> {
    const today = this.getTodayDate();
    const whereClause =
      otpType === OtpType.EMAIL
        ? { email: identifier, createdDate: today }
        : { phoneNumber: identifier, createdDate: today };

    const count = await this.otpRepository.count({
      where: whereClause,
    });

    const remaining = Math.max(0, this.MAX_REQUESTS_PER_DAY - count);
    return {
      allowed: count < this.MAX_REQUESTS_PER_DAY,
      remaining,
      totalToday: count,
    };
  }

  /**
   * Get tomorrow's date for retry message
   */
  private getTomorrowDate(): string {
    const tomorrowMs = nowTimestamp() + (24 * 60 * 60 * 1000);
    return new Date(tomorrowMs).toISOString();
  }

  /**
   * Request Email OTP
   */
  async requestEmailOtp(
    email: string,
    ipAddress?: string,
  ): Promise<{ success: boolean; message: string; expiresAt: Date; remainingAttempts: number; totalRequests: number }> {
    // Check if email already exists in user table
    const existingUser = await this.userRepository.findOne({
      where: { email: email.toLowerCase() },
    });

    if (existingUser) {
      this.logger.warn(`❌ Email already registered: ${email} (userId: ${existingUser.id})`);
      throw new ConflictException({
        message: 'This email is already registered. Please login or use a different email.',
        userId: existingUser.id,
        statusCode: 409
      });
    }

    // Check daily limit
    const { allowed, remaining, totalToday } = await this.checkDailyLimit(email, OtpType.EMAIL);
    if (!allowed) {
      const tomorrowDate = this.getTomorrowDate();
      throw new BadRequestException(
        `Daily OTP limit reached. Maximum ${this.MAX_REQUESTS_PER_DAY} requests per day allowed. Please try again after ${tomorrowDate}.`,
      );
    }

    // Check if this is a re-request (user already has OTPs today)
    if (totalToday >= 1 && totalToday > (this.MAX_REQUESTS_PER_DAY - this.MAX_REREQUESTS_PER_DAY)) {
      const reRequestsUsed = totalToday - (this.MAX_REQUESTS_PER_DAY - this.MAX_REREQUESTS_PER_DAY);
      if (reRequestsUsed >= this.MAX_REREQUESTS_PER_DAY) {
        const tomorrowDate = this.getTomorrowDate();
        throw new BadRequestException(
          `Re-request limit reached. Maximum ${this.MAX_REREQUESTS_PER_DAY} re-requests allowed per day. Please try again after ${tomorrowDate}.`,
        );
      }
    }

    // Invalidate previous OTPs for this email
    await this.otpRepository.update(
      {
        email,
        isVerified: false,
        expiresAt: MoreThan(now()),
      },
      {
        expiresAt: now(), // Expire immediately
      },
    );

    // Generate new OTP
    const otpCode = this.generateOtpCode();
    const expiresAt = new Date(nowTimestamp() + this.OTP_EXPIRY_MINUTES * 60 * 1000);

    const otp = this.otpRepository.create({
      email,
      otpCode,
      otpType: OtpType.EMAIL,
      otpPurpose: OtpPurpose.VERIFICATION,
      expiresAt,
      createdAt: now(), // Explicitly set Sri Lanka timezone
      createdDate: this.getTodayDate(),
      ipAddress,
    });

    await this.otpRepository.save(otp);

    // Send OTP via email service
    try {
      await this.enhancedEmailService.sendOTP({
        email,
        otp: otpCode,
        userName: email.split('@')[0], // Use email prefix as username
        expiryMinutes: this.OTP_EXPIRY_MINUTES.toString(),
        requestType: 'Email Verification',
        ipAddress,
      });
    } catch (emailError) {
      this.logger.error(`❌ Failed to send OTP email to ${email}: ${emailError.message}`);
      // Don't fail the request if email sending fails - OTP is still valid
    }

    return {
      success: true,
      message: `OTP sent to ${email}. Valid for ${this.OTP_EXPIRY_MINUTES} minute(s). ${remaining - 1} requests remaining today.`,
      expiresAt,
      remainingAttempts: remaining - 1,
      totalRequests: totalToday + 1,
    };
  }

  /**
   * Verify Email OTP
   */
  async verifyEmailOtp(
    email: string,
    otpCode: string,
  ): Promise<{ success: boolean; message: string }> {
    const otp = await this.otpRepository.findOne({
      where: {
        email,
        otpCode,
        isVerified: false,
        expiresAt: MoreThan(now()),
      },
      order: { createdAt: 'DESC' },
    });

    if (!otp) {
      this.logger.warn(`❌ Invalid or expired OTP for email: ${email}`);
      throw new BadRequestException('Invalid or expired OTP code');
    }

    // Mark as verified
    otp.isVerified = true;
    otp.verifiedAt = now();
    await this.otpRepository.save(otp);

    return {
      success: true,
      message: 'Email verified successfully',
    };
  }

  /**
   * Request Phone OTP
   */
  async requestPhoneOtp(
    phoneNumber: string,
    ipAddress?: string,
  ): Promise<{ success: boolean; message: string; expiresAt: Date; remainingAttempts: number; totalRequests: number }> {
    // Normalize phone number
    const normalizedPhone = normalizeSriLankanPhone(phoneNumber);
    if (!normalizedPhone) {
      throw new BadRequestException('Invalid phone number format');
    }

    // Check if phone number already exists in user table
    const existingUser = await this.userRepository.findOne({
      where: { phoneNumber: normalizedPhone },
    });

    if (existingUser) {
      this.logger.warn(`❌ Phone number already registered: ${normalizedPhone} (userId: ${existingUser.id})`);
      throw new ConflictException({
        message: 'This phone number is already registered. Please login or use a different phone number.',
        userId: existingUser.id,
        statusCode: 409
      });
    }

    // Check daily limit
    const { allowed, remaining, totalToday } = await this.checkDailyLimit(normalizedPhone, OtpType.PHONE);
    if (!allowed) {
      const tomorrowDate = this.getTomorrowDate();
      throw new BadRequestException(
        `Daily OTP limit reached. Maximum ${this.MAX_REQUESTS_PER_DAY} requests per day allowed. Please try again after ${tomorrowDate}.`,
      );
    }

    // Check if this is a re-request (user already has OTPs today)
    if (totalToday >= 1 && totalToday > (this.MAX_REQUESTS_PER_DAY - this.MAX_REREQUESTS_PER_DAY)) {
      const reRequestsUsed = totalToday - (this.MAX_REQUESTS_PER_DAY - this.MAX_REREQUESTS_PER_DAY);
      if (reRequestsUsed >= this.MAX_REREQUESTS_PER_DAY) {
        const tomorrowDate = this.getTomorrowDate();
        throw new BadRequestException(
          `Re-request limit reached. Maximum ${this.MAX_REREQUESTS_PER_DAY} re-requests allowed per day. Please try again after ${tomorrowDate}.`,
        );
      }
    }

    // Invalidate previous OTPs for this phone
    await this.otpRepository.update(
      {
        phoneNumber: normalizedPhone,
        isVerified: false,
        expiresAt: MoreThan(now()),
      },
      {
        expiresAt: now(), // Expire immediately
      },
    );

    // Generate new OTP
    const otpCode = this.generateOtpCode();
    const expiresAt = new Date(nowTimestamp() + this.OTP_EXPIRY_MINUTES * 60 * 1000);

    const otp = this.otpRepository.create({
      phoneNumber: normalizedPhone,
      otpCode,
      otpType: OtpType.PHONE,
      otpPurpose: OtpPurpose.VERIFICATION,
      expiresAt,
      createdAt: now(), // Explicitly set Sri Lanka timezone
      createdDate: this.getTodayDate(),
      ipAddress,
    });

    await this.otpRepository.save(otp);

    // Send OTP via SMS service
    try {
      const smsResult = await this.smsProvider.sendSms({
        contact: normalizedPhone,
        message: `Your Suraksha LMS verification code is: ${otpCode}. Valid for ${this.OTP_EXPIRY_MINUTES} minute(s). Do not share this code.`,
        senderId: 'SurakshaLMS', // Will use default from config if not provided
      });
      
      if (!smsResult.success) {
        this.logger.error(`❌ Failed to send OTP SMS to ${normalizedPhone}: ${smsResult.message}`);
      }
    } catch (smsError) {
      this.logger.error(`❌ SMS sending error for ${normalizedPhone}: ${smsError.message}`);
      // Don't fail the request if SMS sending fails - OTP is still valid
    }

    return {
      success: true,
      message: `OTP sent to ${normalizedPhone}. Valid for ${this.OTP_EXPIRY_MINUTES} minute(s). ${remaining - 1} requests remaining today.`,
      expiresAt,
      remainingAttempts: remaining - 1,
      totalRequests: totalToday + 1,
    };
  }

  /**
   * Verify Phone OTP
   */
  async verifyPhoneOtp(
    phoneNumber: string,
    otpCode: string,
  ): Promise<{ success: boolean; message: string }> {
    // Normalize phone number
    const normalizedPhone = normalizeSriLankanPhone(phoneNumber);
    if (!normalizedPhone) {
      throw new BadRequestException('Invalid phone number format');
    }

    const otp = await this.otpRepository.findOne({
      where: {
        phoneNumber: normalizedPhone,
        otpCode,
        isVerified: false,
        expiresAt: MoreThan(now()),
      },
      order: { createdAt: 'DESC' },
    });

    if (!otp) {
      this.logger.warn(`❌ Invalid or expired OTP for phone: ${normalizedPhone}`);
      throw new BadRequestException('Invalid or expired OTP code');
    }

    // Mark as verified
    otp.isVerified = true;
    otp.verifiedAt = now();
    await this.otpRepository.save(otp);

    return {
      success: true,
      message: 'Phone number verified successfully',
    };
  }

  // ============================================================
  // 📱 PHONE NUMBER CHANGE (AUTHENTICATED USERS ONLY)
  // ============================================================

  /**
   * Request OTP to change phone number (for already-authenticated user).
   *
   * - Sends OTP to the NEW phone number.
   * - The new number must NOT already be registered to another user.
   * - The new number must be different from the caller's current number.
   * - Subject to the same daily rate limit as registration OTPs.
   */
  async requestPhoneChangeOtp(
    userId: string,
    newPhoneNumber: string,
    ipAddress?: string,
  ): Promise<{
    success: boolean;
    message: string;
    expiresAt: Date;
    remainingAttempts: number;
    totalRequests: number;
  }> {
    // Normalize
    const normalizedPhone = normalizeSriLankanPhone(newPhoneNumber);
    if (!normalizedPhone) {
      throw new BadRequestException('Invalid phone number format. Use Sri Lankan format e.g. 0771234567 or +94771234567.');
    }

    // Ensure the requesting user exists
    const requestingUser = await this.userRepository.findOne({ where: { id: userId } });
    if (!requestingUser) {
      throw new BadRequestException('User not found');
    }

    // New number must differ from current number
    if (requestingUser.phoneNumber && requestingUser.phoneNumber === normalizedPhone) {
      throw new BadRequestException('The new phone number is the same as your current phone number.');
    }

    // Ensure the new number is not already taken by another user
    const conflict = await this.userRepository.findOne({
      where: { phoneNumber: normalizedPhone },
    });
    if (conflict) {
      throw new BadRequestException(
        'This phone number is already registered to another account. Please use a different number.',
      );
    }

    // Daily rate limit (keyed by phone number being verified)
    const { allowed, remaining, totalToday } = await this.checkDailyLimit(normalizedPhone, OtpType.PHONE);
    if (!allowed) {
      const tomorrowDate = this.getTomorrowDate();
      throw new BadRequestException(
        `Daily OTP limit reached. Maximum ${this.MAX_REQUESTS_PER_DAY} requests per day. Retry after ${tomorrowDate}.`,
      );
    }

    // Invalidate any pending PHONE_CHANGE OTPs for this user+phone
    await this.otpRepository.update(
      {
        userId,
        phoneNumber: normalizedPhone,
        isVerified: false,
        expiresAt: MoreThan(now()),
      },
      { expiresAt: now() },
    );

    // Create & save OTP
    const otpCode = this.generateOtpCode();
    const expiresAt = new Date(nowTimestamp() + this.OTP_EXPIRY_MINUTES * 60 * 1000);

    const otp = this.otpRepository.create({
      userId,
      phoneNumber: normalizedPhone,
      otpCode,
      otpType: OtpType.PHONE,
      otpPurpose: OtpPurpose.PHONE_CHANGE,
      expiresAt,
      createdAt: now(),
      createdDate: this.getTodayDate(),
      ipAddress,
    });
    await this.otpRepository.save(otp);

    // Send OTP via SMS
    try {
      const smsResult = await this.smsProvider.sendSms({
        contact: normalizedPhone,
        message: `Your Suraksha LMS phone change verification code is: ${otpCode}. Valid for ${this.OTP_EXPIRY_MINUTES} minute(s). Do not share this code.`,
        senderId: 'SurakshaLMS',
      });
      if (!smsResult.success) {
        this.logger.error(`❌ Failed to send phone-change OTP SMS to ${normalizedPhone}: ${smsResult.message}`);
      }
    } catch (smsError) {
      this.logger.error(`❌ SMS error for phone-change OTP to ${normalizedPhone}: ${smsError.message}`);
      // OTP is still valid even if SMS delivery fails
    }

    return {
      success: true,
      message: `OTP sent to ${normalizedPhone}. Valid for ${this.OTP_EXPIRY_MINUTES} minute(s). ${remaining - 1} requests remaining today.`,
      expiresAt,
      remainingAttempts: remaining - 1,
      totalRequests: totalToday + 1,
    };
  }

  /**
   * Verify phone-change OTP and commit the phone number update.
   *
   * - Validates the OTP created by `requestPhoneChangeOtp`.
   * - Re-checks that the new number is still free (race-condition guard).
   * - Updates the user row and marks the OTP as verified.
   */
  async verifyPhoneChangeAndUpdate(
    userId: string,
    newPhoneNumber: string,
    otpCode: string,
  ): Promise<{ success: boolean; message: string; newPhoneNumber: string }> {
    const normalizedPhone = normalizeSriLankanPhone(newPhoneNumber);
    if (!normalizedPhone) {
      throw new BadRequestException('Invalid phone number format.');
    }

    // Find the OTP
    const otp = await this.otpRepository.findOne({
      where: {
        userId,
        phoneNumber: normalizedPhone,
        otpCode,
        otpPurpose: OtpPurpose.PHONE_CHANGE,
        isVerified: false,
        expiresAt: MoreThan(now()),
      },
      order: { createdAt: 'DESC' },
    });

    if (!otp) {
      this.logger.warn(`❌ Invalid/expired phone-change OTP for userId=${userId}, phone=${normalizedPhone}`);
      throw new BadRequestException('Invalid or expired OTP code. Please request a new OTP.');
    }

    // Race-condition guard – ensure number is still free
    const conflict = await this.userRepository.findOne({
      where: { phoneNumber: normalizedPhone },
    });
    if (conflict && conflict.id !== userId) {
      throw new BadRequestException(
        'This phone number has just been registered by another account. Please choose a different number.',
      );
    }

    // Mark OTP as verified
    otp.isVerified = true;
    otp.verifiedAt = now();
    await this.otpRepository.save(otp);

    // Update user phone number
    await this.userRepository.update({ id: userId }, { phoneNumber: normalizedPhone });
    this.logger.log(`✅ Phone number changed for userId=${userId} → ${normalizedPhone}`);

    return {
      success: true,
      message: 'Phone number updated successfully.',
      newPhoneNumber: normalizedPhone,
    };
  }

  // ============================================================
  // 📧 EMAIL CHANGE (AUTHENTICATED USERS ONLY)
  // ============================================================

  /**
   * Request OTP to change email address (authenticated user, self only).
   *
   * - Sends OTP to the NEW email address.
   * - New email must NOT already be registered to another user.
   * - New email must differ from the caller's current email.
   * - Subject to the same daily rate limit as registration OTPs.
   */
  async requestEmailChangeOtp(
    userId: string,
    newEmail: string,
    ipAddress?: string,
  ): Promise<{
    success: boolean;
    message: string;
    expiresAt: Date;
    remainingAttempts: number;
    totalRequests: number;
  }> {
    const normalizedEmail = newEmail.toLowerCase().trim();

    // Ensure the requesting user exists
    const requestingUser = await this.userRepository.findOne({ where: { id: userId } });
    if (!requestingUser) {
      throw new BadRequestException('User not found');
    }

    // New email must differ from current email
    if (requestingUser.email && requestingUser.email === normalizedEmail) {
      throw new BadRequestException('The new email address is the same as your current email address.');
    }

    // Ensure the new email is not already taken by another user
    const conflict = await this.userRepository.findOne({
      where: { email: normalizedEmail },
    });
    if (conflict) {
      throw new BadRequestException(
        'This email address is already registered to another account. Please use a different email.',
      );
    }

    // Daily rate limit (keyed by email being verified)
    const { allowed, remaining, totalToday } = await this.checkDailyLimit(normalizedEmail, OtpType.EMAIL);
    if (!allowed) {
      const tomorrowDate = this.getTomorrowDate();
      throw new BadRequestException(
        `Daily OTP limit reached. Maximum ${this.MAX_REQUESTS_PER_DAY} requests per day. Retry after ${tomorrowDate}.`,
      );
    }

    // Invalidate any pending EMAIL_CHANGE OTPs for this user+email
    await this.otpRepository.update(
      {
        userId,
        email: normalizedEmail,
        isVerified: false,
        expiresAt: MoreThan(now()),
      },
      { expiresAt: now() },
    );

    // Create & save OTP
    const otpCode = this.generateOtpCode();
    const expiresAt = new Date(nowTimestamp() + this.OTP_EXPIRY_MINUTES * 60 * 1000);

    const otp = this.otpRepository.create({
      userId,
      email: normalizedEmail,
      otpCode,
      otpType: OtpType.EMAIL,
      otpPurpose: OtpPurpose.EMAIL_CHANGE,
      expiresAt,
      createdAt: now(),
      createdDate: this.getTodayDate(),
      ipAddress,
    });
    await this.otpRepository.save(otp);

    // Send OTP via email
    try {
      await this.enhancedEmailService.sendOTP({
        email: normalizedEmail,
        otp: otpCode,
        userName: requestingUser.firstName || normalizedEmail.split('@')[0],
        expiryMinutes: this.OTP_EXPIRY_MINUTES.toString(),
        requestType: 'Email Address Change',
        ipAddress,
      });
    } catch (emailError) {
      this.logger.error(`❌ Failed to send email-change OTP to ${normalizedEmail}: ${emailError.message}`);
      // OTP is still valid even if delivery fails
    }

    return {
      success: true,
      message: `OTP sent to ${normalizedEmail}. Valid for ${this.OTP_EXPIRY_MINUTES} minute(s). ${remaining - 1} requests remaining today.`,
      expiresAt,
      remainingAttempts: remaining - 1,
      totalRequests: totalToday + 1,
    };
  }

  /**
   * Verify email-change OTP and commit the email update.
   *
   * - Validates the OTP created by `requestEmailChangeOtp`.
   * - Re-checks that the new email is still free (race-condition guard).
   * - Updates the user row and marks the OTP as verified.
   */
  async verifyEmailChangeAndUpdate(
    userId: string,
    newEmail: string,
    otpCode: string,
  ): Promise<{ success: boolean; message: string; newEmail: string }> {
    const normalizedEmail = newEmail.toLowerCase().trim();

    // Find the OTP
    const otp = await this.otpRepository.findOne({
      where: {
        userId,
        email: normalizedEmail,
        otpCode,
        otpPurpose: OtpPurpose.EMAIL_CHANGE,
        isVerified: false,
        expiresAt: MoreThan(now()),
      },
      order: { createdAt: 'DESC' },
    });

    if (!otp) {
      this.logger.warn(`❌ Invalid/expired email-change OTP for userId=${userId}, email=${normalizedEmail}`);
      throw new BadRequestException('Invalid or expired OTP code. Please request a new OTP.');
    }

    // Race-condition guard – ensure email is still free
    const conflict = await this.userRepository.findOne({
      where: { email: normalizedEmail },
    });
    if (conflict && conflict.id !== userId) {
      throw new BadRequestException(
        'This email address has just been registered by another account. Please choose a different email.',
      );
    }

    // Mark OTP as verified
    otp.isVerified = true;
    otp.verifiedAt = now();
    await this.otpRepository.save(otp);

    // Update user email
    await this.userRepository.update({ id: userId }, { email: normalizedEmail });
    this.logger.log(`✅ Email changed for userId=${userId} → ${normalizedEmail}`);

    return {
      success: true,
      message: 'Email address updated successfully.',
      newEmail: normalizedEmail,
    };
  }
}
