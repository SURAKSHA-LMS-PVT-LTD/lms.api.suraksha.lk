import { Injectable, BadRequestException, Logger, Inject, forwardRef, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThan } from 'typeorm';
import { UserOtpEntity, OtpType, OtpPurpose } from '../entities/user-otp.entity';
import { UserEntity } from '../entities/user.entity';
import { normalizeSriLankanPhone } from '../../../common/utils/phone-normalizer.util';
import { EnhancedEmailService } from '../../../common/services/enhanced-email.service';
import { SmslenzProvider } from '../../../modules/sms/providers/smslenz.provider';
import { now, nowTimestamp, getCurrentSriLankaDate } from '../../../common/utils/timezone.util';

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
    return Math.floor(100000 + Math.random() * 900000).toString();
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
    const tomorrow = new Date(nowTimestamp() + 24 * 60 * 60 * 1000);
    tomorrow.setHours(0, 0, 0, 0);
    return tomorrow.toISOString();
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
    const expiresAt = new Date(Date.now() + this.OTP_EXPIRY_MINUTES * 60 * 1000);

    const otp = this.otpRepository.create({
      email,
      otpCode,
      otpType: OtpType.EMAIL,
      otpPurpose: OtpPurpose.VERIFICATION,
      expiresAt,
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
}
