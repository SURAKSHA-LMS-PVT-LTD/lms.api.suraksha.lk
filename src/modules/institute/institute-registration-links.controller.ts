import {
  Controller, Get, Post, Patch, Delete, Body, Param, UseGuards, Request,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiParam } from '@nestjs/swagger';

import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { FlexibleAccessGuard } from '../../auth/guards/flexible-access.guard';
import { RequireAnyOfRoles } from '../../auth/decorators/flexible-access.decorator';
import { ParseIdPipe } from '../../common/pipes/parse-id.pipe';
import { InstituteSelfRegistrationService } from './services/institute-self-registration.service';
import { InstituteRegistrationLinkEntity } from './entities/institute-registration-link.entity';

/**
 * 🔧 ADMIN: manage public registration links for an institute.
 *
 * Institute admins create/list/toggle/delete the /forms/:token links that govern
 * public self-registration. Scoped to the institute in the route; the guard ensures
 * the caller is an admin of that institute.
 */
@ApiTags('Institute Admin - Registration Links')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, FlexibleAccessGuard)
@Controller('institutes/:instituteId/registration-links')
export class InstituteRegistrationLinksController {
  constructor(private readonly selfRegService: InstituteSelfRegistrationService) {}

  private actorId(req: any): string | null {
    const id = req.user?.s ?? req.user?.userId ?? req.user?.sub;
    return id != null ? String(id) : null;
  }

  @Post()
  @RequireAnyOfRoles({ instituteAdmin: true })
  @ApiOperation({ summary: 'Create a public registration link' })
  @ApiParam({ name: 'instituteId' })
  async create(
    @Param('instituteId', ParseIdPipe) instituteId: string,
    @Body() body: Partial<InstituteRegistrationLinkEntity>,
    @Request() req: any,
  ) {
    return this.selfRegService.createLink(instituteId, this.actorId(req), body);
  }

  @Get()
  @RequireAnyOfRoles({ instituteAdmin: true })
  @ApiOperation({ summary: 'List the institute\'s public registration links' })
  @ApiParam({ name: 'instituteId' })
  async list(@Param('instituteId', ParseIdPipe) instituteId: string) {
    return this.selfRegService.listLinks(instituteId);
  }

  @Patch(':linkId')
  @RequireAnyOfRoles({ instituteAdmin: true })
  @ApiOperation({ summary: 'Update a registration link (incl. enable/disable via isActive)' })
  @ApiParam({ name: 'instituteId' })
  @ApiParam({ name: 'linkId' })
  async update(
    @Param('instituteId', ParseIdPipe) instituteId: string,
    @Param('linkId') linkId: string,
    @Body() body: Partial<InstituteRegistrationLinkEntity>,
  ) {
    return this.selfRegService.updateLink(instituteId, linkId, body);
  }

  @Delete(':linkId')
  @RequireAnyOfRoles({ instituteAdmin: true })
  @ApiOperation({ summary: 'Delete a registration link' })
  @ApiParam({ name: 'instituteId' })
  @ApiParam({ name: 'linkId' })
  async remove(
    @Param('instituteId', ParseIdPipe) instituteId: string,
    @Param('linkId') linkId: string,
  ) {
    await this.selfRegService.deleteLink(instituteId, linkId);
    return { success: true };
  }
}
