import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class LogoutDto {
  @ApiPropertyOptional({ description: 'Refresh token to revoke', maxLength: 512 })
  @IsOptional()
  @IsString()
  @MaxLength(512)
  refresh_token?: string;
}
