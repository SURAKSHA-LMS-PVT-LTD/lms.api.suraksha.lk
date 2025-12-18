import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsString, IsOptional, ArrayMinSize, ArrayMaxSize } from 'class-validator';

/**
 * DTO for bulk verification of pending users
 */
export class BulkVerificationDto {
  @ApiProperty({
    description: 'Array of user IDs to verify',
    example: ['123', '456', '789'],
    type: [String]
  })
  @IsArray()
  @ArrayMinSize(1, { message: 'At least one user ID must be provided' })
  @ArrayMaxSize(50, { message: 'Cannot verify more than 50 users at once' })
  @IsString({ each: true })
  userIds: string[];

  @ApiProperty({
    description: 'Optional notes for the verification',
    example: 'Bulk verification of new students for Fall 2024',
    required: false
  })
  @IsOptional()
  @IsString()
  notes?: string;
}

/**
 * DTO for single user verification
 */
export class VerifyUserDto {
  @ApiProperty({
    description: 'User ID to verify',
    example: '123'
  })
  @IsString()
  userId: string;

  @ApiProperty({
    description: 'Optional notes for the verification',
    example: 'Verified after document review',
    required: false
  })
  @IsOptional()
  @IsString()
  notes?: string;
}

/**
 * Response DTO for verification operations
 */
export class VerificationResponseDto {
  @ApiProperty({
    description: 'List of successfully verified user IDs',
    example: ['123', '456']
  })
  verifiedUsers: string[];

  @ApiProperty({
    description: 'List of user IDs that failed verification',
    example: ['789']
  })
  failedUsers: string[];

  @ApiProperty({
    description: 'Total number of users processed',
    example: 3
  })
  totalProcessed: number;

  @ApiProperty({
    description: 'Number of successful verifications',
    example: 2
  })
  successCount: number;

  @ApiProperty({
    description: 'Number of failed verifications',
    example: 1
  })
  failureCount: number;

  @ApiProperty({
    description: 'Details about any failures',
    example: [{ userId: '789', reason: 'User not found or already verified' }],
    required: false
  })
  failureDetails?: Array<{
    userId: string;
    reason: string;
  }>;
}
