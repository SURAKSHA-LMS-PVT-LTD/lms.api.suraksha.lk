import { IsString, IsOptional, IsBoolean, IsEnum, IsNumber, Min, MaxLength, IsArray } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { SubscriptionPlan } from '../../user/enums/subscription-plan.enum';

export class CreatePackageDefinitionDto {
  @ApiProperty({ enum: SubscriptionPlan, description: 'Subscription plan this package maps to' })
  @IsEnum(SubscriptionPlan)
  subscriptionPlan: SubscriptionPlan;

  @ApiProperty({ maxLength: 100, example: 'WhatsApp Pro' })
  @IsString()
  @MaxLength(100)
  name: string;

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiPropertyOptional({ description: 'Feature bullet points', type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  features?: string[];

  @ApiProperty({ description: 'Price in LKR', minimum: 0, example: 1500 })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  price: number;

  @ApiPropertyOptional({ description: 'Validity in days for one unit (user can buy multiple)', default: 30 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  validityDays?: number;

  @ApiPropertyOptional({ description: 'Package card image URL', maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  imageUrl?: string;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @IsNumber()
  sortOrder?: number;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdatePackageDefinitionDto {
  @ApiPropertyOptional({ maxLength: 100 })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  features?: string[];

  @ApiPropertyOptional({ minimum: 0 })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  price?: number;

  @ApiPropertyOptional({ minimum: 1, description: 'Base validity in days per unit' })
  @IsOptional()
  @IsNumber()
  @Min(1)
  validityDays?: number;

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  imageUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  sortOrder?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class PackageDefinitionResponseDto {
  id: string;
  subscriptionPlan: SubscriptionPlan;
  name: string;
  description?: string;
  features?: string[];
  price: number;
  validityDays: number;
  imageUrl?: string;
  sortOrder: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}
