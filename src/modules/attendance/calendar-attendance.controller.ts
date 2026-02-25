import { Controller, Get, Param, Query, HttpException, HttpStatus, UseGuards, BadRequestException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiParam, ApiQuery, ApiResponse } from '@nestjs/swagger';
import { AttendanceService } from './attendance.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { FlexibleAccessGuard } from '../../auth/guards/flexible-access.guard';
import { RequireAnyOfRoles } from '../../auth/decorators/flexible-access.decorator';
import { UserType } from '../user/enums/user-type.enum';
import { AttendanceUserType } from './dto/attendance.dto';

// ✅ SEC-001: Valid user types for attendance queries
const VALID_USER_TYPES = Object.values(AttendanceUserType);

/**
 * Calendar-linked attendance query endpoints.
 *
 * All routes are scoped under:
 *   /api/attendance/calendar/institute/:instituteId/...
 *
 * ⚠️  JWT validation (FlexibleAccessGuard) reads `params.instituteId`,
 *     `params.classId`, and `params.subjectId` from the request to verify
 *     the caller has the correct role in that specific institute/class/subject.
 *     Always keep these identifiers in the URL or query so the guard can
 *     validate them properly.
 */
@ApiTags('Attendance - Calendar Queries')
@Controller('api/attendance/calendar')
export class CalendarAttendanceController {
  constructor(private readonly attendanceService: AttendanceService) {}

  // ─────────────────────────────────────────────────────────────────────────
  // 1. GET ATTENDANCE BY EVENT
  //    Who attended a specific calendar event (Parents Meeting, Exam, Sports Day…)
  //
  //    URL params:  instituteId  → FlexibleAccessGuard institute role check
  //                 eventId      → calendar event to query
  //    Query:       classId?     → guard uses for teacher class-level auth
  //                 subjectId?   → guard uses for teacher subject-level auth
  //                 date?        → narrow results to a specific YYYY-MM-DD date
  // ─────────────────────────────────────────────────────────────────────────
  @Get('institute/:instituteId/event/:eventId')
  @UseGuards(JwtAuthGuard, FlexibleAccessGuard)
  @RequireAnyOfRoles({
    global: [UserType.SUPERADMIN],
    instituteAdmin: true,
    teacher: true,
    attendanceMarker: true,
  })
  @ApiOperation({
    summary: 'Get attendance for a calendar event',
    description:
      'Returns all attendance records linked to a specific calendar event (e.g. Parents Meeting, Exam, Field Trip). ' +
      'Pass classId / subjectId as query params if you want the JWT guard to enforce class or subject-level access.',
  })
  @ApiParam({ name: 'instituteId', description: 'Institute ID — used by JWT guard for role verification' })
  @ApiParam({ name: 'eventId', description: 'Calendar event ID (institute_calendar_events.id)' })
  @ApiQuery({ name: 'date', required: false, description: 'Filter to a specific date (YYYY-MM-DD)' })
  @ApiQuery({ name: 'classId', required: false, description: 'Class ID — passed for JWT guard class-level auth' })
  @ApiQuery({ name: 'subjectId', required: false, description: 'Subject ID — passed for JWT guard subject-level auth' })
  @ApiResponse({ status: 200, description: 'Attendance records for the event' })
  async getAttendanceByEvent(
    @Param('instituteId') instituteId: string,
    @Param('eventId') eventId: string,
    @Query('date') date?: string,
    // classId / subjectId are read by FlexibleAccessGuard from the request; 
    // they are not used in the service call but must be accepted to keep the
    // guard's params extraction working correctly.
    @Query('classId') _classId?: string,
    @Query('subjectId') _subjectId?: string,
  ): Promise<any> {
    try {
      return await this.attendanceService.getAttendanceByEvent(instituteId, eventId, date);
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new HttpException(
        { success: false, message: error.message || 'Failed to get event attendance' },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 2. GET ATTENDANCE BY CALENDAR DAY
  //    Full view of everyone who attended on a given calendar day
  //    (students + teachers + parents combined or filtered by userType)
  //
  //    URL params:  instituteId   → institute role check
  //                 calendarDayId → which calendar day to query
  //    Query:       classId?      → JWT guard class-level auth
  //                 subjectId?    → JWT guard subject-level auth
  //                 userType?     → STUDENT | TEACHER | PARENT | etc.
  // ─────────────────────────────────────────────────────────────────────────
  @Get('institute/:instituteId/calendar-day/:calendarDayId')
  @UseGuards(JwtAuthGuard, FlexibleAccessGuard)
  @RequireAnyOfRoles({
    global: [UserType.SUPERADMIN],
    instituteAdmin: true,
    teacher: true,
    attendanceMarker: true,
  })
  @ApiOperation({
    summary: 'Get all attendance for a calendar day',
    description:
      'Returns attendance for all user types (students, teachers, parents) on a specific calendar day. ' +
      'Filter by userType to see only one group.',
  })
  @ApiParam({ name: 'instituteId', description: 'Institute ID — used by JWT guard for role verification' })
  @ApiParam({ name: 'calendarDayId', description: 'Calendar day ID (institute_calendar_days.id)' })
  @ApiQuery({ name: 'userType', required: false, description: 'Filter by user type: STUDENT | TEACHER | PARENT | INSTITUTE_ADMIN | ATTENDANCE_MARKER' })
  @ApiQuery({ name: 'classId', required: false, description: 'Class ID — passed for JWT guard class-level auth' })
  @ApiQuery({ name: 'subjectId', required: false, description: 'Subject ID — passed for JWT guard subject-level auth' })
  @ApiResponse({ status: 200, description: 'Attendance records for the calendar day' })
  async getAttendanceByCalendarDay(
    @Param('instituteId') instituteId: string,
    @Param('calendarDayId') calendarDayId: string,
    @Query('userType') userType?: string,
    @Query('classId') _classId?: string,
    @Query('subjectId') _subjectId?: string,
  ): Promise<any> {
    try {
      // ✅ SEC-001: Validate userType against enum
      if (userType && !VALID_USER_TYPES.includes(userType as AttendanceUserType)) {
        throw new BadRequestException(
          `Invalid userType: '${userType}'. Valid values: ${VALID_USER_TYPES.join(', ')}`,
        );
      }
      return await this.attendanceService.getAttendanceByCalendarDay(instituteId, calendarDayId, userType);
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new HttpException(
        { success: false, message: error.message || 'Failed to get calendar day attendance' },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 3. GET ATTENDANCE BY USER TYPE
  //    All teacher attendance, all parent attendance, all student attendance…
  //
  //    URL params:  instituteId  → institute role check
  //                 userType     → which user type to query
  //    Query:       classId?     → JWT guard class-level auth
  //                 subjectId?   → JWT guard subject-level auth
  //                 date?        → narrow to YYYY-MM-DD
  //                 eventId?     → narrow to a specific event
  // ─────────────────────────────────────────────────────────────────────────
  @Get('institute/:instituteId/user-type/:userType')
  @UseGuards(JwtAuthGuard, FlexibleAccessGuard)
  @RequireAnyOfRoles({
    global: [UserType.SUPERADMIN],
    instituteAdmin: true,
    teacher: true,
    attendanceMarker: true,
  })
  @ApiOperation({
    summary: 'Get attendance records filtered by user type (institute-wide)',
    description:
      'Returns attendance for a specific user type (STUDENT, TEACHER, PARENT, etc.) in an institute. ' +
      'Optionally filter by date and/or eventId.',
  })
  @ApiParam({ name: 'instituteId', description: 'Institute ID — used by JWT guard for role verification' })
  @ApiParam({ name: 'userType', description: 'User type to filter: STUDENT | TEACHER | PARENT | INSTITUTE_ADMIN | ATTENDANCE_MARKER' })
  @ApiQuery({ name: 'date', required: false, description: 'Filter to a specific date (YYYY-MM-DD)' })
  @ApiQuery({ name: 'eventId', required: false, description: 'Filter to a specific calendar event ID' })
  @ApiQuery({ name: 'classId', required: false, description: 'Class ID — passed for JWT guard class-level auth' })
  @ApiQuery({ name: 'subjectId', required: false, description: 'Subject ID — passed for JWT guard subject-level auth' })
  @ApiResponse({ status: 200, description: 'Attendance records for the requested user type' })
  async getAttendanceByUserType(
    @Param('instituteId') instituteId: string,
    @Param('userType') userType: string,
    @Query('date') date?: string,
    @Query('eventId') eventId?: string,
    @Query('classId') _classId?: string,
    @Query('subjectId') _subjectId?: string,
  ): Promise<any> {
    try {
      // ✅ SEC-001: Validate userType against enum
      if (!VALID_USER_TYPES.includes(userType as AttendanceUserType)) {
        throw new BadRequestException(
          `Invalid userType: '${userType}'. Valid values: ${VALID_USER_TYPES.join(', ')}`,
        );
      }
      return await this.attendanceService.getAttendanceByUserType(instituteId, userType, date, eventId);
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new HttpException(
        { success: false, message: error.message || 'Failed to get user type attendance' },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 3b. GET ATTENDANCE BY USER TYPE — CLASS-SCOPED
  //     Same as 3 but filtered to a specific class
  // ─────────────────────────────────────────────────────────────────────────
  @Get('institute/:instituteId/class/:classId/user-type/:userType')
  @UseGuards(JwtAuthGuard, FlexibleAccessGuard)
  @RequireAnyOfRoles({
    global: [UserType.SUPERADMIN],
    instituteAdmin: true,
    teacher: true,
    attendanceMarker: true,
  })
  @ApiOperation({
    summary: 'Get attendance records filtered by user type (class-scoped)',
    description:
      'Returns attendance for a specific user type within a specific class. ' +
      'Optionally filter by date and/or eventId.',
  })
  @ApiParam({ name: 'instituteId', description: 'Institute ID' })
  @ApiParam({ name: 'classId', description: 'Class ID to scope results' })
  @ApiParam({ name: 'userType', description: 'User type: STUDENT | TEACHER | PARENT | INSTITUTE_ADMIN | ATTENDANCE_MARKER' })
  @ApiQuery({ name: 'date', required: false, description: 'Filter to a specific date (YYYY-MM-DD)' })
  @ApiQuery({ name: 'eventId', required: false, description: 'Filter to a specific calendar event ID' })
  @ApiResponse({ status: 200, description: 'Class-scoped attendance records for the requested user type' })
  async getAttendanceByUserTypeForClass(
    @Param('instituteId') instituteId: string,
    @Param('classId') classId: string,
    @Param('userType') userType: string,
    @Query('date') date?: string,
    @Query('eventId') eventId?: string,
  ): Promise<any> {
    try {
      if (!VALID_USER_TYPES.includes(userType as AttendanceUserType)) {
        throw new BadRequestException(
          `Invalid userType: '${userType}'. Valid values: ${VALID_USER_TYPES.join(', ')}`,
        );
      }
      return await this.attendanceService.getAttendanceByUserType(instituteId, userType, date, eventId, classId);
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new HttpException(
        { success: false, message: error.message || 'Failed to get class user type attendance' },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 3c. GET ATTENDANCE BY USER TYPE — SUBJECT-SCOPED
  //     Same as 3 but filtered to a specific class + subject
  // ─────────────────────────────────────────────────────────────────────────
  @Get('institute/:instituteId/class/:classId/subject/:subjectId/user-type/:userType')
  @UseGuards(JwtAuthGuard, FlexibleAccessGuard)
  @RequireAnyOfRoles({
    global: [UserType.SUPERADMIN],
    instituteAdmin: true,
    teacher: true,
    attendanceMarker: true,
  })
  @ApiOperation({
    summary: 'Get attendance records filtered by user type (subject-scoped)',
    description:
      'Returns attendance for a specific user type within a specific class and subject. ' +
      'Optionally filter by date and/or eventId.',
  })
  @ApiParam({ name: 'instituteId', description: 'Institute ID' })
  @ApiParam({ name: 'classId', description: 'Class ID' })
  @ApiParam({ name: 'subjectId', description: 'Subject ID to scope results' })
  @ApiParam({ name: 'userType', description: 'User type: STUDENT | TEACHER | PARENT | INSTITUTE_ADMIN | ATTENDANCE_MARKER' })
  @ApiQuery({ name: 'date', required: false, description: 'Filter to a specific date (YYYY-MM-DD)' })
  @ApiQuery({ name: 'eventId', required: false, description: 'Filter to a specific calendar event ID' })
  @ApiResponse({ status: 200, description: 'Subject-scoped attendance records for the requested user type' })
  async getAttendanceByUserTypeForSubject(
    @Param('instituteId') instituteId: string,
    @Param('classId') classId: string,
    @Param('subjectId') subjectId: string,
    @Param('userType') userType: string,
    @Query('date') date?: string,
    @Query('eventId') eventId?: string,
  ): Promise<any> {
    try {
      if (!VALID_USER_TYPES.includes(userType as AttendanceUserType)) {
        throw new BadRequestException(
          `Invalid userType: '${userType}'. Valid values: ${VALID_USER_TYPES.join(', ')}`,
        );
      }
      return await this.attendanceService.getAttendanceByUserType(instituteId, userType, date, eventId, classId, subjectId);
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new HttpException(
        { success: false, message: error.message || 'Failed to get subject user type attendance' },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 4. GET STUDENT ATTENDANCE AT A SPECIFIC EVENT
  //    Did this student attend the exam? Did they attend the field trip?
  //
  //    URL params:  instituteId  → institute role check
  //                 studentId    → the student to query
  //                 eventId      → the specific event
  //    Query:       classId?     → JWT guard class-level auth
  //                 subjectId?   → JWT guard subject-level auth
  //                 startDate?   → date range start (YYYY-MM-DD)
  //                 endDate?     → date range end   (YYYY-MM-DD)
  // ─────────────────────────────────────────────────────────────────────────
  @Get('institute/:instituteId/student/:studentId/event/:eventId')
  @UseGuards(JwtAuthGuard, FlexibleAccessGuard)
  @RequireAnyOfRoles({
    global: [UserType.SUPERADMIN],
    instituteAdmin: true,
    teacher: true,
    attendanceMarker: true,
    student: { allowSelfOnly: true },
    parent: { requireStudent: true },
  })
  @ApiOperation({
    summary: "Get a student's attendance at a specific event",
    description:
      "Returns a student's attendance records linked to a specific event ID. " +
      'Students can only access their own data (allowSelfOnly). ' +
      'Parents can access their child\'s data (requireStudent). ' +
      'Optionally filter by date range.',
  })
  @ApiParam({ name: 'instituteId', description: 'Institute ID — used by JWT guard for role verification' })
  @ApiParam({ name: 'studentId', description: 'Student user ID' })
  @ApiParam({ name: 'eventId', description: 'Calendar event ID' })
  @ApiQuery({ name: 'startDate', required: false, description: 'Date range start (YYYY-MM-DD)' })
  @ApiQuery({ name: 'endDate', required: false, description: 'Date range end (YYYY-MM-DD)' })
  @ApiQuery({ name: 'classId', required: false, description: 'Class ID — passed for JWT guard class-level auth' })
  @ApiQuery({ name: 'subjectId', required: false, description: 'Subject ID — passed for JWT guard subject-level auth' })
  @ApiResponse({ status: 200, description: "Student's event attendance records" })
  async getStudentAttendanceByEvent(
    @Param('instituteId') instituteId: string,
    @Param('studentId') studentId: string,
    @Param('eventId') eventId: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('classId') _classId?: string,
    @Query('subjectId') _subjectId?: string,
  ): Promise<any> {
    try {
      return await this.attendanceService.getStudentAttendanceByEvent(studentId, instituteId, eventId, startDate, endDate);
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new HttpException(
        { success: false, message: error.message || 'Failed to get student event attendance' },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
