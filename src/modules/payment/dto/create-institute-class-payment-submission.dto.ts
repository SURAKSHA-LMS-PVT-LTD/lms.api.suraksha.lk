import { IsNotEmpty, IsOptional, IsString, IsIn, IsDateString, IsISO8601, IsNumber, MaxLength, IsEnum, Min, Max, Matches } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { SubmissionStatus } from '../entities/institute-class-payment-submission.entity';

export class CreateInstituteClassPaymentSubmissionDto {
  @ApiProperty({ description: 'Payment date when payment was made (ISO 8601 format: YYYY-MM-DD or full timestamp)', example: '2024-01-15T10:30:00Z' })
  @Matches(/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(\.\d{3})?Z?)?$/, { message: 'Date must be in YYYY-MM-DD or ISO 8601 format' })
  @IsNotEmpty()
  paymentDate: string;

  @ApiPropertyOptional({ description: 'Bank transaction ID or reference number', maxLength: 100 })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  transactionId?: string;

  @ApiProperty({ description: 'Amount submitted by the user', example: 5000.00 })
  @IsNotEmpty()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(999999.99)
  @Transform(({ value }) => {
    const num = parseFloat(value);
    return isNaN(num) ? value : Math.round(num * 100) / 100;
  })
  submittedAmount: number;

  @ApiPropertyOptional({ description: 'Additional notes from the submitter', maxLength: 255 })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  notes?: string;

  @ApiPropertyOptional({ description: 'Receipt relative path from /upload/verify-and-publish' })
  @IsOptional()
  @IsString()
  receiptUrl?: string;
}

export class VerifyClassPaymentSubmissionDto {
  @ApiProperty({ description: 'Verification status', enum: SubmissionStatus })
  @IsNotEmpty()
  @IsEnum(SubmissionStatus)
  status: SubmissionStatus;

  @ApiPropertyOptional({ description: 'Rejection reason (required if status is REJECTED)', maxLength: 255 })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  rejectionReason?: string;

  @ApiPropertyOptional({ description: 'Verification notes', maxLength: 255 })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  notes?: string;

  // ── Finance routing (optional) ────────────────────────────────────
  @ApiPropertyOptional({ description: 'Finance account ID to credit on approval.' })
  @IsOptional() @IsString()
  targetAccountId?: string;

  @ApiPropertyOptional({ description: 'Teacher commission % override (0-100).' })
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(100)
  commissionPctOverride?: number;
}

export class AdminVerifyStudentClassPaymentDto {
  @ApiProperty({ description: 'Payment amount verified by admin (e.g., 5000.00)', example: 5000.00 })
  @IsNotEmpty()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(999999.99)
  @Transform(({ value }) => {
    const num = parseFloat(value);
    return isNaN(num) ? value : Math.round(num * 100) / 100;
  })
  amount: number;

  @ApiProperty({ description: 'Date when payment was made (ISO 8601 format: YYYY-MM-DD or full timestamp)', example: '2024-01-15T10:30:00Z' })
  @IsNotEmpty()
  @Matches(/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(\.\d{3})?Z?)?$/, { message: 'Date must be in YYYY-MM-DD or ISO 8601 format' })
  date: string;

  @ApiPropertyOptional({ description: 'Optional notes or remarks from admin about the verification', maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  notes?: string;

  @ApiPropertyOptional({
    description: "Payment tier for partial verification. 'full' = VERIFIED (100%), 'half' = HALF_VERIFIED (50%), 'quarter' = QUARTER_VERIFIED (25%)",
    enum: ['full', 'half', 'quarter'],
    example: 'full'
  })
  @IsOptional()
  @IsIn(['full', 'half', 'quarter'])
  paymentTier?: 'full' | 'half' | 'quarter';

  // ── Finance routing (optional) ────────────────────────────────────
  @ApiPropertyOptional({ description: 'Finance account ID to credit. If provided, triggers automatic ledger entry.' })
  @IsOptional() @IsString()
  targetAccountId?: string;

  @ApiPropertyOptional({ description: 'Teacher commission % override (0-100). Falls back to class default.' })
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(100)
  commissionPctOverride?: number;
}
