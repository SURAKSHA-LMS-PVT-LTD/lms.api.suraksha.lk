import { 
  Controller, 
  Post, 
  Body, 
  Get, 
  Query, 
  Req, 
  Logger,
  HttpStatus,
  HttpCode,
  UseGuards,
  Headers,
  Put,
  UseInterceptors,
  UploadedFile
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiResponse, ApiBody, ApiConsumes } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Request } from 'express';
import { FirstLoginService } from '../services/first-login.service';
import { 
  InitiateFirstLoginDto, 
  VerifyOtpDto, 
  SetPasswordDto,
  FirstLoginResponseDto,
  OtpVerificationResponseDto,
  PasswordSetupResponseDto,
  EnhancedOtpVerificationResponseDto,
  CompleteProfileDto,
  EnhancedVerifyOtpDto,
  EnhancedOtpCompleteVerificationResponseDto
} from '../dto/first-login.dto';

@ApiTags('First Login')
@Controller('auth')
export class FirstLoginController {
  private readonly logger = new Logger(FirstLoginController.name);

  constructor(private readonly firstLoginService: FirstLoginService) {}

  @Post('initiate')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 3, ttl: 900000 } }) // 🔒 SECURITY: 3 OTP requests per 15 minutes
  @ApiOperation({ 
    summary: 'Initiate first login process',
    description: 'Send OTP to user email for first-time login setup'
  })
  @ApiBody({ type: InitiateFirstLoginDto })
  @ApiResponse({ 
    status: 200, 
    description: 'OTP sent successfully',
    type: FirstLoginResponseDto
  })
  @ApiResponse({ 
    status: 400, 
    description: 'Bad request - User already has password or invalid email'
  })
  @ApiResponse({ 
    status: 404, 
    description: 'User not found'
  })
  async initiateFirstLogin(
    @Body() dto: InitiateFirstLoginDto,
    @Req() req: Request
  ): Promise<FirstLoginResponseDto> {
    const ipAddress = req.ip || req.connection.remoteAddress;
    const userAgent = req.headers['user-agent'];
    
    
    return await this.firstLoginService.initiateFirstLogin(dto, ipAddress, userAgent);
  }

  @Post('verify-otp')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 900000 } }) // 🔒 SECURITY: 5 OTP verification attempts per 15 minutes
  @ApiOperation({ 
    summary: 'Verify OTP code',
    description: 'Verify the OTP code sent to user email and get verification token'
  })
  @ApiBody({ type: VerifyOtpDto })
  @ApiResponse({ 
    status: 200, 
    description: 'OTP verified successfully',
    type: OtpVerificationResponseDto
  })
  @ApiResponse({ 
    status: 400, 
    description: 'Invalid or expired OTP'
  })
  async verifyOTP(
    @Body() dto: VerifyOtpDto,
    @Req() req: Request
  ): Promise<OtpVerificationResponseDto> {
    const ipAddress = req.ip || req.connection.remoteAddress;
    const userAgent = req.headers['user-agent'];
    
    
    return await this.firstLoginService.verifyOTP(dto, ipAddress, userAgent);
  }

  @Post('set-password')
  @Throttle({ default: { limit: 3, ttl: 900000 } }) // 🔒 SECURITY: 3 password set attempts per 15 minutes
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ 
    summary: 'Set password for first login',
    description: 'Set password and complete first login process'
  })
  @ApiBody({ type: SetPasswordDto })
  @ApiResponse({ 
    status: 200, 
    description: 'Password set successfully',
    type: PasswordSetupResponseDto
  })
  @ApiResponse({ 
    status: 400, 
    description: 'Invalid verification token or password validation failed'
  })
  @ApiResponse({ 
    status: 404, 
    description: 'User not found'
  })
  async setPassword(
    @Body() dto: SetPasswordDto,
    @Req() req: Request
  ): Promise<PasswordSetupResponseDto> {
    const ipAddress = req.ip || req.connection.remoteAddress;
    const userAgent = req.headers['user-agent'];
    
    
    return await this.firstLoginService.setPassword(dto, ipAddress, userAgent);
  }

  @Post('resend-otp')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 2, ttl: 600000 } }) // 🔒 SECURITY: 2 resend attempts per 10 minutes
  @ApiOperation({ 
    summary: 'Resend OTP code',
    description: 'Resend OTP to user email (rate limited)'
  })
  @ApiBody({ 
    schema: {
      type: 'object',
      properties: {
        email: { type: 'string', format: 'email', example: 'user@example.com' }
      },
      required: ['email']
    }
  })
  @ApiResponse({ 
    status: 200, 
    description: 'OTP resent successfully',
    type: FirstLoginResponseDto
  })
  @ApiResponse({ 
    status: 400, 
    description: 'Too many requests - rate limited'
  })
  async resendOTP(
    @Body('email') email: string,
    @Req() req: Request
  ): Promise<FirstLoginResponseDto> {
    const ipAddress = req.ip || req.connection.remoteAddress;
    const userAgent = req.headers['user-agent'];
    
    
    return await this.firstLoginService.resendOTP(email, ipAddress, userAgent);
  }

  @Get('status')
  @ApiOperation({ 
    summary: 'Check first login status',
    description: 'Check if user requires first login setup'
  })
  @ApiResponse({ 
    status: 200, 
    description: 'First login status retrieved',
    schema: {
      type: 'object',
      properties: {
        requiresFirstLogin: { type: 'boolean', example: true },
        userExists: { type: 'boolean', example: true }
      }
    }
  })
  async checkFirstLoginStatus(
    @Query('email') email: string
  ): Promise<{ requiresFirstLogin: boolean; userExists: boolean }> {
    
    return await this.firstLoginService.checkFirstLoginStatus(email);
  }

  // ===== ENHANCED APPROACH =====
  
  @Post('verify-otp-complete')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ 
    summary: 'Complete OTP verification with profile data and image URL',
    description: 'Verify OTP, update complete profile with image URL from /upload/verify-and-publish, and return complete user data with simple JWT'
  })
  @ApiBody({
    description: 'OTP verification with profile completion and image URL',
    schema: {
      type: 'object',
      properties: {
        email: { type: 'string', format: 'email', example: 'user@example.com' },
        otp: { type: 'string', example: '123456' },
        phoneNumber: { type: 'string', example: '+94771234567' },
        dateOfBirth: { type: 'string', format: 'date', example: '1990-01-15' },
        gender: { type: 'string', example: 'MALE' },
        addressLine1: { type: 'string', example: '123 Main Street' },
        addressLine2: { type: 'string', example: 'Apt 4B' },
        city: { type: 'string', example: 'Colombo' },
        district: { type: 'string', example: 'Colombo' },
        province: { type: 'string', example: 'Western Province' },
        country: { type: 'string', example: 'Sri Lanka' },
        password: { type: 'string', example: 'SecurePass123!' },
        profileImageUrl: { 
          type: 'string', 
          description: 'Profile image URL from /upload/verify-and-publish'
        },
        // Student-specific fields
        studentId: { type: 'string', example: 'STU123456' },
        emergencyContact: { type: 'string', example: '+94771234567' },
        bloodGroup: { type: 'string', example: 'O+' },
        // Parent-specific fields
        occupation: { type: 'string', example: 'Software Engineer' },
        workplace: { type: 'string', example: 'Tech Solutions Pvt Ltd' },
        educationLevel: { type: 'string', example: 'Bachelor\'s Degree' }
      },
      required: ['email', 'otp']
    }
  })
  @ApiResponse({ 
    status: 200, 
    description: 'OTP verified and profile completed successfully',
    type: EnhancedOtpCompleteVerificationResponseDto
  })
  @ApiResponse({ 
    status: 400, 
    description: 'Invalid or expired OTP, or file validation error'
  })
  async verifyOTPComplete(
    @Body() dto: EnhancedVerifyOtpDto,
    @Req() req: Request
  ): Promise<EnhancedOtpCompleteVerificationResponseDto> {
    const ipAddress = req.ip || req.connection.remoteAddress;
    const userAgent = req.headers['user-agent'];
    
    
    return await this.firstLoginService.verifyOTPComplete(dto, dto.profileImageUrl, ipAddress, userAgent);
  }

  @Post('verify-otp-enhanced')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ 
    summary: 'Enhanced OTP verification - Returns minimal user data with simple JWT',
    description: 'Verify OTP and return minimal user profile with simple token containing only user ID'
  })
  @ApiBody({ type: VerifyOtpDto })
  @ApiResponse({ 
    status: 200, 
    description: 'OTP verified successfully - user data returned',
    type: EnhancedOtpVerificationResponseDto
  })
  @ApiResponse({ 
    status: 400, 
    description: 'Invalid or expired OTP'
  })
  async verifyOTPEnhanced(
    @Body() dto: VerifyOtpDto,
    @Req() req: Request
  ): Promise<EnhancedOtpVerificationResponseDto> {
    const ipAddress = req.ip || req.connection.remoteAddress;
    const userAgent = req.headers['user-agent'];
    
    
    return await this.firstLoginService.verifyOTPEnhanced(dto, ipAddress, userAgent);
  }

  @Put('complete-profile')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ 
    summary: 'Complete user profile - Update profile data, password, and image',
    description: 'Update user profile information including password and image upload with simple JWT authentication'
  })
  @ApiBody({ type: CompleteProfileDto })
  @ApiResponse({ 
    status: 200, 
    description: 'Profile updated successfully',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
        message: { type: 'string', example: 'Profile updated successfully' },
        user: { 
          type: 'object',
          properties: {
            id: { type: 'string' },
            email: { type: 'string' },
            firstName: { type: 'string' },
            lastName: { type: 'string' },
            userType: { type: 'string' }
          }
        }
      }
    }
  })
  @ApiResponse({ 
    status: 401, 
    description: 'Unauthorized - Invalid token'
  })
  async completeProfile(
    @Body() dto: CompleteProfileDto,
    @Headers('authorization') authorization: string,
    @Req() req: Request
  ): Promise<{ success: boolean; message: string; user: any }> {
    const ipAddress = req.ip || req.connection.remoteAddress;
    const userAgent = req.headers['user-agent'];
    
    
    return await this.firstLoginService.completeProfile(dto, authorization, ipAddress, userAgent);
  }
}
