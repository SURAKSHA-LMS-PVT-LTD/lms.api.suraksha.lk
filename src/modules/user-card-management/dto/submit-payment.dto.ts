import { IsEnum, IsNotEmpty, IsNumber, IsOptional, IsString, IsUrl, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CardPaymentType } from '../enums/payment-type.enum';

export class SubmitPaymentDto {
  @ApiProperty({ description: 'Payment submission URL (slip image/receipt)' })
  @IsNotEmpty()
  @IsUrl()
  submissionUrl: string;

  @ApiProperty({ description: 'Payment type', enum: CardPaymentType })
  @IsEnum(CardPaymentType)
  paymentType: CardPaymentType;

  @ApiProperty({ description: 'Payment amount', example: 500.00 })
  @IsNumber()
  @Min(0)
  paymentAmount: number;

  @ApiPropertyOptional({ description: 'Payment reference number' })
  @IsOptional()
  @IsString()
  paymentReference?: string;

  @ApiPropertyOptional({ description: 'Additional notes' })
  @IsOptional()
  @IsString()
  notes?: string;
}
