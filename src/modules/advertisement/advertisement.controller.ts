import { Controller, Get, Post, Put, Delete, Body, Param, Query, HttpException, HttpStatus, Request, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiBody } from '@nestjs/swagger';
import { AdvertisementService } from './advertisement.service';
import { CreateAdvertisementDto, UpdateAdvertisementDto, AdvertisementType, AdvertisementResponseDto, AdvertisementListResponseDto } from './dto/advertisement.dto';
import { CloudStorageService } from '../../common/services/cloud-storage.service';

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
    private readonly cloudStorageService: CloudStorageService
  ) {}

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

      // Validate priority range (1-10 based on schema)
      if (createAdDto.priority < 1 || createAdDto.priority > 10) {
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
  @ApiOperation({ summary: 'Get all active advertisements' })
  @ApiResponse({ 
    status: 200, 
    description: 'List of active advertisements',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        data: { 
          type: 'array',
          items: { $ref: '#/components/schemas/Advertisement' }
        }
      }
    }
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  async getActiveAdvertisements() {
    try {
      const advertisements = await this.advertisementService.getActiveAdvertisements();
      
      return {
        success: true,
        data: advertisements,
      };
    } catch (error) {
      throw new HttpException(
        {
          success: false,
          message: error.message || 'Failed to get active advertisements',
        },
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

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
  async sendAdvertisementManually(@Body() sendDto, @Request() req: any) {
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
  async checkAdvertisementSending(@Body() sendDto, @Request() req: any) {
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
    global: [UserType.SUPERADMIN],
    instituteAdmin: true
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
  async sendBulkAdvertisementsManually(@Body() bulkSendDto, @Request() req: any) {
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
    global: [UserType.SUPERADMIN],
    instituteAdmin: true
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








