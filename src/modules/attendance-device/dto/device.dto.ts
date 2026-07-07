import {
  IsString, IsOptional, IsEnum, IsBoolean, IsNumber, IsArray,
  MaxLength, Min, Max, IsJSON, IsNotEmpty, IsIP, IsInt,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type, Transform } from 'class-transformer';
import { DeviceType, DeviceStatus, AllowedStatusMode } from '../enums/device.enums';

// ═════════════════════════════════════════════════════════════════════════════
//  CREATE / REGISTER DEVICE  (System Admin)
// ═════════════════════════════════════════════════════════════════════════════
export class CreateDeviceDto {
  @ApiProperty({ description: 'Unique hardware/software identifier', example: 'DEVICE-SN-00129' })
  @IsString()
  @MaxLength(128)
  deviceUid: string;

  @ApiProperty({ description: 'Friendly name', example: 'Front Gate Tablet' })
  @IsString()
  @MaxLength(255)
  deviceName: string;

  @ApiPropertyOptional({ enum: DeviceType, default: DeviceType.TABLET })
  @IsOptional()
  @IsEnum(DeviceType)
  deviceType?: DeviceType;

  @ApiPropertyOptional({ description: 'Assign immediately to institute' })
  @IsOptional()
  @IsString()
  instituteId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  instituteName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiPropertyOptional({ description: 'Extra metadata JSON' })
  @IsOptional()
  metadata?: Record<string, any>;
}

// ═════════════════════════════════════════════════════════════════════════════
//  UPDATE DEVICE  (System Admin – full | Institute Admin – limited)
// ═════════════════════════════════════════════════════════════════════════════
export class UpdateDeviceDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  deviceName?: string;

  @ApiPropertyOptional({ enum: DeviceType })
  @IsOptional()
  @IsEnum(DeviceType)
  deviceType?: DeviceType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  metadata?: Record<string, any>;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(64)
  firmwareVersion?: string;
}

// ═════════════════════════════════════════════════════════════════════════════
//  ASSIGN / REASSIGN DEVICE TO INSTITUTE  (System Admin only)
// ═════════════════════════════════════════════════════════════════════════════
export class AssignDeviceDto {
  @ApiProperty({ description: 'Target institute ID' })
  @IsString()
  @IsNotEmpty()
  instituteId: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  instituteName?: string;
}

// ═════════════════════════════════════════════════════════════════════════════
//  DEVICE CONFIG UPDATE  (System Admin – all | Institute Admin – subset)
// ═════════════════════════════════════════════════════════════════════════════
export class UpdateDeviceConfigDto {
  // ── Session limits (system admin only) ─────────────────────────────────────
  @ApiPropertyOptional({ description: 'Max simultaneous sessions', minimum: 1, maximum: 10 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10)
  @Type(() => Number)
  maxSessions?: number;

  // ── Rate limits (system admin only) ────────────────────────────────────────
  @ApiPropertyOptional({ minimum: 1, maximum: 200 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(200)
  @Type(() => Number)
  rateLimitPerMinute?: number;

  @ApiPropertyOptional({ minimum: 1, maximum: 5000 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5000)
  @Type(() => Number)
  rateLimitPerHour?: number;

  // ── Allowed statuses (both admins) ────────────────────────────────────────
  @ApiPropertyOptional({ enum: AllowedStatusMode })
  @IsOptional()
  @IsEnum(AllowedStatusMode)
  allowedStatusMode?: AllowedStatusMode;

  @ApiPropertyOptional({
    description: 'Required when mode = ONLY. Array of status strings.',
    example: ['present', 'late'],
  })
  @IsOptional()
  @IsArray()
  allowedStatusList?: string[];

  @ApiPropertyOptional({ description: 'Force this status on every mark', example: 'present' })
  @IsOptional()
  @IsString()
  autoStatus?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => (value ? 1 : 0))
  requireLocation?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => (value ? 1 : 0))
  requirePhoto?: number;

  @ApiPropertyOptional({ description: 'IP whitelist (CIDR or single IP)', example: ['192.168.1.0/24'] })
  @IsOptional()
  @IsArray()
  allowedIpRanges?: string[];

  @ApiPropertyOptional({ description: 'Operating start time HH:mm', example: '07:30' })
  @IsOptional()
  @IsString()
  @MaxLength(5)
  operatingStartTime?: string;

  @ApiPropertyOptional({ description: 'Operating end time HH:mm', example: '18:00' })
  @IsOptional()
  @IsString()
  @MaxLength(5)
  operatingEndTime?: string;
}

// ═════════════════════════════════════════════════════════════════════════════
//  BIND DEVICE ↔ EVENT  (Institute Admin)
// ═════════════════════════════════════════════════════════════════════════════
export class BindDeviceEventDto {
  @ApiProperty({ description: 'Calendar event ID to bind' })
  @IsInt()
  @Type(() => Number)
  eventId: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  eventName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  calendarDayId?: number;

  @ApiPropertyOptional({ description: 'Override status for this event only', example: 'present' })
  @IsOptional()
  @IsString()
  statusOverride?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}

// ═════════════════════════════════════════════════════════════════════════════
//  QUERY / LIST DTOs
// ═════════════════════════════════════════════════════════════════════════════
export class DeviceQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  instituteId?: string;

  @ApiPropertyOptional({ enum: DeviceStatus })
  @IsOptional()
  @IsEnum(DeviceStatus)
  status?: DeviceStatus;

  @ApiPropertyOptional({ enum: DeviceType })
  @IsOptional()
  @IsEnum(DeviceType)
  deviceType?: DeviceType;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === '1')
  isEnabled?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  search?: string; // free text search in name/uid

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  page?: number;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  @Type(() => Number)
  limit?: number;
}

// ═════════════════════════════════════════════════════════════════════════════
//  DEVICE HEARTBEAT (called from device itself)
// ═════════════════════════════════════════════════════════════════════════════
export class DeviceHeartbeatDto {
  @ApiProperty()
  @IsString()
  deviceUid: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  ipAddress?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  firmwareVersion?: string;
}

// ═════════════════════════════════════════════════════════════════════════════
//  START SESSION
// ═════════════════════════════════════════════════════════════════════════════
export class StartDeviceSessionDto {
  @ApiProperty()
  @IsString()
  deviceUid: string;

  @ApiPropertyOptional({ description: 'User logging into the device' })
  @IsOptional()
  @IsString()
  userId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  ipAddress?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  userAgent?: string;
}
