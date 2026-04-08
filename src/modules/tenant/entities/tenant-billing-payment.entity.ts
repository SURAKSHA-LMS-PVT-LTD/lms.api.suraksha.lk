import { Entity, PrimaryGeneratedColumn, Column, Index } from 'typeorm';

/**
 * Payment status for a tenant service payment submission.
 */
export enum TenantServicePaymentStatus {
  PENDING = 'PENDING',
  VERIFIED = 'VERIFIED',
  REJECTED = 'REJECTED',
}

/**
 * Payment methods accepted for tenant service payments.
 */
export enum TenantServicePaymentMethod {
  BANK_TRANSFER = 'BANK_TRANSFER',
  ONLINE_PAYMENT = 'ONLINE_PAYMENT',
  CASH_DEPOSIT = 'CASH_DEPOSIT',
}

/**
 * Type of platform service being purchased.
 * Covers all current and future chargeable services:
 * monthly platform invoice, subdomain/domain fees, SMS/Email/WhatsApp credits, storage top-ups, etc.
 */
export enum TenantServiceType {
  CREDITS = 'CREDITS',                       // General credit top-up (universal credits)
  MONTHLY_INVOICE = 'MONTHLY_INVOICE',       // Regular monthly platform fee
  SUBDOMAIN_FEE = 'SUBDOMAIN_FEE',           // One-time or recurring subdomain fee
  CUSTOM_DOMAIN_FEE = 'CUSTOM_DOMAIN_FEE',   // Custom domain setup/renewal
  SMS_CREDITS = 'SMS_CREDITS',               // SMS credit top-up (legacy)
  EMAIL_CREDITS = 'EMAIL_CREDITS',           // Email credit top-up (legacy)
  WHATSAPP_CREDITS = 'WHATSAPP_CREDITS',     // WhatsApp messaging credits (legacy)
  STORAGE_PURCHASE = 'STORAGE_PURCHASE',     // Additional storage quota purchase
  OTHER = 'OTHER',                           // Any other platform service
}

/**
 * Tenant Service Payment — records a payment submission by an institute
 * (via institute admin) to the platform for any chargeable service.
 * System admins verify/reject submissions and activate the service.
 *
 * Table: tenant_service_payments
 */
@Entity('tenant_service_payments')
@Index('idx_tsp_institute_month', ['instituteId', 'billingMonth'])
@Index('idx_tsp_status', ['status'])
@Index('idx_tsp_institute_status', ['instituteId', 'status'])
@Index('idx_tsp_service_type', ['serviceType'])
export class TenantServicePaymentEntity {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string;

  @Column({ name: 'institute_id', type: 'bigint' })
  instituteId: string;

  /** YYYY-MM — the month this payment relates to (for monthly invoices) or the month of top-up */
  @Column({ name: 'billing_month', type: 'char', length: 7 })
  billingMonth: string;

  @Column({ name: 'service_type', type: 'enum', enum: TenantServiceType, default: TenantServiceType.CREDITS })
  serviceType: TenantServiceType;

  /** Human-readable label — e.g. "500 SMS credits", "100 GB storage" */
  @Column({ name: 'service_description', type: 'varchar', length: 300, nullable: true })
  serviceDescription?: string;

  @Column({ name: 'payment_amount', type: 'decimal', precision: 10, scale: 2 })
  paymentAmount: number;

  @Column({ name: 'payment_method', type: 'enum', enum: TenantServicePaymentMethod })
  paymentMethod: TenantServicePaymentMethod;

  @Column({ name: 'payment_reference', type: 'varchar', length: 100, nullable: true })
  paymentReference?: string;

  @Column({ name: 'payment_slip_url', type: 'varchar', length: 500, nullable: true })
  paymentSlipUrl?: string;

  /** Requested units — e.g. 500 SMS credits, 100 GB storage */
  @Column({ name: 'requested_quantity', type: 'int', nullable: true })
  requestedQuantity?: number;

  /** Units actually granted by admin on verification (may differ from requested) */
  @Column({ name: 'granted_quantity', type: 'int', nullable: true })
  grantedQuantity?: number;

  /** Flexible JSON for service-specific data (costPerCredit, packageId, etc.) */
  @Column({ name: 'service_metadata', type: 'json', nullable: true })
  serviceMetadata?: Record<string, any>;

  /** YYYY-MM-DD */
  @Column({ name: 'payment_date', type: 'date' })
  paymentDate: string;

  @Column({ type: 'enum', enum: TenantServicePaymentStatus, default: TenantServicePaymentStatus.PENDING })
  status: TenantServicePaymentStatus;

  @Column({ name: 'submitted_by', type: 'bigint' })
  submittedBy: string;

  @Column({ name: 'submitted_at', type: 'timestamp' })
  submittedAt: Date;

  @Column({ name: 'verified_by', type: 'bigint', nullable: true })
  verifiedBy?: string;

  @Column({ name: 'verified_at', type: 'timestamp', nullable: true })
  verifiedAt?: Date;

  @Column({ name: 'rejection_reason', type: 'varchar', length: 300, nullable: true })
  rejectionReason?: string;

  @Column({ name: 'notes', type: 'varchar', length: 500, nullable: true })
  notes?: string;

  @Column({ name: 'created_at', type: 'timestamp' })
  createdAt: Date;

  @Column({ name: 'updated_at', type: 'timestamp' })
  updatedAt: Date;
}
