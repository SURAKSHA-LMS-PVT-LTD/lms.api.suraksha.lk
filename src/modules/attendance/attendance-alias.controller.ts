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

@ApiTags('Attendance (Alias)')
@UseGuards(JwtAuthGuard)
@Controller('institute')
export class AttendanceAliasController {
  constructor(
    private readonly attendanceService: AttendanceService,
  ) {}

  /**
   * GET /institute/:instituteId?startDate=...&endDate=...&limit=...
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
    description: 'Alias route for /api/attendance/institute/:instituteId. Retrieves attendance records for a specific institute with date range filtering.',
  })
  @ApiParam({ name: 'instituteId', description: 'Institute ID' })
  @ApiResponse({ status: 200, description: 'Attendance records retrieved successfully' })
  @ApiResponse({ status: 400, description: 'Missing required date parameters' })
  async getInstituteAttendance(
    @Param('instituteId') instituteId: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 50,
    @Query('status') status?: string,
    @Query('studentId') studentId?: string,
  ) {
    try {
      // Default to last 7 days if dates not provided
      if (!startDate || !endDate) {
        const now = new Date();
        const sevenDaysAgo = new Date(now);
        sevenDaysAgo.setDate(now.getDate() - 7);
        
        startDate = startDate || sevenDaysAgo.toISOString().split('T')[0];
        endDate = endDate || now.toISOString().split('T')[0];
      }

      const start = new Date(startDate);
      const end = new Date(endDate);
      const daysDiff = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));

      const maxDays = studentId ? 30 : 5;
      if (daysDiff > maxDays) {
        throw new HttpException(
          {
            success: false,
            message: studentId
              ? 'Date range cannot exceed 30 days when filtering by studentId'
              : 'Date range cannot exceed 5 days for institute-wide queries. Add studentId parameter to query up to 30 days.',
          },
          HttpStatus.BAD_REQUEST,
        );
      }

      return await this.attendanceService.getInstituteAttendance({
        instituteId,
        startDate,
        endDate,
        page,
        limit,
        status,
        studentId,
      });
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
   * GET /institute/:instituteId/class/:classId?startDate=...&endDate=...
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
    description: 'Alias route for /api/attendance/institute/:instituteId/class/:classId',
  })
  @ApiParam({ name: 'instituteId', description: 'Institute ID' })
  @ApiParam({ name: 'classId', description: 'Class ID' })
  async getClassAttendance(
    @Param('instituteId') instituteId: string,
    @Param('classId') classId: string,
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 50,
    @Query('status') status?: string,
    @Query('studentId') studentId?: string,
  ) {
    try {
      if (!startDate || !endDate) {
        throw new HttpException(
          { success: false, message: 'startDate and endDate are required parameters' },
          HttpStatus.BAD_REQUEST,
        );
      }

      const start = new Date(startDate);
      const end = new Date(endDate);
      const daysDiff = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
      const maxDays = studentId ? 30 : 5;
      if (daysDiff > maxDays) {
        throw new HttpException(
          {
            success: false,
            message: studentId
              ? 'Date range cannot exceed 30 days when filtering by studentId'
              : 'Date range cannot exceed 5 days. Add studentId to query up to 30 days.',
          },
          HttpStatus.BAD_REQUEST,
        );
      }

      return await this.attendanceService.getClassAttendance({
        instituteId,
        classId,
        startDate,
        endDate,
        page,
        limit,
        status,
        studentId,
      });
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new HttpException(
        { success: false, message: error.message || 'Failed to retrieve class attendance records' },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * GET /institute/:instituteId/class/:classId/subject/:subjectId?startDate=...&endDate=...
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
    description: 'Alias route for /api/attendance/institute/:instituteId/class/:classId/subject/:subjectId',
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
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 50,
    @Query('status') status?: string,
    @Query('studentId') studentId?: string,
  ) {
    try {
      if (!startDate || !endDate) {
        throw new HttpException(
          { success: false, message: 'startDate and endDate are required parameters' },
          HttpStatus.BAD_REQUEST,
        );
      }

      const start = new Date(startDate);
      const end = new Date(endDate);
      const daysDiff = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
      const maxDays = studentId ? 30 : 5;
      if (daysDiff > maxDays) {
        throw new HttpException(
          {
            success: false,
            message: studentId
              ? 'Date range cannot exceed 30 days when filtering by studentId'
              : 'Date range cannot exceed 5 days. Add studentId to query up to 30 days.',
          },
          HttpStatus.BAD_REQUEST,
        );
      }

      return await this.attendanceService.getSubjectAttendance({
        instituteId,
        classId,
        subjectId,
        startDate,
        endDate,
        page,
        limit,
        status,
        studentId,
      });
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new HttpException(
        { success: false, message: error.message || 'Failed to retrieve subject attendance records' },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
