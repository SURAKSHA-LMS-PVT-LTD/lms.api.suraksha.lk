import { IsOptional, IsString, IsEnum, IsBoolean, IsInt, Min, Max } from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptionalBigIntId } from '../../../../common/validators/bigint-id.validator';
import { HomeworkReferenceType, HomeworkReferenceSource } from '../entities/institute_class_subject_homework_reference.entity';

/**
 * DTO for querying homework references with filtering and pagination
 */
export class QueryHomeworkReferenceDto {
  @ApiPropertyOptional({
    description: 'Filter by homework ID',
    example: '123',
  })
  @IsOptional()
  @IsOptionalBigIntId()
  homeworkId?: string;

  @ApiPropertyOptional({
    description: 'Filter by reference type',
    enum: HomeworkReferenceType,
    example: HomeworkReferenceType.VIDEO,
  })
  @IsOptional()
  @IsEnum(HomeworkReferenceType)
  referenceType?: HomeworkReferenceType;

  @ApiPropertyOptional({
    description: 'Filter by reference source',
    enum: HomeworkReferenceSource,
    example: HomeworkReferenceSource.S3_UPLOAD,
  })
  @IsOptional()
  @IsEnum(HomeworkReferenceSource)
  referenceSource?: HomeworkReferenceSource;

  @ApiPropertyOptional({
    description: 'Filter by uploader ID',
    example: '456',
  })
  @IsOptional()
  @IsOptionalBigIntId()
  uploadedById?: string;

  @ApiPropertyOptional({
    description: 'Filter by active status (default: true)',
    example: true,
    default: true,
  })
  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => {
    if (value === 'true' || value === true) return true;
    if (value === 'false' || value === false) return false;
    return undefined;
  })
  isActive?: boolean;

  @ApiPropertyOptional({
    description: 'Search in title and description',
    example: 'chapter 1',
  })
  @IsOptional()
  @IsString()
  search?: string;

  // ========== PAGINATION ==========

  @ApiPropertyOptional({
    description: 'Page number (1-indexed)',
    example: 1,
    default: 1,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  page?: number = 1;

  @ApiPropertyOptional({
    description: 'Items per page (max 100)',
    example: 10,
    default: 10,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  @Type(() => Number)
  limit?: number = 10;

  // ========== SORTING ==========

  @ApiPropertyOptional({
    description: 'Sort by field',
    enum: ['displayOrder', 'title', 'createdAt', 'updatedAt', 'referenceType'],
    example: 'displayOrder',
    default: 'displayOrder',
  })
  @IsOptional()
  @IsString()
  sortBy?: 'displayOrder' | 'title' | 'createdAt' | 'updatedAt' | 'referenceType' = 'displayOrder';

  @ApiPropertyOptional({
    description: 'Sort order',
    enum: ['ASC', 'DESC'],
    example: 'ASC',
    default: 'ASC',
  })
  @IsOptional()
  @IsEnum(['ASC', 'DESC'])
  sortOrder?: 'ASC' | 'DESC' = 'ASC';
}
