import { IsEnum, IsOptional, IsString, MaxLength, IsNumber, Min, Max } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { PaymentStatus } from '../entities/payment.entity';
import { SubscriptionPlan } from '../../user/enums/subscription-plan.enum';

export class VerifyInstitutePaymentDto {
  @ApiPropertyOptional({ 
    description: 'Payment verification status',
    enum: PaymentStatus,
    example: PaymentStatus.VERIFIED 
  })
  @IsEnum(PaymentStatus)
  @IsOptional()
  status?: PaymentStatus;

  @ApiPropertyOptional({ 
    description: 'Subscription plan to assign to user upon verification',
    enum: SubscriptionPlan,
    example: SubscriptionPlan.PRO_WHATSAPP 
  })
  @IsEnum(SubscriptionPlan)
  @IsOptional()
  subscriptionPlan?: SubscriptionPlan;

  @ApiPropertyOptional({ 
    description: 'Number of days the payment/subscription is valid (default: 30)',
    minimum: 1,
    maximum: 365,
    example: 30 
  })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(365)
  paymentValidityDays?: number;

  @ApiPropertyOptional({ 
    description: 'Reason for rejection (if status is REJECTED)',
    maxLength: 255
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  rejectionReason?: string;

  @ApiPropertyOptional({ 
    description: 'Admin notes for verification',
    maxLength: 255
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  notes?: string;
}
