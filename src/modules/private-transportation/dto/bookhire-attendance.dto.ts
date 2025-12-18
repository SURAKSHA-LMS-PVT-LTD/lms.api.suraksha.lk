import { IsString, IsOptional, IsEnum, IsDateString, IsArray, ValidateNested, IsNumber, Min, Max } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type, Transform } from 'class-transformer';

// Enums for bookhire attendance status - simplified
export enum BookhireAttendanceStatus {
  PICKUP = 'pickup',
  DROPOFF = 'dropoff'
}

// Input DTOs
export class MarkBookhireAttendanceDto {
  @ApiProperty({ description: 'Bookhire ID' })
  @IsNumber()
  @Type(() => Number)
  bookhireId: number;

  @ApiPropertyOptional({ description: 'Student ID (required if not using RFID)' })
  @IsOptional()
  @IsString()
  studentId?: string;

  @ApiPropertyOptional({ description: 'Attendance date (YYYY-MM-DD), defaults to today' })
  @IsOptional()
  @IsDateString()
  attendanceDate?: string;

  @ApiProperty({ description: 'Attendance status - pickup or dropoff', enum: BookhireAttendanceStatus })
  @IsEnum(BookhireAttendanceStatus)
  status: BookhireAttendanceStatus;

  @ApiPropertyOptional({ description: 'Location (pickup or dropoff)' })
  @IsOptional()
  @IsString()
  location?: string;

  @ApiPropertyOptional({ description: 'RFID card ID' })
  @IsOptional()
  @IsString()
  rfidCardId?: string;

  @ApiPropertyOptional({ description: 'Additional notes' })
  @IsOptional()
  @IsString()
  notes?: string;
}

export class BulkAttendanceRecordDto {
  @ApiProperty({ description: 'Student ID' })
  @IsString()
  studentId: string;

  @ApiProperty({ description: 'Attendance status - pickup or dropoff', enum: BookhireAttendanceStatus })
  @IsEnum(BookhireAttendanceStatus)
  status: BookhireAttendanceStatus;

  @ApiPropertyOptional({ description: 'Additional notes' })
  @IsOptional()
  @IsString()
  notes?: string;
}

export class BulkMarkAttendanceDto {
  @ApiProperty({ description: 'Bookhire ID' })
  @IsNumber()
  @Type(() => Number)
  bookhireId: number;

  @ApiProperty({ description: 'Attendance date (YYYY-MM-DD)' })
  @IsDateString()
  attendanceDate: string;

  @ApiProperty({ description: 'Array of attendance records', type: [BulkAttendanceRecordDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BulkAttendanceRecordDto)
  attendanceRecords: BulkAttendanceRecordDto[];
}

// Query DTOs
export class BookhireAttendanceQueryDto {
  @ApiPropertyOptional({ description: 'Start date (YYYY-MM-DD)' })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({ description: 'End date (YYYY-MM-DD)' })
  @IsOptional()
  @IsDateString()
  endDate?: string;

  @ApiPropertyOptional({ description: 'Student ID filter' })
  @IsOptional()
  @IsString()
  studentId?: string;

  @ApiPropertyOptional({ description: 'Page number', minimum: 1 })
  @IsOptional()
  @Transform(({ value }) => parseInt(value))
  @IsNumber()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ description: 'Items per page', minimum: 1, maximum: 100 })
  @IsOptional()
  @Transform(({ value }) => parseInt(value))
  @IsNumber()
  @Min(1)
  @Max(100)
  limit?: number = 50;
}

export class StudentAttendanceQueryDto {
  @ApiPropertyOptional({ description: 'Start date (YYYY-MM-DD)' })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({ description: 'End date (YYYY-MM-DD)' })
  @IsOptional()
  @IsDateString()
  endDate?: string;

  @ApiPropertyOptional({ description: 'Bookhire ID filter' })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  bookhireId?: number;

  @ApiPropertyOptional({ description: 'Page number', minimum: 1 })
  @IsOptional()
  @Transform(({ value }) => parseInt(value))
  @IsNumber()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ description: 'Items per page', minimum: 1, maximum: 100 })
  @IsOptional()
  @Transform(({ value }) => parseInt(value))
  @IsNumber()
  @Min(1)
  @Max(100)
  limit?: number = 50;
}

// ========================================
// RESPONSE DTOs - Consistent API Responses
// ========================================

export class AttendanceRecordResponseDto {
  @ApiProperty({ description: 'Attendance record ID' })
  attendanceId: string;

  @ApiProperty({ description: 'Student ID' })
  studentId: string;

  @ApiProperty({ description: 'Student name' })
  studentName: string;

  @ApiProperty({ description: 'Bookhire ID' })
  bookhireId: number;

  @ApiProperty({ description: 'Attendance date' })
  attendanceDate: string;

  @ApiProperty({ description: 'Attendance status', enum: BookhireAttendanceStatus })
  status: BookhireAttendanceStatus;

  @ApiProperty({ description: 'Location', required: false })
  location?: string;

  @ApiProperty({ description: 'RFID card ID', required: false })
  rfidCardId?: string;

  @ApiProperty({ description: 'Additional notes', required: false })
  notes?: string;

  @ApiProperty({ description: 'Marked by (owner ID)' })
  markedBy: string;

  @ApiProperty({ description: 'Timestamp when marked' })
  markedAt: string;
}

export class BookhireAttendanceListResponseDto {
  @ApiProperty({ description: 'List of attendance records', type: [AttendanceRecordResponseDto] })
  attendanceRecords: AttendanceRecordResponseDto[];

  @ApiProperty({ description: 'Total number of records' })
  total: number;

  @ApiProperty({ description: 'Total number of pages' })
  totalPages: number;

  @ApiProperty({ description: 'Current page number' })
  currentPage: number;

  @ApiProperty({ description: 'Number of items per page' })
  limit: number;

  @ApiProperty({ description: 'Bookhire information' })
  bookhireInfo: {
    id: string;
    vehicleNumber: string;
    vehicleType: string;
    routeName?: string;
  };
}

export class StudentAttendanceListResponseDto {
  @ApiProperty({ description: 'List of attendance records', type: [AttendanceRecordResponseDto] })
  attendanceRecords: AttendanceRecordResponseDto[];

  @ApiProperty({ description: 'Total number of records' })
  total: number;

  @ApiProperty({ description: 'Total number of pages' })
  totalPages: number;

  @ApiProperty({ description: 'Current page number' })
  currentPage: number;

  @ApiProperty({ description: 'Number of items per page' })
  limit: number;

  @ApiProperty({ description: 'Student information' })
  studentInfo: {
    id: string;
    name: string;
    instituteId?: string;
    instituteName?: string;
  };
}

export class AttendanceSummaryDto {
  @ApiProperty({ description: 'Total present days' })
  totalPresent: number;

  @ApiProperty({ description: 'Total absent days' })
  totalAbsent: number;

  @ApiProperty({ description: 'Total late days' })
  totalLate: number;

  @ApiProperty({ description: 'Total days in period' })
  totalDays: number;

  @ApiProperty({ description: 'Attendance percentage' })
  attendancePercentage: number;

  @ApiProperty({ description: 'Period start date' })
  startDate: string;

  @ApiProperty({ description: 'Period end date' })
  endDate: string;
}

export class AttendanceSummaryResponseDto {
  @ApiProperty({ description: 'Pickup attendance summary' })
  pickupSummary: AttendanceSummaryDto;

  @ApiProperty({ description: 'Dropoff attendance summary', required: false })
  dropoffSummary?: AttendanceSummaryDto;

  @ApiProperty({ description: 'Student information', required: false })
  studentInfo?: {
    id: string;
    name: string;
  };

  @ApiProperty({ description: 'Bookhire information', required: false })
  bookhireInfo?: {
    id: string;
    vehicleNumber: string;
    vehicleType: string;
  };
}

export class MarkAttendanceResponseDto {
  @ApiProperty({ description: 'Attendance record created/updated', type: AttendanceRecordResponseDto })
  attendanceRecord: AttendanceRecordResponseDto;

  @ApiProperty({ description: 'Success message' })
  message: string;
}

export class BulkMarkAttendanceResponseDto {
  @ApiProperty({ description: 'Number of records processed' })
  totalProcessed: number;

  @ApiProperty({ description: 'Number of successful records' })
  successCount: number;

  @ApiProperty({ description: 'Number of failed records' })
  failureCount: number;

  @ApiProperty({ description: 'List of processed attendance records', type: [AttendanceRecordResponseDto] })
  attendanceRecords: AttendanceRecordResponseDto[];

  @ApiProperty({ description: 'List of errors for failed records', required: false })
  errors?: Array<{
    studentId: string;
    error: string;
  }>;
}