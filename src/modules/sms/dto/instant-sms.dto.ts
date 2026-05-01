import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsArray, IsOptional, MaxLength, IsEnum, IsNumber, Min } from 'class-validator';
import { UserType } from '../../user/enums/user-type.enum';

/**
 * SIMPLIFIED SMS DTOs - No scheduling, no templates, instant send only
 * Same message for all recipients, credits deducted before sending
 */

/**
 * DTO for sending single SMS
 */
export class SendSingleSmsDto {
  @ApiProperty({ example: '1', description: 'Institute ID' })
  @IsString()
  @IsNotEmpty()
  instituteId: string;

  @ApiProperty({ example: '12345', description: 'Sender Mask ID - must be an approved and active mask owned by the institute' })
  @IsString()
  @IsNotEmpty()
  maskId: string;

  @ApiProperty({ example: '+94761234567', description: 'Recipient phone number' })
  @IsString()
  @IsNotEmpty()
  contact: string;

  @ApiProperty({ example: 'Your class starts at 10 AM tomorrow', description: 'SMS message content (max 1500 chars)' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(1500)
  message: string;
}

/**
 * DTO for sending bulk SMS with user filters
 * No templates - same message goes to everyone
 */
export class SendInstantBulkSmsDto {
  @ApiProperty({ example: '1', description: 'Institute ID' })
  @IsString()
  @IsNotEmpty()
  instituteId: string;

  @ApiProperty({ example: '12345', description: 'Sender Mask ID - must be an approved and active mask owned by the institute' })
  @IsString()
  @IsNotEmpty()
  maskId: string;

  @ApiProperty({ example: 'Your class starts at 10 AM tomorrow', description: 'SMS message (same for all recipients, max 1500 chars)' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(1500)
  message: string;

  // User Filtering Options - ONE of these must be provided
  @ApiPropertyOptional({ example: ['1', '2'], description: 'Filter by specific class IDs' })
  @IsArray()
  @IsOptional()
  classIds?: string[];

  @ApiPropertyOptional({ example: ['1', '2'], description: 'Filter by specific subject IDs' })
  @IsArray()
  @IsOptional()
  subjectIds?: string[];

  @ApiPropertyOptional({ enum: UserType, isArray: true, description: 'Filter by user types' })
  @IsEnum(UserType, { each: true })
  @IsArray()
  @IsOptional()
  userTypes?: UserType[];

  @ApiPropertyOptional({ example: ['ACTIVE'], description: 'Filter by institute user status' })
  @IsArray()
  @IsOptional()
  statuses?: string[];

  @ApiPropertyOptional({ example: ['+94761234567', '+94771234567'], description: 'Manually specify phone numbers (overrides filters)' })
  @IsArray()
  @IsOptional()
  contacts?: string[];
}

/**
 * DTO for topping up SMS credits
 */
export class TopupCreditsDto {
  @ApiProperty({ example: '1', description: 'Institute ID' })
  @IsString()
  @IsNotEmpty()
  instituteId: string;

  @ApiProperty({ example: 1000, description: 'Amount of credits to add' })
  @IsNumber()
  @Min(1)
  amount: number;
}

/**
 * Response DTO for instant SMS operations
 */
export class InstantSmsResponseDto {
  @ApiProperty({ example: true })
  success: boolean;

  @ApiProperty({ example: 'SMS sent successfully' })
  message: string;

  @ApiPropertyOptional({ example: '12345' })
  campaignId?: string;

  @ApiPropertyOptional({ example: 150 })
  totalRecipients?: number;

  @ApiPropertyOptional({ example: 150 })
  creditsDeducted?: number;

  @ApiPropertyOptional({ example: 'SENDING' })
  status?: string;

  @ApiPropertyOptional()
  error?: string;
}

/**
 * Response DTO for credit balance
 */
export class InstantSmsCreditBalanceResponseDto {
  @ApiProperty({ example: '1' })
  instituteId: string;

  @ApiProperty({ example: 5000.50 })
  balance: number;

  @ApiProperty({ example: 10000 })
  totalPurchased: number;

  @ApiProperty({ example: 4999.50 })
  totalUsed: number;

  @ApiPropertyOptional({ example: '2024-10-14T10:30:00Z' })
  lastTopupAt?: string;
}
