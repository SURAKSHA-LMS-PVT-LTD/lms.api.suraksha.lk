import {
  IsArray, IsOptional, IsString, IsNotEmpty,
  IsObject, ValidateNested, ArrayMinSize,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

/**
 * One student to create (or link) and assign to the institute.
 *
 * Resolution order for "is this an existing user?":
 *   1. If `userId` (a Suraksha user ID) is supplied → link that user directly, no matching.
 *   2. Else if `phoneNumber` matches an existing active user → link that user.
 *   3. Else → create a brand-new user + student record.
 *
 * No parent linkage is performed — this only touches the users + students + institute_user tables.
 */
export class ExternalStudentRecordDto {
  @ApiPropertyOptional({
    description:
      'Existing Suraksha user ID. If provided, the user is linked directly (no creation, no matching).',
    example: '500423',
  })
  @IsString()
  @IsOptional()
  userId?: string;

  @ApiProperty({
    description: 'Student first name (required when creating a new user)',
    example: 'Nimal',
  })
  @IsString()
  @IsNotEmpty()
  firstName: string;

  @ApiPropertyOptional({ description: 'Student last name', example: 'Perera' })
  @IsString()
  @IsOptional()
  lastName?: string;

  @ApiPropertyOptional({
    description: 'Name with initials. Auto-generated from first/last name if omitted.',
    example: 'N. Perera',
  })
  @IsString()
  @IsOptional()
  nameWithInitials?: string;

  @ApiPropertyOptional({
    description: 'Phone number. Used to match an existing user when no userId is given.',
    example: '+94771234567',
  })
  @IsString()
  @IsOptional()
  phoneNumber?: string;

  @ApiPropertyOptional({ description: 'Email address', example: 'nimal@example.com' })
  @IsString()
  @IsOptional()
  email?: string;

  @ApiPropertyOptional({ description: 'NIC', example: '200012345678' })
  @IsString()
  @IsOptional()
  nic?: string;

  @ApiPropertyOptional({ description: 'Date of birth (ISO or YYYY-MM-DD)', example: '2008-04-12' })
  @IsString()
  @IsOptional()
  dateOfBirth?: string;

  @ApiPropertyOptional({ description: 'Gender', example: 'MALE' })
  @IsString()
  @IsOptional()
  gender?: string;

  @ApiPropertyOptional({ description: 'City', example: 'Colombo' })
  @IsString()
  @IsOptional()
  city?: string;

  @ApiPropertyOptional({
    description: 'Institute-specific student ID / index number (stored on the institute membership).',
    example: 'STU2026001',
  })
  @IsString()
  @IsOptional()
  userIdByInstitute?: string;

  @ApiPropertyOptional({
    description:
      'Institute (tenant) login password for this student — NOT the global Suraksha account password. ' +
      'Stored bcrypt-hashed on the institute membership (institute_password). Omit to leave unset.',
    example: 'Pass@12345',
  })
  @IsString()
  @IsOptional()
  institutePassword?: string;

  @ApiPropertyOptional({
    description:
      'Optional class ID. When provided, the student is also enrolled into this class ' +
      '(institute_class_student, active + verified) during creation. Omit to assign at institute level only.',
    example: '085e6528-db3b-489a-80b8-97133d6aa7cf',
  })
  @IsString()
  @IsOptional()
  classId?: string;

  @ApiPropertyOptional({
    description:
      'Institute-defined custom key-value columns for this student (e.g. grade, stream, notes). ' +
      'Stored on the institute_user membership.',
    example: { grade: '10', stream: 'Science', notes: 'Migrated from legacy system' },
  })
  @IsObject()
  @IsOptional()
  extraData?: Record<string, any>;
}

export class BulkExternalStudentDto {
  @ApiProperty({
    description: 'Array of students to create (or link) and assign to the institute.',
    type: [ExternalStudentRecordDto],
  })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ExternalStudentRecordDto)
  students: ExternalStudentRecordDto[];
}

// ── Response types ─────────────────────────────────────────────────────────

export interface ExternalStudentResult {
  /** Index of the record in the request array */
  index: number;
  userId: string;
  /** 'created' = new user+student made; 'linked' = existing user assigned */
  action: 'created' | 'linked';
  /** true when the institute membership was newly created (false = already existed, extraData updated) */
  assignmentCreated: boolean;
  /** 'created' = newly enrolled into classId, 'existing' = already enrolled, 'none' = no classId given */
  classEnrollment: 'created' | 'existing' | 'none';
}

export interface ExternalStudentFailure {
  index: number;
  reason: string;
}

export interface BulkExternalStudentResult {
  instituteId: string;
  successCount: number;
  failedCount: number;
  results: ExternalStudentResult[];
  failures: ExternalStudentFailure[];
}
