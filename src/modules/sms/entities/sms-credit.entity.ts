import { Entity, PrimaryColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

/**
 * SMS Credit Entity
 * 
 * Tracks SMS credit balance for each institute
 * Credits are deducted BEFORE sending to prevent race conditions
 */
@Entity('sms_credits')
@Index('idx_sms_credits_institute', ['instituteId'])
export class SmsCreditEntity {
  @PrimaryColumn({ name: 'institute_id', type: 'bigint' })
  instituteId: string;

  @Column({ name: 'balance', type: 'decimal', precision: 10, scale: 2, default: 0 })
  balance: number;

  @Column({ name: 'total_purchased', type: 'decimal', precision: 10, scale: 2, default: 0 })
  totalPurchased: number;

  @Column({ name: 'total_used', type: 'decimal', precision: 10, scale: 2, default: 0 })
  totalUsed: number;

  @Column({ name: 'last_topup_amount', type: 'decimal', precision: 10, scale: 2, nullable: true })
  lastTopupAmount: number;

  @Column({ name: 'last_topup_at', type: 'timestamp', nullable: true })
  lastTopupAt: Date;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp' })
  updatedAt: Date;
}
