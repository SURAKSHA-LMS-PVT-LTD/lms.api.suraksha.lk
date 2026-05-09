import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsOptional,
  IsString,
  IsEmail,
  MaxLength,
  Matches,
  IsArray,
  IsUrl,
  ArrayMaxSize,
  IsEnum,
} from 'class-validator';
import { Country } from '../../user/enums/country.enum';
import { District } from '../../user/enums/district.enum';
import { Province } from '../../user/enums/province.enum';
import { InstituteType } from '../enums/institute.enums';
import { IsBoolean, IsInt, Min } from 'class-validator';

/**
 * Update Institute Settings DTO — Fields the Institute Admin can modify
 * NOTE: code, isDefault, isActive are NOT editable by institute admin (SUPERADMIN only)
 * All image/logo fields accept S3 relative paths from /upload/verify-and-publish
 */
export class UpdateInstituteSettingsDto {
  // Basic Info
  @ApiPropertyOptional({ description: 'Institute name', example: 'Cambridge International School', maxLength: 100 })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;

  @ApiPropertyOptional({ description: 'Short name / abbreviation', example: 'CIS', maxLength: 20 })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  shortName?: string;

  @ApiPropertyOptional({ description: 'Institute email', example: 'admin@school.edu' })
  @IsOptional()
  @IsEmail()
  @MaxLength(60)
  email?: string;

  @ApiPropertyOptional({ description: 'Contact phone', example: '+94771234567', maxLength: 15 })
  @IsOptional()
  @IsString()
  @MaxLength(15)
  phone?: string;

  @ApiPropertyOptional({ description: 'System contact email (internal notifications)', example: 'system@school.lk', maxLength: 100 })
  @IsOptional()
  @IsEmail()
  @MaxLength(100)
  systemContactEmail?: string;

  @ApiPropertyOptional({ description: 'System contact phone (internal notifications)', example: '+94771234567', maxLength: 20 })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  systemContactPhoneNumber?: string;

  // Location
  @ApiPropertyOptional({ description: 'Address', maxLength: 200 })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  address?: string;

  @ApiPropertyOptional({ description: 'City', maxLength: 50 })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  city?: string;

  @ApiPropertyOptional({ description: 'State', maxLength: 50 })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  state?: string;

  @ApiPropertyOptional({ description: 'Country', enum: Country })
  @IsOptional()
  @IsEnum(Country)
  country?: Country;

  @ApiPropertyOptional({ description: 'District', enum: District })
  @IsOptional()
  @IsEnum(District)
  district?: District;

  @ApiPropertyOptional({ description: 'Province', enum: Province })
  @IsOptional()
  @IsEnum(Province)
  province?: Province;

  @ApiPropertyOptional({ description: 'Postal code', maxLength: 10 })
  @IsOptional()
  @IsString()
  @MaxLength(10)
  pinCode?: string;

  @ApiPropertyOptional({ description: 'Institute type', enum: InstituteType })
  @IsOptional()
  @IsEnum(InstituteType)
  type?: InstituteType;

  // Session Limits
  @ApiPropertyOptional({ description: 'Enable/disable session limits for the institute' })
  @IsOptional()
  @IsBoolean()
  isSessionLimitEnabled?: boolean;

  @ApiPropertyOptional({ description: 'Default max devices per user' })
  @IsOptional()
  @IsInt()
  @Min(1)
  defaultSessionsPerUserCount?: number;

  @ApiPropertyOptional({ description: 'How to apply the new default limit to existing users', enum: ['NEW_USERS_ONLY', 'ALL_USERS', 'USERS_WITH_PREVIOUS_LIMIT'] })
  @IsOptional()
  @IsEnum(['NEW_USERS_ONLY', 'ALL_USERS', 'USERS_WITH_PREVIOUS_LIMIT'])
  sessionLimitUpdateMode?: 'NEW_USERS_ONLY' | 'ALL_USERS' | 'USERS_WITH_PREVIOUS_LIMIT';

  // Branding — S3 relative paths
  @ApiPropertyOptional({
    description: 'Logo S3 relative path (from /upload/verify-and-publish)',
    example: 'institute-images/logo-uuid.png',
    maxLength: 255,
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  logoUrl?: string;

  @ApiPropertyOptional({
    description: 'Loading GIF S3 relative path',
    example: 'institute-images/loading-uuid.gif',
    maxLength: 255,
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  loadingGifUrl?: string;

  @ApiPropertyOptional({
    description: 'Primary theme color (hex)',
    example: '#1976D2',
  })
  @IsOptional()
  @IsString()
  @Matches(/^#[0-9A-Fa-f]{6}$/, { message: 'Must be a valid hex color code (e.g., #1976D2)' })
  primaryColorCode?: string;

  @ApiPropertyOptional({
    description: 'Secondary theme color (hex)',
    example: '#FFC107',
  })
  @IsOptional()
  @IsString()
  @Matches(/^#[0-9A-Fa-f]{6}$/, { message: 'Must be a valid hex color code (e.g., #FFC107)' })
  secondaryColorCode?: string;

  @ApiPropertyOptional({
    description: 'Gallery image S3 relative paths (max 10)',
    type: [String],
    example: ['institute-images/img1.jpg', 'institute-images/img2.jpg'],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(10)
  imageUrls?: string[];

  @ApiPropertyOptional({
    description: 'Single image S3 relative path (legacy)',
    maxLength: 255,
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  imageUrl?: string;

  // Content
  @ApiPropertyOptional({ description: 'Vision statement' })
  @IsOptional()
  @IsString()
  vision?: string;

  @ApiPropertyOptional({ description: 'Mission statement' })
  @IsOptional()
  @IsString()
  mission?: string;

  // Social & Web — full external URLs
  @ApiPropertyOptional({ description: 'Website URL', example: 'https://school.edu', maxLength: 255 })
  @IsOptional()
  @IsUrl()
  @MaxLength(255)
  websiteUrl?: string;

  @ApiPropertyOptional({ description: 'Facebook page URL', example: 'https://facebook.com/school', maxLength: 255 })
  @IsOptional()
  @IsUrl()
  @MaxLength(255)
  facebookPageUrl?: string;

  @ApiPropertyOptional({ description: 'YouTube channel URL', example: 'https://youtube.com/c/school', maxLength: 255 })
  @IsOptional()
  @IsUrl()
  @MaxLength(255)
  youtubeChannelUrl?: string;

  // ── PDF Report branding ────────────────────────────────────────────────────
  // S3 relative paths returned by /upload/verify-and-publish.
  // Displayed as full URLs in getSettings() response via CloudStorageService.getFullUrl().
  // Frontend upload UI: InstituteSettingsPage.tsx (search for "Report Branding")

  @ApiPropertyOptional({
    description: 'Report header banner S3 path — wide image shown at top of every PDF page (~8:1 aspect ratio, e.g. 1400×175 px)',
    maxLength: 500,
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reportHeaderUrl?: string;

  @ApiPropertyOptional({
    description: 'Report footer banner S3 path — wide image shown at bottom of every PDF page (~14:1 aspect ratio, e.g. 1400×100 px)',
    maxLength: 500,
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reportFooterUrl?: string;
}
