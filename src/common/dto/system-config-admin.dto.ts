/**
 * ⚙️ SYSTEM CONFIG ADMIN DTOs
 *
 * Request/Response DTOs for the system config admin CRUD endpoints.
 */
import {
  IsString,
  IsOptional,
  IsBoolean,
  IsIn,
  MaxLength,
  MinLength,
  IsNotEmpty,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';

// ═══════════════════════════════════════════════════════════
// REQUEST DTOs
// ═══════════════════════════════════════════════════════════

export class CreateSystemConfigDto {
  @ApiProperty({ example: 'FEATURE', description: 'Config group name', maxLength: 64 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  @Transform(({ value }) => value?.toUpperCase().trim())
  group: string;

  @ApiProperty({ example: 'MAINTENANCE_MODE', description: 'Config key', maxLength: 128 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  @Transform(({ value }) => value?.toUpperCase().trim())
  key: string;

  @ApiProperty({ example: 'false', description: 'Config value (always stored as string)' })
  @IsString()
  @IsNotEmpty()
  value: string;

  @ApiPropertyOptional({ example: 'System-wide maintenance mode toggle', maxLength: 512 })
  @IsOptional()
  @IsString()
  @MaxLength(512)
  description?: string;

  @ApiPropertyOptional({
    example: 'BOOLEAN',
    description: 'Value type hint',
    enum: ['STRING', 'NUMBER', 'BOOLEAN', 'JSON', 'ENUM'],
  })
  @IsOptional()
  @IsString()
  @IsIn(['STRING', 'NUMBER', 'BOOLEAN', 'JSON', 'ENUM'])
  valueType?: string;
}

export class UpdateSystemConfigDto {
  @ApiProperty({ example: 'true', description: 'New config value' })
  @IsString()
  @IsNotEmpty()
  value: string;

  @ApiPropertyOptional({ example: 'Updated description', maxLength: 512 })
  @IsOptional()
  @IsString()
  @MaxLength(512)
  description?: string;

  @ApiPropertyOptional({
    example: 'BOOLEAN',
    enum: ['STRING', 'NUMBER', 'BOOLEAN', 'JSON', 'ENUM'],
  })
  @IsOptional()
  @IsString()
  @IsIn(['STRING', 'NUMBER', 'BOOLEAN', 'JSON', 'ENUM'])
  valueType?: string;
}

export class QuerySystemConfigDto {
  @ApiPropertyOptional({ example: 'ATTENDANCE', description: 'Filter by group' })
  @IsOptional()
  @IsString()
  @Transform(({ value }) => value?.toUpperCase().trim())
  group?: string;

  @ApiPropertyOptional({ example: true, description: 'Filter by active status' })
  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => {
    if (value === 'true' || value === true) return true;
    if (value === 'false' || value === false) return false;
    return value;
  })
  isActive?: boolean;
}

// ═══════════════════════════════════════════════════════════
// RESPONSE DTOs
// ═══════════════════════════════════════════════════════════

export class SystemConfigResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() configGroup: string;
  @ApiProperty() configKey: string;
  @ApiProperty() configValue: string;
  @ApiProperty({ nullable: true }) description: string | null;
  @ApiProperty() valueType: string;
  @ApiProperty() isActive: boolean;
  @ApiProperty({ nullable: true }) updatedBy: string | null;
  @ApiProperty() createdAt: Date;
  @ApiProperty() updatedAt: Date;
}

export class SystemConfigGroupSummaryDto {
  @ApiProperty({ example: 'ATTENDANCE' }) group: string;
  @ApiProperty({ example: 4 }) count: number;
  @ApiProperty({ example: 3 }) activeCount: number;
}

export class CacheRefreshResponseDto {
  @ApiProperty({ example: true }) success: boolean;
  @ApiProperty({ example: 45 }) entriesCached: number;
}
