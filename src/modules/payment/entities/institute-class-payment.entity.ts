import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, OneToMany, ValueTransformer, Index } from 'typeorm';
import { UserEntity } from '../../user/entities/user.entity';
import { InstituteClassPaymentSubmission } from './institute-class-payment-submission.entity';
import { PaymentTargetType, PaymentPriority, PaymentStatus } from './institute-class-subject-payment.entity';

const dateTransformer: ValueTransformer = {
  to: (value: Date | string | null) => value,
  from: (value: Date | string | null) => value instanceof Date ? value : value ? new Date(value) : null,
};

export { PaymentTargetType, PaymentPriority, PaymentStatus };

@Entity('institute_class_payments')
@Index('idx_cp_institute', ['instituteId'])
@Index('idx_cp_class', ['classId'])
@Index('idx_cp_institute_class', ['instituteId', 'classId'])
@Index('idx_cp_status', ['status'])
export class InstituteClassPayment {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string;

  @Column({ name: 'institute_id', type: 'bigint' })
  instituteId: string;

  @Column({ name: 'class_id', type: 'bigint' })
  classId: string;

  @Column({ name: 'created_by', type: 'bigint', nullable: true })
  createdBy?: string;

  @Column({ type: 'varchar', length: 200 })
  title: string;

  @Column({ type: 'text' })
  description: string;

  @Column({ name: 'target_type', type: 'enum', enum: PaymentTargetType })
  targetType: PaymentTargetType;

  @Column({ type: 'enum', enum: PaymentPriority })
  priority: PaymentPriority;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  amount: number;

  @Column({ name: 'document_url', type: 'varchar', length: 255, nullable: true })
  documentUrl?: string;

  @Column({ name: 'last_date', type: 'timestamp', transformer: dateTransformer })
  lastDate: Date;

  @Column({ type: 'enum', enum: PaymentStatus, default: PaymentStatus.ACTIVE })
  status: PaymentStatus;

  @Column({ name: 'teacher_commission_pct', type: 'decimal', precision: 5, scale: 2, default: '0.00', nullable: true })
  teacherCommissionPct?: string;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @Column({ type: 'text', nullable: true })
  notes?: string;

  @Column({ name: 'bank_name', type: 'varchar', length: 100, nullable: false })
  bankName: string;

  @Column({ name: 'account_holder_name', type: 'varchar', length: 150, nullable: false })
  accountHolderName: string;

  @Column({ name: 'account_holder_number', type: 'varchar', length: 50, nullable: false })
  accountHolderNumber: string;

  @Column({ name: 'created_at', type: 'timestamp', transformer: dateTransformer })
  createdAt: Date;

  @Column({ name: 'updated_at', type: 'timestamp', transformer: dateTransformer })
  updatedAt: Date;

  @ManyToOne(() => UserEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'created_by' })
  creator?: UserEntity;

  @OneToMany(() => InstituteClassPaymentSubmission, submission => submission.payment)
  submissions: InstituteClassPaymentSubmission[];

  toJSON() {
    return {
      ...this,
      lastDate: this.lastDate instanceof Date ? this.lastDate.toISOString() : this.lastDate,
      createdAt: this.createdAt instanceof Date ? this.createdAt.toISOString() : this.createdAt,
      updatedAt: this.updatedAt instanceof Date ? this.updatedAt.toISOString() : this.updatedAt,
    };
  }
}
