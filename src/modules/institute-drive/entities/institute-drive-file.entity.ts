import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  Index,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { InstituteEntity } from '../../institute/entities/institute.entity';
import { UserEntity } from '../../user/entities/user.entity';

/**
 * Tracks every file uploaded through the institute drive.
 *
 * Unlike UserDriveFileEntity (personal drive), files here belong to the
 * institute — they persist regardless of which teacher uploaded them.
 *
 * Folder path convention stored in `driveFolderPath`:
 *   Suraksha LMS / {InstituteName} / Grade {N} {ClassName} / {Purpose} / {SubjectName}
 */
@Entity('institute_drive_files')
@Index('idx_inst_file_institute', ['instituteId'])
@Index('idx_inst_file_drive_id', ['driveFileId'])
@Index('idx_inst_file_purpose', ['purpose'])
@Index('idx_inst_file_reference', ['referenceType', 'referenceId'])
@Index('idx_inst_file_uploader', ['uploadedByUserId'])
export class InstituteDriveFileEntity {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string;

  @Column({ name: 'institute_id', type: 'bigint' })
  instituteId: string;

  @ManyToOne(() => InstituteEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'institute_id' })
  institute: InstituteEntity;

  /** Teacher (or admin) who uploaded this file. Null if user is deleted. */
  @Column({ name: 'uploaded_by_user_id', type: 'bigint', nullable: true })
  uploadedByUserId: string;

  @ManyToOne(() => UserEntity, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'uploaded_by_user_id' })
  uploadedByUser: UserEntity;

  @Column({ name: 'drive_file_id', type: 'varchar', length: 255 })
  driveFileId: string;

  @Column({ name: 'drive_web_view_link', type: 'varchar', length: 500, nullable: true })
  driveWebViewLink: string;

  @Column({ name: 'drive_web_content_link', type: 'varchar', length: 500, nullable: true })
  driveWebContentLink: string;

  /** ID of the Drive folder this file lives in. */
  @Column({ name: 'drive_folder_id', type: 'varchar', length: 255, nullable: true })
  driveFolderId: string;

  /** Human-readable folder path for display, e.g. "Suraksha LMS / St. Mary's / Grade 10 10A / Lectures / Maths". */
  @Column({ name: 'drive_folder_path', type: 'varchar', length: 1000, nullable: true })
  driveFolderPath: string;

  @Column({ name: 'file_name', type: 'varchar', length: 500 })
  fileName: string;

  @Column({ name: 'mime_type', type: 'varchar', length: 100 })
  mimeType: string;

  @Column({ name: 'file_size', type: 'bigint', nullable: true })
  fileSize: number;

  /**
   * Upload purpose.
   * Values: LECTURE_DOCUMENT | LECTURE_RECORDING | HOMEWORK_REFERENCE |
   *         HOMEWORK_SUBMISSION | HOMEWORK_CORRECTION | EXAM_DOCUMENT | GENERAL
   */
  @Column({ name: 'purpose', type: 'varchar', length: 50, default: 'GENERAL' })
  purpose: string;

  /** e.g. 'homework', 'lecture', 'exam' */
  @Column({ name: 'reference_type', type: 'varchar', length: 100, nullable: true })
  referenceType: string;

  @Column({ name: 'reference_id', type: 'bigint', nullable: true })
  referenceId: string;

  /** Optional: subject name stored for folder path display */
  @Column({ name: 'subject_name', type: 'varchar', length: 255, nullable: true })
  subjectName: string;

  /** Optional: class name stored for folder path display */
  @Column({ name: 'class_name', type: 'varchar', length: 255, nullable: true })
  className: string;

  /** Optional: grade level */
  @Column({ name: 'grade', type: 'int', nullable: true })
  grade: number;

  @Column({ name: 'sharing_permissions', type: 'text', nullable: true })
  sharingPermissions: string;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @CreateDateColumn({ name: 'uploaded_at', type: 'datetime' })
  uploadedAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'datetime' })
  updatedAt: Date;
}
