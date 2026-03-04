import { Entity, PrimaryGeneratedColumn, Column, Index, ManyToOne, JoinColumn, ValueTransformer } from 'typeorm';
import { UserEntity } from '../../user/entities/user.entity';
import { DriveUploadPurpose } from '../dto/drive-upload.dto';

const dateTransformer: ValueTransformer = {
  to: (value: Date | string | null) => value,
  from: (value: Date | string | null) => value instanceof Date ? value : value ? new Date(value) : null,
};

/**
 * Tracks every file uploaded through the backend to Google Drive.
 * 
 * This entity decouples file metadata from the homework submission entity,
 * making it reusable for future features (exam submissions, profile documents, etc.).
 * 
 * Files are uploaded to Google Drive via backend (proxy upload pattern):
 * 1. Frontend sends file to our backend
 * 2. Backend uses stored refresh token to get access token
 * 3. Backend uploads to Google Drive on behalf of user
 * 4. Backend stores metadata here
 * 5. Backend sets appropriate sharing permissions
 */
@Entity('user_drive_files')
@Index('idx_drive_file_user', ['uploadedByUserId'])
@Index('idx_drive_file_drive_id', ['driveFileId'])
@Index('idx_drive_file_purpose', ['purpose'])
@Index('idx_drive_file_reference', ['referenceType', 'referenceId'])
@Index('idx_drive_file_user_purpose', ['uploadedByUserId', 'purpose'])
export class UserDriveFileEntity {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string;

  /**
   * Google Drive file ID (from Google API response).
   */
  @Column({ name: 'drive_file_id', type: 'varchar', length: 255 })
  driveFileId: string;

  /**
   * Google Drive file web view link.
   */
  @Column({ name: 'drive_web_view_link', type: 'varchar', length: 500, nullable: true })
  driveWebViewLink: string;

  /**
   * Google Drive file web content link (direct download).
   */
  @Column({ name: 'drive_web_content_link', type: 'varchar', length: 500, nullable: true })
  driveWebContentLink: string;

  /**
   * Google Drive folder ID where this file was placed.
   */
  @Column({ name: 'drive_folder_id', type: 'varchar', length: 255, nullable: true })
  driveFolderId: string;

  /**
   * Original file name as uploaded.
   */
  @Column({ name: 'file_name', type: 'varchar', length: 500 })
  fileName: string;

  /**
   * MIME type of the uploaded file.
   */
  @Column({ name: 'mime_type', type: 'varchar', length: 100 })
  mimeType: string;

  /**
   * File size in bytes.
   */
  @Column({ name: 'file_size', type: 'bigint', nullable: true })
  fileSize: number;

  /**
   * The LMS user who uploaded this file.
   */
  @Column({ name: 'uploaded_by_user_id', type: 'bigint' })
  uploadedByUserId: string;

  @ManyToOne(() => UserEntity, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'uploaded_by_user_id' })
  uploadedByUser: UserEntity;

  /**
   * Purpose of this file upload.
   * Extensible for future features.
   */
  @Column({ name: 'purpose', type: 'enum', enum: [
    'HOMEWORK_SUBMISSION',
    'HOMEWORK_REFERENCE',
    'HOMEWORK_CORRECTION',
    'EXAM_SUBMISSION',
    'PROFILE_DOCUMENT',
    'ID_CARD_PAYMENT',
    'GENERAL',
  ], default: 'GENERAL' })
  purpose: DriveUploadPurpose;

  /**
   * Polymorphic reference: type of the entity this file is attached to.
   * e.g., 'homework_submission', 'homework_reference', 'exam'
   */
  @Column({ name: 'reference_type', type: 'varchar', length: 100, nullable: true })
  referenceType: string;

  /**
   * Polymorphic reference: ID of the entity this file is attached to.
   */
  @Column({ name: 'reference_id', type: 'bigint', nullable: true })
  referenceId: string;

  /**
   * Sharing permissions that were set on this file.
   * JSON array of { email, role, type }
   */
  @Column({ name: 'sharing_permissions', type: 'text', nullable: true })
  sharingPermissions: string;

  /**
   * Whether this file is still active (soft delete).
   */
  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  /**
   * Whether this file was deleted from Google Drive.
   */
  @Column({ name: 'is_deleted_from_drive', type: 'boolean', default: false })
  isDeletedFromDrive: boolean;

  @Column({ name: 'created_at', type: 'datetime', transformer: dateTransformer })
  createdAt: Date;

  @Column({ name: 'updated_at', type: 'datetime', transformer: dateTransformer })
  updatedAt: Date;

  /**
   * Get Google Drive view URL.
   */
  getViewUrl(): string {
    return `https://drive.google.com/file/d/${this.driveFileId}/view`;
  }

  /**
   * Get Google Drive download URL.
   */
  getDownloadUrl(): string {
    return `https://drive.google.com/uc?export=download&id=${this.driveFileId}`;
  }

  /**
   * Get Google Drive embed URL (for previewing in iframes).
   */
  getEmbedUrl(): string {
    return `https://drive.google.com/file/d/${this.driveFileId}/preview`;
  }

  /**
   * Parse sharing permissions JSON.
   */
  getParsedPermissions(): Array<{ email: string; role: string; type: string }> {
    if (!this.sharingPermissions) return [];
    try {
      return JSON.parse(this.sharingPermissions);
    } catch {
      return [];
    }
  }
}
