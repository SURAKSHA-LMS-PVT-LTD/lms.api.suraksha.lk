import { IsOptional, IsString, IsEnum, IsNumber, IsBoolean, MaxLength, Min, IsInt } from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { HomeworkReferenceType, HomeworkReferenceSource } from '../entities/institute_class_subject_homework_reference.entity';

/**
 * DTO for updating a homework reference
 * All fields are optional - only provided fields will be updated
 */
export class UpdateHomeworkReferenceDto {
  @ApiPropertyOptional({
    description: 'Title of the reference material',
    example: 'Updated Chapter 1 Video',
    maxLength: 255,
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  title?: string;

  @ApiPropertyOptional({
    description: 'Description of the reference material',
  })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({
    description: 'Type of reference material',
    enum: HomeworkReferenceType,
  })
  @IsOptional()
  @IsEnum(HomeworkReferenceType)
  referenceType?: HomeworkReferenceType;

  @ApiPropertyOptional({
    description: 'Display order (lower numbers appear first)',
    example: 1,
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Transform(({ value }) => parseInt(value, 10))
  displayOrder?: number;

  // ========== S3 UPLOAD FIELDS ==========

  @ApiPropertyOptional({
    description: 'S3 file URL (relative path or full URL)',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  fileUrl?: string;

  @ApiPropertyOptional({
    description: 'Original file name',
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  fileName?: string;

  @ApiPropertyOptional({
    description: 'File size in bytes',
  })
  @IsOptional()
  @IsNumber()
  @Transform(({ value }) => value ? parseInt(value, 10) : value)
  fileSize?: number;

  @ApiPropertyOptional({
    description: 'MIME type of the file',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  mimeType?: string;

  // ========== GOOGLE DRIVE FIELDS ==========

  @ApiPropertyOptional({
    description: 'Google Drive file ID',
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  driveFileId?: string;

  @ApiPropertyOptional({
    description: 'Google Drive file name',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  driveFileName?: string;

  @ApiPropertyOptional({
    description: 'Google Drive file MIME type',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  driveMimeType?: string;

  @ApiPropertyOptional({
    description: 'Google Drive file size in bytes',
  })
  @IsOptional()
  @IsNumber()
  @Transform(({ value }) => value ? parseInt(value, 10) : value)
  driveFileSize?: number;

  // ========== MANUAL LINK FIELDS ==========

  @ApiPropertyOptional({
    description: 'External URL for manual links',
  })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  externalUrl?: string;

  @ApiPropertyOptional({
    description: 'Title for the external link',
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  linkTitle?: string;

  // ========== VIDEO SPECIFIC FIELDS ==========

  @ApiPropertyOptional({
    description: 'Video duration in seconds',
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Transform(({ value }) => value ? parseInt(value, 10) : value)
  videoDuration?: number;

  @ApiPropertyOptional({
    description: 'Thumbnail URL for videos',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  thumbnailUrl?: string;

  // ========== STATUS ==========

  @ApiPropertyOptional({
    description: 'Whether the reference is active',
    default: true,
  })
  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === 'true' || value === true)
  isActive?: boolean;
}

/**
 * DTO for bulk reordering references
 */
export class ReorderReferencesDto {
  @ApiPropertyOptional({
    description: 'Array of reference IDs in desired order',
    example: ['3', '1', '2'],
    type: [String],
  })
  referenceIds: string[];
}
