import { IsNotEmpty, IsOptional, IsString, IsIn, IsDateString, IsNumber, MaxLength, IsEnum, Min, Max, IsUrl } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { SubmissionStatus } from '../entities/institute-class-subject-payment-submission.entity';

export class CreateInstituteClassSubjectPaymentSubmissionDto {
  @ApiProperty({ 
    description: 'Payment date when the payment was made',
    example: '2024-01-15T10:30:00Z'
  })
  @IsDateString()
  @IsNotEmpty()
  paymentDate: string;

  @ApiPropertyOptional({ 
    description: 'Bank transaction ID or reference number',
    example: 'TXN123456789',
    maxLength: 100
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  transactionId?: string;

  @ApiProperty({ 
    description: 'Amount submitted by the user',
    example: 5000.00
  })
  @IsNotEmpty()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(999999.99)
  @Transform(({ value }) => {
    const num = parseFloat(value);
    return isNaN(num) ? value : Math.round(num * 100) / 100;
  })
  submittedAmount: number;

  @ApiPropertyOptional({ 
    description: 'Additional notes from the submitter',
    maxLength: 255
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  notes?: string;

  @ApiPropertyOptional({ 
    description: 'Receipt relative path from /upload/verify-and-publish',
    example: 'payment-receipts/receipt-uuid.jpg'
  })
  @IsOptional()
  @IsString()
  receiptUrl?: string;
}

export class VerifyPaymentSubmissionDto {
  @ApiProperty({ 
    description: 'Verification status',
    enum: SubmissionStatus,
    enumName: 'SubmissionStatus',
    example: SubmissionStatus.VERIFIED
  })
  @IsNotEmpty()
  @IsEnum(SubmissionStatus)
  status: SubmissionStatus;

  @ApiPropertyOptional({ 
    description: 'Rejection reason (required if status is REJECTED)',
    maxLength: 255
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  rejectionReason?: string;

  @ApiPropertyOptional({ 
    description: 'Verification notes',
    maxLength: 255
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  notes?: string;
}

// DTO for admin to manually verify/record payment for a specific student (class-subject context)
export class AdminVerifyStudentCspPaymentDto {
  @ApiProperty({ description: 'Payment amount verified by admin', example: 5000.00 })
  @IsNotEmpty()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(999999.99)
  @Transform(({ value }) => {
    const num = parseFloat(value);
    return isNaN(num) ? value : Math.round(num * 100) / 100;
  })
  amount: number;

  @ApiProperty({ description: 'Date of payment', example: '2024-01-15T10:30:00Z' })
  @IsNotEmpty()
  @IsDateString()
  date: string;

  @ApiPropertyOptional({ description: 'Optional notes from admin', maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  notes?: string;

  @ApiPropertyOptional({ description: "Payment tier: 'full' (VERIFIED), 'half' (HALF_VERIFIED), 'quarter' (QUARTER_VERIFIED)", enum: ['full', 'half', 'quarter'] })
  @IsOptional()
  @IsIn(['full', 'half', 'quarter'])
  paymentTier?: 'full' | 'half' | 'quarter';
}
