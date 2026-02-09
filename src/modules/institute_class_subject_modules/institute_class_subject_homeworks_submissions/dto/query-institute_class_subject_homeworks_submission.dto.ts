import { IsBigIntId, IsOptionalBigIntId } from '../../../../common/validators/bigint-id.validator';
import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, IsBoolean, IsDateString, IsEnum, IsIn } from 'class-validator';
import { PaginationDto } from '../../../../common/dto/pagination.dto';

export class QueryInstituteClassSubjectHomeworksSubmissionDto extends PaginationDto {
  @ApiProperty({ description: 'Filter by homework ID', example: '1', required: false })
  @IsOptionalBigIntId()
  homeworkId?: string;

  @ApiProperty({ description: 'Filter by student ID', example: '1', required: false })
  @IsOptionalBigIntId()
  studentId?: string;

  @ApiProperty({ description: 'Filter by institute ID', example: '1', required: false })
  @IsOptionalBigIntId()
  instituteId?: string;

  @ApiProperty({ description: 'Filter by class ID', example: '1', required: false })
  @IsOptionalBigIntId()
  classId?: string;

  @ApiProperty({ description: 'Filter by subject ID', example: '1', required: false })
  @IsOptionalBigIntId()
  subjectId?: string;

  @ApiProperty({ description: 'Filter by teacher ID', example: '1', required: false })
  @IsOptionalBigIntId()
  teacherId?: string;

  @ApiProperty({ description: 'Filter by submission date (from)', example: '2024-01-01', required: false })
  @IsOptional()
  @IsDateString()
  submissionDateFrom?: string;

  @ApiProperty({ description: 'Filter by submission date (to)', example: '2024-01-31', required: false })
  @IsOptional()
  @IsDateString()
  submissionDateTo?: string;

  @ApiProperty({ description: 'Filter by active status', example: true, required: false })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiProperty({ description: 'Filter by whether submission has file', example: true, required: false })
  @IsOptional()
  @IsBoolean()
  hasFile?: boolean;

  @ApiProperty({ description: 'Filter by whether submission has teacher correction', example: true, required: false })
  @IsOptional()
  @IsBoolean()
  hasTeacherCorrection?: boolean;

  @ApiProperty({ description: 'Search in remarks', example: 'excellent', required: false })
  @IsOptional()
  @IsString()
  remarksSearch?: string;

  // Additional filtering/sorting fields
  @ApiProperty({ description: 'Sort by field', example: 'submissionDate', required: false, enum: ['submissionDate', 'grade', 'createdAt', 'updatedAt'] })
  @IsOptional()
  @IsString()
  @IsIn(['submissionDate', 'grade', 'createdAt', 'updatedAt'], { message: 'sortBy must be one of: submissionDate, grade, createdAt, updatedAt' })
  sortBy?: string;

  @ApiProperty({ description: 'Sort order', example: 'DESC', required: false })
  @IsOptional()
  @IsEnum(['ASC', 'DESC'])
  sortOrder?: 'ASC' | 'DESC';

  // These fields might be sent by frontend but aren't used in backend filtering
  // Added to prevent validation errors with forbidNonWhitelisted
  @ApiProperty({ description: 'User ID (ignored, for frontend compatibility)', example: '1', required: false })
  @IsOptionalBigIntId()
  userId?: string;

  @ApiProperty({ description: 'User role (ignored, for frontend compatibility)', example: 'Student', required: false })
  @IsOptional()
  @IsString()
  role?: string;
}
