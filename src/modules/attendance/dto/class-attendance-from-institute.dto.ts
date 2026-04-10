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
// GET  /institute/:instituteId/class/:classId/students-with-institute-status
// ─────────────────────────────────────────────────────────────────

export class GetClassStudentsInstituteAttendanceQueryDto {
  @ApiPropertyOptional({
    description: 'Date to query (YYYY-MM-DD). Defaults to today in Sri Lanka timezone.',
    example: '2026-04-10',
  })
  @IsDateString()
  @IsOptional()
  date?: string;
}

/** Institute-level attendance snapshot for one student */
export class StudentInstituteAttendanceSnapshot {
  /** Numeric status stored in DB: 0=Absent,1=Present,2=Late,3=Left,4=LeftEarly,5=LeftLately */
  statusCode: number;
  /** Human-readable status string */
  status: string;
  /** Date of the attendance record (YYYY-MM-DD) */
  date: string;
  /** Sri Lanka local time string, e.g. "9:15 AM" */
  time: string;
  /** Raw epoch-ms timestamp */
  timestamp: string;
  /** Optional remarks */
  remarks: string | null;
}

/** Class-level attendance snapshot for one student */
export class StudentClassAttendanceSnapshot {
  statusCode: number;
  status: string;
  date: string;
  time: string;
  timestamp: string;
}

/** Single row in the class-students-with-institute-attendance response */
export class ClassStudentAttendanceStatusItem {
  /** The student's user ID */
  studentId: string;
  /** Full display name */
  studentName: string;
  /** Resolved profile image URL (null if not available) */
  studentImageUrl: string | null;
  /**
   * Institute-level attendance for this student on the queried date.
   * null means the student has NOT been marked at the institute level yet.
   */
  instituteAttendance: StudentInstituteAttendanceSnapshot | null;
  /**
   * Class-level attendance already recorded for this student.
   * null means no class attendance exists yet — can be bulk-marked.
   */
  classAttendance: StudentClassAttendanceSnapshot | null;
}

// ─────────────────────────────────────────────────────────────────
// POST /institute/:instituteId/class/:classId/bulk-mark-from-institute
// ─────────────────────────────────────────────────────────────────

export class BulkMarkClassFromInstituteDto {
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
      'When true (default), students who have NO institute-level attendance will be marked ABSENT at class level.',
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
      'When true (default), students who ARE present at the institute level will be marked PRESENT at class level.',
    default: true,
  })
  @IsBoolean()
  @IsOptional()
  @Transform(({ value }) => {
    if (value === 'true') return true;
    if (value === 'false') return false;
    return value;
  })
  markPresentFromInstitute?: boolean;

  @ApiPropertyOptional({
    description:
      'Per-student status overrides. When provided, these students will be marked with the specified status '
      + 'instead of the auto-determined status from institute attendance. Students already marked at class level are still skipped.',
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
  @Type(() => StudentStatusOverrideItem)
  @IsOptional()
  studentOverrides?: StudentStatusOverrideItem[];
}

export class StudentStatusOverrideItem {
  @ApiProperty({ description: 'Student user ID' })
  @IsString()
  @IsNotEmpty()
  studentId: string;

  @ApiProperty({ description: 'Override attendance status', enum: AttendanceStatus })
  @IsEnum(AttendanceStatus)
  status: AttendanceStatus;
}

/** Per-student result inside the bulk-mark response */
export class BulkMarkClassFromInstituteResultItem {
  studentId: string;
  studentName: string;
  action: 'marked_present' | 'marked_absent' | 'skipped_already_marked' | 'skipped_no_action';
  classStatus: string | null;
  success: boolean;
  error?: string;
}
