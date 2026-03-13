import { IsEnum, IsNotEmpty, IsNumber, IsOptional, IsString, IsUrl, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CardPaymentType } from '../enums/payment-type.enum';

export class SubmitPaymentDto {
  @ApiProperty({ description: 'Payment submission URL (slip image/receipt)' })
  @IsNotEmpty()
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

/**
 * DTO for submitting payment proof uploaded to Google Drive.
 *
 * Flow:
 * 1. User calls GET /drive-access/token  → gets a short-lived access token
 * 2. User calls GET /drive-access/folder → creates/gets an organised Drive folder
 * 3. User uploads file directly to Google Drive using the access token (returns a Drive fileId)
 * 4. User sends this DTO to POST /user-card/orders/:orderId/payment/drive
 */
export class SubmitDrivePaymentDto {
  @ApiProperty({
    description: 'Google Drive file ID returned by the Drive API after upload',
    example: '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms',
  })
  @IsString()
  @IsNotEmpty()
  driveFileId: string;

  @ApiProperty({
    description: 'Google Drive web view link (shareable link to view the file)',
    example: 'https://drive.google.com/file/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms/view',
  })
  @IsString()
  @IsNotEmpty()
  driveWebViewLink: string;

  @ApiPropertyOptional({
    description: 'Original file name as uploaded',
    example: 'payment_receipt_march.pdf',
  })
  @IsOptional()
  @IsString()
  driveFileName?: string;

  @ApiProperty({ description: 'Payment type', enum: CardPaymentType })
  @IsEnum(CardPaymentType)
  paymentType: CardPaymentType;

  @ApiProperty({ description: 'Payment amount', example: 500.00 })
  @IsNumber()
  @Min(0)
  paymentAmount: number;

  @ApiPropertyOptional({ description: 'Payment reference number or transaction ID' })
  @IsOptional()
  @IsString()
  paymentReference?: string;

  @ApiPropertyOptional({ description: 'Additional notes' })
  @IsOptional()
  @IsString()
  notes?: string;
}
