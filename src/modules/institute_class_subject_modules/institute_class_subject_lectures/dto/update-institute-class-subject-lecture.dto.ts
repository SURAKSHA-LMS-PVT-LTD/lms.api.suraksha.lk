import { IsBigIntId, IsOptionalBigIntId } from '../../../../common/validators/bigint-id.validator';
import { PartialType } from '@nestjs/swagger';
import { CreateInstituteClassSubjectLectureDto, LectureStatus, LectureMaterialDto } from './create-institute_class_subject_lecture.dto';
import { IsEnum, IsOptional, IsString, IsBoolean, IsUrl, IsNumber, IsDateString, IsArray, ValidateNested } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { InstituteClassSubjectLectureResponseDto } from './Institute-class-subject-lecture-response.dto';

export class UpdateInstituteClassSubjectLectureDto {
  @ApiProperty({ description: 'Lecture title' })
  @IsOptional()
  @IsString()
  title?: string;

  @ApiProperty({ description: 'Lecture description' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ description: 'Physical venue' })
  @IsOptional()
  @IsString()
  venue?: string;

  @ApiProperty({ description: 'Lecture start time (ISO string)' })
  @IsOptional()
  @IsDateString()
  startTime?: string;

  @ApiProperty({ description: 'Lecture end time (ISO string)' })
  @IsOptional()
  @IsDateString()
  endTime?: string;

  @ApiProperty({ enum: LectureStatus, description: 'Lecture status' })
  @IsOptional()
  @IsEnum(LectureStatus)
  status?: LectureStatus;

  @ApiProperty({ description: 'Meeting link' })
  @IsOptional()
  @IsUrl()
  meetingLink?: string;

  @ApiProperty({ description: 'Meeting ID' })
  @IsOptionalBigIntId()
  meetingId?: string;

  @ApiProperty({ description: 'Meeting password' })
  @IsOptional()
  @IsString()
  meetingPassword?: string;

  @ApiProperty({ description: 'Recording URL' })
  @IsOptional()
  @IsUrl()
  recordingUrl?: string;

  @ApiProperty({ description: 'Is lecture recorded' })
  @IsOptional()
  @IsBoolean()
  isRecorded?: boolean;

  @ApiProperty({ description: 'Maximum participants allowed' })
  @IsOptional()
  @IsNumber()
  @Transform(({ value }) => parseInt(value))
  maxParticipants?: number;

  @ApiProperty({ description: 'Is lecture active' })
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

  // --- Live Lecture Access & Tracking Settings ---
  @ApiProperty({ description: 'Enable live attendance tracking', default: false })
  @IsOptional()
  @IsBoolean()
  liveAttendanceEnabled?: boolean;

  @ApiProperty({ description: 'URL ID for live page (auto-generated if not provided)', required: false })
  @IsOptional()
  @IsString()
  liveUrlId?: string;

  @ApiProperty({ description: 'Live access level', enum: ['ANYONE', 'SURAKSHA_USERS', 'ENROLLED_ONLY', 'PAID_ONLY'], default: 'ENROLLED_ONLY' })
  @IsOptional()
  @IsString()
  liveAccessLevel?: 'ANYONE' | 'SURAKSHA_USERS' | 'ENROLLED_ONLY' | 'PAID_ONLY';

  @ApiProperty({ description: 'Payment ID required for live access', required: false })
  @IsOptionalBigIntId()
  livePaymentId?: string;

  @ApiProperty({ description: 'Allowed payment statuses for live access', required: false })
  @IsOptional()
  @IsArray()
  livePaymentStatuses?: string[];

  @ApiProperty({ description: 'Background image URL for live entry page', required: false })
  @IsOptional()
  @IsString()
  liveEntryBgUrl?: string;

  // --- Recording Access & Tracking Settings ---
  @ApiProperty({ description: 'Enable recording tracking', default: false })
  @IsOptional()
  @IsBoolean()
  recAttendanceEnabled?: boolean;

  @ApiProperty({ description: 'URL ID for recording page (auto-generated if not provided)', required: false })
  @IsOptional()
  @IsString()
  recUrlId?: string;

  @ApiProperty({ description: 'Recording platform', enum: ['SYSTEM', 'YOUTUBE', 'GOOGLE_DRIVE'], default: 'SYSTEM' })
  @IsOptional()
  @IsString()
  recPlatform?: 'SYSTEM' | 'YOUTUBE' | 'GOOGLE_DRIVE';

  @ApiProperty({ description: 'Recording access level', enum: ['ANYONE', 'SURAKSHA_USERS', 'ENROLLED_ONLY', 'PAID_ONLY'], default: 'ENROLLED_ONLY' })
  @IsOptional()
  @IsString()
  recAccessLevel?: 'ANYONE' | 'SURAKSHA_USERS' | 'ENROLLED_ONLY' | 'PAID_ONLY';

  @ApiProperty({ description: 'Payment ID required for recording access', required: false })
  @IsOptionalBigIntId()
  recPaymentId?: string;

  @ApiProperty({ description: 'Allowed payment statuses for recording access', required: false })
  @IsOptional()
  @IsArray()
  recPaymentStatuses?: string[];

  @ApiProperty({ description: 'Enable welcome message', default: false })
  @IsOptional()
  @IsBoolean()
  welcomeMessageEnabled?: boolean;

  @ApiProperty({ description: 'Welcome message text', required: false })
  @IsOptional()
  @IsString()
  welcomeMessageText?: string;

  @ApiProperty({ description: 'Enable voice narration for welcome message', default: false })
  @IsOptional()
  @IsBoolean()
  welcomeMessageVoiceEnabled?: boolean;
}

// export class LectureScheduleDto {
//   @ApiProperty({ description: 'Date (YYYY-MM-DD)' })
//   date: string;

//   @ApiProperty({ description: 'List of lectures for the date', type: [InstituteClassSubjectLectureResponseDto] })
//   lectures: InstituteClassSubjectLectureResponseDto[];

//   @ApiProperty({ description: 'Total lectures for the date' })
//   totalLectures: number;
// }
