import { 
  Body, 
  Controller, 
  Post, 
  Req, 
  HttpCode, 
  HttpStatus,
  UnauthorizedException,
  BadRequestException,
  ValidationPipe
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags, ApiBody } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from '../auth.service';
import { Request as ExpressRequest } from 'express';
import { Public } from '../../common/decorators/public.decorator';
import { getClientIp } from '../../common/utils/ip-extractor.util';
import { 
  MobileLoginDto, 
  MobileRefreshTokenDto, 
  MobileLogoutDto 
} from '../dto/mobile-login.dto';

/**
 * 📱 Mobile Authentication Controller
 * 
 * Platform-aware authentication endpoints for mobile apps (iOS/Android).
 * 
 * Key differences from web authentication:
 * - Refresh tokens are returned in response BODY (not httpOnly cookies)
 * - Device ID is required for session management
 * - Single session per device (new login revokes previous tokens)
 * 
 * Security Features:
 * - Device ID validation on token refresh
 * - Token rotation on each refresh
 * - Device-specific session revocation
 */
@ApiTags('Authentication - Mobile')
@Controller()
export class AuthMobileController {
  constructor(private readonly authService: AuthService) {}

  // ============================================================================
  // 📱 MOBILE LOGIN
  // ============================================================================

  /**
   * 📱 Mobile Login
   * POST /v2/auth/login/mobile
   * 
   * Authenticates mobile user and returns tokens in response body.
   * Requires device ID for session tracking.
   */
  @Public()
  @Post('v2/auth/login/mobile')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 900000 } }) // 5 attempts per 15 minutes
  @ApiOperation({ 
    summary: 'Mobile app login with email, phone, system ID, or birth certificate (iOS/Android)',
    description: `
Authenticates user credentials and returns tokens for mobile applications.

**Supported Login Methods:**
- Email: user@example.com
- Phone: +94771234567, 0771234567, 771234567
- System ID: 500423 (6 digits)
- Birth Certificate: Any format

**Key Differences from Web Login:**
- Refresh token is returned in the response body (not as httpOnly cookie)
- Device ID is required for session management
- Previous tokens for the same device are automatically revoked

**Device ID Format:** \`platform_timestamp_uuid\` (e.g., \`android_1706438400000_abc123xyz\`)
    `
  })
  @ApiBody({ type: MobileLoginDto })
  @ApiResponse({ 
    status: 200, 
    description: 'Login successful - tokens returned in response body',
    schema: {
      example: {
        access_token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
        refresh_token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
        expires_in: 3600,
        payload: {
          s: '12345',
          u: 2,
          t: 1706128000,
          i: [{ i: '101', r: 2, c: [['1000']] }]
        },
        user: {
          id: '12345',
          email: 'user@example.com',
          nameWithInitials: 'J. Doe',
          userType: 'STUDENT',
          imageUrl: 'https://storage.googleapis.com/...'
        }
      }
    }
  })
  @ApiResponse({ status: 401, description: 'Invalid credentials' })
  @ApiResponse({ status: 400, description: 'Validation error - missing required fields' })
  @ApiResponse({ status: 429, description: 'Too many login attempts. Try again in 15 minutes.' })
  async loginMobile(
    @Body(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true })) loginDto: MobileLoginDto,
    @Req() req: ExpressRequest
  ) {
    try {
      // Validate user credentials (supports email, phone, system ID, birth certificate)
      const user = await this.authService.validateUser(
        loginDto.identifier, 
        loginDto.password
      );

      // Auto-complete first login if user has password but firstLoginCompleted = false
      if (user.firstLoginCompleted === false) {
        await this.authService.autoCompleteFirstLogin(user.id);
        user.firstLoginCompleted = true;
      }

      // Extract client info
      const clientInfo = {
        ipAddress: getClientIp(req),
        userAgent: req.get('User-Agent') || 'unknown'
      };

      // Determine platform (default to android if not specified)
      const platform: 'android' | 'ios' = loginDto.platform || 
        (loginDto.deviceId.toLowerCase().includes('ios') ? 'ios' : 'android');

      // 🔐 SSO: Pass rememberMe flag for extended session
      const rememberMe = loginDto.rememberMe || loginDto.remember_me || false;

      // Generate tokens with device tracking
      const result = await this.authService.loginMobile(
        user,
        loginDto.deviceId,
        platform,
        clientInfo.ipAddress,
        clientInfo.userAgent,
        loginDto.deviceName,
        rememberMe
      );

      return result;
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      throw new UnauthorizedException('Invalid credentials');
    }
  }

  // ============================================================================
  // 📱 MOBILE TOKEN REFRESH
  // ============================================================================

  /**
   * 📱 Mobile Token Refresh
   * POST /auth/refresh/mobile
   * 
   * Refreshes access token using refresh token from request body.
   * Validates device ID matches the original login device.
   */
  @Public()
  @Post('auth/refresh/mobile')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60000 } }) // 10 attempts per minute
  @ApiOperation({ 
    summary: 'Refresh mobile access token',
    description: `
Generates new access and refresh tokens for mobile applications.

**Security Features:**
- Device ID must match the one used during login
- Old refresh token is automatically revoked (token rotation)
- Validates user is still active and has valid institute access

**Token Rotation:** Each refresh generates a completely new refresh token.
The old token becomes invalid immediately.
    `
  })
  @ApiBody({ type: MobileRefreshTokenDto })
  @ApiResponse({ 
    status: 200, 
    description: 'Tokens refreshed successfully',
    schema: {
      example: {
        access_token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
        refresh_token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
        expires_in: 3600,
        user: {
          id: '12345',
          email: 'user@example.com',
          nameWithInitials: 'J. Doe',
          userType: 'STUDENT',
          imageUrl: 'https://storage.googleapis.com/...'
        }
      }
    }
  })
  @ApiResponse({ status: 401, description: 'Invalid, expired, or device-mismatched refresh token' })
  @ApiResponse({ status: 400, description: 'Missing required fields' })
  @ApiResponse({ status: 429, description: 'Too many refresh attempts' })
  async refreshMobileToken(
    @Body(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true })) refreshDto: MobileRefreshTokenDto,
    @Req() req: ExpressRequest
  ) {
    try {
      const clientInfo = {
        ipAddress: getClientIp(req),
        userAgent: req.get('User-Agent') || 'unknown'
      };

      const result = await this.authService.refreshMobileToken(
        refreshDto.refresh_token,
        refreshDto.deviceId,
        clientInfo.ipAddress,
        clientInfo.userAgent
      );

      return result;
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      throw new UnauthorizedException('Invalid or expired refresh token');
    }
  }

  // ============================================================================
  // 📱 MOBILE LOGOUT
  // ============================================================================

  /**
   * 📱 Mobile Logout
   * POST /auth/logout/mobile
   * 
   * Revokes refresh token for the specific device.
   */
  @Public()
  @Post('auth/logout/mobile')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ 
    summary: 'Mobile app logout',
    description: `
Logs out the user from the mobile device by revoking the refresh token.

**What happens:**
- The refresh token for this device is invalidated
- Access token remains valid until expiry (but cannot be refreshed)
- Other device sessions are not affected

**Best Practice:** Clear stored tokens from device after successful logout.
    `
  })
  @ApiBody({ type: MobileLogoutDto })
  @ApiResponse({ 
    status: 200, 
    description: 'Logged out successfully',
    schema: {
      example: {
        success: true,
        message: 'Logged out successfully'
      }
    }
  })
  @ApiResponse({ status: 400, description: 'Missing required fields' })
  async logoutMobile(
    @Body(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true })) logoutDto: MobileLogoutDto
  ) {
    try {
      const result = await this.authService.logoutMobile(
        logoutDto.refresh_token,
        logoutDto.deviceId
      );

      return result;
    } catch (error) {
      // Always return success for logout (don't leak information)
      return {
        success: true,
        message: 'Logged out successfully'
      };
    }
  }

}
