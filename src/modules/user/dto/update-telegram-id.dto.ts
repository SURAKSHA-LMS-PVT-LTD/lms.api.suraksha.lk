import { IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateTelegramIdDto {
  @ApiProperty({ description: 'User ID', example: '7633577879' })
  @IsString()
  @IsNotEmpty()
  s: string;

  @ApiProperty({ description: 'Telegram chat ID', example: '7633577879' })
  @IsString()
  @IsNotEmpty()
  telgramId: string; // Note: keeping the original typo for backwards compatibility

  @ApiProperty({ description: 'Security token that must match JWT token for authorization', example: 'lkfannlsflk' })
  @IsString()
  @IsNotEmpty()
  p: string;
}
