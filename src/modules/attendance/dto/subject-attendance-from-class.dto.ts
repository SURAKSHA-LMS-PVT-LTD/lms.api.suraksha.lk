import {
  IsString,
  IsOptional,
  IsNotEmpty,
  IsEnum,
  IsBoolean,
  IsDateString,
  IsArray,
  ValidateNested,
} from 'class-validator';
import { ApiPropertyOptional, ApiProperty } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { MarkingMethod, AttendanceStatus } from './attendance.dto';

// ─────────────────────────────────────────────────────────────────
// GET  /institute/:instituteId/class/:classId/subject/:subjectId/students-with-class-status
// ─────────────────────────────────────────────────────────────────

export class GetSubjectStudentsClassAttendanceQueryDto {
  @ApiPropertyOptional({
    description: 'Date to query (YYYY-MM-DD). Defaults to today in Sri Lanka timezone.',
    example: '2026-04-10',
  })
  @IsDateString()
  @IsOptional()
  date?: string;
}

/** Class-level attendance snapshot for one student */
export class StudentClassAttendanceSnapshotForSubject {
  statusCode: number;
  status: string;
  date: string;
  time: string;
  timestamp: string;
  remarks: string | null;
}

/** Subject-level attendance snapshot for one student */
export class StudentSubjectAttendanceSnapshot {
  statusCode: number;
  status: string;
  date: string;
  time: string;
  timestamp: string;
}

/** Single row in the subject-students-with-class-attendance response */
export class SubjectStudentAttendanceStatusItem {
  studentId: string;
  studentName: string;
  studentImageUrl: string | null;
  /**
   * Class-level attendance for this student on the queried date.
   * null means the student has NOT been marked at the class level yet.
   */
  classAttendance: StudentClassAttendanceSnapshotForSubject | null;
  /**
   * Subject-level attendance already recorded for this student.
   * null means no subject attendance exists yet — can be bulk-marked.
   */
  subjectAttendance: StudentSubjectAttendanceSnapshot | null;
}

// ─────────────────────────────────────────────────────────────────
// POST /institute/:instituteId/class/:classId/subject/:subjectId/bulk-mark-from-class
// ─────────────────────────────────────────────────────────────────

export class BulkMarkSubjectFromClassDto {
  @ApiProperty({
    description: 'Institute name (used when writing attendance records)',
    example: 'Suraksha Institute',
  })
  @IsString()
  @IsNotEmpty()
  instituteName: string;

  @ApiProperty({
    description: 'Class name (used when writing attendance records)',
    example: 'Grade 10 – Science',
  })
  @IsString()
  @IsNotEmpty()
  className: string;

  @ApiProperty({
    description: 'Subject name (used when writing attendance records)',
    example: 'Mathematics',
  })
  @IsString()
  @IsNotEmpty()
  subjectName: string;

  @ApiPropertyOptional({
    description:
      'Date to mark attendance for (YYYY-MM-DD). Defaults to today in Sri Lanka timezone.',
    example: '2026-04-10',
  })
  @IsDateString()
  @IsOptional()
  date?: string;

  @ApiPropertyOptional({
    description:
      'Event ID for a special calendar event. Omit to auto-link to the default Regular Classes event.',
  })
  @IsString()
  @IsOptional()
  eventId?: string;

  @ApiPropertyOptional({
    enum: MarkingMethod,
    description: 'How attendance was marked (defaults to "system").',
  })
  @IsEnum(MarkingMethod)
  @IsOptional()
  markingMethod?: MarkingMethod;

  @ApiPropertyOptional({
    description:
      'When true (default), students who have NO class-level attendance will be marked ABSENT at subject level.',
    default: true,
  })
  @IsBoolean()
  @IsOptional()
  @Transform(({ value }) => {
    if (value === 'true') return true;
    if (value === 'false') return false;
    return value;
  })
  markAbsentForUnmarked?: boolean;

  @ApiPropertyOptional({
    description:
      'When true (default), students who ARE present at the class level will be marked PRESENT at subject level.',
    default: true,
  })
  @IsBoolean()
  @IsOptional()
  @Transform(({ value }) => {
    if (value === 'true') return true;
    if (value === 'false') return false;
    return value;
  })
  markPresentFromClass?: boolean;

  @ApiPropertyOptional({
    description:
      'Per-student status overrides. When provided, these students will be marked with the specified status '
      + 'instead of the auto-determined status from class attendance. Students already marked at subject level are still skipped.',
    type: 'array',
    items: {
      type: 'object',
      properties: {
        studentId: { type: 'string' },
        status: { type: 'string', enum: ['present', 'absent', 'late', 'left', 'left_early', 'left_lately'] },
      },
    },
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SubjectStudentStatusOverrideItem)
  @IsOptional()
  studentOverrides?: SubjectStudentStatusOverrideItem[];
}

export class SubjectStudentStatusOverrideItem {
  @ApiProperty({ description: 'Student user ID' })
  @IsString()
  @IsNotEmpty()
  studentId: string;

  @ApiProperty({ description: 'Override attendance status', enum: AttendanceStatus })
  @IsEnum(AttendanceStatus)
  status: AttendanceStatus;
}
