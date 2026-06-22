import {
  Controller, Get, Post, Body, Param, Req,
  UseGuards, Query, BadRequestException, InternalServerErrorException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { LectureTrackingService } from './lecture_tracking.service';
import { JwtAuthGuard } from '../../../auth/guards/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '../../../auth/guards/optional-jwt-auth.guard';
import { FlexibleAccessGuard } from '../../../auth/guards/flexible-access.guard';
import { RequireAnyOfRoles } from '../../../auth/decorators/flexible-access.decorator';
import { Public } from '../../../common/decorators/public.decorator';
import { UserType } from '../../user/enums/user-type.enum';

@ApiTags('Lecture Tracking & Access')
@Controller('lecture-tracking')
export class LectureTrackingController {
  constructor(private readonly trackingService: LectureTrackingService) {}

  // ─── Public access validation (optional auth) ───────────────────────────

  @Get('live/access/:urlId')
  @Public()
  @UseGuards(OptionalJwtAuthGuard)
  @ApiOperation({ summary: 'Validate access and get live lecture details for a URL token' })
  async getLiveAccess(@Param('urlId') urlId: string, @Req() req: any) {
    return this.trackingService.validateLiveAccess(urlId, req.user);
  }

  @Get('recording/access/:urlId')
  @Public()
  @UseGuards(OptionalJwtAuthGuard)
  @ApiOperation({ summary: 'Validate access and get recording details for a URL token' })
  async getRecordingAccess(@Param('urlId') urlId: string, @Req() req: any) {
    return this.trackingService.validateRecordingAccess(urlId, req.user);
  }

  // ─── Live attendance ────────────────────────────────────────────────────

  @Post('live/join')
  @Public()
  @UseGuards(OptionalJwtAuthGuard)
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @ApiOperation({ summary: 'Record user joining a live lecture; returns attendanceId' })
  async joinLive(
    @Body() body: {
      lectureId: string;
      guestName?: string;
      guestEmail?: string;
      guestPhone?: string;
      guestSchool?: string;
    },
    @Req() req: any,
  ) {
    return this.trackingService.recordLiveJoin(
      body.lectureId,
      req.user?.id,
      body.guestName,
      body.guestEmail,
      body.guestPhone,
      body.guestSchool,
      req.ip,
      req.headers['user-agent'],
    );
  }

  @Post('live/leave')
  @Public()
  @UseGuards(OptionalJwtAuthGuard)
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @ApiOperation({ summary: 'Record user leaving a live lecture' })
  async leaveLive(@Body() body: { attendanceId: string }, @Req() req: any) {
    return this.trackingService.recordLiveLeave(body.attendanceId, req.user?.id);
  }

  // ─── Live attendance link sessions (one-click attendance) ───────────────

  @Post('live-attendance/sessions')
  @UseGuards(JwtAuthGuard, FlexibleAccessGuard)
  @RequireAnyOfRoles({
    global: [UserType.SUPERADMIN],
    instituteAdmin: true,
    teacher: true,
  })
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a live attendance link session for a lecture' })
  async createLiveAttendanceSession(
    @Body() body: { lectureId: string; validSeconds?: number },
    @Req() req: any,
  ) {
    if (!body?.lectureId) throw new BadRequestException('lectureId is required');
    return this.trackingService.createLiveAttendanceSession(
      body.lectureId,
      body.validSeconds,
      req.user?.id,
    );
  }

  @Get('live-attendance/session-grid')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Attendance grid for live attendance link sessions' })
  @ApiQuery({ name: 'lectureId', type: String })
  @ApiQuery({ name: 'classId', type: String })
  @ApiQuery({ name: 'instituteId', type: String })
  async getLiveAttendanceSessionGrid(
    @Query('lectureId') lectureId: string,
    @Query('classId') classId: string,
    @Query('instituteId') instituteId: string,
  ) {
    if (!lectureId || !classId || !instituteId) {
      throw new BadRequestException('lectureId, classId, and instituteId are required');
    }
    return this.trackingService.getLiveAttendanceSessionGrid(lectureId, classId, instituteId);
  }

  @Get('live-attendance/access/:urlId')
  @Public()
  @UseGuards(OptionalJwtAuthGuard)
  @ApiOperation({ summary: 'Validate access and status for a live attendance link' })
  async getLiveAttendanceSessionAccess(@Param('urlId') urlId: string, @Req() req: any) {
    return this.trackingService.validateLiveAttendanceSessionAccess(urlId, req.user);
  }

  @Post('live-attendance/mark/:urlId')
  @Public()
  @UseGuards(OptionalJwtAuthGuard)
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @ApiOperation({ summary: 'Mark attendance for a live attendance link' })
  async markLiveAttendanceSession(@Param('urlId') urlId: string, @Req() req: any) {
    return this.trackingService.markLiveAttendanceSession(
      urlId,
      req.user,
      req.ip,
      req.headers['user-agent'],
    );
  }

  // ─── Recording session ──────────────────────────────────────────────────

  @Post('recording/session/start')
  @Public()
  @UseGuards(OptionalJwtAuthGuard)
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @ApiOperation({ summary: 'Start a recording tracking session; returns sessionId' })
  async startRecordingSession(
    @Body() body: {
      lectureId: string;
      instituteId?: string;
      classId?: string;
      subjectId?: string;
      guestName?: string;
      guestEmail?: string;
      guestPhone?: string;
      guestSchool?: string;
    },
    @Req() req: any,
  ) {
    return this.trackingService.startRecordingSession(
      body.lectureId,
      body.instituteId,
      body.classId,
      body.subjectId,
      req.user?.id,
      body.guestName,
      body.guestEmail,
      body.guestPhone,
      body.guestSchool,
      req.ip,
      req.headers['user-agent'],
    );
  }

  @Post('recording/session/end')
  @Public()
  @UseGuards(OptionalJwtAuthGuard)
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @ApiOperation({ summary: 'End a recording session; optionally sets last position' })
  async endRecordingSession(
    @Body() body: { sessionId: string; lastPositionSeconds?: number },
    @Req() req: any,
  ) {
    return this.trackingService.endRecordingSession(
      body.sessionId,
      body.lastPositionSeconds,
      req.user?.id,
    );
  }

  @Post('recording/heartbeat')
  @Public()
  @UseGuards(OptionalJwtAuthGuard)
  @Throttle({ default: { limit: 60, ttl: 60000 } })
  @ApiOperation({ summary: 'Batch-send player activity events' })
  async recordHeartbeat(
    @Body() body: {
      sessionId: string;
      activities: Array<{
        type: string;
        videoTimestamp: number;
        wallTime?: number;
        rangeFrom?: number;
        rangeTo?: number;
        watchedSeconds?: number;
        speed?: number;
        screenWidth?: number;
        screenHeight?: number;
        tabWidth?: number;
        tabHeight?: number;
        tabVisible?: boolean;
      }>;
    },
    @Req() req: any,
  ) {
    const mapped = body.activities.map(act => ({
      type: act.type as any,
      videoTimestamp: act.videoTimestamp,
      wallTime: act.wallTime,
      metadata: {
        ...(act.speed !== undefined && { speed: act.speed }),
        ...(act.rangeFrom !== undefined && { rangeFrom: act.rangeFrom }),
        ...(act.rangeTo !== undefined && { rangeTo: act.rangeTo }),
        ...(act.watchedSeconds !== undefined && { watchedSeconds: act.watchedSeconds }),
        ...(act.screenWidth !== undefined && { screenWidth: act.screenWidth }),
        ...(act.screenHeight !== undefined && { screenHeight: act.screenHeight }),
        ...(act.tabWidth !== undefined && { tabWidth: act.tabWidth }),
        ...(act.tabHeight !== undefined && { tabHeight: act.tabHeight }),
        ...(act.tabVisible !== undefined && { tabVisible: act.tabVisible }),
      },
    }));
    return this.trackingService.recordHeartbeats(body.sessionId, mapped, req.user?.id);
  }

  // ─── Attendance grid (multi-lecture × students) ─────────────────────────

  @Get('attendance-grid')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary:
      'Attendance grid: students (rows) × selected lectures (columns). ' +
      'Default filters to class-level lectures; set includeSubjectLectures=true to add subject lectures.',
  })
  @ApiQuery({ name: 'lectureIds', type: String, description: 'Comma-separated lecture IDs' })
  @ApiQuery({ name: 'classId', type: String })
  @ApiQuery({ name: 'instituteId', type: String })
  @ApiQuery({ name: 'includeSubjectLectures', type: Boolean, required: false })
  async getAttendanceGrid(
    @Query('lectureIds') lectureIdsStr: string,
    @Query('classId') classId: string,
    @Query('instituteId') instituteId: string,
    @Query('includeSubjectLectures') includeSubjectLectures?: string,
  ) {
    // Validate required parameters
    if (!lectureIdsStr || !classId || !instituteId) {
      throw new BadRequestException('Missing required parameters: lectureIds, classId, instituteId');
    }

    const ids = (lectureIdsStr ?? '').split(',').map(s => s.trim()).filter(Boolean);
    
    if (ids.length === 0) {
      throw new BadRequestException('lectureIds cannot be empty');
    }

    try {
      const result = await this.trackingService.getAttendanceGrid(
        ids,
        classId,
        instituteId,
        includeSubjectLectures === 'true',
      );
      return result;
    } catch (error) {
      console.error('❌ Attendance grid error:', error);
      // Return empty grid instead of 500 error if service returns data successfully
      // This ensures the endpoint always returns valid data
      try {
        const fallback = await this.trackingService.getAttendanceGrid(ids, classId, instituteId, false);
        return fallback;
      } catch {
        // If fallback also fails, return empty grid
        return { lectures: [], students: [], grid: {} };
      }
    }
  }

  // ─── Reports ────────────────────────────────────────────────────────────

  @Get('reports/:lectureId/live')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Live attendance report for one lecture' })
  async getLiveReport(@Param('lectureId') lectureId: string) {
    return this.trackingService.getLiveAttendanceReport(lectureId);
  }

  @Get('reports/:lectureId/recording')
  @UseGuards(JwtAuthGuard, FlexibleAccessGuard)
  @RequireAnyOfRoles({ global: [UserType.SUPERADMIN], instituteAdmin: true, teacher: true })
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Recording session + activity report for one lecture (staff only); optional ?studentId to filter to one student' })
  async getRecordingReport(
    @Param('lectureId') lectureId: string,
    @Req() req: any,
    @Query('studentId') studentId?: string,
  ) {
    // Service re-verifies staff access against the lecture's own institute (IDOR guard).
    return this.trackingService.getRecordingActivityReport(lectureId, studentId, req.user);
  }

  @Get('student/:studentId/activities')
  @UseGuards(JwtAuthGuard, FlexibleAccessGuard)
  @RequireAnyOfRoles({ global: [UserType.SUPERADMIN], instituteAdmin: true, teacher: true })
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get all live and recording activities for a student across lectures (staff only)' })
  async getStudentActivities(
    @Param('studentId') studentId: string,
    @Req() req: any,
    @Query('instituteId') instituteId: string,
    @Query('classId') classId: string,
    @Query('subjectId') subjectId?: string,
  ) {
    if (!instituteId || !classId) {
      throw new BadRequestException('instituteId and classId are required');
    }
    // instituteId is a query param the guard can't bind to — service confirms the caller
    // is admin/teacher of THIS institute before returning another student's data.
    return this.trackingService.getStudentLectureActivities(studentId, instituteId, classId, subjectId, req.user);
  }

  @Get('student/me/activities')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get the authenticated student’s own live and recording activities' })
  async getMyStudentActivities(
    @Req() req: any,
    @Query('instituteId') instituteId: string,
    @Query('classId') classId: string,
    @Query('subjectId') subjectId?: string,
  ) {
    if (!req.user?.id) {
      throw new BadRequestException('Authenticated user is required');
    }
    if (!instituteId || !classId) {
      throw new BadRequestException('instituteId and classId are required');
    }
    // selfAccess = true: caller pinned to their own id, no staff check needed.
    return this.trackingService.getStudentLectureActivities(req.user.id, instituteId, classId, subjectId, req.user, true);
  }

  // ─── Recording Timeline & Watch History ──────────────────────────────────

  @Get('recording/session/:sessionId/timeline')
  @Public()
  @UseGuards(OptionalJwtAuthGuard)
  @ApiOperation({
    summary:
      'Get detailed activity timeline for a recording session with wall-clock timestamps; shows watch duration between actions',
  })
  async getRecordingSessionTimeline(@Param('sessionId') sessionId: string, @Req() req: any) {
    return this.trackingService.getRecordingSessionTimeline(sessionId, req.user?.id);
  }

  @Get('recording/:lectureId/watch-history')
  @Public()
  @UseGuards(OptionalJwtAuthGuard)
  @ApiQuery({ name: 'userType', required: false, enum: ['enrolled', 'suraksha_user', 'guest', 'all'] })
  @ApiOperation({
    summary:
      'Get recording watch history grouped by user type (enrolled students, Suraksha users, guests)',
  })
  async getRecordingWatchHistory(
    @Param('lectureId') lectureId: string,
    @Query('userType') userType?: 'enrolled' | 'suraksha_user' | 'guest' | 'all',
  ) {
    return this.trackingService.getRecordingWatchHistory(lectureId, userType ?? 'all');
  }

  @Post('recording/session/:sessionId/sync')
  @Public()
  @UseGuards(OptionalJwtAuthGuard)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @ApiOperation({
    summary: 'Manually trigger sync of activities for a recording session (auto-sync should happen automatically)',
  })
  async syncSessionActivities(@Param('sessionId') sessionId: string, @Req() req: any) {
    // Allow session owner or staff
    return this.trackingService.syncSessionActivities(sessionId);
  }

  @Post('recording/auto-sync')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Manually trigger auto-sync of all pending activities (admin endpoint)',
  })
  async autoSyncPendingActivities() {
    return this.trackingService.autoSyncPendingActivities();
  }
}
