import { IsBigIntId, IsOptionalBigIntId } from '../../../common/validators/bigint-id.validator';
import { IsString, IsEnum, IsOptional, IsBoolean, MaxLength, IsDateString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { DeviceType } from '../entities/user-fcm-token.entity';

export class CreateUserFcmTokenDto {
  @ApiProperty({ description: 'User ID to associate the FCM token with' })
  @IsBigIntId()
  userId: string;

  @ApiProperty({ description: 'FCM token for push notifications' })
  @IsString()
  @MaxLength(255)
  fcmToken: string;

  @ApiProperty({ description: 'Unique device identifier' })
  @IsString()
  @MaxLength(255)
  deviceId: string;

  @ApiProperty({ enum: DeviceType, description: 'Type of device' })
  @IsEnum(DeviceType)
  deviceType: DeviceType;

  @ApiPropertyOptional({ description: 'Device name/model' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  deviceName?: string;

  @ApiPropertyOptional({ description: 'Application version' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  appVersion?: string;

  @ApiPropertyOptional({ description: 'Operating system version' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  osVersion?: string;

  @ApiPropertyOptional({ description: 'Whether the token is active', default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ description: 'Whether the token is synced', default: false })
  @IsOptional()
  @IsBoolean()
  isSynced?: boolean;
}
