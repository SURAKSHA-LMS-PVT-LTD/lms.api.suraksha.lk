import { IsNotEmpty, IsString, MinLength, IsOptional, IsBoolean, IsEnum, IsObject } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';

export class InstituteLoginDto {
  @ApiProperty({
    description: 'Institute ID the user belongs to',
    example: '1'
  })
  @IsString()
  @IsNotEmpty({ message: 'Institute ID is required' })
  instituteId: string;

  @ApiProperty({
    description: 'Institute-assigned user ID (e.g., admission number, employee ID)',
    example: 'STU2024001'
  })
  @IsString()
  @IsNotEmpty({ message: 'Institute user ID is required' })
  userIdByInstitute: string;

  @ApiProperty({
    description: 'Institute-level password',
    example: 'password123',
    minLength: 1
  })
  @IsString()
  @IsNotEmpty({ message: 'Password is required' })
  @MinLength(1, { message: 'Password cannot be empty' })
  password: string;

  @ApiPropertyOptional({
    description: 'Remember me flag for extended session',
    example: false,
    default: false
  })
  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === true || value === 'true')
  rememberMe?: boolean;
}

export class InstituteSetPasswordDto {
  @ApiProperty({
    description: 'Institute ID',
    example: '1'
  })
  @IsString()
  @IsNotEmpty()
  instituteId: string;

  @ApiProperty({
    description: 'New password (min 8 characters)',
    minLength: 8
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(8, { message: 'Password must be at least 8 characters' })
  newPassword: string;
}

/** Body for the admin set-password endpoint (instituteId + userId come from the URL path). */
export class AdminSetInstitutePasswordDto {
  @ApiProperty({ description: 'New institute password (min 8 characters)', minLength: 8 })
  @IsString()
  @IsNotEmpty()
  @MinLength(8, { message: 'Password must be at least 8 characters' })
  newPassword: string;
}

export class InstituteChangePasswordDto {
  @ApiProperty({
    description: 'Institute ID',
    example: '1'
  })
  @IsString()
  @IsNotEmpty()
  instituteId: string;

  @ApiProperty({
    description: 'Current institute password'
  })
  @IsString()
  @IsNotEmpty()
  currentPassword: string;

  @ApiProperty({
    description: 'New password (min 8 characters)',
    minLength: 8
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(8, { message: 'Password must be at least 8 characters' })
  newPassword: string;
}

export enum InstitutePasswordResetChannel {
  EMAIL = 'EMAIL',
  PHONE = 'PHONE',
}

export class InstitutePasswordResetInitiateDto {
  @ApiProperty({
    description: 'Institute ID',
    example: '1'
  })
  @IsString()
  @IsNotEmpty()
  instituteId: string;

  @ApiProperty({
    description: 'Institute-assigned user ID',
    example: 'STU2024001'
  })
  @IsString()
  @IsNotEmpty()
  userIdByInstitute: string;

  @ApiPropertyOptional({
    description: 'Opaque contact ID returned by available-contacts endpoint (preferred)',
    example: 'own_phone'
  })
  @IsOptional()
  @IsString()
  selectedContactId?: string;

  /** @deprecated Use selectedContactId instead */
  @ApiPropertyOptional({ enum: InstitutePasswordResetChannel })
  @IsOptional()
  @IsEnum(InstitutePasswordResetChannel)
  channel?: InstitutePasswordResetChannel;

  /** @deprecated Use selectedContactId instead */
  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === true || value === 'true')
  useParentContact?: boolean;
}

// ── New DTOs ─────────────────────────────────────────────────────────────────

export class GetAvailableContactsDto {
  @ApiProperty({ description: 'Institute ID', example: '1' })
  @IsString()
  @IsNotEmpty()
  instituteId: string;

  @ApiProperty({ description: 'Institute-assigned user ID', example: 'STU2024001' })
  @IsString()
  @IsNotEmpty()
  userIdByInstitute: string;
}

export class SelfActivateRequestOtpDto {
  @ApiProperty({ description: 'Institute ID', example: '1' })
  @IsString()
  @IsNotEmpty()
  instituteId: string;

  @ApiProperty({ description: 'Contact ID chosen from available-contacts list', example: 'own_phone' })
  @IsString()
  @IsNotEmpty()
  selectedContactId: string;
}

export class SelfActivateVerifyDto {
  @ApiProperty({ description: 'Institute ID', example: '1' })
  @IsString()
  @IsNotEmpty()
  instituteId: string;

  @ApiProperty({ description: '6-digit OTP code', example: '123456' })
  @IsString()
  @IsNotEmpty()
  @MinLength(6)
  otpCode: string;

  @ApiProperty({ description: 'New institute password (min 8 chars)', minLength: 8 })
  @IsString()
  @IsNotEmpty()
  @MinLength(8, { message: 'Password must be at least 8 characters' })
  newPassword: string;

  @ApiPropertyOptional({
    description: 'Custom key-value data to add to empty extraData fields',
    example: { phoneNumber: '0771234567', email: 'student@mail.com' }
  })
  @IsOptional()
  @IsObject()
  extraData?: Record<string, any>;
}

export class InstitutePasswordResetVerifyDto {
  @ApiProperty({
    description: 'Institute ID',
    example: '1'
  })
  @IsString()
  @IsNotEmpty()
  instituteId: string;

  @ApiProperty({
    description: 'Institute-assigned user ID',
    example: 'STU2024001'
  })
  @IsString()
  @IsNotEmpty()
  userIdByInstitute: string;

  @ApiProperty({
    description: '6-digit OTP code',
    example: '123456'
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(6)
  otpCode: string;

  @ApiProperty({
    description: 'New password (min 8 characters)',
    minLength: 8
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(8, { message: 'Password must be at least 8 characters' })
  newPassword: string;
}
