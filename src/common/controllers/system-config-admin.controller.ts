/**
 * âš™ï¸ SYSTEM CONFIG ADMIN CONTROLLER
 *
 * Full CRUD endpoints for managing system_config entries via the admin panel.
 * Protected by JwtAuthGuard + SystemAdminGuard (SUPER_ADMIN / ORG_MANAGER only).
 *
 * Routes:
 *   GET    /api/admin/system-config              â€” List all configs (filterable)
 *   GET    /api/admin/system-config/groups        â€” List group summaries
 *   GET    /api/admin/system-config/cache/stats   â€” Cache statistics
 *   POST   /api/admin/system-config/cache/refresh â€” Force cache refresh
 *   GET    /api/admin/system-config/:group        â€” Get all configs in a group
 *   GET    /api/admin/system-config/:group/:key   â€” Get single config
 *   POST   /api/admin/system-config               â€” Create new config entry
 *   PUT    /api/admin/system-config/:group/:key   â€” Update config value
 *   PATCH  /api/admin/system-config/:group/:key/deactivate  â€” Soft-delete
 *   PATCH  /api/admin/system-config/:group/:key/reactivate  â€” Re-enable
 *   DELETE /api/admin/system-config/:group/:key   â€” Hard-delete (permanent)
 */
import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  Req,
  UseGuards,
  HttpCode,
  HttpStatus,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { SystemAdminGuard } from '../../modules/user-card-management/guards/system-admin.guard';
import { SystemConfigService } from '../services/system-config.service';
import {
  CreateSystemConfigDto,
  UpdateSystemConfigDto,
  QuerySystemConfigDto,
  SystemConfigResponseDto,
  SystemConfigGroupSummaryDto,
  CacheRefreshResponseDto,
} from '../dto/system-config-admin.dto';

@ApiTags('System Admin - Configuration')
@ApiBearerAuth()
@Controller('api/admin/system-config')
@UseGuards(JwtAuthGuard, SystemAdminGuard)
export class SystemConfigAdminController {
  constructor(private readonly configService: SystemConfigService) {}

  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  // LIST / READ
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

  /**
   * List all config entries. Optionally filter by group and/or active status.
   */
  @Get()
  @ApiOperation({ summary: 'List all system config entries' })
  @ApiResponse({ status: 200, type: [SystemConfigResponseDto] })
  async listAll(@Query() query: QuerySystemConfigDto) {
    const entries = await this.configService.getAll({
      group: query.group,
      isActive: query.isActive,
    });
    return {
      success: true,
      count: entries.length,
      data: entries,
    };
  }

  /**
   * Get group summaries (group name + total count + active count).
   */
  @Get('groups')
  @ApiOperation({ summary: 'List all config groups with counts' })
  @ApiResponse({ status: 200, type: [SystemConfigGroupSummaryDto] })
  async listGroups() {
    const groups = await this.configService.getGroupSummaries();
    return {
      success: true,
      data: groups,
    };
  }

  /**
   * Cache statistics.
   */
  @Get('cache/stats')
  @ApiOperation({ summary: 'Get cache statistics' })
  async cacheStats() {
    const entries = await this.configService.getAll({});
    const activeEntries = entries.filter((e: any) => e.isActive !== false);
    return {
      success: true,
      data: {
        totalEntries: entries.length,
        activeEntries: activeEntries.length,
        inactiveEntries: entries.length - activeEntries.length,
        hint: 'Use POST /cache/refresh to reload',
      },
    };
  }

  /**
   * Force full cache refresh from DB.
   */
  @Post('cache/refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Force cache refresh from database' })
  @ApiResponse({ status: 200, type: CacheRefreshResponseDto })
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  async refreshCache() {
    const count = await this.configService.refreshCache();
    return {
      success: true,
      entriesCached: count,
    };
  }

  /**
   * Get all configs in a specific group.
   */
  @Get(':group')
  @ApiOperation({ summary: 'Get all configs in a group' })
  @ApiParam({ name: 'group', example: 'ATTENDANCE' })
  @ApiResponse({ status: 200, type: [SystemConfigResponseDto] })
  async getGroup(@Param('group') group: string) {
    const entries = await this.configService.getAll({
      group: group.toUpperCase(),
    });
    return {
      success: true,
      group: group.toUpperCase(),
      count: entries.length,
      data: entries,
    };
  }

  /**
   * Get a single config entry by group + key.
   */
  @Get(':group/:key')
  @ApiOperation({ summary: 'Get a single config entry' })
  @ApiParam({ name: 'group', example: 'ATTENDANCE' })
  @ApiParam({ name: 'key', example: 'SYNC_MODE' })
  @ApiResponse({ status: 200, type: SystemConfigResponseDto })
  async getOne(
    @Param('group') group: string,
    @Param('key') key: string,
  ) {
    const entity = await this.configService.getEntity(
      group.toUpperCase(),
      key.toUpperCase(),
    );
    if (!entity) {
      throw new NotFoundException(`Config [${group.toUpperCase()}:${key.toUpperCase()}] not found`);
    }
    return {
      success: true,
      data: entity,
    };
  }

  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  // CREATE / UPDATE
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

  /**
   * Create a new config entry.
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a new config entry' })
  @ApiResponse({ status: 201, type: SystemConfigResponseDto })
  @ApiResponse({ status: 409, description: 'Config already exists' })
  async create(@Body() dto: CreateSystemConfigDto, @Req() req: any) {
    // Check for duplicates
    const existing = await this.configService.getEntity(dto.group, dto.key);
    if (existing) {
      throw new ConflictException(
        `Config [${dto.group}:${dto.key}] already exists (id=${existing.id}). Use PUT to update.`,
      );
    }

    const userId = req.user?.s || req.user?.userId || req.user?.sub || 'ADMIN';
    await this.configService.set(dto.group, dto.key, dto.value, userId, {
      description: dto.description,
      valueType: dto.valueType || 'STRING',
    });

    const created = await this.configService.getEntity(dto.group, dto.key);
    return {
      success: true,
      message: `Config [${dto.group}:${dto.key}] created`,
      data: created,
    };
  }

  /**
   * Update an existing config entry's value.
   */
  @Put(':group/:key')
  @ApiOperation({ summary: 'Update a config value' })
  @ApiParam({ name: 'group', example: 'ATTENDANCE' })
  @ApiParam({ name: 'key', example: 'SYNC_MODE' })
  @ApiResponse({ status: 200, type: SystemConfigResponseDto })
  async update(
    @Param('group') group: string,
    @Param('key') key: string,
    @Body() dto: UpdateSystemConfigDto,
    @Req() req: any,
  ) {
    const g = group.toUpperCase();
    const k = key.toUpperCase();

    const existing = await this.configService.getEntity(g, k);
    if (!existing) {
      throw new NotFoundException(`Config [${g}:${k}] not found`);
    }

    // Validate value matches type hint
    this.validateValueType(dto.value, dto.valueType || existing.valueType);

    const userId = req.user?.s || req.user?.userId || req.user?.sub || 'ADMIN';
    await this.configService.set(g, k, dto.value, userId, {
      description: dto.description,
      valueType: dto.valueType,
    });

    const updated = await this.configService.getEntity(g, k);
    return {
      success: true,
      message: `Config [${g}:${k}] updated to "${dto.value}"`,
      data: updated,
    };
  }

  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  // DEACTIVATE / REACTIVATE / DELETE
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

  /**
   * Soft-delete (deactivate) a config entry. Row preserved for audit.
   */
  @Patch(':group/:key/deactivate')
  @ApiOperation({ summary: 'Deactivate (soft-delete) a config entry' })
  @ApiParam({ name: 'group', example: 'FEATURE' })
  @ApiParam({ name: 'key', example: 'MAINTENANCE_MODE' })
  async deactivate(
    @Param('group') group: string,
    @Param('key') key: string,
    @Req() req: any,
  ) {
    const g = group.toUpperCase();
    const k = key.toUpperCase();

    const existing = await this.configService.getEntity(g, k);
    if (!existing) {
      throw new NotFoundException(`Config [${g}:${k}] not found`);
    }

    const userId = req.user?.s || req.user?.userId || req.user?.sub || 'ADMIN';
    await this.configService.deactivate(g, k, userId);
    return {
      success: true,
      message: `Config [${g}:${k}] deactivated`,
    };
  }

  /**
   * Reactivate a previously deactivated config entry.
   */
  @Patch(':group/:key/reactivate')
  @ApiOperation({ summary: 'Reactivate a deactivated config entry' })
  @ApiParam({ name: 'group', example: 'FEATURE' })
  @ApiParam({ name: 'key', example: 'MAINTENANCE_MODE' })
  async reactivate(
    @Param('group') group: string,
    @Param('key') key: string,
    @Req() req: any,
  ) {
    const g = group.toUpperCase();
    const k = key.toUpperCase();

    const userId = req.user?.s || req.user?.userId || req.user?.sub || 'ADMIN';
    try {
      await this.configService.reactivate(g, k, userId);
    } catch {
      throw new NotFoundException(`Config [${g}:${k}] not found`);
    }
    return {
      success: true,
      message: `Config [${g}:${k}] reactivated`,
    };
  }

  /**
   * Permanently delete a config entry (hard-delete). Cannot be undone.
   */
  @Delete(':group/:key')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Permanently delete a config entry' })
  @ApiParam({ name: 'group', example: 'TEMP' })
  @ApiParam({ name: 'key', example: 'TEST_KEY' })
  async remove(
    @Param('group') group: string,
    @Param('key') key: string,
  ) {
    const g = group.toUpperCase();
    const k = key.toUpperCase();

    const deleted = await this.configService.remove(g, k);
    if (!deleted) {
      throw new NotFoundException(`Config [${g}:${k}] not found`);
    }
    return {
      success: true,
      message: `Config [${g}:${k}] permanently deleted`,
    };
  }

  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  // HELPERS
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

  private validateValueType(value: string, valueType: string): void {
    switch (valueType) {
      case 'NUMBER':
        if (isNaN(Number(value))) {
          throw new BadRequestException(`Value "${value}" is not a valid NUMBER`);
        }
        break;
      case 'BOOLEAN':
        if (!['true', 'false', '0', '1'].includes(value.toLowerCase())) {
          throw new BadRequestException(`Value "${value}" is not a valid BOOLEAN (use true/false/0/1)`);
        }
        break;
      case 'JSON':
        try {
          JSON.parse(value);
        } catch {
          throw new BadRequestException(`Value is not valid JSON`);
        }
        break;
      // STRING and ENUM â€” no extra validation
    }
  }
}
