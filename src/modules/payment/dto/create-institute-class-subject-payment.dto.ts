import { IsEnum, IsNotEmpty, IsOptional, IsString, IsDateString, IsNumber, MaxLength, IsUrl, Min, Max } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PaymentTargetType, PaymentPriority } from '../entities/institute-class-subject-payment.entity';
import { Transform } from 'class-transformer';

export class CreateInstituteClassSubjectPaymentDto {
  @ApiProperty({ 
    description: 'Payment title',
    example: 'Monthly Tuition Fee',
    maxLength: 200
  })
  @IsNotEmpty()
  @IsString()
  @MaxLength(200)
  title: string;

  @ApiProperty({ 
    description: 'Payment description',
    example: 'Monthly tuition fee for Mathematics class'
  })
  @IsNotEmpty()
  @IsString()
  description: string;

  @ApiProperty({ 
    description: 'Payment target type',
    enum: PaymentTargetType,
    example: PaymentTargetType.PARENTS
  })
  @IsEnum(PaymentTargetType)
  @IsNotEmpty()
  targetType: PaymentTargetType;

  @ApiProperty({ 
    description: 'Payment priority',
    enum: PaymentPriority,
    example: PaymentPriority.MANDATORY
  })
  @IsEnum(PaymentPriority)
  @IsNotEmpty()
  priority: PaymentPriority;

  @ApiProperty({ 
    description: 'Payment amount',
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
  amount: number;

  @ApiPropertyOptional({ 
    description: 'Official request document relative path from /upload/verify-and-publish',
    example: 'payment-receipts/document-uuid.pdf'
  })
  @IsOptional()
  @IsString()
  documentUrl?: string;

  @ApiProperty({ 
    description: 'Last date for payment submission',
    example: '2024-02-15T23:59:59Z'
  })
  @IsDateString()
  @IsNotEmpty()
  lastDate: string;

  @ApiPropertyOptional({ 
    description: 'Additional notes',
    maxLength: 255
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  notes?: string;

  @ApiProperty({ 
    description: 'Bank name for payment transfer',
    example: 'Bank of Ceylon',
    maxLength: 100
  })
  @IsNotEmpty()
  @IsString()
  @MaxLength(100)
  bankName: string;

  @ApiProperty({ 
    description: 'Account holder name',
    example: 'Sri Lanka Institute',
    maxLength: 150
  })
  @IsNotEmpty()
  @IsString()
  @MaxLength(150)
  accountHolderName: string;

  @ApiProperty({ 
    description: 'Account holder number / Account ID',
    example: '1234567890123456',
    maxLength: 50
  })
  @IsNotEmpty()
  @IsString()
  @MaxLength(50)
  accountHolderNumber: string;
}
