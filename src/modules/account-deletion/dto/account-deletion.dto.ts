import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, MaxLength, IsBoolean } from 'class-validator';

/**
 * DTO for requesting account deletion (authenticated user only)
 */
export class RequestAccountDeletionDto {
  @ApiPropertyOptional({
    description: 'Optional reason for account deletion',
    example: 'No longer using the service',
    maxLength: 500,
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;

  @ApiProperty({
    description: 'User must confirm they want to delete their account',
    example: true,
  })
  @IsBoolean()
  confirmDeletion: boolean;
}

/**
 * Response after requesting account deletion
 */
export class AccountDeletionResponseDto {
  @ApiProperty({ description: 'Whether the operation succeeded' })
  success: boolean;

  @ApiProperty({ description: 'Human-readable message' })
  message: string;

  @ApiPropertyOptional({ description: 'Date when the account will be permanently deleted' })
  scheduledDeletionDate?: Date;
}

/**
 * Response for deletion status check
 */
export class DeletionStatusResponseDto {
  @ApiProperty({ description: 'Whether a deletion request is pending' })
  hasPendingDeletion: boolean;

  @ApiPropertyOptional({ description: 'Current status' })
  status?: string;

  @ApiPropertyOptional({ description: 'Date when the account will be permanently deleted' })
  scheduledDeletionDate?: Date;

  @ApiPropertyOptional({ description: 'Date when the deletion was requested' })
  requestedAt?: Date;

  @ApiPropertyOptional({ description: 'Reason provided' })
  reason?: string;
}
