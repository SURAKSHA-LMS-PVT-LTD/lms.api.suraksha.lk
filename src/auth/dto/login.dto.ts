import { IsNotEmpty, IsString, MinLength, IsOptional, IsBoolean, ValidateIf, IsEnum } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { LoginMethod } from '../../modules/institute/enums/institute.enums';

export class LoginDto {
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
  // Only require identifier if email is also not provided
  @ValidateIf((o) => !o.email)
  @IsNotEmpty({ message: 'Identifier (email/phone/system ID/birth certificate number) is required' })
  @Transform(({ value, obj }) => value || obj.email || '')
  identifier: string;

  // Legacy support: accept "email" field and map it to identifier
  @ApiPropertyOptional({ 
    description: '(Legacy) Email address — use "identifier" instead. If both are sent, "identifier" takes priority.',
    example: 'user@example.com'
  })
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

  @ApiPropertyOptional({ 
    description: 'Remember me flag for extended session',
    example: true,
    default: false
  })
  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === true || value === 'true')
  rememberMe?: boolean;

  // Accept snake_case variant from frontend and map to rememberMe
  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === true || value === 'true')
  remember_me?: boolean;

  // ═══ Multi-tenant fields (optional — only sent from subdomain/custom domain login pages)

  @ApiPropertyOptional({
    description: 'Subdomain the user is logging in from (e.g., "academy" for academy.suraksha.lk)',
    example: 'academy'
  })
  @IsOptional()
  @IsString()
  subdomain?: string;

  @ApiPropertyOptional({
    description: 'Custom domain the user is logging in from (e.g., "lms.myinstitute.com")',
    example: 'lms.myinstitute.com'
  })
  @IsOptional()
  @IsString()
  customDomain?: string;

  @ApiPropertyOptional({
    description: 'Login method — automatically set based on login origin',
    enum: LoginMethod,
    example: LoginMethod.SURAKSHA_WEB
  })
  @IsOptional()
  @IsEnum(LoginMethod)
  loginMethod?: LoginMethod;
}
