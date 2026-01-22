import { IsNotEmpty, IsOptional, IsString, IsEnum, IsUrl, IsNumber, MaxLength, Min, IsInt } from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBigIntId, IsOptionalBigIntId } from '../../../../common/validators/bigint-id.validator';
import { HomeworkReferenceType, HomeworkReferenceSource } from '../entities/institute_class_subject_homework_reference.entity';

/**
 * DTO for creating a homework reference
 * Supports three upload methods:
 * 1. S3 Upload - fileUrl, fileName, fileSize, mimeType
 * 2. Google Drive - driveFileId, driveFileName, driveMimeType, driveFileSize
 * 3. Manual Link - externalUrl, linkTitle
 */
export class CreateHomeworkReferenceDto {
  @ApiProperty({
    description: 'Homework ID this reference belongs to',
    example: '123',
  })
  @IsNotEmpty()
  @IsBigIntId()
  homeworkId: string;

  @ApiProperty({
    description: 'Title of the reference material',
    example: 'Chapter 1 Video Lecture',
    maxLength: 255,
  })
  @IsNotEmpty()
  @IsString()
  @MaxLength(255)
  title: string;

  @ApiPropertyOptional({
    description: 'Description of the reference material',
    example: 'This video covers all concepts from chapter 1',
  })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({
    description: 'Type of reference material',
    enum: HomeworkReferenceType,
    example: HomeworkReferenceType.VIDEO,
  })
  @IsNotEmpty()
  @IsEnum(HomeworkReferenceType)
  referenceType: HomeworkReferenceType;

  @ApiProperty({
    description: 'Source of the reference material',
    enum: HomeworkReferenceSource,
    example: HomeworkReferenceSource.S3_UPLOAD,
  })
  @IsNotEmpty()
  @IsEnum(HomeworkReferenceSource)
  referenceSource: HomeworkReferenceSource;

  @ApiPropertyOptional({
    description: 'Display order (lower numbers appear first)',
    example: 1,
    default: 0,
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Transform(({ value }) => parseInt(value, 10))
  displayOrder?: number;

  // ========== S3 UPLOAD FIELDS ==========

  @ApiPropertyOptional({
    description: 'S3 file URL (relative path or full URL)',
    example: 'homework-references/123/video.mp4',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  fileUrl?: string;

  @ApiPropertyOptional({
    description: 'Original file name',
    example: 'chapter1-lecture.mp4',
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  fileName?: string;

  @ApiPropertyOptional({
    description: 'File size in bytes',
    example: 52428800,
  })
  @IsOptional()
  @IsNumber()
  @Transform(({ value }) => value ? parseInt(value, 10) : value)
  fileSize?: number;

  @ApiPropertyOptional({
    description: 'MIME type of the file',
    example: 'video/mp4',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  mimeType?: string;

  // ========== GOOGLE DRIVE FIELDS ==========

  @ApiPropertyOptional({
    description: 'Google Drive file ID',
    example: '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms',
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  driveFileId?: string;

  @ApiPropertyOptional({
    description: 'Google Drive file name',
    example: 'Chapter 1 Notes.pdf',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  driveFileName?: string;

  @ApiPropertyOptional({
    description: 'Google Drive file MIME type',
    example: 'application/pdf',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  driveMimeType?: string;

  @ApiPropertyOptional({
    description: 'Google Drive file size in bytes',
    example: 1048576,
  })
  @IsOptional()
  @IsNumber()
  @Transform(({ value }) => value ? parseInt(value, 10) : value)
  driveFileSize?: number;

  // ========== MANUAL LINK FIELDS ==========

  @ApiPropertyOptional({
    description: 'External URL for manual links',
    example: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
  })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  externalUrl?: string;

  @ApiPropertyOptional({
    description: 'Title for the external link',
    example: 'YouTube Tutorial Video',
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  linkTitle?: string;

  // ========== VIDEO SPECIFIC FIELDS ==========

  @ApiPropertyOptional({
    description: 'Video duration in seconds',
    example: 3600,
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Transform(({ value }) => value ? parseInt(value, 10) : value)
  videoDuration?: number;

  @ApiPropertyOptional({
    description: 'Thumbnail URL for videos',
    example: 'homework-references/123/thumbnail.jpg',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  thumbnailUrl?: string;
}

/**
 * DTO for uploading reference via Google Drive
 * Used when teacher wants to link a file from their Google Drive
 */
export class CreateHomeworkReferenceGoogleDriveDto {
  @ApiProperty({
    description: 'Homework ID this reference belongs to',
    example: '123',
  })
  @IsNotEmpty()
  @IsBigIntId()
  homeworkId: string;

  @ApiProperty({
    description: 'Title of the reference material',
    example: 'Chapter 1 Video from Drive',
    maxLength: 255,
  })
  @IsNotEmpty()
  @IsString()
  @MaxLength(255)
  title: string;

  @ApiPropertyOptional({
    description: 'Description of the reference material',
  })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({
    description: 'Type of reference material',
    enum: HomeworkReferenceType,
    example: HomeworkReferenceType.VIDEO,
  })
  @IsNotEmpty()
  @IsEnum(HomeworkReferenceType)
  referenceType: HomeworkReferenceType;

  @ApiProperty({
    description: 'Google Drive file ID',
    example: '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms',
  })
  @IsNotEmpty()
  @IsString()
  driveFileId: string;

  @ApiProperty({
    description: 'Google OAuth access token',
    example: 'ya29.a0AfH6SMBx...',
  })
  @IsNotEmpty()
  @IsString()
  accessToken: string;

  @ApiPropertyOptional({
    description: 'Display order',
    default: 0,
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Transform(({ value }) => value ? parseInt(value, 10) : value)
  displayOrder?: number;

  @ApiPropertyOptional({
    description: 'Video duration in seconds (for video types)',
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Transform(({ value }) => value ? parseInt(value, 10) : value)
  videoDuration?: number;
}

/**
 * DTO for creating a manual link reference
 */
export class CreateHomeworkReferenceLinkDto {
  @ApiProperty({
    description: 'Homework ID this reference belongs to',
    example: '123',
  })
  @IsNotEmpty()
  @IsBigIntId()
  homeworkId: string;

  @ApiProperty({
    description: 'Title of the reference',
    example: 'YouTube Tutorial',
    maxLength: 255,
  })
  @IsNotEmpty()
  @IsString()
  @MaxLength(255)
  title: string;

  @ApiPropertyOptional({
    description: 'Description of the reference',
  })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({
    description: 'Type of reference material',
    enum: HomeworkReferenceType,
    example: HomeworkReferenceType.VIDEO,
  })
  @IsNotEmpty()
  @IsEnum(HomeworkReferenceType)
  referenceType: HomeworkReferenceType;

  @ApiProperty({
    description: 'External URL',
    example: 'https://www.youtube.com/watch?v=example',
  })
  @IsNotEmpty()
  @IsUrl()
  @MaxLength(1000)
  externalUrl: string;

  @ApiPropertyOptional({
    description: 'Display title for the link',
    example: 'Watch on YouTube',
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  linkTitle?: string;

  @ApiPropertyOptional({
    description: 'Display order',
    default: 0,
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Transform(({ value }) => value ? parseInt(value, 10) : value)
  displayOrder?: number;

  @ApiPropertyOptional({
    description: 'Video duration in seconds (for video links)',
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Transform(({ value }) => value ? parseInt(value, 10) : value)
  videoDuration?: number;

  @ApiPropertyOptional({
    description: 'Thumbnail URL',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  thumbnailUrl?: string;
}

/**
 * DTO for generating S3 signed upload URL
 */
export class GenerateReferenceUploadUrlDto {
  @ApiProperty({
    description: 'Homework ID this reference will belong to',
    example: '123',
  })
  @IsNotEmpty()
  @IsBigIntId()
  homeworkId: string;

  @ApiProperty({
    description: 'Original file name',
    example: 'chapter1-video.mp4',
  })
  @IsNotEmpty()
  @IsString()
  @MaxLength(255)
  fileName: string;

  @ApiProperty({
    description: 'MIME type of the file',
    example: 'video/mp4',
  })
  @IsNotEmpty()
  @IsString()
  @MaxLength(100)
  contentType: string;

  @ApiProperty({
    description: 'File size in bytes',
    example: 52428800,
  })
  @IsNotEmpty()
  @IsNumber()
  @Transform(({ value }) => parseInt(value, 10))
  fileSize: number;

  @ApiProperty({
    description: 'Type of reference material',
    enum: HomeworkReferenceType,
    example: HomeworkReferenceType.VIDEO,
  })
  @IsNotEmpty()
  @IsEnum(HomeworkReferenceType)
  referenceType: HomeworkReferenceType;
}

/**
 * DTO for confirming S3 upload and creating reference
 */
export class ConfirmReferenceUploadDto {
  @ApiProperty({
    description: 'Homework ID',
    example: '123',
  })
  @IsNotEmpty()
  @IsBigIntId()
  homeworkId: string;

  @ApiProperty({
    description: 'Title of the reference material',
    example: 'Chapter 1 Video Lecture',
  })
  @IsNotEmpty()
  @IsString()
  @MaxLength(255)
  title: string;

  @ApiPropertyOptional({
    description: 'Description',
  })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({
    description: 'Type of reference material',
    enum: HomeworkReferenceType,
  })
  @IsNotEmpty()
  @IsEnum(HomeworkReferenceType)
  referenceType: HomeworkReferenceType;

  @ApiProperty({
    description: 'Relative path of uploaded file',
    example: 'homework-references/123/abc-video.mp4',
  })
  @IsNotEmpty()
  @IsString()
  relativePath: string;

  @ApiProperty({
    description: 'Original file name',
    example: 'chapter1-video.mp4',
  })
  @IsNotEmpty()
  @IsString()
  fileName: string;

  @ApiProperty({
    description: 'File size in bytes',
  })
  @IsNotEmpty()
  @IsNumber()
  @Transform(({ value }) => parseInt(value, 10))
  fileSize: number;

  @ApiProperty({
    description: 'MIME type',
    example: 'video/mp4',
  })
  @IsNotEmpty()
  @IsString()
  mimeType: string;

  @ApiPropertyOptional({
    description: 'Display order',
    default: 0,
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Transform(({ value }) => value ? parseInt(value, 10) : value)
  displayOrder?: number;

  @ApiPropertyOptional({
    description: 'Video duration in seconds',
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Transform(({ value }) => value ? parseInt(value, 10) : value)
  videoDuration?: number;

  @ApiPropertyOptional({
    description: 'Thumbnail URL',
  })
  @IsOptional()
  @IsString()
  thumbnailUrl?: string;
}
