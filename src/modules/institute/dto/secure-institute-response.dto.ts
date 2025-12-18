import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Exclude, Expose, Transform } from 'class-transformer';

/**
 * Public Institute Response - Minimal data for public consumption
 * Used in: Public searches, institute listings for non-authenticated users
 */
export class InstitutePublicResponseDto {
  @ApiProperty({ description: 'Institute ID', example: '1' })
  @Expose()
  id: string;

  @ApiProperty({ description: 'Institute name', example: 'Cambridge International School' })
  @Expose()
  name: string;

  @ApiPropertyOptional({ description: 'Short name or abbreviation', example: 'CIS' })
  @Expose()
  shortName?: string;

  @ApiProperty({ description: 'Institute code', example: 'CIS001' })
  @Expose()
  code: string;

  @ApiPropertyOptional({ description: 'City', example: 'Colombo' })
  @Expose()
  city?: string;

  @ApiPropertyOptional({ description: 'Country', example: 'Sri Lanka' })
  @Expose()
  country?: string;

  @ApiPropertyOptional({ description: 'Institute logo URL' })
  @Expose()
  logoUrl?: string;

  @ApiPropertyOptional({ description: 'Primary color code', example: '#1976D2' })
  @Expose()
  primaryColorCode?: string;

  constructor(partial: Partial<InstitutePublicResponseDto>) {
    Object.assign(this, partial);
  }
}

/**
 * Institute Summary Response - For authenticated user lists/searches
 * Used in: Dropdowns, search results, institute listings for logged-in users
 */
export class InstituteSummaryResponseDto {
  @ApiProperty({ description: 'Institute ID', example: '1' })
  @Expose()
  id: string;

  @ApiProperty({ description: 'Institute name', example: 'Cambridge International School' })
  @Expose()
  name: string;

  @ApiPropertyOptional({ description: 'Short name or abbreviation', example: 'CIS' })
  @Expose()
  shortName?: string;

  @ApiProperty({ description: 'Institute code', example: 'CIS001' })
  @Expose()
  code: string;

  @ApiProperty({ description: 'Contact email', example: 'admin@cambridge.edu' })
  @Expose()
  email: string;

  @ApiPropertyOptional({ description: 'Contact phone', example: '+94771234567' })
  @Expose()
  phone?: string;

  @ApiPropertyOptional({ description: 'City', example: 'Colombo' })
  @Expose()
  city?: string;

  @ApiPropertyOptional({ description: 'State/Province', example: 'Western' })
  @Expose()
  state?: string;

  @ApiPropertyOptional({ description: 'Institute logo URL' })
  @Expose()
  logoUrl?: string;

  @ApiPropertyOptional({ description: 'Loading GIF URL' })
  @Expose()
  loadingGifUrl?: string;

  @ApiPropertyOptional({ description: 'Primary color code', example: '#1976D2' })
  @Expose()
  primaryColorCode?: string;

  @ApiPropertyOptional({ description: 'Secondary color code', example: '#FFC107' })
  @Expose()
  secondaryColorCode?: string;

  @ApiPropertyOptional({ description: 'Whether this is the default institute' })
  @Expose()
  isDefault?: boolean;

  constructor(partial: Partial<InstituteSummaryResponseDto>) {
    Object.assign(this, partial);
  }
}

/**
 * Institute Detail Response - Full information for authorized access
 * Used in: Institute profile pages, detailed views for authenticated users
 */
export class InstituteDetailResponseDto {
  @ApiProperty({ description: 'Institute ID', example: '1' })
  @Expose()
  id: string;

  @ApiProperty({ description: 'Institute name', example: 'Cambridge International School' })
  @Expose()
  name: string;

  @ApiPropertyOptional({ description: 'Short name or abbreviation', example: 'CIS' })
  @Expose()
  shortName?: string;

  @ApiProperty({ description: 'Institute code', example: 'CIS001' })
  @Expose()
  code: string;

  @ApiProperty({ description: 'Contact email', example: 'admin@cambridge.edu' })
  @Expose()
  email: string;

  @ApiPropertyOptional({ description: 'Contact phone', example: '+94771234567' })
  @Expose()
  phone?: string;

  @ApiPropertyOptional({ description: 'Address', example: '123 Education Street' })
  @Expose()
  address?: string;

  @ApiPropertyOptional({ description: 'City', example: 'Colombo' })
  @Expose()
  city?: string;

  @ApiPropertyOptional({ description: 'State/Province', example: 'Western' })
  @Expose()
  state?: string;

  @ApiPropertyOptional({ description: 'Country', example: 'Sri Lanka' })
  @Expose()
  country?: string;

  @ApiPropertyOptional({ description: 'District', example: 'Colombo District' })
  @Expose()
  district?: string;

  @ApiPropertyOptional({ description: 'Province', example: 'Western Province' })
  @Expose()
  province?: string;

  @ApiPropertyOptional({ description: 'Postal code', example: '10100' })
  @Expose()
  pinCode?: string;

  // Branding and Visual Identity
  @ApiPropertyOptional({ description: 'Institute logo URL' })
  @Expose()
  logoUrl?: string;

  @ApiPropertyOptional({ description: 'Loading GIF URL for institute branding' })
  @Expose()
  loadingGifUrl?: string;

  @ApiPropertyOptional({ description: 'Primary color code', example: '#1976D2' })
  @Expose()
  primaryColorCode?: string;

  @ApiPropertyOptional({ description: 'Secondary color code', example: '#FFC107' })
  @Expose()
  secondaryColorCode?: string;

  @ApiPropertyOptional({
    description: 'Array of additional image URLs for institute gallery',
    type: [String]
  })
  @Expose()
  @Transform(({ value }) => {
    if (typeof value === 'string') {
      try {
        return JSON.parse(value);
      } catch {
        return [];
      }
    }
    return value || [];
  })
  imageUrls?: string[];

  @ApiPropertyOptional({ description: 'Whether this is the default institute' })
  @Expose()
  isDefault?: boolean;

  // Institute Information
  @ApiPropertyOptional({ description: 'Institute vision statement' })
  @Expose()
  vision?: string;

  @ApiPropertyOptional({ description: 'Institute mission statement' })
  @Expose()
  mission?: string;

  // Online Presence
  @ApiPropertyOptional({ description: 'Institute website URL' })
  @Expose()
  websiteUrl?: string;

  @ApiPropertyOptional({ description: 'Facebook page URL' })
  @Expose()
  facebookPageUrl?: string;

  @ApiPropertyOptional({ description: 'YouTube channel URL' })
  @Expose()
  youtubeChannelUrl?: string;

  // Legacy field - keeping for backward compatibility
  @ApiPropertyOptional({ description: 'Legacy institute image URL (use logoUrl instead)', deprecated: true })
  @Expose()
  imageUrl?: string;

  // Exclude sensitive system information
  @Exclude()
  isActive: boolean;

  @Exclude()
  createdAt: Date;

  @Exclude()
  updatedAt: Date;

  constructor(partial: Partial<InstituteDetailResponseDto>) {
    Object.assign(this, partial);
  }
}

/**
 * Institute Admin Response - Complete information for administrators only
 * Used in: Admin panels, system management interfaces
 */
export class InstituteAdminResponseDto {
  @ApiProperty({ description: 'Institute ID', example: '1' })
  @Expose()
  id: string;

  @ApiProperty({ description: 'Institute name', example: 'Cambridge International School' })
  @Expose()
  name: string;

  @ApiPropertyOptional({ description: 'Short name or abbreviation', example: 'CIS' })
  @Expose()
  shortName?: string;

  @ApiProperty({ description: 'Institute code', example: 'CIS001' })
  @Expose()
  code: string;

  @ApiProperty({ description: 'Contact email', example: 'admin@cambridge.edu' })
  @Expose()
  email: string;

  @ApiPropertyOptional({ description: 'Contact phone', example: '+94771234567' })
  @Expose()
  phone?: string;

  @ApiPropertyOptional({ description: 'Address', example: '123 Education Street' })
  @Expose()
  address?: string;

  @ApiPropertyOptional({ description: 'City', example: 'Colombo' })
  @Expose()
  city?: string;

  @ApiPropertyOptional({ description: 'State/Province', example: 'Western' })
  @Expose()
  state?: string;

  @ApiPropertyOptional({ description: 'Country', example: 'Sri Lanka' })
  @Expose()
  country?: string;

  @ApiPropertyOptional({ description: 'District', example: 'Colombo District' })
  @Expose()
  district?: string;

  @ApiPropertyOptional({ description: 'Province', example: 'Western Province' })
  @Expose()
  province?: string;

  @ApiPropertyOptional({ description: 'Postal code', example: '10100' })
  @Expose()
  pinCode?: string;

  // Branding and Visual Identity
  @ApiPropertyOptional({ description: 'Institute logo URL' })
  @Expose()
  logoUrl?: string;

  @ApiPropertyOptional({ description: 'Loading GIF URL for institute branding' })
  @Expose()
  loadingGifUrl?: string;

  @ApiPropertyOptional({ description: 'Primary color code', example: '#1976D2' })
  @Expose()
  primaryColorCode?: string;

  @ApiPropertyOptional({ description: 'Secondary color code', example: '#FFC107' })
  @Expose()
  secondaryColorCode?: string;

  @ApiPropertyOptional({
    description: 'Array of additional image URLs for institute gallery',
    type: [String]
  })
  @Expose()
  @Transform(({ value }) => {
    if (typeof value === 'string') {
      try {
        return JSON.parse(value);
      } catch {
        return [];
      }
    }
    return value || [];
  })
  imageUrls?: string[];

  @ApiPropertyOptional({ description: 'Whether this is the default institute' })
  @Expose()
  isDefault?: boolean;

  // Institute Information
  @ApiPropertyOptional({ description: 'Institute vision statement' })
  @Expose()
  vision?: string;

  @ApiPropertyOptional({ description: 'Institute mission statement' })
  @Expose()
  mission?: string;

  // Online Presence
  @ApiPropertyOptional({ description: 'Institute website URL' })
  @Expose()
  websiteUrl?: string;

  @ApiPropertyOptional({ description: 'Facebook page URL' })
  @Expose()
  facebookPageUrl?: string;

  @ApiPropertyOptional({ description: 'YouTube channel URL' })
  @Expose()
  youtubeChannelUrl?: string;

  // Legacy field - keeping for backward compatibility
  @ApiPropertyOptional({ description: 'Legacy institute image URL (use logoUrl instead)', deprecated: true })
  @Expose()
  imageUrl?: string;

  @ApiProperty({ description: 'Active status', example: true })
  @Expose()
  isActive: boolean;

  @ApiProperty({ description: 'Creation timestamp' })
  @Expose()
  createdAt: Date;

  @ApiProperty({ description: 'Last update timestamp' })
  @Expose()
  updatedAt: Date;

  constructor(partial: Partial<InstituteAdminResponseDto>) {
    Object.assign(this, partial);
  }
}
