import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';
import { ImageVerificationStatus } from '../../institute_mudules/institue_user/enums/image-verification-status.enum';

export enum ImageScope {
  GLOBAL = 'GLOBAL',
  INSTITUTE = 'INSTITUTE',
}

/**
 * Tracks every profile image submission made by a user.
 *
 * upload  → row inserted (status = PENDING), user.imageUrl unchanged
 * approve → row updated to VERIFIED, user.imageUrl set to this imageUrl
 * reject  → row updated to REJECTED, cloud file deleted, user.imageUrl unchanged
 */
@Entity('user_images')
@Index('idx_user_images_user_id', ['userId'])
@Index('idx_user_images_user_status', ['userId', 'status'])
export class UserImageEntity {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string;

  @Column({ name: 'user_id', type: 'bigint' })
  userId: string;

  /** Relative storage path (same format as user.imageUrl) */
  @Column({ name: 'image_url', type: 'varchar', length: 500 })
  imageUrl: string;

  @Column({ name: 'scope', type: 'enum', enum: ImageScope, default: ImageScope.GLOBAL })
  scope: ImageScope;

  /** Only set when scope = INSTITUTE */
  @Column({ name: 'institute_id', type: 'bigint', nullable: true })
  instituteId?: string;

  @Column({
    name: 'status',
    type: 'enum',
    enum: ImageVerificationStatus,
    default: ImageVerificationStatus.PENDING,
  })
  status: ImageVerificationStatus;

  @Column({ name: 'rejection_reason', type: 'text', nullable: true })
  rejectionReason?: string;

  /** Admin user ID who approved/rejected */
  @Column({ name: 'verified_by', type: 'bigint', nullable: true })
  verifiedBy?: string;

  @Column({ name: 'verified_at', type: 'timestamp', nullable: true })
  verifiedAt?: Date;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp' })
  updatedAt: Date;
}
