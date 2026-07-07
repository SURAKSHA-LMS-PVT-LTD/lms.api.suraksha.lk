/**
 * Attendance Alias Controller
 *
 * Provides shorthand routes at /institute/:instituteId for attendance queries.
 * The frontend AttendanceApiClient calls these paths directly instead of the
 * full /api/attendance/institute/:instituteId paths.
 */
import { Controller, Get, Query, Param, HttpException, HttpStatus, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam } from '@nestjs/swagger';
import { AttendanceService } from './attendance.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { FlexibleAccessGuard } from '../../auth/guards/flexible-access.guard';
import { RequireAnyOfRoles } from '../../auth/decorators/flexible-access.decorator';
import { UserType } from '../user/enums/user-type.enum';
import { resolveAttendanceDateRange } from './utils/attendance-date-range.util';
import { AttendanceCacheService } from './services/attendance-cache.service';

@ApiTags('Attendance (Alias)')
@UseGuards(JwtAuthGuard)
@Controller('institute')
export class AttendanceAliasController {
  constructor(
    private readonly attendanceService: AttendanceService,
    private readonly attendanceCache: AttendanceCacheService,
  ) {}

  /**
   * GET /institute/:instituteId?month=YYYY-MM (or startDate/endDate)
   * Alias for GET /api/attendance/institute/:instituteId
   */
  @Get(':instituteId')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({
    global: [UserType.SUPERADMIN],
    instituteAdmin: true,
    teacher: true,
    attendanceMarker: true,
    student: { allowSelfOnly: true },
    parent: { requireStudent: true },
  })
  @ApiOperation({
    summary: 'Get institute attendance records (alias)',
    description: 'Alias route for /api/attendance/institute/:instituteId. month=YYYY-MM preferred; startDate/endDate accepted up to 31 days / 2 adjacent months.',
  })
  @ApiParam({ name: 'instituteId', description: 'Institute ID' })
  @ApiResponse({ status: 200, description: 'Attendance records retrieved successfully' })
  @ApiResponse({ status: 400, description: 'Invalid date parameters' })
  async getInstituteAttendance(
    @Param('instituteId') instituteId: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('month') month?: string,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 50,
    @Query('status') status?: string,
    @Query('studentId') studentId?: string,
  ) {
    try {
      // Unified month/range rule (matches monthly partitioning): month=YYYY-MM
      // preferred; startDate/endDate accepted up to 31 days / 2 adjacent months.
      // Defaults to the last 7 days when nothing is given (previous behavior).
      const range = resolveAttendanceDateRange({ month, startDate, endDate }, { defaultDays: 7 });
      startDate = range.startDate;
      endDate = range.endDate;

      // Month-scoped cache: past months immutable (long TTL), current month short TTL.
      // No-op unless ATTENDANCE_CACHE_ENABLED + CACHE_ENABLED.
      return await this.attendanceCache.getOrCompute(
        ['inst', instituteId, startDate, endDate, page, limit, status, studentId],
        endDate,
        () => this.attendanceService.getInstituteAttendance({
          instituteId,
          startDate,
          endDate,
          page,
          limit,
          status,
          studentId,
        }),
      );
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }

      throw new HttpException(
        {
          success: false,
          message: error.message || 'Failed to retrieve institute attendance records',
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * GET /institute/:instituteId/class/:classId?month=YYYY-MM (or startDate/endDate)
   * Alias for GET /api/attendance/institute/:instituteId/class/:classId
   */
  @Get(':instituteId/class/:classId')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({
    global: [UserType.SUPERADMIN],
    instituteAdmin: true,
    teacher: true,
    attendanceMarker: true,
    student: { allowSelfOnly: true },
    parent: { requireStudent: true },
  })
  @ApiOperation({
    summary: 'Get class attendance records (alias)',
    description: 'Alias route for /api/attendance/institute/:instituteId/class/:classId. month=YYYY-MM preferred.',
  })
  @ApiParam({ name: 'instituteId', description: 'Institute ID' })
  @ApiParam({ name: 'classId', description: 'Class ID' })
  async getClassAttendance(
    @Param('instituteId') instituteId: string,
    @Param('classId') classId: string,
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
    @Query('month') month?: string,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 50,
    @Query('status') status?: string,
    @Query('studentId') studentId?: string,
  ) {
    try {
      // Unified month/range rule (matches monthly partitioning).
      const range = resolveAttendanceDateRange({ month, startDate, endDate });
      if (!range) {
        throw new HttpException(
          { success: false, message: 'Provide month=YYYY-MM (preferred) or startDate and endDate.' },
          HttpStatus.BAD_REQUEST,
        );
      }
      startDate = range.startDate;
      endDate = range.endDate;

      return await this.attendanceCache.getOrCompute(
        ['cls', instituteId, classId, startDate, endDate, page, limit, status, studentId],
        endDate,
        () => this.attendanceService.getClassAttendance({
          instituteId,
          classId,
          startDate,
          endDate,
          page,
          limit,
          status,
          studentId,
        }),
      );
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new HttpException(
        { success: false, message: error.message || 'Failed to retrieve class attendance records' },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * GET /institute/:instituteId/class/:classId/subject/:subjectId?month=YYYY-MM (or startDate/endDate)
   * Alias for GET /api/attendance/institute/:instituteId/class/:classId/subject/:subjectId
   */
  @Get(':instituteId/class/:classId/subject/:subjectId')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({
    global: [UserType.SUPERADMIN],
    instituteAdmin: true,
    teacher: true,
    attendanceMarker: true,
    student: { allowSelfOnly: true },
    parent: { requireStudent: true },
  })
  @ApiOperation({
    summary: 'Get subject attendance records (alias)',
    description: 'Alias route for /api/attendance/institute/:instituteId/class/:classId/subject/:subjectId. month=YYYY-MM preferred.',
  })
  @ApiParam({ name: 'instituteId', description: 'Institute ID' })
  @ApiParam({ name: 'classId', description: 'Class ID' })
  @ApiParam({ name: 'subjectId', description: 'Subject ID' })
  async getSubjectAttendance(
    @Param('instituteId') instituteId: string,
    @Param('classId') classId: string,
    @Param('subjectId') subjectId: string,
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
    @Query('month') month?: string,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 50,
    @Query('status') status?: string,
    @Query('studentId') studentId?: string,
  ) {
    try {
      // Unified month/range rule (matches monthly partitioning).
      const range = resolveAttendanceDateRange({ month, startDate, endDate });
      if (!range) {
        throw new HttpException(
          { success: false, message: 'Provide month=YYYY-MM (preferred) or startDate and endDate.' },
          HttpStatus.BAD_REQUEST,
        );
      }
      startDate = range.startDate;
      endDate = range.endDate;

      return await this.attendanceCache.getOrCompute(
        ['subj', instituteId, classId, subjectId, startDate, endDate, page, limit, status, studentId],
        endDate,
        () => this.attendanceService.getSubjectAttendance({
          instituteId,
          classId,
          subjectId,
          startDate,
          endDate,
          page,
          limit,
          status,
          studentId,
        }),
      );
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new HttpException(
        { success: false, message: error.message || 'Failed to retrieve subject attendance records' },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
