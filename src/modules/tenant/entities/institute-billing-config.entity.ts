import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';
import { InstituteTier } from '../../institute/enums/institute.enums';

@Entity('institute_billing_config')
export class InstituteBillingConfigEntity {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string;

  @Column({ name: 'institute_id', type: 'bigint', unique: true })
  instituteId: string;

  @Column({ type: 'enum', enum: InstituteTier, default: InstituteTier.FREE })
  tier: InstituteTier;

  @Column({ name: 'base_monthly_fee', type: 'decimal', precision: 10, scale: 2, default: 0 })
  baseMonthlyFee: number;

  @Column({ name: 'per_user_monthly_fee', type: 'decimal', precision: 10, scale: 2, default: 0 })
  perUserMonthlyFee: number;

  @Column({ name: 'per_subdomain_login_fee', type: 'decimal', precision: 10, scale: 2, default: 0 })
  perSubdomainLoginFee: number;

  @Column({ name: 'sms_masking_monthly_fee', type: 'decimal', precision: 10, scale: 2, default: 0 })
  smsMaskingMonthlyFee: number;

  @Column({ name: 'custom_pricing_json', type: 'json', nullable: true })
  customPricingJson?: Record<string, any>;

  @Column({ name: 'billing_cycle_start_day', type: 'int', default: 1 })
  billingCycleStartDay: number;

  @Column({ type: 'varchar', length: 3, default: 'LKR' })
  currency: string;

  @Column({ name: 'max_free_subdomain_logins', type: 'int', default: 0 })
  maxFreeSubdomainLogins: number;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @Column({ name: 'created_at', type: 'timestamp' })
  createdAt: Date;

  @Column({ name: 'updated_at', type: 'timestamp' })
  updatedAt: Date;
}
