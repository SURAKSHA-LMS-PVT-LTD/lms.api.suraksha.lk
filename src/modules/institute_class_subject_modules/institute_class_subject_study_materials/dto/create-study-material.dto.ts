import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsEnum,
  IsBoolean,
  IsInt,
  IsIn,
  Min,
  MaxLength,
  MinLength,
  Matches,
  IsUrl,
  ValidateIf,
} from 'class-validator';
import { Transform } from 'class-transformer';

export class CreateStudyMaterialDto {
  @ApiProperty({ description: 'Institute ID' })
  @IsString()
  @IsNotEmpty()
  @Transform(({ value }) => value?.toString().trim())
  instituteId: string;

  @ApiPropertyOptional({ description: 'Class ID' })
  @IsOptional()
  @IsString()
  @Transform(({ value }) => value?.toString().trim())
  classId?: string;

  @ApiPropertyOptional({ description: 'Subject ID (optional, class-level if omitted)' })
  @IsOptional()
  @IsString()
  @Transform(({ value }) => value?.toString().trim())
  subjectId?: string;

  @ApiPropertyOptional({ description: 'Folder ID to place material in' })
  @IsOptional()
  @IsString()
  @Transform(({ value }) => value?.toString().trim())
  folderId?: string;

  @ApiPropertyOptional({ enum: ['ANYONE', 'ENROLLED_ONLY', 'PAID_ONLY'], default: 'ENROLLED_ONLY' })
  @IsOptional()
  @IsEnum(['ANYONE', 'ENROLLED_ONLY', 'PAID_ONLY'])
  accessLevel?: 'ANYONE' | 'ENROLLED_ONLY' | 'PAID_ONLY';

  @ApiPropertyOptional({ description: 'Class payment ID required (when accessLevel=PAID_ONLY)' })
  @IsOptional()
  @IsString()
  @Transform(({ value }) => value?.toString().trim())
  requiredPaymentId?: string;

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

  @ApiPropertyOptional({
    description: 'Storage source',
    enum: ['GOOGLE_DRIVE', 'GOOGLE_DRIVE_INSTITUTE', 'EXTERNAL_LINK'],
    default: 'GOOGLE_DRIVE',
  })
  @IsOptional()
  @IsIn(['GOOGLE_DRIVE', 'GOOGLE_DRIVE_INSTITUTE', 'EXTERNAL_LINK'])
  source?: string;

  @ApiPropertyOptional({ description: 'Google Drive file ID' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  @Matches(/^[a-zA-Z0-9_-]+$/, { message: 'Invalid Google Drive file ID format' })
  driveFileId?: string;

  @ApiPropertyOptional({ description: 'Google Drive web view link' })
  @IsOptional()
  @IsString()
  @ValidateIf(o => o.driveWebViewLink && o.driveWebViewLink.length > 0)
  @Matches(/^https:\/\/drive\.google\.com\//, { message: 'Must be a Google Drive URL' })
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
