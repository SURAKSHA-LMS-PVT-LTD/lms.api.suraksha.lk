import {
  IsString, IsOptional, IsNotEmpty, IsEnum,
  IsBoolean, IsDateString, IsInt, Min, IsArray,
  ValidateNested,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { CloseUnmarkAction } from '../entities/institute-class-attendance-session.entity';

// ─────────────────────────────────────────────────────────────────
// SESSION GROUP DTOs
// ─────────────────────────────────────────────────────────────────

export class CreateSessionGroupDto {
  @ApiProperty({ example: 'Morning Sessions' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiPropertyOptional({ example: '#3B82F6', description: 'Hex color for UI' })
  @IsString()
  @IsOptional()
  color?: string;

  @ApiPropertyOptional({ example: 0 })
  @IsInt()
  @Min(0)
  @IsOptional()
  displayOrder?: number;
}

export class UpdateSessionGroupDto {
  @ApiPropertyOptional({ example: 'Morning Sessions' })
  @IsString()
  @IsOptional()
  name?: string;

  @ApiPropertyOptional({ example: '#3B82F6' })
  @IsString()
  @IsOptional()
  color?: string;

  @ApiPropertyOptional({ example: 1 })
  @IsInt()
  @Min(0)
  @IsOptional()
  displayOrder?: number;

  @ApiPropertyOptional()
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}

// ─────────────────────────────────────────────────────────────────
// SESSION DTOs
// ─────────────────────────────────────────────────────────────────

export class CreateSessionDto {
  @ApiProperty({ example: 'Period 1 – Mathematics' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiPropertyOptional({ description: 'Date (YYYY-MM-DD). Defaults to today.', example: '2026-05-01' })
  @IsDateString()
  @IsOptional()
  date?: string;

  @ApiProperty({ example: '08:00', description: 'HH:MM start time' })
  @IsString()
  @IsNotEmpty()
  startTime: string;

  @ApiPropertyOptional({ example: '09:30', description: 'HH:MM end time' })
  @IsString()
  @IsOptional()
  endTime?: string;

  @ApiPropertyOptional({ example: 15, description: 'Minutes after startTime before marking is LATE' })
  @IsInt()
  @Min(0)
  @IsOptional()
  lateAfterMinutes?: number;

  @ApiPropertyOptional({ example: 10, description: 'Minutes before endTime before mark-out is LEFT_EARLY' })
  @IsInt()
  @Min(0)
  @IsOptional()
  leftEarlyBeforeMinutes?: number;

  @ApiPropertyOptional({ description: 'Session group ID to attach this session to' })
  @IsString()
  @IsOptional()
  sessionGroupId?: string;

  @ApiPropertyOptional({ description: 'Send parent notifications when attendance is marked in this session (default: true)' })
  @IsBoolean()
  @IsOptional()
  @Transform(({ value }) => value === 'false' ? false : value === 'true' ? true : value)
  sendNotifications?: boolean;
}

export class UpdateSessionDto {
  @ApiPropertyOptional({ example: 'Period 2 – Physics' })
  @IsString()
  @IsOptional()
  name?: string;

  @ApiPropertyOptional({ example: '08:30' })
  @IsString()
  @IsOptional()
  startTime?: string;

  @ApiPropertyOptional({ example: '10:00' })
  @IsString()
  @IsOptional()
  endTime?: string;

  @ApiPropertyOptional({ example: 15 })
  @IsInt()
  @Min(0)
  @IsOptional()
  lateAfterMinutes?: number;

  @ApiPropertyOptional({ example: 10 })
  @IsInt()
  @Min(0)
  @IsOptional()
  leftEarlyBeforeMinutes?: number;

  @ApiPropertyOptional({ description: 'Set to null to remove from group' })
  @IsString()
  @IsOptional()
  sessionGroupId?: string | null;
}

export class CloseSessionDto {
  @ApiProperty({
    enum: CloseUnmarkAction,
    description: 'What to do with students who were never marked when closing the session',
  })
  @IsEnum(CloseUnmarkAction)
  closeUnmarkAction: CloseUnmarkAction;
}

export class MarkSessionAttendanceDto {
  @ApiProperty({ description: 'Student user ID' })
  @IsString()
  @IsNotEmpty()
  studentId: string;

  @ApiPropertyOptional({
    description: 'Attendance status: 0=Absent, 1=Present, 2=Late, 3=Left, 4=LeftEarly, 5=LeftLately. Omit to auto-resolve from session time rules.',
    example: 1,
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  status?: number;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  remarks?: string;
}

export class BulkMarkSessionAttendanceDto {
  @ApiProperty({ type: [MarkSessionAttendanceDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MarkSessionAttendanceDto)
  records: MarkSessionAttendanceDto[];
}

// ─────────────────────────────────────────────────────────────────
// QUERY DTOs
// ─────────────────────────────────────────────────────────────────

export class GetSessionsQueryDto {
  @ApiPropertyOptional({ description: 'Filter by date (YYYY-MM-DD)' })
  @IsDateString()
  @IsOptional()
  date?: string;

  @ApiPropertyOptional({ description: 'Filter by start date (YYYY-MM-DD) — use with endDate for range' })
  @IsDateString()
  @IsOptional()
  startDate?: string;

  @ApiPropertyOptional({ description: 'Filter by end date (YYYY-MM-DD) — use with startDate for range' })
  @IsDateString()
  @IsOptional()
  endDate?: string;

  @ApiPropertyOptional({ description: 'Filter by session group ID' })
  @IsString()
  @IsOptional()
  sessionGroupId?: string;

  @ApiPropertyOptional({ description: 'Include closed sessions (default true)' })
  @IsOptional()
  @Transform(({ value }) => value === 'false' ? false : true)
  includeClosed?: boolean;
}

export class GetSessionGridQueryDto {
  @ApiProperty({ description: 'Comma-separated session IDs to include in the grid' })
  @IsString()
  @IsNotEmpty()
  sessionIds: string;

  @ApiPropertyOptional({ description: 'Group results by session group' })
  @IsOptional()
  @Transform(({ value }) => value === 'true')
  groupBySessions?: boolean;
}

// ─────────────────────────────────────────────────────────────────
// RESPONSE TYPES
// ─────────────────────────────────────────────────────────────────

export const STATUS_LABEL: Record<number, string> = {
  0: 'Absent',
  1: 'Present',
  2: 'Late',
  3: 'Left',
  4: 'LeftEarly',
  5: 'LeftLately',
};

export interface SessionGroupResponse {
  id: string;
  name: string;
  color?: string;
  displayOrder: number;
  isActive: boolean;
}

export interface SessionResponse {
  id: string;
  name: string;
  date: string;
  startTime: string;
  endTime?: string;
  lateAfterMinutes?: number;
  leftEarlyBeforeMinutes?: number;
  isClosed: boolean;
  closedAt?: Date;
  closeUnmarkAction: CloseUnmarkAction;
  totalStudents: number;
  sessionGroupId?: string;
  group?: SessionGroupResponse;
  sendNotifications: boolean;
  createdAt: Date;
}

export interface SessionStudentRecord {
  studentId: string;
  studentName: string;
  imageUrl: string | null;
  userIdInstitute: string | null;
  cardId: string | null;
  statusCode: number | null;
  statusLabel: string;
  markedAt: string | null;
  remarks: string | null;
  isFromOtherSource: boolean;
}

export interface SessionDetailResponse extends SessionResponse {
  students: SessionStudentRecord[];
  presentCount: number;
  absentCount: number;
  lateCount: number;
  notMarkedCount: number;
}

export interface GridStudentRow {
  studentId: string;
  studentName: string;
  imageUrl: string | null;
  userIdInstitute: string | null;
  cardId: string | null;
  sessions: Record<string, { statusCode: number | null; statusLabel: string; markedAt: string | null }>;
}

export interface SessionGridResponse {
  sessions: SessionResponse[];
  students: GridStudentRow[];
}
