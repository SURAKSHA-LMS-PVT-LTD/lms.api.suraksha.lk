import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Req,
  HttpCode,
  HttpStatus,
  BadRequestException,
} from '@nestjs/common';
import { getCurrentSriLankaTime } from '../../common/utils/timezone.util';

import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { FlexibleAccessGuard } from '../../auth/guards/flexible-access.guard';
import { RequireAnyOfRoles } from '../../auth/decorators/flexible-access.decorator';
import { UserType } from '../user/enums/user-type.enum';
import { EnhancedAdvertisingService } from './services/enhanced-advertising.service';

@Controller('enhanced-advertising')
@UseGuards(JwtAuthGuard)
export class EnhancedAdvertisingController {
  constructor(
    private readonly enhancedAdvertisingService: EnhancedAdvertisingService
  ) {}

  /**
   * 🎯 STUDENT ALLOCATION CONTROL
   * GET /enhanced-advertising/student-allocations/:studentId
   * Controls which transport services students can see based on advertiser payments
   */
  @Get('student-allocations/:studentId')
  @UseGuards(JwtAuthGuard, FlexibleAccessGuard)
  @RequireAnyOfRoles({ global: [UserType.SUPERADMIN] })
  async getStudentAllocations(
    @Param('studentId') studentId: string,
    @Query('location') location?: string,
    @Req() req?: any,
  ) {
    try {
      // Access restricted to SUPERADMIN only

      const allocations = await this.enhancedAdvertisingService.controlStudentAllocations(
        studentId,
        location
      );

      return {
        success: true,
        message: 'Student transport allocations retrieved successfully',
        data: {
          studentId,
          location,
          availableServices: allocations,
          totalServices: allocations.length,
          premiumServices: allocations.filter(s => s.isPremium).length,
        },
      };
    } catch (error) {
      return {
        success: false,
        message: error.message || 'Failed to get student allocations',
        data: null,
      };
    }
  }

  /**
   * 💰 REVENUE TRACKING
   * POST /enhanced-advertising/track-revenue
   * Tracks advertising revenue for impressions, clicks, and bookings
   */
  @Post('track-revenue')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard, FlexibleAccessGuard)
  @RequireAnyOfRoles({ global: [UserType.SUPERADMIN] })
  async trackRevenue(
    @Body() body: {
      serviceId: string;
      revenueType: 'impression' | 'click' | 'booking';
      amount: number;
    }
  ) {
    try {
      await this.enhancedAdvertisingService.trackRevenue(
        body.serviceId,
        body.revenueType,
        body.amount
      );

      return {
        success: true,
        message: `${body.revenueType} revenue tracked successfully`,
        data: {
          serviceId: body.serviceId,
          revenueType: body.revenueType,
          amount: body.amount,
          timestamp: getCurrentSriLankaTime(),
        },
      };
    } catch (error) {
      return {
        success: false,
        message: error.message || 'Failed to track revenue',
        data: null,
      };
    }
  }

  /**
   * 📊 ADVERTISING ANALYTICS DASHBOARD
   * GET /enhanced-advertising/analytics
   * Provides comprehensive advertising performance metrics
   */
  @Get('analytics')
  @UseGuards(JwtAuthGuard, FlexibleAccessGuard)
  @RequireAnyOfRoles({ global: [UserType.SUPERADMIN] })
  async getAdvertisingAnalytics(
    @Query('timeframe') timeframe: 'daily' | 'weekly' | 'monthly' = 'monthly'
  ) {
    try {
      const analytics = await this.enhancedAdvertisingService.getAdvertisingAnalytics(timeframe);

      return {
        success: true,
        message: 'Advertising analytics retrieved successfully',
        data: {
          timeframe,
          metrics: analytics,
          generatedAt: getCurrentSriLankaTime(),
        },
      };
    } catch (error) {
      return {
        success: false,
        message: error.message || 'Failed to get advertising analytics',
        data: null,
      };
    }
  }

  /**
   * 🔄 DYNAMIC PRICING MANAGEMENT
   * PUT /enhanced-advertising/dynamic-pricing/:serviceId
   * Updates dynamic pricing based on demand levels
   */
  @Put('dynamic-pricing/:serviceId')
  @UseGuards(JwtAuthGuard, FlexibleAccessGuard)
  @RequireAnyOfRoles({ global: [UserType.SUPERADMIN] })
  async updateDynamicPricing(
    @Param('serviceId') serviceId: string,
    @Body() body: { demandLevel: 'low' | 'medium' | 'high' }
  ) {
    try {
      await this.enhancedAdvertisingService.updateDynamicPricing(
        serviceId,
        body.demandLevel
      );

      return {
        success: true,
        message: 'Dynamic pricing updated successfully',
        data: {
          serviceId,
          demandLevel: body.demandLevel,
          updatedAt: getCurrentSriLankaTime(),
        },
      };
    } catch (error) {
      return {
        success: false,
        message: error.message || 'Failed to update dynamic pricing',
        data: null,
      };
    }
  }

  /**
   * 🎯 PREMIUM PLACEMENT BIDDING
   * PUT /enhanced-advertising/bid/:serviceId
   * Updates advertising bid for premium placement
   */
  @Put('bid/:serviceId')
  @UseGuards(JwtAuthGuard, FlexibleAccessGuard)
  @RequireAnyOfRoles({ global: [UserType.SUPERADMIN] })
  async updateAdvertisingBid(
    @Param('serviceId') serviceId: string,
    @Body() body: { bidAmount: number }
  ) {
    try {
      await this.enhancedAdvertisingService.updateAdvertisingBid(
        serviceId,
        body.bidAmount
      );

      return {
        success: true,
        message: 'Advertising bid updated successfully',
        data: {
          serviceId,
          bidAmount: body.bidAmount,
          isPremium: body.bidAmount > 0,
          updatedAt: getCurrentSriLankaTime(),
        },
      };
    } catch (error) {
      return {
        success: false,
        message: error.message || 'Failed to update advertising bid',
        data: null,
      };
    }
  }

  /**
   * 🚫 COMPETITOR BLOCKING SYSTEM
   * PUT /enhanced-advertising/competitor-blocking/:serviceId
   * Sets competitor blocking for exclusive advertising
   */
  @Put('competitor-blocking/:serviceId')
  @UseGuards(JwtAuthGuard, FlexibleAccessGuard)
  @RequireAnyOfRoles({ global: [UserType.SUPERADMIN] })
  async setCompetitorBlocking(
    @Param('serviceId') serviceId: string,
    @Body() body: { competitorIds: string[] }
  ) {
    try {
      await this.enhancedAdvertisingService.setCompetitorBlocking(
        serviceId,
        body.competitorIds
      );

      return {
        success: true,
        message: 'Competitor blocking updated successfully',
        data: {
          serviceId,
          blockedCompetitors: body.competitorIds.length,
          competitorIds: body.competitorIds,
          updatedAt: getCurrentSriLankaTime(),
        },
      };
    } catch (error) {
      return {
        success: false,
        message: error.message || 'Failed to set competitor blocking',
        data: null,
      };
    }
  }

  /**
   * 🎁 PROMOTIONAL OFFERS MANAGEMENT
   * POST /enhanced-advertising/promotional-offer/:serviceId
   * Creates promotional offers for transport services
   */
  @Post('promotional-offer/:serviceId')
  @UseGuards(JwtAuthGuard, FlexibleAccessGuard)
  @RequireAnyOfRoles({ global: [UserType.SUPERADMIN] })
  async createPromotionalOffer(
    @Param('serviceId') serviceId: string,
    @Body() body: {
      discountPercentage?: number;
      freeFeatures?: string[];
      specialMessage?: string;
      validUntil?: string;
      targetStudentGroups?: string[];
    }
  ) {
    try {
      const offer = {
        ...body,
        validUntil: body.validUntil ? new Date(body.validUntil) : undefined,
      };

      await this.enhancedAdvertisingService.createPromotionalOffer(serviceId, offer);

      return {
        success: true,
        message: 'Promotional offer created successfully',
        data: {
          serviceId,
          offer,
          createdAt: getCurrentSriLankaTime(),
        },
      };
    } catch (error) {
      return {
        success: false,
        message: error.message || 'Failed to create promotional offer',
        data: null,
      };
    }
  }

  /**
   * 👑 SPONSORSHIP TIER MANAGEMENT
   * PUT /enhanced-advertising/sponsorship-tier/:serviceId
   * Updates sponsorship tier for enhanced visibility
   */
  @Put('sponsorship-tier/:serviceId')
  @UseGuards(JwtAuthGuard, FlexibleAccessGuard)
  @RequireAnyOfRoles({ global: [UserType.SUPERADMIN] })
  async updateSponsorshipTier(
    @Param('serviceId') serviceId: string,
    @Body() body: { tier: 'none' | 'bronze' | 'silver' | 'gold' | 'platinum' }
  ) {
    try {
      await this.enhancedAdvertisingService.updateSponsorshipTier(
        serviceId,
        body.tier
      );

      const tierBenefits = {
        none: 'Standard listing',
        bronze: 'Enhanced visibility + 10% discount on ads',
        silver: 'Priority placement + 15% discount + promotional features',
        gold: 'Premium placement + 20% discount + exclusive offers + analytics',
        platinum: 'Top placement + 25% discount + full competitor blocking + AI recommendations',
      };

      return {
        success: true,
        message: 'Sponsorship tier updated successfully',
        data: {
          serviceId,
          tier: body.tier,
          benefits: tierBenefits[body.tier],
          updatedAt: getCurrentSriLankaTime(),
        },
      };
    } catch (error) {
      return {
        success: false,
        message: error.message || 'Failed to update sponsorship tier',
        data: null,
      };
    }
  }

  /**
   * 📈 QUICK ANALYTICS SUMMARY
   * GET /enhanced-advertising/summary
   * Provides quick overview of advertising performance
   */
  @Get('summary')
  @UseGuards(JwtAuthGuard, FlexibleAccessGuard)
  @RequireAnyOfRoles({ global: [UserType.SUPERADMIN] })
  async getAdvertisingSummary() {
    try {
      const analytics = await this.enhancedAdvertisingService.getAdvertisingAnalytics('monthly');

      const summary = {
        totalRevenue: analytics.totalRevenue,
        totalServices: Object.keys(analytics.revenueByService).length,
        activeAds: analytics.topPerformingAds.length,
        averageConversion: 0, // Simplified for now since conversionRates is empty
        topPerformer: analytics.topPerformingAds[0] || null,
      };

      return {
        success: true,
        message: 'Advertising summary retrieved successfully',
        data: {
          summary,
          generatedAt: getCurrentSriLankaTime(),
        },
      };
    } catch (error) {
      return {
        success: false,
        message: error.message || 'Failed to get advertising summary',
        data: null,
      };
    }
  }
}









