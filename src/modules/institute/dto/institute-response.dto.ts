// src/modules/institute/dto/institute-response.dto.ts
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Exclude, Expose, Transform } from 'class-transformer';

export class InstituteResponseDto {
  @ApiProperty({
    description: 'Institute ID',
    example: '1'
  })
  @Expose()
  @Transform(({ value }) => value.toString())
  id: string;

  @ApiProperty({
    description: 'Institute name',
    example: 'Cambridge International School'
  })
  @Expose()
  name: string;

  @ApiPropertyOptional({
    description: 'Short name or abbreviation',
    example: 'CIS'
  })
  @Expose()
  shortName?: string;

  @ApiProperty({
    description: 'Unique institute code',
    example: 'CIS001'
  })
  @Expose()
  code: string;

  @ApiProperty({
    description: 'Institute email address',
    example: 'admin@cambridge-school.edu'
  })
  @Expose()
  email: string;

  @ApiPropertyOptional({
    description: 'Contact phone number',
    example: '+1-234-567-8900'
  })
  @Expose()
  phone?: string;

  @ApiPropertyOptional({
    description: 'System contact email for admin-level submissions (SMS payments, credit submissions, etc.)',
    example: 'admin@institute.lk'
  })
  @Expose()
  systemContactEmail?: string;

  @ApiPropertyOptional({
    description: 'System contact phone number for admin-level submissions',
    example: '+94771234567'
  })
  @Expose()
  systemContactPhoneNumber?: string;

  @ApiPropertyOptional({
    description: 'Institute address',
    example: '123 Education Street, Academic District'
  })
  @Expose()
  address?: string;

  @ApiPropertyOptional({
    description: 'City',
    example: 'New York'
  })
  @Expose()
  city?: string;

  @ApiPropertyOptional({
    description: 'State or Province',
    example: 'New York'
  })
  @Expose()
  state?: string;

  @ApiPropertyOptional({
    description: 'Country',
    example: 'United States'
  })
  @Expose()
  country?: string;

  @ApiPropertyOptional({
    description: 'District',
    example: 'Manhattan District'
  })
  @Expose()
  district?: string;

  @ApiPropertyOptional({
    description: 'Province',
    example: 'New York Province'
  })
  @Expose()
  province?: string;

  @ApiPropertyOptional({
    description: 'Postal/ZIP code',
    example: '10001'
  })
  @Expose()
  pinCode?: string;

  // Branding and Visual Identity
  @ApiPropertyOptional({
    description: 'Institute logo URL',
    example: 'https://example.com/logo.png'
  })
  @Expose()
  logoUrl?: string;

  @ApiPropertyOptional({
    description: 'Loading GIF URL for institute branding',
    example: 'https://example.com/loading.gif'
  })
  @Expose()
  loadingGifUrl?: string;

  @ApiPropertyOptional({
    description: 'Primary color code in hex format',
    example: '#1976D2'
  })
  @Expose()
  primaryColorCode?: string;

  @ApiPropertyOptional({
    description: 'Secondary color code in hex format',
    example: '#FFC107'
  })
  @Expose()
  secondaryColorCode?: string;

  @ApiPropertyOptional({
    description: 'Array of additional image URLs for institute gallery',
    type: [String],
    example: ['https://example.com/image1.jpg', 'https://example.com/image2.jpg']
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

  @ApiPropertyOptional({
    description: 'Whether this is the default institute',
    example: false
  })
  @Expose()
  isDefault?: boolean;

  // Institute Information
  @ApiPropertyOptional({
    description: 'Institute vision statement',
    example: 'To be a leading educational institution fostering innovation and excellence.'
  })
  @Expose()
  vision?: string;

  @ApiPropertyOptional({
    description: 'Institute mission statement',
    example: 'To provide quality education and nurture future leaders through innovative teaching methods.'
  })
  @Expose()
  mission?: string;

  // Online Presence
  @ApiPropertyOptional({
    description: 'Institute website URL',
    example: 'https://cambridge-school.edu'
  })
  @Expose()
  websiteUrl?: string;

  @ApiPropertyOptional({
    description: 'Facebook page URL',
    example: 'https://facebook.com/cambridge-school'
  })
  @Expose()
  facebookPageUrl?: string;

  @ApiPropertyOptional({
    description: 'YouTube channel URL',
    example: 'https://youtube.com/c/cambridge-school'
  })
  @Expose()
  youtubeChannelUrl?: string;

  @ApiProperty({
    description: 'Whether the institute is active',
    example: true
  })
  @Expose()
  isActive: boolean;

  // Multi-Tenant Fields
  @ApiPropertyOptional({ description: 'Subscription tier' })
  @Expose()
  tier?: string;

  @ApiPropertyOptional({ description: 'Custom subdomain slug' })
  @Expose()
  subdomain?: string;

  @ApiPropertyOptional({ description: 'Custom domain name' })
  @Expose()
  customDomain?: string;

  @ApiPropertyOptional({ description: 'Whether custom domain DNS is verified' })
  @Expose()
  customDomainVerified?: boolean;

  @ApiPropertyOptional({ description: 'Whether custom login page is enabled' })
  @Expose()
  customLoginEnabled?: boolean;

  @ApiPropertyOptional({ description: 'Whether institute is visible in mobile app' })
  @Expose()
  isVisibleInApp?: boolean;

  @ApiPropertyOptional({ description: 'Whether institute is visible in web selector' })
  @Expose()
  isVisibleInWebSelector?: boolean;

  @ApiProperty({
    description: 'Creation timestamp',
    example: '2024-01-15T10:30:00.000Z'
  })
  @Expose()
  createdAt: Date;

  @ApiProperty({
    description: 'Last update timestamp',
    example: '2024-01-20T14:45:00.000Z'
  })
  @Expose()
  updatedAt: Date;

  // Legacy field - keeping for backward compatibility
  @ApiPropertyOptional({
    description: 'Legacy institute image URL (use logoUrl instead)',
    example: 'https://example.com/legacy-image.png',
    deprecated: true
  })
  @Expose()
  imageUrl?: string;

  constructor(partial: Partial<InstituteResponseDto>) {
    Object.assign(this, partial);
  }
}
