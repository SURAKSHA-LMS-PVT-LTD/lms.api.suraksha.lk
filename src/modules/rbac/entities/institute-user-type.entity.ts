import { Entity, PrimaryGeneratedColumn, Column, Index, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('institute_user_types')
@Index('idx_iut_institute_active', ['instituteId', 'isActive'])
@Index('idx_iut_slug', ['instituteId', 'slug'], { unique: true })
export class InstituteUserTypeEntity {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: string;

  @Column({ name: 'institute_id', type: 'varchar', length: 36 })
  instituteId: string;

  @Column({ name: 'name', type: 'varchar', length: 100 })
  name: string;

  @Column({ name: 'name_plural', type: 'varchar', length: 100, nullable: true })
  namePlural?: string;

  // URL-safe identifier used as fallback when looking up legacy role checks
  @Column({ name: 'slug', type: 'varchar', length: 80 })
  slug: string;

  @Column({ name: 'description', type: 'text', nullable: true })
  description?: string;

  // Hex color for UI chips e.g. "#6366f1"
  @Column({ name: 'color', type: 'varchar', length: 20, nullable: true })
  color?: string;

  // System types (student, teacher, etc.) cannot be deleted
  @Column({ name: 'is_system_type', type: 'boolean', default: false })
  isSystemType: boolean;

  // Whether this type is shown in public-facing enrolment forms
  @Column({ name: 'is_public', type: 'boolean', default: true })
  isPublic: boolean;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  // Display order in UI lists
  @Column({ name: 'sort_order', type: 'int', default: 100 })
  sortOrder: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
