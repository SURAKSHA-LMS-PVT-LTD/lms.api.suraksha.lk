import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Expose } from 'class-transformer';
import { DeviceType } from '../entities/user-fcm-token.entity';

export class UserFcmTokenResponseDto {
  @ApiProperty({ description: 'FCM token ID' })
  @Expose()
  id: string;

  @ApiProperty({ description: 'User ID' })
  @Expose()
  userId: string;

  @ApiProperty({ description: 'FCM token for push notifications' })
  @Expose()
  fcmToken: string;

  @ApiProperty({ description: 'Unique device identifier' })
  @Expose()
  deviceId: string;

  @ApiProperty({ enum: DeviceType, description: 'Type of device' })
  @Expose()
  deviceType: DeviceType;

  @ApiPropertyOptional({ description: 'Device name/model' })
  @Expose()
  deviceName?: string;

  @ApiPropertyOptional({ description: 'Application version' })
  @Expose()
  appVersion?: string;

  @ApiPropertyOptional({ description: 'Operating system version' })
  @Expose()
  osVersion?: string;

  @ApiProperty({ description: 'Whether the token is active' })
  @Expose()
  isActive: boolean;

  @ApiProperty({ description: 'Whether the token is synced' })
  @Expose()
  isSynced: boolean;

  @ApiPropertyOptional({ description: 'Last seen timestamp' })
  @Expose()
  lastSeen?: Date;

  @ApiPropertyOptional({ description: 'Last notification sent timestamp' })
  @Expose()
  lastNotificationSent?: Date;

  @ApiProperty({ description: 'Creation timestamp' })
  @Expose()
  createdAt: Date;

  @ApiProperty({ description: 'Last update timestamp' })
  @Expose()
  updatedAt: Date;
}
