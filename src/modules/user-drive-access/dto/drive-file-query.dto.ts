import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsEnum } from 'class-validator';
import { Type } from 'class-transformer';

/**
 * Query DTO for listing user's Drive files.
 */
export class DriveFileQueryDto {
  @ApiPropertyOptional({ description: 'Filter by purpose', example: 'HOMEWORK_SUBMISSION' })
  @IsOptional()
  @IsString()
  purpose?: string;

  @ApiPropertyOptional({ description: 'Filter by reference type', example: 'homework_submission' })
  @IsOptional()
  @IsString()
  referenceType?: string;

  @ApiPropertyOptional({ description: 'Filter by reference ID', example: '42' })
  @IsOptional()
  @IsString()
  referenceId?: string;

  @ApiPropertyOptional({ description: 'Page number', example: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  page?: number = 1;

  @ApiPropertyOptional({ description: 'Items per page', example: 20, default: 20 })
  @IsOptional()
  @Type(() => Number)
  limit?: number = 20;
}

/**
 * Response DTO for a single Drive file in list.
 */
export class DriveFileResponseDto {
  @ApiProperty({ description: 'Internal file record ID' })
  id: string;

  @ApiProperty({ description: 'Google Drive file ID' })
  driveFileId: string;

  @ApiProperty({ description: 'File name' })
  fileName: string;

  @ApiProperty({ description: 'MIME type' })
  mimeType: string;

  @ApiPropertyOptional({ description: 'File size in bytes' })
  fileSize?: number;

  @ApiProperty({ description: 'View URL' })
  viewUrl: string;

  @ApiProperty({ description: 'Embed URL for preview' })
  embedUrl: string;

  @ApiProperty({ description: 'Download URL' })
  downloadUrl: string;

  @ApiProperty({ description: 'Purpose' })
  purpose: string;

  @ApiPropertyOptional({ description: 'Reference type' })
  referenceType?: string;

  @ApiPropertyOptional({ description: 'Reference ID' })
  referenceId?: string;

  @ApiProperty({ description: 'Upload date' })
  createdAt: string;

  static fromEntity(entity: any): DriveFileResponseDto {
    return {
      id: entity.id,
      driveFileId: entity.driveFileId,
      fileName: entity.fileName,
      mimeType: entity.mimeType,
      fileSize: entity.fileSize,
      viewUrl: `https://drive.google.com/file/d/${entity.driveFileId}/view`,
      embedUrl: `https://drive.google.com/file/d/${entity.driveFileId}/preview`,
      downloadUrl: `https://drive.google.com/uc?export=download&id=${entity.driveFileId}`,
      purpose: entity.purpose,
      referenceType: entity.referenceType,
      referenceId: entity.referenceId,
      createdAt: entity.createdAt?.toISOString?.() ?? entity.createdAt,
    };
  }
}

/**
 * Paginated response for Drive files.
 */
export class DriveFileListResponseDto {
  @ApiProperty({ description: 'List of files', type: [DriveFileResponseDto] })
  data: DriveFileResponseDto[];

  @ApiProperty({ description: 'Total number of files' })
  total: number;

  @ApiProperty({ description: 'Current page' })
  page: number;

  @ApiProperty({ description: 'Items per page' })
  limit: number;

  @ApiProperty({ description: 'Total pages' })
  totalPages: number;
}
