import { IsString, IsBoolean, IsOptional, IsEnum, IsArray, IsObject } from 'class-validator';

export enum FeatureScope {
  INSTITUTE = 'INSTITUTE',
  CLASS = 'CLASS',
  SUBJECT = 'SUBJECT',
}

export enum FeatureCategory {
  ATTENDANCE = 'ATTENDANCE',
  ACADEMICS = 'ACADEMICS',
  PAYMENTS = 'PAYMENTS',
  COMMUNICATION = 'COMMUNICATION',
  BRANDING = 'BRANDING',
  TRANSPORT = 'TRANSPORT',
  SERVICES = 'SERVICES',
}

export enum FeaturePricing {
  FREE = 'FREE',
  PAID = 'PAID',
}

export enum FeatureBillingCycle {
  MONTHLY = 'MONTHLY',
  YEARLY = 'YEARLY',
  BOTH = 'BOTH',
  TIER = 'TIER',
}

export class FeatureDto {
  @IsString()
  key: string;

  @IsString()
  label: string;

  @IsString()
  description: string;

  @IsEnum(FeatureScope)
  scope: FeatureScope;

  @IsEnum(FeatureCategory)
  category: FeatureCategory;

  @IsEnum(FeaturePricing)
  pricing: FeaturePricing;

  @IsEnum(FeatureBillingCycle)
  billingCycle: FeatureBillingCycle;

  @IsBoolean()
  isCore: boolean;

  @IsArray()
  @IsString({ each: true })
  dependencies: string[];

  @IsArray()
  @IsString({ each: true })
  uiTargets: string[];

  @IsBoolean()
  isActive: boolean;
}

export class UpdateFeatureTogglesDto {
  @IsObject()
  features: Record<string, boolean>;
}
