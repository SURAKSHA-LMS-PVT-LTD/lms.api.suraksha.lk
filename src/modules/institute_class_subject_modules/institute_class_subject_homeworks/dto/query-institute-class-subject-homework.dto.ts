import { IsBigIntId, IsOptionalBigIntId } from '../../../../common/validators/bigint-id.validator';
import { IsOptional, IsString, IsInt, IsBoolean, IsEnum, IsDateString, Min } from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

export class QueryInstituteClassSubjectHomeworkDto {
  @ApiProperty({ required: false, description: 'Institute ID' })
  @IsOptionalBigIntId()
  instituteId?: string;

  @ApiProperty({ required: false, description: 'Class ID' })
  @IsOptionalBigIntId()
  classId?: string;

  @ApiProperty({ required: false, description: 'Subject ID' })
  @IsOptionalBigIntId()
  subjectId?: string;

  @ApiProperty({ required: false, description: 'Teacher ID' })
  @IsOptionalBigIntId()
  teacherId?: string;

  @ApiProperty({ required: false, description: 'Search in title or description' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiProperty({ required: false, description: 'Filter by active status' })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === undefined || value === null) return undefined;
    return value === 'true' || value === true;
  })
  @IsBoolean()
  isActive?: boolean;

  @ApiProperty({ required: false, description: 'Filter from start date (ISO string)' })
  @IsOptional()
  @IsDateString()
  fromDate?: string;

  @ApiProperty({ required: false, description: 'Filter to end date (ISO string)' })
  @IsOptional()
  @IsDateString()
  toDate?: string;

  @ApiProperty({ required: false, description: 'Page number', default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiProperty({ required: false, description: 'Items per page', default: 10 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number;

  @ApiProperty({ required: false, description: 'Sort field', enum: ['title', 'startDate', 'endDate', 'createdAt'] })
  @IsOptional()
  @IsEnum(['title', 'startDate', 'endDate', 'createdAt'])
  sortBy?: string;

  @ApiProperty({ required: false, description: 'Sort order', enum: ['ASC', 'DESC'] })
  @IsOptional()
  @IsEnum(['ASC', 'DESC'])
  sortOrder?: 'ASC' | 'DESC';

  @ApiProperty({ 
    required: false, 
    description: 'Include reference materials in response', 
    default: false 
  })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === undefined || value === null) return false;
    return value === 'true' || value === true;
  })
  @IsBoolean()
  includeReferences?: boolean;

  @ApiProperty({ 
    required: false, 
    description: 'Include submissions in response (students see their own, teachers/admins see all)', 
    default: false 
  })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === undefined || value === null) return false;
    return value === 'true' || value === true;
  })
  @IsBoolean()
  includeSubmissions?: boolean;

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
