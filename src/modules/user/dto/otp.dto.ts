import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsOptional, IsString, Length, Matches } from 'class-validator';
import { Transform } from 'class-transformer';

/**
 * Request Email OTP DTO
 */
export class RequestEmailOtpDto {
  @ApiProperty({ 
    description: 'Email address to send OTP',
    example: 'user@example.com'
  })
  @IsNotEmpty({ message: 'Email is required' })
  @IsEmail({}, { message: 'Invalid email format' })
  @Transform(({ value }) => value?.toLowerCase().trim())
  email: string;
}

/**
 * Verify Email OTP DTO
 */
export class VerifyEmailOtpDto {
  @ApiProperty({ 
    description: 'Email address',
    example: 'user@example.com'
  })
  @IsNotEmpty({ message: 'Email is required' })
  @IsEmail({}, { message: 'Invalid email format' })
  @Transform(({ value }) => value?.toLowerCase().trim())
  email: string;

  @ApiProperty({ 
    description: '6-digit OTP code',
    example: '123456',
    minLength: 6,
    maxLength: 6
  })
  @IsNotEmpty({ message: 'OTP code is required' })
  @IsString()
  @Length(6, 6, { message: 'OTP must be exactly 6 digits' })
  @Matches(/^\d{6}$/, { message: 'OTP must be 6 digits' })
  otpCode: string;
}

/**
 * Request Phone OTP DTO
 */
export class RequestPhoneOtpDto {
  @ApiProperty({ 
    description: 'Phone number with country code (will be auto-normalized to +94XXXXXXXXX)',
    example: '+94771234567'
  })
  @IsNotEmpty({ message: 'Phone number is required' })
  @IsString()
  phoneNumber: string;
}

/**
 * Verify Phone OTP DTO
 */
export class VerifyPhoneOtpDto {
  @ApiProperty({ 
    description: 'Phone number with country code',
    example: '+94771234567'
  })
  @IsNotEmpty({ message: 'Phone number is required' })
  @IsString()
  phoneNumber: string;

  @ApiProperty({ 
    description: '6-digit OTP code',
    example: '123456',
    minLength: 6,
    maxLength: 6
  })
  @IsNotEmpty({ message: 'OTP code is required' })
  @IsString()
  @Length(6, 6, { message: 'OTP must be exactly 6 digits' })
  @Matches(/^\d{6}$/, { message: 'OTP must be 6 digits' })
  otpCode: string;
}

/**
 * OTP Response DTO
 */
export class OtpResponseDto {
  @ApiProperty({ description: 'Success status' })
  success: boolean;

  @ApiProperty({ description: 'Response message' })
  message: string;

  @ApiPropertyOptional({ description: 'OTP expiry time (ISO string)' })
  expiresAt?: string;

  @ApiPropertyOptional({ description: 'Remaining attempts for today' })
  remainingAttempts?: number;
}
