import {
  Controller, Post, Body, Param, Req,
  UseGuards, HttpCode, HttpStatus, ForbiddenException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiParam } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { InstituteApiKeyGuard } from '../guards/institute-api-key.guard';
import { ApiKeyScope } from '../entities/institute-api-key.entity';
import { ExternalAttendanceService } from '../services/external-attendance.service';
import { BulkExternalAttendanceDto } from '../dto/external-attendance.dto';
import { SkipOriginValidation } from '../../../common/decorators/skip-origin-validation.decorator';
import { Public } from '../../../common/decorators/public.decorator';

@ApiTags('External API — Attendance')
@ApiBearerAuth()
@Public()
@SkipOriginValidation()
@Controller('api/external/v1/attendance')
@UseGuards(InstituteApiKeyGuard)
export class ExternalAttendanceController {
  constructor(private readonly svc: ExternalAttendanceService) {}

  /**
   * POST /api/external/v1/attendance/sessions/:sessionId/mark-bulk
   *
   * Bulk-mark attendance for a session using an institute API key.
   * The API key already identifies which institute this request belongs to —
   * no need to supply instituteId in the URL.
   *
   * Only students that are actively enrolled in the session's class can be marked.
   * Unknown or unenrolled student IDs appear in the failures list with a reason.
   */
  @Post('sessions/:sessionId/mark-bulk')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 30, ttl: 60000 } }) // 30 bulk calls per minute per IP
  @ApiOperation({
    summary: 'Bulk mark session attendance via API key',
    description:
      'Marks attendance for multiple students in a single session. ' +
      'The API key must have the ATTENDANCE_MARK scope. ' +
      'Students not enrolled in the session\'s class will be rejected with a reason. ' +
      'Returns a per-record breakdown of successes and failures.',
  })
  @ApiParam({ name: 'sessionId', description: 'Attendance session ID' })
  @ApiResponse({
    status: 200,
    description: 'Bulk mark complete — check successCount and failures for details',
    schema: {
      example: {
        sessionId: '42',
        successCount: 3,
        failedCount: 1,
        failures: [
          { studentId: '999', reason: 'Student is not enrolled in this class' },
        ],
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Missing or invalid API key' })
  @ApiResponse({ status: 403, description: 'API key lacks ATTENDANCE_MARK scope, or session is closed / wrong date' })
  @ApiResponse({ status: 404, description: 'Session not found for this institute' })
  async bulkMark(
    @Param('sessionId') sessionId: string,
    @Body() dto: BulkExternalAttendanceDto,
    @Req() req: any,
  ) {
    const apiKey = req.apiKey;

    if (!apiKey.scopes?.includes(ApiKeyScope.ATTENDANCE_MARK)) {
      throw new ForbiddenException(`API key does not have the '${ApiKeyScope.ATTENDANCE_MARK}' scope`);
    }

    return this.svc.bulkMarkAttendance(sessionId, req.instituteId, dto, apiKey.id);
  }
}
