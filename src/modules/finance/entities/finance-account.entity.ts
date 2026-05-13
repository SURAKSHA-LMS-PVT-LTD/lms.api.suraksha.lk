import {
  Entity, PrimaryGeneratedColumn, Column, Index, CreateDateColumn, UpdateDateColumn,
} from 'typeorm';

export enum FinanceAccountType {
  CASH  = 'CASH',
  BANK  = 'BANK',
}

@Entity('finance_accounts')
@Index('idx_fa_institute', ['instituteId', 'isActive'])
export class FinanceAccountEntity {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string;

  @Column({ name: 'institute_id', type: 'bigint' })
  instituteId: string;

  @Column({ type: 'varchar', length: 120 })
  name: string;

  @Column({ type: 'enum', enum: FinanceAccountType, default: FinanceAccountType.CASH })
  type: FinanceAccountType;

  @Column({ name: 'current_balance', type: 'decimal', precision: 14, scale: 2, default: '0.00' })
  currentBalance: string;

  @Column({ name: 'bank_name', type: 'varchar', length: 120, nullable: true })
  bankName?: string;

  @Column({ name: 'account_number', type: 'varchar', length: 60, nullable: true })
  accountNumber?: string;

  @Column({ name: 'is_active', type: 'tinyint', default: 1 })
  isActive: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
