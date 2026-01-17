import { Entity, PrimaryGeneratedColumn, Column,  Index, ManyToOne, JoinColumn } from 'typeorm';
import { UserEntity } from '../../user/entities/user.entity';

export enum SenderMaskStatus {
  PENDING = 'PENDING',           // Waiting for provider approval
  ACTIVE = 'ACTIVE',             // Approved and active
  SUSPENDED = 'SUSPENDED',       // Temporarily disabled
  REJECTED = 'REJECTED',         // Rejected by provider
}

/**
 * Sender Mask Entity
 * 
 * CRITICAL SECURITY: Controls which sender IDs institutes can use
 * - Each institute must have approved masks
 * - Masks must be ACTIVE to send SMS
 * - System verifies ownership before every send
 * - Provider approval required
 */
@Entity('sender_masks')
@Index('idx_sender_masks_institute', ['instituteId'])
@Index('idx_sender_masks_status', ['status'])
@Index('idx_sender_masks_mask_id', ['maskId'], { unique: true })
export class SenderMaskEntity {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string;

  @Column({ name: 'institute_id', type: 'bigint' })
  @Index('idx_institute_id')
  instituteId: string;

  @Column({ name: 'mask_id', type: 'varchar', length: 20, unique: true })
  maskId: string; // The actual sender ID (e.g., "MySchool", "EduSMS")

  @Column({ name: 'display_name', type: 'varchar', length: 100 })
  displayName: string; // Friendly name for the mask

  @Column({ name: 'status', type: 'enum', enum: SenderMaskStatus, default: SenderMaskStatus.PENDING })
  status: SenderMaskStatus;

  @Column({ name: 'is_default', type: 'boolean', default: false })
  isDefault: boolean; // Default mask for this institute

  @Column({ name: 'provider_name', type: 'varchar', length: 50, default: 'SMSlenz' })
  providerName: string;

  @Column({ name: 'provider_approval_id', type: 'varchar', length: 100, nullable: true })
  providerApprovalId: string; // Provider's approval reference

  @Column({ name: 'approved_by', type: 'bigint', nullable: true })
  approvedBy: string; // Admin user ID who approved

  @ManyToOne(() => UserEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'approved_by' })
  approver?: UserEntity;

  @Column({ name: 'approved_at', type: 'timestamp', nullable: true })
  approvedAt: Date;

  @Column({ name: 'rejection_reason', type: 'text', nullable: true })
  rejectionReason: string;

  @Column({ name: 'notes', type: 'text', nullable: true })
  notes: string;

  @Column({ name: 'created_at', type: 'timestamp' })
  createdAt: Date;

  @Column({ name: 'updated_at', type: 'timestamp' })
  updatedAt: Date;
}
