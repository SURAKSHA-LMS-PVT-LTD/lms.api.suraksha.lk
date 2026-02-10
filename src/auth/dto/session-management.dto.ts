import { IsString, IsNotEmpty, IsOptional, IsEnum, IsInt, Min, Max } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

/**
 * 📱 Session Response DTO
 * Represents a single active session/device
 */
export class SessionResponseDto {
  @ApiProperty({
    description: 'Session ID (needed for revocation)',
    example: '550e8400-e29b-41d4-a716-446655440000'
  })
  id: string;

  @ApiProperty({
    description: 'Device platform',
    enum: ['web', 'android', 'ios'],
    example: 'android'
  })
  platform: 'web' | 'android' | 'ios';

  @ApiProperty({
    description: 'Device ID (null for web)',
    example: 'device_1234567890_abc',
    nullable: true
  })
  deviceId: string | null;

  @ApiProperty({
    description: 'User-friendly device name (null for web)',
    example: 'Samsung Galaxy S21',
    nullable: true
  })
  deviceName: string | null;

  @ApiProperty({
    description: 'IP address of the session',
    example: '192.168.1.100',
    nullable: true
  })
  ipAddress: string | null;

  @ApiProperty({
    description: 'User agent string',
    example: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    nullable: true
  })
  userAgent: string | null;

  @ApiProperty({ 
    example: '2026-02-10T10:30:00.000Z',
    description: 'When the session was first created/logged in',
    type: String,
    format: 'date-time'
  })
  createdAt: Date;

  @ApiProperty({ 
    example: '2026-03-12T10:30:00.000Z',
    description: 'When the session token will expire',
    type: String,
    format: 'date-time'
  })
  expiresAt: Date;

  @ApiProperty({
    description: 'Whether this is the current session',
    example: false
  })
  isCurrent: boolean;

  @ApiProperty({
    description: 'Human-readable time until expiry',
    example: '30 days',
    type: String
  })
  expiresInHuman: string;
}

/**
 * 📋 Query DTO for listing sessions with pagination and filters
 */
export class GetSessionsQueryDto {
  @ApiPropertyOptional({
    description: 'Page number (1-indexed)',
    example: 1,
    default: 1,
    minimum: 1
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({
    description: 'Items per page',
    example: 10,
    default: 50,
    minimum: 1,
    maximum: 100
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 50;

  @ApiPropertyOptional({
    description: 'Filter by platform',
    enum: ['web', 'android', 'ios'],
    example: 'android'
  })
  @IsOptional()
  @IsEnum(['web', 'android', 'ios'])
  platform?: 'web' | 'android' | 'ios';

  @ApiPropertyOptional({
    description: 'Sort by field',
    enum: ['createdAt', 'expiresAt', 'platform'],
    example: 'createdAt',
    default: 'createdAt'
  })
  @IsOptional()
  @IsEnum(['createdAt', 'expiresAt', 'platform'])
  sortBy?: 'createdAt' | 'expiresAt' | 'platform' = 'createdAt';

  @ApiPropertyOptional({
    description: 'Sort order',
    enum: ['ASC', 'DESC'],
    example: 'DESC',
    default: 'DESC'
  })
  @IsOptional()
  @IsEnum(['ASC', 'DESC'])
  sortOrder?: 'ASC' | 'DESC' = 'DESC';
}

/**
 * 📊 Paginated Sessions Response
 */
export class GetSessionsResponseDto {
  @ApiProperty({
    description: 'Success status',
    example: true
  })
  success: boolean;

  @ApiProperty({
    description: 'List of sessions',
    type: [SessionResponseDto]
  })
  sessions: SessionResponseDto[];

  @ApiProperty({
    description: 'Pagination metadata',
    example: {
      total: 5,
      page: 1,
      limit: 10,
      totalPages: 1,
      hasNext: false,
      hasPrev: false
    }
  })
  pagination: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };

  @ApiProperty({
    description: 'Summary statistics',
    example: {
      totalSessions: 5,
      webSessions: 2,
      androidSessions: 2,
      iosSessions: 1
    }
  })
  summary: {
    totalSessions: number;
    webSessions: number;
    androidSessions: number;
    iosSessions: number;
  };
}

/**
 * 🗑️ Revoke Session Request DTO
 */
export class RevokeSessionDto {
  @ApiProperty({
    description: 'Session ID to revoke',
    example: '550e8400-e29b-41d4-a716-446655440000'
  })
  @IsString()
  @IsNotEmpty()
  sessionId: string;
}

/**
 * ✅ Revoke Session Response DTO
 */
export class RevokeSessionResponseDto {
  @ApiProperty({
    description: 'Success status',
    example: true
  })
  success: boolean;

  @ApiProperty({
    description: 'Success message',
    example: 'Session revoked successfully'
  })
  message: string;

  @ApiProperty({
    description: 'Revoked session ID',
    example: '550e8400-e29b-41d4-a716-446655440000'
  })
  sessionId: string;
}

/**
 * 🔥 Revoke All Sessions Response DTO
 */
export class RevokeAllSessionsResponseDto {
  @ApiProperty({
    description: 'Success status',
    example: true
  })
  success: boolean;

  @ApiProperty({
    description: 'Success message',
    example: 'All sessions revoked successfully'
  })
  message: string;

  @ApiProperty({
    description: 'Number of sessions revoked',
    example: 3
  })
  revokedCount: number;
}
