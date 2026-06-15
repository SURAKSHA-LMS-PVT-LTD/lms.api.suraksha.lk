import { Entity, PrimaryGeneratedColumn, Column, Index } from 'typeorm';
import { Exclude } from 'class-transformer';

@Entity('password_reset_tokens')
// 🎯 REAL QUERY-BASED INDEXES - Based on actual codebase queries (Nov 2024)
// Token validation: password-reset.service.ts line 153, 206, first-login.service.ts line 139, 237
@Index('idx_password_reset_email_valid', ['email', 'isUsed', 'expiresAt', 'tokenType'])
// Cleanup expired tokens
@Index('idx_password_reset_expires', ['expiresAt', 'isUsed'])
export class PasswordResetTokenEntity {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string;

  @Column({ type: 'varchar', length: 255, name: 'email' })
  email: string;

  @Column({ type: 'varchar', length: 6, name: 'otp' })
  @Exclude()
  otp: string;

  @Column({ type: 'varchar', length: 500, nullable: true, name: 'verificationToken' })
  @Exclude()
  verificationToken?: string;

  @Column({ type: 'varchar', length: 50, name: 'tokenType' })
  tokenType: 'FIRST_LOGIN' | 'PASSWORD_RESET' | 'EMAIL_VERIFICATION' | 'CHANGE_PASSWORD';

  // How the OTP was delivered. EMAIL is the historical default; WHATSAPP uses
  // the reverse-OTP wa.me flow confirmed by the webhook.
  @Column({ type: 'enum', enum: ['SMS', 'WHATSAPP', 'EMAIL'], default: 'EMAIL', name: 'delivery_method' })
  deliveryMethod: 'SMS' | 'WHATSAPP' | 'EMAIL';

  // Phone number (normalized) the WhatsApp sender must match for WHATSAPP delivery.
  @Column({ type: 'varchar', length: 20, nullable: true, name: 'phone_number' })
  phoneNumber?: string;

  @Column({ type: 'boolean', default: false, name: 'isUsed' })
  isUsed: boolean;

  @Column({ type: 'datetime', nullable: true, name: 'usedAt' })
  usedAt?: Date;

  @Column({ type: 'boolean', default: false, name: 'isOtpVerified' })
  isOtpVerified: boolean;

  @Column({ type: 'datetime', name: 'expiresAt' })
  expiresAt: Date;

  @Column({ type: 'varchar', length: 45, nullable: true, name: 'ipAddress' })
  ipAddress?: string;

  // Phone number (normalized) that confirmed this token via WhatsApp.
  @Column({ type: 'varchar', length: 20, nullable: true, name: 'wa_sender_phone' })
  waSenderPhone?: string;

  @Column({ type: 'text', nullable: true, name: 'userAgent' })
  userAgent?: string;

  @Column({ type: 'int', default: 0, name: 'attemptCount' })
  attemptCount: number;

  @Column({ name: 'createdAt', type: 'datetime' })
  createdAt: Date;

  @Column({ name: 'updatedAt', type: 'datetime' })
  updatedAt: Date;
}

@Entity('user_first_login_logs')
// User's login history
@Index('idx_login_user_id', ['userId'])
// Email lookup
@Index('idx_login_email', ['email'])
// Status filtering
@Index('idx_login_status', ['status'])
export class UserFirstLoginLogEntity {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string;

  @Column({ type: 'bigint', name: 'userId' })
  userId: string;

  @Column({ type: 'varchar', length: 255, name: 'email' })
  email: string;

  @Column({ type: 'varchar', length: 50, name: 'status' })
  status: 'INITIATED' | 'OTP_SENT' | 'OTP_VERIFIED' | 'PASSWORD_SET' | 'COMPLETED' | 'FAILED';

  @Column({ type: 'varchar', length: 45, nullable: true, name: 'ipAddress' })
  ipAddress?: string;

  @Column({ type: 'text', nullable: true, name: 'userAgent' })
  userAgent?: string;

  @Column({ type: 'text', nullable: true, name: 'notes' })
  notes?: string;

  @Column({ name: 'createdAt', type: 'datetime' })
  createdAt: Date;

  @Column({ name: 'updatedAt', type: 'datetime' })
  updatedAt: Date;
}

/**
 * 🔄 Refresh Token Entity
 * Stores refresh tokens for secure token renewal
 * Supports both web (cookie-based) and mobile (body-based) authentication
 */
@Entity('refresh_tokens')
@Index('idx_refresh_token_user', ['userId', 'isRevoked'])
@Index('idx_refresh_token', ['token'])
@Index('idx_refresh_token_expires', ['expiresAt', 'isRevoked'])
@Index('idx_refresh_token_device', ['deviceId', 'userId']) // Mobile device lookup
@Index('idx_refresh_token_platform', ['platform', 'userId']) // Platform-based queries
export class RefreshTokenEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 500 })
  @Exclude()
  token: string;

  @Column({ type: 'bigint' })
  userId: string;

  @Column({ name: 'expiresAt', type: 'timestamp' })
  expiresAt: Date;

  @Column({ name: 'isRevoked', type: 'boolean', default: false })
  isRevoked: boolean;

  @Column({ type: 'varchar', length: 100, nullable: true })
  ipAddress: string;

  @Column({ type: 'text', nullable: true })
  userAgent: string;

  /**
   * 📱 Platform type for token differentiation
   * - 'web': Browser-based authentication (uses httpOnly cookies)
   * - 'android': Android app (refresh token in response body)
   * - 'ios': iOS app (refresh token in response body)
   */
  @Column({ 
    type: 'enum', 
    enum: ['web', 'android', 'ios'],
    default: 'web'
  })
  platform: 'web' | 'android' | 'ios';

  /**
   * 📱 Device ID for mobile session management
   * NULL for web platform, required for mobile platforms
   * Format: platform_timestamp_uuid (e.g., android_1706438400000_abc123xyz)
   */
  @Column({ type: 'varchar', length: 255, nullable: true })
  deviceId: string | null;

  /**
   * 📱 Device name for user-friendly session display
   * e.g., "Samsung Galaxy S21", "iPhone 15 Pro"
   */
  @Column({ type: 'varchar', length: 100, nullable: true })
  deviceName: string | null;

  @Column({ name: 'createdAt', type: 'datetime' })
  createdAt: Date;

  @Column({ name: 'updatedAt', type: 'datetime' })
  updatedAt: Date;
}
