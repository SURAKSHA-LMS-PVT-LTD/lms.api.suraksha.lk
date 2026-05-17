import {
  IsString, IsNotEmpty, IsOptional, IsEnum,
  IsBoolean, IsNumber, IsArray, ValidateNested,
  IsUrl, ValidateIf, Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type, Transform } from 'class-transformer';

// ─── Enums ────────────────────────────────────────────────────────────────────

export enum RecordingPlatform {
  SYSTEM = 'SYSTEM',
  YOUTUBE = 'YOUTUBE',
  GOOGLE_DRIVE = 'GOOGLE_DRIVE',
  EXTERNAL = 'EXTERNAL',
}

export enum RecordingStatus {
  DRAFT = 'draft',
  PUBLISHED = 'published',
  ARCHIVED = 'archived',
}

export enum RecordingAccessLevel {
  ANYONE = 'ANYONE',
  SURAKSHA_USERS = 'SURAKSHA_USERS',
  ENROLLED_ONLY = 'ENROLLED_ONLY',
  PAID_ONLY = 'PAID_ONLY',
}

// ─── Nested ───────────────────────────────────────────────────────────────────

export class RecordingMaterialDto {
  @ApiProperty() @IsString() @IsNotEmpty() documentName: string;
  @ApiProperty() @IsString() @IsNotEmpty() documentUrl: string;
  @ApiPropertyOptional() @IsOptional() @IsString() driveFileId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() driveWebViewLink?: string;
  @ApiPropertyOptional({
    enum: ['S3', 'GOOGLE_DRIVE', 'GOOGLE_DRIVE_INSTITUTE', 'EXTERNAL_LINK'],
  })
  @IsOptional() @IsString() source?: string;
}

// ─── Create ───────────────────────────────────────────────────────────────────

export class CreateSubjectRecordingDto {
  @ApiProperty({ description: 'Institute UUID' })
  @IsString() @IsNotEmpty()
  instituteId: string;

  @ApiPropertyOptional({ description: 'Class UUID' })
  @IsOptional() @IsString()
  classId?: string;

  @ApiPropertyOptional({ description: 'Subject UUID' })
  @IsOptional() @IsString()
  subjectId?: string;

  @ApiPropertyOptional({ description: 'Uploader / instructor user ID' })
  @IsOptional() @IsString()
  uploadedById?: string;

  @ApiProperty()
  @IsString() @IsNotEmpty()
  title: string;

  @ApiPropertyOptional()
  @IsOptional() @IsString()
  description?: string;

  @ApiProperty({ enum: RecordingPlatform, default: RecordingPlatform.SYSTEM })
  @IsEnum(RecordingPlatform)
  platform: RecordingPlatform;

  @ApiPropertyOptional({ description: 'Direct URL to the recording file / video' })
  @IsOptional()
  @ValidateIf((o) => !!o.recordingUrl)
  @IsUrl()
  recordingUrl?: string;

  @ApiPropertyOptional({ description: 'Duration in seconds' })
  @IsOptional() @IsNumber() @Min(1)
  @Transform(({ value }) => (value ? parseInt(value, 10) : undefined))
  durationSeconds?: number;

  @ApiPropertyOptional()
  @IsOptional() @IsString()
  thumbnailUrl?: string;

  @ApiPropertyOptional({ type: [RecordingMaterialDto] })
  @IsOptional() @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RecordingMaterialDto)
  materials?: RecordingMaterialDto[];

  @ApiPropertyOptional({ enum: RecordingStatus, default: RecordingStatus.DRAFT })
  @IsOptional() @IsEnum(RecordingStatus)
  status?: RecordingStatus;

  @ApiPropertyOptional({ default: true })
  @IsOptional() @IsBoolean()
  isActive?: boolean;

  // ─── Recording tracking ──────────────────────────────────────────────────

  @ApiPropertyOptional({ default: false })
  @IsOptional() @IsBoolean()
  recAttendanceEnabled?: boolean;

  @ApiPropertyOptional({ enum: RecordingAccessLevel, default: RecordingAccessLevel.ENROLLED_ONLY })
  @IsOptional() @IsEnum(RecordingAccessLevel)
  recAccessLevel?: RecordingAccessLevel;

  @ApiPropertyOptional()
  @IsOptional() @IsString()
  recPaymentId?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional() @IsArray()
  recPaymentStatuses?: string[];

  @ApiPropertyOptional()
  @IsOptional() @IsString()
  recEntryBgUrl?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsString()
  recCardImageUrl?: string;

  @ApiPropertyOptional({ description: 'ISO datetime — when rec card image expires' })
  @IsOptional() @IsString()
  recCardImageTtl?: string;

  @ApiPropertyOptional({ description: 'ISO datetime — when rec background image expires' })
  @IsOptional() @IsString()
  recBgImageTtl?: string;

  @ApiPropertyOptional({ description: 'ISO datetime — when the rec URL token expires' })
  @IsOptional() @IsString()
  recUrlExpiresAt?: string;

  // ─── Welcome message ─────────────────────────────────────────────────────

  @ApiPropertyOptional({ default: false })
  @IsOptional() @IsBoolean()
  welcomeMessageEnabled?: boolean;

  @ApiPropertyOptional()
  @IsOptional() @IsString()
  welcomeMessageText?: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional() @IsBoolean()
  welcomeMessageVoiceEnabled?: boolean;
}

// ─── Update (all fields optional) ────────────────────────────────────────────

export class UpdateSubjectRecordingDto extends PartialType(CreateSubjectRecordingDto) {}

// ─── Query / list ─────────────────────────────────────────────────────────────

export class QuerySubjectRecordingDto {
  @ApiPropertyOptional() @IsOptional() @IsString() instituteId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() classId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() subjectId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() uploadedById?: string;
  @ApiPropertyOptional({ enum: RecordingStatus }) @IsOptional() @IsEnum(RecordingStatus) status?: RecordingStatus;
  @ApiPropertyOptional({ enum: RecordingPlatform }) @IsOptional() @IsEnum(RecordingPlatform) platform?: RecordingPlatform;
  @ApiPropertyOptional() @IsOptional() @IsBoolean()
  @Transform(({ value }) => value === 'true' || value === true)
  isActive?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsString() search?: string;
  @ApiPropertyOptional({ default: 1 }) @IsOptional() @IsNumber()
  @Transform(({ value }) => parseInt(value, 10) || 1)
  page?: number;
  @ApiPropertyOptional({ default: 20 }) @IsOptional() @IsNumber()
  @Transform(({ value }) => parseInt(value, 10) || 20)
  limit?: number;
}
