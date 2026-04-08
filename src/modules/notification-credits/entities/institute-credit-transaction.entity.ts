import { Entity, Column, Index, PrimaryGeneratedColumn } from 'typeorm';

/**
 * Credit transaction types — covers all credit movements.
 */
export enum CreditTransactionType {
  // ── Additions ──
  TOP_UP = 'TOP_UP',                       // Payment verified → credits added
  ADMIN_ADJUSTMENT = 'ADMIN_ADJUSTMENT',   // Manual admin credit adjustment (+/-)
  REFUND = 'REFUND',                       // Refund for failed delivery
  BONUS = 'BONUS',                         // Promotional / bonus credits
  MIGRATION = 'MIGRATION',                 // One-time migration from old system

  // ── Deductions ──
  SMS_SEND = 'SMS_SEND',                   // SMS message sent
  EMAIL_SEND = 'EMAIL_SEND',              // Email sent (future)
  WHATSAPP_SEND = 'WHATSAPP_SEND',        // WhatsApp message (future)
  PUSH_NOTIFICATION = 'PUSH_NOTIFICATION', // Push notification (future)
  FEATURE_PURCHASE = 'FEATURE_PURCHASE',   // Feature/addon purchase (future)
  STORAGE_PURCHASE = 'STORAGE_PURCHASE',   // Storage purchase (future)
}

/**
 * Institute Credit Transactions — Immutable ledger of every credit movement.
 *
 * Every addition/deduction is recorded here for full auditability.
 * `amount` is positive for additions, negative for deductions.
 * `balanceBefore` + `amount` = `balanceAfter`.
 *
 * Table: institute_credit_transactions
 */
@Entity('institute_credit_transactions')
@Index('idx_ict_institute', ['instituteId'])
@Index('idx_ict_institute_type', ['instituteId', 'type'])
@Index('idx_ict_institute_created', ['instituteId', 'createdAt'])
@Index('idx_ict_reference', ['referenceType', 'referenceId'])
export class InstituteCreditTransactionEntity {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string;

  @Column({ name: 'institute_id', type: 'bigint' })
  instituteId: string;

  @Column({ name: 'type', type: 'enum', enum: CreditTransactionType })
  type: CreditTransactionType;

  /**
   * Positive for additions, negative for deductions.
   * E.g. +500 for top-up, -3 for SMS send of 3 messages.
   */
  @Column({ name: 'amount', type: 'decimal', precision: 12, scale: 2 })
  amount: number;

  /** Balance before this transaction */
  @Column({ name: 'balance_before', type: 'decimal', precision: 12, scale: 2 })
  balanceBefore: number;

  /** Balance after this transaction */
  @Column({ name: 'balance_after', type: 'decimal', precision: 12, scale: 2 })
  balanceAfter: number;

  /**
   * What this transaction references:
   * - 'PAYMENT' → referenceId = tenant_service_payments.id
   * - 'SMS_CAMPAIGN' → referenceId = institute_sms_messages.id
   * - 'SMS_INSTANT' → referenceId = sms_campaigns.id
   * - 'ADMIN' → referenceId = admin user ID
   * - null for system adjustments
   */
  @Column({ name: 'reference_type', type: 'varchar', length: 50, nullable: true })
  referenceType?: string;

  /** ID of the referenced record */
  @Column({ name: 'reference_id', type: 'varchar', length: 100, nullable: true })
  referenceId?: string;

  /** Human-readable description */
  @Column({ name: 'description', type: 'varchar', length: 500, nullable: true })
  description?: string;

  /** User who triggered this transaction (admin, system, etc.) */
  @Column({ name: 'created_by', type: 'bigint', nullable: true })
  createdBy?: string;

  @Column({ name: 'created_at', type: 'timestamp' })
  createdAt: Date;
}
