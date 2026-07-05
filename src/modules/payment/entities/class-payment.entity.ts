import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, OneToMany, ValueTransformer, Index } from 'typeorm';
import { UserEntity } from '../../user/entities/user.entity';
import { ClassPaymentSubmission } from './class-payment-submission.entity';

const dateTransformer: ValueTransformer = {
  to: (value: Date | string | null) => value,
  from: (value: Date | string | null) => value instanceof Date ? value : value ? new Date(value) : null,
};

export enum PaymentTargetType {
  PARENTS = 'PARENTS',
  STUDENTS = 'STUDENTS',
  BOTH = 'BOTH',
}

export enum PaymentPriority {
  MANDATORY = 'MANDATORY',
  OPTIONAL = 'OPTIONAL',
  DONATION = 'DONATION',
}

export enum PaymentStatus {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
  EXPIRED = 'EXPIRED',
}

/** Distinguishes a class-wide fee from one scoped to a single subject within the class. */
export enum PaymentScope {
  CLASS = 'CLASS',
  CLASS_SUBJECT = 'CLASS_SUBJECT',
}

/**
 * Unified class-level payment/fee record. Replaces the previously separate
 * InstituteClassPayment (institute_class_payments) and InstituteClassSubjectPayment
 * (institute_class_subject_payments) entities, which were near-duplicate copies of
 * the same shape — differing only by `subjectId` (subject-scoped) and
 * `teacherCommissionPct` (class-scoped). `scope` + nullable `subjectId` now cover
 * both cases in one table (see migration 1849000000000-MergeClassPaymentEntities.ts).
 */
@Entity('class_payments')
@Index('idx_cp_institute', ['instituteId'])
@Index('idx_cp_class', ['classId'])
@Index('idx_cp_subject', ['subjectId'])
@Index('idx_cp_institute_class', ['instituteId', 'classId'])
@Index('idx_cp_institute_class_subject', ['instituteId', 'classId', 'subjectId'])
@Index('idx_cp_status', ['status'])
@Index('idx_cp_scope', ['scope'])
export class ClassPayment {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string;

  @Column({ type: 'enum', enum: PaymentScope })
  scope: PaymentScope;

  @Column({ name: 'institute_id', type: 'varchar', length: 36 })
  instituteId: string;

  @Column({ name: 'class_id', type: 'varchar', length: 36 })
  classId: string;

  /** Set only when scope = CLASS_SUBJECT. */
  @Column({ name: 'subject_id', type: 'varchar', length: 36, nullable: true })
  subjectId?: string | null;

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

  /** Only meaningful for scope = CLASS (teacher commission on class-wide fees). */
  @Column({ name: 'teacher_commission_pct', type: 'decimal', precision: 5, scale: 2, default: '0.00', nullable: true })
  teacherCommissionPct?: string;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @Column({ type: 'text', nullable: true })
  notes?: string;

  @Column({ name: 'bank_name', type: 'varchar', length: 100, nullable: true, default: null })
  bankName?: string | null;

  @Column({ name: 'account_holder_name', type: 'varchar', length: 150, nullable: true, default: null })
  accountHolderName?: string | null;

  @Column({ name: 'account_holder_number', type: 'varchar', length: 50, nullable: true, default: null })
  accountHolderNumber?: string | null;

  @Column({ name: 'created_at', type: 'timestamp', transformer: dateTransformer })
  createdAt: Date;

  @Column({ name: 'updated_at', type: 'timestamp', transformer: dateTransformer })
  updatedAt: Date;

  @ManyToOne(() => UserEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'created_by' })
  creator?: UserEntity;

  @OneToMany(() => ClassPaymentSubmission, submission => submission.payment)
  submissions: ClassPaymentSubmission[];

  toJSON() {
    return {
      ...this,
      lastDate: this.lastDate instanceof Date ? this.lastDate.toISOString() : this.lastDate,
      createdAt: this.createdAt instanceof Date ? this.createdAt.toISOString() : this.createdAt,
      updatedAt: this.updatedAt instanceof Date ? this.updatedAt.toISOString() : this.updatedAt,
    };
  }
}
