import { Injectable, BadRequestException, NotFoundException, Logger, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import * as crypto from 'crypto';
import { UserEntity } from '../../modules/user/entities/user.entity';
import { PasswordResetTokenEntity } from '../entities/password-reset.entity';
import { UserOtpEntity, OtpType, OtpPurpose, OtpDeliveryMethod } from '../../modules/user/entities/user-otp.entity';
import { StudentEntity } from '../../modules/student/entities/student.entity';
import { ParentEntity } from '../../modules/parent/entities/parent.entity';
import { AsyncEmailService } from '../../common/services/async-email.service';
import { AuthService } from '../auth.service';
import { now, nowTimestamp } from '../../common/utils/timezone.util';
import { detectIdentifierType } from '../../common/utils/identifier.util';
import { maskPii } from '../../common/utils/pii-masking.util';
import { normalizeSriLankanPhone } from '../../common/utils/phone-normalizer.util';

export interface InitiatePasswordResetDto {
  identifier: string;
}

export interface VerifyPasswordResetOtpDto {
  identifier: string;
  otp: string;
}

export interface ResetPasswordDto {
  identifier: string;
  otp: string;
  newPassword: string;
  confirmPassword: string;
}

export interface PasswordResetChangePasswordDto {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}

export interface PasswordResetResponseDto {
  success: boolean;
  message: string;
  data?: {
    identifier?: string;
    email?: string; // Deprecated: for backward compatibility
    expiresInMinutes: number;
  };
}

export interface PasswordChangeResponseDto {
  success: boolean;
  message: string;
  data?: {
    changedAt: Date;
  };
}

@Injectable()
export class PasswordResetService {
  private readonly logger = new Logger(PasswordResetService.name);

  constructor(
    @InjectRepository(UserEntity)
    private readonly userRepository: Repository<UserEntity>,
    @InjectRepository(PasswordResetTokenEntity)
    private readonly passwordResetTokenRepository: Repository<PasswordResetTokenEntity>,
    @InjectRepository(UserOtpEntity)
    private readonly otpRepository: Repository<UserOtpEntity>,
    @InjectRepository(StudentEntity)
    private readonly studentRepository: Repository<StudentEntity>,
    @InjectRepository(ParentEntity)
    private readonly parentRepository: Repository<ParentEntity>,
    private readonly asyncEmailService: AsyncEmailService,
    private readonly jwtService: JwtService,
    private readonly authService: AuthService,
  ) {}

  // ── WhatsApp reverse-OTP reset (main login: own + parent numbers) ───────────

  private maskPhone3(phone: string): string {
    if (!phone || phone.length < 3) return '****';
    return `****${phone.slice(-3)}`;
  }

  private async resolveUserByIdentifier(identifier: string): Promise<UserEntity | null> {
    const { type, normalized } = this.detectIdentifierType(identifier);
    const where: any = { isActive: true };
    if (type === 'email') where.email = normalized;
    else if (type === 'phone') where.phoneNumber = normalized;
    else if (type === 'system_id') where.id = normalized;
    else if (type === 'birth_certificate') where.birthCertificateNo = normalized;
    else return null;
    return this.userRepository.findOne({ where, select: ['id', 'email', 'phoneNumber', 'firstName', 'lastName', 'isActive'] });
  }

  /** Build own + parent phone contacts (masked last 3) for the resolved user. */
  private async buildPhoneContacts(userId: string): Promise<{ id: string; label: string; masked: string; phone: string }[]> {
    const user = await this.userRepository.findOne({ where: { id: userId }, select: ['id', 'phoneNumber'] });
    const contacts: { id: string; label: string; masked: string; phone: string }[] = [];
    if (user?.phoneNumber) {
      contacts.push({ id: 'own_phone', label: 'Your registered phone', masked: this.maskPhone3(user.phoneNumber), phone: user.phoneNumber });
    }
    // Parent phones, if this user is a student.
    const student = await this.studentRepository.findOne({ where: { userId } });
    if (student) {
      const entries = [
        { id: 'father_phone', parentId: student.fatherId, label: "Father's phone" },
        { id: 'mother_phone', parentId: student.motherId, label: "Mother's phone" },
        { id: 'guardian_phone', parentId: student.guardianId, label: "Guardian's phone" },
      ];
      const parentIds = entries.map(e => e.parentId).filter(Boolean) as string[];
      if (parentIds.length) {
        const parents = await this.parentRepository.find({ where: { userId: In(parentIds) }, relations: ['user'] });
        const byId = new Map(parents.map(p => [p.userId, p]));
        for (const e of entries) {
          if (!e.parentId) continue;
          const phone = byId.get(e.parentId)?.user?.phoneNumber;
          if (phone && !contacts.some(c => c.id === e.id)) {
            contacts.push({ id: e.id, label: e.label, masked: this.maskPhone3(phone), phone });
          }
        }
      }
    }
    return contacts;
  }

  /** Public: list selectable phone contacts (own + parents) for WhatsApp reset. */
  async getWhatsAppResetContacts(identifier: string): Promise<{ contacts: { id: string; label: string; masked: string }[] }> {
    const user = await this.resolveUserByIdentifier(identifier);
    // Don't reveal existence — return empty list rather than 404 when not found.
    if (!user) return { contacts: [] };
    const contacts = await this.buildPhoneContacts(user.id);
    return { contacts: contacts.map(({ id, label, masked }) => ({ id, label, masked })) };
  }

  /** Public: create a WhatsApp reverse-OTP for the chosen phone contact; returns the wa.me link. */
  async initiateWhatsAppReset(identifier: string, selectedContactId: string, ipAddress?: string): Promise<{ message: string; sentTo: string; waLink: string }> {
    if (!process.env.WHATSAPP_BUSINESS_NUMBER) {
      throw new BadRequestException('WhatsApp verification is not configured on this server.');
    }
    const user = await this.resolveUserByIdentifier(identifier);
    if (!user) throw new BadRequestException('If the account exists, you can verify via WhatsApp.');

    const contacts = await this.buildPhoneContacts(user.id);
    const chosen = contacts.find(c => c.id === selectedContactId);
    if (!chosen) throw new BadRequestException('Selected contact is not available.');

    const normalized = normalizeSriLankanPhone(chosen.phone) || chosen.phone;

    // Invalidate previous pending OTPs for this user+purpose.
    await this.otpRepository.update(
      { userId: user.id, otpPurpose: OtpPurpose.PASSWORD_RESET, deliveryMethod: OtpDeliveryMethod.WHATSAPP, isVerified: false },
      { isVerified: true },
    );

    const otpCode = crypto.randomInt(100000, 1000000).toString();
    const expiresAt = new Date(nowTimestamp() + 30 * 60 * 1000);
    await this.otpRepository.save(this.otpRepository.create({
      userId: user.id,
      phoneNumber: normalized,
      otpCode,
      otpType: OtpType.PHONE,
      otpPurpose: OtpPurpose.PASSWORD_RESET,
      deliveryMethod: OtpDeliveryMethod.WHATSAPP,
      expiresAt,
      createdAt: now(),
      createdDate: new Date().toISOString().split('T')[0],
      ipAddress: ipAddress || null,
    }));

    return { message: 'Tap the WhatsApp link and send the message to verify.', sentTo: chosen.masked, waLink: this.buildWhatsAppOtpLink(otpCode) };
  }

  /** Public: poll whether the WhatsApp reset OTP was confirmed by the webhook. */
  async getWhatsAppResetStatus(identifier: string): Promise<{ verified: boolean; expired: boolean }> {
    const user = await this.resolveUserByIdentifier(identifier);
    if (!user) return { verified: false, expired: false };
    const otp = await this.otpRepository.findOne({
      where: { userId: user.id, otpPurpose: OtpPurpose.PASSWORD_RESET, deliveryMethod: OtpDeliveryMethod.WHATSAPP },
      order: { createdAt: 'DESC' },
    });
    if (!otp) return { verified: false, expired: false };
    const expired = !otp.isVerified && otp.expiresAt.getTime() <= Date.now();
    return { verified: otp.isVerified, expired };
  }

  /** Public: complete the reset after WhatsApp confirmation (no typed code). */
  async resetPasswordViaWhatsApp(identifier: string, newPassword: string): Promise<{ success: boolean; message: string }> {
    const user = await this.resolveUserByIdentifier(identifier);
    if (!user) throw new BadRequestException('Invalid request.');
    const confirmed = await this.otpRepository.findOne({
      where: { userId: user.id, otpPurpose: OtpPurpose.PASSWORD_RESET, deliveryMethod: OtpDeliveryMethod.WHATSAPP, isVerified: true },
      order: { createdAt: 'DESC' },
    });
    if (!confirmed) throw new BadRequestException('WhatsApp verification not completed. Send the code from your WhatsApp first.');
    const verifiedAt = confirmed.verifiedAt?.getTime() ?? 0;
    if (Date.now() - verifiedAt > 30 * 60 * 1000) {
      throw new BadRequestException('Verification expired. Please request a new WhatsApp code.');
    }
    const hashed = await this.authService.hashPassword(newPassword);
    await this.userRepository.update({ id: user.id }, { password: hashed, updatedAt: now() });
    this.logger.log(`✅ Main password reset via WhatsApp: user=${user.id}`);
    return { success: true, message: 'Password reset successfully' };
  }

  /**
   * Detect identifier type - delegates to shared utility
   */
  private detectIdentifierType(identifier: string) {
    return detectIdentifierType(identifier);
  }

  /**
   * Initiate password reset process
   */
  async initiatePasswordReset(
    dto: InitiatePasswordResetDto,
    ipAddress?: string,
    userAgent?: string
  ): Promise<PasswordResetResponseDto> {

    // 🔍 Detect identifier type and normalize
    const { type, normalized } = this.detectIdentifierType(dto.identifier);
    
    this.logger.log(`🔐 Password reset request with ${type}: ${maskPii(normalized)}`);

    // Build query based on identifier type
    let whereClause: any = { isActive: true };
    
    switch (type) {
      case 'email':
        whereClause.email = normalized;
        break;
      case 'phone':
        whereClause.phoneNumber = normalized;
        break;
      case 'system_id':
        whereClause.id = normalized;
        break;
      case 'birth_certificate':
        whereClause.birthCertificateNo = normalized;
        break;
    }

    // Check if user exists
    const user = await this.userRepository.findOne({
      where: whereClause,
      select: ['id', 'email', 'phoneNumber', 'firstName', 'lastName', 'isActive']
    });

    if (!user || !user.email) {
      // Don't reveal if identifier exists or not for security
      return {
        success: true,
        message: 'If an account with this identifier exists, you will receive a password reset code.',
        data: {
          identifier: dto.identifier,
          expiresInMinutes: 15
        }
      };
    }

    // Check rate limiting (max 3 requests per 15 minutes) - use email as key
    const fifteenMinutesAgo = nowTimestamp() - (15 * 60 * 1000);
    const recentTokens = await this.passwordResetTokenRepository.count({
      where: {
        email: user.email,
        tokenType: 'PASSWORD_RESET',
        createdAt: new Date(fifteenMinutesAgo)
      }
    });

    if (recentTokens >= 3) {
      throw new BadRequestException('Too many password reset requests. Please wait 15 minutes before trying again.');
    }

    // Generate OTP
    const otp = this.generateOTP();
    const expiresAt = now();
    expiresAt.setMinutes(expiresAt.getMinutes() + 15); // 15 minutes expiry

    // Invalidate any existing tokens for this email
    await this.passwordResetTokenRepository.update(
      { email: user.email, tokenType: 'PASSWORD_RESET', isUsed: false },
      { isUsed: true, updatedAt: now() }
    );

    // Create new token (store email for OTP verification)
    const resetToken = this.passwordResetTokenRepository.create({
      email: user.email, // Always store email for OTP verification
      otp,
      tokenType: 'PASSWORD_RESET',
      expiresAt,
      createdAt: now(),
      updatedAt: now(),
      ipAddress,
      userAgent,
    });

    await this.passwordResetTokenRepository.save(resetToken);

    // 📧 Send OTP email (FIRE-AND-FORGET - Zero blocking)
    this.asyncEmailService.sendOTPAsync({
      email: user.email!,
      otp: otp,
      userName: `${user.firstName || ''} ${user.lastName || ''}`.trim() || 'User',
      expiryMinutes: '15',
      requestType: 'Password Reset',
      ipAddress: ipAddress || 'Unknown',
    });
    // ✅ Email sent asynchronously - execution continues immediately


    return {
      success: true,
      message: 'If an account with this identifier exists, you will receive a password reset code.',
      data: {
        identifier: dto.identifier,
        expiresInMinutes: 15
      }
    };
  }

  /**
   * Verify password reset OTP
   */
  async verifyPasswordResetOtp(dto: VerifyPasswordResetOtpDto): Promise<PasswordResetResponseDto> {

    // 🔍 Detect identifier type and find user
    const { type, normalized } = this.detectIdentifierType(dto.identifier);
    
    let whereClause: any = { isActive: true };
    switch (type) {
      case 'email':
        whereClause.email = normalized;
        break;
      case 'phone':
        whereClause.phoneNumber = normalized;
        break;
      case 'system_id':
        whereClause.id = normalized;
        break;
      case 'birth_certificate':
        whereClause.birthCertificateNo = normalized;
        break;
    }

    const user = await this.userRepository.findOne({
      where: whereClause,
      select: ['id', 'email']
    });

    if (!user || !user.email) {
      throw new BadRequestException('Invalid or expired OTP code');
    }

    // 🔐 SECURITY: Check for brute force — block after 5 failed OTP attempts
    const latestToken = await this.passwordResetTokenRepository.findOne({
      where: {
        email: user.email,
        tokenType: 'PASSWORD_RESET',
        isUsed: false
      },
      order: { createdAt: 'DESC' }
    });

    if (latestToken && latestToken.attemptCount >= 5) {
      // Auto-invalidate the token after too many failures
      await this.passwordResetTokenRepository.update(latestToken.id, { isUsed: true, updatedAt: now() });
      throw new BadRequestException('Too many failed OTP attempts. Please request a new code.');
    }

    // Verify OTP using the user's email
    const resetToken = await this.passwordResetTokenRepository.findOne({
      where: {
        email: user.email,
        otp: dto.otp,
        tokenType: 'PASSWORD_RESET',
        isUsed: false
      }
    });

    if (!resetToken) {
      // L4: count the failed attempt on the SAME token the brute-force cap reads
      // (latestToken), not across all matching rows — otherwise the cap could be evaded
      // by spreading attempts across multiple outstanding OTP rows.
      if (latestToken) {
        await this.passwordResetTokenRepository.increment(
          { id: latestToken.id },
          'attemptCount',
          1
        );
      }
      throw new BadRequestException('Invalid or expired OTP code');
    }

    const currentTime = now();
    if (resetToken.expiresAt < currentTime) {
      await this.passwordResetTokenRepository.update(resetToken.id, { isUsed: true, updatedAt: now() });
      throw new BadRequestException('OTP code has expired. Please request a new one.');
    }


    const remainingTimeMs = resetToken.expiresAt.getTime() - nowTimestamp();
    const expiresInMinutes = Math.ceil(remainingTimeMs / (60 * 1000));
    
    return {
      success: true,
      message: 'OTP verified successfully. You can now reset your password.',
      data: {
        identifier: dto.identifier,
        email: user.email,
        expiresInMinutes
      }
    };
  }

  /**
   * Reset password with OTP
   */
  async resetPassword(
    dto: ResetPasswordDto,
    ipAddress?: string,
    userAgent?: string
  ): Promise<PasswordResetResponseDto> {

    // Validate password confirmation
    if (dto.newPassword !== dto.confirmPassword) {
      throw new BadRequestException('New password and confirmation do not match');
    }

    // Validate password strength
    this.validatePasswordStrength(dto.newPassword);

    // 🔍 Detect identifier type and find user
    const { type, normalized } = this.detectIdentifierType(dto.identifier);
    
    let whereClause: any = { isActive: true };
    switch (type) {
      case 'email':
        whereClause.email = normalized;
        break;
      case 'phone':
        whereClause.phoneNumber = normalized;
        break;
      case 'system_id':
        whereClause.id = normalized;
        break;
      case 'birth_certificate':
        whereClause.birthCertificateNo = normalized;
        break;
    }

    const user = await this.userRepository.findOne({
      where: whereClause,
      select: ['id', 'email']
    });

    if (!user || !user.email) {
      throw new NotFoundException('User not found');
    }

    // 🔐 SECURITY: Check for brute force — block after 5 failed OTP attempts
    const latestResetToken = await this.passwordResetTokenRepository.findOne({
      where: {
        email: user.email,
        tokenType: 'PASSWORD_RESET',
        isUsed: false
      },
      order: { createdAt: 'DESC' }
    });

    if (latestResetToken && latestResetToken.attemptCount >= 5) {
      await this.passwordResetTokenRepository.update(latestResetToken.id, { isUsed: true, updatedAt: now() });
      throw new BadRequestException('Too many failed OTP attempts. Please request a new code.');
    }

    // Verify OTP using the user's email
    const resetToken = await this.passwordResetTokenRepository.findOne({
      where: {
        email: user.email,
        otp: dto.otp,
        tokenType: 'PASSWORD_RESET',
        isUsed: false
      }
    });

    const currentTime = now();
    if (!resetToken || resetToken.expiresAt < currentTime) {
      // 🔐 SECURITY: Increment failed attempts on wrong OTP
      if (latestResetToken) {
        await this.passwordResetTokenRepository.increment(
          { id: latestResetToken.id },
          'attemptCount',
          1
        );
      }
      throw new BadRequestException('Invalid or expired OTP code');
    }

    // Hash new password using AuthService with pepper and proper salt rounds
    const hashedPassword = await this.authService.hashPassword(dto.newPassword);

    // Update user password
    await this.userRepository.update(user.id, {
      password: hashedPassword,
      passwordSetAt: now(), // invalidate pre-reset access tokens (M1)
    });

    // Mark token as used
    await this.passwordResetTokenRepository.update(resetToken.id, {
      isUsed: true,
      usedAt: now(),
      ipAddress,
      userAgent
    });

    // 🔐 SECURITY: Revoke all refresh tokens on password reset
    // Forces re-login on all devices, preventing stolen token reuse
    await this.authService.revokeAllUserSessions(user.id);

    return {
      success: true,
      message: 'Password reset successfully. You can now login with your new password.'
    };
  }

  /**
   * Change password for authenticated user
   */
  async changePassword(
    userId: string,
    dto: PasswordResetChangePasswordDto,
    ipAddress?: string,
    userAgent?: string
  ): Promise<PasswordChangeResponseDto> {

    // Validate password confirmation
    if (dto.newPassword !== dto.confirmPassword) {
      throw new BadRequestException('New password and confirmation do not match');
    }

    // Validate password strength
    this.validatePasswordStrength(dto.newPassword);

    // Find user (explicitly select password field - bypasses select: false)
    const user = await this.userRepository.findOne({
      where: { id: userId, isActive: true },
      select: ['id', 'email', 'password', 'firstName', 'lastName', 'isActive', 'userType']
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Verify current password
    if (!user.password) {
      throw new BadRequestException('User has no password set. Please use first login process.');
    }

    const isCurrentPasswordValid = await this.authService.comparePassword(dto.currentPassword, user.password);
    if (!isCurrentPasswordValid) {
      throw new UnauthorizedException('Current password is incorrect');
    }

    // Check if new password is different from current
    const isSamePassword = await this.authService.comparePassword(dto.newPassword, user.password);
    if (isSamePassword) {
      throw new BadRequestException('New password must be different from current password');
    }

    // Hash new password using AuthService with pepper and proper salt rounds
    const hashedPassword = await this.authService.hashPassword(dto.newPassword);

    // Update user password
    await this.userRepository.update(userId, {
      password: hashedPassword,
      passwordSetAt: now(), // invalidate pre-reset access tokens (M1)
    });

    // 🔐 SECURITY: Revoke all refresh tokens on password change
    await this.authService.revokeAllUserSessions(userId);

    return {
      success: true,
      message: 'Password changed successfully.',
      data: {
        changedAt: now()
      }
    };
  }

  /**
   * Initiate password change with OTP verification
   */
  async initiatePasswordChange(
    userId: string,
    currentPassword: string,
    ipAddress?: string,
    userAgent?: string
  ): Promise<PasswordResetResponseDto> {

    // Find user (explicitly select password field - bypasses select: false)
    const user = await this.userRepository.findOne({
      where: { id: userId, isActive: true },
      select: ['id', 'email', 'password', 'firstName', 'lastName', 'isActive', 'userType']
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Verify current password
    if (!user.password) {
      throw new BadRequestException('User has no password set. Please use first login process.');
    }

    const isCurrentPasswordValid = await this.authService.comparePassword(currentPassword, user.password);
    if (!isCurrentPasswordValid) {
      throw new UnauthorizedException('Current password is incorrect');
    }

    // Generate OTP
    const otp = this.generateOTP();
    const expiryTimeMs = nowTimestamp() + (15 * 60 * 1000); // 15 minutes in milliseconds
    const expiresAt = new Date(expiryTimeMs);

    // Invalidate any existing tokens for this email
    await this.passwordResetTokenRepository.update(
      { email: user.email, tokenType: 'CHANGE_PASSWORD', isUsed: false },
      { isUsed: true, updatedAt: now() }
    );

    // Create new token
    const resetToken = this.passwordResetTokenRepository.create({
      email: user.email!,
      otp,
      tokenType: 'CHANGE_PASSWORD',
      expiresAt,
      createdAt: now(), // Explicitly set Sri Lanka timezone
      updatedAt: now(), // Initialize updatedAt
      ipAddress,
      userAgent,
    });

    await this.passwordResetTokenRepository.save(resetToken);

    // 📧 Send OTP email (FIRE-AND-FORGET - Zero blocking)
    this.asyncEmailService.sendOTPAsync({
      email: user.email!,
      otp: otp,
      userName: `${user.firstName || ''} ${user.lastName || ''}`.trim() || 'User',
      expiryMinutes: '15',
      requestType: 'Password Change',
      ipAddress: ipAddress || 'Unknown',
    });
    // ✅ Email sent asynchronously - execution continues immediately


    return {
      success: true,
      message: 'Password change verification code sent to your email address.',
      data: {
        email: user.email!,
        expiresInMinutes: 15
      }
    };
  }

  /**
   * Complete password change with OTP
   */
  async completePasswordChange(
    userId: string,
    otp: string,
    newPassword: string,
    confirmPassword: string,
    ipAddress?: string,
    userAgent?: string
  ): Promise<PasswordChangeResponseDto> {

    // Validate password confirmation
    if (newPassword !== confirmPassword) {
      throw new BadRequestException('New password and confirmation do not match');
    }

    // Validate password strength
    this.validatePasswordStrength(newPassword);

    // Find user (explicitly select password field - bypasses select: false)
    const user = await this.userRepository.findOne({
      where: { id: userId, isActive: true },
      select: ['id', 'email', 'password', 'firstName', 'lastName', 'isActive', 'userType']
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Verify OTP
    const resetToken = await this.passwordResetTokenRepository.findOne({
      where: {
        email: user.email,
        otp,
        tokenType: 'CHANGE_PASSWORD',
        isUsed: false
      }
    });

    const currentTime = now();
    if (!resetToken || resetToken.expiresAt < currentTime) {
      throw new BadRequestException('Invalid or expired OTP code');
    }

    // Check if new password is different from current
    if (user.password) {
      const isSamePassword = await this.authService.comparePassword(newPassword, user.password);
      if (isSamePassword) {
        throw new BadRequestException('New password must be different from current password');
      }
    }

    // Hash new password using AuthService with pepper and proper salt rounds
    const hashedPassword = await this.authService.hashPassword(newPassword);

    // Update user password
    await this.userRepository.update(user.id, {
      password: hashedPassword,
      passwordSetAt: now(), // invalidate pre-reset access tokens (M1)
    });

    // Mark token as used
    await this.passwordResetTokenRepository.update(resetToken.id, {
      isUsed: true,
      usedAt: now(),
      ipAddress,
      userAgent
    });

    // 🔐 SECURITY: Revoke all refresh tokens on password change via OTP
    await this.authService.revokeAllUserSessions(user.id);

    return {
      success: true,
      message: 'Password changed successfully.',
      data: {
        changedAt: now()
      }
    };
  }

  /**
   * Generate a 6-digit OTP
   */
  private generateOTP(): string {
    return crypto.randomInt(100000, 999999).toString();
  }

  // ============================================================
  // 💬 WHATSAPP-LINK PASSWORD-RESET OTP (reverse-OTP)
  //
  // Same wa.me model as phone verification. The token is bound to the user's
  // phone number; the webhook confirms it (code + sender phone must match) and
  // sets isOtpVerified. The site then completes the reset on the "Next" click
  // by passing the same OTP to /reset/complete (unchanged).
  // ============================================================

  private buildWhatsAppOtpLink(otpCode: string): string {
    const businessNumber = (process.env.WHATSAPP_BUSINESS_NUMBER || '').replace(/[^\d]/g, '');
    const text = encodeURIComponent(`OTP ${otpCode}`);
    return `https://wa.me/${businessNumber}?text=${text}`;
  }

  /**
   * Initiate a WhatsApp-link password reset. The user must have a phone number
   * on file (the WhatsApp sender is bound to it). Returns a wa.me link.
   */
  async initiatePasswordResetWhatsApp(
    dto: InitiatePasswordResetDto,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<{ success: boolean; message: string; waLink?: string; expiresInMinutes: number }> {
    if (!process.env.WHATSAPP_BUSINESS_NUMBER) {
      throw new BadRequestException('WhatsApp verification is not configured on this server.');
    }

    const { type, normalized } = this.detectIdentifierType(dto.identifier);
    const whereClause: any = { isActive: true };
    switch (type) {
      case 'email': whereClause.email = normalized; break;
      case 'phone': whereClause.phoneNumber = normalized; break;
      case 'system_id': whereClause.id = normalized; break;
      case 'birth_certificate': whereClause.birthCertificateNo = normalized; break;
    }

    const user = await this.userRepository.findOne({
      where: whereClause,
      select: ['id', 'email', 'phoneNumber', 'isActive'],
    });

    // Don't reveal existence; but we can only do WhatsApp if a phone exists.
    if (!user || !user.phoneNumber) {
      return {
        success: true,
        message: 'If an account with this identifier exists and has a phone number, you can verify via WhatsApp.',
        expiresInMinutes: 15,
      };
    }

    const phone = normalizeSriLankanPhone(user.phoneNumber);
    if (!phone) {
      return {
        success: true,
        message: 'If an account with this identifier exists and has a phone number, you can verify via WhatsApp.',
        expiresInMinutes: 15,
      };
    }

    // Rate limit (reuse email key, same as SMS/email path)
    const fifteenMinutesAgo = nowTimestamp() - 15 * 60 * 1000;
    const recentTokens = await this.passwordResetTokenRepository.count({
      where: { email: user.email || phone, tokenType: 'PASSWORD_RESET', createdAt: new Date(fifteenMinutesAgo) },
    });
    if (recentTokens >= 3) {
      throw new BadRequestException('Too many password reset requests. Please wait 15 minutes before trying again.');
    }

    const otp = this.generateOTP();
    const expiresAt = now();
    expiresAt.setMinutes(expiresAt.getMinutes() + 15);

    // Invalidate existing unused reset tokens (keyed by email if present, else phone)
    await this.passwordResetTokenRepository.update(
      { email: user.email || phone, tokenType: 'PASSWORD_RESET', isUsed: false },
      { isUsed: true, updatedAt: now() },
    );

    const resetToken = this.passwordResetTokenRepository.create({
      email: user.email || phone, // keep a value in the (non-null) email column
      otp,
      tokenType: 'PASSWORD_RESET',
      deliveryMethod: 'WHATSAPP',
      phoneNumber: phone,
      expiresAt,
      createdAt: now(),
      updatedAt: now(),
      ipAddress,
      userAgent,
    });
    await this.passwordResetTokenRepository.save(resetToken);

    return {
      success: true,
      message: 'Send the WhatsApp message to verify, then return and continue.',
      waLink: this.buildWhatsAppOtpLink(otp),
      expiresInMinutes: 15,
    };
  }

  /**
   * One-shot status check for the WhatsApp password-reset OTP ("Next" click).
   * Returns { verified, expired } and the OTP only AFTER verification so the
   * client can pass it straight to /reset/complete. The code is never exposed
   * before the webhook confirms the WhatsApp sender.
   */
  async getPasswordResetWhatsAppStatus(
    dto: InitiatePasswordResetDto,
  ): Promise<{ verified: boolean; expired: boolean; otp?: string }> {
    const { type, normalized } = this.detectIdentifierType(dto.identifier);
    const whereClause: any = { isActive: true };
    switch (type) {
      case 'email': whereClause.email = normalized; break;
      case 'phone': whereClause.phoneNumber = normalized; break;
      case 'system_id': whereClause.id = normalized; break;
      case 'birth_certificate': whereClause.birthCertificateNo = normalized; break;
    }

    const user = await this.userRepository.findOne({
      where: whereClause,
      select: ['id', 'email', 'phoneNumber'],
    });
    if (!user) return { verified: false, expired: false };

    const phone = normalizeSriLankanPhone(user.phoneNumber);
    const token = await this.passwordResetTokenRepository.findOne({
      where: {
        email: user.email || phone || undefined,
        tokenType: 'PASSWORD_RESET',
        deliveryMethod: 'WHATSAPP',
        isUsed: false,
      },
      order: { createdAt: 'DESC' },
    });
    if (!token) return { verified: false, expired: false };

    const expired = !token.isOtpVerified && token.expiresAt.getTime() <= nowTimestamp();
    // Only return the OTP once the webhook has verified it, so the client can
    // complete the reset without the user re-typing anything.
    return { verified: token.isOtpVerified, expired, otp: token.isOtpVerified ? token.otp : undefined };
  }

  /**
   * Validate password strength
   */
  private validatePasswordStrength(password: string): void {
    if (password.length < 8) {
      throw new BadRequestException('Password must be at least 8 characters long');
    }

    if (!/(?=.*[a-z])/.test(password)) {
      throw new BadRequestException('Password must contain at least one lowercase letter');
    }

    if (!/(?=.*[A-Z])/.test(password)) {
      throw new BadRequestException('Password must contain at least one uppercase letter');
    }

    if (!/(?=.*\d)/.test(password)) {
      throw new BadRequestException('Password must contain at least one number');
    }

    if (!/(?=.*[@$!%*?&])/.test(password)) {
      throw new BadRequestException('Password must contain at least one special character (@$!%*?&)');
    }
  }

  /**
   * Clean up expired tokens (should be called periodically)
   */
  async cleanupExpiredTokens(): Promise<number> {
    
    const result = await this.passwordResetTokenRepository.delete({
      expiresAt: now()
    });

    return result.affected || 0;
  }
}
