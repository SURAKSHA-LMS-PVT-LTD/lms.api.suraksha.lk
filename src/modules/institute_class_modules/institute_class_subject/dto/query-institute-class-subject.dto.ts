import { IsBigIntId, IsOptionalBigIntId } from '../../../../common/validators/bigint-id.validator';
import { IsOptional, IsString, IsBoolean, IsInt, IsIn, Min, Max } from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class QueryInstituteClassSubjectDto {
  @ApiPropertyOptional({ description: 'Institute ID to filter by' })
  @IsOptionalBigIntId()
  instituteId?: string;

  @ApiPropertyOptional({ description: 'Class ID to filter by' })
  @IsOptionalBigIntId()
  classId?: string;

  @ApiPropertyOptional({ description: 'Subject ID to filter by' })
  @IsOptionalBigIntId()
  subjectId?: string;

  @ApiPropertyOptional({ description: 'Teacher ID to filter by' })
  @IsOptionalBigIntId()
  teacherId?: string;

  @ApiPropertyOptional({ description: 'Filter by active status' })
  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === 'true')
  isActive?: boolean;

  @ApiPropertyOptional({ description: 'Search term for subject name or code' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ description: 'Page number', default: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Transform(({ value }) => parseInt(value, 10))
  page?: number = 1;

  @ApiPropertyOptional({ description: 'Items per page', default: 10 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  @Transform(({ value }) => parseInt(value, 10))
  limit?: number = 10;

  @ApiPropertyOptional({ description: 'Sort field', enum: ['createdAt', 'updatedAt', 'subjectId', 'classId'] })
  @IsOptional()
  @IsString()
  @IsIn(['createdAt', 'updatedAt', 'subjectId', 'classId'], { message: 'sortBy must be one of: createdAt, updatedAt, subjectId, classId' })
  sortBy?: string;

  @ApiPropertyOptional({ description: 'Sort order', enum: ['ASC', 'DESC'] })
  @IsOptional()
  @IsString()
  @IsIn(['ASC', 'DESC'])
  sortOrder?: 'ASC' | 'DESC' = 'ASC';
}
