import { IsBigIntId, IsOptionalBigIntId } from '../../../common/validators/bigint-id.validator';
import { IsOptional, IsString, IsBoolean, IsInt, Min, Max, IsEnum } from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

// Updated QuerySubjectDto with improved validation and institute/class filtering

export class QuerySubjectDto {
  @ApiPropertyOptional({ description: 'Search in code, name, or description' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ description: 'Filter by category' })
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional({ description: 'Filter by active status', type: Boolean })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === 'true' || value === true) return true;
    if (value === 'false' || value === false) return false;
    return undefined;
  })
  @IsBoolean()
  isActive?: boolean;

  @ApiProperty({ description: 'Filter subjects by institute ID - REQUIRED', example: '1' })
  @IsBigIntId()
  instituteId: string;

  @ApiPropertyOptional({ description: 'Filter subjects by class ID (requires instituteId)' })
  @IsOptionalBigIntId()
  classId?: string;

  @ApiPropertyOptional({ description: 'Filter by specific subject ID' })
  @IsOptionalBigIntId()
  subjectId?: string;

  @ApiPropertyOptional({ description: 'Page number for pagination' })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === undefined || value === null || value === '') return undefined;
    const parsed = parseInt(value);
    return isNaN(parsed) ? undefined : parsed;
  })
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ description: 'Number of records per page (-1 for all records)' })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === undefined || value === null || value === '') return undefined;
    const parsed = parseInt(value);
    return isNaN(parsed) ? undefined : parsed;
  })
  @IsInt()
  @Min(-1) // Allow -1 to mean "all records"
  @Max(1000) // Increased maximum to allow larger result sets
  limit?: number;

  @ApiPropertyOptional({ description: 'Sort field' })
  @IsOptional()
  @IsString()
  sortBy?: string;

  @ApiPropertyOptional({ description: 'Sort order', enum: ['ASC', 'DESC'] })
  @IsOptional()
  @IsString()
  sortOrder?: 'ASC' | 'DESC';
}
