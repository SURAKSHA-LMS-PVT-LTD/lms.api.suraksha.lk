import { Body, Controller, HttpCode, HttpStatus, Post, Req, Res, UnauthorizedException } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from '../auth.service';
import { LoginDto } from '../dto/login.dto';
import { Request as ExpressRequest, Response as ExpressResponse } from 'express';
import { Public } from '../../common/decorators/public.decorator';
import { getClientIp } from '../../common/utils/ip-extractor.util';
import { RefreshTokenDto } from '../auth.controller';

@ApiTags('Authentication V2')
@Controller('v2/auth')
export class AuthV2Controller {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('login')
  @Throttle({ default: { limit: 5, ttl: 900000 } }) // 🔒 SECURITY: 5 login attempts per 15 minutes
  @ApiOperation({ 
    summary: 'Universal login with email, phone, system ID, or birth certificate number',
    description: 'Authenticates user using multiple identifier types: Email, Phone (+94771234567, 0771234567, 771234567), System Registration Number (6 digits like 500423), or Birth Certificate Number. Returns access token (15 min expiry) + refresh token (7 days). Refresh token available in both response body (for all clients/SSO) and httpOnly cookie (for browsers).'
  })
  @ApiResponse({ 
    status: 200, 
    description: 'Login successful - supports email, phone, system ID, and birth certificate login',
    schema: {
      example: {
        access_token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
        refresh_token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
        expires_in: 3600,
        refresh_expires_in: 604800,
        payload: {
          s: '12345',
          u: 2,
          i: [],
          c: []
        },
        user: {
          id: '12345',
          email: 'student@example.com',
          nameWithInitials: 'J. Doe',
          userType: 'USER',
          imageUrl: 'https://storage.googleapis.com/...'
        }
      }
    }
  })
  @ApiResponse({ status: 401, description: 'Invalid credentials' })
  @ApiResponse({ status: 429, description: 'Too many login attempts. Try again in 15 minutes.' })
  async login(
    @Body() loginDto: LoginDto,
    @Req() req: ExpressRequest,
    @Res({ passthrough: true }) res: ExpressResponse
  ) {
    const user = await this.authService.validateUser(loginDto.identifier, loginDto.password);
    
    const clientInfo = {
      ipAddress: getClientIp(req),
      userAgent: req.get('User-Agent') || 'unknown'
    };

    // 🔐 SSO: Pass rememberMe flag for extended session
    const rememberMe = loginDto.rememberMe || loginDto.remember_me || false;
    
    const result = await this.authService.loginV2(
      user,
      clientInfo.ipAddress,
      clientInfo.userAgent,
      rememberMe
    );

    // 🔐 SECURITY: Set refresh token in httpOnly cookie (for browsers)
    // Cookie maxAge matches refresh token expiry (30d if rememberMe, 7d otherwise)
    const isProduction = process.env.NODE_ENV === 'production';
    const cookieMaxAge = rememberMe 
      ? 30 * 24 * 60 * 60 * 1000  // 30 days
      : 7 * 24 * 60 * 60 * 1000;  // 7 days

    res.cookie('refresh_token', result.refresh_token, {
      httpOnly: true,        // Cannot be accessed by JavaScript
      secure: isProduction,  // HTTPS only in production
      sameSite: 'lax',       // 'lax' allows same-site cross-origin (lms→lmsapi) and top-level navigations
      maxAge: cookieMaxAge,
      path: '/',
      domain: isProduction ? undefined : 'localhost' // Set domain for localhost
    });

    // 🌐 SSO SUPPORT: Return complete response including refresh_token
    // Available in both cookie (browsers) and response body (all clients: web/mobile/SSO)
    return result;
  }

  @Public()
  @Post('refresh')
  @Throttle({ default: { limit: 10, ttl: 60000 } }) // 🔒 SECURITY: 10 refresh attempts per minute
  @ApiOperation({ 
    summary: 'Refresh access token for all clients (SSO compatible)',
    description: 'Validates refresh token (from cookie or body) and returns new access token (15 min) + new refresh token (7 days). Supports all clients: web browsers, mobile apps, and SSO. Old refresh token is automatically revoked.'
  })
  @ApiResponse({ 
    status: 200, 
    description: 'Token refreshed successfully - supports all clients (web browsers, mobile apps, SSO)',
    schema: {
      example: {
        access_token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
        refresh_token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
        user: {
          id: '12345',
          email: 'student@example.com',
          nameWithInitials: 'J. Doe',
          userType: 'STUDENT',
          imageUrl: 'https://storage.googleapis.com/...'
        }
      }
    }
  })
  @ApiResponse({ status: 401, description: 'Invalid or expired refresh token' })
  @ApiResponse({ status: 429, description: 'Too many refresh attempts. Try again later.' })
  async refreshToken(
    @Body() refreshTokenDto: RefreshTokenDto,
    @Req() req: ExpressRequest,
    @Res({ passthrough: true }) res: ExpressResponse
  ) {
    // Try to get refresh token from cookie first, then from body
    const refreshToken = req.cookies?.refresh_token || refreshTokenDto.refresh_token;
    
    if (!refreshToken) {
      throw new UnauthorizedException('Refresh token not provided in cookie or body');
    }

    const clientInfo = {
      ipAddress: getClientIp(req),
      userAgent: req.get('User-Agent') || 'unknown'
    };

    const result = await this.authService.refreshAccessToken(
      refreshToken,
      clientInfo.ipAddress,
      clientInfo.userAgent
    );

    // 🔐 SECURITY: Set new refresh token in httpOnly cookie (for browsers)
    // Cookie maxAge matches the refresh token's actual expiry
    const isProduction = process.env.NODE_ENV === 'production';
    const cookieMaxAge = result.refresh_expires_in * 1000; // Convert seconds to ms

    res.cookie('refresh_token', result.refresh_token, {
      httpOnly: true,        // Cannot be accessed by JavaScript
      secure: isProduction,  // HTTPS only in production
      sameSite: 'lax',       // 'lax' allows same-site cross-origin (lms→lmsapi) and top-level navigations
      maxAge: cookieMaxAge,
      path: '/',
      domain: isProduction ? undefined : 'localhost'
    });

    // 🌐 SSO SUPPORT: Return complete response including refresh_token
    // Available for all clients: web browsers, mobile apps, and SSO integrations
    return result;
  }

  @Public()
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ 
    summary: 'Logout and revoke refresh token',
    description: 'Revokes the refresh token (from cookie or body) and clears the cookie, logging the user out. Supports all clients: web browsers, mobile apps, and SSO.'
  })
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
  async logout(
    @Body() body: { refresh_token?: string },
    @Req() req: ExpressRequest,
    @Res({ passthrough: true }) res: ExpressResponse
  ) {
    try {
      // Get refresh token from cookie first, then from body
      const refreshToken = req.cookies?.refresh_token || body?.refresh_token;

      if (refreshToken) {
        await this.authService.revokeRefreshToken(refreshToken);
      }

      // Clear the refresh token cookie
      const isProduction = process.env.NODE_ENV === 'production';
      res.clearCookie('refresh_token', {
        httpOnly: true,
        secure: isProduction,
        sameSite: 'lax',
        path: '/'
      });
      
      return {
        success: true,
        message: 'Logged out successfully'
      };
    } catch (error) {
      // Always return success for logout (don't leak information)
      return {
        success: true,
        message: 'Logged out successfully'
      };
    }
  }

}
