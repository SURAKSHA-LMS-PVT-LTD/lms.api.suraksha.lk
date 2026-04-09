import { IsBigIntId, IsOptionalBigIntId } from '../../../../common/validators/bigint-id.validator';
import { IsString, IsNotEmpty, IsOptional, IsEnum, IsDateString, IsBoolean, IsNumber, IsUrl, ValidateNested, IsArray, ValidateIf } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';

export enum LectureType {
  ONLINE = 'online',
  PHYSICAL = 'physical',
  HYBRID = 'hybrid',
}

export enum LectureStatus {
  SCHEDULED = 'scheduled',
  LIVE = 'live',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
}

export class LectureMaterialDto {
  @ApiProperty({ description: 'Display name for the material' })
  @IsString()
  @IsNotEmpty()
  documentName: string;

  @ApiProperty({ description: 'URL or relative path to the material' })
  @IsString()
  @IsNotEmpty()
  documentUrl: string;

  @ApiProperty({ description: 'Google Drive file ID (if from Drive)', required: false })
  @IsOptional()
  @IsString()
  driveFileId?: string;

  @ApiProperty({ description: 'Google Drive web view link', required: false })
  @IsOptional()
  @IsString()
  driveWebViewLink?: string;

  @ApiProperty({
    description: 'Upload source',
    enum: ['S3', 'GOOGLE_DRIVE', 'GOOGLE_DRIVE_INSTITUTE', 'EXTERNAL_LINK'],
    required: false,
  })
  @IsOptional()
  @IsString()
  source?: string;
}

export class CreateInstituteClassSubjectLectureDto {
  @ApiProperty({ description: 'Institute ID' })
  @IsString()
  @IsNotEmpty()
  instituteId: string;

  @ApiProperty({ description: 'Class ID', required: false })
  @IsOptionalBigIntId()
  classId?: string;

  @ApiProperty({ description: 'Subject ID' })
  @IsString()
  @IsNotEmpty()
  subjectId: string;

  @ApiProperty({ description: 'Instructor/Teacher ID' })
  @IsString()
  @IsNotEmpty()
  instructorId: string;

  @ApiProperty({ description: 'Lecture title' })
  @IsString()
  @IsNotEmpty()
  title: string;

  @ApiProperty({ description: 'Lecture description', required: false })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ enum: LectureType, description: 'Type of lecture', default: LectureType.PHYSICAL })
  @IsEnum(LectureType)
  lectureType: LectureType;

  @ApiProperty({ description: 'Physical venue (for physical/hybrid lectures)', required: false })
  @IsOptional()
  @IsString()
  venue?: string;

  @ApiProperty({ description: 'Lecture start time (ISO string)' })
  @IsDateString()
  startTime: string;

  @ApiProperty({ description: 'Lecture end time (ISO string)' })
  @IsDateString()
  endTime: string;

  @ApiProperty({ enum: LectureStatus, description: 'Lecture status', default: LectureStatus.SCHEDULED })
  @IsOptional()
  @IsEnum(LectureStatus)
  status?: LectureStatus;

  @ApiProperty({ description: 'Meeting link (for online/hybrid lectures)', required: false })
  @IsOptional()
  @ValidateIf((o) => o.meetingLink !== null && o.meetingLink !== undefined && o.meetingLink !== '')
  @IsUrl()
  meetingLink?: string;

  @ApiProperty({ description: 'Meeting ID', required: false })
  @IsOptionalBigIntId()
  meetingId?: string;

  @ApiProperty({ description: 'Meeting password', required: false })
  @IsOptional()
  @IsString()
  meetingPassword?: string;

  @ApiProperty({ description: 'Recording URL', required: false })
  @IsOptional()
  @ValidateIf((o) => {
    const url = o.recordingUrl || o.recodingUrl;
    return url !== null && url !== undefined && url !== '';
  })
  @IsUrl()
  @Transform(({ obj }) => {
    // Handle common typo: recodingUrl -> recordingUrl
    const url = obj.recodingUrl || obj.recordingUrl;
    // Return null for empty strings to avoid validation issues
    return url && url.trim() !== '' ? url : null;
  })
  recordingUrl?: string;

  @ApiProperty({ description: 'Is lecture recorded', default: false })
  @IsOptional()
  @IsBoolean()
  isRecorded?: boolean;

  @ApiProperty({ description: 'Maximum participants allowed', required: false })
  @IsOptional()
  @IsNumber()
  @Transform(({ value }) => parseInt(value))
  maxParticipants?: number;

  @ApiProperty({ description: 'Is lecture active', default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiProperty({ description: 'Reference materials for the lecture', type: [LectureMaterialDto], required: false })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => LectureMaterialDto)
  materials?: LectureMaterialDto[];

  @ApiProperty({ description: 'Thumbnail image URL or S3 relative path', required: false })
  @IsOptional()
  @IsString()
  thumbnailUrl?: string;
}

export class LectureDataDto {
  @ApiProperty({ description: 'Lecture title' })
  @IsString()
  @IsNotEmpty()
  title: string;

  @ApiProperty({ description: 'Lecture description', required: false })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ enum: LectureType, description: 'Type of lecture' })
  @IsEnum(LectureType)
  lectureType: LectureType;

  @ApiProperty({ description: 'Physical venue (for physical/hybrid lectures)', required: false })
  @IsOptional()
  @IsString()
  venue?: string;

  @ApiProperty({ description: 'Lecture start time (ISO string)' })
  @IsDateString()
  startTime: string;

  @ApiProperty({ description: 'Lecture end time (ISO string)' })
  @IsDateString()
  endTime: string;

  @ApiProperty({ description: 'Meeting link (for online/hybrid lectures)', required: false })
  @IsOptional()
  @ValidateIf((o) => o.meetingLink !== null && o.meetingLink !== undefined && o.meetingLink !== '')
  @IsUrl()
  meetingLink?: string;

  @ApiProperty({ description: 'Meeting ID', required: false })
  @IsOptional()
  @IsString()
  meetingId?: string;

  @ApiProperty({ description: 'Meeting password', required: false })
  @IsOptional()
  @IsString()
  meetingPassword?: string;

  @ApiProperty({ description: 'Recording URL', required: false })
  @IsOptional()
  @ValidateIf((o) => {
    const url = o.recordingUrl || o.recodingUrl;
    return url !== null && url !== undefined && url !== '';
  })
  @IsUrl()
  @Transform(({ obj }) => {
    // Handle common typo: recodingUrl -> recordingUrl
    const url = obj.recodingUrl || obj.recordingUrl;
    // Return null for empty strings to avoid validation issues
    return url && url.trim() !== '' ? url : null;
  })
  recordingUrl?: string;

  @ApiProperty({ description: 'Maximum participants allowed', required: false })
  @IsOptional()
  @IsNumber()
  @Transform(({ value }) => value ? parseInt(value) : undefined)
  maxParticipants?: number;
}

export class BulkCreateLecturesDto {
  @ApiProperty({ description: 'Institute ID' })
  @IsString()
  @IsNotEmpty()
  instituteId: string;

  @ApiProperty({ description: 'Class ID', required: false })
  @IsOptionalBigIntId()
  classId?: string;

  @ApiProperty({ description: 'Subject ID' })
  @IsString()
  @IsNotEmpty()
  subjectId: string;

  @ApiProperty({ description: 'Instructor/Teacher ID' })
  @IsString()
  @IsNotEmpty()
  instructorId: string;

  @ApiProperty({ description: 'Array of lecture data', type: [LectureDataDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => LectureDataDto)
  lectures: LectureDataDto[];
}

export class CreateSingleLectureDto {
  @ApiProperty({ description: 'Institute ID' })
  @IsString()
  @IsNotEmpty()
  instituteId: string;

  @ApiProperty({ description: 'Class ID', required: false })
  @IsOptionalBigIntId()
  classId?: string;

  @ApiProperty({ description: 'Subject ID' })
  @IsString()
  @IsNotEmpty()
  subjectId: string;

  @ApiProperty({ description: 'Instructor/Teacher ID' })
  @IsString()
  @IsNotEmpty()
  instructorId: string;

  @ApiProperty({ description: 'Lecture data', type: LectureDataDto })
  @ValidateNested()
  @Type(() => LectureDataDto)
  lectures: LectureDataDto;
}
