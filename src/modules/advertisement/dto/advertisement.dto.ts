import { IsString, IsOptional, IsNotEmpty, IsEnum, IsArray, IsNumber, IsBoolean, IsDateString, ValidateNested, Min, Max, IsDate } from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { UserType } from '../../user/enums/user-type.enum';
import { Gender } from '../../user/enums/gender.enum';
import { SubscriptionPlan } from '../../user/enums/subscription-plan.enum';
import { Province } from '../../user/enums/province.enum';
import { District } from '../../user/enums/district.enum';
import { Occupation } from '../../user/enums/occupation.enum';

export enum MediaType {
  IMAGE = 'image',
  VIDEO = 'video', 
  AUDIO = 'audio',
  PDF = 'pdf'
}

export enum SupportivePlatform {
  SMS = 'sms',
  WHATSAPP = 'whatsapp',
  TELEGRAM = 'telegram',
  EMAIL = 'email',
  MOBILE_PUSH = 'mobile-push',
  WEB_PUSH = 'web-push'
}

export enum SendingMode {
  SMS = 'sms',
  EMAIL = 'email',
  WHATSAPP = 'whatsapp',
  TELEGRAM = 'telegram',
  PUSH_WEB = 'push-web',
  PUSH_MOBILE = 'push-mobile'
}

export class CreateAdvertisementDto {
  @ApiProperty({ 
    description: 'Advertisement title',
    example: 'Premium Education Services'
  })
  @IsString()
  @IsNotEmpty()
  title: string;

  @ApiProperty({ 
    description: 'Access key for advertisement authentication',
    example: 'ADV-2025-XYZ123'
  })
  @IsString()
  @IsNotEmpty()
  accessKey: string;

  @ApiPropertyOptional({ 
    description: 'Advertisement description',
    example: 'Professional education for your child bright future'
  })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({ 
    description: 'URL to the advertisement media',
    example: 'https://example.com/ad.jpg'
  })
  @IsString()
  @IsOptional()
  mediaUrl?: string;

  @ApiPropertyOptional({ 
    description: 'Landing URL where users will be redirected when clicking the ad',
    example: 'https://example.com/register'
  })
  @IsString()
  @IsOptional()
  landingUrl?: string;

  @ApiPropertyOptional({ 
    description: 'Sending URL - Direct URL for the advertisement content (max 500 chars)',
    example: 'https://example.com/campaign/summer-2025'
  })
  @IsString()
  @IsOptional()
  sendingUrl?: string;

  @ApiPropertyOptional({ 
    enum: SupportivePlatform,
    isArray: true,
    description: 'Platforms where this advertisement can be sent (SMS, WhatsApp, Telegram, Email, Mobile Push, Web Push)',
    example: [SupportivePlatform.SMS, SupportivePlatform.WHATSAPP, SupportivePlatform.EMAIL]
  })
  @IsArray()
  @IsOptional()
  @IsEnum(SupportivePlatform, { each: true })
  supportivePlatforms?: SupportivePlatform[];

  @ApiPropertyOptional({ 
    enum: SendingMode,
    isArray: true,
    description: 'Delivery channels to use when actually sending this advertisement (sms, email, whatsapp, telegram, push-web, push-mobile)',
    example: [SendingMode.SMS, SendingMode.WHATSAPP, SendingMode.EMAIL]
  })
  @IsArray()
  @IsOptional()
  @IsEnum(SendingMode, { each: true })
  modeOfSending?: SendingMode[];

  @ApiProperty({ 
    enum: MediaType, 
    description: 'Type of advertisement media',
    example: MediaType.IMAGE,
    default: MediaType.IMAGE
  })
  @IsEnum(MediaType)
  @IsOptional()
  mediaType?: MediaType = MediaType.IMAGE;

  // Geographic Targeting
  @ApiPropertyOptional({ 
    type: [String], 
    description: 'Array of institute IDs to target',
    example: ['INST001', 'INST002']
  })
  @IsArray()
  @IsOptional()
  @IsString({ each: true })
  targetInstituteIds?: string[];

  @ApiPropertyOptional({ 
    type: [String], 
    description: 'Array of cities to target',
    example: ['Colombo', 'Kandy', 'Galle']
  })
  @IsArray()
  @IsOptional()
  @IsString({ each: true })
  targetCities?: string[];

  @ApiPropertyOptional({ 
    enum: Province,
    isArray: true,
    description: 'Array of provinces to target',
    example: [Province.WESTERN, Province.CENTRAL, Province.SOUTHERN]
  })
  @IsArray()
  @IsOptional()
  @IsEnum(Province, { each: true })
  targetProvinces?: Province[];

  @ApiPropertyOptional({ 
    enum: District,
    isArray: true,
    description: 'Array of districts to target',
    example: [District.COLOMBO, District.KANDY, District.GALLE]
  })
  @IsArray()
  @IsOptional()
  @IsEnum(District, { each: true })
  targetDistricts?: District[];

  // Demographic Targeting
  @ApiPropertyOptional({ 
    description: 'Minimum birth year for targeting',
    example: 2005,
    minimum: 1950
  })
  @IsNumber()
  @Min(1950)
  @IsOptional()
  minBornYear?: number;

  @ApiPropertyOptional({ 
    description: 'Maximum birth year for targeting',
    example: 2010,
    minimum: 1950
  })
  @IsNumber()
  @Min(1950)
  @IsOptional()
  maxBornYear?: number;

  @ApiPropertyOptional({ 
    enum: Gender,
    isArray: true,
    description: 'Array of genders to target',
    example: [Gender.MALE, Gender.FEMALE]
  })
  @IsArray()
  @IsEnum(Gender, { each: true })
  @IsOptional()
  targetGenders?: Gender[];

  @ApiPropertyOptional({ 
    enum: Occupation,
    isArray: true,
    description: 'Array of occupations to target',
    example: [Occupation.TEACHER, Occupation.ENGINEER, Occupation.DOCTOR]
  })
  @IsArray()
  @IsOptional()
  @IsEnum(Occupation, { each: true })
  targetOccupations?: Occupation[];

  // User Type & Subscription Targeting
  @ApiPropertyOptional({
    enum: UserType,
    isArray: true,
    description: 'Array of user types to target',
    example: [UserType.USER, UserType.USER]
  })
  @IsArray()
  @IsEnum(UserType, { each: true })
  @IsOptional()
  targetUserTypes?: UserType[];

  @ApiPropertyOptional({
    enum: SubscriptionPlan,
    isArray: true,
    description: 'Array of subscription plans to target',
    example: [SubscriptionPlan.FREE, SubscriptionPlan.WHATSAPP]
  })
  @IsArray()
  @IsEnum(SubscriptionPlan, { each: true })
  @IsOptional()
  targetSubscriptionPlans?: SubscriptionPlan[];

  // Campaign Settings
  @ApiPropertyOptional({ 
    description: 'Display duration in seconds',
    example: 30,
    default: 30
  })
  @IsNumber()
  @Min(1)
  @IsOptional()
  displayDuration?: number = 30;

  @ApiProperty({ 
    description: 'Advertisement priority (1-10)',
    example: 5,
    minimum: 1,
    maximum: 10
  })
  @IsNumber()
  @Min(1)
  @Max(10)
  @IsOptional()
  priority?: number = 1;

  @ApiPropertyOptional({ 
    description: 'Whether the advertisement is active',
    default: true
  })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean = true;

  @ApiProperty({ 
    description: 'Advertisement start date',
    example: '2025-01-01T00:00:00Z'
  })
  @IsDateString()
  @IsNotEmpty()
  startDate: string;

  @ApiProperty({ 
    description: 'Advertisement end date',
    example: '2025-12-31T23:59:59Z'
  })
  @IsDateString()
  @IsNotEmpty()
  endDate: string;

  @ApiProperty({ 
    description: 'Maximum number of sendings allowed',
    example: 1000,
    minimum: 1
  })
  @IsNumber()
  @Min(1)
  @IsOptional()
  maxSendings?: number = 1000;

  // 🎯 CASCADE TO PARENTS FEATURE
  @ApiPropertyOptional({ 
    description: 'When true, if ad matches student, automatically send SAME ad to ALL parents (father, mother, guardian). Example: Grade 10 girls ad matches female student → all her parents get this ad too',
    example: false,
    default: false
  })
  @IsBoolean()
  @IsOptional()
  cascadeToParents?: boolean = false;

  // Budget & Analytics
  @ApiPropertyOptional({ 
    description: 'Advertisement budget',
    example: 5000.00
  })
  @IsNumber()
  @Min(0)
  @IsOptional()
  budget?: number;

  @ApiPropertyOptional({ 
    description: 'Cost per click',
    example: 0.50
  })
  @IsNumber()
  @Min(0)
  @IsOptional()
  costPerClick?: number;

  @ApiPropertyOptional({ 
    description: 'Cost per impression',
    example: 0.05
  })
  @IsNumber()
  @Min(0)
  @IsOptional()
  costPerImpression?: number;

  // Administration
  @ApiPropertyOptional({ 
    description: 'User ID who created the advertisement',
    example: 'user123'
  })
  @IsString()
  @IsOptional()
  createdBy?: string;
}

export class UpdateAdvertisementDto {
  @ApiPropertyOptional({ description: 'Advertisement title' })
  @IsString()
  @IsOptional()
  title?: string;

  @ApiPropertyOptional({ description: 'Access key for advertisement authentication' })
  @IsString()
  @IsOptional()
  accessKey?: string;

  @ApiPropertyOptional({ description: 'Advertisement description' })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({ description: 'URL to the advertisement media' })
  @IsString()
  @IsOptional()
  mediaUrl?: string;

  @ApiPropertyOptional({ description: 'Landing URL for click-through' })
  @IsString()
  @IsOptional()
  landingUrl?: string;

  @ApiPropertyOptional({ description: 'Sending URL - Direct URL for the advertisement content' })
  @IsString()
  @IsOptional()
  sendingUrl?: string;

  @ApiPropertyOptional({ 
    enum: SupportivePlatform,
    isArray: true,
    description: 'Platforms where this advertisement can be sent'
  })
  @IsArray()
  @IsOptional()
  @IsEnum(SupportivePlatform, { each: true })
  supportivePlatforms?: SupportivePlatform[];

  @ApiPropertyOptional({ 
    enum: SendingMode,
    isArray: true,
    description: 'Delivery channels to use when actually sending this advertisement'
  })
  @IsArray()
  @IsOptional()
  @IsEnum(SendingMode, { each: true })
  modeOfSending?: SendingMode[];

  @ApiPropertyOptional({ enum: MediaType, description: 'Type of advertisement media' })
  @IsEnum(MediaType)
  @IsOptional()
  mediaType?: MediaType;

  @ApiPropertyOptional({ type: [String], description: 'Array of institute IDs to target' })
  @IsArray()
  @IsOptional()
  @IsString({ each: true })
  targetInstituteIds?: string[];

  @ApiPropertyOptional({ type: [String], description: 'Array of cities to target' })
  @IsArray()
  @IsOptional()
  @IsString({ each: true })
  targetCities?: string[];

  @ApiPropertyOptional({ enum: Province, isArray: true, description: 'Array of provinces to target' })
  @IsArray()
  @IsOptional()
  @IsEnum(Province, { each: true })
  targetProvinces?: Province[];

  @ApiPropertyOptional({ enum: District, isArray: true, description: 'Array of districts to target' })
  @IsArray()
  @IsOptional()
  @IsEnum(District, { each: true })
  targetDistricts?: District[];

  @ApiPropertyOptional({ description: 'Minimum birth year for targeting' })
  @IsNumber()
  @Min(1950)
  @IsOptional()
  minBornYear?: number;

  @ApiPropertyOptional({ description: 'Maximum birth year for targeting' })
  @IsNumber()
  @Min(1950)
  @IsOptional()
  maxBornYear?: number;

  @ApiPropertyOptional({ enum: Gender, isArray: true, description: 'Array of genders to target' })
  @IsArray()
  @IsEnum(Gender, { each: true })
  @IsOptional()
  targetGenders?: Gender[];

  @ApiPropertyOptional({ enum: Occupation, isArray: true, description: 'Array of occupations to target' })
  @IsArray()
  @IsOptional()
  @IsEnum(Occupation, { each: true })
  targetOccupations?: Occupation[];

  @ApiPropertyOptional({ enum: UserType, isArray: true, description: 'Array of user types to target' })
  @IsArray()
  @IsEnum(UserType, { each: true })
  @IsOptional()
  targetUserTypes?: UserType[];

  @ApiPropertyOptional({ enum: SubscriptionPlan, isArray: true, description: 'Array of subscription plans to target' })
  @IsArray()
  @IsEnum(SubscriptionPlan, { each: true })
  @IsOptional()
  targetSubscriptionPlans?: SubscriptionPlan[];

  @ApiPropertyOptional({ description: 'Display duration in seconds' })
  @IsNumber()
  @Min(1)
  @IsOptional()
  displayDuration?: number;

  @ApiPropertyOptional({ description: 'Advertisement priority (1-10)', minimum: 1, maximum: 10 })
  @IsNumber()
  @Min(1)
  @Max(10)
  @IsOptional()
  priority?: number;

  @ApiPropertyOptional({ description: 'Whether the advertisement is active' })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @ApiPropertyOptional({ description: 'Advertisement start date' })
  @IsDateString()
  @IsOptional()
  startDate?: string;

  @ApiPropertyOptional({ description: 'Advertisement end date' })
  @IsDateString()
  @IsOptional()
  endDate?: string;

  @ApiPropertyOptional({ description: 'Maximum number of sendings allowed' })
  @IsNumber()
  @Min(1)
  @IsOptional()
  maxSendings?: number;

  @ApiPropertyOptional({ 
    description: 'Cascade advertisement to all parents when it matches student',
    example: true
  })
  @IsBoolean()
  @IsOptional()
  cascadeToParents?: boolean;

  @ApiPropertyOptional({ description: 'Advertisement budget' })
  @IsNumber()
  @Min(0)
  @IsOptional()
  budget?: number;

  @ApiPropertyOptional({ description: 'Cost per click' })
  @IsNumber()
  @Min(0)
  @IsOptional()
  costPerClick?: number;

  @ApiPropertyOptional({ description: 'Cost per impression' })
  @IsNumber()
  @Min(0)
  @IsOptional()
  costPerImpression?: number;
}

export class UserProfileDto {
  @ApiProperty({ description: 'User ID' })
  @IsString()
  @IsNotEmpty()
  userId: string;

  @ApiProperty({ enum: UserType, description: 'User type' })
  @IsEnum(UserType)
  @IsNotEmpty()
  userType: UserType;

  @ApiProperty({ enum: SubscriptionPlan, description: 'Subscription plan' })
  @IsEnum(SubscriptionPlan)
  @IsNotEmpty()
  subscriptionPlan: SubscriptionPlan;

  @ApiPropertyOptional({ description: 'Institute ID' })
  @IsString()
  @IsOptional()
  instituteId?: string;

  @ApiPropertyOptional({ description: 'City' })
  @IsString()
  @IsOptional()
  city?: string;

  @ApiPropertyOptional({ enum: Province, description: 'Province' })
  @IsEnum(Province)
  @IsOptional()
  province?: Province;

  @ApiPropertyOptional({ enum: District, description: 'District' })
  @IsEnum(District)
  @IsOptional()
  district?: District;

  @ApiPropertyOptional({ description: 'Birth year' })
  @IsNumber()
  @IsOptional()
  birthYear?: number;

  @ApiPropertyOptional({ enum: Gender, description: 'Gender' })
  @IsEnum(Gender)
  @IsOptional()
  gender?: Gender;

  @ApiPropertyOptional({ enum: Occupation, description: 'Occupation' })
  @IsEnum(Occupation)
  @IsOptional()
  occupation?: Occupation;
}

// Legacy compatibility exports
export enum AdvertisementType {
  IMAGE = 'image',
  VIDEO = 'video',
  PDF = 'pdf',
  AUDIO = 'audio',
  DOCUMENT = 'document',
}

export enum TargetScope {
  ALL = 'all',
  INSTITUTE = 'institute',
  CUSTOM = 'custom',
}

// ========================================
// RESPONSE DTOs - Consistent API Responses
// ========================================

export class AdvertisementResponseDto {
  @ApiProperty({ description: 'Advertisement ID' })
  id: string;

  @ApiProperty({ description: 'Advertisement title' })
  title: string;

  @ApiProperty({ description: 'Access key for advertisement authentication' })
  accessKey: string;

  @ApiProperty({ description: 'Advertisement description/content', required: false })
  description?: string;

  @ApiProperty({ description: 'Media URL', required: false })
  mediaUrl?: string;

  @ApiProperty({ description: 'Landing URL for click-through', required: false })
  landingUrl?: string;

  @ApiProperty({ description: 'Sending URL - Direct URL for advertisement content', required: false })
  sendingUrl?: string;

  @ApiProperty({ 
    enum: SupportivePlatform, 
    isArray: true, 
    description: 'Supported platforms for this advertisement' 
  })
  supportivePlatforms: SupportivePlatform[];

  @ApiProperty({ 
    enum: SendingMode, 
    isArray: true, 
    description: 'Delivery channels used when sending this advertisement' 
  })
  modeOfSending: SendingMode[];

  @ApiProperty({ enum: MediaType, description: 'Media type' })
  mediaType: MediaType;

  @ApiProperty({ description: 'Target institute IDs', type: [String] })
  targetInstituteIds: string[];

  @ApiProperty({ description: 'Target cities', type: [String] })
  targetCities: string[];

  @ApiProperty({ enum: Province, isArray: true, description: 'Target provinces' })
  targetProvinces: Province[];

  @ApiProperty({ enum: District, isArray: true, description: 'Target districts' })
  targetDistricts: District[];

  @ApiProperty({ description: 'Minimum birth year for targeting', required: false })
  minBornYear?: number;

  @ApiProperty({ description: 'Maximum birth year for targeting', required: false })
  maxBornYear?: number;

  @ApiProperty({ enum: Gender, isArray: true, description: 'Target genders' })
  targetGenders: Gender[];

  @ApiProperty({ enum: Occupation, isArray: true, description: 'Target occupations' })
  targetOccupations: Occupation[];

  @ApiProperty({ enum: UserType, isArray: true, description: 'Target user types' })
  targetUserTypes: UserType[];

  @ApiProperty({ enum: SubscriptionPlan, isArray: true, description: 'Target subscription plans' })
  targetSubscriptionPlans: SubscriptionPlan[];

  @ApiProperty({ description: 'Display duration in seconds', default: 30 })
  displayDuration: number;

  @ApiProperty({ description: 'Advertisement priority (1-10)', minimum: 1, maximum: 10 })
  priority: number;

  @ApiProperty({ description: 'Whether advertisement is active' })
  isActive: boolean;

  @ApiProperty({ description: 'Maximum number of sendings', default: 1000 })
  maxSendings: number;

  @ApiProperty({ 
    description: 'Cascade to parents: when ad matches student, send SAME ad to all parents too', 
    default: false 
  })
  cascadeToParents: boolean;

  @ApiProperty({ description: 'Campaign start date' })
  startDate: Date;

  @ApiProperty({ description: 'Campaign end date' })
  endDate: Date;

  @ApiProperty({ description: 'Number of impressions', default: 0 })
  impressions: number;

  @ApiProperty({ description: 'Number of clicks', default: 0 })
  clicks: number;

  @ApiProperty({ description: 'Number of sends', default: 0 })
  sends: number;

  @ApiProperty({ description: 'Cost per click', required: false })
  costPerClick?: number;

  @ApiProperty({ description: 'Cost per impression', required: false })
  costPerImpression?: number;

  @ApiProperty({ description: 'Created by user/system', required: false })
  createdBy?: string;

  @ApiProperty({ description: 'Creation timestamp' })
  createdAt: Date;

  @ApiProperty({ description: 'Last update timestamp' })
  updatedAt: Date;
}

export class AdvertisementListResponseDto {
  @ApiProperty({ description: 'List of advertisements', type: [AdvertisementResponseDto] })
  advertisements: AdvertisementResponseDto[];

  @ApiProperty({ description: 'Total number of advertisements' })
  total: number;

  @ApiProperty({ description: 'Total number of pages' })
  totalPages: number;

  @ApiProperty({ description: 'Current page number' })
  currentPage: number;

  @ApiProperty({ description: 'Number of items per page' })
  limit: number;
}

export class AdvertisementMatchResponseDto {
  @ApiProperty({ description: 'Matched advertisement', type: AdvertisementResponseDto })
  advertisement: AdvertisementResponseDto;

  @ApiProperty({ description: 'Match score (0-100)' })
  matchScore: number;

  @ApiProperty({ description: 'Reasons for the match', type: [String] })
  matchReasons: string[];
}

export class AdvertisementMatchListResponseDto {
  @ApiProperty({ description: 'List of matched advertisements', type: [AdvertisementMatchResponseDto] })
  matches: AdvertisementMatchResponseDto[];

  @ApiProperty({ description: 'Total number of potential matches' })
  totalMatches: number;

  @ApiProperty({ description: 'User profile used for matching' })
  userProfile: any;
}



