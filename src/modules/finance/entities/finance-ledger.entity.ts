import {
  Entity, PrimaryGeneratedColumn, Column, Index, CreateDateColumn, ManyToOne, JoinColumn,
} from 'typeorm';
import { FinanceCategoryEntity } from './finance-category.entity';
import { FinanceAccountEntity } from './finance-account.entity';

export enum LedgerEntryType {
  CREDIT = 'CREDIT',
  DEBIT  = 'DEBIT',
}

export enum LedgerTxSource {
  PAYMENT_APPROVAL   = 'PAYMENT_APPROVAL',
  PHYSICAL_COLLECT   = 'PHYSICAL_COLLECT',
  FUND_TRANSFER      = 'FUND_TRANSFER',
  TEACHER_PAYOUT     = 'TEACHER_PAYOUT',
  TEACHER_DEDUCTION  = 'TEACHER_DEDUCTION',
  TEACHER_ADVANCE    = 'TEACHER_ADVANCE',
  TEACHER_TOPUP      = 'TEACHER_TOPUP',
  MANUAL             = 'MANUAL',
}

@Entity('finance_ledger')
@Index('idx_fl_institute_date', ['instituteId', 'createdAt'])
@Index('idx_fl_collector', ['createdByUserId', 'instituteId'])
@Index('idx_fl_teacher', ['teacherId', 'instituteId'])
@Index('idx_fl_account', ['toAccountId'])
export class FinanceLedgerEntity {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string;

  @Column({ name: 'institute_id', type: 'varchar', length: 36 })
  instituteId: string;

  @Column({ type: 'decimal', precision: 14, scale: 2 })
  amount: string;

  @Column({ type: 'enum', enum: LedgerEntryType })
  type: LedgerEntryType;

  @Column({ name: 'tx_source', type: 'enum', enum: LedgerTxSource, default: LedgerTxSource.MANUAL })
  txSource: LedgerTxSource;

  // ── Account movement ─────────────────────────────────────────────
  @Column({ name: 'from_account_id', type: 'bigint', nullable: true })
  fromAccountId?: string;

  @ManyToOne(() => FinanceAccountEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'from_account_id' })
  fromAccount?: FinanceAccountEntity;

  @Column({ name: 'to_account_id', type: 'bigint', nullable: true })
  toAccountId?: string;

  @ManyToOne(() => FinanceAccountEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'to_account_id' })
  toAccount?: FinanceAccountEntity;

  // ── Category ─────────────────────────────────────────────────────
  @Column({ name: 'category_id', type: 'bigint', nullable: true })
  categoryId?: string;

  @ManyToOne(() => FinanceCategoryEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'category_id' })
  category?: FinanceCategoryEntity;

  // ── Teacher wallet split ─────────────────────────────────────────
  @Column({ name: 'teacher_id', type: 'bigint', nullable: true })
  teacherId?: string;

  /** Teacher's cut from this transaction */
  @Column({ name: 'teacher_amount', type: 'decimal', precision: 14, scale: 2, nullable: true })
  teacherAmount?: string;

  /** Institute commission from this transaction */
  @Column({ name: 'institute_amount', type: 'decimal', precision: 14, scale: 2, nullable: true })
  instituteAmount?: string;

  /** Commission percentage applied (snapshot at time of transaction) */
  @Column({ name: 'commission_pct', type: 'decimal', precision: 5, scale: 2, nullable: true })
  commissionPct?: string;

  // ── Reference ────────────────────────────────────────────────────
  /** Payment submission ID, payout ID, or manual reference */
  @Column({ name: 'reference_id', type: 'varchar', length: 100, nullable: true })
  referenceId?: string;

  @Column({ name: 'student_id', type: 'bigint', nullable: true })
  studentId?: string;

  @Column({ name: 'student_name', type: 'varchar', length: 200, nullable: true })
  studentName?: string;

  @Column({ type: 'varchar', length: 300, nullable: true })
  description?: string;

  @Column({ name: 'admin_note', type: 'text', nullable: true })
  adminNote?: string;

  // ── Audit trail ──────────────────────────────────────────────────
  /** The user who physically collected/approved the money */
  @Column({ name: 'created_by_user_id', type: 'bigint' })
  createdByUserId: string;

  @Column({ name: 'created_by_name', type: 'varchar', length: 200, nullable: true })
  createdByName?: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
