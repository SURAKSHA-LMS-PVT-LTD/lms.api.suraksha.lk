import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsEnum,
  IsBoolean,
  IsInt,
  Min,
  MaxLength,
  MinLength,
} from 'class-validator';
import { Transform } from 'class-transformer';

export class CreateStudyMaterialDto {
  @ApiProperty({ description: 'Institute ID' })
  @IsString()
  @IsNotEmpty()
  @Transform(({ value }) => value?.toString().trim())
  instituteId: string;

  @ApiPropertyOptional({ description: 'Class ID (optional)' })
  @IsOptional()
  @IsString()
  @Transform(({ value }) => value?.toString().trim())
  classId?: string;

  @ApiProperty({ description: 'Subject ID' })
  @IsString()
  @IsNotEmpty()
  @Transform(({ value }) => value?.toString().trim())
  subjectId: string;

  @ApiProperty({ description: 'Material title', minLength: 1, maxLength: 255 })
  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  @MaxLength(255)
  @Transform(({ value }) => value?.trim())
  title: string;

  @ApiPropertyOptional({ description: 'Material description' })
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  @Transform(({ value }) => value?.trim())
  description?: string;

  @ApiPropertyOptional({ enum: ['FILE', 'LINK'], default: 'FILE' })
  @IsOptional()
  @IsEnum(['FILE', 'LINK'])
  materialType?: 'FILE' | 'LINK';

  @ApiPropertyOptional({ description: 'File URL or external link' })
  @IsOptional()
  @IsString()
  fileUrl?: string;

  @ApiPropertyOptional({ description: 'Original file name' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  fileName?: string;

  @ApiPropertyOptional({ description: 'File size in bytes' })
  @IsOptional()
  @IsString()
  fileSize?: string;

  @ApiPropertyOptional({ description: 'MIME type' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  mimeType?: string;

  @ApiPropertyOptional({ description: 'Storage source', default: 'S3' })
  @IsOptional()
  @IsString()
  source?: string;

  @ApiPropertyOptional({ description: 'Google Drive file ID' })
  @IsOptional()
  @IsString()
  driveFileId?: string;

  @ApiPropertyOptional({ description: 'Google Drive web view link' })
  @IsOptional()
  @IsString()
  driveWebViewLink?: string;

  @ApiPropertyOptional({ description: 'Thumbnail URL' })
  @IsOptional()
  @IsString()
  thumbnailUrl?: string;

  @ApiPropertyOptional({ description: 'Allow students to download', default: true })
  @IsOptional()
  @IsBoolean()
  downloadEnabled?: boolean;

  @ApiPropertyOptional({ description: 'Allow students to share', default: false })
  @IsOptional()
  @IsBoolean()
  shareEnabled?: boolean;

  @ApiPropertyOptional({ description: 'Visible to students', default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ description: 'Sort order (lower = first)', default: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;
}
