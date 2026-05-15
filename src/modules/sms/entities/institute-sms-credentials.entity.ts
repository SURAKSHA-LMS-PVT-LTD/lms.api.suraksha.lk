import { Entity, PrimaryColumn, Column,  ManyToOne, JoinColumn, Index } from 'typeorm';
import { InstituteEntity } from '../../institute/entities/institute.entity';
import { UserEntity } from '../../user/entities/user.entity';

export enum SmsVerificationStage {
  VERIFICATION_REQUIRED = 'VERIFICATION_REQUIRED',
  PRE_APPROVED = 'PRE_APPROVED',
  UNLIMITED = 'UNLIMITED'
}

@Entity('institute_sms_credentials')
// 🎯 REAL QUERY-BASED INDEXES - Based on actual codebase queries (Nov 2024)
// Institute credentials lookup: sms.service.ts line 829, 1129, 1254, 1393
@Index('idx_sms_credentials_institute', ['instituteId', 'isActive'])
// Verification stage filtering
@Index('idx_sms_credentials_verification', ['verificationStage'])
export class InstituteSmsCredentialsEntity {
  @PrimaryColumn({ type: 'varchar', length: 36 })
  id: string;

  @Column({ name: 'institute_id', type: 'varchar', length: 36 })
  instituteId: string;

  // SMSlenz.lk API Credentials (encrypted)
  @Column({ name: 'sms_user_id', type: 'varchar', length: 100, nullable: true })
  smsUserId?: string;

  @Column({ name: 'sms_api_key', type: 'varchar', length: 500, nullable: true })
  smsApiKey?: string;

  @Column({ name: 'current_credits', type: 'int', default: 0 })
  currentCredits: number;

  @Column({ name: 'total_purchased', type: 'int', default: 0 })
  totalPurchased: number;

  @Column({ name: 'total_used', type: 'int', default: 0 })
  totalUsed: number;

  @Column({ name: 'verification_stage', type: 'enum', enum: SmsVerificationStage, default: SmsVerificationStage.VERIFICATION_REQUIRED })
  verificationStage: SmsVerificationStage;

  @Column({ name: 'mask_ids', type: 'json', nullable: true })
  maskIds?: string[]; // Array of mask IDs from dialog

  @Column({ name: 'sender_masks', type: 'json', nullable: true })
  senderMasks?: {
    maskId: string;
    displayName: string;
    phoneNumber: string;
    isActive: boolean;
  }[];

  @Column({ name: 'daily_limit', type: 'int', nullable: true })
  dailyLimit?: number;

  @Column({ name: 'monthly_limit', type: 'int', nullable: true })
  monthlyLimit?: number;

  @Column({ name: 'daily_used', type: 'int', default: 0 })
  dailyUsed: number;

  @Column({ name: 'monthly_used', type: 'int', default: 0 })
  monthlyUsed: number;

  @Column({ name: 'last_reset_date', type: 'date', nullable: true })
  lastResetDate?: Date;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @Column({ name: 'created_by', type: 'bigint', nullable: true })
  createdBy?: string;

  @Column({ name: 'approved_by', type: 'bigint', nullable: true })
  approvedBy?: string;

  @Column({ name: 'approved_at', type: 'timestamp', nullable: true })
  approvedAt?: Date;

  @Column({ type: 'varchar', length: 200, nullable: true })
  notes?: string;

  @Column({ name: 'created_at', type: 'timestamp' })
  createdAt: Date;

  @Column({ name: 'updated_at', type: 'timestamp' })
  updatedAt: Date;

  // Relations
  @ManyToOne(() => InstituteEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'institute_id' })
  institute: InstituteEntity;

  @ManyToOne(() => UserEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'created_by' })
  creator?: UserEntity;

  @ManyToOne(() => UserEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'approved_by' })
  approver?: UserEntity;
}
