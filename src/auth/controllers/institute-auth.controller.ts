import {
  Body, Controller, Delete, Get, HttpCode, HttpStatus,
  Param, Post, Put, Query, Req, Res, UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Request as ExpressRequest, Response as ExpressResponse } from 'express';
import { Public } from '../../common/decorators/public.decorator';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { FlexibleAccessGuard } from '../guards/flexible-access.guard';
import { RequireAnyOfRoles } from '../decorators/flexible-access.decorator';
import { UserType } from '../../modules/user/enums/user-type.enum';
import { getClientIp } from '../../common/utils/ip-extractor.util';
import { InstituteLoginService } from '../services/institute-login.service';
import { InstituteSessionService } from '../services/institute-session.service';
import { InstituteSessionLoginMethod } from '../entities/institute-login-session.entity';
import {
  InstituteLoginDto,
  InstituteSetPasswordDto,
  InstituteChangePasswordDto,
  InstitutePasswordResetInitiateDto,
  InstitutePasswordResetVerifyDto,
  GetAvailableContactsDto,
  SelfActivateRequestOtpDto,
  SelfActivateVerifyDto,
} from '../dto/institute-login.dto';
import { LogoutDto } from '../dto/logout.dto';
import { SetDeviceLimitDto, BulkSetDeviceLimitDto } from '../dto/device-limit.dto';

/** Resolve which login method and scope host to use based on request origin header. */
function resolveLoginContext(req: ExpressRequest): { loginMethod: InstituteSessionLoginMethod; scopeHost: string | null } {
  const origin = req.headers['origin'] || req.headers['referer'] || '';
  try {
    const url = new URL(origin as string);
    const host = url.hostname; // e.g. "school.suraksha.lk" or "lms.school.com"
    const mainHost = process.env.FRONTEND_URL ? new URL(process.env.FRONTEND_URL).hostname : 'lms.suraksha.lk';

    if (host === mainHost) return { loginMethod: InstituteSessionLoginMethod.MAIN, scopeHost: null };

    // Subdomain: x.suraksha.lk
    if (host.endsWith('.suraksha.lk') && host !== 'suraksha.lk') {
      return { loginMethod: InstituteSessionLoginMethod.SUBDOMAIN, scopeHost: host };
    }

    // Custom domain: anything else
    return { loginMethod: InstituteSessionLoginMethod.CUSTOM_DOMAIN, scopeHost: host };
  } catch {
    return { loginMethod: InstituteSessionLoginMethod.MAIN, scopeHost: null };
  }
}

@ApiTags('Institute Authentication')
@Controller('v2/auth/institute')
export class InstituteAuthController {
  constructor(
    private readonly instituteLoginService: InstituteLoginService,
    private readonly instituteSessionService: InstituteSessionService,
  ) {}

  // ── Login ─────────────────────────────────────────────────────────────────

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 900000 } }) // 5 attempts per 15 minutes
  @ApiOperation({
    summary: 'Institute-level login with institute user ID and password',
    description: 'Authenticates using institute-assigned user ID and institute-level password. Token is scoped to the originating subdomain/custom domain. Returns device limit info if max sessions reached.',
  })
  @ApiResponse({ status: 200, description: 'Login successful' })
  @ApiResponse({ status: 401, description: 'Invalid credentials' })
  @ApiResponse({ status: 403, description: 'Device limit reached — contact institute administrator' })
  @ApiResponse({ status: 429, description: 'Too many login attempts' })
  async login(
    @Body() dto: InstituteLoginDto,
    @Req() req: ExpressRequest,
    @Res({ passthrough: true }) res: ExpressResponse,
  ) {
    const ipAddress = getClientIp(req);
    const userAgent = req.headers['user-agent'] as string | undefined;
    const { loginMethod, scopeHost } = resolveLoginContext(req);

    const result = await this.instituteLoginService.login(dto, {
      ipAddress,
      userAgent,
      scopeHost,
      loginMethod,
    });

    // Set refresh token cookie (same pattern as main login)
    const isProduction = process.env.NODE_ENV === 'production';
    const cookieMaxAge = dto.rememberMe
      ? 30 * 24 * 60 * 60 * 1000
      : 7 * 24 * 60 * 60 * 1000;

    res.cookie('refresh_token', result.refresh_token, {
      httpOnly: true,
      secure: isProduction,
      sameSite: 'lax',
      maxAge: cookieMaxAge,
      path: '/',
      domain: isProduction ? '.suraksha.lk' : 'localhost',
    });

    return result;
  }


  // ── Session management (user self-service) ────────────────────────────────

  /** List MY active institute sessions for a given institute. */
  @UseGuards(JwtAuthGuard)
  @Get('sessions')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'List my active institute login sessions' })
  async getMySessions(
    @Query('instituteId') instituteId: string,
    @Req() req: ExpressRequest,
  ) {
    const userId = (req as any).user?.sub || (req as any).user?.id;
    return this.instituteSessionService.listInstituteSessions(instituteId, { userId });
  }

  /** Sign out a specific one of MY sessions. */
  @UseGuards(JwtAuthGuard)
  @Delete('sessions/:sessionId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Sign out a specific active institute session' })
  async deleteMySession(
    @Param('sessionId') sessionId: string,
    @Query('instituteId') instituteId: string,
    @Req() req: ExpressRequest,
  ) {
    const userId = (req as any).user?.sub || (req as any).user?.id;
    await this.instituteSessionService.deactivateSession(
      sessionId,
      { requestingUserId: userId, requestingInstituteId: instituteId, isAdmin: false },
      'USER_LOGOUT',
    );
    return { message: 'Session signed out successfully' };
  }

  // ── Admin session management ───────────────────────────────────────────────

  /**
   * Admin: list all active institute login sessions.
   * Requires JWT with INSTITUTE_ADMIN or SUPERADMIN role.
   */
  @UseGuards(JwtAuthGuard, FlexibleAccessGuard)
  @RequireAnyOfRoles({ global: [UserType.SUPERADMIN], instituteAdmin: true })
  @Get('admin/:instituteId/sessions')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '[Admin] List all active institute login sessions' })
  async adminListSessions(
    @Param('instituteId') instituteId: string,
    @Query('userId') userId: string | undefined,
    @Query('page') page: string | undefined,
    @Query('limit') limit: string | undefined,
    @Req() req: ExpressRequest,
  ) {
    // TODO: add role guard for admin — for now trusts JWT institute context
    return this.instituteSessionService.listInstituteSessions(instituteId, {
      userId,
      page: page ? parseInt(page) : 1,
      limit: limit ? parseInt(limit) : 20,
    });
  }

  /** Admin: force sign-out any session in the institute. */
  @UseGuards(JwtAuthGuard, FlexibleAccessGuard)
  @RequireAnyOfRoles({ global: [UserType.SUPERADMIN], instituteAdmin: true })
  @Delete('admin/:instituteId/sessions/:sessionId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '[Admin] Force sign-out a session' })
  async adminDeleteSession(
    @Param('instituteId') instituteId: string,
    @Param('sessionId') sessionId: string,
    @Req() req: ExpressRequest,
  ) {
    const adminUserId = (req as any).user?.sub || (req as any).user?.id;
    await this.instituteSessionService.deactivateSession(
      sessionId,
      { requestingUserId: adminUserId, requestingInstituteId: instituteId, isAdmin: true },
      'ADMIN_FORCED_LOGOUT',
    );
    return { message: 'Session terminated by admin' };
  }

  /** Admin: sign out ALL sessions for a specific user in the institute. */
  @UseGuards(JwtAuthGuard, FlexibleAccessGuard)
  @RequireAnyOfRoles({ global: [UserType.SUPERADMIN], instituteAdmin: true })
  @Delete('admin/:instituteId/users/:userId/sessions')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '[Admin] Sign out all sessions for a user' })
  async adminSignOutAll(
    @Param('instituteId') instituteId: string,
    @Param('userId') userId: string,
  ) {
    const count = await this.instituteSessionService.deactivateAllSessions(instituteId, userId);
    return { message: `${count} session(s) terminated` };
  }

  /**
   * Admin: set the max-device limit for a specific user.
   * Body: { maxDevices: number | null }
   */
  @UseGuards(JwtAuthGuard, FlexibleAccessGuard)
  @RequireAnyOfRoles({ global: [UserType.SUPERADMIN], instituteAdmin: true })
  @Put('admin/:instituteId/users/:userId/device-limit')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '[Admin] Set max concurrent device limit for a user' })
  async setDeviceLimit(
    @Param('instituteId') instituteId: string,
    @Param('userId') userId: string,
    @Body() body: SetDeviceLimitDto,
  ) {
    await this.instituteSessionService.setDeviceLimit(instituteId, userId, body.maxDevices ?? null);
    return { message: 'Device limit updated', maxDevices: body.maxDevices ?? null };
  }

  /** Admin: apply a device limit to a specific list of user IDs */
  @UseGuards(JwtAuthGuard, FlexibleAccessGuard)
  @RequireAnyOfRoles({ global: [UserType.SUPERADMIN], instituteAdmin: true })
  @Post('admin/:instituteId/users/bulk-device-limit')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '[Admin] Apply device limit to specific users' })
  async bulkSetDeviceLimit(
    @Param('instituteId') instituteId: string,
    @Body() body: BulkSetDeviceLimitDto,
  ) {
    await Promise.all(
      body.userIds.map(userId =>
        this.instituteSessionService.setDeviceLimit(instituteId, userId, body.maxDevices)
      )
    );
    return { message: `Limit applied to ${body.userIds.length} user(s)`, maxDevices: body.maxDevices };
  }

  // ── Password management (unchanged) ───────────────────────────────────────

  @UseGuards(JwtAuthGuard)
  @Post('set-password')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @ApiOperation({ summary: 'Set institute password for a user (admin action)' })
  async setPassword(@Body() dto: InstituteSetPasswordDto & { targetUserId: string }, @Req() req: ExpressRequest) {
    return this.instituteLoginService.setPassword(dto, dto.targetUserId);
  }

  @UseGuards(JwtAuthGuard)
  @Put('change-password')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 3, ttl: 900000 } })
  @ApiOperation({ summary: 'Change own institute password' })
  async changePassword(@Body() dto: InstituteChangePasswordDto, @Req() req: ExpressRequest) {
    const userId = (req as any).user?.sub || (req as any).user?.id;
    return this.instituteLoginService.changePassword(dto, userId);
  }

  @Public()
  @Post('password-reset/initiate')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 3, ttl: 900000 } })
  @ApiOperation({ summary: 'Initiate institute password reset via OTP' })
  async initiatePasswordReset(@Body() dto: InstitutePasswordResetInitiateDto, @Req() req: ExpressRequest) {
    return this.instituteLoginService.initiatePasswordReset(dto, getClientIp(req));
  }

  @Public()
  @Post('password-reset/verify')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 900000 } })
  @ApiOperation({ summary: 'Verify OTP and set new institute password' })
  async verifyAndResetPassword(@Body() dto: InstitutePasswordResetVerifyDto) {
    return this.instituteLoginService.verifyAndResetPassword(dto);
  }

  @Public()
  @Post('available-contacts')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @ApiOperation({ summary: 'Get masked contact list for OTP delivery' })
  async getAvailableContacts(@Body() dto: GetAvailableContactsDto) {
    return this.instituteLoginService.getAvailableContacts(dto);
  }

  @UseGuards(JwtAuthGuard)
  @Get('self-activate/profile')
  @HttpCode(HttpStatus.OK)
  async getSelfActivateProfile(@Query('instituteId') instituteId: string, @Req() req: ExpressRequest) {
    const userId = (req as any).user?.sub || (req as any).user?.id;
    return this.instituteLoginService.getMyInstituteProfile(userId, instituteId);
  }

  @UseGuards(JwtAuthGuard)
  @Get('self-activate/contacts')
  @HttpCode(HttpStatus.OK)
  async getSelfActivateContacts(@Query('instituteId') instituteId: string, @Req() req: ExpressRequest) {
    const userId = (req as any).user?.sub || (req as any).user?.id;
    return this.instituteLoginService.getMyAvailableContacts(userId, instituteId);
  }

  @UseGuards(JwtAuthGuard)
  @Post('self-activate/request-otp')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 900000 } })
  async selfActivateRequestOtp(@Body() dto: SelfActivateRequestOtpDto, @Req() req: ExpressRequest) {
    const userId = (req as any).user?.sub || (req as any).user?.id;
    return this.instituteLoginService.selfActivateRequestOtp(userId, dto, getClientIp(req));
  }

  @UseGuards(JwtAuthGuard)
  @Post('self-activate/verify')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 900000 } })
  async selfActivateVerify(@Body() dto: SelfActivateVerifyDto, @Req() req: ExpressRequest) {
    const userId = (req as any).user?.sub || (req as any).user?.id;
    return this.instituteLoginService.selfActivateVerifyAndSetPassword(userId, dto);
  }
}
