import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty, Matches } from 'class-validator';

export class GenerateUploadUrlDto {
  @ApiProperty({
    description: 'File name with extension',
    example: 'payment-slip-2026-01-15.jpg',
  })
  @IsString()
  @IsNotEmpty()
  fileName: string;

  @ApiProperty({
    description: 'File MIME type',
    example: 'image/jpeg',
    enum: ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'application/pdf'],
  })
  @IsString()
  @IsNotEmpty()
  @Matches(/^(image\/(jpeg|jpg|png|webp)|application\/pdf)$/, {
    message: 'Only JPEG, PNG, WEBP images and PDF files are allowed',
  })
  contentType: string;
}

export class UploadUrlResponseDto {
  @ApiProperty({ description: 'S3 endpoint URL — use this as the POST action' })
  uploadUrl: string;

  @ApiProperty({ description: 'Relative path where file will be stored' })
  relativePath: string;

  @ApiProperty({ description: 'URL expiration timestamp' })
  expiresAt: Date;

  @ApiProperty({ description: 'Maximum file size in bytes (10MB)' })
  maxFileSize: number;

  @ApiProperty({ description: 'Required Content-Type value' })
  contentType: string;

  @ApiProperty({
    description: 'Form fields that MUST be included in the multipart POST body (policy, signature, key, etc.)',
    type: 'object',
    additionalProperties: { type: 'string' },
  })
  fields: Record<string, string>;

  @ApiProperty({ description: 'Upload instructions' })
  instructions: string;
}

export class ViewUrlResponseDto {
  @ApiProperty({ description: 'Signed URL for viewing/downloading file' })
  viewUrl: string;

  @ApiProperty({ description: 'URL expiration timestamp' })
  expiresAt: Date;
}

export class VerifyUploadDto {
  @ApiProperty({ description: 'Relative path of uploaded file' })
  @IsString()
  @IsNotEmpty()
  relativePath: string;
}

export class VerifyUploadResponseDto {
  @ApiProperty({ description: 'Whether file exists and was uploaded successfully' })
  success: boolean;

  @ApiProperty({ description: 'File metadata if upload was successful' })
  metadata?: {
    size: number;
    contentType: string;
    uploaded: Date;
  };
}
