import { IsBigIntId, IsOptionalBigIntId } from '../../../../common/validators/bigint-id.validator';
import { IsString, IsNotEmpty, IsOptional, IsBoolean, IsArray } from 'class-validator';
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

export class BulkCreateInstituteClassSubjectDto {
  @ApiPropertyOptional({ description: 'Institute ID (Long ID) - Set from URL parameter', example: '40' })
  @IsOptional()
  @IsBigIntId()
  instituteId?: string;

  @ApiPropertyOptional({ description: 'Class ID (Long ID) - Set from URL parameter', example: '40' })
  @IsOptional()
  @IsBigIntId()
  classId?: string;

  @ApiProperty({ 
    description: 'Array of subject IDs to assign (Long IDs)', 
    example: ['41', '42', '43'],
    type: [String]
  })
  @IsArray()
  @IsNotEmpty()
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  subjectIds: string[];

  @ApiPropertyOptional({ description: 'Default teacher ID for all subjects (Long ID)', example: '40' })
  @IsOptional()
  @IsOptionalBigIntId()
  defaultTeacherId?: string;
}
