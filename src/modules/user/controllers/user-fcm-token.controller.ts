import { ParseBigIntPipe } from '../../../common/pipes/parse-bigint.pipe';
import { Controller, Get, Post, Body, Patch, Param, Delete, Query, UseInterceptors, ClassSerializerInterceptor, HttpStatus, HttpCode, ValidationPipe, Put, UseGuards, Request, ForbiddenException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../auth/guards/jwt-auth.guard';
import { FlexibleAccessGuard } from '../../../auth/guards/flexible-access.guard';
import { RequireAnyOfRoles } from '../../../auth/decorators/flexible-access.decorator';
import { UserType } from '../enums/user-type.enum';
import { UserFcmTokenService } from '../services/user-fcm-token.service';
import { CreateUserFcmTokenDto } from '../dto/create-user-fcm-token.dto';
import { UpdateUserFcmTokenDto } from '../dto/update-user-fcm-token.dto';
import { QueryUserFcmTokenDto } from '../dto/query-user-fcm-token.dto';
import { UserFcmTokenResponseDto } from '../dto/user-fcm-token-response.dto';
import { PaginatedUserFcmTokenResponseDto } from '../dto/paginated-user-fcm-token-response.dto';
import { JwtRequest, JwtRequestHelper } from '@common/interfaces/jwt-request.interface';

@ApiTags('user-fcm-tokens')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('users/fcm-tokens')
@UseInterceptors(ClassSerializerInterceptor)
export class UserFcmTokenController {
  constructor(private readonly userFcmTokenService: UserFcmTokenService) {}

  @Post()
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({
    anyInstituteRole: true,
    global: [UserType.SUPERADMIN, UserType.ORGANIZATION_MANAGER, UserType.USER, UserType.USER_WITHOUT_PARENT, UserType.USER_WITHOUT_STUDENT]
  })
  @ApiOperation({ 
    summary: 'Register or update FCM token for push notifications',
    description: 'Register a new FCM token or update existing one for a user device. Available to all authenticated users regardless of role.'
  })
  @ApiResponse({ status: 201, description: 'FCM token registered successfully', type: UserFcmTokenResponseDto })
  @ApiResponse({ status: 400, description: 'Bad request' })
  @ApiResponse({ status: 409, description: 'Conflict - Token already exists' })
  async register(@Body() createDto: CreateUserFcmTokenDto): Promise<UserFcmTokenResponseDto> {
    return await this.userFcmTokenService.create(createDto);
  }

  @Get()
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({
    global: [UserType.SUPERADMIN],
    instituteAdmin: true
  })
  @ApiOperation({ 
    summary: 'Get FCM tokens with filtering and pagination',
    description: 'Retrieve FCM tokens with various filters like userId, deviceType, active status, etc.'
  })
  @ApiResponse({ status: 200, description: 'FCM tokens retrieved successfully', type: PaginatedUserFcmTokenResponseDto })
  async findAll(@Query() queryDto: QueryUserFcmTokenDto): Promise<PaginatedUserFcmTokenResponseDto> {
    return await this.userFcmTokenService.findAll(queryDto);
  }

  @Get(':id')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({
    anyInstituteRole: true,
    global: []
  })
  @ApiOperation({ summary: 'Get FCM token by ID' })
  @ApiParam({ name: 'id', description: 'FCM token ID' })
  @ApiResponse({ status: 200, description: 'FCM token retrieved successfully', type: UserFcmTokenResponseDto })
  @ApiResponse({ status: 404, description: 'FCM token not found' })
  async findOne(@Param('id', ParseBigIntPipe) id: string): Promise<UserFcmTokenResponseDto> {
    return await this.userFcmTokenService.findOne(id);
  }

  @Get('user/:userId')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({
    anyInstituteRole: true,
    global: [UserType.SUPERADMIN]
  })
  @ApiOperation({ summary: 'Get all FCM tokens for a specific user' })
  @ApiParam({ name: 'userId', description: 'User ID' })
  @ApiResponse({ status: 200, description: 'User FCM tokens retrieved successfully', type: [UserFcmTokenResponseDto] })
  async findByUserId(
    @Param('userId', ParseBigIntPipe) userId: string,
    @Request() req: JwtRequest,
  ): Promise<UserFcmTokenResponseDto[]> {
    // Ownership check: users can only access their own tokens unless superadmin
    const requestingUserId = JwtRequestHelper.getUserId(req.user);
    if (requestingUserId !== userId && !JwtRequestHelper.isSuperAdmin(req.user)) {
      throw new ForbiddenException('You can only access your own FCM tokens');
    }
    return await this.userFcmTokenService.findByUserId(userId);
  }

  @Get('user/:userId/active')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({
    anyInstituteRole: true,
    global: [UserType.SUPERADMIN]
  })
  @ApiOperation({ summary: 'Get active FCM tokens for a specific user' })
  @ApiParam({ name: 'userId', description: 'User ID' })
  @ApiResponse({ status: 200, description: 'Active user FCM tokens retrieved successfully', type: [UserFcmTokenResponseDto] })
  async findActiveByUserId(
    @Param('userId', ParseBigIntPipe) userId: string,
    @Request() req: JwtRequest,
  ): Promise<UserFcmTokenResponseDto[]> {
    // Ownership check: users can only access their own tokens unless superadmin
    const requestingUserId = JwtRequestHelper.getUserId(req.user);
    if (requestingUserId !== userId && !JwtRequestHelper.isSuperAdmin(req.user)) {
      throw new ForbiddenException('You can only access your own FCM tokens');
    }
    return await this.userFcmTokenService.findActiveTokensByUserId(userId);
  }

  @Get('user/:userId/count')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({
    anyInstituteRole: true,
    global: []
  })
  @ApiOperation({ summary: 'Get token count statistics for a user' })
  @ApiParam({ name: 'userId', description: 'User ID' })
  @ApiResponse({ status: 200, description: 'Token count retrieved successfully' })
  async getTokenCount(@Param('userId', ParseBigIntPipe) userId: string): Promise<{ total: number; active: number; inactive: number }> {
    return await this.userFcmTokenService.getTokenCountByUser(userId);
  }

  @Patch(':id')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({
    anyInstituteRole: true,
    global: []
  })
  @ApiOperation({ summary: 'Update FCM token' })
  @ApiParam({ name: 'id', description: 'FCM token ID' })
  @ApiResponse({ status: 200, description: 'FCM token updated successfully', type: UserFcmTokenResponseDto })
  @ApiResponse({ status: 404, description: 'FCM token not found' })
  async update(
    @Param('id', ParseBigIntPipe) id: string,
    @Body() updateDto: UpdateUserFcmTokenDto
  ): Promise<UserFcmTokenResponseDto> {
    return await this.userFcmTokenService.update(id, updateDto);
  }

  @Put(':id/last-seen')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({
    anyInstituteRole: true,
    global: []
  })
  @ApiOperation({ summary: 'Update last seen timestamp for FCM token' })
  @ApiParam({ name: 'id', description: 'FCM token ID' })
  @ApiResponse({ status: 200, description: 'Last seen updated successfully' })
  @ApiResponse({ status: 404, description: 'FCM token not found' })
  @HttpCode(HttpStatus.OK)
  async updateLastSeen(@Param('id', ParseBigIntPipe) id: string): Promise<void> {
    await this.userFcmTokenService.updateLastSeen(id);
  }

  @Put(':id/notification-sent')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({
    anyInstituteRole: true,
    global: []
  })
  @ApiOperation({ summary: 'Update last notification sent timestamp for FCM token' })
  @ApiParam({ name: 'id', description: 'FCM token ID' })
  @ApiResponse({ status: 200, description: 'Last notification sent updated successfully' })
  @ApiResponse({ status: 404, description: 'FCM token not found' })
  @HttpCode(HttpStatus.OK)
  async updateLastNotificationSent(@Param('id', ParseBigIntPipe) id: string): Promise<void> {
    await this.userFcmTokenService.updateLastNotificationSent(id);
  }

  @Put(':id/deactivate')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({
    anyInstituteRole: true,
    global: []
  })
  @ApiOperation({ summary: 'Deactivate FCM token' })
  @ApiParam({ name: 'id', description: 'FCM token ID' })
  @ApiResponse({ status: 200, description: 'FCM token deactivated successfully' })
  @ApiResponse({ status: 404, description: 'FCM token not found' })
  @HttpCode(HttpStatus.OK)
  async deactivate(@Param('id', ParseBigIntPipe) id: string): Promise<void> {
    await this.userFcmTokenService.deactivateToken(id);
  }

  @Put('user/:userId/deactivate-all')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({
    anyInstituteRole: true,
    global: [UserType.SUPERADMIN]
  })
  @ApiOperation({ summary: 'Deactivate all FCM tokens for a user' })
  @ApiParam({ name: 'userId', description: 'User ID' })
  @ApiResponse({ status: 200, description: 'All user FCM tokens deactivated successfully' })
  @HttpCode(HttpStatus.OK)
  async deactivateAllUserTokens(
    @Param('userId', ParseBigIntPipe) userId: string,
    @Request() req: JwtRequest,
  ): Promise<void> {
    // Ownership check: users can only manage their own tokens unless superadmin
    const requestingUserId = JwtRequestHelper.getUserId(req.user);
    if (requestingUserId !== userId && !JwtRequestHelper.isSuperAdmin(req.user)) {
      throw new ForbiddenException('You can only manage your own FCM tokens');
    }
    await this.userFcmTokenService.deactivateAllUserTokens(userId);
  }

  @Delete(':id')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({
    anyInstituteRole: true,
    global: []
  })
  @ApiOperation({ summary: 'Delete FCM token' })
  @ApiParam({ name: 'id', description: 'FCM token ID' })
  @ApiResponse({ status: 200, description: 'FCM token deleted successfully' })
  @ApiResponse({ status: 404, description: 'FCM token not found' })
  @HttpCode(HttpStatus.OK)
  async remove(@Param('id', ParseBigIntPipe) id: string): Promise<void> {
    await this.userFcmTokenService.remove(id);
  }

  @Delete('user/:userId/device/:deviceId')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({
    anyInstituteRole: true,
    global: []
  })
  @ApiOperation({ summary: 'Delete FCM token by user and device' })
  @ApiParam({ name: 'userId', description: 'User ID' })
  @ApiParam({ name: 'deviceId', description: 'Device ID' })
  @ApiResponse({ status: 200, description: 'FCM token deleted successfully' })
  @ApiResponse({ status: 404, description: 'FCM token not found' })
  @HttpCode(HttpStatus.OK)
  async removeByUserAndDevice(
    @Param('userId', ParseBigIntPipe) userId: string,
    @Param('deviceId', ParseBigIntPipe) deviceId: string
  ): Promise<void> {
    await this.userFcmTokenService.removeByUserAndDevice(userId, deviceId);
  }

  @Delete('cleanup/inactive')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({
    global: [UserType.SUPERADMIN],
    instituteAdmin: true
  })
  @ApiOperation({ 
    summary: 'Cleanup inactive FCM tokens',
    description: 'Remove inactive FCM tokens older than specified days (default: 30 days)'
  })
  @ApiResponse({ status: 200, description: 'Inactive tokens cleaned up successfully' })
  @HttpCode(HttpStatus.OK)
  async cleanupInactiveTokens(@Query('daysOld') daysOld?: number): Promise<{ deletedCount: number }> {
    return await this.userFcmTokenService.cleanupInactiveTokens(daysOld);
  }
}
