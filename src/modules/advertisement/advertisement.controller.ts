import { Controller, Get, Post, Put, Delete, Body, Param, Query, HttpException, HttpStatus, Request, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiBody } from '@nestjs/swagger';
import { AdvertisementService } from './advertisement.service';
import { CreateAdvertisementDto, UpdateAdvertisementDto, AdvertisementType, AdvertisementResponseDto, AdvertisementListResponseDto } from './dto/advertisement.dto';
import { ManualAdvertisementSendDto, BulkManualAdvertisementSendDto } from './dto/manual-advertisement.dto';
import { CloudStorageService } from '../../common/services/cloud-storage.service';
import { AdvertisementDeliveryService } from './services/advertisement-delivery.service';
import { AdvertisementCacheService } from './services/advertisement-cache.service';
import { AdvertisementMatchingService } from './advertisement-matching.service';
import { DailyAdAssignmentService } from './services/daily-ad-assignment.service';

// ⚠️ MULTER REMOVED: All file uploads now use signed URL client-side direct upload
// See: /signed-urls/advertisement endpoint for new upload flow

import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { FlexibleAccessGuard } from '../../auth/guards/flexible-access.guard';
import { RequireAnyOfRoles } from '../../auth/decorators/flexible-access.decorator';
import { UserType } from '../user/enums/user-type.enum';

@ApiTags('Advertisements')
@Controller('api/advertisements')


export class AdvertisementController {
  constructor(
    private readonly advertisementService: AdvertisementService,
    private readonly cloudStorageService: CloudStorageService,
    private readonly advertisementDeliveryService: AdvertisementDeliveryService,
    private readonly advertisementCacheService: AdvertisementCacheService,
    private readonly advertisementMatchingService: AdvertisementMatchingService,
    private readonly dailyAdAssignmentService: DailyAdAssignmentService,
  ) {}

  @Post('daily-assignment/reassign')
  @UseGuards(JwtAuthGuard, FlexibleAccessGuard)
  @RequireAnyOfRoles({ global: [UserType.SUPERADMIN] })
  @ApiOperation({
    summary: 'Manually rebuild today\'s per-user ad assignments',
    description: 'Truncates and recomputes the daily user→ad pre-assignment table used by the attendance hot path. Run after creating/changing campaigns to refresh mid-day.',
  })
  @ApiResponse({ status: 201, description: 'Reassignment completed' })
  @ApiResponse({ status: 403, description: 'Forbidden - SUPERADMIN role required' })
  async reassignDailyAds() {
    try {
      const summary = await this.dailyAdAssignmentService.reassignAll('manual');
      return { success: true, ...summary };
    } catch (error) {
      throw new HttpException(
        { success: false, message: error.message || 'Failed to reassign daily ads' },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get('daily-assignment/status')
  @UseGuards(JwtAuthGuard, FlexibleAccessGuard)
  @RequireAnyOfRoles({ global: [UserType.SUPERADMIN] })
  @ApiOperation({ summary: 'Get current daily ad assignment status' })
  @ApiResponse({ status: 200, description: 'Assignment status' })
  async dailyAdAssignmentStatus() {
    try {
      const status = await this.dailyAdAssignmentService.getStatus();
      return { success: true, ...status };
    } catch (error) {
      throw new HttpException(
        { success: false, message: error.message || 'Failed to get assignment status' },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Post()
  @UseGuards(JwtAuthGuard, FlexibleAccessGuard)
  @RequireAnyOfRoles({
    global: [UserType.SUPERADMIN]
  })
  @ApiOperation({ summary: 'Create a new advertisement' })
  @ApiResponse({ 
    status: 201, 
    description: 'Advertisement created successfully',
    type: AdvertisementResponseDto
  })
  @ApiResponse({ status: 400, description: 'Bad request - validation error' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - SUPERADMIN role required' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  async createAdvertisement(@Body() createAdDto: CreateAdvertisementDto): Promise<AdvertisementResponseDto> {
    try {
      // Validate required fields with proper field names
      if (!createAdDto.title?.trim()) {
        throw new HttpException(
          {
            success: false,
            message: 'Title is required and cannot be empty',
          },
          HttpStatus.BAD_REQUEST
        );
      }

      if (!createAdDto.accessKey?.trim()) {
        throw new HttpException(
          {
            success: false,
            message: 'Access key is required and cannot be empty',
          },
          HttpStatus.BAD_REQUEST
        );
      }

      if (!createAdDto.mediaUrl?.trim()) {
        throw new HttpException(
          {
            success: false,
            message: 'Media URL is required and cannot be empty',
          },
          HttpStatus.BAD_REQUEST
        );
      }

      if (!createAdDto.mediaType) {
        throw new HttpException(
          {
            success: false,
            message: 'Media type is required',
          },
          HttpStatus.BAD_REQUEST
        );
      }

      // BUG-1 FIX: Guard priority check — only validate when priority is actually provided
      // Without this guard, `undefined < 1` was true and caused a 400 for valid requests
      if (createAdDto.priority !== undefined && (createAdDto.priority < 1 || createAdDto.priority > 10)) {
        throw new HttpException(
          {
            success: false,
            message: 'Priority must be between 1 and 10',
          },
          HttpStatus.BAD_REQUEST
        );
      }

      // Validate maxSendings
      if (createAdDto.maxSendings && createAdDto.maxSendings < 1) {
        throw new HttpException(
          {
            success: false,
            message: 'Max sendings must be at least 1',
          },
          HttpStatus.BAD_REQUEST
        );
      }

      // Validate dates
      const startDate = new Date(createAdDto.startDate);
      const endDate = new Date(createAdDto.endDate);
      
      if (isNaN(startDate.getTime())) {
        throw new HttpException(
          {
            success: false,
            message: 'Invalid start date format',
          },
          HttpStatus.BAD_REQUEST
        );
      }

      if (isNaN(endDate.getTime())) {
        throw new HttpException(
          {
            success: false,
            message: 'Invalid end date format',
          },
          HttpStatus.BAD_REQUEST
        );
      }

      if (endDate <= startDate) {
        throw new HttpException(
          {
            success: false,
            message: 'End date must be after start date',
          },
          HttpStatus.BAD_REQUEST
        );
      }

      const advertisement = await this.advertisementService.createAsDto(createAdDto);
      
      return advertisement;
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      
      throw new HttpException(
        {
          success: false,
          message: error.message || 'Failed to create advertisement',
        },
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  @Post('upload')
  @UseGuards(JwtAuthGuard, FlexibleAccessGuard)
  @RequireAnyOfRoles({
    global: [UserType.SUPERADMIN]
  })
  @ApiOperation({ 
    summary: '⚠️ DEPRECATED - Use /signed-urls/advertisement instead',
    deprecated: true,
    description: 'This endpoint is deprecated. Use the new signed URL upload system for better performance and cost efficiency.'
  })
  @ApiResponse({
    status: 410,
    description: 'Endpoint removed - Use signed URL upload instead',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        message: { type: 'string' },
        migrationGuide: { type: 'object' }
      }
    }
  })
  async uploadAdvertisementMedia() {
    throw new HttpException(
      {
        success: false,
        message: 'This endpoint has been removed. Please use the new signed URL upload system.',
        migrationGuide: {
          step1: 'POST /signed-urls/advertisement with { fileExtension: \'.jpg\' }',
          step2: 'Client uploads file directly to the returned signedUrl',
          step3: 'POST /signed-urls/verify/:token to complete upload',
          step4: 'Use the returned mediaUrl in your advertisement',
          documentation: 'See /docs/SIGNED_URL_UPLOAD_SYSTEM.md for complete guide',
          benefits: [
            '60% faster uploads (direct to cloud)',
            '90% less backend load',
            '40-60% cost reduction',
            'Better security with time-limited URLs'
          ]
        }
      },
      HttpStatus.GONE
    );
  }

  @Get()
  @UseGuards(JwtAuthGuard, FlexibleAccessGuard)
  @RequireAnyOfRoles({ global: [UserType.SUPERADMIN] })
  @ApiOperation({ summary: 'Get all advertisements with pagination' })
  @ApiResponse({ 
    status: 200, 
    description: 'Paginated list of advertisements',
    type: AdvertisementListResponseDto
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - SUPERADMIN role required' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  async getAllAdvertisements(
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 10
  ): Promise<AdvertisementListResponseDto> {
    try {
      const pageNum = Math.max(1, Number(page) || 1);
      const limitNum = Math.min(100, Math.max(1, Number(limit) || 10));
      
      return await this.advertisementService.findAllAsDto(pageNum, limitNum);
    } catch (error) {
      throw new HttpException(
        {
          success: false,
          message: error.message || 'Failed to get advertisements',
        },
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  @Get('active')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get all active advertisements (DTO-shaped, full URL transformation)' })
  @ApiResponse({ 
    status: 200, 
    description: 'List of active advertisements',
    type: AdvertisementListResponseDto
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  async getActiveAdvertisements() {
    try {
      // FEAT-5 FIX: Use findAllAsDto with active filter so URLs are transformed
      // and raw entity internals are not exposed.
      const rawAds = await this.advertisementService.getActiveAdvertisements();
      const mapped = rawAds.map((ad: any) => ({
        id: ad.id,
        title: ad.title,
        description: ad.description || '',
        mediaUrl: this.cloudStorageService.getFullUrl(ad.mediaUrl) || ad.mediaUrl || '',
        mediaType: ad.mediaType,
        landingUrl: ad.landingUrl || null,
        sendingUrl: ad.sendingUrl || null,
        supportivePlatforms: ad.supportivePlatforms || [],
        modeOfSending: ad.modeOfSending || [],
        targetInstituteIds: ad.targetInstituteIds || [],
        targetCities: ad.targetCities || [],
        targetProvinces: ad.targetProvinces || [],
        targetDistricts: ad.targetDistricts || [],
        minBornYear: ad.minBornYear || null,
        maxBornYear: ad.maxBornYear || null,
        targetGenders: ad.targetGenders || [],
        targetOccupations: ad.targetOccupations || [],
        targetUserTypes: ad.targetUserTypes || [],
        targetSubscriptionPlans: ad.targetSubscriptionPlans || [],
        displayDuration: ad.displayDuration || 30,
        priority: ad.priority || 1,
        isActive: ad.isActive,
        maxSendings: ad.maxSendings || 1000,
        cascadeToParents: ad.cascadeToParents || false,
        startDate: ad.startDate,
        endDate: ad.endDate,
        impressions: ad.impressionCount || 0,
        clicks: ad.clickCount || 0,
        sends: ad.currentSendings || 0,
      }));
      return {
        success: true,
        total: mapped.length,
        data: mapped,
      };
    } catch (error) {
      throw new HttpException(
        { success: false, message: error.message || 'Failed to get active advertisements' },
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  // ========================================
  // 📊 STATISTICS & CACHE ENDPOINTS (must be before :id param route)
  // ========================================

  @Get('stats')
  @UseGuards(JwtAuthGuard, FlexibleAccessGuard)
  @RequireAnyOfRoles({ global: [UserType.SUPERADMIN], instituteAdmin: true })
  @ApiOperation({ 
    summary: 'Get unified advertisement statistics (FEAT-3)',
    description: 'Returns delivery statistics across all ads plus current cache health status.'
  })
  @ApiResponse({ status: 200, description: 'Stats retrieved' })
  async getStats(@Query('startDate') startDate?: string, @Query('endDate') endDate?: string) {
    try {
      const [deliveryStats, cacheStatus] = await Promise.all([
        this.advertisementDeliveryService.getDeliveryStatistics(
          startDate ? new Date(startDate) : undefined,
          endDate ? new Date(endDate) : undefined,
        ),
        this.advertisementCacheService.getCacheStatus(),
      ]);
      return {
        success: true,
        data: {
          delivery: deliveryStats,
          cache: cacheStatus,
          configuration: this.advertisementDeliveryService.getConfiguration(),
        },
      };
    } catch (error) {
      throw new HttpException({ success: false, message: error.message }, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Get('cache-status')
  @UseGuards(JwtAuthGuard, FlexibleAccessGuard)
  @RequireAnyOfRoles({ global: [UserType.SUPERADMIN], instituteAdmin: true })
  @ApiOperation({ summary: 'Get advertisement cache health status (PERF-3)' })
  @ApiResponse({ status: 200, description: 'Cache status retrieved' })
  async getCacheStatus() {
    try {
      const status = await this.advertisementCacheService.getCacheStatus();
      return { success: true, data: status };
    } catch (error) {
      throw new HttpException({ success: false, message: error.message }, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Get('cache/current')
  @UseGuards(JwtAuthGuard, FlexibleAccessGuard)
  @RequireAnyOfRoles({ global: [UserType.SUPERADMIN], instituteAdmin: true })
  @ApiOperation({ summary: 'Get currently cached advertisements (admin)' })
  @ApiResponse({ status: 200, description: 'Current cached advertisements retrieved' })
  async getCurrentCachedAds() {
    try {
      const data = await this.advertisementCacheService.getCurrentCachedAdvertisements();
      return { success: true, data };
    } catch (error) {
      throw new HttpException({ success: false, message: error.message }, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Get('delivery/by-user')
  @UseGuards(JwtAuthGuard, FlexibleAccessGuard)
  @RequireAnyOfRoles({ global: [UserType.SUPERADMIN], instituteAdmin: true })
  @ApiOperation({
    summary: 'Get advertisement deliveries by user/time window',
    description: 'Returns attendance-linked advertisement deliveries for a specific user, useful for support and auditing.'
  })
  @ApiResponse({ status: 200, description: 'User delivery history retrieved' })
  async getDeliveryByUser(
    @Query('userId') userId: string,
    @Query('instituteId') instituteId?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('limit') limit?: string,
  ) {
    if (!userId?.trim()) {
      throw new HttpException(
        { success: false, message: 'userId is required' },
        HttpStatus.BAD_REQUEST,
      );
    }

    try {
      const data = await this.advertisementDeliveryService.getUserAdvertisementDeliveryHistory({
        userId: userId.trim(),
        instituteId: instituteId?.trim() || undefined,
        startDate: startDate?.trim() || undefined,
        endDate: endDate?.trim() || undefined,
        limit: limit ? Number(limit) : undefined,
      });
      return { success: true, data };
    } catch (error) {
      throw new HttpException({ success: false, message: error.message }, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  // ========================================
  // 📦 PARAMETERIZED ROUTES (:id must come after all static routes)
  // ========================================

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get advertisement by ID' })
  @ApiParam({ name: 'id', description: 'Advertisement ID' })
  @ApiResponse({ 
    status: 200, 
    description: 'Advertisement details',
    type: AdvertisementResponseDto
  })
  @ApiResponse({ status: 404, description: 'Advertisement not found' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  async getAdvertisement(@Param('id') id: string): Promise<AdvertisementResponseDto> {
    try {
      const advertisement = await this.advertisementService.findOneAsDto(id);
      
      if (!advertisement) {
        throw new HttpException(
          {
            success: false,
            message: 'Advertisement not found',
          },
          HttpStatus.NOT_FOUND
        );
      }

      return advertisement;
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      
      throw new HttpException(
        {
          success: false,
          message: error.message || 'Failed to get advertisement',
        },
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  @Put(':id')
  @UseGuards(JwtAuthGuard, FlexibleAccessGuard)
  @RequireAnyOfRoles({ global: [UserType.SUPERADMIN] })
  @ApiOperation({ summary: 'Update advertisement by ID' })
  @ApiParam({ name: 'id', description: 'Advertisement ID' })
  @ApiResponse({ 
    status: 200, 
    description: 'Advertisement updated successfully',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        message: { type: 'string' }
      }
    }
  })
  @ApiResponse({ status: 400, description: 'Bad request - validation error' })
  @ApiResponse({ status: 404, description: 'Advertisement not found' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  async updateAdvertisement(@Param('id') id: string, @Body() updateAdDto: UpdateAdvertisementDto) {
    try {
      // Check if advertisement exists first
      const existingAd = await this.advertisementService.getAdvertisement(id);
      if (!existingAd) {
        throw new HttpException(
          {
            success: false,
            message: 'Advertisement not found',
          },
          HttpStatus.NOT_FOUND
        );
      }

      await this.advertisementService.updateAdvertisement(id, updateAdDto);
      
      return {
        success: true,
        message: 'Advertisement updated successfully',
      };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      
      throw new HttpException(
        {
          success: false,
          message: error.message || 'Failed to update advertisement',
        },
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, FlexibleAccessGuard)
  @RequireAnyOfRoles({ global: [UserType.SUPERADMIN] })
  @ApiOperation({ summary: 'Delete advertisement by ID' })
  @ApiParam({ name: 'id', description: 'Advertisement ID' })
  @ApiResponse({ 
    status: 200, 
    description: 'Advertisement deleted successfully',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        message: { type: 'string' }
      }
    }
  })
  @ApiResponse({ status: 404, description: 'Advertisement not found' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  async deleteAdvertisement(@Param('id') id: string) {
    try {
      // Check if advertisement exists first
      const existingAd = await this.advertisementService.getAdvertisement(id);
      if (!existingAd) {
        throw new HttpException(
          {
            success: false,
            message: 'Advertisement not found',
          },
          HttpStatus.NOT_FOUND
        );
      }

      await this.advertisementService.deleteAdvertisement(id);
      
      return {
        success: true,
        message: 'Advertisement deleted successfully',
      };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      
      throw new HttpException(
        {
          success: false,
          message: error.message || 'Failed to delete advertisement',
        },
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  // ========================================
  // 📊 ANALYTICS & TRACKING ENDPOINTS
  // FEAT-1, FEAT-2: Click / Impression
  // ========================================

  @Post(':id/click')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ 
    summary: 'Record a click on an advertisement (FEAT-1)',
    description: 'Call this endpoint when a user taps/clicks an advertisement. Increments clickCount atomically.'
  })
  @ApiParam({ name: 'id', description: 'Advertisement ID' })
  @ApiResponse({ status: 200, description: 'Click recorded' })
  @ApiResponse({ status: 404, description: 'Advertisement not found' })
  async recordClick(@Param('id') id: string, @Request() req: any) {
    try {
      const userId = req.user?.id || 'anonymous';
      const success = await this.advertisementDeliveryService.recordAdvertisementClick(id, userId);
      if (!success) {
        throw new HttpException({ success: false, message: 'Advertisement not found' }, HttpStatus.NOT_FOUND);
      }
      return { success: true, message: 'Click recorded' };
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new HttpException({ success: false, message: error.message }, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Post(':id/impression')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ 
    summary: 'Record an impression for an advertisement (FEAT-2)',
    description: 'Call this endpoint when an advertisement is displayed to a user. Increments impressionCount atomically.'
  })
  @ApiParam({ name: 'id', description: 'Advertisement ID' })
  @ApiResponse({ status: 200, description: 'Impression recorded' })
  async recordImpression(@Param('id') id: string, @Request() req: any) {
    try {
      const userId = req.user?.id || 'anonymous';
      // FEAT-2: Use matching service to record impression (impressionCount atomic increment)
      await this.advertisementMatchingService.recordImpression(id, { userId } as any);
      return { success: true, message: 'Impression recorded' };
    } catch (error) {
      throw new HttpException({ success: false, message: error.message }, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  // ========================================
  // 🎯 MANUAL ADVERTISEMENT SENDING ENDPOINTS
  // ========================================

  @Post('send-manual')
  @UseGuards(JwtAuthGuard, FlexibleAccessGuard)
  @RequireAnyOfRoles({ global: [UserType.SUPERADMIN] })
  @ApiOperation({ 
    summary: 'Send advertisement manually to targeted users (SUPERADMIN only)',
    description: 'Allows SUPERADMIN to send advertisements manually to specific user groups with package-based filtering'
  })
  @ApiResponse({ 
    status: 201, 
    description: 'Advertisement sent successfully',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        message: { type: 'string' },
        data: {
          type: 'object',
          properties: {
            campaignId: { type: 'string' },
            totalTargeted: { type: 'number' },
            totalSent: { type: 'number' },
            totalFailed: { type: 'number' },
            packageBreakdown: { type: 'object' }
          }
        }
      }
    }
  })
  @ApiResponse({ status: 400, description: 'Bad request - validation error' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - SUPERADMIN role required' })
  @ApiResponse({ status: 404, description: 'Advertisement not found' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  async sendAdvertisementManually(@Body() sendDto: ManualAdvertisementSendDto, @Request() req: any) {
    try {
      // In a real implementation, you'd validate admin permissions here
      const adminUserId = req.user?.id || 'system-admin';
      
      return await this.advertisementService.sendAdvertisementManually(sendDto, adminUserId);
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      
      throw new HttpException(
        {
          success: false,
          message: error.message || 'Failed to send advertisement manually',
        },
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  @Post('check-sending')
  @UseGuards(JwtAuthGuard, FlexibleAccessGuard)
  @RequireAnyOfRoles({ global: [UserType.SUPERADMIN] })
  @ApiOperation({ 
    summary: 'Check advertisement sending (dry-run) - SUPERADMIN only',
    description: 'Preview what would happen if the advertisement is sent. Returns user counts, platforms, execution metrics WITHOUT actually sending. SUPERADMIN access required.'
  })
  @ApiResponse({ 
    status: 200, 
    description: 'Check completed successfully',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        message: { type: 'string' },
        data: {
          type: 'object',
          properties: {
            advertisement: { type: 'object' },
            targeting: {
              type: 'object',
              properties: {
                totalUsers: { type: 'number' },
                students: { type: 'number' },
                parents: { type: 'number' },
                byInstitute: { type: 'object' },
                bySubscriptionPlan: { type: 'object' }
              }
            },
            delivery: {
              type: 'object',
              properties: {
                platforms: { type: 'array', items: { type: 'string' } },
                eligibleUsers: { type: 'number' },
                ineligibleUsers: { type: 'number' },
                packageBreakdown: { type: 'object' }
              }
            },
            execution: {
              type: 'object',
              properties: {
                estimatedDBQueries: { type: 'number' },
                estimatedExecutionTime: { type: 'string' },
                deliveryMode: { type: 'string' }
              }
            }
          }
        }
      }
    }
  })
  async checkAdvertisementSending(@Body() sendDto: ManualAdvertisementSendDto, @Request() req: any) {
    try {
      return await this.advertisementService.checkAdvertisementSending(sendDto);
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      
      throw new HttpException(
        {
          success: false,
          message: error.message || 'Failed to check advertisement sending',
        },
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  @Post('send-bulk-manual')
  @UseGuards(JwtAuthGuard, FlexibleAccessGuard)
  @RequireAnyOfRoles({
    global: [UserType.SUPERADMIN]
  })
  @ApiOperation({ 
    summary: 'Send multiple advertisements manually in bulk (Admin only)',
    description: 'Allows system admin to send multiple advertisement campaigns at once with scheduling support'
  })
  @ApiResponse({ 
    status: 201, 
    description: 'Bulk advertisements sent successfully',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        message: { type: 'string' },
        data: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              campaignId: { type: 'string' },
              totalSent: { type: 'number' },
              packageBreakdown: { type: 'object' }
            }
          }
        }
      }
    }
  })
  @ApiResponse({ status: 400, description: 'Bad request - validation error' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - SUPERADMIN role required' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  async sendBulkAdvertisementsManually(@Body() bulkSendDto: BulkManualAdvertisementSendDto, @Request() req: any) {
    try {
      // In a real implementation, you'd validate admin permissions here
      const adminUserId = req.user?.id || 'system-admin';
      
      const results = await this.advertisementService.sendBulkAdvertisementsManually(bulkSendDto, adminUserId);
      
      return {
        success: true,
        message: `Bulk advertisement campaigns processed: ${results.length} campaigns`,
        data: results
      };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      
      throw new HttpException(
        {
          success: false,
          message: error.message || 'Failed to send bulk advertisements manually',
        },
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  @Get('analytics/manual-sends')
  @UseGuards(JwtAuthGuard, FlexibleAccessGuard)
  @RequireAnyOfRoles({
    global: [UserType.SUPERADMIN]
  })
  @ApiOperation({ 
    summary: 'Get manual advertisement sending analytics (Admin only)',
    description: 'Retrieve analytics data for manual advertisement campaigns'
  })
  @ApiResponse({ 
    status: 200, 
    description: 'Manual send analytics retrieved successfully',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        data: {
          type: 'object',
          properties: {
            totalCampaigns: { type: 'number' },
            totalUsersSent: { type: 'number' },
            packageBreakdown: { type: 'object' },
            topPerformingAds: { type: 'array' }
          }
        }
      }
    }
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - admin role required' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  async getManualSendAnalytics(
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Request() req?: any
  ) {
    try {
      // In a real implementation, you'd validate admin permissions here
      const adminUserId = req?.user?.id || 'system-admin';
      
      return await this.advertisementService.getManualSendAnalytics(adminUserId, startDate, endDate);
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      
      throw new HttpException(
        {
          success: false,
          message: error.message || 'Failed to get manual send analytics',
        },
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }
}








