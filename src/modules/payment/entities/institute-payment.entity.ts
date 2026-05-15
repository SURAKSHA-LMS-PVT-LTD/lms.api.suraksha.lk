import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  OneToMany,
  Index,
} from 'typeorm';
import { UserEntity } from '../../user/entities/user.entity';
import { InstitutePaymentSubmission } from './institute-payment-submission.entity';

export enum PaymentTargetType {
  STUDENTS = 'STUDENTS',
  PARENTS = 'PARENTS',
  BOTH = 'BOTH',
}

export enum PaymentPriority {
  MANDATORY = 'MANDATORY',
  OPTIONAL = 'OPTIONAL',
  DONATION = 'DONATION',
}

export enum PaymentRequestStatus {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
  COMPLETED = 'COMPLETED',
  EXPIRED = 'EXPIRED',
}

@Entity('institute_payments')
@Index('idx_inst_pay_institute', ['instituteId'])
@Index('idx_inst_pay_status', ['status'])
@Index('idx_inst_pay_institute_status', ['instituteId', 'status'])
@Index('idx_inst_pay_due_date', ['dueDate'])
@Index('idx_inst_pay_created_by', ['createdBy'])
export class InstitutePayment {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string;

  @Column({ name: 'institute_id', type: 'varchar', length: 36 })
  instituteId: string;

  @Column({ name: 'created_by', type: 'bigint', nullable: true })
  createdBy?: string;

  @Column({ name: 'payment_type', type: 'varchar', length: 100 })
  paymentType: string;

  @Column({ type: 'text' })
  description: string;

  @Column({ name: 'payment_amount', type: 'decimal', precision: 10, scale: 2 })
  amount: number;

  @Column({ name: 'due_date', type: 'timestamp' })
  dueDate: Date;

  @Column({
    name: 'target_type',
    type: 'enum',
    enum: PaymentTargetType,
    default: PaymentTargetType.BOTH,
  })
  targetType: PaymentTargetType;

  @Column({
    type: 'enum',
    enum: PaymentPriority,
    default: PaymentPriority.MANDATORY,
  })
  priority: PaymentPriority;

  @Column({
    type: 'enum',
    enum: PaymentRequestStatus,
    default: PaymentRequestStatus.ACTIVE,
  })
  status: PaymentRequestStatus;

  @Column({ name: 'payment_instructions', type: 'text', nullable: true })
  paymentInstructions?: string;

  @Column({ name: 'bank_details', type: 'json', nullable: true })
  bankDetails?: {
    bankName?: string;
    accountNumber?: string;
    ifscCode?: string;
    accountHolderName?: string;
    upiId?: string;
  };

  @Column({ name: 'late_fee_amount', type: 'decimal', precision: 10, scale: 2, nullable: true })
  lateFeeAmount?: number;

  @Column({ name: 'late_fee_after_days', type: 'int', nullable: true })
  lateFeeAfterDays?: number;

  @Column({ name: 'auto_reminder_enabled', type: 'boolean', default: true })
  autoReminderEnabled: boolean;

  @Column({ name: 'reminder_days_before', type: 'int', default: 3 })
  reminderDaysBefore: number;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @Column({ type: 'text', nullable: true })
  notes?: string;

  @Column({ name: 'created_at', type: 'timestamp' })
  createdAt: Date;

  @Column({ name: 'updated_at', type: 'timestamp' })
  updatedAt: Date;

  // Relationships
  @ManyToOne(() => UserEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'created_by' })
  creator?: UserEntity;

  @OneToMany(() => InstitutePaymentSubmission, (submission) => submission.payment, {
    cascade: true,
  })
  submissions: InstitutePaymentSubmission[];

  // Computed fields
  get totalSubmissions(): number {
    return this.submissions?.length || 0;
  }

  get verifiedSubmissions(): number {
    return this.submissions?.filter((s) => s.status === 'VERIFIED').length || 0;
  }

  get pendingSubmissions(): number {
    return this.submissions?.filter((s) => s.status === 'PENDING').length || 0;
  }

  get rejectedSubmissions(): number {
    return this.submissions?.filter((s) => s.status === 'REJECTED').length || 0;
  }
}
