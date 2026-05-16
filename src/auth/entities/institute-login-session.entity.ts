import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index,
} from 'typeorm';

export enum InstituteSessionLoginMethod {
  SUBDOMAIN    = 'SUBDOMAIN',
  CUSTOM_DOMAIN = 'CUSTOM_DOMAIN',
  MAIN         = 'MAIN',
}

@Entity('institute_login_sessions')
@Index('idx_institute_user',   ['instituteId', 'userId'])
@Index('idx_institute_active', ['instituteId', 'isActive'])
@Index('idx_scope_host',       ['scopeHost'])
export class InstituteLoginSessionEntity {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
  id: string;

  @Column({ name: 'institute_id', type: 'varchar', length: 36 })
  instituteId: string;

  @Column({ name: 'user_id', type: 'bigint', unsigned: true })
  userId: string;

  @Column({ name: 'user_id_by_institute', length: 100 })
  userIdByInstitute: string;

  /** SHA-256 hex of the issued refresh_token — used for revocation lookups. */
  @Column({ name: 'token_hash', length: 64, unique: true })
  tokenHash: string;

  /** Human-readable device label derived from User-Agent header. */
  @Column({ name: 'device_label', length: 255, nullable: true })
  deviceLabel: string | null;

  @Column({ name: 'ip_address', length: 45, nullable: true })
  ipAddress: string | null;

  @Column({
    name: 'login_method',
    type: 'enum',
    enum: InstituteSessionLoginMethod,
    default: InstituteSessionLoginMethod.MAIN,
  })
  loginMethod: InstituteSessionLoginMethod;

  /** Subdomain or custom domain this token is scoped to. Null for MAIN logins. */
  @Column({ name: 'scope_host', length: 255, nullable: true })
  scopeHost: string | null;

  @Column({ name: 'is_active', type: 'tinyint', width: 1, default: 1 })
  isActive: boolean;

  @Column({ name: 'deactivated_reason', length: 100, nullable: true })
  deactivatedReason: string | null;

  @Column({ name: 'last_active_at', type: 'datetime', default: () => 'CURRENT_TIMESTAMP' })
  lastActiveAt: Date;

  @Column({ name: 'expires_at', type: 'datetime' })
  expiresAt: Date;

  @CreateDateColumn({ name: 'created_at', type: 'datetime' })
  createdAt: Date;
}
