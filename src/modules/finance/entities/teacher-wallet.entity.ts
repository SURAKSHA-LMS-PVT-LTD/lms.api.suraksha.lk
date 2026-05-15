import {
  Entity, PrimaryGeneratedColumn, Column, Index, CreateDateColumn, UpdateDateColumn,
} from 'typeorm';

@Entity('teacher_wallets')
@Index('idx_tw_teacher_institute', ['teacherId', 'instituteId'], { unique: true })
export class TeacherWalletEntity {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string;

  @Column({ name: 'teacher_id', type: 'bigint' })
  teacherId: string;

  @Column({ name: 'institute_id', type: 'varchar', length: 36 })
  instituteId: string;

  /** Current withdrawable balance */
  @Column({ type: 'decimal', precision: 14, scale: 2, default: '0.00' })
  balance: string;

  /** Lifetime gross earnings */
  @Column({ name: 'total_earned', type: 'decimal', precision: 14, scale: 2, default: '0.00' })
  totalEarned: string;

  /** Lifetime deductions (printing, fines, etc.) */
  @Column({ name: 'total_deductions', type: 'decimal', precision: 14, scale: 2, default: '0.00' })
  totalDeductions: string;

  /** Lifetime payouts already withdrawn */
  @Column({ name: 'total_paid_out', type: 'decimal', precision: 14, scale: 2, default: '0.00' })
  totalPaidOut: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
