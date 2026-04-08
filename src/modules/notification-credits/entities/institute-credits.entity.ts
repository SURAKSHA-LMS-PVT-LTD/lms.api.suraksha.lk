import { Entity, Column, Index, PrimaryGeneratedColumn } from 'typeorm';

/**
 * Institute Credits — Global credit balance per institute.
 *
 * This is the SINGLE source of truth for an institute's credit balance.
 * Credits can be spent on: SMS, email, WhatsApp, feature purchases, etc.
 * Credits are topped up via verified payment submissions (tenant_service_payments).
 *
 * Table: institute_credits
 */
@Entity('institute_credits')
@Index('idx_ic_institute', ['instituteId'], { unique: true })
export class InstituteCreditsEntity {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string;

  @Column({ name: 'institute_id', type: 'bigint', unique: true })
  instituteId: string;

  /** Current available credit balance */
  @Column({ name: 'balance', type: 'decimal', precision: 12, scale: 2, default: 0 })
  balance: number;

  /** Lifetime credits purchased/granted */
  @Column({ name: 'total_purchased', type: 'decimal', precision: 12, scale: 2, default: 0 })
  totalPurchased: number;

  /** Lifetime credits consumed */
  @Column({ name: 'total_used', type: 'decimal', precision: 12, scale: 2, default: 0 })
  totalUsed: number;

  /** Daily usage counter (reset daily) */
  @Column({ name: 'daily_used', type: 'decimal', precision: 10, scale: 2, default: 0 })
  dailyUsed: number;

  /** Monthly usage counter (reset monthly) */
  @Column({ name: 'monthly_used', type: 'decimal', precision: 10, scale: 2, default: 0 })
  monthlyUsed: number;

  /** Optional daily spend limit (null = unlimited) */
  @Column({ name: 'daily_limit', type: 'decimal', precision: 10, scale: 2, nullable: true })
  dailyLimit?: number;

  /** Optional monthly spend limit (null = unlimited) */
  @Column({ name: 'monthly_limit', type: 'decimal', precision: 10, scale: 2, nullable: true })
  monthlyLimit?: number;

  /** Date of last daily counter reset */
  @Column({ name: 'last_daily_reset', type: 'date', nullable: true })
  lastDailyReset?: string;

  /** Date of last monthly counter reset (YYYY-MM-01) */
  @Column({ name: 'last_monthly_reset', type: 'date', nullable: true })
  lastMonthlyReset?: string;

  /** Last top-up amount for quick reference */
  @Column({ name: 'last_topup_amount', type: 'decimal', precision: 10, scale: 2, nullable: true })
  lastTopupAmount?: number;

  /** Last top-up timestamp */
  @Column({ name: 'last_topup_at', type: 'timestamp', nullable: true })
  lastTopupAt?: Date;

  /** Whether this account is active */
  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @Column({ name: 'created_at', type: 'timestamp' })
  createdAt: Date;

  @Column({ name: 'updated_at', type: 'timestamp' })
  updatedAt: Date;
}
