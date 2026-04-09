import { PartialType } from '@nestjs/swagger';
import { CreateInstituteClassStudentDto } from './create-institute_class_student.dto';
import { IsBoolean, IsObject, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateInstituteClassStudentDto {
  @ApiProperty({ description: 'Is the student assignment active' })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({
    description: 'Custom key-value data for this class enrollment. Stored as plain JSON — visible to admins, not encrypted.',
    example: { phoneNumber: '0771234567', notes: 'Updated notes' }
  })
  @IsOptional()
  @IsObject()
  extraData?: Record<string, any>;
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
