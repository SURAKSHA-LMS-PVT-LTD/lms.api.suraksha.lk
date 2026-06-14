import { Entity, PrimaryColumn, Column, Index, CreateDateColumn, UpdateDateColumn } from 'typeorm';

export enum GatewayOrderStatus {
  PENDING   = 'PENDING',
  SUCCESS   = 'SUCCESS',
  FAILED    = 'FAILED',
  CANCELLED = 'CANCELLED',
  CHARGEDBACK = 'CHARGEDBACK',
}

/**
 * One row per gateway payment attempt.
 * order_id is merchant-generated (uuid), unique per attempt.
 * On SUCCESS the webhook handler grants credits via TenantService.
 */
@Entity('gateway_payment_orders')
@Index('idx_gpo_institute', ['instituteId'])
@Index('idx_gpo_status', ['status'])
@Index('idx_gpo_institute_status', ['instituteId', 'status'])
export class GatewayPaymentOrderEntity {
  /** Our internal order ID — sent to PayHere as order_id */
  @PrimaryColumn({ type: 'varchar', length: 36 })
  id: string;

  @Column({ name: 'institute_id', type: 'varchar', length: 36 })
  instituteId: string;

  @Column({ name: 'submitted_by', type: 'bigint' })
  submittedBy: string;

  /** PAYHERE | SMARTPAY | … */
  @Column({ name: 'provider', type: 'varchar', length: 50 })
  provider: string;

  /** CREDITS | MONTHLY_INVOICE | … — mirrors TenantServiceType */
  @Column({ name: 'service_type', type: 'varchar', length: 50 })
  serviceType: string;

  @Column({ name: 'amount', type: 'decimal', precision: 10, scale: 2 })
  amount: number;

  @Column({ name: 'currency', type: 'varchar', length: 10 })
  currency: string;

  /** Credits to grant on success */
  @Column({ name: 'requested_credits', type: 'int' })
  requestedCredits: number;

  @Column({ name: 'status', type: 'enum', enum: GatewayOrderStatus, default: GatewayOrderStatus.PENDING })
  status: GatewayOrderStatus;

  /** PayHere's own payment_id — set on webhook */
  @Column({ name: 'gateway_payment_id', type: 'varchar', length: 100, nullable: true })
  gatewayPaymentId?: string;

  /** Payment method reported by gateway (VISA, MASTER, etc.) */
  @Column({ name: 'gateway_method', type: 'varchar', length: 50, nullable: true })
  gatewayMethod?: string;

  /** Raw webhook payload stored for audit */
  @Column({ name: 'webhook_payload', type: 'json', nullable: true })
  webhookPayload?: Record<string, string>;

  /** ID of the TenantServicePaymentEntity created on success — for reconciliation */
  @Column({ name: 'tenant_payment_id', type: 'bigint', nullable: true })
  tenantPaymentId?: string;

  /** Set to true after credits are granted — idempotency guard */
  @Column({ name: 'credits_granted', type: 'boolean', default: false })
  creditsGranted: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
