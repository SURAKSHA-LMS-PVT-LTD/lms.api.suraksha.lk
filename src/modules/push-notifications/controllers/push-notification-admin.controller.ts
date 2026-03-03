import { 
  Controller, 
  Get, 
  Post, 
  Body, 
  Param, 
  Delete, 
  Query, 
  UseGuards,
  Req,
  HttpCode,
  HttpStatus,
  Put,
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
import { UserType } from '../../user/enums/user-type.enum';
import { PushNotificationService } from '../services/push-notification.service';
import { CreatePushNotificationDto } from '../dto/create-push-notification.dto';
import { QueryPushNotificationDto } from '../dto/query-push-notification.dto';
import { 
  PushNotificationResponseDto,
  PaginatedPushNotificationResponseDto,
  SendNotificationResultDto 
} from '../dto/push-notification-response.dto';
import { NotificationScope } from '../entities/push-notification.entity';

/**
 * Admin Controller for Push Notifications
 * Handles notification creation and management for:
 * - System Admins (SUPERADMIN): Global notifications
 * - Institute Admins: Institute-wide, class-wise, subject-wise notifications
 * - Teachers: Class-wise and subject-wise notifications
 */
@ApiTags('Push Notifications - Admin')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('push-notifications/admin')
@UseInterceptors(ClassSerializerInterceptor)
export class PushNotificationAdminController {
  constructor(private readonly pushNotificationService: PushNotificationService) {}

  /**
   * Create a new push notification
   * - SUPERADMIN: Can create GLOBAL, INSTITUTE, CLASS, SUBJECT scope
   * - Institute Admin: Can create INSTITUTE, CLASS, SUBJECT scope for their institute
   * - Teacher: Can create CLASS, SUBJECT scope for their classes/subjects
   */
  @Post()
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({
    global: [UserType.SUPERADMIN],
    instituteAdmin: true,
    teacher: true
  })
  @ApiOperation({ 
    summary: 'Create a new push notification',
    description: 'Create and optionally send a push notification. SUPERADMIN can create global notifications. Institute admins and teachers can create institute/class/subject level notifications.'
  })
  @ApiResponse({ status: 201, description: 'Notification created successfully', type: PushNotificationResponseDto })
  @ApiResponse({ status: 400, description: 'Invalid request' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  async create(
    @Body() createDto: CreatePushNotificationDto,
    @Req() request: Request
  ): Promise<PushNotificationResponseDto> {
    const user = request.user as any;
    const userId = user.s; // User ID from JWT
    const senderRole = this.getSenderRole(user, createDto.scope);

    return await this.pushNotificationService.create(createDto, userId, senderRole);
  }

  /**
   * Get all notifications with filters (admin view)
   */
  @Get()
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({
    global: [UserType.SUPERADMIN],
    instituteAdmin: true,
    teacher: true
  })
  @ApiOperation({ 
    summary: 'Get all notifications with filters',
    description: 'Retrieve notifications with pagination and filters. Results are filtered based on user role.'
  })
  @ApiResponse({ status: 200, description: 'Notifications retrieved successfully', type: PaginatedPushNotificationResponseDto })
  async findAll(
    @Query() queryDto: QueryPushNotificationDto,
    @Req() request: Request
  ): Promise<PaginatedPushNotificationResponseDto> {
    // Note: Service should filter based on user's access
    return await this.pushNotificationService.findAll(queryDto);
  }

  /**
   * Get a specific notification by ID
   */
  @Get(':id')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({
    global: [UserType.SUPERADMIN],
    instituteAdmin: true,
    teacher: true
  })
  @ApiOperation({ summary: 'Get notification by ID' })
  @ApiParam({ name: 'id', description: 'Notification ID' })
  @ApiResponse({ status: 200, description: 'Notification retrieved successfully', type: PushNotificationResponseDto })
  @ApiResponse({ status: 404, description: 'Notification not found' })
  async findOne(@Param('id', ParseBigIntPipe) id: string): Promise<PushNotificationResponseDto> {
    return await this.pushNotificationService.findOne(id);
  }

  /**
   * Send/resend a notification
   */
  @Post(':id/send')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({
    global: [UserType.SUPERADMIN],
    instituteAdmin: true,
    teacher: true
  })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ 
    summary: 'Send or resend a notification',
    description: 'Manually trigger sending of a draft or failed notification'
  })
  @ApiParam({ name: 'id', description: 'Notification ID' })
  @ApiResponse({ status: 200, description: 'Notification sent successfully', type: SendNotificationResultDto })
  @ApiResponse({ status: 404, description: 'Notification not found' })
  async send(@Param('id', ParseBigIntPipe) id: string): Promise<SendNotificationResultDto> {
    return await this.pushNotificationService.sendNotification(id);
  }

  /**
   * Resend a failed notification
   */
  @Post(':id/resend')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({
    global: [UserType.SUPERADMIN],
    instituteAdmin: true,
    teacher: true
  })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ 
    summary: 'Resend a failed notification',
    description: 'Retry sending a notification that previously failed'
  })
  @ApiParam({ name: 'id', description: 'Notification ID' })
  @ApiResponse({ status: 200, description: 'Notification resent successfully', type: SendNotificationResultDto })
  @ApiResponse({ status: 400, description: 'Only failed notifications can be resent' })
  @ApiResponse({ status: 404, description: 'Notification not found' })
  async resend(@Param('id', ParseBigIntPipe) id: string): Promise<SendNotificationResultDto> {
    return await this.pushNotificationService.resend(id);
  }

  /**
   * Cancel a scheduled notification
   */
  @Put(':id/cancel')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({
    global: [UserType.SUPERADMIN],
    instituteAdmin: true,
    teacher: true
  })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ 
    summary: 'Cancel a notification',
    description: 'Cancel a draft or scheduled notification (cannot cancel already sent notifications)'
  })
  @ApiParam({ name: 'id', description: 'Notification ID' })
  @ApiResponse({ status: 200, description: 'Notification cancelled successfully' })
  @ApiResponse({ status: 400, description: 'Cannot cancel sent notification' })
  @ApiResponse({ status: 404, description: 'Notification not found' })
  async cancel(@Param('id', ParseBigIntPipe) id: string): Promise<{ message: string }> {
    await this.pushNotificationService.cancel(id);
    return { message: 'Notification cancelled successfully' };
  }

  /**
   * Delete a notification
   */
  @Delete(':id')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({
    global: [UserType.SUPERADMIN],
    instituteAdmin: true
  })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete a notification' })
  @ApiParam({ name: 'id', description: 'Notification ID' })
  @ApiResponse({ status: 200, description: 'Notification deleted successfully' })
  @ApiResponse({ status: 404, description: 'Notification not found' })
  async delete(@Param('id', ParseBigIntPipe) id: string): Promise<{ message: string }> {
    await this.pushNotificationService.delete(id);
    return { message: 'Notification deleted successfully' };
  }

  /**
   * TEST ENDPOINT: Send a test notification to all users with active FCM tokens
   */
  private getSenderRole(user: any, scope: NotificationScope): string {
    // Check user type from JWT
    const userTypeKey = user.u; // Numeric user type from JWT

    if (userTypeKey === 0) { // SUPERADMIN
      return 'SYSTEM_ADMIN';
    }

    // Check institute roles
    const instituteAccess = user.i; // Institute access from JWT (array of {i, r, c})

    if (instituteAccess && Array.isArray(instituteAccess) && instituteAccess.length > 0) {
      const firstInstitute = instituteAccess[0];
      const roleBitmask = firstInstitute.r; // Role bitmask (IA=8, TE=4, ST=2, AM=1)

      // Check role bitmask flags
      if (roleBitmask & 8) return 'INSTITUTE_ADMIN';
      if (roleBitmask & 4) return 'TEACHER';
      if (roleBitmask & 2) return 'STUDENT';
      if (roleBitmask & 1) return 'ATTENDANCE_MARKER';
      return 'USER';
    }

    return 'USER';
  }
}
