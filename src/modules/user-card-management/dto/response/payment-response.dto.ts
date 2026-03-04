import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CardPaymentType } from '../../enums/payment-type.enum';
import { PaymentUploadMethod } from '../../entities/card-payment.entity';

export class PaymentResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  orderId: string;

  @ApiPropertyOptional({ description: 'Cloud storage relative path (present when uploadMethod is CLOUD_STORAGE)' })
  submissionUrl?: string;

  @ApiPropertyOptional({
    description: 'Upload method used: CLOUD_STORAGE (S3/GCS signed URL) or GOOGLE_DRIVE',
    enum: PaymentUploadMethod,
  })
  uploadMethod?: PaymentUploadMethod;

  @ApiPropertyOptional({ description: 'Google Drive file ID (present when uploadMethod is GOOGLE_DRIVE)' })
  driveFileId?: string;

  @ApiPropertyOptional({ description: 'Google Drive shareable view link (present when uploadMethod is GOOGLE_DRIVE)' })
  driveWebViewLink?: string;

  @ApiPropertyOptional({ description: 'Original file name (Drive uploads)' })
  driveFileName?: string;

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
