import {
  Entity, PrimaryGeneratedColumn, Column,
  ManyToOne, JoinColumn, Index, CreateDateColumn, UpdateDateColumn,
} from 'typeorm';
import { InstituteEntity } from '../../institute/entities/institute.entity';

export enum ApiKeyScope {
  ATTENDANCE_MARK = 'ATTENDANCE_MARK',
}

@Entity('institute_api_keys')
@Index(['instituteId', 'isActive'])
@Index(['keyHash'], { unique: true })
export class InstituteApiKeyEntity {
  @PrimaryGeneratedColumn('increment', { type: 'bigint', unsigned: true })
  id: string;

  @Column({ name: 'institute_id', type: 'varchar', length: 36 })
  instituteId: string;

  @ManyToOne(() => InstituteEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'institute_id' })
  institute: InstituteEntity;

  @Column({ name: 'name', type: 'varchar', length: 100 })
  name: string;

  /** SHA-256 hash of the raw key — never store the raw key */
  @Column({ name: 'key_hash', type: 'varchar', length: 64 })
  keyHash: string;

  /** First 8 chars of raw key for display/identification (e.g. "sk_abc123..") */
  @Column({ name: 'key_prefix', type: 'varchar', length: 12 })
  keyPrefix: string;

  @Column({
    name: 'scopes',
    type: 'json',
    default: () => "'[]'",
  })
  scopes: ApiKeyScope[];

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @Column({ name: 'created_by', type: 'bigint', unsigned: true, nullable: true })
  createdBy?: string;

  @Column({ name: 'last_used_at', type: 'timestamp', nullable: true })
  lastUsedAt?: Date;

  @Column({ name: 'expires_at', type: 'timestamp', nullable: true })
  expiresAt?: Date;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
