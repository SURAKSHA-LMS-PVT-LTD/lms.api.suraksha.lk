import { Entity, PrimaryGeneratedColumn, Column, Index, ManyToOne, JoinColumn, ValueTransformer } from 'typeorm';
import { UserEntity } from '../../user/entities/user.entity';

const dateTransformer: ValueTransformer = {
  to: (value: Date | string | null) => value,
  from: (value: Date | string | null) => value instanceof Date ? value : value ? new Date(value) : null,
};

/**
 * Stores Google OAuth2 tokens securely in the database.
 * 
 * SECURITY DESIGN:
 * - Refresh tokens are AES-256-GCM encrypted at rest
 * - Access tokens are NEVER stored — only refresh tokens persist
 * - Tokens are scoped per-user (one active connection per user)
 * - Refresh tokens are NEVER sent to frontend
 * - Backend proxies all Drive operations on behalf of the user
 * - Token revocation cascade: revoking here also revokes at Google
 */
@Entity('user_drive_tokens')
@Index('idx_drive_token_user', ['userId'], { unique: true }) // One connection per user
@Index('idx_drive_token_active', ['isActive', 'userId'])
@Index('idx_drive_token_expires', ['accessTokenExpiresAt'])
@Index('idx_drive_token_google_email', ['googleEmail'])
export class UserDriveTokenEntity {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string;

  /**
   * The LMS user who authorized Google Drive access.
   * One-to-one: each user has at most one active Drive connection.
   */
  @Column({ name: 'user_id', type: 'bigint', unique: true })
  userId: string;

  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: UserEntity;

  /**
   * Google account email that was authorized.
   * Stored for display purposes ("Connected as john@gmail.com").
   */
  @Column({ name: 'google_email', type: 'varchar', length: 255, nullable: true })
  googleEmail: string;

  /**
   * Google account display name.
   */
  @Column({ name: 'google_display_name', type: 'varchar', length: 255, nullable: true })
  googleDisplayName: string;

  /**
   * Google account profile picture URL.
   */
  @Column({ name: 'google_profile_picture', type: 'varchar', length: 500, nullable: true })
  googleProfilePicture: string;

  /**
   * AES-256-GCM encrypted refresh token.
   * Format: iv:authTag:ciphertext (all base64)
   * 
   * NEVER exposed via any API response.
   * NEVER sent to frontend.
   * Used only by backend to obtain fresh access tokens.
   */
  @Column({ name: 'encrypted_refresh_token', type: 'text' })
  encryptedRefreshToken: string;

  /**
   * Scopes granted by the user during OAuth consent.
   * Stored as comma-separated string.
   * e.g., "drive.file,openid,email,profile"
   */
  @Column({ name: 'granted_scopes', type: 'varchar', length: 500, nullable: true })
  grantedScopes: string;

  /**
   * Timestamp when the current access token expires.
   * Used to determine if we need to refresh before making API calls.
   * We store this to avoid unnecessary refresh calls.
   */
  @Column({ name: 'access_token_expires_at', type: 'datetime', nullable: true, transformer: dateTransformer })
  accessTokenExpiresAt: Date;

  /**
   * Whether this Drive connection is currently active.
   * Set to false when user disconnects or token is revoked.
   */
  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  /**
   * Last time a Drive API call was successfully made with this token.
   */
  @Column({ name: 'last_used_at', type: 'datetime', nullable: true, transformer: dateTransformer })
  lastUsedAt: Date;

  /**
   * Number of times the token has been refreshed.
   * For monitoring and anomaly detection.
   */
  @Column({ name: 'refresh_count', type: 'int', default: 0 })
  refreshCount: number;

  /**
   * Number of consecutive refresh failures.
   * After 5 failures, the connection is automatically deactivated.
   */
  @Column({ name: 'consecutive_failures', type: 'int', default: 0 })
  consecutiveFailures: number;

  /**
   * Reason for last failure (if any).
   */
  @Column({ name: 'last_failure_reason', type: 'varchar', length: 500, nullable: true })
  lastFailureReason: string;

  /**
   * IP address from which OAuth was authorized.
   */
  @Column({ name: 'authorized_ip', type: 'varchar', length: 45, nullable: true })
  authorizedIp: string;

  /**
   * User agent from which OAuth was authorized.
   */
  @Column({ name: 'authorized_user_agent', type: 'text', nullable: true })
  authorizedUserAgent: string;

  @Column({ name: 'created_at', type: 'datetime', transformer: dateTransformer })
  createdAt: Date;

  @Column({ name: 'updated_at', type: 'datetime', transformer: dateTransformer })
  updatedAt: Date;

  /**
   * Check if access token needs refresh (expired or about to expire in 5 min).
   */
  needsRefresh(): boolean {
    if (!this.accessTokenExpiresAt) return true;
    const fiveMinutesFromNow = new Date(Date.now() + 5 * 60 * 1000);
    return this.accessTokenExpiresAt <= fiveMinutesFromNow;
  }

  /**
   * Check if too many consecutive failures (auto-disconnect threshold).
   */
  shouldAutoDisconnect(): boolean {
    return this.consecutiveFailures >= 5;
  }
}
