import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, OneToMany, ValueTransformer, AfterLoad, Index } from 'typeorm';

// Date transformer for ISO serialization
const dateTransformer: ValueTransformer = {
  to: (value: Date | string | null) => value,
  from: (value: Date | string | null) => value instanceof Date ? value : value ? new Date(value) : null,
};
import { UserEntity } from '../../user/entities/user.entity';
import { InstituteClassSubjectPaymentSubmission } from './institute-class-subject-payment-submission.entity';

export enum PaymentTargetType {
  PARENTS = 'PARENTS',
  STUDENTS = 'STUDENTS',
  BOTH = 'BOTH'
}

export enum PaymentPriority {
  MANDATORY = 'MANDATORY',
  OPTIONAL = 'OPTIONAL',
  DONATION = 'DONATION'
}

export enum PaymentStatus {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
  EXPIRED = 'EXPIRED'
}

@Entity('institute_class_subject_payments')
@Index('idx_csp_institute', ['instituteId'])
@Index('idx_csp_class', ['classId'])
@Index('idx_csp_subject', ['subjectId'])
@Index('idx_csp_institute_class_subject', ['instituteId', 'classId', 'subjectId'])
@Index('idx_csp_status', ['status'])
export class InstituteClassSubjectPayment {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string;

  @Column({ name: 'institute_id', type: 'bigint' })
  instituteId: string;

  @Column({ name: 'class_id', type: 'bigint' })
  classId: string;

  @Column({ name: 'subject_id', type: 'bigint' })
  subjectId: string;

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

  // Relations
  @ManyToOne(() => UserEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'created_by' })
  creator?: UserEntity;

  @OneToMany(() => InstituteClassSubjectPaymentSubmission, submission => submission.payment)
  submissions: InstituteClassSubjectPaymentSubmission[];
  toJSON() {
    return {
      ...this,
      lastDate: this.lastDate instanceof Date ? this.lastDate.toISOString() : this.lastDate,
      createdAt: this.createdAt instanceof Date ? this.createdAt.toISOString() : this.createdAt,
      updatedAt: this.updatedAt instanceof Date ? this.updatedAt.toISOString() : this.updatedAt,
    };
  }
}
