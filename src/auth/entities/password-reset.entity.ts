import { Entity, PrimaryGeneratedColumn, Column, Index } from 'typeorm';

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
  otp: string;

  @Column({ type: 'varchar', length: 500, nullable: true, name: 'verificationToken' })
  verificationToken?: string;

  @Column({ type: 'varchar', length: 50, name: 'tokenType' })
  tokenType: 'FIRST_LOGIN' | 'PASSWORD_RESET' | 'EMAIL_VERIFICATION' | 'CHANGE_PASSWORD';

  @Column({ type: 'boolean', default: false, name: 'isUsed' })
  isUsed: boolean;

  @Column({ type: 'timestamp', nullable: true, name: 'usedAt' })
  usedAt?: Date;

  @Column({ type: 'boolean', default: false, name: 'isOtpVerified' })
  isOtpVerified: boolean;

  @Column({ type: 'timestamp', name: 'expiresAt' })
  expiresAt: Date;

  @Column({ type: 'varchar', length: 45, nullable: true, name: 'ipAddress' })
  ipAddress?: string;

  @Column({ type: 'text', nullable: true, name: 'userAgent' })
  userAgent?: string;

  @Column({ type: 'int', default: 0, name: 'attemptCount' })
  attemptCount: number;

  @Column({ name: 'createdAt', type: 'timestamp' })
  createdAt: Date;

  @Column({ name: 'updatedAt', type: 'timestamp' })
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

  @Column({ name: 'createdAt', type: 'timestamp' })
  createdAt: Date;

  @Column({ name: 'updatedAt', type: 'timestamp' })
  updatedAt: Date;
}

/**
 * 🔄 Refresh Token Entity
 * Stores refresh tokens for secure token renewal
 */
@Entity('refresh_tokens')
@Index('idx_refresh_token_user', ['userId', 'isRevoked'])
@Index('idx_refresh_token', ['token'])
@Index('idx_refresh_token_expires', ['expiresAt', 'isRevoked'])
export class RefreshTokenEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 500 })
  token: string;

  @Column({ type: 'bigint' })
  userId: string;

  @Column({ type: 'timestamp' })
  expiresAt: Date;

  @Column({ type: 'boolean', default: false })
  isRevoked: boolean;

  @Column({ type: 'varchar', length: 100, nullable: true })
  ipAddress: string;

  @Column({ type: 'text', nullable: true })
  userAgent: string;

  @Column({ type: 'timestamp' })
  createdAt: Date;

  @Column({ type: 'timestamp' })
  updatedAt: Date;
}
