// src/modules/institute/dto/create-institute.dto.ts
import { 
  IsString, 
  IsEmail, 
  IsOptional, 
  IsNotEmpty, 
  MaxLength, 
  MinLength,
  Matches,
  IsArray,
  IsUrl,
  IsBoolean,
  ArrayMaxSize,
  IsEnum
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Country } from '../../user/enums/country.enum';
import { District } from '../../user/enums/district.enum';
import { Province } from '../../user/enums/province.enum';
import { Transform } from 'class-transformer';
import { InstituteType, InstituteTier } from '../enums/institute.enums';

export class CreateInstituteDto {
  @ApiPropertyOptional({
    description: 'Institute tier/package',
    example: InstituteTier.FREE,
    enum: InstituteTier
  })
  @IsOptional()
  @IsEnum(InstituteTier)
  tier?: InstituteTier;

  @ApiPropertyOptional({
    description: 'Subdomain for the institute (e.g., "royalcollege" → royalcollege.suraksha.lk). Requires STARTER tier or above.',
    example: 'royalcollege',
    maxLength: 63
  })
  @IsOptional()
  @IsString()
  @MaxLength(63)
  @MinLength(3)
  @Matches(/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/, {
    message: 'Subdomain must be lowercase alphanumeric with optional hyphens (not at start or end)'
  })
  subdomain?: string;

  @ApiPropertyOptional({
    description: 'Institute type',
    example: InstituteType.SCHOOL,
    enum: InstituteType
  })
  @IsOptional()
  @IsEnum(InstituteType)
  type?: InstituteType;

  @ApiProperty({
    description: 'Institute name',
    example: 'Cambridge International School',
    maxLength: 255
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name: string;

  @ApiPropertyOptional({
    description: 'Short name or abbreviation',
    example: 'CIS',
    maxLength: 50
  })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  shortName?: string;

  @ApiPropertyOptional({
    description: 'Unique institute code (auto-generated if omitted, format: INST-YYYYMMDD-NNN)',
    example: 'INST-20260411-001',
    maxLength: 50
  })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  @MinLength(3)
  @Matches(/^[A-Z0-9_-]+$/, {
    message: 'Code must contain only uppercase letters, numbers, hyphens, and underscores'
  })
  code?: string;

  @ApiProperty({
    description: 'Institute email address',
    example: 'admin@cambridge-school.edu'
  })
  @IsEmail()
  @IsNotEmpty()
  @MaxLength(255)
  email: string;

  @ApiPropertyOptional({
    description: 'Contact phone number',
    example: '+1-234-567-8900',
    maxLength: 20
  })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  phone?: string;

  @ApiPropertyOptional({
    description: 'Institute address',
    example: '123 Education Street, Academic District'
  })
  @IsOptional()
  @IsString()
  address?: string;

  @ApiPropertyOptional({
    description: 'City',
    example: 'New York',
    maxLength: 100
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  city?: string;

  @ApiPropertyOptional({
    description: 'State or Province',
    example: 'New York',
    maxLength: 100
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  state?: string;

  @ApiPropertyOptional({
    description: 'Country',
    example: Country.SRI_LANKA,
    enum: Country
  })
  @IsOptional()
  @IsEnum(Country)
  country?: Country;

  @ApiPropertyOptional({
    description: 'District',
    example: District.COLOMBO,
    enum: District
  })
  @IsOptional()
  @IsEnum(District)
  district?: District;

  @ApiPropertyOptional({
    description: 'Province',
    example: Province.WESTERN,
    enum: Province
  })
  @IsOptional()
  @IsEnum(Province)
  province?: Province;

  @ApiPropertyOptional({
    description: 'Postal/ZIP code',
    example: '10001',
    maxLength: 20
  })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  pinCode?: string;

  // Branding and Visual Identity
  @ApiPropertyOptional({
    description: 'Institute logo relative path from /upload/verify-and-publish',
    example: 'institute-images/logo-uuid.png',
    maxLength: 255
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  logoUrl?: string;

  @ApiPropertyOptional({
    description: 'Loading GIF relative path from /upload/verify-and-publish',
    example: 'institute-images/loading-uuid.gif',
    maxLength: 255
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  loadingGifUrl?: string;

  @ApiPropertyOptional({
    description: 'Primary color code in hex format',
    example: '#1976D2',
    maxLength: 7
  })
  @IsOptional()
  @IsString()
  @Matches(/^#[0-9A-Fa-f]{6}$/, {
    message: 'Primary color must be a valid hex color code (e.g., #1976D2)'
  })
  primaryColorCode?: string;

  @ApiPropertyOptional({
    description: 'Secondary color code in hex format',
    example: '#FFC107',
    maxLength: 7
  })
  @IsOptional()
  @IsString()
  @Matches(/^#[0-9A-Fa-f]{6}$/, {
    message: 'Secondary color must be a valid hex color code (e.g., #FFC107)'
  })
  secondaryColorCode?: string;

  @ApiPropertyOptional({
    description: 'Institute gallery image relative paths (from /upload/verify-and-publish)',
    example: ['institute-images/image1-uuid.jpg', 'institute-images/image2-uuid.png'],
    type: [String]
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(10)
  imageUrls?: string[];

  @ApiPropertyOptional({
    description: 'Single institute image relative path (from /upload/verify-and-publish)',
    example: 'institute-images/institute-uuid.jpg',
    maxLength: 255
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  imageUrl?: string;

  @ApiPropertyOptional({
    description: 'Whether this is the default institute',
    example: false,
    default: false
  })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === 'true' || value === true) return true;
    if (value === 'false' || value === false) return false;
    return value;
  })
  @IsBoolean()
  isDefault?: boolean;

  // Institute Information
  @ApiPropertyOptional({
    description: 'Institute vision statement',
    example: 'To be a leading educational institution fostering innovation and excellence.'
  })
  @IsOptional()
  @IsString()
  vision?: string;

  @ApiPropertyOptional({
    description: 'Institute mission statement',
    example: 'To provide quality education and nurture future leaders through innovative teaching methods.'
  })
  @IsOptional()
  @IsString()
  mission?: string;

  // Online Presence
  @ApiPropertyOptional({
    description: 'Institute website URL (external link - full URL allowed)',
    example: 'https://cambridge-school.edu',
    maxLength: 255
  })
  @IsOptional()
  @IsUrl()
  @MaxLength(255)
  websiteUrl?: string;

  @ApiPropertyOptional({
    description: 'Facebook page URL (external link - full URL allowed)',
    example: 'https://facebook.com/cambridge-school',
    maxLength: 255
  })
  @IsOptional()
  @IsUrl()
  @MaxLength(255)
  facebookPageUrl?: string;

  @ApiPropertyOptional({
    description: 'YouTube channel URL (external link - full URL allowed)',
    example: 'https://youtube.com/c/cambridge-school',
    maxLength: 255
  })
  @IsOptional()
  @IsUrl()
  @MaxLength(255)
  youtubeChannelUrl?: string;

  // Note: imageUrl is no longer accepted as string input for security.
  // Images must be uploaded as files using multipart/form-data.
  // Use the 'image' field (deprecated) or 'logo' field for file uploads.
}
