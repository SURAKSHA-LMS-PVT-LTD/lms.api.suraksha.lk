import { Body, Controller, HttpCode, HttpStatus, Post, Put, Req, Res, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Request as ExpressRequest, Response as ExpressResponse } from 'express';
import { Public } from '../../common/decorators/public.decorator';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { getClientIp } from '../../common/utils/ip-extractor.util';
import { InstituteLoginService } from '../services/institute-login.service';
import {
  InstituteLoginDto,
  InstituteSetPasswordDto,
  InstituteChangePasswordDto,
  InstitutePasswordResetInitiateDto,
  InstitutePasswordResetVerifyDto,
} from '../dto/institute-login.dto';

@ApiTags('Institute Authentication')
@Controller('v2/auth/institute')
export class InstituteAuthController {
  constructor(
    private readonly instituteLoginService: InstituteLoginService,
  ) {}

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 900000 } }) // 5 attempts per 15 minutes
  @ApiOperation({
    summary: 'Institute-level login with institute user ID and password',
    description: 'Authenticates using institute-assigned user ID and institute-level password. Does not require main system credentials.',
  })
  @ApiResponse({ status: 200, description: 'Login successful' })
  @ApiResponse({ status: 401, description: 'Invalid credentials' })
  @ApiResponse({ status: 429, description: 'Too many login attempts' })
  async login(
    @Body() dto: InstituteLoginDto,
    @Req() req: ExpressRequest,
    @Res({ passthrough: true }) res: ExpressResponse,
  ) {
    const result = await this.instituteLoginService.login(dto);

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

  @UseGuards(JwtAuthGuard)
  @Post('set-password')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @ApiOperation({
    summary: 'Set institute password for a user (admin action)',
    description: 'Allows institute admins to set/reset the institute-level password for a user.',
  })
  @ApiResponse({ status: 200, description: 'Password set successfully' })
  async setPassword(
    @Body() dto: InstituteSetPasswordDto & { targetUserId: string },
    @Req() req: ExpressRequest,
  ) {
    return this.instituteLoginService.setPassword(dto, dto.targetUserId);
  }

  @UseGuards(JwtAuthGuard)
  @Put('change-password')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 3, ttl: 900000 } }) // 3 attempts per 15 min
  @ApiOperation({
    summary: 'Change own institute password',
    description: 'User changes their own institute-level password. Requires current password.',
  })
  @ApiResponse({ status: 200, description: 'Password changed successfully' })
  @ApiResponse({ status: 401, description: 'Current password is incorrect' })
  async changePassword(
    @Body() dto: InstituteChangePasswordDto,
    @Req() req: ExpressRequest,
  ) {
    const userId = (req as any).user?.sub || (req as any).user?.id;
    return this.instituteLoginService.changePassword(dto, userId);
  }

  @Public()
  @Post('password-reset/initiate')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 3, ttl: 900000 } }) // 3 per 15 min
  @ApiOperation({
    summary: 'Initiate institute password reset via OTP',
    description: 'Sends OTP to user email/phone. For students without contact info, can use parent contact with useParentContact=true.',
  })
  @ApiResponse({ status: 200, description: 'OTP sent successfully' })
  async initiatePasswordReset(
    @Body() dto: InstitutePasswordResetInitiateDto,
    @Req() req: ExpressRequest,
  ) {
    const ipAddress = getClientIp(req);
    return this.instituteLoginService.initiatePasswordReset(dto, ipAddress);
  }

  @Public()
  @Post('password-reset/verify')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 900000 } }) // 5 per 15 min
  @ApiOperation({
    summary: 'Verify OTP and set new institute password',
    description: 'Verifies OTP code and sets new institute-level password in one step.',
  })
  @ApiResponse({ status: 200, description: 'Password reset successfully' })
  @ApiResponse({ status: 401, description: 'Invalid OTP' })
  async verifyAndResetPassword(
    @Body() dto: InstitutePasswordResetVerifyDto,
  ) {
    return this.instituteLoginService.verifyAndResetPassword(dto);
  }
}
