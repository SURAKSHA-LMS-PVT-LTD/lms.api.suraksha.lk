import { IsBigIntId, IsOptionalBigIntId } from '../../../../common/validators/bigint-id.validator';
import { IsOptional, IsString, IsNumber, IsBoolean } from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { PaginationDto } from '../../../../common/dto/pagination.dto';

export class ClassFilterDto extends PaginationDto {
  @ApiPropertyOptional({
    description: 'Filter by institute ID',
    example: '12345'
  })
  @IsOptionalBigIntId()
  instituteId?: string;

  @ApiPropertyOptional({
    description: 'Filter by academic year',
    example: '2024'
  })
  @IsOptional()
  @IsString()
  academicYear?: string;

  @ApiPropertyOptional({
    description: 'Filter by grade/class level',
    example: 1
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  grade?: number;

  @ApiPropertyOptional({
    description: 'Filter by specialty/stream',
    example: 'Science'
  })
  @IsOptional()
  @IsString()
  specialty?: string;

  @ApiPropertyOptional({
    description: 'Filter by class type',
    example: 'Regular'
  })
  @IsOptional()
  @IsString()
  classType?: string;

  @ApiPropertyOptional({
    description: 'Filter by class teacher ID',
    example: 'teacher123'
  })
  @IsOptionalBigIntId()
  classTeacherId?: string;

  @ApiPropertyOptional({
    description: 'Search by class name or code',
    example: 'Physics'
  })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({
    description: 'Filter by active status',
    example: true
  })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === 'true' || value === true) return true;
    if (value === 'false' || value === false) return false;
    return value;
  })
  @IsBoolean()
  isActive?: boolean;
}
