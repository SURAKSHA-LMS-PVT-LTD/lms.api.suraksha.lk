import { Injectable, BadRequestException, NotFoundException, Logger, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import * as crypto from 'crypto';
import { UserEntity } from '../../modules/user/entities/user.entity';
import { PasswordResetTokenEntity } from '../entities/password-reset.entity';
import { AsyncEmailService } from '../../common/services/async-email.service';
import { AuthService } from '../auth.service';
import { now, nowTimestamp } from '../../common/utils/timezone.util';
import { detectIdentifierType } from '../../common/utils/identifier.util';
import { maskPii } from '../../common/utils/pii-masking.util';

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
    private readonly asyncEmailService: AsyncEmailService,
    private readonly jwtService: JwtService,
    private readonly authService: AuthService,
  ) {}

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
