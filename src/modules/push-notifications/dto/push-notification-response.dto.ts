import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Exclude, Expose, Type } from 'class-transformer';
import { NotificationScope, NotificationTargetUserType, NotificationPriority, NotificationStatus } from '../entities/push-notification.entity';

/**
 * Response DTO for institute info in notifications
 */
export class InstituteInfoDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  name: string;

  @ApiPropertyOptional()
  logoUrl?: string;
}

/**
 * Response DTO for class info in notifications
 */
export class ClassInfoDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  name: string;

  @ApiPropertyOptional()
  code?: string;
}

/**
 * Response DTO for subject info in notifications
 */
export class SubjectInfoDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  name: string;

  @ApiPropertyOptional()
  code?: string;
}

/**
 * Response DTO for sender info
 */
export class SenderInfoDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  firstName: string;

  @ApiProperty()
  lastName: string;

  @ApiProperty()
  nameWithInitials: string;

  @ApiPropertyOptional()
  imageUrl?: string;
}

/**
 * Response DTO for push notification (admin view)
 */
@Exclude()
export class PushNotificationResponseDto {
  @Expose()
  @ApiProperty()
  id: string;

  @Expose()
  @ApiProperty()
  title: string;

  @Expose()
  @ApiProperty()
  body: string;

  @Expose()
  @ApiPropertyOptional()
  imageUrl?: string;

  @Expose()
  @ApiPropertyOptional()
  icon?: string;

  @Expose()
  @ApiPropertyOptional()
  actionUrl?: string;

  @Expose()
  @ApiPropertyOptional()
  dataPayload?: Record<string, string>;

  @Expose()
  @ApiProperty({ enum: NotificationScope })
  scope: NotificationScope;

  @Expose()
  @ApiProperty({ type: [String], enum: NotificationTargetUserType })
  targetUserTypes: NotificationTargetUserType[];

  @Expose()
  @ApiPropertyOptional()
  instituteId?: string;

  @Expose()
  @ApiPropertyOptional({ type: InstituteInfoDto })
  @Type(() => InstituteInfoDto)
  institute?: InstituteInfoDto;

  @Expose()
  @ApiPropertyOptional()
  classId?: string;

  @Expose()
  @ApiPropertyOptional({ type: ClassInfoDto })
  @Type(() => ClassInfoDto)
  class?: ClassInfoDto;

  @Expose()
  @ApiPropertyOptional()
  subjectId?: string;

  @Expose()
  @ApiPropertyOptional({ type: SubjectInfoDto })
  @Type(() => SubjectInfoDto)
  subject?: SubjectInfoDto;

  @Expose()
  @ApiProperty({ enum: NotificationPriority })
  priority: NotificationPriority;

  @Expose()
  @ApiProperty({ enum: NotificationStatus })
  status: NotificationStatus;

  @Expose()
  @ApiPropertyOptional()
  collapseKey?: string;

  @Expose()
  @ApiProperty()
  timeToLive: number;

  @Expose()
  @ApiPropertyOptional()
  scheduledAt?: Date;

  @Expose()
  @ApiPropertyOptional()
  sentAt?: Date;

  @Expose()
  @ApiProperty()
  senderId: string;

  @Expose()
  @ApiProperty()
  senderRole: string;

  @Expose()
  @ApiPropertyOptional({ type: SenderInfoDto })
  @Type(() => SenderInfoDto)
  sender?: SenderInfoDto;

  @Expose()
  @ApiProperty()
  totalRecipients: number;

  @Expose()
  @ApiProperty()
  sentCount: number;

  @Expose()
  @ApiProperty()
  failedCount: number;

  @Expose()
  @ApiProperty()
  readCount: number;

  @Expose()
  @ApiProperty()
  createdAt: Date;

  @Expose()
  @ApiProperty()
  updatedAt: Date;
}

/**
 * Response DTO for user's notification view (simplified - no per-user tracking)
 */
@Exclude()
export class UserNotificationResponseDto {
  @Expose()
  @ApiProperty({ description: 'Notification ID' })
  id: string;

  @Expose()
  @ApiProperty()
  title: string;

  @Expose()
  @ApiProperty()
  body: string;

  @Expose()
  @ApiPropertyOptional()
  imageUrl?: string;

  @Expose()
  @ApiPropertyOptional()
  icon?: string;

  @Expose()
  @ApiPropertyOptional()
  actionUrl?: string;

  @Expose()
  @ApiPropertyOptional()
  dataPayload?: Record<string, string>;

  @Expose()
  @ApiProperty({ enum: NotificationScope })
  scope: NotificationScope;

  @Expose()
  @ApiProperty({ enum: NotificationPriority })
  priority: NotificationPriority;

  @Expose()
  @ApiPropertyOptional({ type: InstituteInfoDto })
  @Type(() => InstituteInfoDto)
  institute?: InstituteInfoDto;

  @Expose()
  @ApiPropertyOptional({ type: ClassInfoDto })
  @Type(() => ClassInfoDto)
  class?: ClassInfoDto;

  @Expose()
  @ApiPropertyOptional({ type: SubjectInfoDto })
  @Type(() => SubjectInfoDto)
  subject?: SubjectInfoDto;

  @Expose()
  @ApiPropertyOptional({ type: SenderInfoDto })
  @Type(() => SenderInfoDto)
  sender?: SenderInfoDto;

  @Expose()
  @ApiProperty()
  senderRole: string;

  @Expose()
  @ApiProperty({ description: 'Whether user has read this notification' })
  isRead: boolean;

  @Expose()
  @ApiPropertyOptional()
  readAt?: Date;

  @Expose()
  @ApiProperty({ description: 'When the notification was created/sent' })
  createdAt: Date;
}

/**
 * Paginated response for notifications (admin)
 */
export class PaginatedPushNotificationResponseDto {
  @ApiProperty({ type: [PushNotificationResponseDto] })
  data: PushNotificationResponseDto[];

  @ApiProperty()
  total: number;

  @ApiProperty()
  page: number;

  @ApiProperty()
  limit: number;

  @ApiProperty()
  totalPages: number;
}

/**
 * Paginated response for user notifications
 */
export class PaginatedUserNotificationResponseDto {
  @ApiProperty({ type: [UserNotificationResponseDto] })
  data: UserNotificationResponseDto[];

  @ApiProperty()
  total: number;

  @ApiProperty()
  page: number;

  @ApiProperty()
  limit: number;

  @ApiProperty()
  totalPages: number;

  @ApiProperty({ description: 'Total unread count' })
  unreadCount: number;
}

/**
 * Send notification result
 */
export class SendNotificationResultDto {
  @ApiProperty()
  success: boolean;

  @ApiProperty()
  notificationId: string;

  @ApiProperty()
  totalRecipients: number;

  @ApiProperty()
  sentCount: number;

  @ApiProperty()
  failedCount: number;

  @ApiPropertyOptional()
  message?: string;
}

/**
 * Unread count response
 */
export class UnreadCountResponseDto {
  @ApiProperty()
  unreadCount: number;

  @ApiProperty()
  totalCount: number;
}
