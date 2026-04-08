import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Exclude, Expose } from 'class-transformer';
import { UserType } from '../enums/user-type.enum';
import { Gender } from '../enums/gender.enum';

/**
 * Public User Response - Minimal data for public consumption
 * Used in: Public profiles, search results for non-authenticated users
 */
export class UserPublicResponseDto {
  @ApiProperty({ description: 'User ID', example: '123' })
  @Expose()
  id: string;

  @ApiProperty({ description: 'First name', example: 'John' })
  @Expose()
  firstName: string;

  @ApiPropertyOptional({ description: 'Last name', example: 'Doe' })
  @Expose()
  lastName?: string;

  @ApiPropertyOptional({ description: 'Name with initials', example: 'J. Doe' })
  @Expose()
  nameWithInitials?: string;

  @ApiPropertyOptional({ description: 'Profile image URL' })
  @Expose()
  imageUrl?: string;

  // Exclude all sensitive information
  @Exclude()
  email?: string;

  @Exclude()
  userType?: UserType;

  @Exclude()
  dateOfBirth?: string;

  @Exclude()
  gender?: Gender;

  @Exclude()
  nic?: string;

  @Exclude()
  phoneNumber?: string;

  @Exclude()
  addressLine1?: string;

  @Exclude()
  city?: string;

  @Exclude()
  isActive: boolean;

  constructor(partial: Partial<UserPublicResponseDto>) {
    Object.assign(this, partial);
  }
}

/**
 * User Summary Response - For authenticated user lists/searches
 * Used in: Dropdowns, search results, user listings for logged-in users
 */
export class UserSummaryResponseDto {
  @ApiProperty({ description: 'User ID', example: '123' })
  @Expose()
  id: string;

  @ApiProperty({ description: 'First name', example: 'John' })
  @Expose()
  firstName: string;

  @ApiPropertyOptional({ description: 'Last name', example: 'Doe' })
  @Expose()
  lastName?: string;

  @ApiPropertyOptional({ description: 'Name with initials', example: 'J. Doe' })
  @Expose()
  nameWithInitials?: string;

  @ApiProperty({ description: 'Email address', example: 'john.doe@example.com' })
  @Expose()
  email?: string;

  @ApiPropertyOptional({ description: 'User type', enum: UserType })
  @Expose()
  userType?: UserType;

  @ApiPropertyOptional({ description: 'Profile image URL' })
  @Expose()
  imageUrl?: string;

  @ApiPropertyOptional({ description: 'Phone number (visible to admin/teacher in class context)' })
  @Expose()
  phoneNumber?: string;

  @Exclude()
  dateOfBirth?: string;

  @Exclude()
  gender?: Gender;

  @Exclude()
  nic?: string;

  @Exclude()
  addressLine1?: string;

  @Exclude()
  city?: string;

  @Exclude()
  isActive: boolean;

  constructor(partial: Partial<UserSummaryResponseDto>) {
    Object.assign(this, partial);
  }
}

/**
 * User Detail Response - Full information for authorized access
 * Used in: Profile pages, detailed views for the user themselves or authorized viewers
 */
export class UserDetailResponseDto {
  @ApiProperty({ description: 'User ID', example: '123' })
  @Expose()
  id: string;

  @ApiProperty({ description: 'First name', example: 'John' })
  @Expose()
  firstName: string;

  @ApiPropertyOptional({ description: 'Last name', example: 'Doe' })
  @Expose()
  lastName?: string;

  @ApiPropertyOptional({ description: 'Name with initials', example: 'J. Doe' })
  @Expose()
  nameWithInitials?: string;

  @ApiProperty({ description: 'Email address', example: 'john.doe@example.com' })
  @Expose()
  email?: string;

  @ApiPropertyOptional({ description: 'Phone number', example: '+94771234567' })
  @Expose()
  phone?: string;

  @ApiPropertyOptional({ description: 'User type', enum: UserType })
  @Expose()
  userType?: UserType;

  @ApiPropertyOptional({ description: 'Date of birth (YYYY-MM-DD)', example: '1995-05-15' })
  @Expose()
  dateOfBirth?: string;

  @ApiPropertyOptional({ description: 'Gender', enum: Gender })
  @Expose()
  gender?: Gender;

  @ApiPropertyOptional({ description: 'Profile image URL' })
  @Expose()
  imageUrl?: string;

  // Exclude highly sensitive data even in detailed view
  @Exclude()
  nic?: string;

  @Exclude()
  birthCertificateNo?: string;

  @Exclude()
  addressLine1?: string;

  @Exclude()
  addressLine2?: string;

  @Exclude()
  city?: string;

  @Exclude()
  district?: string;

  @Exclude()
  province?: string;

  @Exclude()
  postalCode?: string;

  @Exclude()
  country?: string;

  @Exclude()
  isActive: boolean;

  @Exclude()
  createdAt: Date;

  @Exclude()
  updatedAt: Date;

  @Exclude()
  password?: string;

  @Exclude()
  phoneNumber?: string;

  @Exclude()
  idUrl?: string;

  constructor(partial: Partial<UserDetailResponseDto>) {
    Object.assign(this, partial);
  }
}

/**
 * User Own Profile Response - Complete information for the user's own profile
 * Used in: User's own profile page, settings page
 */
export class UserOwnProfileResponseDto {
  @ApiProperty({ description: 'User ID', example: '123' })
  @Expose()
  id: string;

  @ApiProperty({ description: 'First name', example: 'John' })
  @Expose()
  firstName: string;

  @ApiPropertyOptional({ description: 'Last name', example: 'Doe' })
  @Expose()
  lastName?: string;

  @ApiPropertyOptional({ description: 'Name with initials', example: 'J. Doe' })
  @Expose()
  nameWithInitials?: string;

  @ApiProperty({ description: 'Email address', example: 'john.doe@example.com' })
  @Expose()
  email?: string;

  @ApiPropertyOptional({ description: 'Phone number', example: '+94771234567' })
  @Expose()
  phone?: string;

  @ApiPropertyOptional({ description: 'User type', enum: UserType })
  @Expose()
  userType?: UserType;

  @ApiPropertyOptional({ description: 'Date of birth (YYYY-MM-DD)', example: '1995-05-15' })
  @Expose()
  dateOfBirth?: string;

  @ApiPropertyOptional({ description: 'Gender', enum: Gender })
  @Expose()
  gender?: Gender;

  @ApiPropertyOptional({ description: 'Profile image URL' })
  @Expose()
  imageUrl?: string;

  @ApiPropertyOptional({ description: 'City', example: 'Colombo' })
  @Expose()
  city?: string;

  @ApiPropertyOptional({ description: 'Country', example: 'Sri Lanka' })
  @Expose()
  country?: string;

  // Still exclude most sensitive data even for own profile
  @Exclude()
  nic?: string;

  @Exclude()
  birthCertificateNo?: string;

  @Exclude()
  addressLine1?: string;

  @Exclude()
  addressLine2?: string;

  @Exclude()
  district?: string;

  @Exclude()
  province?: string;

  @Exclude()
  postalCode?: string;

  @Exclude()
  isActive: boolean;

  @Exclude()
  createdAt: Date;

  @Exclude()
  updatedAt: Date;

  @Exclude()
  password?: string;

  @Exclude()
  phoneNumber?: string;

  @Exclude()
  idUrl?: string;

  constructor(partial: Partial<UserOwnProfileResponseDto>) {
    Object.assign(this, partial);
  }
}

/**
 * User Admin Response - Complete information for administrators only
 * Used in: Admin panels, system management interfaces
 */
export class UserAdminResponseDto {
  @ApiProperty({ description: 'User ID', example: '123' })
  @Expose()
  id: string;

  @ApiProperty({ description: 'First name', example: 'John' })
  @Expose()
  firstName: string;

  @ApiPropertyOptional({ description: 'Last name', example: 'Doe' })
  @Expose()
  lastName?: string;

  @ApiPropertyOptional({ description: 'Name with initials', example: 'J. Doe' })
  @Expose()
  nameWithInitials?: string;

  @ApiProperty({ description: 'Email address', example: 'john.doe@example.com' })
  @Expose()
  email?: string;

  @ApiPropertyOptional({ description: 'Phone number', example: '+94771234567' })
  @Expose()
  phone?: string;

  @ApiPropertyOptional({ description: 'User type', enum: UserType })
  @Expose()
  userType?: UserType;

  @ApiPropertyOptional({ description: 'Date of birth (YYYY-MM-DD)', example: '1995-05-15' })
  @Expose()
  dateOfBirth?: string;

  @ApiPropertyOptional({ description: 'Gender', enum: Gender })
  @Expose()
  gender?: Gender;

  @ApiPropertyOptional({ description: 'Profile image URL' })
  @Expose()
  imageUrl?: string;

  @ApiPropertyOptional({ description: 'City', example: 'Colombo' })
  @Expose()
  city?: string;

  @ApiPropertyOptional({ description: 'Country', example: 'Sri Lanka' })
  @Expose()
  country?: string;

  @ApiProperty({ description: 'Active status', example: true })
  @Expose()
  isActive: boolean;

  @ApiProperty({ description: 'Creation timestamp' })
  @Expose()
  createdAt: Date;

  @ApiProperty({ description: 'Last update timestamp' })
  @Expose()
  updatedAt: Date;

  // Still exclude most sensitive data even for admins
  @Exclude()
  nic?: string;

  @Exclude()
  birthCertificateNo?: string;

  @Exclude()
  password?: string;

  @Exclude()
  idUrl?: string;

  constructor(partial: Partial<UserAdminResponseDto>) {
    Object.assign(this, partial);
  }
}
