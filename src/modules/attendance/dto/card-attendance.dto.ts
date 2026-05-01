import { IsNotEmpty, IsString, IsEnum, IsDateString, IsOptional, IsArray, ValidateNested } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { AttendanceStatus, MarkingMethod } from './attendance.dto';

export class MarkAttendanceByCardDto {
  @ApiProperty({ description: 'Student Card ID', example: 'CARD001' })
  @IsNotEmpty()
  @IsString()
  studentCardId: string;

  @ApiProperty({ description: 'Institute ID', example: 'INST001' })
  @IsNotEmpty()
  @IsString()
  instituteId: string;

  @ApiProperty({ description: 'Institute name', example: 'Suraksha Learning Academy' })
  @IsNotEmpty()
  @IsString()
  instituteName: string;

  @ApiPropertyOptional({ description: 'Class ID (optional)', example: 'CLASS001' })
  @IsOptional()
  @IsString()
  classId?: string;

  @ApiPropertyOptional({ description: 'Class name (optional)', example: 'Grade 10A' })
  @IsOptional()
  @IsString()
  className?: string;

  @ApiPropertyOptional({ description: 'Subject ID (optional)', example: 'SUBJ001' })
  @IsOptional()
  @IsString()
  subjectId?: string;

  @ApiPropertyOptional({ description: 'Subject name (optional)', example: 'Mathematics' })
  @IsOptional()
  @IsString()
  subjectName?: string;

  @ApiProperty({ description: 'Address/Location string', example: 'Suraksha Learning Academy - Grade 10A - Mathematics' })
  @IsNotEmpty()
  @IsString()
  address: string;

  @ApiProperty({ description: 'Marking method', enum: MarkingMethod, example: MarkingMethod.RFID_NFC })
  @IsEnum(MarkingMethod)
  markingMethod: MarkingMethod;

  @ApiProperty({ description: 'Attendance status', enum: AttendanceStatus, example: AttendanceStatus.PRESENT })
  @IsEnum(AttendanceStatus)
  status: AttendanceStatus;

  @ApiPropertyOptional({ description: 'Class session ID — links this attendance record to a specific session' })
  @IsOptional()
  @IsString()
  classSessionId?: string;
}

export class StudentCardAttendanceDto {
  @ApiProperty({ description: 'Student Card ID', example: 'CARD001' })
  @IsNotEmpty()
  @IsString()
  studentCardId: string;

  @ApiProperty({ description: 'Attendance status', enum: AttendanceStatus, example: AttendanceStatus.PRESENT })
  @IsEnum(AttendanceStatus)
  status: AttendanceStatus;
}

export class BulkCardAttendanceDto {
  @ApiProperty({ description: 'Institute ID', example: 'INST001' })
  @IsNotEmpty()
  @IsString()
  instituteId: string;

  @ApiProperty({ description: 'Institute name', example: 'Suraksha Learning Academy' })
  @IsNotEmpty()
  @IsString()
  instituteName: string;

  @ApiPropertyOptional({ description: 'Class ID (optional)', example: 'CLASS001' })
  @IsOptional()
  @IsString()
  classId?: string;

  @ApiPropertyOptional({ description: 'Class name (optional)', example: 'Grade 10A' })
  @IsOptional()
  @IsString()
  className?: string;

  @ApiPropertyOptional({ description: 'Subject ID (optional)', example: 'SUBJ001' })
  @IsOptional()
  @IsString()
  subjectId?: string;

  @ApiPropertyOptional({ description: 'Subject name (optional)', example: 'Mathematics' })
  @IsOptional()
  @IsString()
  subjectName?: string;

  @ApiProperty({ description: 'Address/Location string', example: 'Suraksha Learning Academy - Grade 10A - Mathematics' })
  @IsNotEmpty()
  @IsString()
  address: string;

  @ApiProperty({ description: 'Marking method', enum: MarkingMethod, example: MarkingMethod.RFID_NFC })
  @IsEnum(MarkingMethod)
  markingMethod: MarkingMethod;

  @ApiProperty({ 
    description: 'Array of student card attendance records',
    type: [StudentCardAttendanceDto],
    example: [
      { studentCardId: 'CARD001', status: 'present' },
      { studentCardId: 'CARD002', status: 'absent' }
    ]
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => StudentCardAttendanceDto)
  students: StudentCardAttendanceDto[];
}

export class GetAttendanceByCardDto {
  @ApiPropertyOptional({ description: 'Student Card ID', example: 'CARD001', required: false })
  @IsOptional()
  @IsString()
  studentCardId?: string;

  @ApiPropertyOptional({ description: 'Start date for filtering (YYYY-MM-DD)', example: '2024-01-01', required: false })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({ description: 'End date for filtering (YYYY-MM-DD)', example: '2024-12-31', required: false })
  @IsOptional()
  @IsDateString()
  endDate?: string;

  @ApiPropertyOptional({ description: 'Page number for pagination', example: 1, required: false })
  @IsOptional()
  page?: number;

  @ApiPropertyOptional({ description: 'Number of items per page', example: 10, required: false })
  @IsOptional()
  limit?: number;
}
