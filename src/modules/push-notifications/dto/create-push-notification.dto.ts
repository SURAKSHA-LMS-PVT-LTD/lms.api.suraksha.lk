import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsOptional, IsEnum, IsArray, IsObject, IsDateString, MaxLength, IsUrl, ValidateIf } from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { NotificationScope, NotificationTargetUserType, NotificationPriority } from '../entities/push-notification.entity';

/**
 * DTO for creating a new push notification
 * Used by admins and teachers
 */
export class CreatePushNotificationDto {
  @ApiProperty({ description: 'Notification title', example: 'Important Announcement' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  title: string;

  @ApiProperty({ description: 'Notification body/message', example: 'Classes will be cancelled tomorrow due to weather conditions.' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(5000)
  body: string;

  @ApiPropertyOptional({ description: 'Image URL for the notification', example: 'https://example.com/image.jpg' })
  @IsOptional()
  @IsString()
  @IsUrl()
  @MaxLength(500)
  imageUrl?: string;

  @ApiPropertyOptional({ description: 'Icon name for the notification', example: 'ic_announcement' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  icon?: string;

  @ApiPropertyOptional({ description: 'Deep link or URL when notification is clicked', example: 'app://announcements/123' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  actionUrl?: string;

  @ApiPropertyOptional({ description: 'Additional data payload', example: { announcementId: '123', type: 'general' } })
  @IsOptional()
  @IsObject()
  dataPayload?: Record<string, string>;

  @ApiProperty({ description: 'Notification scope', enum: NotificationScope, example: NotificationScope.INSTITUTE })
  @IsEnum(NotificationScope)
  scope: NotificationScope;

  @ApiProperty({ description: 'Target user types', type: [String], enum: NotificationTargetUserType, example: [NotificationTargetUserType.STUDENTS, NotificationTargetUserType.PARENTS] })
  @IsArray()
  @IsEnum(NotificationTargetUserType, { each: true })
  targetUserTypes: NotificationTargetUserType[];

  @ApiPropertyOptional({ description: 'Institute ID (required for non-global notifications)' })
  @ValidateIf(o => o.scope !== NotificationScope.GLOBAL)
  @IsOptional()
  @IsString()
  @Transform(({ value }) => value?.toString())
  instituteId?: string;

  @ApiPropertyOptional({ description: 'Class ID (required for class-scope notifications)' })
  @ValidateIf(o => o.scope === NotificationScope.CLASS || o.scope === NotificationScope.SUBJECT)
  @IsOptional()
  @IsString()
  @Transform(({ value }) => value?.toString())
  classId?: string;

  @ApiPropertyOptional({ description: 'Subject ID (required for subject-scope notifications)' })
  @ValidateIf(o => o.scope === NotificationScope.SUBJECT)
  @IsOptional()
  @IsString()
  @Transform(({ value }) => value?.toString())
  subjectId?: string;

  @ApiPropertyOptional({ description: 'Notification priority', enum: NotificationPriority, example: NotificationPriority.NORMAL })
  @IsOptional()
  @IsEnum(NotificationPriority)
  priority?: NotificationPriority;

  @ApiPropertyOptional({ description: 'FCM collapse key for grouping notifications', example: 'announcement_general' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  collapseKey?: string;

  @ApiPropertyOptional({ description: 'Time to live in seconds (default 24 hours)', example: 86400 })
  @IsOptional()
  @Type(() => Number)
  timeToLive?: number;

  @ApiPropertyOptional({ description: 'Schedule notification for later (ISO date string)', example: '2026-01-22T10:00:00.000Z' })
  @IsOptional()
  @IsDateString()
  scheduledAt?: string;

  @ApiPropertyOptional({ description: 'Send immediately without scheduling', example: true, default: true })
  @IsOptional()
  sendImmediately?: boolean;
}
