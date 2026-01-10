import { 
  Controller, 
  Post, 
  Body, 
  Get, 
  Param, 
  Options, 
  HttpCode, 
  Headers, 
  BadRequestException, 
  UnauthorizedException,
  Req,
  Res,
  UseGuards,
  Request,
  HttpStatus,
  ValidationPipe
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiProperty, ApiBearerAuth, ApiConsumes } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { ChangePasswordDto } from './dto/change-password.dto';
import { PasswordResetService } from './services/password-reset.service';
import { Request as ExpressRequest, Response as ExpressResponse } from 'express';
import { 
  IsEmail, 
  IsNotEmpty, 
  IsString, 
  MinLength, 
  Matches,
  Length 
} from 'class-validator';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { FlexibleAccessGuard } from './guards/flexible-access.guard';
import { RequireAnyOfRoles } from './decorators/flexible-access.decorator';
import { UserType } from '../modules/user/enums/user-type.enum';
import { JwtRequest } from '@common/interfaces/jwt-request.interface';
import { Public } from '../common/decorators/public.decorator';

// =================== DTOs FOR PASSWORD RESET ===================

// Step 1 DTO: Just email
export class ForgotPasswordDto {
  @ApiProperty({
    description: 'Email address to send OTP',
    example: 'john.doe@example.com'
  })
  @IsEmail({}, { message: 'Valid email required' })
  @IsNotEmpty({ message: 'Email required' })
  email: string;
}

// Step 2 DTO: Email + OTP + New Password
export class ResetPasswordDto {
  @ApiProperty({
    description: 'Email address',
    example: 'john.doe@example.com'
  })
  @IsEmail({}, { message: 'Valid email required' })
  @IsNotEmpty({ message: 'Email required' })
  email: string;

  @ApiProperty({
    description: '6-digit OTP from email',
    example: '123456'
  })
  @IsString()
  @Length(6, 6, { message: 'OTP must be 6 digits' })
  @IsNotEmpty({ message: 'OTP required' })
  otp: string;

  @ApiProperty({
    description: 'New password (min 8 chars, uppercase, lowercase, number, special char)',
    example: 'NewPass123!'
  })
  @IsString()
  @MinLength(8, { message: 'Min 8 characters' })
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/, {
    message: 'Need uppercase, lowercase, number, special char'
  })
  @IsNotEmpty({ message: 'Password required' })
  newPassword: string;

  @ApiProperty({
    description: 'Confirm new password (must match newPassword)',
    example: 'NewPass123!'
  })
  @IsString()
  @MinLength(8, { message: 'Min 8 characters' })
  @IsNotEmpty({ message: 'Confirm password required' })
  confirmPassword: string;
}

export class ChangePasswordAuthDto {
  @ApiProperty({
    description: 'Current password',
    example: 'OldPassword123!',
    required: true
  })
  @IsString({ message: 'Current password must be a string' })
  @IsNotEmpty({ message: 'Current password is required' })
  currentPassword: string;

  @ApiProperty({
    description: 'New password (min 8 chars, must contain uppercase, lowercase, number, special char)',
    example: 'NewSecure123!',
    minLength: 8,
    required: true
  })
  @IsString({ message: 'Password must be a string' })
  @MinLength(8, { message: 'Password must be at least 8 characters long' })
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/, {
    message: 'Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character'
  })
  @IsNotEmpty({ message: 'New password is required' })
  newPassword: string;

  @ApiProperty({
    description: 'Confirm new password (must match newPassword)',
    example: 'NewSecure123!',
    required: true
  })
  @IsString({ message: 'Confirm password must be a string' })
  @IsNotEmpty({ message: 'Please confirm your new password' })
  confirmPassword: string;
}

export class RefreshTokenDto {
  @ApiProperty({
    description: 'Refresh token received during login',
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
    required: true
  })
  @IsString({ message: 'Refresh token must be a string' })
  @IsNotEmpty({ message: 'Refresh token is required' })
  refresh_token: string;
}

@ApiTags('Authentication')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly passwordResetService: PasswordResetService,
  ) {}

  // =================== GET CURRENT USER (ME) ===================

  /**
   * Get current authenticated user information
   * Secure endpoint that returns user profile based on JWT token
   */
  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ 
    summary: 'Get current authenticated user information',
    description: 'Returns the profile information of the currently authenticated user based on their JWT token. Requires valid authentication.'
  })
  @ApiResponse({ 
    status: 200, 
    description: 'User information retrieved successfully',
    schema: {
      example: {
        success: true,
        data: {
          id: '12345',
          firstName: 'John',
          lastName: 'Doe',
          nameWithInitials: 'J. Doe',
          email: 'john.doe@example.com',
          phoneNumber: '+94771234567',
          userType: 'USER_WITHOUT_PARENT',
          dateOfBirth: '2005-01-15',
          gender: 'MALE',
          birthCertificateNo: '12345678',
          addressLine1: '123 Main Street',
          city: 'Colombo',
          district: 'COLOMBO',
          province: 'WESTERN',
          imageUrl: 'https://storage.googleapis.com/suraksha-lms/profile-images/user-123.jpg',
          subscriptionPlan: 'FREE',
          language: 'E',
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-11-22T00:00:00.000Z',
          studentId: 'STU2024001',
          emergencyContact: '+94771234567',
          bloodGroup: 'O+'
        }
      }
    }
  })
  @ApiResponse({ status: 401, description: 'Unauthorized - Invalid or missing JWT token' })
  async getCurrentUser(@Request() req: JwtRequest) {
    return await this.authService.getCurrentUserProfile(req.user.s);
  }

  @Post('change-password')
  @UseGuards(JwtAuthGuard, FlexibleAccessGuard)
  @RequireAnyOfRoles({ anyInstituteRole: true })
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Change user password with current password verification (Authenticated users only)' })
  @ApiResponse({ status: 200, description: 'Password changed successfully' })
  @ApiResponse({ status: 400, description: 'Validation failed' })
  @ApiResponse({ status: 401, description: 'Invalid current password or unauthorized' })
  @ApiResponse({ status: 429, description: 'Too many password change attempts' })
  @Throttle({ default: { limit: 3, ttl: 900000 } }) // 3 attempts per 15 minutes
  async changePassword(
    @Body() changePasswordDto: ChangePasswordDto,
    @Headers('authorization') authorization: string,
  ) {
    // Basic validation (DTO handles detailed validation)
    if (!changePasswordDto.currentPassword || !changePasswordDto.newPassword || !changePasswordDto.confirmNewPassword) {
      throw new BadRequestException('All password fields are required');
    }

    if (!authorization) {
      throw new UnauthorizedException('Authorization header is required');
    }

    return await this.authService.changePasswordWithJWT(changePasswordDto, authorization);
  }

  @Get('debug-user/:email')
  @UseGuards(JwtAuthGuard, FlexibleAccessGuard)
  @RequireAnyOfRoles({ global: [UserType.SUPERADMIN] })
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Debug user existence (SUPERADMIN only - development)' })
  async debugUser(@Param('email') email: string) {
    // 🔒 SECURITY: Only allow in non-production environments
    if (process.env.NODE_ENV === 'production') {
      throw new UnauthorizedException('Debug endpoints disabled in production');
    }
    
    const user = await this.authService.findUserByEmail(email);
    return {
      exists: !!user,
      email: user?.email,
      hasPassword: !!user?.password,
      isActive: user?.isActive,
      userType: user?.userType
    };
  }

  // =================== PASSWORD RESET (SIMPLE 2-STEP FLOW) ===================

  /**
   * Step 1: Send OTP to email
   */
  @Public()
  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 3, ttl: 900000 } }) // 3 attempts per 15 minutes
  @ApiOperation({ 
    summary: 'Send OTP to email for password reset',
    description: 'User enters email → Sends 6-digit OTP. OTP expires in 15 minutes.'
  })
  @ApiResponse({ 
    status: 200, 
    description: 'OTP sent to email',
    schema: {
      example: {
        success: true,
        message: 'If an account exists, you will receive an OTP code.',
        data: { expiresInMinutes: 15 }
      }
    }
  })
  @ApiResponse({ status: 400, description: 'Rate limit exceeded' })
  async forgotPassword(
    @Body(ValidationPipe) dto: ForgotPasswordDto,
    @Req() req: ExpressRequest
  ) {
    try {
      const clientInfo = {
        ipAddress: req.ip || req.connection.remoteAddress || 'unknown',
        userAgent: req.get('User-Agent') || 'unknown'
      };

      const result = await this.passwordResetService.initiatePasswordReset(
        dto,
        clientInfo.ipAddress,
        clientInfo.userAgent
      );

      return result;
    } catch (error) {
      throw new BadRequestException(error.message);
    }
  }

  /**
   * Step 2: Verify OTP, encrypt new password, and save
   */
  @Public()
  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  @ApiConsumes('application/json')
  @ApiOperation({ 
    summary: 'Reset password with OTP',
    description: 'User enters OTP + new password → Verify OTP → Encrypt password → Save to database'
  })
  @ApiResponse({ 
    status: 200, 
    description: 'Password reset successfully',
    schema: {
      example: {
        success: true,
        message: 'Password reset successfully. You can now login.'
      }
    }
  })
  @ApiResponse({ status: 400, description: 'Invalid OTP or password validation failed' })
  async resetPassword(
    @Body(ValidationPipe) dto: ResetPasswordDto,
    @Req() req: ExpressRequest
  ) {
    try {
      const clientInfo = {
        ipAddress: req.ip || req.connection.remoteAddress || 'unknown',
        userAgent: req.get('User-Agent') || 'unknown'
      };

      const result = await this.passwordResetService.resetPassword(
        dto,
        clientInfo.ipAddress,
        clientInfo.userAgent
      );

      return result;
    } catch (error) {
      throw new BadRequestException(error.message);
    }
  }

  // =================== AUTHENTICATED PASSWORD CHANGE ===================

  /**
   * Change password for authenticated users
   */
  @Post('change-password-authenticated')
  @UseGuards(JwtAuthGuard, FlexibleAccessGuard)
  @RequireAnyOfRoles({
    anyInstituteRole: true,
    global: []
  })
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 900000 } }) // 5 attempts per 15 minutes
  @ApiOperation({ 
    summary: 'Change password (authenticated users)',
    description: 'Allows authenticated users to change their password by providing current password and new password.'
  })
  @ApiResponse({ 
    status: 200, 
    description: 'Password changed successfully',
    schema: {
      example: {
        success: true,
        message: 'Password changed successfully.',
        data: {
          changedAt: '2025-10-18T10:30:00.000Z'
        }
      }
    }
  })
  @ApiResponse({ status: 401, description: 'Unauthorized or incorrect current password' })
  @ApiResponse({ status: 400, description: 'Validation failed or new password same as current' })
  async changePasswordAuthenticated(
    @Body(ValidationPipe) dto: ChangePasswordAuthDto,
    @Request() req: JwtRequest
  ) {
    try {
      const clientInfo = {
        ipAddress: req.ip || req.connection.remoteAddress || 'unknown',
        userAgent: req.get('User-Agent') || 'unknown'
      };

      const result = await this.passwordResetService.changePassword(
        req.user.s,
        dto,
        clientInfo.ipAddress,
        clientInfo.userAgent
      );

      return result;
    } catch (error) {
      if (error.message.includes('Current password is incorrect')) {
        throw new UnauthorizedException(error.message);
      }
      throw new BadRequestException(error.message);
    }
  }

  // =================== TOKEN REFRESH & LOGOUT ===================

  /**
   * Refresh access token using refresh token from cookie
   */
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ 
    summary: 'Refresh access token',
    description: 'Generate a new access token using the refresh token from httpOnly cookie. Validates user hierarchy and permissions. Old refresh token will be revoked.'
  })
  @ApiResponse({ 
    status: 200, 
    description: 'Tokens refreshed successfully',
    schema: {
      example: {
        access_token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
        user: {
          id: 'user-id',
          userType: 'STUDENT',
          email: 'user@example.com'
        }
      }
    }
  })
  @ApiResponse({ status: 401, description: 'Invalid, expired, or missing refresh token' })
  @ApiResponse({ status: 403, description: 'User account inactive or access revoked' })
  async refreshToken(
    @Req() req: ExpressRequest,
    @Res({ passthrough: true }) res: ExpressResponse
  ) {
    try {
      // Get refresh token from httpOnly cookie
      const refreshToken = req.cookies?.refresh_token;

      if (!refreshToken) {
        throw new UnauthorizedException('Refresh token not found in cookie');
      }

      const clientInfo = {
        ipAddress: req.ip || req.connection.remoteAddress || 'unknown',
        userAgent: req.get('User-Agent') || 'unknown'
      };

      // Refresh tokens with hierarchy validation
      const result = await this.authService.refreshAccessToken(
        refreshToken,
        clientInfo.ipAddress,
        clientInfo.userAgent
      );

      // Set new refresh token in httpOnly cookie
      const isProduction = process.env.NODE_ENV === 'production';
      res.cookie('refresh_token', result.refresh_token, {
        httpOnly: true,
        secure: isProduction, // HTTPS only in production
        sameSite: isProduction ? 'strict' : 'lax', // Lax for local development
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
        path: '/',
        domain: isProduction ? undefined : 'localhost' // Set domain for localhost
      });

      // Return only access token and user info (not refresh token)
      return {
        access_token: result.access_token,
        user: result.user
      };
    } catch (error) {
      throw new UnauthorizedException(error.message);
    }
  }

  /**
   * Logout and revoke refresh token from cookie
   */
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ 
    summary: 'Logout and revoke refresh token',
    description: 'Revokes the refresh token from httpOnly cookie and clears it, effectively logging the user out.'
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
  @ApiResponse({ status: 400, description: 'Invalid or missing refresh token' })
  async logout(
    @Req() req: ExpressRequest,
    @Res({ passthrough: true }) res: ExpressResponse
  ) {
    try {
      // Get refresh token from cookie
      const refreshToken = req.cookies?.refresh_token;

      if (refreshToken) {
        // Revoke the refresh token in database
        await this.authService.revokeRefreshToken(refreshToken);
      }

      // Clear the refresh token cookie
      res.clearCookie('refresh_token', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: process.env.NODE_ENV === 'production' ? 'strict' : 'lax',
        path: '/'
      });
      
      return {
        success: true,
        message: 'Logged out successfully'
      };
    } catch (error) {
      throw new BadRequestException('Failed to logout');
    }
  }
}
