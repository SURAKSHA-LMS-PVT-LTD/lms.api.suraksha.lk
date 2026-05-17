import {
  Controller, Get, Post, Body, Param, Query,
  Req, UseGuards, BadRequestException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery, ApiParam } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';

import { JwtAuthGuard } from '../../../auth/guards/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '../../../auth/guards/optional-jwt-auth.guard';
import { Public } from '../../../common/decorators/public.decorator';
import { ParseIdPipe } from '../../../common/pipes/parse-id.pipe';

import { SubjectRecordingTrackingService } from './services/subject-recording-tracking.service';

@ApiTags('Subject Recording Tracking & Access')
@Controller('subject-recording-tracking')
export class SubjectRecordingTrackingController {
  constructor(private readonly trackingService: SubjectRecordingTrackingService) {}

  // ─── Access validation ────────────────────────────────────────────────────

  @Get('recording/access/:urlId')
  @Public()
  @UseGuards(OptionalJwtAuthGuard)
  @ApiOperation({ summary: 'Validate access and get recording details for a URL token' })
  @ApiParam({ name: 'urlId', description: 'rec_url_id token from the recording' })
  async getRecordingAccess(@Param('urlId') urlId: string, @Req() req: any) {
    return this.trackingService.validateRecordingAccess(urlId, req.user);
  }

  // ─── Recording watch sessions ─────────────────────────────────────────────

  @Post('session/start')
  @Public()
  @UseGuards(OptionalJwtAuthGuard)
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @ApiOperation({ summary: 'Start a watch session for a recording; returns sessionId' })
  async startSession(
    @Body() body: {
      recordingId: string;
      guestName?: string; guestEmail?: string;
      guestPhone?: string; guestSchool?: string;
    },
    @Req() req: any,
  ) {
    return this.trackingService.startSession(
      body.recordingId,
      req.user?.id,
      body.guestName, body.guestEmail,
      body.guestPhone, body.guestSchool,
      req.ip, req.headers['user-agent'],
    );
  }

  @Post('session/end')
  @Public()
  @UseGuards(OptionalJwtAuthGuard)
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @ApiOperation({ summary: 'End a watch session; records position, watched seconds, and playback speed' })
  async endSession(
    @Body() body: {
      sessionId: string;
      lastPositionSeconds?: number;
      totalWatchedSeconds?: number;
      effectiveWatchedSeconds?: number;
      lastPlaybackSpeed?: number;
    },
    @Req() req: any,
  ) {
    return this.trackingService.endSession(
      body.sessionId,
      body.lastPositionSeconds,
      body.totalWatchedSeconds,
      body.effectiveWatchedSeconds,
      body.lastPlaybackSpeed,
      req.user?.id,
    );
  }

  @Post('heartbeat')
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

  // ─── Reports ─────────────────────────────────────────────────────────────

  @Get('reports/:recordingId/sessions')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Watch session + activity report for one recording' })
  @ApiParam({ name: 'recordingId' })
  async getSessionReport(@Param('recordingId', ParseIdPipe) recordingId: string) {
    return this.trackingService.getSessionReport(recordingId);
  }

  @Get('session/:sessionId/timeline')
  @Public()
  @UseGuards(OptionalJwtAuthGuard)
  @ApiOperation({ summary: 'Detailed activity timeline for a watch session with wall-clock timestamps' })
  @ApiParam({ name: 'sessionId' })
  async getSessionTimeline(@Param('sessionId', ParseIdPipe) sessionId: string, @Req() req: any) {
    return this.trackingService.getSessionTimeline(sessionId, req.user?.id);
  }

  @Get('recording/:recordingId/watch-history')
  @Public()
  @UseGuards(OptionalJwtAuthGuard)
  @ApiQuery({ name: 'userType', required: false, enum: ['enrolled', 'suraksha_user', 'guest', 'all'] })
  @ApiOperation({ summary: 'Watch history grouped by user type for a recording' })
  @ApiParam({ name: 'recordingId' })
  async getWatchHistory(
    @Param('recordingId', ParseIdPipe) recordingId: string,
    @Query('userType') userType?: 'enrolled' | 'suraksha_user' | 'guest' | 'all',
  ) {
    return this.trackingService.getWatchHistory(recordingId, userType ?? 'all');
  }

  @Get('student/:studentId/activities')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get all recording watch activities for a student' })
  @ApiParam({ name: 'studentId' })
  async getStudentActivities(
    @Param('studentId') studentId: string,
    @Query('instituteId') instituteId: string,
    @Query('classId') classId: string,
    @Query('subjectId') subjectId?: string,
  ) {
    if (!instituteId || !classId) {
      throw new BadRequestException('instituteId and classId are required');
    }
    return this.trackingService.getStudentActivities(studentId, instituteId, classId, subjectId);
  }

  @Get('student/me/activities')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get the authenticated student\'s own recording watch activities' })
  async getMyActivities(
    @Req() req: any,
    @Query('instituteId') instituteId: string,
    @Query('classId') classId: string,
    @Query('subjectId') subjectId?: string,
  ) {
    if (!req.user?.id) throw new BadRequestException('Authenticated user required');
    if (!instituteId || !classId) throw new BadRequestException('instituteId and classId are required');
    return this.trackingService.getStudentActivities(req.user.id, instituteId, classId, subjectId);
  }

  // ─── Sync ─────────────────────────────────────────────────────────────────

  @Post('session/:sessionId/sync')
  @Public()
  @UseGuards(OptionalJwtAuthGuard)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @ApiOperation({ summary: 'Manually sync a watch session' })
  @ApiParam({ name: 'sessionId' })
  async syncSession(@Param('sessionId', ParseIdPipe) sessionId: string) {
    return this.trackingService.syncSession(sessionId);
  }

  @Post('auto-sync')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Trigger auto-sync of all pending sessions (admin)' })
  async autoSync() {
    return this.trackingService.autoSyncPending();
  }
}
