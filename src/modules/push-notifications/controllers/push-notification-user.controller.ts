import { 
  Controller, 
  Get, 
  Post,
  Param, 
  Query, 
  UseGuards,
  Req,
  HttpCode,
  HttpStatus,
  Body,
  UseInterceptors,
  ClassSerializerInterceptor
} from '@nestjs/common';
import { 
  ApiTags, 
  ApiOperation, 
  ApiResponse, 
  ApiParam, 
  ApiBearerAuth,
  ApiQuery 
} from '@nestjs/swagger';
import { Request } from 'express';
import { JwtAuthGuard } from '../../../auth/guards/jwt-auth.guard';
import { FlexibleAccessGuard } from '../../../auth/guards/flexible-access.guard';
import { RequireAnyOfRoles } from '../../../auth/decorators/flexible-access.decorator';
import { SkipThrottle } from '../../../common/decorators/throttle.decorator';
import { ParseIdPipe } from '../../../common/pipes/parse-id.pipe';
import { UserType } from '../../user/enums/user-type.enum';
import { PushNotificationService } from '../services/push-notification.service';
import { QueryUserNotificationsDto } from '../dto/query-push-notification.dto';
import { 
  UserNotificationResponseDto,
  PaginatedUserNotificationResponseDto,
  UnreadCountResponseDto
} from '../dto/push-notification-response.dto';

/**
 * User Controller for Push Notifications
 * Handles notification viewing and read status for all authenticated users
 */
@ApiTags('Push Notifications - User')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('push-notifications')
@UseInterceptors(ClassSerializerInterceptor)
export class PushNotificationUserController {
  constructor(private readonly pushNotificationService: PushNotificationService) {}

  /**
   * Get ALL notifications for the current user across every institute and global scope.
   * This is the unified inbox — returns everything the user was sent, with read status.
   * Supports optional filters: scope, instituteId, isRead, search.
   */
  @Get('my')
  @ApiOperation({
    summary: 'Get all my notifications',
    description:
      'Returns ALL notifications for the current user across all institutes and global scope in a single paginated response. ' +
      'Supports filtering by scope, instituteId, isRead, and search. Includes total unread count.',
  })
  @ApiResponse({ status: 200, description: 'All notifications retrieved successfully', type: PaginatedUserNotificationResponseDto })
  async getMyNotifications(
    @Query() queryDto: QueryUserNotificationsDto,
    @Req() request: Request,
  ): Promise<PaginatedUserNotificationResponseDto> {
    const user = request.user as any;
    return await this.pushNotificationService.findAllForUser(user.s, queryDto);
  }

  /**
   * Get total unread notification count across ALL scopes for the current user.
   * Useful for global badge counts (e.g. a bell icon with a number across all institutes).
   */
  @Get('my/unread-count')
  @SkipThrottle()
  @ApiOperation({
    summary: 'Get total unread count across all scopes',
    description: 'Returns the total number of unread notifications for the current user across all institutes and global scope.',
  })
  @ApiResponse({ status: 200, description: 'Unread count retrieved', type: UnreadCountResponseDto })
  async getMyUnreadCount(@Req() request: Request): Promise<UnreadCountResponseDto> {
    const user = request.user as any;
    return await this.pushNotificationService.getUnreadCountAll(user.s);
  }

  /**
   * Mark ALL notifications as read for the current user across all scopes.
   */
  @Post('my/mark-all-read')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Mark all notifications as read (all scopes)',
    description: 'Marks every unread notification as read for the current user across all institutes and global scope.',
  })
  @ApiResponse({ status: 200, description: 'All notifications marked as read' })
  async markAllMyNotificationsRead(
    @Req() request: Request,
  ): Promise<{ success: boolean; updatedCount: number }> {
    const user = request.user as any;
    const updatedCount = await this.pushNotificationService.markAllAsReadForUser(user.s);
    return { success: true, updatedCount };
  }

  /**
   * Get notifications for a specific institute
   * Returns all notifications (institute-wide, class-level, subject-level) for the given institute
   */
  @Get('institute/:instituteId')
  @ApiOperation({ 
    summary: 'Get notifications for an institute',
    description: 'Get all notifications for a specific institute including institute-wide, class-level, and subject-level notifications'
  })
  @ApiParam({ name: 'instituteId', description: 'Institute ID' })
  @ApiResponse({ status: 200, description: 'Notifications retrieved successfully', type: PaginatedUserNotificationResponseDto })
  async getInstituteNotifications(
    @Param('instituteId', ParseIdPipe) instituteId: string,
    @Query() queryDto: QueryUserNotificationsDto,
    @Req() request: Request
  ): Promise<PaginatedUserNotificationResponseDto> {
    const user = request.user as any;
    const userId = user.s; // User ID from JWT

    return await this.pushNotificationService.findByInstituteId(instituteId, queryDto, userId);
  }

  /**
   * Get system/global notifications only
   * Returns only GLOBAL scope notifications (not institute-specific)
   */
  @Get('system')
  @ApiOperation({ 
    summary: 'Get system notifications',
    description: 'Get global/system-wide notifications only (not institute-specific). Available to all authenticated users.'
  })
  @ApiResponse({ status: 200, description: 'System notifications retrieved successfully', type: PaginatedUserNotificationResponseDto })
  async getSystemNotifications(
    @Query() queryDto: QueryUserNotificationsDto,
    @Req() request: Request
  ): Promise<PaginatedUserNotificationResponseDto> {
    const user = request.user as any;
    const userId = user.s;

    return await this.pushNotificationService.findSystemNotifications(queryDto, userId);
  }

  /**
   * Get unread count for institute notifications
   */
  @Get('institute/:instituteId/unread-count')
  @SkipThrottle()
  @ApiOperation({ 
    summary: 'Get unread notification count for an institute',
    description: 'Get the count of unread notifications for a specific institute'
  })
  @ApiParam({ name: 'instituteId', description: 'Institute ID' })
  @ApiResponse({ status: 200, description: 'Unread count retrieved successfully', type: UnreadCountResponseDto })
  async getInstituteUnreadCount(
    @Param('instituteId', ParseIdPipe) instituteId: string,
    @Req() request: Request
  ): Promise<UnreadCountResponseDto> {
    const user = request.user as any;
    const userId = user.s;

    const result = await this.pushNotificationService.getUnreadCount(userId, instituteId);
    return { unreadCount: result.unreadCount, totalCount: 0 }; // totalCount could be added if needed
  }

  /**
   * Get unread count for system notifications
   */
  @Get('system/unread-count')
  @SkipThrottle()
  @ApiOperation({ 
    summary: 'Get unread system notification count',
    description: 'Get the count of unread global/system notifications. Available to all authenticated users.'
  })
  @ApiResponse({ status: 200, description: 'Unread count retrieved successfully', type: UnreadCountResponseDto })
  async getSystemUnreadCount(@Req() request: Request): Promise<UnreadCountResponseDto> {
    const user = request.user as any;
    const userId = user.s;

    const result = await this.pushNotificationService.getUnreadCount(userId);
    return { unreadCount: result.unreadCount, totalCount: 0 };
  }

  /**
   * Mark a notification as read
   */
  @Post(':id/read')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ 
    summary: 'Mark notification as read',
    description: 'Mark a specific notification as read for the current user'
  })
  @ApiParam({ name: 'id', description: 'Notification ID' })
  @ApiResponse({ status: 200, description: 'Notification marked as read' })
  async markAsRead(
    @Param('id', ParseIdPipe) id: string,
    @Req() request: Request
  ): Promise<{ message: string }> {
    const user = request.user as any;
    const userId = user.s;

    await this.pushNotificationService.markAsRead(id, userId);
    return { message: 'Notification marked as read' };
  }

  /**
   * Mark multiple notifications as read
   */
  @Post('mark-read')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ 
    summary: 'Mark multiple notifications as read',
    description: 'Mark multiple notifications as read for the current user'
  })
  @ApiResponse({ status: 200, description: 'Notifications marked as read' })
  async markMultipleAsRead(
    @Body() body: { notificationIds: string[] },
    @Req() request: Request
  ): Promise<{ message: string; count: number }> {
    const user = request.user as any;
    const userId = user.s;

    await this.pushNotificationService.markMultipleAsRead(body.notificationIds, userId);
    return { 
      message: 'Notifications marked as read',
      count: body.notificationIds.length
    };
  }

  /**
   * Mark all institute notifications as read
   */
  @Post('institute/:instituteId/mark-all-read')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ 
    summary: 'Mark all institute notifications as read',
    description: 'Mark all notifications for a specific institute as read'
  })
  @ApiParam({ name: 'instituteId', description: 'Institute ID' })
  @ApiResponse({ status: 200, description: 'All notifications marked as read' })
  async markAllInstituteAsRead(
    @Param('instituteId', ParseIdPipe) instituteId: string,
    @Req() request: Request
  ): Promise<{ message: string }> {
    const user = request.user as any;
    const userId = user.s;

    const count = await this.pushNotificationService.markAllAsReadForInstitute(userId, instituteId);
    return { message: `Marked ${count} notifications as read` };
  }

  /**
   * Get a single notification details
   */
  @Get(':id')
  @ApiOperation({ 
    summary: 'Get notification details',
    description: 'Get details of a specific notification'
  })
  @ApiParam({ name: 'id', description: 'Notification ID' })
  @ApiResponse({ status: 200, description: 'Notification retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Notification not found' })
  async getNotification(
    @Param('id', ParseIdPipe) id: string,
    @Req() request: Request
  ): Promise<UserNotificationResponseDto> {
    const user = request.user as any;
    const userId = user.s;

    const notification = await this.pushNotificationService.findOne(id);
    
    // Mark as read when viewing
    await this.pushNotificationService.markAsRead(id, userId);

    return notification as any; // Type cast for response
  }
}

