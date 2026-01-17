const dateTransformer = {
  to: (value: Date | string | undefined) => value instanceof Date ? value : value ? new Date(value) : null,
  from: (value: Date | string | undefined) => value instanceof Date ? value : value ? new Date(value) : null,
};
import { Entity, PrimaryGeneratedColumn, Column,  ManyToOne, JoinColumn, Index, AfterLoad } from 'typeorm';
import { InstituteEntity } from '../../institute/entities/institute.entity';
import { UserEntity } from '../../user/entities/user.entity';

export enum PaymentSubmissionStatus {
  PENDING = 'PENDING',
  VERIFIED = 'VERIFIED',
  REJECTED = 'REJECTED'
}

@Entity('institute_sms_payment_submissions')
@Index(['instituteId'])
@Index(['status'])
@Index(['submittedAt'])
export class InstituteSmsPaymentSubmissionEntity {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string;

  @Column({ name: 'institute_id', type: 'bigint' })
  instituteId: string;

  @Column({ name: 'submitted_by', type: 'bigint' })
  submittedBy: string;

  @Column({ name: 'requested_credits', type: 'int' })
  requestedCredits: number;

  @Column({ name: 'payment_amount', type: 'decimal', precision: 10, scale: 2 })
  paymentAmount: number;

  @Column({ name: 'payment_method', type: 'varchar', length: 100 })
  paymentMethod: string;

  @Column({ name: 'payment_reference', type: 'varchar', length: 200, nullable: true })
  paymentReference?: string;

  @Column({ name: 'payment_slip_url', type: 'varchar', length: 500, nullable: true })
  paymentSlipUrl?: string;

  @Column({ name: 'payment_slip_filename', type: 'varchar', length: 255, nullable: true })
  paymentSlipFilename?: string;

  @Column({ type: 'enum', enum: PaymentSubmissionStatus, default: PaymentSubmissionStatus.PENDING })
  status: PaymentSubmissionStatus;

  @Column({ name: 'credits_granted', type: 'int', nullable: true })
  creditsGranted?: number;

  @Column({ name: 'cost_per_credit', type: 'decimal', precision: 10, scale: 4, nullable: true })
  costPerCredit?: number;

  @Column({ name: 'verified_by', type: 'bigint', nullable: true })
  verifiedBy?: string;

  @Column({ name: 'verified_at', type: 'timestamp', nullable: true, transformer: dateTransformer })
  verifiedAt?: Date;

  @Column({ name: 'rejection_reason', type: 'text', nullable: true })
  rejectionReason?: string;

  @Column({ name: 'admin_notes', type: 'text', nullable: true })
  adminNotes?: string;

  @Column({ name: 'submission_notes', type: 'text', nullable: true })
  submissionNotes?: string;

  @Column({ name: 'submitted_at', type: 'timestamp', transformer: dateTransformer })
  submittedAt: Date;

   @Column({ name: 'created_at', type: 'timestamp' })
  createdAt: Date;

  @Column({ name: 'updated_at', type: 'timestamp' })
  updatedAt: Date;
  toJSON() {
    return {
      ...this,
      submittedAt: this.submittedAt ? this.submittedAt.toISOString() : null,
      createdAt: this.createdAt ? this.createdAt.toISOString() : null,
      updatedAt: this.updatedAt ? this.updatedAt.toISOString() : null,
      verifiedAt: this.verifiedAt ? this.verifiedAt.toISOString() : null,
    };
  }

  // Relations
  @ManyToOne(() => InstituteEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'institute_id' })
  institute: InstituteEntity;

  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'submitted_by' })
  submitter: UserEntity;

  @ManyToOne(() => UserEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'verified_by' })
  verifier?: UserEntity;
}
