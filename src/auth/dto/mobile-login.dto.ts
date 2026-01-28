import { IsEmail, IsNotEmpty, IsString, MinLength, IsOptional, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * 📱 Mobile Login DTO
 * For mobile app authentication (iOS/Android)
 * Returns refresh_token in response body (not cookie)
 */
export class MobileLoginDto {
  @ApiProperty({ 
    description: 'User email address',
    example: 'user@example.com'
  })
  @IsEmail({}, { message: 'Please provide a valid email address' })
  @IsNotEmpty({ message: 'Email is required' })
  email: string;

  @ApiProperty({ 
    description: 'User password',
    example: 'password123',
    minLength: 1
  })
  @IsString({ message: 'Password must be a string' })
  @IsNotEmpty({ message: 'Password is required' })
  @MinLength(1, { message: 'Password cannot be empty' })
  password: string;

  @ApiProperty({
    description: 'Unique device identifier for session management. Format: platform_timestamp_uuid (e.g., android_1706438400000_abc123xyz)',
    example: 'android_1706438400000_abc123xyz'
  })
  @IsString({ message: 'Device ID must be a string' })
  @IsNotEmpty({ message: 'Device ID is required for mobile login' })
  @MaxLength(255, { message: 'Device ID must not exceed 255 characters' })
  deviceId: string;

  @ApiPropertyOptional({
    description: 'Device name for user-friendly session management display',
    example: 'Samsung Galaxy S21'
  })
  @IsString({ message: 'Device name must be a string' })
  @IsOptional()
  @MaxLength(100, { message: 'Device name must not exceed 100 characters' })
  deviceName?: string;

  @ApiPropertyOptional({
    description: 'Platform type (android/ios)',
    example: 'android',
    enum: ['android', 'ios']
  })
  @IsString({ message: 'Platform must be a string' })
  @IsOptional()
  platform?: 'android' | 'ios';
}

/**
 * 📱 Mobile Token Refresh DTO
 * For refreshing tokens on mobile devices
 * Requires refresh_token in body (not from cookie)
 */
export class MobileRefreshTokenDto {
  @ApiProperty({
    description: 'Refresh token received during login',
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...'
  })
  @IsString({ message: 'Refresh token must be a string' })
  @IsNotEmpty({ message: 'Refresh token is required' })
  refresh_token: string;

  @ApiProperty({
    description: 'Unique device identifier (must match the one used during login)',
    example: 'android_1706438400000_abc123xyz'
  })
  @IsString({ message: 'Device ID must be a string' })
  @IsNotEmpty({ message: 'Device ID is required' })
  @MaxLength(255, { message: 'Device ID must not exceed 255 characters' })
  deviceId: string;
}

/**
 * 📱 Mobile Logout DTO
 * For logging out from mobile devices
 * Revokes the specific device token
 */
export class MobileLogoutDto {
  @ApiProperty({
    description: 'Refresh token to revoke',
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...'
  })
  @IsString({ message: 'Refresh token must be a string' })
  @IsNotEmpty({ message: 'Refresh token is required' })
  refresh_token: string;

  @ApiProperty({
    description: 'Unique device identifier',
    example: 'android_1706438400000_abc123xyz'
  })
  @IsString({ message: 'Device ID must be a string' })
  @IsNotEmpty({ message: 'Device ID is required' })
  @MaxLength(255, { message: 'Device ID must not exceed 255 characters' })
  deviceId: string;
}

/**
 * 📱 Mobile Login Response
 * Type definition for mobile login response
 * Includes refresh_token in response body
 */
export interface MobileLoginResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  payload?: {
    s: string;
    u: number;
    t: number;
    i?: any[];
  };
  user: {
    id: string;
    email: string;
    nameWithInitials: string;
    userType: string;
    imageUrl?: string;
  };
}

/**
 * 📱 Mobile Refresh Response
 * Type definition for mobile token refresh response
 */
export interface MobileRefreshResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  user: {
    id: string;
    email: string;
    nameWithInitials: string;
    userType: string;
    imageUrl?: string;
  };
}
