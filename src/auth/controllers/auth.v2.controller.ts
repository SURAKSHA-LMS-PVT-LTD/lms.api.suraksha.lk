import { Body, Controller, HttpCode, HttpStatus, Post, Req, Res, UnauthorizedException } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from '../auth.service';
import { LoginDto } from '../dto/login.dto';
import { Request as ExpressRequest, Response as ExpressResponse } from 'express';
import { Public } from '../../common/decorators/public.decorator';
import { getClientIp } from '../../common/utils/ip-extractor.util';
import { RefreshTokenDto } from '../auth.controller';
import { LogoutDto } from '../dto/logout.dto';
import { TenantService } from '../../modules/tenant/tenant.service';
import { LoginMethod } from '../../modules/institute/enums/institute.enums';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InstituteEntity } from '../../modules/institute/entities/institute.entity';

@ApiTags('Authentication V2')
@Controller('v2/auth')
export class AuthV2Controller {
  constructor(
    private readonly authService: AuthService,
    private readonly tenantService: TenantService,
    @InjectRepository(InstituteEntity)
    private readonly instituteRepository: Repository<InstituteEntity>,
  ) {}

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
    
    // Auto-complete first login if user has password but firstLoginCompleted = false
    // User proved identity with correct credentials — no need for OTP/verification flow
    if (user.firstLoginCompleted === false) {
      await this.authService.autoCompleteFirstLogin(user.id);
      user.firstLoginCompleted = true;
    }

    const clientInfo = {
      ipAddress: getClientIp(req),
      userAgent: req.get('User-Agent') || 'unknown'
    };

    // 🔐 SSO: Pass rememberMe flag for extended session
    const rememberMe = loginDto.rememberMe || loginDto.remember_me || false;
    
    // 🏢 Multi-tenant: Resolve login method and institute context
    let loginMethod = loginDto.loginMethod || LoginMethod.SURAKSHA_WEB;
    let tenantInstituteId: string | undefined;

    if (loginDto.subdomain) {
      loginMethod = LoginMethod.SUBDOMAIN;
      tenantInstituteId = await this.tenantService.getInstituteIdBySubdomain(loginDto.subdomain) || undefined;
    } else if (loginDto.customDomain) {
      loginMethod = LoginMethod.CUSTOM_DOMAIN;
      tenantInstituteId = await this.tenantService.getInstituteIdByCustomDomain(loginDto.customDomain) || undefined;
    }

    // 🔒 SECURITY: Validate the user actually belongs to the tenant institute
    // Prevents audit log pollution from users logging in via other institutes' subdomains
    let preSelectedInstituteName: string | undefined;
    if (tenantInstituteId) {
      const userInstitutes = await this.authService.getUserInstituteIds(user.id);
      if (!userInstitutes?.length || !userInstitutes.some(ui => ui.instituteId === tenantInstituteId)) {
        throw new UnauthorizedException('You are not a member of this institute');
      }
      // Fetch institute name for the frontend pre-selection
      try {
        const institute = await this.instituteRepository.findOne({
          where: { id: tenantInstituteId },
          select: ['id', 'name'],
        });
        preSelectedInstituteName = institute?.name;
      } catch {
        // Non-critical — name is cosmetic only
      }
    }

    const result = await this.authService.loginV2(
      user,
      clientInfo.ipAddress,
      clientInfo.userAgent,
      rememberMe,
      loginMethod,
      tenantInstituteId,
    );

    // 🔐 SECURITY: Set refresh token in httpOnly cookie (for browsers)
    // Cookie maxAge matches refresh token expiry (30d if rememberMe, 7d otherwise)
    const isProduction = process.env.NODE_ENV === 'production';
    const cookieMaxAge = rememberMe 
      ? 30 * 24 * 60 * 60 * 1000  // 30 days
      : 7 * 24 * 60 * 60 * 1000;  // 7 days

    // 🏢 Multi-tenant cookie strategy:
    // Use .suraksha.lk so the cookie is available to all subdomains
    // (academy.suraksha.lk, lms.suraksha.lk, lmsapi.suraksha.lk, etc.).
    // The leading dot allows the browser to send the cookie from any subdomain
    // frontend to the API at lmsapi.suraksha.lk.
    const cookieDomain = isProduction ? '.suraksha.lk' : 'localhost';

    res.cookie('refresh_token', result.refresh_token, {
      httpOnly: true,        // Cannot be accessed by JavaScript
      secure: isProduction,  // HTTPS only in production
      sameSite: 'lax',       // 'lax' allows same-site cross-origin (lms→lmsapi) and top-level navigations
      maxAge: cookieMaxAge,
      path: '/',
      domain: cookieDomain,
    });

    // 🌐 SSO SUPPORT: Return complete response including refresh_token
    // Available in both cookie (browsers) and response body (all clients: web/mobile/SSO)
    // 🏢 Multi-tenant: Include preSelectedInstituteId so frontend auto-skips institute selector
    return {
      ...result,
      ...(tenantInstituteId && {
        preSelectedInstituteId: tenantInstituteId,
        preSelectedInstituteName: preSelectedInstituteName,
      }),
    };
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
      domain: isProduction ? '.suraksha.lk' : 'localhost'
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
    @Body() body: LogoutDto,
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
        path: '/',
        domain: isProduction ? '.suraksha.lk' : 'localhost'
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
