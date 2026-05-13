import { Entity, PrimaryGeneratedColumn, Column, Index, CreateDateColumn, UpdateDateColumn } from 'typeorm';

/**
 * Stores per-feature CRUD/report permissions for each user type within an institute.
 * One row = one (userTypeId, featureKey) combination.
 */
@Entity('institute_feature_permissions')
@Index('idx_ifp_user_type', ['userTypeId', 'featureKey'], { unique: true })
@Index('idx_ifp_institute', ['instituteId'])
export class InstituteFeaturePermissionEntity {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: string;

  @Column({ name: 'institute_id', type: 'bigint' })
  instituteId: string;

  @Column({ name: 'user_type_id', type: 'bigint' })
  userTypeId: string;

  // dot-notation key matching feature_catalog.key e.g. "academics.homework"
  @Column({ name: 'feature_key', type: 'varchar', length: 120 })
  featureKey: string;

  @Column({ name: 'can_view', type: 'boolean', default: false })
  canView: boolean;

  @Column({ name: 'can_create', type: 'boolean', default: false })
  canCreate: boolean;

  @Column({ name: 'can_update', type: 'boolean', default: false })
  canUpdate: boolean;

  @Column({ name: 'can_delete', type: 'boolean', default: false })
  canDelete: boolean;

  @Column({ name: 'can_report', type: 'boolean', default: false })
  canReport: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
