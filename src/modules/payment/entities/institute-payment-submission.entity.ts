import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
  AfterLoad,
} from 'typeorm';
import { UserEntity } from '../../user/entities/user.entity';
import { InstitutePayment } from './institute-payment.entity';

export enum SubmissionStatus {
  PENDING = 'PENDING',
  VERIFIED = 'VERIFIED',
  HALF_VERIFIED = 'HALF_VERIFIED',
  QUARTER_VERIFIED = 'QUARTER_VERIFIED',
  REJECTED = 'REJECTED',
}

export enum PaymentMethodType {
  BANK_TRANSFER = 'BANK_TRANSFER',
  ONLINE_PAYMENT = 'ONLINE_PAYMENT',
  CASH_DEPOSIT = 'CASH_DEPOSIT',
  UPI = 'UPI',
  CHEQUE = 'CHEQUE',
}

@Entity('institute_payment_submissions')
@Index(['receiptFileUrl']) // For URL lookups
@Index('idx_sub_payment', ['paymentId'])
@Index('idx_sub_submitted_by', ['submittedBy'])
@Index('idx_sub_status', ['status'])
@Index('idx_sub_payment_status', ['paymentId', 'status'])
export class InstitutePaymentSubmission {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string;

  @Column({ name: 'payment_id', type: 'bigint' })
  paymentId: string;

  @Column({ name: 'submitted_by', type: 'bigint' })
  submittedBy: string;

  @Column({ name: 'payment_amount', type: 'decimal', precision: 10, scale: 2 })
  paymentAmount: number;

  @Column({
    name: 'payment_method',
    type: 'enum',
    enum: PaymentMethodType,
  })
  paymentMethod: PaymentMethodType;

  @Column({ name: 'transaction_reference', type: 'varchar', length: 100, nullable: true })
  transactionReference?: string;

  @Column({ name: 'payment_date', type: 'timestamp' })
  paymentDate: Date;

  // Receipt file information
  @Column({ name: 'receipt_file_url', type: 'varchar', length: 255, nullable: true })
  receiptFileUrl?: string;

  @Column({ name: 'receipt_file_name', type: 'varchar', length: 255, nullable: true })
  receiptFileName?: string;

  @Column({ name: 'receipt_file_size', type: 'bigint', nullable: true })
  receiptFileSize?: number;

  @Column({ name: 'receipt_file_type', type: 'varchar', length: 100, nullable: true })
  receiptFileType?: string;

  // Status and verification
  @Column({
    type: 'enum',
    enum: SubmissionStatus,
    default: SubmissionStatus.PENDING,
  })
  status: SubmissionStatus;

  @Column({ name: 'verified_by', type: 'bigint', nullable: true })
  verifiedBy?: string;

  @Column({ name: 'verified_at', type: 'timestamp', nullable: true })
  verifiedAt?: Date;

  @Column({ name: 'rejection_reason', type: 'text', nullable: true })
  rejectionReason?: string;

  // Additional information
  @Column({ name: 'payment_remarks', type: 'text', nullable: true })
  paymentRemarks?: string;

  @Column({ type: 'text', nullable: true })
  notes?: string;

  @Column({ name: 'late_fee_applied', type: 'decimal', precision: 10, scale: 2, default: 0 })
  lateFeeApplied: number;

  @Column({ name: 'total_amount_paid', type: 'decimal', precision: 10, scale: 2 })
  totalAmountPaid: number;

  @Column({ name: 'created_at', type: 'timestamp' })
  createdAt: Date;

  @Column({ name: 'updated_at', type: 'timestamp' })
  updatedAt: Date;

  // Relationships
  @ManyToOne(() => InstitutePayment, (payment) => payment.submissions, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'payment_id' })
  payment: InstitutePayment;

  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'submitted_by' })
  submitter: UserEntity;

  @ManyToOne(() => UserEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'verified_by' })
  verifier?: UserEntity;
}
