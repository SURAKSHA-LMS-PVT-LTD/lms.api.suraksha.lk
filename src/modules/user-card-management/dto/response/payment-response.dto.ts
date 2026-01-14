import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CardPaymentType } from '../../enums/payment-type.enum';

export class PaymentResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  orderId: string;

  @ApiProperty()
  submissionUrl: string;

  @ApiProperty({ enum: CardPaymentType })
  paymentType: CardPaymentType;

  @ApiProperty()
  paymentAmount: number;

  @ApiPropertyOptional()
  paymentReference?: string;

  @ApiProperty()
  paymentStatus: string;

  @ApiPropertyOptional()
  verifiedBy?: string;

  @ApiPropertyOptional()
  verifiedAt?: Date;

  @ApiPropertyOptional()
  rejectionReason?: string;

  @ApiPropertyOptional()
  notes?: string;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;

  // Populated relations
  @ApiPropertyOptional()
  order?: any;

  @ApiPropertyOptional()
  verifier?: any;
}

export class PaginatedPaymentsResponseDto {
  @ApiProperty({ type: [PaymentResponseDto] })
  data: PaymentResponseDto[];

  @ApiProperty()
  total: number;

  @ApiProperty()
  page: number;

  @ApiProperty()
  limit: number;

  @ApiProperty()
  totalPages: number;
}
