import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsEnum,
  IsNumber,
  IsPositive,
  MaxLength,
  IsInt,
  Min,
  Max,
} from 'class-validator';
import { Type } from 'class-transformer';
import { InstituteDriveFileEntity } from '../entities/institute-drive-file.entity';
import { InstituteDriveTokenEntity } from '../entities/institute-drive-token.entity';

// ─── Upload Purposes ────────────────────────────────────────────────────────

/**
 * What kind of content is being uploaded to the institute drive.
 * Determines the sub-folder inside the institute / grade / class tree.
 */
export enum InstituteDrivePurpose {
  LECTURE_DOCUMENT = 'LECTURE_DOCUMENT',
  LECTURE_RECORDING = 'LECTURE_RECORDING',
  HOMEWORK_REFERENCE = 'HOMEWORK_REFERENCE',
  HOMEWORK_SUBMISSION = 'HOMEWORK_SUBMISSION',
  HOMEWORK_CORRECTION = 'HOMEWORK_CORRECTION',
  EXAM_DOCUMENT = 'EXAM_DOCUMENT',
  GENERAL = 'GENERAL',
}

/** Human-readable folder name for each purpose (used in Drive path). */
export const INSTITUTE_DRIVE_FOLDER_NAMES: Record<InstituteDrivePurpose, string> = {
  [InstituteDrivePurpose.LECTURE_DOCUMENT]: 'Lecture Documents',
  [InstituteDrivePurpose.LECTURE_RECORDING]: 'Lecture Recordings',
  [InstituteDrivePurpose.HOMEWORK_REFERENCE]: 'Homework Questions',
  [InstituteDrivePurpose.HOMEWORK_SUBMISSION]: 'Homework Submissions',
  [InstituteDrivePurpose.HOMEWORK_CORRECTION]: 'Homework Corrections',
  [InstituteDrivePurpose.EXAM_DOCUMENT]: 'Exam Documents',
  [InstituteDrivePurpose.GENERAL]: 'General',
};

// ─── Connection DTOs ─────────────────────────────────────────────────────────

export class InstituteDriveStatusDto {
  @ApiProperty()
  isConnected: boolean;

  @ApiPropertyOptional()
  googleEmail?: string;

  @ApiPropertyOptional()
  googleDisplayName?: string;

  @ApiPropertyOptional()
  googleProfilePicture?: string;

  @ApiPropertyOptional()
  connectedAt?: string;

  @ApiPropertyOptional()
  lastUsedAt?: string;

  static fromEntity(entity: InstituteDriveTokenEntity | null): InstituteDriveStatusDto {
    if (!entity || !entity.isActive) {
      return { isConnected: false };
    }
    return {
      isConnected: true,
      googleEmail: entity.googleEmail,
      googleDisplayName: entity.googleDisplayName,
      googleProfilePicture: entity.googleProfilePicture,
      connectedAt: entity.createdAt?.toISOString(),
      lastUsedAt: entity.lastUsedAt?.toISOString(),
    };
  }
}

export class InstituteDriveAuthUrlDto {
  @ApiProperty({ description: 'Redirect user here to grant Google Drive access for the institute' })
  authUrl: string;

  @ApiProperty()
  state: string;
}

// ─── Token dispensing ────────────────────────────────────────────────────────

export class InstituteDriveAccessTokenDto {
  @ApiProperty({ description: 'Short-lived (~1 h) Google access token. Upload directly to Drive with this.' })
  accessToken: string;

  @ApiProperty()
  expiresIn: number;

  @ApiProperty()
  expiresAt: string;

  @ApiProperty({ description: 'Google Drive account email (for display)' })
  googleEmail: string;

  @ApiProperty({ description: 'Google OAuth client ID — needed for gapi / Google Picker' })
  clientId: string;
}

// ─── Folder DTOs ─────────────────────────────────────────────────────────────

export class GetInstituteFolderDto {
  @ApiProperty({ enum: InstituteDrivePurpose })
  @IsEnum(InstituteDrivePurpose)
  purpose: InstituteDrivePurpose;

  @ApiPropertyOptional({ description: 'Grade level (1–13)', example: 10 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(13)
  grade?: number;

  @ApiPropertyOptional({ description: 'Class name, e.g. "10A"', example: '10A' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  className?: string;

  @ApiPropertyOptional({ description: 'Subject name, e.g. "Mathematics"', example: 'Mathematics' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  subjectName?: string;
}

export class InstituteFolderResponseDto {
  @ApiProperty()
  folderId: string;

  @ApiProperty({ description: 'Full human-readable path of the target folder on Drive' })
  folderPath: string;
}

// ─── File Registration ───────────────────────────────────────────────────────

export class RegisterInstituteDriveFileDto {
  @ApiProperty({ description: 'Google Drive file ID returned after direct upload' })
  @IsString()
  @IsNotEmpty()
  driveFileId: string;

  @ApiProperty({ enum: InstituteDrivePurpose })
  @IsEnum(InstituteDrivePurpose)
  purpose: InstituteDrivePurpose;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  referenceType?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  referenceId?: string;

  @ApiPropertyOptional({ example: 'Mathematics', description: 'Subject name (for folder path record)' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  subjectName?: string;

  @ApiPropertyOptional({ example: '10A', description: 'Class name (for folder path record)' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  className?: string;

  @ApiPropertyOptional({ example: 10, description: 'Grade level' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(13)
  grade?: number;
}

// ─── File Response ────────────────────────────────────────────────────────────

export class InstituteDriveFileResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  driveFileId: string;

  @ApiPropertyOptional()
  driveWebViewLink?: string;

  @ApiPropertyOptional()
  driveWebContentLink?: string;

  @ApiProperty()
  fileName: string;

  @ApiProperty()
  mimeType: string;

  @ApiPropertyOptional()
  fileSize?: number;

  @ApiProperty()
  purpose: string;

  @ApiPropertyOptional()
  referenceType?: string;

  @ApiPropertyOptional()
  referenceId?: string;

  @ApiPropertyOptional()
  subjectName?: string;

  @ApiPropertyOptional()
  className?: string;

  @ApiPropertyOptional()
  grade?: number;

  @ApiPropertyOptional()
  driveFolderPath?: string;

  @ApiProperty()
  uploadedBy: string;

  @ApiProperty()
  uploadedAt: string;

  static fromEntity(
    entity: InstituteDriveFileEntity,
  ): InstituteDriveFileResponseDto {
    return {
      id: entity.id,
      driveFileId: entity.driveFileId,
      driveWebViewLink: entity.driveWebViewLink,
      driveWebContentLink: entity.driveWebContentLink,
      fileName: entity.fileName,
      mimeType: entity.mimeType,
      fileSize: entity.fileSize,
      purpose: entity.purpose,
      referenceType: entity.referenceType,
      referenceId: entity.referenceId,
      subjectName: entity.subjectName,
      className: entity.className,
      grade: entity.grade,
      driveFolderPath: entity.driveFolderPath,
      uploadedBy: entity.uploadedByUserId,
      uploadedAt: entity.uploadedAt?.toISOString(),
    };
  }
}

export class InstituteDriveFileListResponseDto {
  @ApiProperty({ type: [InstituteDriveFileResponseDto] })
  data: InstituteDriveFileResponseDto[];

  @ApiProperty()
  total: number;

  @ApiProperty()
  page: number;

  @ApiProperty()
  limit: number;

  @ApiProperty()
  totalPages: number;
}

// ─── Query ────────────────────────────────────────────────────────────────────

export class InstituteDriveFileQueryDto {
  @ApiPropertyOptional({ enum: InstituteDrivePurpose })
  @IsOptional()
  @IsEnum(InstituteDrivePurpose)
  purpose?: InstituteDrivePurpose;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  referenceType?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  referenceId?: string;

  @ApiPropertyOptional({ example: 10 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  grade?: number;

  @ApiPropertyOptional({ example: '10A' })
  @IsOptional()
  @IsString()
  className?: string;

  @ApiPropertyOptional({ example: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ example: 20, default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;
}
