import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { InstituteUserStatus } from '../enums/institute-user-status.enum';
import { ImageVerificationStatus } from '../enums/image-verification-status.enum';

export class AdminUserDataResponseDto {
  @ApiProperty({ description: 'User ID' })
  userId: string;

  @ApiProperty({ description: 'Institute ID' })
  instituteId: string;

  @ApiProperty({ description: 'User first name' })
  firstName: string;

  @ApiProperty({ description: 'User last name' })
  lastName?: string;

  @ApiProperty({ description: 'Name with initials (e.g. A.B. Perera)', required: false })
  nameWithInitials?: string;

  @ApiProperty({ description: 'User email' })
  email: string;

  @ApiProperty({ description: 'User phone number' })
  phoneNumber?: string;

  @ApiProperty({ description: 'Institute-specific user type (not global user type)' })
  userType: string;

  @ApiProperty({ description: 'User status in institute', enum: InstituteUserStatus })
  status: InstituteUserStatus;

  @ApiPropertyOptional({ description: 'Institute-specific user ID' })
  userIdByInstitute?: string;

  @ApiPropertyOptional({ description: 'Institute user image URL' })
  instituteUserImageUrl?: string;

  @ApiPropertyOptional({ description: 'Institute card ID' })
  instituteCardId?: string;

  @ApiProperty({ description: 'Image verification status', enum: ImageVerificationStatus })
  imageVerificationStatus: ImageVerificationStatus;

  @ApiPropertyOptional({ description: 'ID of user who verified the image' })
  imageVerifiedBy?: string;

  @ApiProperty({ description: 'User active status' })
  isActive: boolean;

  @ApiProperty({ description: 'Institute assignment creation date' })
  createdAt: Date;

  @ApiProperty({ description: 'Institute assignment last update date' })
  updatedAt: Date;

  @ApiPropertyOptional({ description: 'Institute subscription tier (FREE, BASIC, PROFESSIONAL, ENTERPRISE, ISOLATED)' })
  instituteTier?: string;
}
