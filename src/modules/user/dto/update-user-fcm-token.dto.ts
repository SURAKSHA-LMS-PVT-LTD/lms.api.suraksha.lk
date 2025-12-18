import { PartialType } from '@nestjs/swagger';
import { CreateUserFcmTokenDto } from './create-user-fcm-token.dto';
import { IsOptional, IsBoolean, IsDateString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateUserFcmTokenDto extends PartialType(CreateUserFcmTokenDto) {
  @ApiPropertyOptional({ description: 'Last seen timestamp' })
  @IsOptional()
  @IsDateString()
  lastSeen?: string;

  @ApiPropertyOptional({ description: 'Last notification sent timestamp' })
  @IsOptional()
  @IsDateString()
  lastNotificationSent?: string;
}
