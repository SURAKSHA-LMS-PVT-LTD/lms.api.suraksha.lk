import { IsNotEmpty, IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

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
  @IsNotEmpty({ message: 'Identifier (email/phone/system ID/birth certificate number) is required' })
  identifier: string;

  @ApiProperty({ 
    description: 'User password',
    example: 'password123',
    minLength: 1
  })
  @IsString({ message: 'Password must be a string' })
  @IsNotEmpty({ message: 'Password is required' })
  @MinLength(1, { message: 'Password cannot be empty' })
  password: string;
}
