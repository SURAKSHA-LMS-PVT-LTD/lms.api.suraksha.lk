import { 
  Controller, 
  Post, 
  Body, 
  UseGuards, 
  Request, 
  BadRequestException, 
  UnauthorizedException,
  HttpCode,
  HttpStatus,
  Req,
  Get,
  Query,
  ValidationPipe
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiExtraModels, ApiTags, ApiOperation, ApiResponse, ApiProperty, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { PasswordResetService } from '../services/password-reset.service';
import { Request as ExpressRequest } from 'express';
import { 
  IsEmail, 
  IsNotEmpty, 
  IsString, 
  MinLength, 
  Matches, 
  IsOptional,
  Length,
  ValidateIf
} from 'class-validator';
import { Transform } from 'class-transformer';

import { FlexibleAccessGuard } from '../guards/flexible-access.guard';
import { RequireAnyOfRoles } from '../decorators/flexible-access.decorator';
import { JwtRequest } from '../../common/interfaces/jwt-request.interface';
import { Public } from '../../common/decorators/public.decorator';

// DTOs for password reset operations
export class InitiatePasswordResetDto {
  @ApiProperty({
    description: 'User identifier: email, phone number (+94771234567, 0771234567, 771234567), system registration number (6 digits like 500423), or birth certificate number',
    examples: {
      email: { value: 'user@example.com', description: 'Reset with email' },
      phone: { value: '+94771234567', description: 'Reset with phone' },
      system_id: { value: '500423', description: 'Reset with system ID' },
      birth_cert: { value: '12345678901', description: 'Reset with birth certificate' }
    },
    required: true
  })
  @IsString({ message: 'Identifier must be a string' })
  @ValidateIf((o) => !o.email)
  @IsNotEmpty({ message: 'Identifier (email/phone/system ID/birth certificate) is required' })
  @Transform(({ value, obj }) => value || obj.email || '')
  identifier: string;

  // Legacy support: accept "email" field
  @IsOptional()
  @IsString()
  email?: string;
}

export class VerifyPasswordResetOtpDto {
  @ApiProperty({
    description: 'User identifier (same as used in forgot-password): email, phone, system ID, or birth certificate',
    example: 'user@example.com',
    required: true
  })
  @IsString({ message: 'Identifier must be a string' })
  @ValidateIf((o) => !o.email)
  @IsNotEmpty({ message: 'Identifier is required' })
  @Transform(({ value, obj }) => value || obj.email || '')
  identifier: string;

  // Legacy support: accept "email" field
  @IsOptional()
  @IsString()
  email?: string;

  @ApiProperty({
    description: '6-digit OTP code received via email',
    example: '123456',
    minLength: 6,
    maxLength: 6,
    required: true
  })
  @IsString({ message: 'OTP must be a string' })
  @Length(6, 6, { message: 'OTP must be exactly 6 characters' })
  @IsNotEmpty({ message: 'OTP is required' })
  otp: string;
}

export class ResetPasswordDto {
  @IsString({ message: 'Identifier must be a string' })
  @ValidateIf((o) => !o.email)
  @IsNotEmpty({ message: 'Identifier (email/phone/system ID/birth certificate) is required' })
  @Transform(({ value, obj }) => value || obj.email || '')
  identifier: string;

  // Legacy support: accept "email" field
  @IsOptional()
  @IsString()
  email?: string;

  @IsString({ message: 'OTP must be a string' })
  @Length(6, 6, { message: 'OTP must be exactly 6 characters' })
  @IsNotEmpty({ message: 'OTP is required' })
  otp: string;

  @IsString({ message: 'Password must be a string' })
  @MinLength(8, { message: 'Password must be at least 8 characters long' })
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/, {
    message: 'Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character'
  })
  @IsNotEmpty({ message: 'New password is required' })
  newPassword: string;

  @IsString({ message: 'Confirm password must be a string' })
  @IsNotEmpty({ message: 'Please confirm your new password' })
  confirmPassword: string;
}

@ApiExtraModels()
export class PasswordResetChangePasswordDto {
  @IsString({ message: 'Current password must be a string' })
  @IsNotEmpty({ message: 'Current password is required' })
  currentPassword: string;

  @IsString({ message: 'Password must be a string' })
  @MinLength(8, { message: 'Password must be at least 8 characters long' })
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/, {
    message: 'Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character'
  })
  @IsNotEmpty({ message: 'New password is required' })
  newPassword: string;

  @IsString({ message: 'Confirm password must be a string' })
  @IsNotEmpty({ message: 'Please confirm your new password' })
  confirmPassword: string;
}

export class InitiatePasswordChangeDto {
  @IsString({ message: 'Current password must be a string' })
  @IsNotEmpty({ message: 'Current password is required' })
  currentPassword: string;

  @IsString({ message: 'Password must be a string' })
  @MinLength(8, { message: 'Password must be at least 8 characters long' })
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/, {
    message: 'Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character'
  })
  @IsNotEmpty({ message: 'New password is required' })
  newPassword: string;

  @IsString({ message: 'Confirm password must be a string' })
  @IsNotEmpty({ message: 'Please confirm your new password' })
  confirmPassword: string;
}

export class CompletePasswordChangeDto {
  @IsString({ message: 'OTP must be a string' })
  @Length(6, 6, { message: 'OTP must be exactly 6 characters' })
  @IsNotEmpty({ message: 'OTP is required' })
  otp: string;

  @IsString({ message: 'Password must be a string' })
  @MinLength(8, { message: 'Password must be at least 8 characters long' })
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/, {
    message: 'Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character'
  })
  @IsNotEmpty({ message: 'New password is required' })
  newPassword: string;

  @IsString({ message: 'Confirm password must be a string' })
  @IsNotEmpty({ message: 'Please confirm your new password' })
  confirmPassword: string;
}

@Controller('auth/password')
export class PasswordResetController {
  constructor(private readonly passwordResetService: PasswordResetService) {}

  /**
   * Initiate password reset process for users who forgot their password
   */
  @Post('reset/initiate')
  @Public() // Unauthenticated users need to initiate password reset
  @Throttle({ default: { limit: 3, ttl: 900000 } }) // 🔒 SECURITY: 3 password reset requests per 15 minutes
  @HttpCode(HttpStatus.OK)
  async initiatePasswordReset(
    @Body(ValidationPipe) initiatePasswordResetDto: InitiatePasswordResetDto,
    @Req() req: ExpressRequest
  ) {
    try {
      const clientInfo = {
        ipAddress: req.ip || req.connection.remoteAddress || 'unknown',
        userAgent: req.get('User-Agent') || 'unknown'
      };

      const result = await this.passwordResetService.initiatePasswordReset(
        initiatePasswordResetDto,
        clientInfo.ipAddress,
        clientInfo.userAgent
      );

      return {
        success: true,
        message: 'Password reset OTP has been sent to your email',
        data: result
      };
    } catch (error) {
      throw new BadRequestException(error.message);
    }
  }

  /**
   * Verify the OTP sent for password reset
   */
  @Post('reset/verify-otp')
  @Public() // Unauthenticated users need to verify OTP for password reset
  @Throttle({ default: { limit: 5, ttl: 900000 } }) // 🔒 SECURITY: 5 OTP verification attempts per 15 minutes
  @HttpCode(HttpStatus.OK)
  async verifyPasswordResetOtp(
    @Body(ValidationPipe) verifyOtpDto: VerifyPasswordResetOtpDto,
    @Req() req: ExpressRequest
  ) {
    try {
      const clientInfo = {
        ipAddress: req.ip || req.connection.remoteAddress || 'unknown',
        userAgent: req.get('User-Agent') || 'unknown'
      };

      const result = await this.passwordResetService.verifyPasswordResetOtp(verifyOtpDto);

      return {
        success: true,
        message: 'OTP verified successfully',
        data: result
      };
    } catch (error) {
      throw new BadRequestException(error.message);
    }
  }

  /**
   * Complete password reset with new password
   */
  @Post('reset/complete')
  @Public() // Unauthenticated users need to complete password reset
  @Throttle({ default: { limit: 3, ttl: 900000 } }) // 🔒 SECURITY: 3 password reset completion attempts per 15 minutes
  @HttpCode(HttpStatus.OK)
  async resetPassword(
    @Body(ValidationPipe) resetPasswordDto: ResetPasswordDto,
    @Req() req: ExpressRequest
  ) {
    try {
      const clientInfo = {
        ipAddress: req.ip || req.connection.remoteAddress || 'unknown',
        userAgent: req.get('User-Agent') || 'unknown'
      };

      const result = await this.passwordResetService.resetPassword(
        resetPasswordDto,
        clientInfo.ipAddress,
        clientInfo.userAgent
      );

      return {
        success: true,
        message: 'Password has been reset successfully',
        data: result
      };
    } catch (error) {
      throw new BadRequestException(error.message);
    }
  }

  /**
   * Change password for authenticated users (immediate change)
   */
  @Post('change')
  @Throttle({ default: { limit: 5, ttl: 900000 } }) // 🔒 SECURITY: 5 password change attempts per 15 minutes
  @UseGuards(JwtAuthGuard, FlexibleAccessGuard)
  @RequireAnyOfRoles({
    anyInstituteRole: true,
    global: []
  })
  @HttpCode(HttpStatus.OK)
  async changePassword(
    @Body(ValidationPipe) changePasswordDto: PasswordResetChangePasswordDto,
    @Request() req: JwtRequest
  ) {
    try {
      const clientInfo = {
        ipAddress: req.ip || req.connection.remoteAddress || 'unknown',
        userAgent: req.get('User-Agent') || 'unknown'
      };

      const result = await this.passwordResetService.changePassword(
        req.user.s,
        changePasswordDto,
        clientInfo.ipAddress,
        clientInfo.userAgent
      );

      return {
        success: true,
        message: 'Password changed successfully',
        data: result
      };
    } catch (error) {
      if (error.message.includes('Current password is incorrect')) {
        throw new UnauthorizedException(error.message);
      }
      throw new BadRequestException(error.message);
    }
  }

  /**
   * Initiate secure password change process with OTP verification
   */
  @Post('change/initiate')
  @Throttle({ default: { limit: 3, ttl: 900000 } }) // 🔒 SECURITY: 3 password change initiation attempts per 15 minutes
  @UseGuards(JwtAuthGuard, FlexibleAccessGuard)
  @RequireAnyOfRoles({
    anyInstituteRole: true,
    global: []
  })
  @HttpCode(HttpStatus.OK)
  async initiatePasswordChange(
    @Body(ValidationPipe) initiateChangeDto: InitiatePasswordChangeDto,
    @Request() req: JwtRequest
  ) {
    try {
      const clientInfo = {
        ipAddress: req.ip || req.connection.remoteAddress || 'unknown',
        userAgent: req.get('User-Agent') || 'unknown'
      };

      const result = await this.passwordResetService.initiatePasswordChange(
        req.user.s,
        initiateChangeDto.currentPassword,
        clientInfo.ipAddress,
        clientInfo.userAgent
      );

      return {
        success: true,
        message: 'Password change OTP has been sent to your email',
        data: result
      };
    } catch (error) {
      if (error.message.includes('Current password is incorrect')) {
        throw new UnauthorizedException(error.message);
      }
      throw new BadRequestException(error.message);
    }
  }

  /**
   * Complete secure password change with OTP verification
   */
  @Post('change/complete')
  @Throttle({ default: { limit: 5, ttl: 900000 } }) // 🔒 SECURITY: 5 password change completion attempts per 15 minutes
  @UseGuards(JwtAuthGuard, FlexibleAccessGuard)
  @RequireAnyOfRoles({
    anyInstituteRole: true,
    global: []
  })
  @HttpCode(HttpStatus.OK)
  async completePasswordChange(
    @Body(ValidationPipe) completeChangeDto: CompletePasswordChangeDto,
    @Request() req: JwtRequest
  ) {
    try {
      const clientInfo = {
        ipAddress: req.ip || req.connection.remoteAddress || 'unknown',
        userAgent: req.get('User-Agent') || 'unknown'
      };

      const result = await this.passwordResetService.completePasswordChange(
        req.user.s,
        completeChangeDto.otp,
        completeChangeDto.newPassword,
        completeChangeDto.confirmPassword,
        clientInfo.ipAddress,
        clientInfo.userAgent
      );

      return {
        success: true,
        message: 'Password changed successfully',
        data: result
      };
    } catch (error) {
      throw new BadRequestException(error.message);
    }
  }
}
