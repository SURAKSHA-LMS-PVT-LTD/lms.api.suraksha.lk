import { IsString, IsNotEmpty, IsOptional, IsEnum } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AttendanceStatus, MarkingMethod } from './attendance.dto';

export class MarkAttendanceByInstituteCardDto {
  @ApiPropertyOptional({
    description: 'Institute Card ID (from institute_user table). Exactly one of instituteCardId / userIdByInstitute is required.',
    example: 'CARD001'
  })
  @IsOptional()
  @IsString()
  instituteCardId?: string;

  @ApiPropertyOptional({
    description: 'Institute-assigned user ID (from institute_user table) — alternative to instituteCardId, e.g. for marking by typed-in ID instead of a physical card.',
    example: 'STU2024001'
  })
  @IsOptional()
  @IsString()
  userIdByInstitute?: string;

  @ApiProperty({ 
    description: 'Institute ID', 
    example: '1' 
  })
  @IsNotEmpty()
  @IsString()
  instituteId: string;

  @ApiProperty({ 
    description: 'Institute name', 
    example: 'Suraksha Learning Academy' 
  })
  @IsNotEmpty()
  @IsString()
  instituteName: string;

  @ApiPropertyOptional({ 
    description: 'Class ID (optional)', 
    example: 'CLASS001' 
  })
  @IsOptional()
  @IsString()
  classId?: string;

  @ApiPropertyOptional({ 
    description: 'Class name (optional)', 
    example: 'Grade 10A' 
  })
  @IsOptional()
  @IsString()
  className?: string;

  @ApiPropertyOptional({ 
    description: 'Subject ID (optional)', 
    example: 'SUBJ001' 
  })
  @IsOptional()
  @IsString()
  subjectId?: string;

  @ApiPropertyOptional({ 
    description: 'Subject name (optional)', 
    example: 'Mathematics' 
  })
  @IsOptional()
  @IsString()
  subjectName?: string;

  @ApiProperty({ 
    description: 'Address/Location string', 
    example: 'Suraksha Learning Academy - Grade 10A - Mathematics' 
  })
  @IsNotEmpty()
  @IsString()
  address: string;

  @ApiProperty({ 
    description: 'Marking method', 
    enum: MarkingMethod, 
    example: MarkingMethod.RFID_NFC 
  })
  @IsEnum(MarkingMethod)
  markingMethod: MarkingMethod;

  @ApiProperty({ 
    description: 'Attendance status', 
    enum: AttendanceStatus, 
    example: AttendanceStatus.PRESENT 
  })
  @IsEnum(AttendanceStatus)
  status: AttendanceStatus;

  @ApiPropertyOptional({
    description: 'Location/Address (auto-generated if not provided)'
  })
  @IsOptional()
  @IsString()
  location?: string;

  @ApiPropertyOptional({
    description: 'Calendar event ID — enables checkout detection (a second scan today becomes the checkout instead of a duplicate check-in) and time-based status auto-resolution (present/late/left-early from the event\'s time rules). If omitted, attendance auto-links to the default Regular Classes event for today.',
  })
  @IsOptional()
  @IsString()
  eventId?: string;

  @ApiPropertyOptional({ description: 'Class session ID — links this attendance record to a specific session and enables checkout detection for it' })
  @IsOptional()
  @IsString()
  classSessionId?: string;

  @ApiPropertyOptional({ description: 'Calendar day ID — links this attendance record to a specific calendar day' })
  @IsOptional()
  @IsString()
  calendarDayId?: string;
}

export class GetInstituteUserByCardDto {
  @ApiProperty({ 
    description: 'Institute Card ID', 
    example: 'CARD001' 
  })
  @IsNotEmpty()
  @IsString()
  instituteCardId: string;

  @ApiProperty({ 
    description: 'Institute ID', 
    example: '1' 
  })
  @IsNotEmpty()
  @IsString()
  instituteId: string;
}

export class InstituteCardUserResponseDto {
  @ApiProperty({ description: 'User ID' })
  userId: string;

  @ApiProperty({ description: 'User name (full name)' })
  userName: string;

  @ApiPropertyOptional({ description: 'Name with initials (e.g. A.B. Perera)' })
  nameWithInitials?: string;

  @ApiProperty({ description: 'Institute user ID assigned by institute' })
  userIdByInstitute: string;

  @ApiProperty({ description: 'Institute card ID' })
  instituteCardId: string;

  @ApiProperty({ description: 'Final image URL (institute or global)' })
  imageUrl: string | null;

  @ApiProperty({ description: 'Image verification status' })
  imageVerificationStatus: string;

  @ApiProperty({ description: 'Is institute-specific image' })
  isInstituteImage: boolean;

  @ApiProperty({ description: 'User type' })
  userType: string;

  @ApiProperty({ description: 'Institute user status' })
  status: string;
}
