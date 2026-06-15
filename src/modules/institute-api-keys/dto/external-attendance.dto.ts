import {
  IsArray, IsInt, IsNotEmpty, IsOptional,
  IsString, Min, Max, ValidateNested,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class ExternalAttendanceRecordDto {
  @ApiProperty({
    description: 'Student user ID (must be enrolled in the session\'s class)',
    example: '500423',
  })
  @IsString()
  @IsNotEmpty()
  studentId: string;

  @ApiPropertyOptional({
    description: 'Attendance status: 0=Absent, 1=Present, 2=Late, 3=Left, 4=LeftEarly, 5=LeftLately. Omit to auto-resolve from session time rules.',
    example: 1,
    minimum: 0,
    maximum: 5,
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(5)
  status?: number;

  @ApiPropertyOptional({
    description: 'Optional remarks',
    example: 'Arrived by school bus',
  })
  @IsString()
  @IsOptional()
  remarks?: string;

  @ApiPropertyOptional({
    description:
      'Original check-in time (ISO 8601). Used when migrating historical attendance from another system ' +
      'so the original timestamp is preserved. If omitted, the server records the current time.',
    example: '2026-06-15T08:32:00.000Z',
  })
  @IsString()
  @IsOptional()
  checkInTime?: string;
}

export class BulkExternalAttendanceDto {
  @ApiProperty({
    description: 'Array of student attendance records to mark',
    type: [ExternalAttendanceRecordDto],
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ExternalAttendanceRecordDto)
  records: ExternalAttendanceRecordDto[];
}

// ── Response types ─────────────────────────────────────────────────────────

export interface ExternalAttendanceFailure {
  studentId: string;
  reason: string;
}

export interface BulkExternalAttendanceResult {
  sessionId: string;
  successCount: number;
  failedCount: number;
  failures: ExternalAttendanceFailure[];
}
