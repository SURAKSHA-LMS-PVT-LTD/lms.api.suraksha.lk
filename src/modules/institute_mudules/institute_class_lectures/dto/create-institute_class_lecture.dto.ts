import { IsString, IsNotEmpty, IsOptional, IsEnum, IsBoolean, IsNumber, MaxLength, MinLength, Min, Max, IsArray, ValidateNested } from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ClassLectureMaterialDto {
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

export class CreateInstituteClassLectureDto {
  @ApiProperty({ description: 'Institute ID', example: '1' })
  @IsString()
  @IsNotEmpty({ message: 'Institute ID is required' })
  @Transform(({ value }) => value?.toString().trim())
  instituteId: string;

  @ApiProperty({ description: 'Class ID', example: '5' })
  @IsString()
  @IsNotEmpty({ message: 'Class ID is required' })
  @Transform(({ value }) => value?.toString().trim())
  classId: string;

  @ApiProperty({ description: 'Instructor/Teacher user ID', example: '2' })
  @IsString()
  @IsNotEmpty({ message: 'Instructor ID is required' })
  @Transform(({ value }) => value?.toString().trim())
  instructorId: string;

  @ApiProperty({ description: 'Lecture title', example: 'Introduction to Class Orientation' })
  @IsString()
  @IsNotEmpty({ message: 'Lecture title is required' })
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

  @ApiProperty({ description: 'Lecture type', enum: ['online', 'physical', 'hybrid'], example: 'physical' })
  @IsEnum(['online', 'physical', 'hybrid'], { message: 'Lecture type must be one of: online, physical, hybrid' })
  lectureType: 'online' | 'physical' | 'hybrid';

  @ApiPropertyOptional({ description: 'Venue/Room for physical lectures', example: 'Room 101' })
  @IsOptional()
  @IsString()
  @MaxLength(255, { message: 'Venue cannot exceed 255 characters' })
  @Transform(({ value }) => value?.trim())
  venue?: string;

  @ApiPropertyOptional({ description: 'Subject name (free-text, for display)', example: 'Mathematics' })
  @IsOptional()
  @IsString()
  @MaxLength(100, { message: 'Subject name cannot exceed 100 characters' })
  @Transform(({ value }) => value?.trim())
  subject?: string;

  @ApiProperty({ description: 'Lecture start time (ISO 8601 format)', example: '2026-04-12T09:00:00.000Z' })
  @IsString()
  @IsNotEmpty({ message: 'Start time is required' })
  startTime: string;

  @ApiProperty({ description: 'Lecture end time (ISO 8601 format)', example: '2026-04-12T10:30:00.000Z' })
  @IsString()
  @IsNotEmpty({ message: 'End time is required' })
  endTime: string;

  @ApiPropertyOptional({ description: 'Lecture status', enum: ['scheduled', 'ongoing', 'completed', 'cancelled'], default: 'scheduled' })
  @IsOptional()
  @IsEnum(['scheduled', 'ongoing', 'completed', 'cancelled'], { message: 'Status must be one of: scheduled, ongoing, completed, cancelled' })
  status?: 'scheduled' | 'ongoing' | 'completed' | 'cancelled';

  @ApiPropertyOptional({ description: 'Meeting link for online/hybrid lectures' })
  @IsOptional()
  @IsString()
  @MaxLength(500, { message: 'Meeting link cannot exceed 500 characters' })
  meetingLink?: string;

  @ApiPropertyOptional({ description: 'Meeting ID' })
  @IsOptional()
  @IsString()
  @MaxLength(100, { message: 'Meeting ID cannot exceed 100 characters' })
  @Transform(({ value }) => value?.trim())
  meetingId?: string;

  @ApiPropertyOptional({ description: 'Meeting password' })
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

  @ApiPropertyOptional({ description: 'Recording URL' })
  @IsOptional()
  @IsString()
  @MaxLength(500, { message: 'Recording URL cannot exceed 500 characters' })
  recordingUrl?: string;

  @ApiPropertyOptional({ description: 'Is lecture recorded?', default: false })
  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  isRecorded?: boolean;

  @ApiPropertyOptional({ description: 'Is lecture active?', default: true })
  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  isActive?: boolean;

  @ApiPropertyOptional({ description: 'Reference materials', type: [ClassLectureMaterialDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ClassLectureMaterialDto)
  materials?: ClassLectureMaterialDto[];

  @ApiPropertyOptional({ description: 'Thumbnail image URL or S3 relative path' })
  @IsOptional()
  @IsString()
  @MaxLength(500, { message: 'Thumbnail URL cannot exceed 500 characters' })
  thumbnailUrl?: string;
}
