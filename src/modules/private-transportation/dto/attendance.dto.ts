import { 
  IsNotEmpty, 
  IsString, 
  IsEnum, 
  IsOptional, 
  IsDateString, 
  IsBoolean, 
  IsNumber,
  IsUUID,
  Min,
  Max
} from 'class-validator';
import { Transform } from 'class-transformer';
import { AttendanceStatus } from '../entities/student-bookhire-attendance.entity';

export class MarkTransportationAttendanceDto {
  @IsNotEmpty()
  @IsString()
  studentId: string;

  @IsNotEmpty()
  @IsUUID()
  bookhireId: string;

  @IsNotEmpty()
  @IsDateString()
  date: string;

  @IsNotEmpty()
  @IsString()
  time: string;

  @IsNotEmpty()
  @IsEnum(['present', 'absent', 'late'])
  status: 'present' | 'absent' | 'late';
}

export class MarkAttendanceByRfidDto {
  @IsNotEmpty()
  @IsString()
  rfid: string;

  @IsNotEmpty()
  @IsUUID()
  bookhireId: string;

  @IsNotEmpty()
  @IsDateString()
  date: string;

  @IsNotEmpty()
  @IsString()
  time: string;

  @IsNotEmpty()
  @IsEnum(['present', 'absent', 'late'])
  status: 'present' | 'absent' | 'late';
}

export class BulkMarkAttendanceDto {
  @IsNotEmpty()
  @IsUUID()
  bookhireId: string;

  @IsNotEmpty()
  @IsDateString()
  date: string;

  @IsNotEmpty()
  @IsString()
  time: string;

  @IsNotEmpty()
  attendanceRecords: Array<{
    studentId: string;
    status: 'PRESENT' | 'ABSENT';
  }>;
}

export class UpdateAttendanceDto {
  @IsOptional()
  @IsEnum(AttendanceStatus)
  status?: AttendanceStatus;

  @IsOptional()
  @IsString()
  checkInTime?: string;

  @IsOptional()
  @IsString()
  location?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsBoolean()
  parentNotified?: boolean;
}

export class AttendanceQueryDto {
  @IsOptional()
  @IsString()
  studentId?: string;

  @IsOptional()
  @IsUUID()
  bookhireId?: string;

  @IsOptional()
  @IsString()
  vehicleNumber?: string;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsEnum(AttendanceStatus)
  status?: AttendanceStatus;

  @IsOptional()
  @Transform(({ value }) => parseInt(value))
  @IsNumber()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Transform(({ value }) => parseInt(value))
  @IsNumber()
  @Min(1)
  @Max(100)
  limit?: number = 10;
}

export class StudentAttendanceReportDto {
  @IsNotEmpty()
  @IsString()
  studentId: string;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsUUID()
  bookhireId?: string;

  @IsOptional()
  @Transform(({ value }) => parseInt(value))
  @IsNumber()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Transform(({ value }) => parseInt(value))
  @IsNumber()
  @Min(1)
  @Max(100)
  limit?: number = 10;
}

export class BookhireAttendanceReportDto {
  @IsNotEmpty()
  @IsUUID()
  bookhireId: string;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @Transform(({ value }) => parseInt(value))
  @IsNumber()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Transform(({ value }) => parseInt(value))
  @IsNumber()
  @Min(1)
  @Max(100)
  limit?: number = 10;
}

export class MarkAttendanceByEnrollmentDto {
  @IsNotEmpty()
  @IsUUID()
  enrollmentId: string;

  @IsNotEmpty()
  @IsDateString()
  attendanceDate: string;

  @IsNotEmpty()
  @IsEnum(['present', 'absent', 'late'])
  pickupStatus: 'present' | 'absent' | 'late';

  @IsOptional()
  @IsEnum(['present', 'absent', 'late'])
  dropoffStatus?: 'present' | 'absent' | 'late';

  @IsOptional()
  @IsString()
  notes?: string;
}