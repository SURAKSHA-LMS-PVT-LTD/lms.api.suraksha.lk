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
import { ParseBigIntPipe } from '../../../common/pipes/parse-bigint.pipe';
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
   * Get notifications for a specific institute
   * Returns all notifications (institute-wide, class-level, subject-level) for the given institute
   */
  @Get('institute/:instituteId')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({
    anyInstituteRole: true,
    global: []
  })
  @ApiOperation({ 
    summary: 'Get notifications for an institute',
    description: 'Get all notifications for a specific institute including institute-wide, class-level, and subject-level notifications'
  })
  @ApiParam({ name: 'instituteId', description: 'Institute ID' })
  @ApiResponse({ status: 200, description: 'Notifications retrieved successfully', type: PaginatedUserNotificationResponseDto })
  async getInstituteNotifications(
    @Param('instituteId', ParseBigIntPipe) instituteId: string,
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
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({
    anyInstituteRole: true,
    global: []
  })
  @ApiOperation({ 
    summary: 'Get system notifications',
    description: 'Get global/system-wide notifications only (not institute-specific)'
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
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({
    anyInstituteRole: true,
    global: []
  })
  @ApiOperation({ 
    summary: 'Get unread notification count for an institute',
    description: 'Get the count of unread notifications for a specific institute'
  })
  @ApiParam({ name: 'instituteId', description: 'Institute ID' })
  @ApiResponse({ status: 200, description: 'Unread count retrieved successfully', type: UnreadCountResponseDto })
  async getInstituteUnreadCount(
    @Param('instituteId', ParseBigIntPipe) instituteId: string,
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
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({
    anyInstituteRole: true,
    global: []
  })
  @ApiOperation({ 
    summary: 'Get unread system notification count',
    description: 'Get the count of unread global/system notifications'
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
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({
    anyInstituteRole: true,
    global: []
  })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ 
    summary: 'Mark notification as read',
    description: 'Mark a specific notification as read for the current user'
  })
  @ApiParam({ name: 'id', description: 'Notification ID' })
  @ApiResponse({ status: 200, description: 'Notification marked as read' })
  async markAsRead(
    @Param('id', ParseBigIntPipe) id: string,
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
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({
    anyInstituteRole: true,
    global: []
  })
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
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({
    anyInstituteRole: true,
    global: []
  })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ 
    summary: 'Mark all institute notifications as read',
    description: 'Mark all notifications for a specific institute as read'
  })
  @ApiParam({ name: 'instituteId', description: 'Institute ID' })
  @ApiResponse({ status: 200, description: 'All notifications marked as read' })
  async markAllInstituteAsRead(
    @Param('instituteId', ParseBigIntPipe) instituteId: string,
    @Req() request: Request
  ): Promise<{ message: string }> {
    const user = request.user as any;
    const userId = user.s;

    // Get all unread notifications for this institute and mark them as read
    const result = await this.pushNotificationService.findByInstituteId(
      instituteId, 
      { page: 1, limit: 1000 }, // Get all notifications
      userId
    );
    
    const unreadIds = result.data.filter(n => !n.isRead).map(n => n.id);
    if (unreadIds.length > 0) {
      await this.pushNotificationService.markMultipleAsRead(unreadIds, userId);
    }

    return { message: `Marked ${unreadIds.length} notifications as read` };
  }

  /**
   * Get a single notification details
   */
  @Get(':id')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({
    anyInstituteRole: true,
    global: []
  })
  @ApiOperation({ 
    summary: 'Get notification details',
    description: 'Get details of a specific notification'
  })
  @ApiParam({ name: 'id', description: 'Notification ID' })
  @ApiResponse({ status: 200, description: 'Notification retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Notification not found' })
  async getNotification(
    @Param('id', ParseBigIntPipe) id: string,
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
