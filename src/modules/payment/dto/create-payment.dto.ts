import { IsEnum, IsNotEmpty, IsOptional, IsString, IsDateString, IsNumber, MaxLength, Min, Max } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { PaymentMethod } from '../entities/payment.entity';
import { SubscriptionPlan } from '../../user/enums/subscription-plan.enum';

export class CreatePaymentDto {
  @ApiProperty({ 
    description: 'Payment amount',
    example: 1500.00 
  })
  @IsNotEmpty()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(999999.99)
  @Transform(({ value }) => {
    const num = parseFloat(value);
    return isNaN(num) ? value : Math.round(num * 100) / 100;
  })
  paymentAmount: number;

  @ApiProperty({ 
    description: 'Payment method',
    enum: PaymentMethod,
    example: PaymentMethod.BANK_TRANSFER 
  })
  @IsEnum(PaymentMethod)
  @IsNotEmpty()
  paymentMethod: PaymentMethod;

  @ApiPropertyOptional({ 
    description: 'Payment reference number',
    example: 'TXN123456789',
    maxLength: 100 
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  paymentReference?: string;

  @ApiProperty({ 
    description: 'Payment date',
    example: '2024-01-15T10:30:00Z' 
  })
  @IsDateString()
  @IsNotEmpty()
  paymentDate: string;

  @ApiProperty({ 
    description: 'Payment month in YYYY-MM format',
    example: '2024-01' 
  })
  @IsString()
  @IsNotEmpty()
  paymentMonth: string;

  @ApiPropertyOptional({ 
    description: 'Additional notes',
    maxLength: 255
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  notes?: string;

  @ApiPropertyOptional({
    description: 'Payment slip relative path from /upload/verify-and-publish',
    example: 'payment-receipts/receipt-uuid.jpg'
  })
  @IsOptional()
  @IsString()
  paymentSlipUrl?: string;

  @ApiPropertyOptional({
    description: 'The subscription plan the user is requesting (shown to admin during verification)',
    enum: SubscriptionPlan,
  })
  @IsOptional()
  @IsEnum(SubscriptionPlan)
  targetPlan?: SubscriptionPlan;

  @ApiPropertyOptional({
    description: 'Number of validity periods (units) the user is purchasing — price = package.price × quantity, validity = package.validityDays × quantity',
    minimum: 1,
    maximum: 36,
    example: 3,
  })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(36)
  quantity?: number;
}
