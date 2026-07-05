import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, Index } from 'typeorm';
import { UserEntity } from '../../user/entities/user.entity';
import { ClassPayment } from './class-payment.entity';
import { UserType } from '../../user/enums/user-type.enum';

const dateTransformer = {
  to: (value: Date | string | undefined) => value instanceof Date ? value : value ? new Date(value) : null,
  from: (value: Date | string | undefined) => value instanceof Date ? value : value ? new Date(value) : null,
};

export enum SubmissionStatus {
  PENDING = 'PENDING',
  VERIFIED = 'VERIFIED',
  HALF_VERIFIED = 'HALF_VERIFIED',
  QUARTER_VERIFIED = 'QUARTER_VERIFIED',
  REJECTED = 'REJECTED',
}

/**
 * Unified submission record for a ClassPayment (class-wide or class+subject scoped).
 * Replaces the previously separate InstituteClassPaymentSubmission and
 * InstituteClassSubjectPaymentSubmission entities, which were identical in every
 * field (the latter already re-used this same SubmissionStatus enum).
 */
@Entity('class_payment_submissions')
@Index(['receiptUrl'])
@Index('idx_cps_payment', ['paymentId'])
@Index('idx_cps_user', ['userId'])
@Index('idx_cps_status', ['status'])
@Index('idx_cps_payment_status', ['paymentId', 'status'])
export class ClassPaymentSubmission {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string;

  @Column({ name: 'payment_id', type: 'bigint' })
  paymentId: string;

  @Column({ name: 'user_id', type: 'bigint' })
  userId: string;

  @Column({ name: 'user_type', type: 'enum', enum: UserType })
  userType: UserType;

  @Column({ type: 'varchar', length: 100 })
  username: string;

  @Column({ name: 'payment_date', type: 'timestamp', transformer: dateTransformer })
  paymentDate: Date;

  @Column({ name: 'receipt_url', type: 'varchar', length: 255 })
  receiptUrl: string;

  @Column({ name: 'receipt_filename', type: 'varchar', length: 255 })
  receiptFilename: string;

  @Column({ name: 'transaction_id', type: 'varchar', length: 100, nullable: true })
  transactionId?: string;

  @Column({ name: 'submitted_amount', type: 'decimal', precision: 10, scale: 2 })
  submittedAmount: number;

  @Column({ type: 'enum', enum: SubmissionStatus, default: SubmissionStatus.PENDING })
  status: SubmissionStatus;

  @Column({ name: 'verified_by', type: 'bigint', nullable: true })
  verifiedBy?: string;

  @Column({ name: 'verified_at', type: 'timestamp', nullable: true })
  verifiedAt?: Date;

  @Column({ name: 'rejection_reason', type: 'text', nullable: true })
  rejectionReason?: string;

  @Column({ type: 'text', nullable: true })
  notes?: string;

  @Column({ name: 'uploaded_at', type: 'timestamp' })
  uploadedAt: Date;

  @Column({ name: 'updated_at', type: 'timestamp' })
  updatedAt: Date;

  toJSON() {
    return {
      ...this,
      paymentDate: this.paymentDate ? this.paymentDate.toISOString() : null,
      uploadedAt: this.uploadedAt ? this.uploadedAt.toISOString() : null,
      updatedAt: this.updatedAt ? this.updatedAt.toISOString() : null,
    };
  }

  @ManyToOne(() => ClassPayment, payment => payment.submissions, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'payment_id' })
  payment: ClassPayment;

  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: UserEntity;

  @ManyToOne(() => UserEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'verified_by' })
  verifier?: UserEntity;
}
