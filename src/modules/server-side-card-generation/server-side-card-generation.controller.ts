import {
  Controller, Get, Post, Param, Body, Query,
  UseGuards, Request, ParseIntPipe, DefaultValuePipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiParam, ApiQuery } from '@nestjs/swagger';

import { FlexibleAccessGuard, RequireAnyOfRoles, UserType } from '../../auth/guards';
import { JwtRequest } from '@common/interfaces/jwt-request.interface';
import { ParseIdPipe } from '../../common/pipes/parse-id.pipe';

import {
  ServerSideCardGenerationService,
  RequestServerSideJobDto,
  CompleteServerSideJobDto,
} from './server-side-card-generation.service';
import { DesignOutputType } from '../institute-designs/entities/design-template.entity';

@ApiTags('Server-Side Card Generation')
@ApiBearerAuth()
@Controller()
export class ServerSideCardGenerationController {
  constructor(private readonly service: ServerSideCardGenerationService) {}

  // ───────────────────────────────────────────────────────────────────────────
  // INSTITUTE ADMIN — /institutes/:id/card-generation/server-side
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Step 1: Debit credits at SSR rate and create a pending job.
   * Returns the template definition so the frontend can render cards.
   * The job expires after 2 hours if the frontend never completes it.
   */
  @Post('institutes/:id/card-generation/server-side/request')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ global: [UserType.SUPERADMIN], instituteAdmin: true })
  @ApiOperation({
    summary: 'Request a server-side card generation job (debit SSR credits, return template definition)',
  })
  @ApiParam({ name: 'id', description: 'Institute ID' })
  async requestJob(
    @Param('id', ParseIdPipe) id: string,
    @Body() body: { templateId: string; outputType: DesignOutputType; userIds: string[] },
    @Request() req: JwtRequest,
  ) {
    return this.service.requestJob(id, body, req.user);
  }

  /**
   * Step 2: Frontend finished rendering + uploading the ZIP to the requester's
   * Google Drive. Registers the Drive file ID and share link, issues refunds
   * for any failed cards, and marks the job COMPLETED.
   */
  @Post('institutes/:id/card-generation/server-side/jobs/:jobId/complete')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ global: [UserType.SUPERADMIN], instituteAdmin: true })
  @ApiOperation({
    summary: 'Complete a server-side job — register Drive link, issue refunds for failures',
  })
  @ApiParam({ name: 'id', description: 'Institute ID' })
  @ApiParam({ name: 'jobId', description: 'Job ID returned from /request' })
  async completeJob(
    @Param('id', ParseIdPipe) id: string,
    @Param('jobId') jobId: string,
    @Body() body: CompleteServerSideJobDto,
    @Request() req: JwtRequest,
  ) {
    return this.service.completeJob(id, jobId, body, req.user);
  }

  /**
   * Poll job status and retrieve the Drive share link once completed.
   */
  @Get('institutes/:id/card-generation/server-side/jobs/:jobId')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ global: [UserType.SUPERADMIN], instituteAdmin: true })
  @ApiOperation({ summary: 'Get job status and Drive link' })
  @ApiParam({ name: 'id', description: 'Institute ID' })
  @ApiParam({ name: 'jobId', description: 'Job ID' })
  async getJob(
    @Param('id', ParseIdPipe) id: string,
    @Param('jobId') jobId: string,
    @Request() req: JwtRequest,
  ) {
    return this.service.getJob(id, jobId, req.user);
  }

  /**
   * List all SSR jobs for this institute (most recent first).
   */
  @Get('institutes/:id/card-generation/server-side/jobs')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ global: [UserType.SUPERADMIN], instituteAdmin: true })
  @ApiOperation({ summary: 'List server-side card generation jobs for an institute' })
  @ApiParam({ name: 'id', description: 'Institute ID' })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  async listJobs(
    @Param('id', ParseIdPipe) id: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Request() req: JwtRequest,
  ) {
    return this.service.listJobs(id, req.user, page, limit);
  }
}
