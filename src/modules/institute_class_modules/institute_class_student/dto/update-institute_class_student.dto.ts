import { PartialType } from '@nestjs/swagger';
import { CreateInstituteClassStudentDto } from './create-institute_class_student.dto';
import { IsBoolean, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateInstituteClassStudentDto {
  @ApiProperty({ description: 'Is the student assignment active' })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class InstituteClassStudentResponseDto {
  @ApiProperty({ description: 'Institute ID' })
  instituteId: string;

  @ApiProperty({ description: 'Class ID' })
  classId: string;

  @ApiProperty({ description: 'Student User ID' })
  studentUserId: string;

  @ApiProperty({ description: 'Is the student assignment active' })
  isActive: boolean;

  @ApiProperty({ description: 'Creation timestamp' })
  createdAt: Date;

  @ApiProperty({ description: 'Last update timestamp' })
  updatedAt: Date;

  @ApiProperty({ description: 'Institute details', required: false })
  institute?: any;

  @ApiProperty({ description: 'Class details', required: false })
  class?: any;

  @ApiProperty({ description: 'Student details', required: false })
  student?: any;
}
