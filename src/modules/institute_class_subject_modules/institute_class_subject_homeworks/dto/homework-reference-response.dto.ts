import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { HomeworkReferenceType, HomeworkReferenceSource, InstituteClassSubjectHomeworkReference } from '../entities/institute_class_subject_homework_reference.entity';
import { CloudStorageService } from '../../../../common/services/cloud-storage.service';

/**
 * Response DTO for homework reference
 * Includes computed URLs (viewUrl, driveViewUrl, driveDownloadUrl, driveEmbedUrl)
 */
export class HomeworkReferenceResponseDto {
  @ApiProperty({ description: 'Reference ID', example: '1' })
  id: string;

  @ApiProperty({ description: 'Homework ID', example: '123' })
  homeworkId: string;

  @ApiPropertyOptional({ description: 'Uploaded by user ID' })
  uploadedById?: string;

  @ApiProperty({ description: 'Title', example: 'Chapter 1 Video' })
  title: string;

  @ApiPropertyOptional({ description: 'Description' })
  description?: string;

  @ApiProperty({ description: 'Reference type', enum: HomeworkReferenceType })
  referenceType: HomeworkReferenceType;

  @ApiProperty({ description: 'Reference source', enum: HomeworkReferenceSource })
  referenceSource: HomeworkReferenceSource;

  @ApiProperty({ description: 'Display order', example: 0 })
  displayOrder: number;

  // ========== S3 FIELDS ==========

  @ApiPropertyOptional({ description: 'File URL (full URL)' })
  fileUrl?: string;

  @ApiPropertyOptional({ description: 'File name' })
  fileName?: string;

  @ApiPropertyOptional({ description: 'File size in bytes' })
  fileSize?: number;

  @ApiPropertyOptional({ description: 'MIME type' })
  mimeType?: string;

  // ========== GOOGLE DRIVE FIELDS ==========

  @ApiPropertyOptional({ description: 'Google Drive file ID' })
  driveFileId?: string;

  @ApiPropertyOptional({ description: 'Google Drive file name' })
  driveFileName?: string;

  @ApiPropertyOptional({ description: 'Google Drive MIME type' })
  driveMimeType?: string;

  @ApiPropertyOptional({ description: 'Google Drive file size' })
  driveFileSize?: number;

  // ========== MANUAL LINK FIELDS ==========

  @ApiPropertyOptional({ description: 'External URL' })
  externalUrl?: string;

  @ApiPropertyOptional({ description: 'Link title' })
  linkTitle?: string;

  // ========== VIDEO FIELDS ==========

  @ApiPropertyOptional({ description: 'Video duration in seconds' })
  videoDuration?: number;

  @ApiPropertyOptional({ description: 'Thumbnail URL (full URL)' })
  thumbnailUrl?: string;

  // ========== COMPUTED URLs ==========

  @ApiPropertyOptional({ description: 'Primary viewable URL' })
  viewUrl?: string;

  @ApiPropertyOptional({ description: 'Google Drive view URL' })
  driveViewUrl?: string;

  @ApiPropertyOptional({ description: 'Google Drive download URL' })
  driveDownloadUrl?: string;

  @ApiPropertyOptional({ description: 'Google Drive embed URL (for videos)' })
  driveEmbedUrl?: string;

  // ========== STATUS & TIMESTAMPS ==========

  @ApiProperty({ description: 'Is active', example: true })
  isActive: boolean;

  @ApiPropertyOptional({ description: 'Created at timestamp' })
  createdAt?: Date;

  @ApiPropertyOptional({ description: 'Updated at timestamp' })
  updatedAt?: Date;

  // ========== UPLOADER INFO ==========

  @ApiPropertyOptional({ description: 'Uploader information' })
  uploadedBy?: {
    id: string;
    nameWithInitials?: string;
    email?: string;
  };

  /**
   * Transform entity to response DTO with computed URLs
   */
  static fromEntity(
    entity: InstituteClassSubjectHomeworkReference,
    cloudStorageService: CloudStorageService
  ): HomeworkReferenceResponseDto {
    const dto = new HomeworkReferenceResponseDto();

    dto.id = entity.id;
    dto.homeworkId = entity.homeworkId;
    dto.uploadedById = entity.uploadedById;
    dto.title = entity.title;
    dto.description = entity.description;
    dto.referenceType = entity.referenceType;
    dto.referenceSource = entity.referenceSource;
    dto.displayOrder = entity.displayOrder;

    // S3 fields - transform relative URL to full URL
    dto.fileUrl = entity.fileUrl ? cloudStorageService.getFullUrl(entity.fileUrl) : undefined;
    dto.fileName = entity.fileName;
    dto.fileSize = entity.fileSize;
    dto.mimeType = entity.mimeType;

    // Google Drive fields
    dto.driveFileId = entity.driveFileId;
    dto.driveFileName = entity.driveFileName;
    dto.driveMimeType = entity.driveMimeType;
    dto.driveFileSize = entity.driveFileSize;

    // Manual link fields
    dto.externalUrl = entity.externalUrl;
    dto.linkTitle = entity.linkTitle;

    // Video fields
    dto.videoDuration = entity.videoDuration;
    dto.thumbnailUrl = entity.thumbnailUrl ? cloudStorageService.getFullUrl(entity.thumbnailUrl) : undefined;

    // Computed URLs
    dto.viewUrl = entity.getViewUrl();
    if (entity.referenceSource === HomeworkReferenceSource.S3_UPLOAD && entity.fileUrl) {
      dto.viewUrl = cloudStorageService.getFullUrl(entity.fileUrl);
    }
    dto.driveViewUrl = entity.driveFileId ? `https://drive.google.com/file/d/${entity.driveFileId}/view` : undefined;
    dto.driveDownloadUrl = entity.getDriveDownloadUrl() || undefined;
    dto.driveEmbedUrl = entity.getDriveEmbedUrl() || undefined;

    // Status & timestamps
    dto.isActive = entity.isActive;
    dto.createdAt = entity.createdAt;
    dto.updatedAt = entity.updatedAt;

    // Uploader info
    if (entity.uploadedBy) {
      dto.uploadedBy = {
        id: entity.uploadedBy.id,
        nameWithInitials: entity.uploadedBy.nameWithInitials || undefined,
        email: entity.uploadedBy.email || undefined,
      };
    }

    return dto;
  }
}

/**
 * Paginated response for homework references
 */
export class PaginatedHomeworkReferenceResponseDto {
  @ApiProperty({ type: [HomeworkReferenceResponseDto] })
  data: HomeworkReferenceResponseDto[];

  @ApiProperty({ description: 'Total count', example: 100 })
  total: number;

  @ApiProperty({ description: 'Current page', example: 1 })
  page: number;

  @ApiProperty({ description: 'Items per page', example: 10 })
  limit: number;

  @ApiProperty({ description: 'Total pages', example: 10 })
  totalPages: number;

  @ApiProperty({ description: 'Has next page', example: true })
  hasNext: boolean;

  @ApiProperty({ description: 'Has previous page', example: false })
  hasPrev: boolean;
}

/**
 * Response for signed upload URL generation
 */
export class GenerateUploadUrlResponseDto {
  @ApiProperty({ description: 'Signed upload URL' })
  uploadUrl: string;

  @ApiProperty({ description: 'Relative path to use when confirming upload' })
  relativePath: string;

  @ApiProperty({ description: 'Fields to include in form upload (for POST)' })
  fields: Record<string, string>;

  @ApiProperty({ description: 'URL expiration time in seconds', example: 3600 })
  expiresIn: number;

  @ApiProperty({ description: 'Maximum file size in bytes' })
  maxFileSize: number;
}

/**
 * Summary of references by type for a homework
 */
export class HomeworkReferenceSummaryDto {
  @ApiProperty({ description: 'Total references count' })
  total: number;

  @ApiProperty({ description: 'Count by type' })
  byType: {
    [key in HomeworkReferenceType]?: number;
  };

  @ApiProperty({ description: 'Count by source' })
  bySource: {
    [key in HomeworkReferenceSource]?: number;
  };
}
