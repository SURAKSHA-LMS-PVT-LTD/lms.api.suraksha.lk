import { Entity, PrimaryGeneratedColumn, Column, Index } from 'typeorm';
import { SubscriptionPlan } from '../../user/enums/subscription-plan.enum';

@Entity('package_definitions')
@Index('idx_pkg_plan', ['subscriptionPlan'], { unique: true })
@Index('idx_pkg_active_sort', ['isActive', 'sortOrder'])
export class PackageDefinitionEntity {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string;

  @Column({ name: 'subscription_plan', type: 'enum', enum: SubscriptionPlan, unique: true })
  subscriptionPlan: SubscriptionPlan;

  @Column({ type: 'varchar', length: 100 })
  name: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  description?: string;

  @Column({ type: 'json', nullable: true })
  features?: string[];

  @Column({ name: 'price', type: 'decimal', precision: 10, scale: 2 })
  price: number;

  @Column({ name: 'validity_days', type: 'int', default: 30 })
  validityDays: number;

  @Column({ name: 'image_url', type: 'varchar', length: 500, nullable: true })
  imageUrl?: string;

  @Column({ name: 'sort_order', type: 'int', default: 0 })
  sortOrder: number;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @Column({ name: 'created_at', type: 'timestamp' })
  createdAt: Date;

  @Column({ name: 'updated_at', type: 'timestamp' })
  updatedAt: Date;
}
