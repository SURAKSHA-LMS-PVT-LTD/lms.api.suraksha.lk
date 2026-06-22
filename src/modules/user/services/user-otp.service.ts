import { Injectable, BadRequestException, Logger, Inject, forwardRef, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThan } from 'typeorm';
import { UserOtpEntity, OtpType, OtpPurpose, OtpDeliveryMethod } from '../entities/user-otp.entity';
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
  // 💬 WHATSAPP-LINK PHONE OTP (reverse-OTP)
  //
  // The server generates the code and returns a wa.me deep link. The user
  // sends the code from their OWN WhatsApp to the business number; the
  // whatsapp-webhook service confirms it (code + sender phone must match) and
  // flips is_verified. The site then polls/checks status on the "Next" click.
  // No SMS is sent for this path.
  // ============================================================

  /** Build the wa.me deep link the user taps/scans to send the OTP to us. */
  private buildWhatsAppOtpLink(otpCode: string): string {
    const businessNumber = (process.env.WHATSAPP_BUSINESS_NUMBER || '').replace(/[^\d]/g, '');
    // Message text the webhook will parse. Keep "OTP" prefix so it's unambiguous.
    const text = encodeURIComponent(`OTP ${otpCode}`);
    return `https://wa.me/${businessNumber}?text=${text}`;
  }

  /**
   * Request a WhatsApp-link OTP for phone verification (registration).
   * Returns a wa.me link; the code is embedded in the link text only.
   */
  async requestPhoneOtpWhatsApp(
    phoneNumber: string,
    ipAddress?: string,
  ): Promise<{ success: boolean; message: string; waLink: string; expiresAt: Date; remainingAttempts: number }> {
    const normalizedPhone = normalizeSriLankanPhone(phoneNumber);
    if (!normalizedPhone) {
      throw new BadRequestException('Invalid phone number format');
    }

    if (!process.env.WHATSAPP_BUSINESS_NUMBER) {
      throw new BadRequestException('WhatsApp verification is not configured on this server.');
    }

    // Phone must not already be registered
    const existingUser = await this.userRepository.findOne({
      where: { phoneNumber: normalizedPhone },
    });
    if (existingUser) {
      throw new ConflictException({
        message: 'This phone number is already registered. Please login or use a different phone number.',
        userId: existingUser.id,
        statusCode: 409,
      });
    }

    // Daily limit (shared counter with any other OTP for this phone)
    const { allowed, remaining } = await this.checkDailyLimit(normalizedPhone, OtpType.PHONE);
    if (!allowed) {
      throw new BadRequestException(
        `Daily OTP limit reached. Maximum ${this.MAX_REQUESTS_PER_DAY} requests per day. Retry after ${this.getTomorrowDate()}.`,
      );
    }

    // Invalidate previous pending OTPs for this phone
    await this.otpRepository.update(
      { phoneNumber: normalizedPhone, isVerified: false, expiresAt: MoreThan(now()) },
      { expiresAt: now() },
    );

    const otpCode = this.generateOtpCode();
    const expiresAt = new Date(nowTimestamp() + this.OTP_EXPIRY_MINUTES * 60 * 1000);

    const otp = this.otpRepository.create({
      phoneNumber: normalizedPhone,
      otpCode,
      otpType: OtpType.PHONE,
      otpPurpose: OtpPurpose.VERIFICATION,
      deliveryMethod: OtpDeliveryMethod.WHATSAPP,
      expiresAt,
      createdAt: now(),
      createdDate: this.getTodayDate(),
      ipAddress,
    });
    await this.otpRepository.save(otp);

    return {
      success: true,
      message: `Tap the WhatsApp link (or scan the QR) and send the message to verify. Valid for ${this.OTP_EXPIRY_MINUTES} minute(s).`,
      waLink: this.buildWhatsAppOtpLink(otpCode),
      expiresAt,
      remainingAttempts: remaining - 1,
    };
  }

  /**
   * One-shot status check for the "Next" click.
   * Returns whether the latest WhatsApp OTP for this phone+purpose is verified.
   * Never returns the code itself.
   */
  async getPhoneOtpStatus(
    phoneNumber: string,
    purpose: OtpPurpose = OtpPurpose.VERIFICATION,
  ): Promise<{ verified: boolean; expired: boolean }> {
    const normalizedPhone = normalizeSriLankanPhone(phoneNumber);
    if (!normalizedPhone) {
      throw new BadRequestException('Invalid phone number format');
    }

    const otp = await this.otpRepository.findOne({
      where: {
        phoneNumber: normalizedPhone,
        otpPurpose: purpose,
        deliveryMethod: OtpDeliveryMethod.WHATSAPP,
      },
      order: { createdAt: 'DESC' },
    });

    if (!otp) return { verified: false, expired: false };

    const expired = !otp.isVerified && otp.expiresAt.getTime() <= nowTimestamp();
    return { verified: otp.isVerified, expired };
  }

  /**
   * Request a WhatsApp-link OTP to change phone number (authenticated user).
   */
  async requestPhoneChangeOtpWhatsApp(
    userId: string,
    newPhoneNumber: string,
    ipAddress?: string,
  ): Promise<{ success: boolean; message: string; waLink: string; expiresAt: Date; remainingAttempts: number }> {
    const normalizedPhone = normalizeSriLankanPhone(newPhoneNumber);
    if (!normalizedPhone) {
      throw new BadRequestException('Invalid phone number format.');
    }
    if (!process.env.WHATSAPP_BUSINESS_NUMBER) {
      throw new BadRequestException('WhatsApp verification is not configured on this server.');
    }

    const requestingUser = await this.userRepository.findOne({ where: { id: userId } });
    if (!requestingUser) throw new BadRequestException('User not found');

    if (requestingUser.phoneNumber === normalizedPhone) {
      throw new BadRequestException('The new phone number is the same as your current phone number.');
    }

    const conflict = await this.userRepository.findOne({ where: { phoneNumber: normalizedPhone } });
    if (conflict) {
      throw new BadRequestException('This phone number is already registered to another account.');
    }

    const { allowed, remaining } = await this.checkDailyLimit(normalizedPhone, OtpType.PHONE);
    if (!allowed) {
      throw new BadRequestException(
        `Daily OTP limit reached. Maximum ${this.MAX_REQUESTS_PER_DAY} requests per day. Retry after ${this.getTomorrowDate()}.`,
      );
    }

    await this.otpRepository.update(
      { userId, phoneNumber: normalizedPhone, isVerified: false, expiresAt: MoreThan(now()) },
      { expiresAt: now() },
    );

    const otpCode = this.generateOtpCode();
    const expiresAt = new Date(nowTimestamp() + this.OTP_EXPIRY_MINUTES * 60 * 1000);

    const otp = this.otpRepository.create({
      userId,
      phoneNumber: normalizedPhone,
      otpCode,
      otpType: OtpType.PHONE,
      otpPurpose: OtpPurpose.PHONE_CHANGE,
      deliveryMethod: OtpDeliveryMethod.WHATSAPP,
      expiresAt,
      createdAt: now(),
      createdDate: this.getTodayDate(),
      ipAddress,
    });
    await this.otpRepository.save(otp);

    return {
      success: true,
      message: `Tap the WhatsApp link (or scan the QR) and send the message to verify your new number.`,
      waLink: this.buildWhatsAppOtpLink(otpCode),
      expiresAt,
      remainingAttempts: remaining - 1,
    };
  }

  /**
   * After a WhatsApp OTP for PHONE_CHANGE is confirmed by the webhook, commit
   * the phone-number update. Called on the user's "Next" click.
   */
  async commitPhoneChangeIfVerified(
    userId: string,
    newPhoneNumber: string,
  ): Promise<{ success: boolean; message: string; newPhoneNumber: string }> {
    const normalizedPhone = normalizeSriLankanPhone(newPhoneNumber);
    if (!normalizedPhone) throw new BadRequestException('Invalid phone number format.');

    const otp = await this.otpRepository.findOne({
      where: {
        userId,
        phoneNumber: normalizedPhone,
        otpPurpose: OtpPurpose.PHONE_CHANGE,
        deliveryMethod: OtpDeliveryMethod.WHATSAPP,
        isVerified: true,
      },
      order: { createdAt: 'DESC' },
    });

    if (!otp) {
      throw new BadRequestException('Phone number not yet verified via WhatsApp. Please send the WhatsApp message first.');
    }

    // Race-condition guard — number must still be free
    const conflict = await this.userRepository.findOne({ where: { phoneNumber: normalizedPhone } });
    if (conflict && conflict.id !== userId) {
      throw new BadRequestException('This phone number has just been registered by another account.');
    }

    await this.userRepository.update({ id: userId }, { phoneNumber: normalizedPhone });
    this.logger.log(`✅ Phone changed (WhatsApp-verified) for userId=${userId} → ${normalizedPhone}`);

    return { success: true, message: 'Phone number updated successfully.', newPhoneNumber: normalizedPhone };
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

  // ============================================================
  // 🌐 PUBLIC SELF-REGISTRATION OTP (new-user OR existing-account claim)
  //
  // Used by the /forms/:token public registration flow. Unlike the standard
  // request methods these do NOT throw when the contact already belongs to a
  // user — instead they report `existingUserId` so the form can switch into
  // "claim existing account" mode. Ownership is still proven by the same OTP.
  //
  // Phone verification is reverse-WhatsApp ONLY (the user sends a code from
  // their own WhatsApp; the webhook flips is_verified). No SMS is ever sent.
  // ============================================================

  /**
   * Request a reverse-WhatsApp OTP for the public registration form.
   * Returns a wa.me link; reports whether the phone already belongs to a user
   * (so the caller can offer the existing-account claim flow). Never sends SMS.
   */
  async requestRegistrationPhoneOtpWhatsApp(
    phoneNumber: string,
    ipAddress?: string,
  ): Promise<{ success: boolean; message: string; waLink: string; expiresAt: Date; existingUserId: string | null }> {
    const normalizedPhone = normalizeSriLankanPhone(phoneNumber);
    if (!normalizedPhone) {
      throw new BadRequestException('Invalid phone number format');
    }
    if (!process.env.WHATSAPP_BUSINESS_NUMBER) {
      throw new BadRequestException('WhatsApp verification is not configured on this server.');
    }

    // Detect (but do NOT block) an existing account on this phone.
    const existingUser = await this.userRepository.findOne({
      where: { phoneNumber: normalizedPhone },
    });

    const { allowed } = await this.checkDailyLimit(normalizedPhone, OtpType.PHONE);
    if (!allowed) {
      throw new BadRequestException(
        `Daily verification limit reached. Maximum ${this.MAX_REQUESTS_PER_DAY} per day. Retry after ${this.getTomorrowDate()}.`,
      );
    }

    // Invalidate previous pending registration OTPs for this phone.
    await this.otpRepository.update(
      {
        phoneNumber: normalizedPhone,
        otpPurpose: OtpPurpose.VERIFICATION,
        deliveryMethod: OtpDeliveryMethod.WHATSAPP,
        isVerified: false,
        expiresAt: MoreThan(now()),
      },
      { expiresAt: now() },
    );

    const otpCode = this.generateOtpCode();
    const expiresAt = new Date(nowTimestamp() + this.OTP_EXPIRY_MINUTES * 60 * 1000);

    await this.otpRepository.save(
      this.otpRepository.create({
        phoneNumber: normalizedPhone,
        otpCode,
        otpType: OtpType.PHONE,
        otpPurpose: OtpPurpose.VERIFICATION,
        deliveryMethod: OtpDeliveryMethod.WHATSAPP,
        expiresAt,
        createdAt: now(),
        createdDate: this.getTodayDate(),
        ipAddress,
      }),
    );

    return {
      success: true,
      message: `Tap the WhatsApp link (or scan the QR) and send the message to verify. Valid for ${this.OTP_EXPIRY_MINUTES} minute(s).`,
      waLink: this.buildWhatsAppOtpLink(otpCode),
      expiresAt,
      existingUserId: existingUser ? String(existingUser.id) : null,
    };
  }

  /**
   * Request an emailed OTP for the public registration form.
   * Reports whether the email already belongs to a user (existing-account claim),
   * without throwing. Sends the code via email (email path only).
   */
  async requestRegistrationEmailOtp(
    email: string,
    ipAddress?: string,
  ): Promise<{ success: boolean; message: string; expiresAt: Date; existingUserId: string | null }> {
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      throw new BadRequestException('Invalid email address');
    }

    const existingUser = await this.userRepository.findOne({
      where: { email: normalizedEmail },
    });

    const { allowed } = await this.checkDailyLimit(normalizedEmail, OtpType.EMAIL);
    if (!allowed) {
      throw new BadRequestException(
        `Daily verification limit reached. Maximum ${this.MAX_REQUESTS_PER_DAY} per day. Retry after ${this.getTomorrowDate()}.`,
      );
    }

    await this.otpRepository.update(
      {
        email: normalizedEmail,
        otpPurpose: OtpPurpose.VERIFICATION,
        otpType: OtpType.EMAIL,
        isVerified: false,
        expiresAt: MoreThan(now()),
      },
      { expiresAt: now() },
    );

    const otpCode = this.generateOtpCode();
    const expiresAt = new Date(nowTimestamp() + this.OTP_EXPIRY_MINUTES * 60 * 1000);

    await this.otpRepository.save(
      this.otpRepository.create({
        email: normalizedEmail,
        otpCode,
        otpType: OtpType.EMAIL,
        otpPurpose: OtpPurpose.VERIFICATION,
        deliveryMethod: OtpDeliveryMethod.EMAIL,
        expiresAt,
        createdAt: now(),
        createdDate: this.getTodayDate(),
        ipAddress,
      }),
    );

    try {
      await this.enhancedEmailService.sendOTP({
        email: normalizedEmail,
        otp: otpCode,
        userName: normalizedEmail.split('@')[0],
        expiryMinutes: this.OTP_EXPIRY_MINUTES.toString(),
        requestType: 'Registration Verification',
        ipAddress,
      });
    } catch (emailError) {
      this.logger.error(`❌ Failed to send registration OTP email to ${normalizedEmail}: ${emailError.message}`);
    }

    return {
      success: true,
      message: `Verification code sent to ${normalizedEmail}. Valid for ${this.OTP_EXPIRY_MINUTES} minute(s).`,
      expiresAt,
      existingUserId: existingUser ? String(existingUser.id) : null,
    };
  }

  /**
   * One-shot status check for the reverse-WhatsApp registration OTP.
   * The public form polls this after the user sends their WhatsApp message.
   */
  async getRegistrationPhoneOtpStatus(
    phoneNumber: string,
  ): Promise<{ verified: boolean; expired: boolean }> {
    return this.getPhoneOtpStatus(phoneNumber, OtpPurpose.VERIFICATION);
  }

  /**
   * Assert that a contact has a currently-verified registration OTP. Throws if not.
   * Called at register/claim time so the server never trusts a client "verified" flag.
   */
  async assertRegistrationVerified(params: { phoneNumber?: string; email?: string }): Promise<void> {
    if (params.phoneNumber) {
      const normalizedPhone = normalizeSriLankanPhone(params.phoneNumber);
      if (!normalizedPhone) throw new BadRequestException('Invalid phone number format');
      const otp = await this.otpRepository.findOne({
        where: {
          phoneNumber: normalizedPhone,
          otpPurpose: OtpPurpose.VERIFICATION,
          deliveryMethod: OtpDeliveryMethod.WHATSAPP,
          isVerified: true,
        },
        order: { verifiedAt: 'DESC' },
      });
      if (!otp) throw new BadRequestException('Phone number has not been verified.');
    }
    if (params.email) {
      const normalizedEmail = params.email.trim().toLowerCase();
      const otp = await this.otpRepository.findOne({
        where: {
          email: normalizedEmail,
          otpType: OtpType.EMAIL,
          otpPurpose: OtpPurpose.VERIFICATION,
          isVerified: true,
        },
        order: { verifiedAt: 'DESC' },
      });
      if (!otp) throw new BadRequestException('Email address has not been verified.');
    }
  }
}
