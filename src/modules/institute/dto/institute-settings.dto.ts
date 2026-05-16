import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Expose, Transform } from 'class-transformer';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

/**
 * Institute Settings Response — Full data for Institute Admin settings page
 * Includes all editable fields + branding + social media + S3 URLs
 */
export class InstituteSettingsResponseDto {
  @ApiProperty({ description: 'Institute ID', example: '1' })
  @Expose()
  id: string;

  @ApiProperty({ description: 'Institute name', example: 'Cambridge International School' })
  @Expose()
  name: string;

  @ApiPropertyOptional({ description: 'Short name or abbreviation', example: 'CIS' })
  @Expose()
  shortName?: string;

  @ApiProperty({ description: 'Unique institute code (read-only for admin)', example: 'CIS001' })
  @Expose()
  code: string;

  @ApiProperty({ description: 'Institute email', example: 'admin@cambridge.edu' })
  @Expose()
  email: string;

  @ApiPropertyOptional({ description: 'Contact phone', example: '+94771234567' })
  @Expose()
  phone?: string;

  @ApiPropertyOptional({ description: 'System contact email for internal notifications', example: 'system@institute.lk' })
  @Expose()
  systemContactEmail?: string;

  @ApiPropertyOptional({ description: 'System contact phone for internal notifications', example: '+94771234567' })
  @Expose()
  systemContactPhoneNumber?: string;

  // Location
  @ApiPropertyOptional({ description: 'Address', example: '123 Education Street' })
  @Expose()
  address?: string;

  @ApiPropertyOptional({ description: 'City', example: 'Colombo' })
  @Expose()
  city?: string;

  @ApiPropertyOptional({ description: 'State', example: 'Western' })
  @Expose()
  state?: string;

  @ApiPropertyOptional({ description: 'Country', example: 'SRI_LANKA' })
  @Expose()
  country?: string;

  @ApiPropertyOptional({ description: 'District', example: 'COLOMBO' })
  @Expose()
  district?: string;

  @ApiPropertyOptional({ description: 'Province', example: 'WESTERN' })
  @Expose()
  province?: string;

  @ApiPropertyOptional({ description: 'Postal code', example: '10100' })
  @Expose()
  pinCode?: string;

  @ApiPropertyOptional({ description: 'Institute type', example: 'SCHOOL' })
  @Expose()
  type?: string;

  // Branding — all URLs are full S3 URLs
  @ApiPropertyOptional({ description: 'Logo full S3 URL', example: 'https://storage.googleapis.com/bucket/logo.png' })
  @Expose()
  logoUrl?: string;

  @ApiPropertyOptional({ description: 'Loading GIF full S3 URL' })
  @Expose()
  loadingGifUrl?: string;

  @ApiPropertyOptional({ description: 'Primary theme color', example: '#1976D2' })
  @Expose()
  primaryColorCode?: string;

  @ApiPropertyOptional({ description: 'Secondary theme color', example: '#FFC107' })
  @Expose()
  secondaryColorCode?: string;

  @ApiPropertyOptional({ description: 'Gallery image S3 URLs', type: [String] })
  @Expose()
  @Transform(({ value }) => {
    if (typeof value === 'string') {
      try { return JSON.parse(value); } catch { return []; }
    }
    return value || [];
  })
  imageUrls?: string[];

  @ApiPropertyOptional({ description: 'Legacy single image S3 URL', deprecated: true })
  @Expose()
  imageUrl?: string;

  // Content
  @ApiPropertyOptional({ description: 'Vision statement' })
  @Expose()
  vision?: string;

  @ApiPropertyOptional({ description: 'Mission statement' })
  @Expose()
  mission?: string;

  // Social & Web
  @ApiPropertyOptional({ description: 'Website URL', example: 'https://school.edu' })
  @Expose()
  websiteUrl?: string;

  @ApiPropertyOptional({ description: 'Facebook page URL' })
  @Expose()
  facebookPageUrl?: string;

  @ApiPropertyOptional({ description: 'YouTube channel URL' })
  @Expose()
  youtubeChannelUrl?: string;

  // Meta
  @ApiProperty({ description: 'Active status', example: true })
  @Expose()
  isActive: boolean;

  @ApiProperty({ description: 'Last update timestamp' })
  @Expose()
  updatedAt: Date;

  // Session Limits
  @ApiPropertyOptional({ description: 'Session limits enabled status', example: true })
  @Expose()
  isSessionLimitEnabled?: boolean;

  @ApiPropertyOptional({ description: 'Default max devices per user', example: 1 })
  @Expose()
  defaultSessionsPerUserCount?: number;

  @ApiPropertyOptional({ description: 'When true, over-limit login is blocked (strict). When false, oldest session is auto-kicked (relaxed).', example: false })
  @Expose()
  isStrictSessionLimit?: boolean;

  // PDF Report branding — full CDN URLs (or null if not set)
  @ApiPropertyOptional({ description: 'Full URL of the report header banner image (wide, ~8:1 ratio)' })
  @Expose()
  reportHeaderUrl?: string | null;

  @ApiPropertyOptional({ description: 'Full URL of the report footer banner image (wide, ~14:1 ratio)' })
  @Expose()
  reportFooterUrl?: string | null;

  // Receipt printer banner images — separate from PDF report banners
  @ApiPropertyOptional({ description: 'Full URL of the receipt header banner image (sized for thermal paper)' })
  @Expose()
  receiptHeaderUrl?: string | null;

  @ApiPropertyOptional({ description: 'Full URL of the receipt footer banner image (sized for thermal paper)' })
  @Expose()
  receiptFooterUrl?: string | null;

  // Receipt printer settings
  @ApiPropertyOptional({ description: 'Receipt printer configuration' })
  @Expose()
  printerSettings?: {
    defaultSize?: '2inch' | '3inch' | '4inch' | 'a4';
    language?: 'en' | 'si';
    receiptHeader?: string;
    receiptFooter?: string;
  } | null;

  @ApiPropertyOptional({ description: 'Whether institute users can upload their own profile photo' })
  @Expose()
  allowUserPhotoUpload?: boolean;

  constructor(partial: Partial<InstituteSettingsResponseDto>) {
    Object.assign(this, partial);
  }
}

/**
 * Combined print settings response for physical payment pages.
 * Single endpoint so the page loads everything in one API call.
 */
export class InstitutePrintSettingsResponseDto {
  @ApiPropertyOptional({ description: 'Default paper size', enum: ['2inch', '3inch', '4inch', 'a4'] })
  @Expose()
  defaultSize?: '2inch' | '3inch' | '4inch' | 'a4';

  @ApiPropertyOptional({ description: 'Print language: en=English, si=Sinhala', enum: ['en', 'si'] })
  @Expose()
  language?: 'en' | 'si';

  @ApiPropertyOptional({ description: 'Custom text at the top of each receipt' })
  @Expose()
  receiptHeader?: string | null;

  @ApiPropertyOptional({ description: 'Custom text at the bottom of each receipt' })
  @Expose()
  receiptFooter?: string | null;

  @ApiPropertyOptional({ description: 'Base64 data URL for the receipt/report header banner image' })
  @Expose()
  headerImageDataUrl?: string | null;

  @ApiPropertyOptional({ description: 'Base64 data URL for the receipt/report footer banner image' })
  @Expose()
  footerImageDataUrl?: string | null;

  constructor(partial: Partial<InstitutePrintSettingsResponseDto>) {
    Object.assign(this, partial);
  }
}

/**
 * Institute PDF report branding response.
 * Returns header/footer images as base64 data URLs so the frontend can embed them
 * into generated PDFs without relying on browser CORS.
 */
export class InstituteReportBrandingResponseDto {
  @ApiPropertyOptional({ description: 'Base64 data URL for the report header image' })
  @Expose()
  instituteHeaderDataUrl?: string | null;

  @ApiPropertyOptional({ description: 'Base64 data URL for the report footer image' })
  @Expose()
  instituteFooterDataUrl?: string | null;

  constructor(partial: Partial<InstituteReportBrandingResponseDto>) {
    Object.assign(this, partial);
  }
}

/**
 * Institute Profile Response — Minimal beautiful view for teachers, students, attendance markers
 * Only essential identity + branding + social links. No images array, no system contacts.
 * NOTE: code and pinCode are intentionally excluded — they are sensitive enrollment credentials.
 */
export class InstituteProfileResponseDto {
  @ApiProperty({ description: 'Institute ID', example: '1' })
  @Expose()
  id: string;

  @ApiProperty({ description: 'Institute name', example: 'Cambridge International School' })
  @Expose()
  name: string;

  @ApiPropertyOptional({ description: 'Short name', example: 'CIS' })
  @Expose()
  shortName?: string;

  // Note: code and pinCode are NOT exposed in the profile — they are enrollment credentials

  // Branding
  @ApiPropertyOptional({ description: 'Logo full URL' })
  @Expose()
  logoUrl?: string;

  @ApiPropertyOptional({ description: 'Loading GIF full URL' })
  @Expose()
  loadingGifUrl?: string;

  @ApiPropertyOptional({ description: 'Primary theme color', example: '#1976D2' })
  @Expose()
  primaryColorCode?: string;

  @ApiPropertyOptional({ description: 'Secondary theme color', example: '#FFC107' })
  @Expose()
  secondaryColorCode?: string;

  @ApiPropertyOptional({ description: 'Gallery image URLs', type: [String] })
  @Expose()
  imageUrls?: string[];

  @ApiPropertyOptional({ description: 'Legacy single image URL' })
  @Expose()
  imageUrl?: string;

  // Minimal contact — just enough to identify
  @ApiPropertyOptional({ description: 'Contact phone', example: '+94771234567' })
  @Expose()
  phone?: string;

  @ApiPropertyOptional({ description: 'Contact email', example: 'info@school.edu' })
  @Expose()
  email?: string;

  @ApiPropertyOptional({ description: 'City', example: 'Colombo' })
  @Expose()
  city?: string;

  @ApiPropertyOptional({ description: 'Institute type', example: 'SCHOOL' })
  @Expose()
  type?: string;

  // Social media — useful for quick access
  @ApiPropertyOptional({ description: 'Website URL' })
  @Expose()
  websiteUrl?: string;

  @ApiPropertyOptional({ description: 'Facebook page URL' })
  @Expose()
  facebookPageUrl?: string;

  @ApiPropertyOptional({ description: 'YouTube channel URL' })
  @Expose()
  youtubeChannelUrl?: string;

  // Content — vision/mission for institute identity
  @ApiPropertyOptional({ description: 'Vision statement' })
  @Expose()
  vision?: string;

  @ApiPropertyOptional({ description: 'Mission statement' })
  @Expose()
  mission?: string;

  constructor(partial: Partial<InstituteProfileResponseDto>) {
    Object.assign(this, partial);
  }
}

/**
 * DTO for adding a single image to the institute gallery.
 * Accepts the S3/GCS relative path returned by /upload/verify-and-publish.
 */
export class AddGalleryImageDto {
  @ApiProperty({
    description: 'S3/GCS relative path returned by /upload/verify-and-publish',
    example: 'institute-images/gallery-abc123.jpg',
  })
  @IsNotEmpty()
  @IsString()
  @MaxLength(255)
  relativePath: string;
}
