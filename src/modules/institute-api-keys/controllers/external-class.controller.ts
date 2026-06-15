import {
  Controller, Get, Post, Body, Param, Query, Req,
  UseGuards, HttpCode, HttpStatus, ForbiddenException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiParam, ApiQuery } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { InstituteApiKeyGuard } from '../guards/institute-api-key.guard';
import { ApiKeyScope } from '../entities/institute-api-key.entity';
import { ExternalClassService } from '../services/external-class.service';
import { CreateExternalSessionDto } from '../dto/external-class.dto';
import { SkipOriginValidation } from '../../../common/decorators/skip-origin-validation.decorator';
import { Public } from '../../../common/decorators/public.decorator';

@ApiTags('External API — Classes & Sessions')
@ApiBearerAuth()
@Public()
@SkipOriginValidation()
@Controller('api/external/v1/classes')
@UseGuards(InstituteApiKeyGuard)
export class ExternalClassController {
  constructor(private readonly svc: ExternalClassService) {}

  private requireScope(req: any, scope: ApiKeyScope) {
    if (!req.apiKey?.scopes?.includes(scope)) {
      throw new ForbiddenException(`API key does not have the '${scope}' scope`);
    }
  }

  /**
   * GET /api/external/v1/classes
   * List all classes for the institute that owns the API key (id + name + identifiers).
   */
  @Get()
  @Throttle({ default: { limit: 60, ttl: 60000 } })
  @ApiOperation({
    summary: 'List institute classes via API key',
    description: 'Returns all classes for the API key\'s institute. Requires the CLASS_READ scope.',
  })
  @ApiQuery({ name: 'search', required: false, description: 'Filter classes by name (substring match)' })
  @ApiResponse({ status: 200, description: 'List of classes (id, name, code, classType, grade, academicYear, isActive)' })
  @ApiResponse({ status: 401, description: 'Missing or invalid API key' })
  @ApiResponse({ status: 403, description: 'API key lacks CLASS_READ scope' })
  async listClasses(@Req() req: any, @Query('search') search?: string) {
    this.requireScope(req, ApiKeyScope.CLASS_READ);
    return this.svc.listClasses(req.instituteId, search);
  }

  /**
   * GET /api/external/v1/classes/:classId/sessions
   * List attendance sessions for a class (id + name + date/time + status).
   */
  @Get(':classId/sessions')
  @Throttle({ default: { limit: 60, ttl: 60000 } })
  @ApiOperation({
    summary: 'List class attendance sessions via API key',
    description: 'Returns sessions for a class belonging to the API key\'s institute. Requires the CLASS_READ scope.',
  })
  @ApiParam({ name: 'classId', description: 'Class ID' })
  @ApiQuery({ name: 'search', required: false, description: 'Filter sessions by name (substring match)' })
  @ApiResponse({ status: 200, description: 'List of sessions (id, name, classId, date, startTime, endTime, isClosed, totalStudents)' })
  @ApiResponse({ status: 401, description: 'Missing or invalid API key' })
  @ApiResponse({ status: 403, description: 'API key lacks CLASS_READ scope' })
  @ApiResponse({ status: 404, description: 'Class not found for this institute' })
  async listSessions(
    @Param('classId') classId: string,
    @Req() req: any,
    @Query('search') search?: string,
  ) {
    this.requireScope(req, ApiKeyScope.CLASS_READ);
    return this.svc.listSessions(req.instituteId, classId, search);
  }

  /**
   * POST /api/external/v1/classes/:classId/sessions
   * Generate a new attendance session for a class (to then mark attendance against).
   */
  @Post(':classId/sessions')
  @HttpCode(HttpStatus.CREATED)
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @ApiOperation({
    summary: 'Generate a class attendance session via API key',
    description:
      'Creates a new attendance session for a class belonging to the API key\'s institute. ' +
      'Requires the SESSION_CREATE scope. The created session does NOT send parent notifications. ' +
      'Returns the new session (use its id with the attendance mark-bulk endpoint).',
  })
  @ApiParam({ name: 'classId', description: 'Class ID' })
  @ApiResponse({ status: 201, description: 'Session created — use the returned id to mark attendance' })
  @ApiResponse({ status: 401, description: 'Missing or invalid API key' })
  @ApiResponse({ status: 403, description: 'API key lacks SESSION_CREATE scope' })
  @ApiResponse({ status: 404, description: 'Class not found for this institute' })
  async createSession(
    @Param('classId') classId: string,
    @Body() dto: CreateExternalSessionDto,
    @Req() req: any,
  ) {
    this.requireScope(req, ApiKeyScope.SESSION_CREATE);
    return this.svc.createSession(req.instituteId, classId, dto);
  }
}
