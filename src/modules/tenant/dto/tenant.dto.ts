import { IsString, IsOptional, IsBoolean, IsEnum, IsObject, Matches, MaxLength, MinLength, IsUrl, IsNumber, Min, Max, IsNotEmpty, IsDateString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { InstituteTier, LoginBackgroundType } from '../../institute/enums/institute.enums';
import { TenantServiceType, TenantServicePaymentMethod, TenantServicePaymentStatus } from '../entities/tenant-billing-payment.entity';

/**
 * Reserved subdomains that cannot be claimed by institutes
 */
export const RESERVED_SUBDOMAINS = [
  'api', 'admin', 'www', 'mail', 'ftp', 'lms', 'org', 'transport',
  'static', 'cdn', 'ns1', 'ns2', 'smtp', 'imap', 'pop', 'dev',
  'staging', 'test', 'beta', 'app', 'storage', 'assets', 'media',
  'docs', 'help', 'support', 'status', 'blog', 'dashboard',
];

export class SetSubdomainDto {
  @ApiProperty({ description: 'Subdomain slug (a-z, 0-9, hyphens)', example: 'royalcollege' })
  @IsString()
  @MinLength(3, { message: 'Subdomain must be at least 3 characters' })
  @MaxLength(63, { message: 'Subdomain must be at most 63 characters' })
  @Matches(/^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/, {
    message: 'Subdomain must contain only lowercase letters, numbers, and hyphens. Cannot start or end with a hyphen.',
  })
  subdomain: string;
}

export class SetCustomDomainDto {
  @ApiProperty({ description: 'Custom domain', example: 'lms.royalcollege.lk' })
  @IsString()
  @MaxLength(255)
  @Matches(/^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$/, {
    message: 'Invalid domain format',
  })
  domain: string;
}

export class UpdateLoginBrandingDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  loginLogoUrl?: string;

  @ApiPropertyOptional({ enum: LoginBackgroundType })
  @IsOptional()
  @IsEnum(LoginBackgroundType)
  loginBackgroundType?: LoginBackgroundType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  loginBackgroundUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  loginVideoPosterUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  loginIllustrationUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  loginWelcomeTitle?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  loginWelcomeSubtitle?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  loginFooterText?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  faviconUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  customAppName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  loginCustomCss?: Record<string, string>;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  poweredByVisible?: boolean;
}

export class UpdateTierDto {
  @ApiProperty({ enum: InstituteTier })
  @IsEnum(InstituteTier)
  tier: InstituteTier;
}

export class UpdateBillingConfigDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  baseMonthlyFee?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  perUserMonthlyFee?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  perSubdomainLoginFee?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  smsMaskingMonthlyFee?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  maxFreeSubdomainLogins?: number;
}

export class InstituteBrandingResponse {
  id: string;
  name: string;
  code: string;
  tier: InstituteTier;
  logoUrl?: string;
  primaryColorCode?: string;
  secondaryColorCode?: string;
  loginLogoUrl?: string;
  loginBackgroundType: LoginBackgroundType;
  loginBackgroundUrl?: string;
  loginVideoPosterUrl?: string;
  loginIllustrationUrl?: string;
  loginWelcomeTitle?: string;
  loginWelcomeSubtitle?: string;
  loginFooterText?: string;
  loginCustomCss?: Record<string, string>;
  faviconUrl?: string;
  customAppName?: string;
  poweredByVisible: boolean;
  subdomain?: string | null;
  customDomain?: string | null;
}

export class UpdateVisibilityDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isVisibleInApp?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isVisibleInWebSelector?: boolean;
}

// ═══════════════════════════════════════════════════════════════════
// SMS Settings
// ═══════════════════════════════════════════════════════════════════

export class UpdateSmsSettingsDto {
  @ApiPropertyOptional({ description: 'Custom SMS sender name (max 11 chars). Null to use system default.' })
  @IsOptional()
  @IsString()
  @MaxLength(11, { message: 'SMS sender name cannot exceed 11 characters' })
  smsSenderName?: string | null;

  @ApiPropertyOptional({ description: 'Custom email sender address' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  emailSenderAddress?: string | null;

  @ApiPropertyOptional({ description: 'Custom email sender display name' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  emailSenderName?: string | null;
}

export class SmsSettingsResponse {
  smsSenderName: string | null;
  emailSenderAddress: string | null;
  emailSenderName: string | null;
  effectiveSmsSender: string;
  activeMasks: { maskId: string; displayName: string; isDefault: boolean; status: string }[];
  tier: InstituteTier;
}

// ═══════════════════════════════════════════════════════════════════
// Plan / Tier Info
// ═══════════════════════════════════════════════════════════════════

export class PlanInfoResponse {
  tier: InstituteTier;
  subdomain: string | null;
  customDomain: string | null;
  customDomainVerified: boolean;
  features: {
    subdomain: boolean;
    customDomain: boolean;
    loginBranding: boolean;
    videoBackground: boolean;
    hidePoweredBy: boolean;
    smsMasking: boolean;
    whiteLabel: boolean;
  };
  billing: {
    baseMonthlyFee: number;
    perUserMonthlyFee: number;
    perSubdomainLoginFee: number;
    smsMaskingMonthlyFee: number;
    maxFreeSubdomainLogins: number;
  } | null;
}

// ═══════════════════════════════════════════════════════════════════
// TENANT SERVICE PAYMENTS (institute → platform billing)
// Covers: monthly invoices, SMS/Email/WhatsApp credits,
//         storage purchases, subdomain fees, etc.
// ═══════════════════════════════════════════════════════════════════

export class SubmitTenantServicePaymentDto {
  @ApiPropertyOptional({ enum: TenantServiceType, example: TenantServiceType.CREDITS, description: 'Defaults to CREDITS (universal)' })
  @IsOptional()
  @IsEnum(TenantServiceType)
  serviceType?: TenantServiceType;

  @ApiPropertyOptional({ description: 'Human-readable description e.g. "500 SMS credits", "100 GB storage"', maxLength: 300 })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  serviceDescription?: string;

  @ApiProperty({ description: 'Payment amount', minimum: 0.01, maximum: 9999999.99 })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(9999999.99)
  paymentAmount: number;

  @ApiProperty({ enum: TenantServicePaymentMethod })
  @IsEnum(TenantServicePaymentMethod)
  paymentMethod: TenantServicePaymentMethod;

  @ApiPropertyOptional({ description: 'Bank/transaction reference number', maxLength: 100 })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  paymentReference?: string;

  @ApiPropertyOptional({ description: 'URL of uploaded payment slip/receipt', maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  paymentSlipUrl?: string;

  @ApiProperty({ description: 'Date payment was made (YYYY-MM-DD)', example: '2026-04-07' })
  @IsDateString()
  paymentDate: string;

  @ApiProperty({ description: 'Billing month this payment covers (YYYY-MM)', example: '2026-04' })
  @IsString()
  @Matches(/^\d{4}-\d{2}$/, { message: 'billingMonth must be YYYY-MM' })
  billingMonth: string;

  @ApiPropertyOptional({ description: 'Notes from the institute admin', maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;

  @ApiPropertyOptional({ description: 'Requested quantity — e.g. 500 SMS credits, 100 GB storage', minimum: 1 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  requestedQuantity?: number;

  @ApiPropertyOptional({ description: 'Service-specific metadata (e.g. { costPerCredit: 0.50, packageId: "sms-500" })' })
  @IsOptional()
  @IsObject()
  serviceMetadata?: Record<string, any>;
}

export class VerifyTenantServicePaymentDto {
  @ApiProperty({ enum: TenantServicePaymentStatus, example: TenantServicePaymentStatus.VERIFIED })
  @IsEnum(TenantServicePaymentStatus)
  status: TenantServicePaymentStatus;

  @ApiPropertyOptional({ description: 'Quantity to grant (may differ from requested). Required for credit-type services when verifying.', minimum: 1 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  grantedQuantity?: number;

  @ApiPropertyOptional({ description: 'Rejection reason (required when status=REJECTED)', maxLength: 300 })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  rejectionReason?: string;

  @ApiPropertyOptional({ description: 'Internal admin notes', maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}

export class TenantServicePaymentFilterDto {
  @ApiPropertyOptional({ description: 'Filter by service type', enum: TenantServiceType })
  @IsOptional()
  @IsEnum(TenantServiceType)
  serviceType?: TenantServiceType;

  @ApiPropertyOptional({ description: 'Filter by status', enum: TenantServicePaymentStatus })
  @IsOptional()
  @IsEnum(TenantServicePaymentStatus)
  status?: TenantServicePaymentStatus;

  @ApiPropertyOptional({ description: 'Billing month filter (YYYY-MM)' })
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}$/, { message: 'billingMonth must be YYYY-MM' })
  billingMonth?: string;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(100)
  limit?: number;
}

