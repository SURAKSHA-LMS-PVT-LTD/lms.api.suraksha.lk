import { IsString, IsNumber, IsEnum, IsOptional, IsArray, IsDateString, Min, Max } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class TrackRevenueDto {
  @ApiProperty({ description: 'Service ID to track revenue for' })
  @IsString()
  serviceId: string;

  @ApiProperty({ enum: ['impression', 'click', 'booking'], description: 'Type of revenue event' })
  @IsEnum(['impression', 'click', 'booking'])
  revenueType: 'impression' | 'click' | 'booking';

  @ApiProperty({ description: 'Revenue amount', minimum: 0 })
  @IsNumber()
  @Min(0)
  amount: number;
}

export class UpdateDynamicPricingDto {
  @ApiProperty({ enum: ['low', 'medium', 'high'], description: 'Current demand level' })
  @IsEnum(['low', 'medium', 'high'])
  demandLevel: 'low' | 'medium' | 'high';
}

export class UpdateAdvertisingBidDto {
  @ApiProperty({ description: 'Bid amount for premium placement', minimum: 0 })
  @IsNumber()
  @Min(0)
  bidAmount: number;
}

export class SetCompetitorBlockingDto {
  @ApiProperty({ description: 'Array of competitor service IDs to block', type: [String] })
  @IsArray()
  @IsString({ each: true })
  competitorIds: string[];
}

export class CreatePromotionalOfferDto {
  @ApiPropertyOptional({ description: 'Discount percentage', minimum: 0, maximum: 100 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  discountPercentage?: number;

  @ApiPropertyOptional({ description: 'List of free features to include', type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  freeFeatures?: string[];

  @ApiPropertyOptional({ description: 'Special promotional message' })
  @IsOptional()
  @IsString()
  specialMessage?: string;

  @ApiPropertyOptional({ description: 'Offer valid until date (ISO 8601)' })
  @IsOptional()
  @IsDateString()
  validUntil?: string;

  @ApiPropertyOptional({ description: 'Target student group IDs', type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  targetStudentGroups?: string[];
}

export class UpdateSponsorshipTierDto {
  @ApiProperty({ enum: ['none', 'bronze', 'silver', 'gold', 'platinum'], description: 'Sponsorship tier level' })
  @IsEnum(['none', 'bronze', 'silver', 'gold', 'platinum'])
  tier: 'none' | 'bronze' | 'silver' | 'gold' | 'platinum';
}
