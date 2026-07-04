import {
  Controller, Post, Body, Req,
  UseGuards, HttpCode, HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { InstituteApiKeyGuard } from '../guards/institute-api-key.guard';
import { ApiKeyScopeGuard } from '../guards/api-key-scope.guard';
import { RequireApiKeyScope } from '../decorators/require-api-key-scope.decorator';
import { ApiKeyScope } from '../entities/institute-api-key.entity';
import { ExternalStudentService } from '../services/external-student.service';
import { BulkExternalStudentDto } from '../dto/external-student.dto';
import { SkipOriginValidation } from '../../../common/decorators/skip-origin-validation.decorator';
import { Public } from '../../../common/decorators/public.decorator';

@ApiTags('External API — Students')
@ApiBearerAuth()
@Public()
@SkipOriginValidation()
@Controller('api/external/v1/students')
@UseGuards(InstituteApiKeyGuard, ApiKeyScopeGuard)
export class ExternalStudentController {
  constructor(private readonly svc: ExternalStudentService) {}

  /**
   * POST /api/external/v1/students/bulk
   *
   * Create (or link) students and assign them to the institute that owns the API key.
   * The API key identifies the institute — no instituteId in the URL.
   *
   * Per record:
   *   - userId given          → link that existing user
   *   - phoneNumber matches    → link the matched user
   *   - otherwise              → create a new student-capable user + students row
   * The institute membership is then created (or its extraData updated) as STUDENT/ACTIVE.
   *
   * Touches only users + students + institute_user. No parents, no notifications.
   */
  @Post('bulk')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @RequireApiKeyScope(ApiKeyScope.STUDENT_CREATE)
  @ApiOperation({
    summary: 'Bulk create/link students via API key',
    description:
      'Creates or links multiple students in one call and assigns them to the institute with ' +
      'institute-defined extra columns. The API key must have the STUDENT_CREATE scope. ' +
      'Tolerant of duplicates: an existing user (matched by userId or phone) is linked rather than ' +
      'rejected. Returns a per-record breakdown of successes and failures.',
  })
  @ApiResponse({
    status: 200,
    description: 'Bulk create complete — check results and failures for details',
    schema: {
      example: {
        instituteId: '12',
        successCount: 2,
        failedCount: 0,
        results: [
          { index: 0, userId: '500423', action: 'created', assignmentCreated: true },
          { index: 1, userId: '500111', action: 'linked', assignmentCreated: true },
        ],
        failures: [],
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Missing or invalid API key' })
  @ApiResponse({ status: 403, description: 'API key lacks STUDENT_CREATE scope' })
  async bulkCreate(@Body() dto: BulkExternalStudentDto, @Req() req: any) {
    return this.svc.bulkCreateStudents(req.instituteId, dto);
  }
}
