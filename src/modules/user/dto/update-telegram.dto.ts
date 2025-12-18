import { IsString, IsNotEmpty, Length } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateTelegramDto {
  @ApiProperty({
    description: 'User ID to update telegram ID for',
    example: '123'
  })
  @IsString()
  @IsNotEmpty()
  userid: string;

  @ApiProperty({
    description: 'Telegram ID to set for the user (max 20 characters)',
    example: '7633577879',
    maxLength: 20
  })
  @IsString()
  @IsNotEmpty()
  @Length(1, 20, { message: 'Telegram ID must be between 1 and 20 characters' })
  telgramId: string; // Note: keeping the typo as requested

  @ApiProperty({
    description: 'Security token that must match JWT token for authorization',
    example: 'lkfannlsflk'
  })
  @IsString()
  @IsNotEmpty()
  p: string;
}
