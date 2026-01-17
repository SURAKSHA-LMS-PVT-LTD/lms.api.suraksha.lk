import { Entity, PrimaryGeneratedColumn, Column,  Index, ManyToOne, JoinColumn } from 'typeorm';
import { UserEntity } from '../../user/entities/user.entity';

export enum SenderMaskStatus {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  SUSPENDED = 'SUSPENDED',
}

/**
 * Sender Mask Entity
 * 
 * Each institute can have approved sender masks for SMS
 * Users can ONLY send SMS from their institute's approved masks
 */
@Entity('sms_sender_masks')
@Index('idx_sender_masks_institute', ['instituteId'])
@Index('idx_sender_masks_status', ['status'])
export class SmsSenderMaskEntity {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string;

  @Column({ name: 'institute_id', type: 'bigint' })
  @Index('idx_institute_id')
  instituteId: string;

  @Column({ name: 'mask_id', type: 'varchar', length: 20, unique: true })
  maskId: string; // e.g., "SchoolXYZ", "ABCInstitute"

  @Column({ name: 'display_name', type: 'varchar', length: 100 })
  displayName: string; // Human-readable name

  @Column({ name: 'status', type: 'enum', enum: SenderMaskStatus, default: SenderMaskStatus.PENDING })
  status: SenderMaskStatus;

  @Column({ name: 'phone_number', type: 'varchar', length: 15, nullable: true })
  phoneNumber: string; // Optional: Contact number for this mask

  @Column({ name: 'is_default', type: 'boolean', default: false })
  isDefault: boolean; // Default mask for this institute

  @Column({ name: 'approved_at', type: 'timestamp', nullable: true })
  approvedAt: Date;

  @Column({ name: 'approved_by', type: 'bigint', nullable: true })
  approvedBy: string; // Admin user ID who approved

  @ManyToOne(() => UserEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'approved_by' })
  approver?: UserEntity;

  @Column({ name: 'rejection_reason', type: 'text', nullable: true })
  rejectionReason: string;

  @Column({ name: 'created_at', type: 'timestamp' })
  createdAt: Date;

  @Column({ name: 'updated_at', type: 'timestamp' })
  updatedAt: Date;
}
