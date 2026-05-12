import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { FeatureCatalog } from './feature-catalog.entity';

@Entity('institute_feature_toggles')
export class InstituteFeatureToggles {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'institute_id' })
  instituteId: number;

  @Column({ name: 'feature_key' })
  featureKey: string;

  @ManyToOne(() => FeatureCatalog)
  @JoinColumn({ name: 'feature_key' })
  feature: FeatureCatalog;

  @Column()
  enabled: boolean;

  @Column({ name: 'enabled_source', type: 'enum', enum: ['ADMIN', 'PLAN', 'SYSTEM'], nullable: true })
  enabledSource: string;

  @Column({ name: 'enabled_by_user_id', nullable: true })
  enabledByUserId: number;

  @CreateDateColumn({ name: 'enabled_at' })
  enabledAt: Date;

  @Column({ name: 'expires_at', nullable: true })
  expiresAt: Date;

  @Column({ type: 'text', nullable: true })
  notes: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
