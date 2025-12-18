import { Injectable, BadRequestException, NotFoundException, Logger, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import * as crypto from 'crypto';
import { UserEntity } from '../../modules/user/entities/user.entity';
import { PasswordResetTokenEntity } from '../entities/password-reset.entity';
import { AsyncEmailService } from '../../common/services/async-email.service';
import { AuthService } from '../auth.service';

export interface InitiatePasswordResetDto {
  email: string;
}

export interface VerifyPasswordResetOtpDto {
  email: string;
  otp: string;
}

export interface ResetPasswordDto {
  email: string;
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
    email: string;
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
   * Initiate password reset process
   */
  async initiatePasswordReset(
    dto: InitiatePasswordResetDto,
    ipAddress?: string,
    userAgent?: string
  ): Promise<PasswordResetResponseDto> {

    // Check if user exists
    const user = await this.userRepository.findOne({
      where: { email: dto.email, isActive: true }
    });

    if (!user) {
      // Don't reveal if email exists or not for security
      return {
        success: true,
        message: 'If an account with this email exists, you will receive a password reset code.',
        data: {
          email: dto.email,
          expiresInMinutes: 15
        }
      };
    }

    // Check rate limiting (max 3 requests per 15 minutes)
    const recentTokens = await this.passwordResetTokenRepository.count({
      where: {
        email: dto.email,
        tokenType: 'PASSWORD_RESET',
        createdAt: new Date(Date.now() - 15 * 60 * 1000) // Last 15 minutes
      }
    });

    if (recentTokens >= 3) {
      throw new BadRequestException('Too many password reset requests. Please wait 15 minutes before trying again.');
    }

    // Generate OTP
    const otp = this.generateOTP();
    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + 15); // 15 minutes expiry

    // Invalidate any existing tokens for this email
    await this.passwordResetTokenRepository.update(
      { email: dto.email, tokenType: 'PASSWORD_RESET', isUsed: false },
      { isUsed: true }
    );

    // Create new token
    const resetToken = this.passwordResetTokenRepository.create({
      email: dto.email,
      otp,
      tokenType: 'PASSWORD_RESET',
      expiresAt,
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
      message: 'Password reset code sent to your email address. Please check your inbox.',
      data: {
        email: dto.email,
        expiresInMinutes: 15
      }
    };
  }

  /**
   * Verify password reset OTP
   */
  async verifyPasswordResetOtp(dto: VerifyPasswordResetOtpDto): Promise<PasswordResetResponseDto> {

    const resetToken = await this.passwordResetTokenRepository.findOne({
      where: {
        email: dto.email,
        otp: dto.otp,
        tokenType: 'PASSWORD_RESET',
        isUsed: false
      }
    });

    if (!resetToken) {
      // Increment failed attempts for security monitoring
      await this.passwordResetTokenRepository.increment(
        { email: dto.email, tokenType: 'PASSWORD_RESET' },
        'failedAttempts',
        1
      );
      throw new BadRequestException('Invalid or expired OTP code');
    }

    if (resetToken.expiresAt < new Date()) {
      await this.passwordResetTokenRepository.update(resetToken.id, { isUsed: true });
      throw new BadRequestException('OTP code has expired. Please request a new one.');
    }


    return {
      success: true,
      message: 'OTP verified successfully. You can now reset your password.',
      data: {
        email: dto.email,
        expiresInMinutes: Math.ceil((resetToken.expiresAt.getTime() - Date.now()) / (1000 * 60))
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

    // Verify OTP
    const resetToken = await this.passwordResetTokenRepository.findOne({
      where: {
        email: dto.email,
        otp: dto.otp,
        tokenType: 'PASSWORD_RESET',
        isUsed: false
      }
    });

    if (!resetToken || resetToken.expiresAt < new Date()) {
      throw new BadRequestException('Invalid or expired OTP code');
    }

    // Find user
    const user = await this.userRepository.findOne({
      where: { email: dto.email, isActive: true }
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Hash new password using AuthService with pepper and proper salt rounds
    const hashedPassword = await this.authService.hashPassword(dto.newPassword);

    // Update user password
    await this.userRepository.update(user.id, {
      password: hashedPassword
    });

    // Mark token as used
    await this.passwordResetTokenRepository.update(resetToken.id, {
      isUsed: true,
      usedAt: new Date(),
      ipAddress,
      userAgent
    });

    // TODO: Add password change confirmation email template to EnhancedEmailService
    // For now, skip sending confirmation email


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
      password: hashedPassword
    });

    // TODO: Add password change confirmation email template to EnhancedEmailService
    // For now, skip sending confirmation email


    return {
      success: true,
      message: 'Password changed successfully.',
      data: {
        changedAt: new Date()
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
    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + 15); // 15 minutes expiry

    // Invalidate any existing tokens for this email
    await this.passwordResetTokenRepository.update(
      { email: user.email, tokenType: 'CHANGE_PASSWORD', isUsed: false },
      { isUsed: true }
    );

    // Create new token
    const resetToken = this.passwordResetTokenRepository.create({
      email: user.email!,
      otp,
      tokenType: 'CHANGE_PASSWORD',
      expiresAt,
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

    if (!resetToken || resetToken.expiresAt < new Date()) {
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
      password: hashedPassword
    });

    // Mark token as used
    await this.passwordResetTokenRepository.update(resetToken.id, {
      isUsed: true,
      usedAt: new Date(),
      ipAddress,
      userAgent
    });

    // TODO: Add password change confirmation email template to EnhancedEmailService
    // For now, skip sending confirmation email


    return {
      success: true,
      message: 'Password changed successfully.',
      data: {
        changedAt: new Date()
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
      expiresAt: new Date()
    });

    return result.affected || 0;
  }
}
