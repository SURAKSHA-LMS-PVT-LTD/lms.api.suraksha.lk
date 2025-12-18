import { IsEmail, IsString, IsOptional, IsBoolean, IsPhoneNumber, MinLength, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateBookhireOwnerDto {
  @ApiProperty({ description: 'Email address of the bookhire owner' })
  @IsEmail()
  email: string;

  @ApiProperty({ description: 'Password for the account', minLength: 8 })
  @IsString()
  @MinLength(8)
  password: string;

  @ApiProperty({ description: 'Full name of the owner' })
  @IsString()
  @MaxLength(100)
  ownerName: string;

  @ApiProperty({ description: 'Phone number of the owner' })
  @IsString()
  phoneNumber: string;

  @ApiProperty({ description: 'Name of the business' })
  @IsString()
  @MaxLength(200)
  businessName: string;

  @ApiPropertyOptional({ description: 'Business address' })
  @IsOptional()
  @IsString()
  address?: string;

  @ApiPropertyOptional({ description: 'City' })
  @IsOptional()
  @IsString()
  city?: string;

  @ApiPropertyOptional({ description: 'State or province' })
  @IsOptional()
  @IsString()
  state?: string;

  @ApiPropertyOptional({ description: 'Postal/Pin code' })
  @IsOptional()
  @IsString()
  pincode?: string;

  @ApiPropertyOptional({ description: 'Business license number' })
  @IsOptional()
  @IsString()
  businessLicense?: string;
}

export class UpdateBookhireOwnerDto {
  @ApiPropertyOptional({ description: 'Full name of the owner' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  ownerName?: string;

  @ApiPropertyOptional({ description: 'Phone number of the owner' })
  @IsOptional()
  @IsString()
  phoneNumber?: string;

  @ApiPropertyOptional({ description: 'Name of the business' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  businessName?: string;

  @ApiPropertyOptional({ description: 'Business address' })
  @IsOptional()
  @IsString()
  address?: string;

  @ApiPropertyOptional({ description: 'City' })
  @IsOptional()
  @IsString()
  city?: string;

  @ApiPropertyOptional({ description: 'State or province' })
  @IsOptional()
  @IsString()
  state?: string;

  @ApiPropertyOptional({ description: 'Postal/Pin code' })
  @IsOptional()
  @IsString()
  pincode?: string;

  @ApiPropertyOptional({ description: 'Business license number' })
  @IsOptional()
  @IsString()
  businessLicense?: string;

  @ApiPropertyOptional({ description: 'Profile image URL (upload via /upload/generate-signed-url with folder=bookhire-owner-images)' })
  @IsOptional()
  @IsString()
  profileImageUrl?: string;
}

export class BookhireOwnerLoginDto {
  @ApiProperty({ description: 'Email address' })
  @IsEmail()
  email: string;

  @ApiProperty({ description: 'Password' })
  @IsString()
  password: string;
}

export class ChangeBookhireOwnerPasswordDto {
  @ApiProperty({ description: 'Current password' })
  @IsString()
  currentPassword: string;

  @ApiProperty({ description: 'New password', minLength: 8 })
  @IsString()
  @MinLength(8)
  newPassword: string;
}

// ========================================
// RESPONSE DTOs - Consistent API Responses
// ========================================

export class BookhireOwnerResponseDto {
  @ApiProperty({ description: 'Owner ID' })
  id: string;

  @ApiProperty({ description: 'Full name' })
  fullName: string;

  @ApiProperty({ description: 'Phone number' })
  phoneNumber: string;

  @ApiProperty({ description: 'Email address' })
  email: string;

  @ApiProperty({ description: 'City', required: false })
  city?: string;

  @ApiProperty({ description: 'District', required: false })
  district?: string;

  @ApiProperty({ description: 'Province', required: false })
  province?: string;

  @ApiProperty({ description: 'Address', required: false })
  address?: string;

  @ApiProperty({ description: 'National ID number', required: false })
  nationalId?: string;

  @ApiProperty({ description: 'License number', required: false })
  licenseNumber?: string;

  @ApiProperty({ description: 'Profile image URL', required: false })
  profileImageUrl?: string;

  @ApiProperty({ description: 'Whether account is verified' })
  isVerified: boolean;

  @ApiProperty({ description: 'Whether account is active' })
  isActive: boolean;

  @ApiProperty({ description: 'Creation timestamp' })
  createdAt: Date;

  @ApiProperty({ description: 'Last update timestamp' })
  updatedAt: Date;
}

export class BookhireOwnerListResponseDto {
  @ApiProperty({ description: 'List of bookhire owners', type: [BookhireOwnerResponseDto] })
  owners: BookhireOwnerResponseDto[];

  @ApiProperty({ description: 'Total number of owners' })
  total: number;

  @ApiProperty({ description: 'Total number of pages' })
  totalPages: number;

  @ApiProperty({ description: 'Current page number' })
  currentPage: number;

  @ApiProperty({ description: 'Number of items per page' })
  limit: number;
}