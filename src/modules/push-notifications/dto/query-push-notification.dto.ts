import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsEnum, IsString, IsBoolean, IsDateString, IsIn } from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { NotificationScope, NotificationStatus, NotificationPriority } from '../entities/push-notification.entity';

/**
 * DTO for querying push notifications (admin)
 */
export class QueryPushNotificationDto {
  @ApiPropertyOptional({ description: 'Page number', example: 1 })
  @IsOptional()
  @Type(() => Number)
  page?: number = 1;

  @ApiPropertyOptional({ description: 'Items per page', example: 10 })
  @IsOptional()
  @Type(() => Number)
  limit?: number = 10;

  @ApiPropertyOptional({ description: 'Sort by field', example: 'createdAt', enum: ['createdAt', 'updatedAt', 'sentAt', 'title'] })
  @IsOptional()
  @IsString()
  @IsIn(['createdAt', 'updatedAt', 'sentAt', 'title'], { message: 'sortBy must be one of: createdAt, updatedAt, sentAt, title' })
  sortBy?: string = 'createdAt';

  @ApiPropertyOptional({ description: 'Sort order', enum: ['ASC', 'DESC'], example: 'DESC' })
  @IsOptional()
  @IsEnum(['ASC', 'DESC'])
  sortOrder?: 'ASC' | 'DESC' = 'DESC';

  @ApiPropertyOptional({ description: 'Filter by institute ID' })
  @IsOptional()
  @IsString()
  @Transform(({ value }) => value?.toString())
  instituteId?: string;

  @ApiPropertyOptional({ description: 'Filter by class ID' })
  @IsOptional()
  @IsString()
  @Transform(({ value }) => value?.toString())
  classId?: string;

  @ApiPropertyOptional({ description: 'Filter by subject ID' })
  @IsOptional()
  @IsString()
  @Transform(({ value }) => value?.toString())
  subjectId?: string;

  @ApiPropertyOptional({ description: 'Filter by scope', enum: NotificationScope })
  @IsOptional()
  @IsEnum(NotificationScope)
  scope?: NotificationScope;

  @ApiPropertyOptional({ description: 'Filter by status', enum: NotificationStatus })
  @IsOptional()
  @IsEnum(NotificationStatus)
  status?: NotificationStatus;

  @ApiPropertyOptional({ description: 'Filter by priority', enum: NotificationPriority })
  @IsOptional()
  @IsEnum(NotificationPriority)
  priority?: NotificationPriority;

  @ApiPropertyOptional({ description: 'Filter by sender ID' })
  @IsOptional()
  @IsString()
  @Transform(({ value }) => value?.toString())
  senderId?: string;

  @ApiPropertyOptional({ description: 'Search in title and body' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ description: 'Filter by date from (ISO string)' })
  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @ApiPropertyOptional({ description: 'Filter by date to (ISO string)' })
  @IsOptional()
  @IsDateString()
  dateTo?: string;
}

/**
 * DTO for querying user's notifications
 */
export class QueryUserNotificationsDto {
  @ApiPropertyOptional({ description: 'Page number', example: 1 })
  @IsOptional()
  @Type(() => Number)
  page?: number = 1;

  @ApiPropertyOptional({ description: 'Items per page', example: 20 })
  @IsOptional()
  @Type(() => Number)
  limit?: number = 20;

  @ApiPropertyOptional({ description: 'Filter by read status' })
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  isRead?: boolean;

  @ApiPropertyOptional({ description: 'Include deleted notifications', default: false })
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  includeDeleted?: boolean = false;

  @ApiPropertyOptional({ description: 'Filter by institute ID' })
  @IsOptional()
  @IsString()
  @Transform(({ value }) => value?.toString())
  instituteId?: string;

  @ApiPropertyOptional({ description: 'Filter by notification scope', enum: NotificationScope })
  @IsOptional()
  @IsEnum(NotificationScope)
  scope?: NotificationScope;

  @ApiPropertyOptional({ description: 'Search in title and body' })
  @IsOptional()
  @IsString()
  search?: string;
}
