import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PaymentStatus, PaymentMethod } from '../entities/payment.entity';
import { SubscriptionPlan } from '../../user/enums/subscription-plan.enum';

export class PaymentResponseDto {
  @ApiProperty({ description: 'Payment ID' })
  id: string;

  @ApiProperty({ description: 'User ID' })
  userId: string;

  @ApiProperty({ description: 'Payment amount' })
  paymentAmount: number;

  @ApiProperty({ description: 'Payment method', enum: PaymentMethod })
  paymentMethod: PaymentMethod;

  @ApiPropertyOptional({ description: 'Payment reference number' })
  paymentReference?: string;

  @ApiPropertyOptional({ description: 'Payment slip URL' })
  paymentSlipUrl?: string;

  @ApiPropertyOptional({ description: 'Payment slip filename' })
  paymentSlipFilename?: string;

  @ApiProperty({ description: 'Payment status', enum: PaymentStatus })
  status: PaymentStatus;

  @ApiProperty({ description: 'Payment date', type: 'string', example: '2025-10-27T12:34:56.789Z' })
  paymentDate: string;

  @ApiProperty({ description: 'Payment month (YYYY-MM)' })
  paymentMonth: string;

  @ApiPropertyOptional({ description: 'Verified by user ID' })
  verifiedBy?: string;

  @ApiPropertyOptional({ description: 'Verification date', type: 'string', example: '2025-10-27T12:34:56.789Z' })
  verifiedAt?: string;

  @ApiPropertyOptional({ description: 'Rejection reason' })
  rejectionReason?: string;

  @ApiPropertyOptional({ description: 'Notes' })
  notes?: string;

  @ApiProperty({ description: 'Created at', type: 'string', example: '2025-10-27T12:34:56.789Z' })
  createdAt: string;

  @ApiProperty({ description: 'Updated at', type: 'string', example: '2025-10-27T12:34:56.789Z' })
  updatedAt: string;
}

export class PaymentCreationResponseDto {
  @ApiProperty({ description: 'Success status' })
  success: boolean;

  @ApiProperty({ description: 'Response message' })
  message: string;

  @ApiProperty({ 
    description: 'Payment creation data',
    type: 'object',
    properties: {
      paymentId: { type: 'string', description: 'Payment ID' },
      status: { enum: PaymentStatus, description: 'Payment status' },
      uploadedFile: { type: 'string', description: 'Uploaded filename', nullable: true }
    }
  })
  data: {
    paymentId: string;
    status: PaymentStatus;
    uploadedFile?: string;
  };
}

export class PaymentVerificationResponseDto {
  @ApiProperty({ description: 'Success status' })
  success: boolean;

  @ApiProperty({ description: 'Response message' })
  message: string;

  @ApiProperty({ description: 'Payment details', type: PaymentResponseDto })
  payment: PaymentResponseDto;

  @ApiPropertyOptional({ description: 'User subscription plan after verification', enum: SubscriptionPlan })
  subscriptionPlan?: SubscriptionPlan;

  @ApiPropertyOptional({ description: 'Payment expiration date' })
  paymentExpiresAt?: Date;

  @ApiPropertyOptional({ description: 'Payment validity in days' })
  paymentValidityDays?: number;
}

export class PaymentListResponseDto {
  @ApiProperty({ type: [PaymentResponseDto] })
  payments: PaymentResponseDto[];

  @ApiProperty({ description: 'Total count' })
  total: number;

  @ApiProperty({ description: 'Current page' })
  page: number;

  @ApiProperty({ description: 'Items per page' })
  limit: number;
}
