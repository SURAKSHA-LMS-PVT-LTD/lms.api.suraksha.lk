import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, ValueTransformer, Index } from 'typeorm';
import { InstituteClassSubjectHomework } from './institute_class_subject_homework.entity';
import { UserEntity } from '../../../user/entities/user.entity';

// Date transformer for ISO serialization
const dateTransformer: ValueTransformer = {
  to: (value: Date | string | null) => value,
  from: (value: Date | string | null) => value instanceof Date ? value : value ? new Date(value) : null,
};

/**
 * Reference material types for homework
 * - VIDEO: Video file (mp4, webm, etc.)
 * - IMAGE: Image file (jpg, png, gif, etc.)
 * - PDF: PDF document
 * - DOCUMENT: Word, Excel, PowerPoint documents
 * - LINK: External URL/link
 * - AUDIO: Audio files (mp3, wav, etc.)
 * - OTHER: Any other file type
 */
export enum HomeworkReferenceType {
  VIDEO = 'VIDEO',
  IMAGE = 'IMAGE',
  PDF = 'PDF',
  DOCUMENT = 'DOCUMENT',
  LINK = 'LINK',
  AUDIO = 'AUDIO',
  OTHER = 'OTHER',
}

/**
 * Source of the reference material
 * - S3_UPLOAD: Uploaded to AWS S3
 * - GOOGLE_DRIVE: Shared from Google Drive
 * - MANUAL_LINK: Manually entered URL/link
 */
export enum HomeworkReferenceSource {
  S3_UPLOAD = 'S3_UPLOAD',
  GOOGLE_DRIVE = 'GOOGLE_DRIVE',
  MANUAL_LINK = 'MANUAL_LINK',
}

/**
 * Entity representing reference materials for homework assignments.
 * Teachers can attach videos, images, PDFs, documents, links, etc.
 * Supports multiple upload sources: S3, Google Drive, or manual links.
 * 
 * Maps to the 'institute_class_subject_homework_references' table in the database.
 */
@Entity('institute_class_subject_homework_references')
@Index('IDX_homework_reference_homework_id', ['homeworkId'])
@Index('IDX_homework_reference_type', ['referenceType'])
@Index('IDX_homework_reference_source', ['referenceSource'])
@Index('IDX_homework_reference_is_active', ['isActive'])
export class InstituteClassSubjectHomeworkReference {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string;

  // ========== RELATIONSHIP FIELDS ==========

  @Column({ name: 'homework_id', type: 'bigint' })
  homeworkId: string;

  @ManyToOne(() => InstituteClassSubjectHomework, { onDelete: 'CASCADE' })
  @JoinColumn([{ name: 'homework_id' }])
  homework: InstituteClassSubjectHomework;

  @Column({ name: 'uploaded_by_id', type: 'bigint', nullable: true })
  uploadedById?: string;

  @ManyToOne(() => UserEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn([{ name: 'uploaded_by_id' }])
  uploadedBy?: UserEntity;

  // ========== REFERENCE METADATA ==========

  @Column({ name: 'title', type: 'varchar', length: 255 })
  title: string;

  @Column({ name: 'description', type: 'text', nullable: true })
  description?: string;

  @Column({ 
    name: 'reference_type', 
    type: 'enum', 
    enum: HomeworkReferenceType, 
    default: HomeworkReferenceType.OTHER 
  })
  referenceType: HomeworkReferenceType;

  @Column({ 
    name: 'reference_source', 
    type: 'enum', 
    enum: HomeworkReferenceSource, 
    default: HomeworkReferenceSource.S3_UPLOAD 
  })
  referenceSource: HomeworkReferenceSource;

  @Column({ name: 'display_order', type: 'int', default: 0 })
  displayOrder: number;

  // ========== S3 UPLOAD FIELDS ==========

  @Column({ name: 'file_url', type: 'varchar', length: 500, nullable: true })
  fileUrl?: string;

  @Column({ name: 'file_name', type: 'varchar', length: 255, nullable: true })
  fileName?: string;

  @Column({ name: 'file_size', type: 'bigint', nullable: true })
  fileSize?: number;

  @Column({ name: 'mime_type', type: 'varchar', length: 100, nullable: true })
  mimeType?: string;

  // ========== GOOGLE DRIVE FIELDS ==========

  @Column({ name: 'drive_file_id', type: 'varchar', length: 255, nullable: true })
  driveFileId?: string;

  @Column({ name: 'drive_file_name', type: 'varchar', length: 500, nullable: true })
  driveFileName?: string;

  @Column({ name: 'drive_mime_type', type: 'varchar', length: 100, nullable: true })
  driveMimeType?: string;

  @Column({ name: 'drive_file_size', type: 'bigint', nullable: true })
  driveFileSize?: number;

  // ========== MANUAL LINK FIELDS ==========

  @Column({ name: 'external_url', type: 'varchar', length: 1000, nullable: true })
  externalUrl?: string;

  @Column({ name: 'link_title', type: 'varchar', length: 255, nullable: true })
  linkTitle?: string;

  // ========== VIDEO SPECIFIC FIELDS ==========

  @Column({ name: 'video_duration', type: 'int', nullable: true, comment: 'Duration in seconds' })
  videoDuration?: number;

  @Column({ name: 'thumbnail_url', type: 'varchar', length: 500, nullable: true })
  thumbnailUrl?: string;

  // ========== STATUS & TIMESTAMPS ==========

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @Column({ name: 'created_at', type: 'timestamp', nullable: true, transformer: dateTransformer })
  createdAt?: Date;

  @Column({ name: 'updated_at', type: 'timestamp', nullable: true, transformer: dateTransformer })
  updatedAt?: Date;

  // ========== HELPER METHODS ==========

  /**
   * Get the viewable URL based on reference source
   */
  getViewUrl(): string | null {
    switch (this.referenceSource) {
      case HomeworkReferenceSource.S3_UPLOAD:
        return this.fileUrl || null;
      case HomeworkReferenceSource.GOOGLE_DRIVE:
        return this.driveFileId ? `https://drive.google.com/file/d/${this.driveFileId}/view` : null;
      case HomeworkReferenceSource.MANUAL_LINK:
        return this.externalUrl || null;
      default:
        return null;
    }
  }

  /**
   * Get download URL for Google Drive files
   */
  getDriveDownloadUrl(): string | null {
    if (this.referenceSource === HomeworkReferenceSource.GOOGLE_DRIVE && this.driveFileId) {
      return `https://drive.google.com/uc?id=${this.driveFileId}&export=download`;
    }
    return null;
  }

  /**
   * Get embed URL for Google Drive videos
   */
  getDriveEmbedUrl(): string | null {
    if (this.referenceSource === HomeworkReferenceSource.GOOGLE_DRIVE && 
        this.driveFileId && 
        this.referenceType === HomeworkReferenceType.VIDEO) {
      return `https://drive.google.com/file/d/${this.driveFileId}/preview`;
    }
    return null;
  }

  toJSON() {
    return {
      ...this,
      createdAt: this.createdAt instanceof Date ? this.createdAt.toISOString() : this.createdAt,
      updatedAt: this.updatedAt instanceof Date ? this.updatedAt.toISOString() : this.updatedAt,
      viewUrl: this.getViewUrl(),
      driveViewUrl: this.driveFileId ? `https://drive.google.com/file/d/${this.driveFileId}/view` : null,
      driveDownloadUrl: this.getDriveDownloadUrl(),
      driveEmbedUrl: this.getDriveEmbedUrl(),
    };
  }
}
