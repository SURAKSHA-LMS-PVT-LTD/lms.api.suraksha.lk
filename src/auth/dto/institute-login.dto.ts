import { IsNotEmpty, IsString, MinLength, IsOptional, IsBoolean, IsEnum } from 'class-validator';
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

  @ApiProperty({
    description: 'Channel to send OTP: EMAIL or PHONE',
    enum: InstitutePasswordResetChannel
  })
  @IsEnum(InstitutePasswordResetChannel)
  channel: InstitutePasswordResetChannel;

  @ApiPropertyOptional({
    description: 'Set to true to use parent contact info (for students without own email/phone)',
    default: false
  })
  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === true || value === 'true')
  useParentContact?: boolean;
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
