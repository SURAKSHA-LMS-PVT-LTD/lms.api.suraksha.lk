import { IsEnum, IsNotEmpty, IsNumber, IsOptional, IsString, Min, Max, MaxLength, IsPositive } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CreditTransactionType } from '../entities/institute-credit-transaction.entity';

// ═══════════════════════════════════════════════════════════════════
// REQUEST DTOs
// ═══════════════════════════════════════════════════════════════════

export class DeductCreditsDto {
  @ApiProperty({ description: 'Number of credits to deduct', example: 5 })
  @IsNumber()
  @IsPositive()
  @Max(9999999999.99)
  amount: number;

  @ApiProperty({ enum: CreditTransactionType, description: 'Reason for deduction' })
  @IsEnum(CreditTransactionType)
  type: CreditTransactionType;

  @ApiPropertyOptional({ description: 'Reference type (e.g. SMS_CAMPAIGN, SMS_INSTANT)', example: 'SMS_CAMPAIGN' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  referenceType?: string;

  @ApiPropertyOptional({ description: 'ID of referenced record', example: '12345' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  referenceId?: string;

  @ApiPropertyOptional({ description: 'Human-readable description', example: 'Bulk SMS to 5 recipients' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;
}

export class GrantCreditsDto {
  @ApiProperty({ description: 'Number of credits to add', example: 500 })
  @IsNumber()
  @IsPositive()
  @Max(9999999999.99)
  amount: number;

  @ApiProperty({ enum: CreditTransactionType, description: 'Reason for addition' })
  @IsEnum(CreditTransactionType)
  type: CreditTransactionType;

  @ApiPropertyOptional({ example: 'PAYMENT' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  referenceType?: string;

  @ApiPropertyOptional({ example: '99' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  referenceId?: string;

  @ApiPropertyOptional({ example: 'Payment #99 verified — 500 credits' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;
}

export class AdminAdjustCreditsDto {
  @ApiProperty({ description: 'Amount to adjust (positive to add, negative to deduct)', example: 100 })
  @IsNumber()
  @IsNotEmpty()
  @Min(-9999999999.99)
  @Max(9999999999.99)
  amount: number;

  @ApiPropertyOptional({ description: 'Reason for adjustment', example: 'Compensation for system outage' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;
}

export class CreditTransactionFilterDto {
  @ApiPropertyOptional({ enum: CreditTransactionType })
  @IsOptional()
  @IsEnum(CreditTransactionType)
  type?: CreditTransactionType;

  @ApiPropertyOptional({ description: 'Start date (ISO)', example: '2026-01-01' })
  @IsOptional()
  @IsString()
  startDate?: string;

  @ApiPropertyOptional({ description: 'End date (ISO)', example: '2026-12-31' })
  @IsOptional()
  @IsString()
  endDate?: string;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(100)
  limit?: number;
}

// ═══════════════════════════════════════════════════════════════════
// RESPONSE DTOs
// ═══════════════════════════════════════════════════════════════════

export class CreditBalanceResponseDto {
  @ApiProperty() instituteId: string;
  @ApiProperty() balance: number;
  @ApiProperty() totalPurchased: number;
  @ApiProperty() totalUsed: number;
  @ApiProperty() dailyUsed: number;
  @ApiProperty() monthlyUsed: number;
  @ApiProperty({ nullable: true }) dailyLimit?: number;
  @ApiProperty({ nullable: true }) monthlyLimit?: number;
  @ApiProperty() isActive: boolean;
}

export class CreditTransactionResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() instituteId: string;
  @ApiProperty({ enum: CreditTransactionType }) type: CreditTransactionType;
  @ApiProperty() amount: number;
  @ApiProperty() balanceBefore: number;
  @ApiProperty() balanceAfter: number;
  @ApiProperty({ nullable: true }) referenceType?: string;
  @ApiProperty({ nullable: true }) referenceId?: string;
  @ApiProperty({ nullable: true }) description?: string;
  @ApiProperty() createdAt: Date;
}

export class CreditTransactionListResponseDto {
  @ApiProperty({ type: [CreditTransactionResponseDto] }) data: CreditTransactionResponseDto[];
  @ApiProperty() total: number;
  @ApiProperty() page: number;
  @ApiProperty() limit: number;
}

export class DeductCreditsResultDto {
  @ApiProperty() success: boolean;
  @ApiProperty() creditsDeducted: number;
  @ApiProperty() balanceAfter: number;
  @ApiProperty() transactionId: string;
}

export class GrantCreditsResultDto {
  @ApiProperty() success: boolean;
  @ApiProperty() creditsGranted: number;
  @ApiProperty() balanceAfter: number;
  @ApiProperty() transactionId: string;
}
