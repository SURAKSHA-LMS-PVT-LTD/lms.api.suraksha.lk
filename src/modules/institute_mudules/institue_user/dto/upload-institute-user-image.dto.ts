import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength, IsEnum, IsOptional } from 'class-validator';
import { ImageVerificationStatus } from '../enums/image-verification-status.enum';

export class UploadInstituteUserImageDto {
  @ApiProperty({
    description: 'User ID to upload image for',
    example: '12345'
  })
  @IsNotEmpty()
  @IsString()
  userId: string;

  @ApiProperty({
    description: 'Institute ID',
    example: '1'
  })
  @IsNotEmpty()
  @IsString()
  instituteId: string;
}

export class UpdateInstituteCardIdDto {
  @ApiProperty({
    description: 'Institute card ID to assign',
    example: 'CARD-2024-001',
    maxLength: 100
  })
  @IsNotEmpty()
  @IsString()
  @MaxLength(100)
  cardId: string;
}

export class VerifyInstituteUserImageDto {
  @ApiProperty({
    description: 'Image verification status',
    enum: ImageVerificationStatus,
    example: ImageVerificationStatus.VERIFIED
  })
  @IsNotEmpty()
  @IsEnum(ImageVerificationStatus)
  status: ImageVerificationStatus;

  @ApiProperty({
    description: 'Optional reason for rejection (required when status is REJECTED)',
    example: 'Image quality is too poor',
    required: false
  })
  @IsOptional()
  @IsString()
  rejectionReason?: string;
}

export class InstituteUserImageResponseDto {
  @ApiProperty({ description: 'Success status' })
  success: boolean;

  @ApiProperty({ description: 'Response message' })
  message: string;

  @ApiProperty({ description: 'Image URL if upload successful' })
  imageUrl?: string;

  @ApiProperty({ description: 'User ID' })
  userId: string;

  @ApiProperty({ description: 'Institute ID' })
  instituteId: string;
}
