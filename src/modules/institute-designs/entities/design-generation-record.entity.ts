import {
  Entity, Column, Index, PrimaryGeneratedColumn, CreateDateColumn,
} from 'typeorm';
import { DesignOutputType } from './design-template.entity';

export enum GenerationRecordStatus {
  COMPLETED = 'COMPLETED',
  PARTIAL   = 'PARTIAL',
  FAILED    = 'FAILED',
}

@Entity('design_generation_records')
@Index('idx_dgr_institute', ['instituteId'])
@Index('idx_dgr_template', ['templateId'])
@Index('idx_dgr_institute_created', ['instituteId', 'createdAt'])
export class DesignGenerationRecordEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'institute_id', type: 'varchar', length: 36 })
  instituteId: string;

  @Column({ name: 'template_id', type: 'varchar', length: 36 })
  templateId: string;

  @Column({ name: 'output_type', type: 'enum', enum: DesignOutputType })
  outputType: DesignOutputType;

  /** Institute admin user who triggered the generation */
  @Column({ name: 'requested_by', type: 'varchar', length: 36 })
  requestedBy: string;

  /** JSON array of user IDs selected for this run */
  @Column({ name: 'user_ids', type: 'json' })
  userIds: string[];

  @Column({ name: 'user_count', type: 'int' })
  userCount: number;

  @Column({ name: 'unit_cost', type: 'decimal', precision: 10, scale: 2 })
  unitCost: number;

  @Column({ name: 'total_cost', type: 'decimal', precision: 10, scale: 2 })
  totalCost: number;

  /** Credits refunded for failed renders (updated by reportGenerationResult) */
  @Column({ name: 'refunded', type: 'decimal', precision: 10, scale: 2, default: 0 })
  refunded: number;

  @Column({
    name: 'status',
    type: 'enum',
    enum: GenerationRecordStatus,
    default: GenerationRecordStatus.COMPLETED,
  })
  status: GenerationRecordStatus;

  @Column({ name: 'success_count', type: 'int', default: 0 })
  successCount: number;

  @Column({ name: 'fail_count', type: 'int', default: 0 })
  failCount: number;

  /** Reference to the credit ledger entry (institute_credit_transactions.id) */
  @Column({ name: 'credit_transaction_id', type: 'varchar', length: 36, nullable: true })
  creditTransactionId?: string;

  /** Set true once reportGenerationResult has been called — prevents double-refund */
  @Column({ name: 'result_reported', type: 'boolean', default: false })
  resultReported: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt: Date;
}
