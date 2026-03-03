import { IsString, IsOptional, IsNotEmpty, IsEnum, IsArray, ValidateNested, IsNumber, IsDateString } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export enum AttendanceStatus {
  PRESENT = 'present',
  ABSENT = 'absent',
  LATE = 'late',
  LEFT = 'left',
  LEFT_EARLY = 'left_early',
  LEFT_LATELY = 'left_lately'
}

// Institute user type for attendance tracking (auto-detected from institute_user table)
export enum AttendanceUserType {
  STUDENT = 'STUDENT',
  TEACHER = 'TEACHER',
  INSTITUTE_ADMIN = 'INSTITUTE_ADMIN',
  ATTENDANCE_MARKER = 'ATTENDANCE_MARKER',
  PARENT = 'PARENT',
  NOT_ENROLLED = 'NOT_ENROLLED'    // User exists but not enrolled in this institute
}

export enum MarkingMethod {
  QR = 'qr',
  BARCODE = 'barcode',
  RFID_NFC = 'rfid/nfc',
  MANUAL = 'manual',
  SYSTEM = 'system'
}

export class MarkAttendanceDto {
  @ApiProperty({ description: 'Student ID' })
  @IsString()
  @IsNotEmpty()
  studentId: string;

  @ApiPropertyOptional({ description: 'Student name (optional - will be fetched from database if not provided)' })
  @IsString()
  @IsOptional()
  studentName?: string;

  @ApiProperty({ description: 'Institute ID (required)' })
  @IsString()
  @IsNotEmpty()
  instituteId: string;

  @ApiProperty({ description: 'Institute name (required)' })
  @IsString()
  @IsNotEmpty()
  instituteName: string;

  @ApiPropertyOptional({ description: 'Class ID (optional - for class-specific attendance)' })
  @IsString()
  @IsOptional()
  classId?: string;

  @ApiPropertyOptional({ description: 'Class name (optional - for class-specific attendance)' })
  @IsString()
  @IsOptional()
  className?: string;

  @ApiPropertyOptional({ description: 'Subject ID (optional - for subject-specific attendance)' })
  @IsString()
  @IsOptional()
  subjectId?: string;

  @ApiPropertyOptional({ description: 'Subject name (optional - for subject-specific attendance)' })
  @IsString()
  @IsOptional()
  subjectName?: string;

  @ApiProperty({ description: 'Date in YYYY-MM-DD format' })
  @IsDateString()
  @IsNotEmpty()
  date: string;

  @ApiPropertyOptional({ description: 'Location/Address' })
  @IsString()
  @IsOptional()
  location?: string;

  @ApiProperty({ enum: AttendanceStatus, description: 'Attendance status' })
  @IsEnum(AttendanceStatus)
  @IsNotEmpty()
  status: AttendanceStatus;

  @ApiPropertyOptional({ description: 'Remarks' })
  @IsString()
  @IsOptional()
  remarks?: string;

  @ApiPropertyOptional({ description: 'Address/Location string (legacy)' })
  @IsString()
  @IsOptional()
  address?: string;

  @ApiPropertyOptional({ enum: MarkingMethod, description: 'Method used to mark attendance' })
  @IsEnum(MarkingMethod)
  @IsOptional()
  markingMethod?: MarkingMethod;

  // Auto-detected by backend from institute_user table — frontend does NOT need to send this
  @ApiPropertyOptional({ 
    enum: AttendanceUserType, 
    description: 'Auto-detected institute user type (STUDENT, TEACHER, INSTITUTE_ADMIN, etc.). Do NOT send from frontend — backend resolves this automatically.' 
  })
  @IsOptional()
  userType?: AttendanceUserType;

  // Event ID for marking attendance at SPECIAL events (e.g., PARENTS_MEETING, FIELD_TRIP, EXAM)
  // ✅ If NOT provided → backend auto-links to the default REGULAR_CLASS event for today
  // ✅ If provided → attendance is linked to that specific special event
  // ⚠️  calendarDayId is ALWAYS system-resolved (today → today's calendar day). Frontend CANNOT set it.
  @ApiPropertyOptional({ 
    description: 'Event ID (optional). Only send for SPECIAL events (Parents Meeting, Exam, etc.). '
      + 'If omitted, attendance auto-links to the default Regular Classes event for today.' 
  })
  @IsString()
  @IsOptional()
  eventId?: string;

  @ApiPropertyOptional({
    description: 'Device UID (optional - if marking from a registered device, triggers device validation)',
  })
  @IsString()
  @IsOptional()
  deviceUid?: string;
}

export class StudentAttendanceItem {
  @ApiProperty({ description: 'Student ID' })
  @IsString()
  @IsNotEmpty()
  studentId: string;

  @ApiPropertyOptional({ description: 'Student name (optional - will be fetched from database if not provided)' })
  @IsString()
  @IsOptional()
  studentName?: string;

  @ApiProperty({ enum: AttendanceStatus, description: 'Attendance status' })
  @IsEnum(AttendanceStatus)
  @IsNotEmpty()
  status: AttendanceStatus;

  @ApiPropertyOptional({ description: 'Remarks' })
  @IsString()
  @IsOptional()
  remarks?: string;
}

export class BulkAttendanceDto {
  @ApiProperty({ description: 'Institute ID (required)' })
  @IsString()
  @IsNotEmpty()
  instituteId: string;

  @ApiProperty({ description: 'Institute name (required)' })
  @IsString()
  @IsNotEmpty()
  instituteName: string;

  @ApiPropertyOptional({ description: 'Class ID (optional - for class-specific bulk attendance)' })
  @IsString()
  @IsOptional()
  classId?: string;

  @ApiPropertyOptional({ description: 'Class name (optional - for class-specific bulk attendance)' })
  @IsString()
  @IsOptional()
  className?: string;

  @ApiPropertyOptional({ description: 'Subject ID (optional - for subject-specific bulk attendance)' })
  @IsString()
  @IsOptional()
  subjectId?: string;

  @ApiPropertyOptional({ description: 'Subject name (optional - for subject-specific bulk attendance)' })
  @IsString()
  @IsOptional()
  subjectName?: string;

  @ApiPropertyOptional({ description: 'Location/Address string' })
  @IsString()
  @IsOptional()
  location?: string;

  @ApiPropertyOptional({ description: 'Date in YYYY-MM-DD format. Defaults to today (Sri Lanka time) if not provided.' })
  @IsDateString()
  @IsOptional()
  date?: string;

  @ApiPropertyOptional({ enum: MarkingMethod, description: 'Method used to mark attendance' })
  @IsEnum(MarkingMethod)
  @IsOptional()
  markingMethod?: MarkingMethod;

  @ApiPropertyOptional({
    description: 'Event ID (optional). Only send for SPECIAL events (Parents Meeting, Exam, etc.). '
      + 'If omitted, attendance auto-links to the default Regular Classes event for the date.'
  })
  @IsString()
  @IsOptional()
  eventId?: string;

  @ApiProperty({ type: [StudentAttendanceItem], description: 'Array of student attendance records' })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => StudentAttendanceItem)
  students: StudentAttendanceItem[];
}

export class GetStudentAttendanceDto {
  @ApiProperty({ description: 'Student ID to filter attendance records' })
  @IsString()
  @IsNotEmpty()
  studentId: string;

  @ApiProperty({ description: 'Institute ID (required for DynamoDB GSI query)' })
  @IsString()
  @IsNotEmpty()
  instituteId: string;

  @ApiProperty({ description: 'Start date for filtering (YYYY-MM-DD)' })
  @IsDateString()
  @IsNotEmpty()
  startDate: string;

  @ApiProperty({ description: 'End date for filtering (YYYY-MM-DD)' })
  @IsDateString()
  @IsNotEmpty()
  endDate: string;

  @ApiPropertyOptional({ description: 'Page number (default: 1)', minimum: 1 })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  page?: number = 1;

  @ApiPropertyOptional({ description: 'Records per page (default: 20, max: 100)', minimum: 1, maximum: 100 })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  limit?: number = 20;

  @ApiPropertyOptional({ description: 'Filter by attendance status', enum: AttendanceStatus })
  @IsOptional()
  @IsEnum(AttendanceStatus)
  status?: AttendanceStatus;
}

export class GetStudentAttendanceQueryDto {
  @ApiProperty({ description: 'Institute ID (required for DynamoDB query)' })
  @IsString()
  @IsNotEmpty()
  instituteId: string;

  @ApiProperty({ description: 'Start date for filtering (YYYY-MM-DD)' })
  @IsDateString()
  @IsNotEmpty()
  startDate: string;

  @ApiProperty({ description: 'End date for filtering (YYYY-MM-DD)' })
  @IsDateString()
  @IsNotEmpty()
  endDate: string;

  @ApiPropertyOptional({ description: 'Page number (default: 1)', minimum: 1 })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  page?: number = 1;

  @ApiPropertyOptional({ description: 'Records per page (default: 20, max: 100)', minimum: 1, maximum: 100 })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  limit?: number = 20;

  @ApiPropertyOptional({ description: 'Filter by attendance status', enum: AttendanceStatus })
  @IsOptional()
  @IsEnum(AttendanceStatus)
  status?: AttendanceStatus;
}

export class AttendanceResponseDto {
  @ApiProperty({ description: 'Whether the operation was successful' })
  success: boolean;

  @ApiProperty({ description: 'Response message' })
  message: string;

  @ApiPropertyOptional({ description: 'Attendance record ID' })
  attendanceId?: string;
}

export class StudentAttendanceResponseDto {
  @ApiProperty({ description: 'Whether the operation was successful' })
  success: boolean;

  @ApiProperty({ description: 'Response message' })
  message: string;

  @ApiProperty({ description: 'Pagination information' })
  pagination: {
    currentPage: number;
    totalPages: number;
    totalRecords: number;
    recordsPerPage: number;
    hasNextPage: boolean;
    hasPrevPage: boolean;
  };

  @ApiProperty({ description: 'Attendance records' })
  data: {
    attendanceId: string;
    studentId: string;
    studentName: string;
    instituteName: string;
    className?: string;
    subjectName?: string;
    address: string;
    markedBy: string;
    markedAt: string;
    markingMethod: MarkingMethod;
    status: AttendanceStatus;
    userType?: AttendanceUserType;
  }[];

  @ApiProperty({ description: 'Summary statistics for the period' })
  summary: {
    totalPresent: number;
    totalAbsent: number;
    totalLate: number;
    totalLeft: number;
    totalLeftEarly: number;
    totalLeftLately: number;
    attendanceRate: number;
  };
}
