import { IsBigIntId, IsOptionalBigIntId } from '../../../../common/validators/bigint-id.validator';
import { IsOptional, IsString, IsEnum, IsNumberString, IsIn } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { InstituteUserStatus } from '../enums/institute-user-status.enum';

export class QueryInstituteUserDto {
  @ApiPropertyOptional({
    description: 'Search by user name, email, or institute user ID',
    example: 'john'
  })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({
    description: 'Filter by institute ID',
    example: '1'
  })
  @IsOptionalBigIntId()
  instituteId?: string;

  @ApiPropertyOptional({
    description: 'Filter by user ID',
    example: '1'
  })
  @IsOptionalBigIntId()
  userId?: string;

  @ApiPropertyOptional({
    description: 'Filter by status',
    enum: InstituteUserStatus
  })
  @IsOptional()
  @IsEnum(InstituteUserStatus)
  status?: InstituteUserStatus;

  @ApiPropertyOptional({
    description: 'Page number for pagination',
    example: 1,
    default: 1
  })
  @IsOptional()
  @IsNumberString()
  page?: string;

  @ApiPropertyOptional({
    description: 'Number of items per page',
    example: 10,
    default: 10
  })
  @IsOptional()
  @IsNumberString()
  limit?: string;

  @ApiPropertyOptional({
    description: 'Sort field',
    example: 'createdAt',
    enum: ['createdAt', 'updatedAt', 'name', 'email']
  })
  @IsOptional()
  @IsString()
  @IsIn(['createdAt', 'updatedAt', 'name', 'email'], { message: 'sortBy must be one of: createdAt, updatedAt, name, email' })
  sortBy?: string;

  @ApiPropertyOptional({
    description: 'Sort order',
    example: 'DESC',
    enum: ['ASC', 'DESC']
  })
  @IsOptional()
  @IsString()
  @IsIn(['ASC', 'DESC'])
  sortOrder?: 'ASC' | 'DESC';
}
