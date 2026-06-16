import {
  Controller, Get, Post, Put, Delete, Param, Body, Query,
  UseGuards, Request, ParseIntPipe, DefaultValuePipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiParam, ApiQuery } from '@nestjs/swagger';

import {
  FlexibleAccessGuard, RequireAnyOfRoles, UserType,
} from '../../auth/guards';
import { JwtRequest } from '@common/interfaces/jwt-request.interface';
import { ParseIdPipe } from '../../common/pipes/parse-id.pipe';

import {
  InstituteDesignsService,
  UpsertDesignTemplateDto,
  ApproveDesignTemplateDto,
  RejectDesignTemplateDto,
} from './institute-designs.service';
import { DesignOutputType, DesignTemplateStatus } from './entities/design-template.entity';

@ApiTags('Institute Designs')
@ApiBearerAuth()
@Controller()
export class InstituteDesignsController {
  constructor(private readonly service: InstituteDesignsService) {}

  // ═══════════════════════════════════════════════════════════════════════════
  // INSTITUTE ADMIN ENDPOINTS — /institutes/:id/design-templates
  // ═══════════════════════════════════════════════════════════════════════════

  @Get('institutes/:id/design-templates')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ global: [UserType.SUPERADMIN], instituteAdmin: true })
  @ApiOperation({ summary: 'List all design templates for an institute' })
  @ApiParam({ name: 'id', description: 'Institute ID' })
  async listTemplates(
    @Param('id', ParseIdPipe) id: string,
    @Request() req: JwtRequest,
  ) {
    return this.service.listTemplates(id, req.user);
  }

  @Post('institutes/:id/design-templates')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ global: [UserType.SUPERADMIN], instituteAdmin: true })
  @ApiOperation({ summary: 'Create a new design template (starts as DRAFT)' })
  @ApiParam({ name: 'id', description: 'Institute ID' })
  async createTemplate(
    @Param('id', ParseIdPipe) id: string,
    @Body() dto: UpsertDesignTemplateDto,
    @Request() req: JwtRequest,
  ) {
    return this.service.upsertTemplate(id, dto, req.user);
  }

  @Put('institutes/:id/design-templates/:templateId')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ global: [UserType.SUPERADMIN], instituteAdmin: true })
  @ApiOperation({ summary: 'Update a design template (drops to DRAFT; blocked while PENDING review)' })
  @ApiParam({ name: 'id', description: 'Institute ID' })
  @ApiParam({ name: 'templateId', description: 'Template ID' })
  async updateTemplate(
    @Param('id', ParseIdPipe) id: string,
    @Param('templateId') templateId: string,
    @Body() dto: UpsertDesignTemplateDto,
    @Request() req: JwtRequest,
  ) {
    return this.service.upsertTemplate(id, { ...dto, id: templateId }, req.user);
  }

  @Put('institutes/:id/design-templates/:templateId/submit-for-review')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ global: [UserType.SUPERADMIN], instituteAdmin: true })
  @ApiOperation({ summary: 'Submit a DRAFT template for admin review (moves to PENDING, locks editing)' })
  @ApiParam({ name: 'id', description: 'Institute ID' })
  @ApiParam({ name: 'templateId', description: 'Template ID' })
  async submitForReview(
    @Param('id', ParseIdPipe) id: string,
    @Param('templateId') templateId: string,
    @Request() req: JwtRequest,
  ) {
    return this.service.submitForReview(id, templateId, req.user);
  }

  @Delete('institutes/:id/design-templates/:templateId')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ global: [UserType.SUPERADMIN], instituteAdmin: true })
  @ApiOperation({ summary: 'Delete a design template' })
  async deleteTemplate(
    @Param('id', ParseIdPipe) id: string,
    @Param('templateId') templateId: string,
    @Request() req: JwtRequest,
  ) {
    await this.service.deleteTemplate(id, templateId, req.user);
    return { success: true };
  }

  @Get('institutes/:id/design-templates/:templateId')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ global: [UserType.SUPERADMIN], instituteAdmin: true })
  @ApiOperation({ summary: 'Get a single design template' })
  async getTemplate(
    @Param('id', ParseIdPipe) id: string,
    @Param('templateId') templateId: string,
    @Request() req: JwtRequest,
  ) {
    return this.service.getTemplate(id, templateId, req.user);
  }

  @Post('institutes/:id/design-templates/:templateId/preview-cost')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ global: [UserType.SUPERADMIN], instituteAdmin: true })
  @ApiOperation({ summary: 'Preview generation cost (no billing). Returns userCount, unitCost, totalCost, balance, sufficient.' })
  async previewCost(
    @Param('id', ParseIdPipe) id: string,
    @Param('templateId') templateId: string,
    @Body() body: { outputType: DesignOutputType; userIds: string[] },
    @Request() req: JwtRequest,
  ) {
    return this.service.previewCost(id, templateId, body.outputType, body.userIds, req.user);
  }

  @Post('institutes/:id/design-templates/:templateId/generate')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ global: [UserType.SUPERADMIN], instituteAdmin: true })
  @ApiOperation({ summary: 'Confirm & start generation: debits credits, returns record + template definition' })
  async commitGeneration(
    @Param('id', ParseIdPipe) id: string,
    @Param('templateId') templateId: string,
    @Body() body: { outputType: DesignOutputType; userIds: string[] },
    @Request() req: JwtRequest,
  ) {
    return this.service.commitGeneration(id, templateId, body.outputType, body.userIds, req.user);
  }

  @Post('institutes/:id/design-templates/generations/:recordId/result')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ global: [UserType.SUPERADMIN], instituteAdmin: true })
  @ApiOperation({ summary: 'Report generation result (success/fail counts) — triggers refund for failures' })
  async reportResult(
    @Param('id', ParseIdPipe) id: string,
    @Param('recordId') recordId: string,
    @Body() body: { successCount: number; failCount: number },
    @Request() req: JwtRequest,
  ) {
    return this.service.reportGenerationResult(
      id, recordId, body.successCount, body.failCount, req.user,
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SYSTEM ADMIN ENDPOINTS — /admin/design-templates
  // ═══════════════════════════════════════════════════════════════════════════

  @Get('admin/design-templates/pending')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ global: [UserType.SUPERADMIN] })
  @ApiOperation({ summary: 'List pending design templates awaiting review' })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  async listPending(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    return this.service.listPendingTemplates(page, Math.min(limit, 100));
  }

  @Get('admin/design-templates')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ global: [UserType.SUPERADMIN] })
  @ApiOperation({ summary: 'List all design templates with optional filters' })
  @ApiQuery({ name: 'status', required: false, enum: DesignTemplateStatus })
  @ApiQuery({ name: 'instituteId', required: false })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  async listAll(
    @Query('status') status?: DesignTemplateStatus,
    @Query('instituteId') instituteId?: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page?: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit?: number,
  ) {
    return this.service.listAllTemplates({ status, instituteId, page, limit: Math.min(limit, 100) });
  }

  @Get('admin/design-templates/:templateId')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ global: [UserType.SUPERADMIN] })
  @ApiOperation({ summary: 'Get a single design template (admin)' })
  async adminGetTemplate(@Param('templateId') templateId: string) {
    return this.service.adminGetTemplate(templateId);
  }

  @Put('admin/design-templates/:templateId/approve')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ global: [UserType.SUPERADMIN] })
  @ApiOperation({ summary: 'Approve a design template and set per-output costs + allowed outputs' })
  async approveTemplate(
    @Param('templateId') templateId: string,
    @Body() dto: ApproveDesignTemplateDto,
    @Request() req: JwtRequest,
  ) {
    const adminId: string = (req.user as any).id ?? (req.user as any).sub;
    return this.service.approveTemplate(templateId, adminId, dto);
  }

  @Put('admin/design-templates/:templateId/reject')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ global: [UserType.SUPERADMIN] })
  @ApiOperation({ summary: 'Reject a design template with a reason' })
  async rejectTemplate(
    @Param('templateId') templateId: string,
    @Body() dto: RejectDesignTemplateDto,
    @Request() req: JwtRequest,
  ) {
    const adminId: string = (req.user as any).id ?? (req.user as any).sub;
    return this.service.rejectTemplate(templateId, adminId, dto);
  }

  @Put('admin/design-templates/:templateId/suspend')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ global: [UserType.SUPERADMIN] })
  @ApiOperation({ summary: 'Suspend an approved template (blocks generation without deleting)' })
  async suspendTemplate(
    @Param('templateId') templateId: string,
    @Body() body: { adminNotes?: string },
    @Request() req: JwtRequest,
  ) {
    const adminId: string = (req.user as any).id ?? (req.user as any).sub;
    return this.service.suspendTemplate(templateId, adminId, body.adminNotes);
  }

  @Put('admin/design-templates/:templateId/unsuspend')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ global: [UserType.SUPERADMIN] })
  @ApiOperation({ summary: 'Unsuspend (re-approve) a suspended template' })
  async unsuspendTemplate(
    @Param('templateId') templateId: string,
    @Request() req: JwtRequest,
  ) {
    const adminId: string = (req.user as any).id ?? (req.user as any).sub;
    return this.service.unsuspendTemplate(templateId, adminId);
  }

  @Put('admin/design-templates/:templateId')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ global: [UserType.SUPERADMIN] })
  @ApiOperation({ summary: 'Admin edit template name or definition (does not reset status)' })
  async adminUpdateTemplate(
    @Param('templateId') templateId: string,
    @Body() body: { name?: string; definition?: Record<string, any> },
    @Request() req: JwtRequest,
  ) {
    const adminId: string = (req.user as any).id ?? (req.user as any).sub;
    return this.service.adminUpdateTemplate(templateId, adminId, body);
  }

  @Get('admin/design-templates/generations')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ global: [UserType.SUPERADMIN] })
  @ApiOperation({ summary: 'List generation records (admin audit view)' })
  @ApiQuery({ name: 'instituteId', required: false })
  @ApiQuery({ name: 'templateId', required: false })
  @ApiQuery({ name: 'outputType', required: false, enum: DesignOutputType })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  async listGenerations(
    @Query('instituteId') instituteId?: string,
    @Query('templateId') templateId?: string,
    @Query('outputType') outputType?: DesignOutputType,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page?: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit?: number,
  ) {
    return this.service.listGenerationRecords({
      instituteId, templateId, outputType, page, limit: Math.min(limit, 100),
    });
  }
}
