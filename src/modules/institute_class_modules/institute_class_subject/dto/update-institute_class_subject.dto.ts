import { IsBigIntId, IsOptionalBigIntId } from '../../../../common/validators/bigint-id.validator';
import { PartialType } from '@nestjs/swagger';
import { CreateInstituteClassSubjectDto } from './create-institute_class_subject.dto';
import { IsBoolean, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateInstituteClassSubjectDto {
  @ApiProperty({ description: 'Teacher ID for this subject' })
  @IsOptionalBigIntId()
  teacherId?: string;

  @ApiProperty({ description: 'Is the subject assignment active' })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiProperty({ description: 'Enable or disable self-enrollment' })
  @IsOptional()
  @IsBoolean()
  enrollmentEnabled?: boolean;

  @ApiProperty({ description: 'Enrollment key (set to require key, leave empty for open enrollment)' })
  @IsOptional()
  @IsString()
  enrollmentKey?: string;
}

export class UpdateEnrollmentKeyDto {
  @ApiProperty({ description: 'Enable or disable self-enrollment for this subject' })
  @IsBoolean()
  enrollmentEnabled: boolean;

  @ApiProperty({ description: 'Enrollment key required to join. Leave empty for open enrollment when enrollment is enabled.', required: false })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  enrollmentKey?: string;
}

export class InstituteClassSubjectResponseDto {
  @ApiProperty({ description: 'Institute ID' })
  instituteId: string;

  @ApiProperty({ description: 'Class ID' })
  classId: string;

  @ApiProperty({ description: 'Subject ID' })
  subjectId: string;

  @ApiProperty({ description: 'Teacher ID' })
  teacherId: string;

  @ApiProperty({ description: 'Is the subject assignment active' })
  isActive: boolean;

  @ApiProperty({ description: 'Creation timestamp' })
  createdAt: Date;

  @ApiProperty({ description: 'Last update timestamp' })
  updatedAt: Date;

  @ApiProperty({ description: 'Institute details', required: false })
  institute?: any;

  @ApiProperty({ description: 'Class details', required: false })
  class?: any;

  @ApiProperty({ description: 'Subject details', required: false })
  subject?: any;

  @ApiProperty({ description: 'Teacher details', required: false })
  teacher?: any;
}
