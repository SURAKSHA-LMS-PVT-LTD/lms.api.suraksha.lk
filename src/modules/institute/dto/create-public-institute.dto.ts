// src/modules/institute/dto/create-public-institute.dto.ts
import { 
  IsString, 
  IsEmail, 
  IsOptional, 
  IsNotEmpty, 
  MaxLength,
  IsEnum,
  Matches
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Country } from '../../user/enums/country.enum';
import { District } from '../../user/enums/district.enum';
import { Province } from '../../user/enums/province.enum';

/**
 * 🏫 PUBLIC INSTITUTE CREATION DTO
 * 
 * Simplified DTO for public institute registration
 * 
 * KEY FEATURES:
 * - Code auto-generated on backend (not required from user)
 * - All images optional
 * - System contact phone/email required
 * - Minimal required fields
 * 
 * @version 1.0.0
 */
export class CreatePublicInstituteDto {
  // ===================================
  // REQUIRED FIELDS
  // ===================================

  @ApiProperty({
    description: '🏫 Institute name (required)',
    example: 'Cambridge International School',
    maxLength: 255
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name: string;

  @ApiProperty({
    description: '📧 Institute email address (required)',
    example: 'admin@cambridge-school.edu'
  })
  @IsEmail()
  @IsNotEmpty()
  @MaxLength(255)
  email: string;

  @ApiProperty({
    description: '📞 System contact phone number (required) - Format: +947XXXXXXXX',
    example: '+94712345678',
    maxLength: 20
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  @Matches(/^\+947[0-9]{8}$/, {
    message: 'Phone number must be in format +947XXXXXXXX (Sri Lankan mobile)'
  })
  systemContactPhoneNumber: string;

  @ApiProperty({
    description: '📧 System contact email (required) - For system notifications',
    example: 'system@cambridge-school.edu'
  })
  @IsEmail()
  @IsNotEmpty()
  @MaxLength(255)
  systemContactEmail: string;

  // ===================================
  // OPTIONAL FIELDS
  // ===================================

  @ApiPropertyOptional({
    description: '🏷️ Short name or abbreviation',
    example: 'CIS',
    maxLength: 50
  })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  shortName?: string;

  @ApiPropertyOptional({
    description: '📞 General contact phone number',
    example: '+94112345678',
    maxLength: 20
  })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  phone?: string;

  @ApiPropertyOptional({
    description: '📍 Institute address',
    example: '123 Education Street, Academic District'
  })
  @IsOptional()
  @IsString()
  address?: string;

  @ApiPropertyOptional({
    description: '🏙️ City',
    example: 'Colombo',
    maxLength: 100
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  city?: string;

  @ApiPropertyOptional({
    description: '🗺️ State or Province',
    example: 'Western Province',
    maxLength: 100
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  state?: string;

  @ApiPropertyOptional({
    description: '🌍 Country',
    example: Country.SRI_LANKA,
    enum: Country,
    default: Country.SRI_LANKA
  })
  @IsOptional()
  @IsEnum(Country)
  country?: Country;

  @ApiPropertyOptional({
    description: '📍 District',
    example: District.COLOMBO,
    enum: District
  })
  @IsOptional()
  @IsEnum(District)
  district?: District;

  @ApiPropertyOptional({
    description: '🗺️ Province',
    example: Province.WESTERN,
    enum: Province
  })
  @IsOptional()
  @IsEnum(Province)
  province?: Province;

  @ApiPropertyOptional({
    description: '📮 Postal/ZIP code',
    example: '00100',
    maxLength: 20
  })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  pinCode?: string;

  // ===================================
  // OPTIONAL IMAGES (from upload API)
  // ===================================

  @ApiPropertyOptional({
    description: '🖼️ Institute logo URL (optional) - From /public/upload/verify-and-publish',
    example: 'institute-images/logo-uuid.png',
    maxLength: 255
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  logoUrl?: string;

  @ApiPropertyOptional({
    description: '⏳ Loading GIF URL (optional) - From /public/upload/verify-and-publish',
    example: 'institute-images/loading-uuid.gif',
    maxLength: 255
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  loadingGifUrl?: string;

  @ApiPropertyOptional({
    description: '🖼️ Banner image URL (optional) - From /public/upload/verify-and-publish',
    example: 'institute-images/banner-uuid.jpg',
    maxLength: 255
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  imageUrl?: string;

  // ===================================
  // OPTIONAL METADATA
  // ===================================

  @ApiPropertyOptional({
    description: '📝 Institute description',
    example: 'Premier international school offering Cambridge curriculum'
  })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({
    description: '🌐 Institute website URL',
    example: 'https://cambridge-school.edu',
    maxLength: 255
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  websiteUrl?: string;
}
