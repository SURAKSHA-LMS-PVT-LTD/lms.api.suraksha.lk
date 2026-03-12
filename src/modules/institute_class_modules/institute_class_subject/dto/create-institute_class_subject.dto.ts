import { IsBigIntId, IsOptionalBigIntId } from '../../../../common/validators/bigint-id.validator';
import { IsString, IsNotEmpty, IsOptional, IsBoolean, IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateInstituteClassSubjectDto {
  @ApiPropertyOptional({ description: 'Institute ID (Long ID) - Set from URL parameter', example: '40' })
  @IsOptional()
  @IsBigIntId()
  instituteId?: string;

  @ApiPropertyOptional({ description: 'Class ID (Long ID) - Set from URL parameter', example: '40' })
  @IsOptional()
  @IsBigIntId()
  classId?: string;

  @ApiPropertyOptional({ description: 'Subject ID (Long ID) - Set from URL parameter', example: '41' })
  @IsOptional()
  @IsBigIntId()
  subjectId?: string;

  @ApiPropertyOptional({ description: 'Teacher ID for this subject (Long ID)', example: '40' })
  @IsOptionalBigIntId()
  teacherId?: string;

  @ApiPropertyOptional({ description: 'Is the subject assignment active', default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ description: 'Enable self-enrollment for this subject', default: false, example: true })
  @IsOptional()
  @IsBoolean()
  enrollmentEnabled?: boolean;

  @ApiPropertyOptional({ description: 'Enrollment key required to join (leave empty for open enrollment without key)', example: 'MATH-2026' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  enrollmentKey?: string;

  @ApiPropertyOptional({ description: 'Subject schedule/timetable', example: 'Mon 9:00-10:30, Wed 11:00-12:30' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  schedule?: string;

  @ApiPropertyOptional({ description: 'Additional notes', example: 'Advanced level mathematics with practical applications' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  notes?: string;
}

export class SubjectBulkItemDto {
  @ApiProperty({ description: 'Subject ID (Long ID)', example: '41' })
  @IsBigIntId()
  subjectId: string;

  @ApiPropertyOptional({ description: 'Is the subject assignment active', default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ description: 'Enable self-enrollment for this subject', default: false })
  @IsOptional()
  @IsBoolean()
  enrollmentEnabled?: boolean;

  @ApiPropertyOptional({ description: 'Enrollment key required to join (leave empty for open enrollment)', example: 'MATH-2026' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  enrollmentKey?: string;
}

export class BulkCreateInstituteClassSubjectDto {
  @ApiPropertyOptional({ description: 'Institute ID (Long ID) - Set from URL parameter', example: '40' })
  @IsOptional()
  @IsBigIntId()
  instituteId?: string;

  @ApiPropertyOptional({ description: 'Class ID (Long ID) - Set from URL parameter', example: '40' })
  @IsOptional()
  @IsBigIntId()
  classId?: string;

  @ApiPropertyOptional({ 
    description: 'Array of subject IDs to assign (Long IDs) — use this OR the subjects array', 
    example: ['41', '42', '43'],
    type: [String]
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  subjectIds?: string[];

  @ApiPropertyOptional({ 
    description: 'Array of subject assignments with per-subject configuration — use this OR the subjectIds array',
    type: [SubjectBulkItemDto]
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SubjectBulkItemDto)
  subjects?: SubjectBulkItemDto[];

  @ApiPropertyOptional({ description: 'Default teacher ID for all subjects (Long ID)', example: '40' })
  @IsOptional()
  @IsOptionalBigIntId()
  defaultTeacherId?: string;

  @ApiPropertyOptional({ description: 'Enable self-enrollment for all subjects (used with subjectIds format)', default: false, example: true })
  @IsOptional()
  @IsBoolean()
  enrollmentEnabled?: boolean;

  @ApiPropertyOptional({ description: 'Enrollment key for all subjects (used with subjectIds format)', example: 'MATH-2026' })
  @IsOptional()
  @IsString()
  enrollmentKey?: string;
}
