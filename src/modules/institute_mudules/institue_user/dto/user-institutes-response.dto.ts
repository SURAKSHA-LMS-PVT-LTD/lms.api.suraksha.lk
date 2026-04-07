import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Expose, Transform } from 'class-transformer';
import { InstituteUserStatus } from '../enums/institute-user-status.enum';
import { InstituteUserType } from '../enums/institute-user-type.enum';
import { ImageVerificationStatus } from '../enums/image-verification-status.enum';
import { InstituteType } from '../../../institute/enums/institute.enums';
import { CloudStorageService } from '../../../../common/services/cloud-storage.service';

/**
 * ✅ ENHANCED: Complete Institute DTO for /users/:userId/institutes endpoint
 * Returns full institute details matching the main institute list format
 * 
 * @version 2.0.0 - Enhanced with complete institute data
 */
export class UserInstitutesResponseDto {
  // =================== INSTITUTE CORE FIELDS ===================
  @ApiProperty({ description: 'Institute ID', example: '1' })
  @Expose()
  id: string;

  @ApiProperty({ description: 'Institute name', example: 'Greenfield Academy of Sciences' })
  @Expose()
  name: string;

  @ApiPropertyOptional({ description: 'Institute short name/abbreviation', example: 'GAS' })
  @Expose()
  shortName?: string;

  @ApiProperty({ description: 'Unique institute code', example: 'GAS102' })
  @Expose()
  code: string;

  @ApiProperty({ description: 'Institute email', example: 'contact@greenfieldacademy.org' })
  @Expose()
  email: string;

  @ApiPropertyOptional({ description: 'Institute phone', example: '+94771234567' })
  @Expose()
  phone?: string;

  @ApiPropertyOptional({ description: 'System contact email' })
  @Expose()
  systemContactEmail?: string;

  @ApiPropertyOptional({ description: 'System contact phone' })
  @Expose()
  systemContactPhoneNumber?: string;

  // =================== ADDRESS INFORMATION ===================
  @ApiPropertyOptional({ description: 'Institute address' })
  @Expose()
  address?: string;

  @ApiPropertyOptional({ description: 'City' })
  @Expose()
  city?: string;

  @ApiPropertyOptional({ description: 'State' })
  @Expose()
  state?: string;

  @ApiPropertyOptional({ description: 'Country' })
  @Expose()
  country?: string;

  @ApiPropertyOptional({ description: 'District' })
  @Expose()
  district?: string;

  @ApiPropertyOptional({ description: 'Province' })
  @Expose()
  province?: string;

  // =================== INSTITUTE TYPE & BRANDING ===================
  @ApiProperty({ description: 'Institute type', enum: InstituteType, example: 'school' })
  @Expose()
  type: InstituteType;

  @ApiPropertyOptional({ description: 'Institute logo URL' })
  @Expose()
  logoUrl?: string;

  @ApiPropertyOptional({ description: 'Loading GIF URL' })
  @Expose()
  loadingGifUrl?: string;

  @ApiPropertyOptional({ description: 'Primary color code', example: '#4CAF50' })
  @Expose()
  primaryColorCode?: string;

  @ApiPropertyOptional({ description: 'Secondary color code', example: '#E91E63' })
  @Expose()
  secondaryColorCode?: string;

  @ApiPropertyOptional({ description: 'Additional image URLs', type: [String] })
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

  @ApiPropertyOptional({ description: 'Is default institute' })
  @Expose()
  isDefault?: boolean;

  // =================== INSTITUTE INFORMATION ===================
  @ApiPropertyOptional({ description: 'Institute vision statement' })
  @Expose()
  vision?: string;

  @ApiPropertyOptional({ description: 'Institute mission statement' })
  @Expose()
  mission?: string;

  // =================== ONLINE PRESENCE ===================
  @ApiPropertyOptional({ description: 'Institute website URL' })
  @Expose()
  websiteUrl?: string;

  @ApiPropertyOptional({ description: 'Facebook page URL' })
  @Expose()
  facebookPageUrl?: string;

  @ApiPropertyOptional({ description: 'YouTube channel URL' })
  @Expose()
  youtubeChannelUrl?: string;

  // =================== STATUS & TIMESTAMPS ===================
  @ApiProperty({ description: 'Institute active status' })
  @Expose()
  isActive: boolean;

  // =================== MULTI-TENANT FIELDS ===================
  @ApiPropertyOptional({ description: 'Subscription tier' })
  @Expose()
  tier?: string;

  @ApiPropertyOptional({ description: 'Custom subdomain slug' })
  @Expose()
  subdomain?: string;

  @ApiPropertyOptional({ description: 'Creation timestamp' })
  @Expose()
  createdAt: Date | null;

  @ApiPropertyOptional({ description: 'Last update timestamp' })
  @Expose()
  updatedAt: Date | null;

  // =================== LEGACY FIELD ===================
  @ApiPropertyOptional({ description: 'Legacy image URL (deprecated)', deprecated: true })
  @Expose()
  imageUrl?: string;

  // =================== INSTITUTE USER TYPE ===================
  @ApiProperty({ 
    description: 'Institute user type/role', 
    enum: InstituteUserType,
    example: InstituteUserType.STUDENT 
  })
  @Expose()
  instituteUserType: InstituteUserType;

  constructor(partial?: Partial<UserInstitutesResponseDto>) {
    if (partial) {
      Object.assign(this, partial);
    }
  }

  /**
   * ✅ ENHANCED: Factory method to create complete institute DTO from entity
   * Maps ALL institute fields to match the main institute list format
   * @param entity - Institute user relation entity
   * @param cloudStorageService - Optional service to transform relative URLs to full URLs
   */
  static fromEntity(entity: any, cloudStorageService?: any): UserInstitutesResponseDto {
    const dto = new UserInstitutesResponseDto();
    
    if (!entity.institute) {
      return dto;
    }

    const institute = entity.institute;

    // =================== MAP ALL INSTITUTE FIELDS ===================
    dto.id = institute.id?.toString();
    dto.name = institute.name;
    dto.shortName = institute.shortName;
    dto.code = institute.code;
    dto.email = institute.email;
    dto.phone = institute.phone;
    dto.systemContactEmail = institute.systemContactEmail;
    dto.systemContactPhoneNumber = institute.systemContactPhoneNumber;

    // Address
    dto.address = institute.address;
    dto.city = institute.city;
    dto.state = institute.state;
    dto.country = institute.country;
    dto.district = institute.district;
    dto.province = institute.province;

    // Type & Branding
    dto.type = institute.type;
    
    // ✅ Transform URL fields to full URLs if cloudStorageService provided
    if (cloudStorageService) {
      dto.logoUrl = institute.logoUrl ? cloudStorageService.getFullUrl(institute.logoUrl) : institute.logoUrl;
      dto.loadingGifUrl = institute.loadingGifUrl ? cloudStorageService.getFullUrl(institute.loadingGifUrl) : institute.loadingGifUrl;
      dto.imageUrl = institute.imageUrl ? cloudStorageService.getFullUrl(institute.imageUrl) : institute.imageUrl;
    } else {
      dto.logoUrl = institute.logoUrl;
      dto.loadingGifUrl = institute.loadingGifUrl;
      dto.imageUrl = institute.imageUrl;
    }
    
    dto.primaryColorCode = institute.primaryColorCode;
    dto.secondaryColorCode = institute.secondaryColorCode;
    
    // Handle imageUrls (can be string or array) and transform each URL
    let imageUrlsArray: string[] = [];
    if (typeof institute.imageUrls === 'string') {
      try {
        imageUrlsArray = JSON.parse(institute.imageUrls);
      } catch {
        imageUrlsArray = [];
      }
    } else {
      imageUrlsArray = institute.imageUrls || [];
    }
    
    // ✅ Transform each URL in the array to full URL using OOP helper
    if (cloudStorageService) {
      dto.imageUrls = cloudStorageService.getFullUrls(imageUrlsArray);
    } else {
      dto.imageUrls = imageUrlsArray;
    }
    
    dto.isDefault = institute.isDefault;

    // Information
    dto.vision = institute.vision;
    dto.mission = institute.mission;

    // Online presence
    dto.websiteUrl = institute.websiteUrl;
    dto.facebookPageUrl = institute.facebookPageUrl;
    dto.youtubeChannelUrl = institute.youtubeChannelUrl;

    // Status & timestamps
    dto.isActive = institute.isActive;
    dto.createdAt = institute.createdAt || null;
    dto.updatedAt = institute.updatedAt || null;

    // Multi-tenant
    dto.tier = institute.tier || 'FREE';
    dto.subdomain = institute.subdomain || undefined;

    // =================== INSTITUTE USER TYPE ===================
    dto.instituteUserType = entity.instituteUserType;

    return dto;
  }
}

/**
 * Paginated response for user institutes
 */
export class PaginatedUserInstitutesResponseDto {
  @ApiProperty({ type: [UserInstitutesResponseDto] })
  data: UserInstitutesResponseDto[];

  @ApiProperty({
    description: 'Pagination metadata',
    type: 'object',
    properties: {
      total: { type: 'number', description: 'Total number of institutes' },
      page: { type: 'number', description: 'Current page number' },
      limit: { type: 'number', description: 'Items per page' },
      totalPages: { type: 'number', description: 'Total number of pages' }
    }
  })
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}
