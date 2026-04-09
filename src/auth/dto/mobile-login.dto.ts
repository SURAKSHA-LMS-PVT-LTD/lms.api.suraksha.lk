import { IsEmail, IsNotEmpty, IsString, MinLength, IsOptional, MaxLength, IsBoolean, ValidateIf } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';

/**
 * 📱 Mobile Login DTO
 * For mobile app authentication (iOS/Android)
 * Returns refresh_token in response body (not cookie)
 * Supports multiple login identifiers: email, phone, system ID, birth certificate
 */
export class MobileLoginDto {
  @ApiProperty({ 
    description: 'User identifier: email, phone number (+94771234567, 0771234567, 771234567), system registration number (6 digits like 500423), or birth certificate number',
    examples: {
      email: { value: 'user@example.com', description: 'Login with email' },
      phone_international: { value: '+94771234567', description: 'Login with phone (international format)' },
      phone_local: { value: '0771234567', description: 'Login with phone (local format with 0)' },
      phone_short: { value: '771234567', description: 'Login with phone (without country code or 0)' },
      system_id: { value: '500423', description: 'Login with system registration number (6 digits)' },
      birth_cert: { value: '12345678901', description: 'Login with birth certificate number' }
    }
  })
  @IsString({ message: 'Identifier must be a string' })
  @ValidateIf((o) => !o.email)
  @IsNotEmpty({ message: 'Identifier (email/phone/system ID/birth certificate number) is required' })
  @Transform(({ value, obj }) => value || obj.email || '')
  identifier: string;

  // Legacy support: accept "email" field and map it to identifier
  @ApiPropertyOptional({ description: '(Legacy) Email — use "identifier" instead' })
  @IsOptional()
  @IsString()
  email?: string;

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
  @ValidateIf((o) => !o.device_id)
  @IsNotEmpty({ message: 'Device ID is required for mobile login' })
  @MaxLength(255, { message: 'Device ID must not exceed 255 characters' })
  @Transform(({ value, obj }) => value || obj.device_id || '')
  deviceId: string;

  // Legacy support: accept snake_case "device_id"
  @IsOptional()
  @IsString()
  @MaxLength(255)
  device_id?: string;

  @ApiPropertyOptional({
    description: 'Device name for user-friendly session management display',
    example: 'Samsung Galaxy S21'
  })
  @IsString({ message: 'Device name must be a string' })
  @IsOptional()
  @MaxLength(100, { message: 'Device name must not exceed 100 characters' })
  deviceName?: string;

  // Legacy support: accept snake_case "device_name"
  @IsOptional()
  @IsString()
  @MaxLength(100)
  device_name?: string;

  @ApiPropertyOptional({
    description: 'Platform type (android/ios)',
    example: 'android',
    enum: ['android', 'ios']
  })
  @IsString({ message: 'Platform must be a string' })
  @IsOptional()
  platform?: 'android' | 'ios';

  @ApiPropertyOptional({ description: 'Remember me flag for extended session' })
  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === true || value === 'true')
  rememberMe?: boolean;

  // Accept snake_case variant
  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === true || value === 'true')
  remember_me?: boolean;

  // Accept FCM token at login for push notification registration
  @ApiPropertyOptional({ description: 'Firebase Cloud Messaging token for push notifications' })
  @IsOptional()
  @IsString()
  fcmToken?: string;

  // Legacy snake_case variant
  @IsOptional()
  @IsString()
  fcm_token?: string;

  // ─── SSO / Multi-tenant fields ───────────────────────────────────────────
  // Sent when the mobile app is branded for a specific institute subdomain.
  // Ignored by the mobile controller but must be whitelisted so
  // forbidNonWhitelisted does not reject the request with 400.

  @ApiPropertyOptional({ description: 'Subdomain of the institute (e.g. "academy" for academy.suraksha.lk)' })
  @IsOptional()
  @IsString()
  subdomain?: string;

  @ApiPropertyOptional({ description: 'Custom domain of the institute (e.g. "lms.myschool.com")' })
  @IsOptional()
  @IsString()
  customDomain?: string;

  // Accept snake_case variant
  @IsOptional()
  @IsString()
  custom_domain?: string;

  @ApiPropertyOptional({ description: 'Login method — set automatically based on login origin' })
  @IsOptional()
  @IsString()
  loginMethod?: string;

  // Accept snake_case variant
  @IsOptional()
  @IsString()
  login_method?: string;
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
  @ValidateIf((o) => !o.refreshToken)
  @IsNotEmpty({ message: 'Refresh token is required' })
  @Transform(({ value, obj }) => value || obj.refreshToken || '')
  refresh_token: string;

  // Accept camelCase variant
  @IsOptional()
  @IsString()
  refreshToken?: string;

  @ApiProperty({
    description: 'Unique device identifier (must match the one used during login)',
    example: 'android_1706438400000_abc123xyz'
  })
  @IsString({ message: 'Device ID must be a string' })
  @ValidateIf((o) => !o.device_id)
  @IsNotEmpty({ message: 'Device ID is required' })
  @MaxLength(255, { message: 'Device ID must not exceed 255 characters' })
  @Transform(({ value, obj }) => value || obj.device_id || '')
  deviceId: string;

  // Accept snake_case variant
  @IsOptional()
  @IsString()
  @MaxLength(255)
  device_id?: string;
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
  @ValidateIf((o) => !o.refreshToken)
  @IsNotEmpty({ message: 'Refresh token is required' })
  @Transform(({ value, obj }) => value || obj.refreshToken || '')
  refresh_token: string;

  // Accept camelCase variant
  @IsOptional()
  @IsString()
  refreshToken?: string;

  @ApiProperty({
    description: 'Unique device identifier',
    example: 'android_1706438400000_abc123xyz'
  })
  @IsString({ message: 'Device ID must be a string' })
  @ValidateIf((o) => !o.device_id)
  @IsNotEmpty({ message: 'Device ID is required' })
  @MaxLength(255, { message: 'Device ID must not exceed 255 characters' })
  @Transform(({ value, obj }) => value || obj.device_id || '')
  deviceId: string;

  // Accept snake_case variant
  @IsOptional()
  @IsString()
  @MaxLength(255)
  device_id?: string;
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
  refresh_expires_in: number;
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
  refresh_expires_in: number;
  user: {
    id: string;
    email: string;
    nameWithInitials: string;
    userType: string;
    imageUrl?: string;
  };
}
