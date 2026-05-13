import { IsEnum, IsNotEmpty, IsOptional, IsString, IsDateString, IsNumber, MaxLength, Min, Max, IsDecimal } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PaymentTargetType, PaymentPriority } from '../entities/institute-class-subject-payment.entity';
import { Transform } from 'class-transformer';

export class CreateInstituteClassPaymentDto {
  @ApiProperty({ description: 'Payment title', maxLength: 200 })
  @IsNotEmpty()
  @IsString()
  @MaxLength(200)
  title: string;

  @ApiProperty({ description: 'Payment description' })
  @IsNotEmpty()
  @IsString()
  description: string;

  @ApiProperty({ description: 'Payment target type', enum: PaymentTargetType })
  @IsEnum(PaymentTargetType)
  @IsNotEmpty()
  targetType: PaymentTargetType;

  @ApiProperty({ description: 'Payment priority', enum: PaymentPriority })
  @IsEnum(PaymentPriority)
  @IsNotEmpty()
  priority: PaymentPriority;

  @ApiProperty({ description: 'Payment amount', example: 5000.00 })
  @IsNotEmpty()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(999999.99)
  @Transform(({ value }) => {
    const num = parseFloat(value);
    return isNaN(num) ? value : Math.round(num * 100) / 100;
  })
  amount: number;

  @ApiPropertyOptional({ description: 'Official document relative path from /upload/verify-and-publish' })
  @IsOptional()
  @IsString()
  documentUrl?: string;

  @ApiProperty({ description: 'Last date for payment submission', example: '2024-02-15T23:59:59Z' })
  @IsDateString()
  @IsNotEmpty()
  lastDate: string;

  @ApiPropertyOptional({ description: 'Teacher commission % (0-100). When approved, this % goes to teacher wallet.', example: 15 })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  teacherCommissionPct?: number;

  @ApiPropertyOptional({ description: 'Additional notes', maxLength: 255 })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  notes?: string;

  @ApiProperty({ description: 'Bank name for payment transfer', maxLength: 100 })
  @IsNotEmpty()
  @IsString()
  @MaxLength(100)
  bankName: string;

  @ApiProperty({ description: 'Account holder name', maxLength: 150 })
  @IsNotEmpty()
  @IsString()
  @MaxLength(150)
  accountHolderName: string;

  @ApiProperty({ description: 'Account holder number / Account ID', maxLength: 50 })
  @IsNotEmpty()
  @IsString()
  @MaxLength(50)
  accountHolderNumber: string;
}
