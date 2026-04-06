import { Entity, PrimaryGeneratedColumn, Column, Unique } from 'typeorm';
import { BillingStatus } from '../../institute/enums/institute.enums';

@Entity('monthly_billing_summary')
@Unique('uk_institute_month', ['instituteId', 'billingMonth'])
export class MonthlyBillingSummaryEntity {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string;

  @Column({ name: 'institute_id', type: 'bigint' })
  instituteId: string;

  @Column({ name: 'billing_month', type: 'date' })
  billingMonth: Date;

  @Column({ name: 'total_logins', type: 'int', default: 0 })
  totalLogins: number;

  @Column({ name: 'subdomain_logins', type: 'int', default: 0 })
  subdomainLogins: number;

  @Column({ name: 'custom_domain_logins', type: 'int', default: 0 })
  customDomainLogins: number;

  @Column({ name: 'unique_subdomain_users', type: 'int', default: 0 })
  uniqueSubdomainUsers: number;

  @Column({ name: 'unique_custom_domain_users', type: 'int', default: 0 })
  uniqueCustomDomainUsers: number;

  @Column({ name: 'total_active_users', type: 'int', default: 0 })
  totalActiveUsers: number;

  @Column({ name: 'base_fee', type: 'decimal', precision: 10, scale: 2, default: 0 })
  baseFee: number;

  @Column({ name: 'user_fee', type: 'decimal', precision: 10, scale: 2, default: 0 })
  userFee: number;

  @Column({ name: 'login_fee', type: 'decimal', precision: 10, scale: 2, default: 0 })
  loginFee: number;

  @Column({ name: 'sms_masking_fee', type: 'decimal', precision: 10, scale: 2, default: 0 })
  smsMaskingFee: number;

  @Column({ name: 'total_fee', type: 'decimal', precision: 10, scale: 2, default: 0 })
  totalFee: number;

  @Column({ type: 'enum', enum: BillingStatus, default: BillingStatus.PENDING })
  status: BillingStatus;

  @Column({ name: 'invoice_url', type: 'varchar', length: 500, nullable: true })
  invoiceUrl?: string;

  @Column({ name: 'paid_at', type: 'timestamp', nullable: true })
  paidAt?: Date;

  @Column({ name: 'created_at', type: 'timestamp' })
  createdAt: Date;

  @Column({ name: 'updated_at', type: 'timestamp' })
  updatedAt: Date;
}
