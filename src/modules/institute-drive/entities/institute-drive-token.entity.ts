import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  Index,
  ManyToOne,
  JoinColumn,
  ValueTransformer,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { InstituteEntity } from '../../institute/entities/institute.entity';
import { UserEntity } from '../../user/entities/user.entity';

const dateTransformer: ValueTransformer = {
  to: (v: Date | string | null) => v,
  from: (v: Date | string | null) => (v instanceof Date ? v : v ? new Date(v) : null),
};

/**
 * Stores a Google Drive connection that belongs to an **institute** (not a personal user).
 *
 * An institute admin connects their organisation's Google Drive once.
 * After that:
 * - All teachers in the institute can use this drive to upload lecture materials,
 *   homework questions, etc. without ever seeing the raw credentials.
 * - Files survive staff changes — ownership stays with the institute account.
 *
 * SECURITY MODEL (same as UserDriveTokenEntity):
 * - Refresh token is AES-256-GCM encrypted at rest.
 * - Access tokens are NEVER stored — only refresh tokens persist.
 * - One active connection per institute.
 * - Consecutive failure > 5 → auto-deactivate.
 */
@Entity('institute_drive_tokens')
@Index('idx_inst_drive_institute', ['instituteId'], { unique: true })
@Index('idx_inst_drive_active', ['isActive', 'instituteId'])
@Index('idx_inst_drive_expires', ['accessTokenExpiresAt'])
export class InstituteDriveTokenEntity {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string;

  /** The institute this Drive connection belongs to. One connection per institute. */
  @Column({ name: 'institute_id', type: 'varchar', length: 36, unique: true })
  instituteId: string;

  @ManyToOne(() => InstituteEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'institute_id' })
  institute: InstituteEntity;

  /** The admin user who performed the OAuth connection. Audit trail only. */
  @Column({ name: 'connected_by_user_id', type: 'bigint', nullable: true })
  connectedByUserId: string;

  @ManyToOne(() => UserEntity, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'connected_by_user_id' })
  connectedByUser: UserEntity;

  /** Google account email used for the institute drive (displayed to admins). */
  @Column({ name: 'google_email', type: 'varchar', length: 255, nullable: true })
  googleEmail: string;

  @Column({ name: 'google_display_name', type: 'varchar', length: 255, nullable: true })
  googleDisplayName: string;

  @Column({ name: 'google_profile_picture', type: 'varchar', length: 500, nullable: true })
  googleProfilePicture: string;

  /**
   * AES-256-GCM encrypted refresh token.
   * Format: iv:authTag:ciphertext (all base64).
   * NEVER exposed in any API response.
   */
  @Column({ name: 'encrypted_refresh_token', type: 'text' })
  encryptedRefreshToken: string;

  @Column({ name: 'granted_scopes', type: 'varchar', length: 500, nullable: true })
  grantedScopes: string;

  @Column({
    name: 'access_token_expires_at',
    type: 'datetime',
    nullable: true,
    transformer: dateTransformer,
  })
  accessTokenExpiresAt: Date;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @Column({ name: 'last_used_at', type: 'datetime', nullable: true, transformer: dateTransformer })
  lastUsedAt: Date;

  @Column({ name: 'refresh_count', type: 'int', default: 0 })
  refreshCount: number;

  @Column({ name: 'consecutive_failures', type: 'int', default: 0 })
  consecutiveFailures: number;

  @Column({ name: 'last_failure_reason', type: 'varchar', length: 500, nullable: true })
  lastFailureReason: string;

  @Column({ name: 'authorized_ip', type: 'varchar', length: 100, nullable: true })
  authorizedIp: string;

  @Column({ name: 'authorized_user_agent', type: 'varchar', length: 500, nullable: true })
  authorizedUserAgent: string;

  @CreateDateColumn({ name: 'created_at', type: 'datetime', transformer: dateTransformer })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'datetime', transformer: dateTransformer })
  updatedAt: Date;
}
