import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  Index,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { InstituteEntity } from '../../../institute/entities/institute.entity';
import { InstituteClassEntity } from '../../../institute_mudules/institue_class/entities/institue_class.entity';
import { SubjectEntity } from '../../../subject/entities/subject.entity';
import { UserEntity } from '../../../user/entities/user.entity';

/**
 * Study materials at the institute → class → subject level.
 * Teachers / admins attach files (S3, Drive) or external links
 * with configurable download & share permissions.
 */
@Entity('institute_class_subject_study_materials')
@Index(['instituteId'])
@Index(['instituteId', 'classId'])
@Index(['instituteId', 'classId', 'subjectId'])
@Index(['createdById'])
@Index(['isActive', 'sortOrder'])
export class StudyMaterialEntity {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string;

  // ── Scoping ────────────────────────────────────────────────

  @Column({ name: 'institute_id', type: 'bigint' })
  instituteId: string;

  @ManyToOne(() => InstituteEntity, { onDelete: 'CASCADE' })
  @JoinColumn([{ name: 'institute_id' }])
  institute: InstituteEntity;

  @Column({ name: 'class_id', type: 'bigint', nullable: true })
  classId?: string;

  @ManyToOne(() => InstituteClassEntity, { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn([{ name: 'class_id' }])
  class?: InstituteClassEntity;

  @Column({ name: 'subject_id', type: 'bigint' })
  subjectId: string;

  @ManyToOne(() => SubjectEntity, { onDelete: 'CASCADE' })
  @JoinColumn([{ name: 'subject_id' }])
  subject: SubjectEntity;

  // ── Content ────────────────────────────────────────────────

  @Column({ type: 'varchar', length: 255 })
  title: string;

  @Column({ type: 'text', nullable: true })
  description?: string;

  /**
   * 'FILE'  → uploaded via S3 / Drive (fileUrl holds the path)
   * 'LINK'  → external URL (fileUrl holds the URL)
   */
  @Column({ name: 'material_type', type: 'enum', enum: ['FILE', 'LINK'], default: 'FILE' })
  materialType: 'FILE' | 'LINK';

  @Column({ name: 'file_url', type: 'text', nullable: true })
  fileUrl?: string;

  @Column({ name: 'file_name', type: 'varchar', length: 500, nullable: true })
  fileName?: string;

  @Column({ name: 'file_size', type: 'bigint', nullable: true })
  fileSize?: string;

  @Column({ name: 'mime_type', type: 'varchar', length: 100, nullable: true })
  mimeType?: string;

  /**
   * Where the file lives: GOOGLE_DRIVE, GOOGLE_DRIVE_INSTITUTE, EXTERNAL_LINK
   */
  @Column({ name: 'source', type: 'varchar', length: 50, default: 'GOOGLE_DRIVE' })
  source: string;

  @Column({ name: 'drive_file_id', type: 'varchar', length: 255, nullable: true })
  driveFileId?: string;

  @Column({ name: 'drive_web_view_link', type: 'text', nullable: true })
  driveWebViewLink?: string;

  @Column({ name: 'thumbnail_url', type: 'varchar', length: 500, nullable: true })
  thumbnailUrl?: string;

  // ── Permissions ────────────────────────────────────────────

  /** Students can download the file */
  @Column({ name: 'download_enabled', type: 'boolean', default: true })
  downloadEnabled: boolean;

  /** Students can share / forward the material link */
  @Column({ name: 'share_enabled', type: 'boolean', default: false })
  shareEnabled: boolean;

  /** Whether this material is visible to students */
  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  /** Sort order within the subject – lower = first */
  @Column({ name: 'sort_order', type: 'int', default: 0 })
  sortOrder: number;

  // ── Audit ──────────────────────────────────────────────────

  @Column({ name: 'created_by_id', type: 'bigint', nullable: true })
  createdById?: string;

  @ManyToOne(() => UserEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn([{ name: 'created_by_id' }])
  createdBy?: UserEntity;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
