import { Body, Controller, Post, Req, Res } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from '../auth.service';
import { LoginDto } from '../dto/login.dto';
import { Request as ExpressRequest, Response as ExpressResponse } from 'express';
import { Public } from '../../common/decorators/public.decorator';
import { RefreshTokenDto } from '../auth.controller';

@ApiTags('Authentication V2')
@Controller('v2/auth')
export class AuthV2Controller {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('login')
  @Throttle({ default: { limit: 5, ttl: 900000 } }) // 🔒 SECURITY: 5 login attempts per 15 minutes
  @ApiOperation({ 
    summary: 'User login (enhanced JWT payload with refresh token in cookie)',
    description: 'Authenticates user and returns access token (15 min expiry). Refresh token (7 days) is set in httpOnly cookie for security.'
  })
  @ApiResponse({ 
    status: 200, 
    description: 'Login successful - refresh token set in httpOnly cookie',
    schema: {
      example: {
        access_token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
        payload: {
          s: '12345',
          u: 'STUDENT',
          i: [],
          c: []
        },
        user: {
          id: '12345',
          email: 'student@example.com',
          firstName: 'John',
          lastName: 'Doe',
          userType: 'STUDENT'
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
    const user = await this.authService.validateUser(loginDto.email, loginDto.password);
    
    const clientInfo = {
      ipAddress: req.ip || req.connection?.remoteAddress || 'unknown',
      userAgent: req.get('User-Agent') || 'unknown'
    };
    
    const result = await this.authService.loginV2(
      user,
      clientInfo.ipAddress,
      clientInfo.userAgent
    );

    // 🔐 SECURITY: Set refresh token in httpOnly cookie
    const isProduction = process.env.NODE_ENV === 'production';
    res.cookie('refresh_token', result.refresh_token, {
      httpOnly: true,        // Cannot be accessed by JavaScript
      secure: isProduction,  // HTTPS only in production
      sameSite: isProduction ? 'strict' : 'lax', // CSRF protection (lax for local development)
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      path: '/',
      domain: isProduction ? undefined : 'localhost' // Set domain for localhost
    });

    // Return everything except refresh_token (it's now in cookie)
    const { refresh_token, ...responseWithoutRefreshToken } = result;
    return responseWithoutRefreshToken;
  }

  @Public()
  @Post('refresh')
  @Throttle({ default: { limit: 10, ttl: 60000 } }) // 🔒 SECURITY: 10 refresh attempts per minute
  @ApiOperation({ 
    summary: 'Refresh access token using refresh token',
    description: 'Validates refresh token (from cookie or body) and returns new access token (15 min) + new refresh token (7 days in cookie). Old refresh token is automatically revoked.'
  })
  @ApiResponse({ 
    status: 200, 
    description: 'Token refreshed successfully - new refresh token set in httpOnly cookie',
    schema: {
      example: {
        access_token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
        user: {
          id: '12345',
          email: 'student@example.com',
          firstName: 'John',
          lastName: 'Doe',
          userType: 'STUDENT'
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
      throw new Error('Refresh token not provided in cookie or body');
    }

    const clientInfo = {
      ipAddress: req.ip || req.connection?.remoteAddress || 'unknown',
      userAgent: req.get('User-Agent') || 'unknown'
    };

    const result = await this.authService.refreshAccessToken(
      refreshToken,
      clientInfo.ipAddress,
      clientInfo.userAgent
    );

    // 🔐 SECURITY: Set new refresh token in httpOnly cookie
    const isProduction = process.env.NODE_ENV === 'production';
    res.cookie('refresh_token', result.refresh_token, {
      httpOnly: true,        // Cannot be accessed by JavaScript
      secure: isProduction,  // HTTPS only in production
      sameSite: isProduction ? 'strict' : 'lax', // CSRF protection
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      path: '/',
      domain: isProduction ? undefined : 'localhost'
    });

    // Return access token and user info (refresh token is in cookie)
    const { refresh_token, ...responseWithoutRefreshToken } = result;
    return responseWithoutRefreshToken;
  }
}
