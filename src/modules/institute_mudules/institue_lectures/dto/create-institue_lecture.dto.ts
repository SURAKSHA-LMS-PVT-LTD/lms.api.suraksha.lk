import { IsString, IsNotEmpty, IsOptional, IsEnum, IsDate, IsBoolean, IsNumber, IsUUID, ValidateIf, MaxLength, MinLength, IsUrl, Min, Max, IsArray, ValidateNested } from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { LectureStatus, LectureType } from '../enums/lecture.enum';
import { 
  INVALID_LECTURE_TITLE, 
  INVALID_LECTURE_DATE, 
  INVALID_LECTURE_TIME, 
  INVALID_INSTRUCTOR_ID, 
  INVALID_INSTITUTE_ID,
  INVALID_LECTURE_TYPE,
  INVALID_LECTURE_STATUS
} from '../constants/institute-lecture.constants';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class LectureMaterialDto {
  @ApiProperty({ description: 'Display name for the material' })
  @IsString()
  @IsNotEmpty()
  documentName: string;

  @ApiProperty({ description: 'URL or relative path to the material' })
  @IsString()
  @IsNotEmpty()
  documentUrl: string;

  @ApiPropertyOptional({ description: 'Google Drive file ID' })
  @IsOptional()
  @IsString()
  driveFileId?: string;

  @ApiPropertyOptional({ description: 'Google Drive web view link' })
  @IsOptional()
  @IsString()
  driveWebViewLink?: string;

  @ApiPropertyOptional({ description: 'Upload source: S3, GOOGLE_DRIVE, GOOGLE_DRIVE_INSTITUTE, EXTERNAL_LINK' })
  @IsOptional()
  @IsString()
  source?: string;
}

export class CreateInstitueLectureDto {
  @ApiProperty({ description: 'Institute ID', example: '1' })
  @IsString()
  @IsNotEmpty({ message: INVALID_INSTITUTE_ID })
  @Transform(({ value }) => value?.toString().trim())
  instituteId: string;

  @ApiProperty({ description: 'Instructor/Teacher user ID', example: '2' })
  @IsString()
  @IsNotEmpty({ message: INVALID_INSTRUCTOR_ID })
  @Transform(({ value }) => value?.toString().trim())
  instructorId: string;

  @ApiPropertyOptional({ description: 'Class ID (optional)', example: '5' })
  @IsOptional()
  @IsString()
  @Transform(({ value }) => value?.toString().trim())
  classId?: string;

  @ApiProperty({ description: 'Lecture title', example: 'Introduction to Calculus' })
  @IsString()
  @IsNotEmpty({ message: INVALID_LECTURE_TITLE })
  @MinLength(3, { message: 'Lecture title must be at least 3 characters long' })
  @MaxLength(255, { message: 'Lecture title cannot exceed 255 characters' })
  @Transform(({ value }) => value?.trim())
  title: string;

  @ApiPropertyOptional({ description: 'Lecture description' })
  @IsOptional()
  @IsString()
  @MaxLength(5000, { message: 'Description cannot exceed 5000 characters' })
  @Transform(({ value }) => value?.trim())
  description?: string;

  @ApiProperty({ description: 'Lecture type', enum: LectureType, example: 'PHYSICAL' })
  @IsEnum(LectureType, { message: INVALID_LECTURE_TYPE })
  lectureType: LectureType;

  @ApiPropertyOptional({ description: 'Venue/Room for physical lectures', example: 'Room 101' })
  @IsOptional()
  @IsString()
  @MaxLength(255, { message: 'Venue cannot exceed 255 characters' })
  @Transform(({ value }) => value?.trim())
  venue?: string;

  @ApiPropertyOptional({ description: 'Subject name', example: 'Mathematics' })
  @IsOptional()
  @IsString()
  @MaxLength(100, { message: 'Subject name cannot exceed 100 characters' })
  @Transform(({ value }) => value?.trim())
  subject?: string;

  @ApiProperty({ description: 'Lecture start time (ISO 8601 format)', example: '2025-11-07T09:00:00Z' })
  @IsDate({ message: INVALID_LECTURE_DATE })
  @Type(() => Date)
  @IsNotEmpty({ message: INVALID_LECTURE_DATE })
  startTime: Date;

  @ApiProperty({ description: 'Lecture end time (ISO 8601 format)', example: '2025-11-07T10:30:00Z' })
  @IsDate({ message: INVALID_LECTURE_TIME })
  @Type(() => Date)
  @IsNotEmpty({ message: INVALID_LECTURE_TIME })
  endTime: Date;

  @ApiPropertyOptional({ description: 'Lecture status', enum: LectureStatus, default: 'SCHEDULED' })
  @IsEnum(LectureStatus, { message: INVALID_LECTURE_STATUS })
  @IsOptional()
  status?: LectureStatus = LectureStatus.SCHEDULED;

  @ApiPropertyOptional({ description: 'Meeting link for online/hybrid lectures', example: 'https://zoom.us/j/123456789' })
  @IsOptional()
  @IsString()
  @IsUrl({}, { message: 'Meeting link must be a valid URL' })
  @MaxLength(255, { message: 'Meeting link cannot exceed 255 characters' })
  meetingLink?: string;

  @ApiPropertyOptional({ description: 'Meeting ID (e.g., Zoom meeting ID)', example: '123-456-789' })
  @IsOptional()
  @IsString()
  @MaxLength(100, { message: 'Meeting ID cannot exceed 100 characters' })
  @Transform(({ value }) => value?.trim())
  meetingId?: string;

  @ApiPropertyOptional({ description: 'Meeting password', example: 'pass1234' })
  @IsOptional()
  @IsString()
  @MaxLength(50, { message: 'Meeting password cannot exceed 50 characters' })
  @Transform(({ value }) => value?.trim())
  meetingPassword?: string;

  @ApiPropertyOptional({ description: 'Maximum number of participants', example: 50 })
  @IsOptional()
  @IsNumber()
  @Min(1, { message: 'Max participants must be at least 1' })
  @Max(10000, { message: 'Max participants cannot exceed 10000' })
  @Type(() => Number)
  maxParticipants?: number;

  @ApiPropertyOptional({ description: 'Recording URL (if lecture is recorded)', example: 'https://drive.google.com/file/d/xyz' })
  @IsOptional()
  @IsString()
  @IsUrl({}, { message: 'Recording URL must be a valid URL' })
  @MaxLength(255, { message: 'Recording URL cannot exceed 255 characters' })
  recordingUrl?: string;

  @ApiPropertyOptional({ description: 'Is lecture recorded?', default: false })
  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  isRecorded?: boolean = false;

  @ApiPropertyOptional({ description: 'Is lecture active?', default: true })
  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  isActive?: boolean = true;

  @ApiPropertyOptional({ description: 'Reference materials for the lecture', type: [LectureMaterialDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => LectureMaterialDto)
  materials?: LectureMaterialDto[];

  @ApiPropertyOptional({ description: 'Thumbnail image URL or S3 relative path', example: 'lecture-thumbnails/abc-uuid.jpg' })
  @IsOptional()
  @IsString()
  @MaxLength(500, { message: 'Thumbnail URL cannot exceed 500 characters' })
  thumbnailUrl?: string;
}

export class BulkCreateInstitueLectureDto {
  @ApiProperty({ description: 'Array of lectures to create', type: [CreateInstitueLectureDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateInstitueLectureDto)
  lectures: CreateInstitueLectureDto[];
}
