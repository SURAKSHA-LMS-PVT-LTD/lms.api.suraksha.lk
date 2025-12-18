import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  UseGuards,
  Request,
  HttpStatus,
  HttpCode,
  BadRequestException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard, FlexibleAccessGuard, RequireAnyOfRoles, UserType } from '../../../auth/guards';
import { SenderMaskValidationService } from '../services/sender-mask-validation.service';
import { SenderMaskEntity, SenderMaskStatus } from '../entities/sender-mask.entity';

/**
 * Sender Mask Management Controller
 * 
 * SECURITY CRITICAL: Manages approved sender IDs for institutes
 * Users can only send SMS from their institute's approved, active masks
 */
@ApiTags('SMS - Sender Masks')
@Controller('sms/sender-masks')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class SenderMaskController {
  constructor(
    private readonly senderMaskValidationService: SenderMaskValidationService,
  ) {}

  /**
   * Get all active sender masks for the institute
   */
  @Get('institute/:instituteId')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ global: [UserType.SUPERADMIN], instituteAdmin: true })
  @ApiOperation({ summary: 'Get active sender masks for institute' })
  @ApiResponse({ status: 200, description: 'Active sender masks retrieved' })
  async getActiveMasks(
    @Param('instituteId') instituteId: string,
  ): Promise<SenderMaskEntity[]> {
    return this.senderMaskValidationService.getActiveMasks(instituteId);
  }

  /**
   * Get default sender mask for the institute
   */
  @Get('institute/:instituteId/default')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ global: [UserType.SUPERADMIN], instituteAdmin: true })
  @ApiOperation({ summary: 'Get default sender mask for institute' })
  @ApiResponse({ status: 200, description: 'Default sender mask retrieved' })
  @ApiResponse({ status: 404, description: 'No active masks found' })
  async getDefaultMask(
    @Param('instituteId') instituteId: string,
  ): Promise<SenderMaskEntity> {
    return this.senderMaskValidationService.getDefaultMask(instituteId);
  }

  /**
   * Request a new sender mask (requires admin approval)
   */
  @Post('request')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ global: [UserType.SUPERADMIN], instituteAdmin: true })
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Request new sender mask for approval' })
  @ApiResponse({ status: 201, description: 'Mask request created successfully' })
  @ApiResponse({ status: 400, description: 'Invalid mask format or already exists' })
  async requestMask(
    @Body('instituteId') instituteId: string,
    @Body('maskId') maskId: string,
    @Body('displayName') displayName?: string,
    @Body('notes') notes?: string,
  ): Promise<SenderMaskEntity> {
    if (!instituteId || !maskId) {
      throw new BadRequestException('instituteId and maskId are required');
    }

    return this.senderMaskValidationService.createMaskRequest(
      instituteId,
      maskId,
      displayName,
      notes,
    );
  }

  /**
   * Approve a sender mask (SUPERADMIN ONLY)
   */
  @Patch(':maskId/approve')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ global: [UserType.SUPERADMIN] })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Approve sender mask (SUPERADMIN only)' })
  @ApiResponse({ status: 200, description: 'Mask approved successfully' })
  @ApiResponse({ status: 404, description: 'Mask not found' })
  async approveMask(
    @Param('maskId') maskId: string,
    @Request() req,
    @Body('providerApprovalId') providerApprovalId?: string,
  ): Promise<SenderMaskEntity> {
    const adminUserId = req.user?.userId || req.user?.id;
    return this.senderMaskValidationService.approveMask(
      maskId,
      adminUserId,
      providerApprovalId,
    );
  }

  /**
   * Reject a sender mask (SUPERADMIN ONLY)
   */
  @Patch(':maskId/reject')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ global: [UserType.SUPERADMIN] })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reject sender mask (SUPERADMIN only)' })
  @ApiResponse({ status: 200, description: 'Mask rejected successfully' })
  @ApiResponse({ status: 404, description: 'Mask not found' })
  async rejectMask(
    @Param('maskId') maskId: string,
    @Body('reason') reason: string,
  ): Promise<SenderMaskEntity> {
    if (!reason) {
      throw new BadRequestException('Rejection reason is required');
    }
    return this.senderMaskValidationService.rejectMask(maskId, reason);
  }

  /**
   * Suspend a sender mask (SUPERADMIN ONLY)
   */
  @Patch(':maskId/suspend')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ global: [UserType.SUPERADMIN] })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Suspend sender mask (SUPERADMIN only)' })
  @ApiResponse({ status: 200, description: 'Mask suspended successfully' })
  @ApiResponse({ status: 404, description: 'Mask not found' })
  async suspendMask(
    @Param('maskId') maskId: string,
    @Body('reason') reason: string,
  ): Promise<SenderMaskEntity> {
    if (!reason) {
      throw new BadRequestException('Suspension reason is required');
    }
    return this.senderMaskValidationService.suspendMask(maskId, reason);
  }

  /**
   * Set default sender mask for institute
   */
  @Patch(':maskId/set-default')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ global: [UserType.SUPERADMIN], instituteAdmin: true })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Set default sender mask for institute' })
  @ApiResponse({ status: 200, description: 'Default mask updated successfully' })
  @ApiResponse({ status: 404, description: 'Mask not found or not active' })
  async setDefaultMask(
    @Param('maskId') maskId: string,
    @Body('instituteId') instituteId: string,
  ): Promise<SenderMaskEntity> {
    if (!instituteId) {
      throw new BadRequestException('instituteId is required');
    }
    return this.senderMaskValidationService.setDefaultMask(maskId, instituteId);
  }
}
