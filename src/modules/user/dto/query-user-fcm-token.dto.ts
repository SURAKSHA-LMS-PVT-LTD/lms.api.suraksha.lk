import { IsBigIntId, IsOptionalBigIntId } from '../../../common/validators/bigint-id.validator';
import { IsOptional, IsString, IsEnum, IsBoolean, IsInt, IsIn, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { DeviceType } from '../entities/user-fcm-token.entity';

export class QueryUserFcmTokenDto {
  @ApiPropertyOptional({ description: 'User ID to filter tokens' })
  @IsOptionalBigIntId()
  userId?: string;

  @ApiPropertyOptional({ enum: DeviceType, description: 'Device type filter' })
  @IsOptional()
  @IsEnum(DeviceType)
  deviceType?: DeviceType;

  @ApiPropertyOptional({ description: 'Filter by active status' })
  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  isActive?: boolean;

  @ApiPropertyOptional({ description: 'Filter by sync status' })
  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  isSynced?: boolean;

  @ApiPropertyOptional({ description: 'Search in device ID or device name' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ description: 'Page number for pagination', default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ description: 'Number of items per page', default: 10 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 10;

  @ApiPropertyOptional({ description: 'Sort by field', default: 'createdAt', enum: ['createdAt', 'updatedAt', 'lastSeen', 'userId'] })
  @IsOptional()
  @IsString()
  @IsIn(['createdAt', 'updatedAt', 'lastSeen', 'userId'], { message: 'sortBy must be one of: createdAt, updatedAt, lastSeen, userId' })
  sortBy?: string = 'createdAt';

  @ApiPropertyOptional({ description: 'Sort order', enum: ['ASC', 'DESC'], default: 'DESC' })
  @IsOptional()
  @IsEnum(['ASC', 'DESC'])
  sortOrder?: 'ASC' | 'DESC' = 'DESC';
}
