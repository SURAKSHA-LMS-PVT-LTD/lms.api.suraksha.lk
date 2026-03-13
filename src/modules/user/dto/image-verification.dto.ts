import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNumber, IsString, IsEnum, IsOptional, IsEmail, Max, Min } from 'class-validator';
import { ImageVerificationStatus } from '../../institute_mudules/institue_user/enums/image-verification-status.enum';

/**
 * DTO for getting unverified users with pending images
 */
export class GetUnverifiedUsersQueryDto {
  @ApiPropertyOptional({
    description: 'Page number (1-based)',
    example: 1,
    minimum: 1,
  })
  @IsOptional()
  @IsNumber()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({
    description: 'Results per page',
    example: 20,
    minimum: 1,
    maximum: 100,
  })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @ApiPropertyOptional({
    description: 'Filter by verification status',
    enum: ImageVerificationStatus,
  })
  @IsOptional()
  @IsEnum(ImageVerificationStatus)
  status?: ImageVerificationStatus;
}

/**
 * Response DTO for a single unverified user
 */
export class UnverifiedUserResponseDto {
  @ApiProperty({ description: 'User ID' })
  userId: string;

  @ApiProperty({ description: 'Name with initials' })
  nameWithInitials: string;

  @ApiProperty({ description: 'Email (masked)' })
  email?: string;

  @ApiProperty({ description: 'Phone number (masked)' })
  phoneNumber?: string;

  @ApiProperty({ description: 'Current image URL' })
  imageUrl?: string;

  @ApiProperty({ description: 'Image verification status', enum: ImageVerificationStatus })
  imageVerificationStatus: ImageVerificationStatus;

  @ApiProperty({ description: 'When image was uploaded' })
  imageUploadedAt?: string;

  @ApiProperty({ description: 'User type' })
  userType: string;
}

/**
 * Paginated response for unverified users
 */
export class PaginatedUnverifiedUsersResponseDto {
  @ApiProperty({ description: 'List of unverified users', type: [UnverifiedUserResponseDto] })
  users: UnverifiedUserResponseDto[];

  @ApiProperty({ description: 'Total count of unverified users' })
  total: number;

  @ApiProperty({ description: 'Current page' })
  page: number;

  @ApiProperty({ description: 'Results per page' })
  limit: number;

  @ApiProperty({ description: 'Total pages' })
  totalPages: number;
}

/**
 * DTO for approving user image
 */
export class ApproveUserImageDto {
  @ApiPropertyOptional({
    description: 'User ID (taken from route param, not needed in body)',
    example: 123,
  })
  @IsOptional()
  @IsNumber()
  userId?: number;

  @ApiPropertyOptional({
    description: 'Specific user_images record ID to approve. If omitted the latest PENDING record is used.',
    example: 7,
  })
  @IsOptional()
  @IsNumber()
  imageId?: number;

  @ApiPropertyOptional({
    description: 'Optional note from admin',
    example: 'Image quality good, approved',
  })
  @IsOptional()
  @IsString()
  note?: string;
}

/**
 * DTO for rejecting user image with email notification
 */
export class RejectUserImageDto {
  @ApiPropertyOptional({
    description: 'User ID (taken from route param, not needed in body)',
    example: 123,
  })
  @IsOptional()
  @IsNumber()
  userId?: number;

  @ApiPropertyOptional({
    description: 'Specific user_images record ID to reject. If omitted the latest PENDING record is used.',
    example: 7,
  })
  @IsOptional()
  @IsNumber()
  imageId?: number;

  @ApiProperty({
    description: 'Reason for rejection (sent to user via email)',
    example: 'Image quality is too low. Please upload a clear photo with good lighting.',
  })
  @IsString()
  rejectionReason: string;

  @ApiPropertyOptional({
    description: 'User email to send notification (if not in system)',
    example: 'user@example.com',
  })
  @IsOptional()
  @IsEmail()
  userEmail?: string;

  @ApiPropertyOptional({
    description: 'Generate signed URL valid for (days)',
    example: 7,
    minimum: 1,
    maximum: 30,
    default: 7,
  })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(30)
  urlValidityDays?: number = 7;
}

/**
 * Response DTO for image rejection with signed URL
 */
export class RejectUserImageResponseDto {
  @ApiProperty({ description: 'Success status' })
  success: boolean;

  @ApiProperty({ description: 'Message' })
  message: string;

  @ApiProperty({ description: 'User ID' })
  userId: string;

  @ApiProperty({ description: 'Rejection reason' })
  rejectionReason: string;

  @ApiProperty({ description: 'Signed upload URL for user (7-day validity)' })
  uploadUrl: string;

  @ApiProperty({ description: 'URL expires at (ISO timestamp)' })
  expiresAt: string;

  @ApiProperty({ description: 'Email sent status' })
  emailSent: boolean;

  @ApiProperty({ description: 'Upload token (embedded in URL)' })
  uploadToken: string;
}

/**
 * Response DTO for image approval
 */
export class ApproveUserImageResponseDto {
  @ApiProperty({ description: 'Success status' })
  success: boolean;

  @ApiProperty({ description: 'Message' })
  message: string;

  @ApiProperty({ description: 'User ID' })
  userId: string;

  @ApiProperty({ description: 'New status' })
  status: ImageVerificationStatus;

  @ApiProperty({ description: 'Approved by admin ID' })
  approvedBy: string;

  @ApiProperty({ description: 'Approved at timestamp' })
  approvedAt: string;
}

/**
 * DTO for user uploading image via signed URL
 */
export class UserUploadImageDto {
  @ApiProperty({
    description: 'Upload token from rejection email',
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
  })
  @IsString()
  token: string;

  @ApiProperty({
    description: 'File name',
    example: 'my-photo.jpg',
  })
  @IsString()
  fileName: string;

  @ApiProperty({
    description: 'Content type',
    example: 'image/jpeg',
    enum: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
  })
  @IsString()
  contentType: string;

  @ApiPropertyOptional({
    description: 'File size in bytes',
    example: 1048576,
  })
  @IsOptional()
  @IsNumber()
  @Max(5 * 1024 * 1024)
  fileSize?: number;
}

/**
 * Response for generating user upload URL
 */
export class UserUploadUrlResponseDto {
  @ApiProperty({ description: 'Success status' })
  success: boolean;

  @ApiProperty({ description: 'Signed upload URL' })
  uploadUrl: string;

  @ApiProperty({ description: 'Relative path for confirmation' })
  relativePath: string;

  @ApiProperty({ description: 'URL expires at' })
  expiresAt: string;

  @ApiProperty({ description: 'Instructions' })
  instructions: string;
}

/** Counts of user profile image submissions by verification status */
export class ImageStatsResponseDto {
  @ApiProperty() pending: number;
  @ApiProperty() verified: number;
  @ApiProperty() rejected: number;
  @ApiProperty({ description: 'Distinct users who have ever submitted an image' }) totalUsers: number;
}

/** One entry in a user's image submission history */
export class ImageHistoryItemDto {
  @ApiProperty() imageId: string;
  @ApiProperty() imageUrl: string;
  @ApiProperty({ enum: ImageVerificationStatus }) status: ImageVerificationStatus;
  @ApiPropertyOptional({ nullable: true }) rejectionReason: string | null;
  @ApiPropertyOptional({ nullable: true }) verifiedBy: string | null;
  @ApiPropertyOptional({ nullable: true }) verifiedAt: string | null;
  @ApiProperty() submittedAt: string;
}

/** Full image history for one user */
export class UserImageHistoryResponseDto {
  @ApiProperty() userId: string;
  @ApiProperty() nameWithInitials: string;
  @ApiProperty({ nullable: true }) currentImageUrl: string | null;
  @ApiProperty({ enum: ImageVerificationStatus }) currentStatus: ImageVerificationStatus;
  @ApiProperty({ type: [ImageHistoryItemDto] }) history: ImageHistoryItemDto[];
  @ApiProperty() totalSubmissions: number;
}
