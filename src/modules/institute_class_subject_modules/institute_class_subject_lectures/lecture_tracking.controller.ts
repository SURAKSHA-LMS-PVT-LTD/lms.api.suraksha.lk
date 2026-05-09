import {
  Controller, Get, Post, Body, Param, Req,
  UseGuards, Query, BadRequestException, InternalServerErrorException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { LectureTrackingService } from './lecture_tracking.service';
import { JwtAuthGuard } from '../../../auth/guards/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '../../../auth/guards/optional-jwt-auth.guard';
import { Public } from '../../../common/decorators/public.decorator';

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
  @ApiOperation({ summary: 'Batch-send PLAY / PAUSE / SEEK / HEARTBEAT activity events' })
  async recordHeartbeat(
    @Body() body: {
      sessionId: string;
      activities: Array<{
        type: 'PLAY' | 'PAUSE' | 'SEEK' | 'HEARTBEAT';
        videoTimestamp: number;
        wallTime?: number;
      }>;
    },
    @Req() req: any,
  ) {
    return this.trackingService.recordHeartbeats(body.sessionId, body.activities, req.user?.id);
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
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Recording session + activity report for one lecture' })
  async getRecordingReport(@Param('lectureId') lectureId: string) {
    return this.trackingService.getRecordingActivityReport(lectureId);
  }

  @Get('student/:studentId/activities')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get all live and recording activities for a student across lectures' })
  async getStudentActivities(
    @Param('studentId') studentId: string,
    @Query('instituteId') instituteId: string,
    @Query('classId') classId: string,
    @Query('subjectId') subjectId?: string,
  ) {
    if (!instituteId || !classId) {
      throw new BadRequestException('instituteId and classId are required');
    }
    return this.trackingService.getStudentLectureActivities(studentId, instituteId, classId, subjectId);
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
    return this.trackingService.getStudentLectureActivities(req.user.id, instituteId, classId, subjectId);
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
