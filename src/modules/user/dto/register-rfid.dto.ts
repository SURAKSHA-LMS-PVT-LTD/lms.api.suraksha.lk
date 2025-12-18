import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty, Length, Matches } from 'class-validator';

export class RegisterRfidDto {
  @ApiProperty({
    description: 'User ID to assign RFID to',
    example: '123',
    type: String
  })
  @IsString()
  @IsNotEmpty()
  userId: string;

  @ApiProperty({
    description: 'RFID tag identifier - alphanumeric characters only',
    example: 'RFID123456789',
    minLength: 4,
    maxLength: 50
  })
  @IsString()
  @IsNotEmpty()
  @Length(4, 50, { message: 'RFID must be between 4 and 50 characters' })
  @Matches(/^[A-Za-z0-9]+$/, { 
    message: 'RFID must contain only alphanumeric characters' 
  })
  userRfid: string;
}

export class RegisterRfidResponseDto {
  @ApiProperty({ example: true })
  success: boolean;

  @ApiProperty({ example: 'RFID registered successfully' })
  message: string;

  @ApiProperty({
    example: {
      userId: '123',
      rfid: 'RFID123456789',
      previousRfid: null,
      updatedAt: '2025-09-17T10:30:00Z'
    }
  })
  data: {
    userId: string;
    rfid: string;
    previousRfid?: string;
    updatedAt: string;
  };
}
