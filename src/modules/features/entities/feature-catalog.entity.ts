import { Entity, PrimaryColumn, Column } from 'typeorm';
import { FeatureScope, FeatureCategory, FeaturePricing, FeatureBillingCycle } from '../dto/feature.dto';

@Entity('feature_catalog')
export class FeatureCatalog {
  @PrimaryColumn()
  key: string;

  @Column()
  label: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({ type: 'enum', enum: FeatureScope })
  scope: FeatureScope;

  @Column({ type: 'enum', enum: FeatureCategory })
  category: FeatureCategory;

  @Column({ type: 'enum', enum: FeaturePricing })
  pricing: FeaturePricing;

  @Column({ name: 'billing_cycle', type: 'enum', enum: FeatureBillingCycle })
  billingCycle: FeatureBillingCycle;

  @Column({ name: 'is_core', default: false })
  isCore: boolean;

  @Column({ type: 'simple-json', nullable: true })
  dependencies: string[];

  @Column({ name: 'ui_targets', type: 'simple-json', nullable: true })
  uiTargets: string[];

  @Column({ name: 'is_active', default: true })
  isActive: boolean;
}
