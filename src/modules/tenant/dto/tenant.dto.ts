import { IsString, IsOptional, IsBoolean, IsEnum, IsObject, Matches, MaxLength, MinLength, IsUrl, IsNumber, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { InstituteTier, LoginBackgroundType } from '../../institute/enums/institute.enums';

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
