import {
  Injectable, NotFoundException, ForbiddenException, BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';

import { SubjectRecording } from '../entities/subject_recording.entity';
import { SubjectRecordingSession } from '../entities/subject_recording_session.entity';
import { SubjectRecordingActivity } from '../entities/subject_recording_activity.entity';
import { InstituteClassStudentEntity } from '../../../institute_class_modules/institute_class_student/entities/institute_class_student.entity';
import { InstituteClassSubjectStudent } from '../../institute_class_subject_students/entities/institute_class_subject_student.entity';
import { InstituteClassSubjectPaymentSubmission } from '../../../payment/entities/institute-class-subject-payment-submission.entity';
import { formatSriLankaDateTime, formatSriLankaTime } from '../../../../common/utils/timezone.util';

@Injectable()
export class SubjectRecordingTrackingService {
  constructor(
    @InjectRepository(SubjectRecording)
    private readonly recordingRepo: Repository<SubjectRecording>,
    @InjectRepository(SubjectRecordingSession)
    private readonly sessionRepo: Repository<SubjectRecordingSession>,
    @InjectRepository(SubjectRecordingActivity)
    private readonly activityRepo: Repository<SubjectRecordingActivity>,
    @InjectRepository(InstituteClassStudentEntity)
    private readonly classStudentRepo: Repository<InstituteClassStudentEntity>,
    @InjectRepository(InstituteClassSubjectStudent)
    private readonly subjectStudentRepo: Repository<InstituteClassSubjectStudent>,
    @InjectRepository(InstituteClassSubjectPaymentSubmission)
    private readonly paymentSubmissionRepo: Repository<InstituteClassSubjectPaymentSubmission>,
  ) {}

  // ─────────────────────────────────────────────────────────────────────────
  // Access helpers (same logic as LectureTrackingService)
  // ─────────────────────────────────────────────────────────────────────────

  private async checkEnrollment(
    userId: string,
    instituteId: string,
    classId?: string,
    subjectId?: string,
  ): Promise<boolean> {
    if (!classId) return false;
    if (subjectId) {
      const row = await this.subjectStudentRepo.findOne({
        where: {
          instituteId, classId, subjectId, studentId: userId,
          isActive: true, verificationStatus: 'verified' as any,
        },
      });
      if (row) return true;
      const freeRow = await this.subjectStudentRepo.findOne({
        where: {
          instituteId, classId, subjectId, studentId: userId,
          isActive: true, verificationStatus: 'enrolled_free_card' as any,
        },
      });
      return !!freeRow;
    }
    const row = await this.classStudentRepo.findOne({
      where: { instituteId, classId, studentUserId: userId, isActive: true, isVerified: true },
    });
    return !!row;
  }

  private async checkPaymentAccess(
    userId: string,
    instituteId: string,
    classId: string | undefined,
    subjectId: string | undefined,
    paymentId: string,
    allowedStatuses: string[],
  ): Promise<boolean> {
    if (allowedStatuses.includes('FREE_CARD') && classId) {
      const repo = subjectId ? this.subjectStudentRepo : this.classStudentRepo;
      const where: any = subjectId
        ? { instituteId, classId, subjectId, studentId: userId, isActive: true, studentType: 'free_card' }
        : { instituteId, classId, studentUserId: userId, isActive: true, studentType: 'free_card' };
      const freeRow = await (repo as any).findOne({ where });
      if (freeRow) return true;
    }
    const submission = await this.paymentSubmissionRepo.findOne({ where: { paymentId, userId } });
    if (!submission) return false;
    const submissionStatus = (submission as any).status?.toUpperCase?.() ?? '';
    return allowedStatuses.some(s => s.toUpperCase() === submissionStatus);
  }

  private async determineUserType(
    userId: string | undefined,
    instituteId: string,
    classId?: string,
    subjectId?: string,
  ): Promise<'enrolled' | 'suraksha_user' | 'guest'> {
    if (!userId) return 'guest';
    const enrolled = await this.checkEnrollment(userId, instituteId, classId, subjectId);
    return enrolled ? 'enrolled' : 'suraksha_user';
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Access validation (called by the public recording URL)
  // ─────────────────────────────────────────────────────────────────────────

  async validateRecordingAccess(urlId: string, user: any) {
    const rec = await this.recordingRepo.findOne({
      where: { recUrlId: urlId, recAttendanceEnabled: true, isActive: true },
      relations: ['institute'],
    });
    if (!rec) throw new NotFoundException('Recording not found or tracking is disabled');

    if (rec.recUrlExpiresAt && new Date() > new Date(rec.recUrlExpiresAt)) {
      throw new ForbiddenException('This recording link has expired');
    }

    let hasAccess = false;
    let requirePayment = false;
    let notPaidPaymentId: string | undefined;
    const level = rec.recAccessLevel;

    if (level === 'ANYONE') {
      hasAccess = true;
    } else if (level === 'SURAKSHA_USERS') {
      hasAccess = !!user;
    } else if (level === 'ENROLLED_ONLY') {
      hasAccess = user
        ? await this.checkEnrollment(user.id, rec.instituteId, rec.classId, rec.subjectId)
        : false;
    } else if (level === 'PAID_ONLY') {
      if (!user) {
        hasAccess = false; requirePayment = true;
      } else if (rec.recPaymentId) {
        const paid = await this.checkPaymentAccess(
          user.id, rec.instituteId, rec.classId, rec.subjectId,
          rec.recPaymentId, rec.recPaymentStatuses ?? ['VERIFIED'],
        );
        if (paid) { hasAccess = true; }
        else { hasAccess = false; requirePayment = true; notPaidPaymentId = rec.recPaymentId; }
      } else {
        hasAccess = user
          ? await this.checkEnrollment(user.id, rec.instituteId, rec.classId, rec.subjectId)
          : false;
      }
    }

    const inst = rec.institute as any;
    return {
      recordingId: rec.id,
      title: rec.title,
      description: rec.description,
      platform: rec.platform,
      durationSeconds: rec.durationSeconds,
      instituteId: rec.instituteId,
      instituteName: inst?.name,
      instituteLogoUrl: inst?.logoUrl,
      subdomain: inst?.subdomain,
      customDomain: inst?.customDomain,
      accessLevel: level,
      bgUrl: rec.recEntryBgUrl,
      cardImageUrl: rec.recCardImageUrl,
      hasAccess,
      requirePayment,
      notPaidPaymentId,
      paymentId: rec.recPaymentId,
      paymentStatuses: rec.recPaymentStatuses,
      materials: rec.materials,
      welcomeMessageEnabled: rec.welcomeMessageEnabled,
      welcomeMessageText: rec.welcomeMessageText,
      welcomeMessageVoiceEnabled: rec.welcomeMessageVoiceEnabled,
      // Only expose the actual URL once access is confirmed
      recordingUrl: hasAccess ? rec.recordingUrl : undefined,
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Watch sessions
  // ─────────────────────────────────────────────────────────────────────────

  async startSession(
    recordingId: string,
    userId?: string,
    guestName?: string, guestEmail?: string,
    guestPhone?: string, guestSchool?: string,
    ipAddress?: string, userAgent?: string,
  ) {
    const rec = await this.recordingRepo.findOne({ where: { id: recordingId } });
    if (!rec) throw new NotFoundException('Recording not found');

    const userType = await this.determineUserType(userId, rec.instituteId, rec.classId, rec.subjectId);

    const session = this.sessionRepo.create({
      recordingId,
      userId,
      userType,
      guestName: userType === 'guest' ? guestName : undefined,
      guestEmail: userType === 'guest' ? guestEmail : undefined,
      guestPhone: userType === 'guest' ? guestPhone : undefined,
      guestSchool: userType === 'guest' ? guestSchool : undefined,
      startTime: new Date(),
      lastPositionSeconds: 0,
      totalWatchedSeconds: 0,
      backupStatus: 'pending',
      ipAddress, userAgent,
    });
    const saved = await this.sessionRepo.save(session);
    return { sessionId: saved.id, recordingId, userType };
  }

  async endSession(sessionId: string, lastPositionSeconds?: number, userId?: string) {
    const session = await this.sessionRepo.findOne({ where: { id: sessionId } });
    if (!session) throw new NotFoundException('Session not found');
    if (userId && session.userId && session.userId !== userId) {
      throw new ForbiddenException('Not your session');
    }
    const update: Partial<SubjectRecordingSession> = { endTime: new Date() };
    if (lastPositionSeconds !== undefined) update.lastPositionSeconds = lastPositionSeconds;
    await this.sessionRepo.update(sessionId, update);
    return { success: true };
  }

  async recordHeartbeats(
    sessionId: string,
    activities: Array<{
      type: 'PLAY' | 'PAUSE' | 'SEEK' | 'HEARTBEAT' | 'SPEED_CHANGE' | 'QUALITY_CHANGE' | 'FULLSCREEN_TOGGLE' | 'SUBTITLE_TOGGLE';
      videoTimestamp: number;
      wallTime?: number;
      metadata?: Record<string, any>;
    }>,
    userId?: string,
  ) {
    if (!activities.length) return { success: true };
    if (activities.length > 100) throw new BadRequestException('Maximum 100 activities per batch');

    const session = await this.sessionRepo.findOne({ where: { id: sessionId } });
    if (!session) throw new NotFoundException('Session not found');
    if (userId && session.userId && session.userId !== userId) {
      throw new ForbiddenException('Not your session');
    }

    const records = activities.map(act => {
      const record = this.activityRepo.create({
        sessionId,
        activityType: act.type,
        videoTimestamp: act.videoTimestamp,
        metadata: act.metadata,
        wallClockTimestamp: act.wallTime ? new Date(act.wallTime) : new Date(),
      });
      return record;
    });
    await this.activityRepo.save(records);

    const lastPlay = [...activities].reverse().find(a => a.type === 'PLAY' || a.type === 'HEARTBEAT');
    if (lastPlay !== undefined) {
      await this.sessionRepo.update(sessionId, {
        lastPositionSeconds: Math.floor(lastPlay.videoTimestamp),
      });
    }
    return { success: true };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Reports
  // ─────────────────────────────────────────────────────────────────────────

  async getSessionReport(recordingId: string) {
    const sessions = await this.sessionRepo.find({
      where: { recordingId },
      relations: ['user'],
      order: { startTime: 'ASC' },
    });
    if (!sessions.length) return [];

    const sessionIds = sessions.map(s => s.id);
    const allActivities = await this.activityRepo.find({
      where: { sessionId: In(sessionIds) },
      order: { createdAt: 'ASC' },
    });

    const actBySession = new Map<string, SubjectRecordingActivity[]>();
    for (const act of allActivities) {
      const arr = actBySession.get(act.sessionId) ?? [];
      arr.push(act);
      actBySession.set(act.sessionId, arr);
    }

    return sessions.map(s => ({
      sessionId: s.id,
      userId: s.userId,
      name: s.userId
        ? (s as any).user?.name ?? `${(s as any).user?.firstName ?? ''} ${(s as any).user?.lastName ?? ''}`.trim()
        : s.guestName ?? 'Guest',
      isGuest: !s.userId,
      userType: s.userType,
      startTime: s.startTime,
      endTime: s.endTime,
      totalWatchedSeconds: s.totalWatchedSeconds,
      lastPositionSeconds: s.lastPositionSeconds,
      backupStatus: s.backupStatus,
      activities: (actBySession.get(s.id) ?? []).map(a => ({
        type: a.activityType,
        videoTimestamp: a.videoTimestamp,
        at: a.createdAt,
      })),
    }));
  }

  async getSessionTimeline(sessionId: string, userId?: string) {
    const session = await this.sessionRepo.findOne({
      where: { id: sessionId },
      relations: ['user'],
    });
    if (!session) throw new NotFoundException('Session not found');
    if (userId && session.userId && session.userId !== userId) {
      throw new ForbiddenException('Not your session');
    }

    const activities = await this.activityRepo.find({
      where: { sessionId },
      order: { createdAt: 'ASC' },
    });

    const timeline = activities.map((act, idx) => {
      const nextActivity = activities[idx + 1];
      const actWallClock = act.wallClockTimestamp ?? act.createdAt;
      const durationUntilNextMs = nextActivity
        ? nextActivity.createdAt.getTime() - actWallClock.getTime()
        : session.endTime
        ? session.endTime.getTime() - actWallClock.getTime()
        : null;

      return {
        id: act.id,
        type: act.activityType,
        videoTime: act.videoTimestamp,
        wallTime: formatSriLankaDateTime(actWallClock),
        wallTimeDisplay: formatSriLankaTime(actWallClock),
        durationUntilNextMs: durationUntilNextMs !== null ? Math.max(0, durationUntilNextMs) : null,
        metadata: act.metadata,
        createdAt: formatSriLankaDateTime(act.createdAt),
      };
    });

    return {
      sessionId: session.id,
      userId: session.userId,
      userType: session.userType,
      guestName: session.guestName,
      startTime: formatSriLankaDateTime(session.startTime),
      endTime: session.endTime ? formatSriLankaDateTime(session.endTime) : null,
      backupStatus: session.backupStatus,
      lastSyncTime: session.lastSyncTime ? formatSriLankaDateTime(session.lastSyncTime) : null,
      totalWatchedSeconds: session.totalWatchedSeconds,
      lastPositionSeconds: session.lastPositionSeconds,
      timeline,
      activityCount: timeline.length,
    };
  }

  async getWatchHistory(
    recordingId: string,
    userTypeFilter: 'enrolled' | 'suraksha_user' | 'guest' | 'all' = 'all',
  ) {
    const rec = await this.recordingRepo.findOne({ where: { id: recordingId } });
    if (!rec) throw new NotFoundException('Recording not found');

    let query = this.sessionRepo.createQueryBuilder('session')
      .where('session.recordingId = :recordingId', { recordingId })
      .leftJoinAndSelect('session.user', 'user')
      .orderBy('session.startTime', 'ASC');

    if (userTypeFilter !== 'all') {
      query = query.andWhere('session.userType = :userType', { userType: userTypeFilter });
    }

    const sessions = await query.getMany();
    const sessionIds = sessions.map(s => s.id);

    const activityCounts = sessionIds.length
      ? await this.activityRepo
          .createQueryBuilder('activity')
          .select('activity.sessionId', 'sessionId')
          .addSelect('COUNT(*)', 'count')
          .where('activity.sessionId IN (:...sessionIds)', { sessionIds })
          .groupBy('activity.sessionId')
          .getRawMany()
      : [];

    const actCountMap = new Map(activityCounts.map(ac => [ac.sessionId, parseInt(ac.count, 10)]));

    const grouped = { enrolled: [] as any[], suraksha_user: [] as any[], guest: [] as any[] };

    for (const s of sessions) {
      const record = {
        sessionId: s.id,
        userId: s.userId,
        userName: s.userId
          ? (s.user as any)?.name ?? `${(s.user as any)?.firstName ?? ''} ${(s.user as any)?.lastName ?? ''}`.trim()
          : s.guestName ?? 'Guest',
        userEmail: s.userId ? (s.user as any)?.email : s.guestEmail,
        userPhone: s.guestPhone,
        startTime: formatSriLankaDateTime(s.startTime),
        endTime: s.endTime ? formatSriLankaDateTime(s.endTime) : null,
        totalWatchedSeconds: s.totalWatchedSeconds,
        lastPositionSeconds: s.lastPositionSeconds,
        durationMinutes: s.endTime
          ? Math.round((s.endTime.getTime() - s.startTime.getTime()) / 60000)
          : null,
        activityCount: actCountMap.get(s.id) ?? 0,
        backupStatus: s.backupStatus,
        lastSyncTime: s.lastSyncTime ? formatSriLankaDateTime(s.lastSyncTime) : null,
        ipAddress: s.ipAddress,
      };
      grouped[s.userType].push(record);
    }

    return grouped;
  }

  async getStudentActivities(
    studentId: string,
    instituteId: string,
    classId: string,
    subjectId?: string,
  ) {
    const whereClause: any = { instituteId, classId };
    if (subjectId) whereClause.subjectId = subjectId;

    const recordings = await this.recordingRepo.find({
      where: { ...whereClause, isActive: true, status: 'published' as any },
      order: { createdAt: 'DESC' },
    });
    if (!recordings.length) return [];

    const recordingIds = recordings.map(r => r.id);
    const sessions = await this.sessionRepo.find({
      where: { userId: studentId, recordingId: In(recordingIds) },
      order: { startTime: 'ASC' },
    });

    return recordings.map(rec => {
      const recSessions = sessions.filter(s => String(s.recordingId) === String(rec.id));
      const totalWatchedSeconds = recSessions.reduce((acc, s) => acc + (s.totalWatchedSeconds || 0), 0);

      return {
        recording: {
          id: rec.id,
          title: rec.title,
          platform: rec.platform,
          durationSeconds: rec.durationSeconds,
          recAttendanceEnabled: rec.recAttendanceEnabled,
        },
        watching: recSessions.length > 0
          ? {
              sessions: recSessions.map(s => ({
                startTime: s.startTime,
                endTime: s.endTime,
                watchedSeconds: s.totalWatchedSeconds,
                lastPosition: s.lastPositionSeconds,
              })),
              totalWatchedSeconds,
              sessionCount: recSessions.length,
            }
          : null,
      };
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Sync
  // ─────────────────────────────────────────────────────────────────────────

  async syncSession(sessionId: string) {
    const session = await this.sessionRepo.findOne({ where: { id: sessionId } });
    if (!session) throw new NotFoundException('Session not found');
    await this.sessionRepo.update(sessionId, { backupStatus: 'completed', lastSyncTime: new Date() });
    return {
      success: true, sessionId,
      backupStatus: 'completed',
      syncedAt: formatSriLankaDateTime(new Date()),
      message: 'Session synchronized successfully',
    };
  }

  async autoSyncPending() {
    const pending = await this.sessionRepo.find({ where: { backupStatus: 'pending' } });
    if (!pending.length) return { synced: 0 };
    const now = new Date();
    await this.sessionRepo.update(
      { id: In(pending.map(s => s.id)) },
      { backupStatus: 'completed', lastSyncTime: now },
    );
    return { synced: pending.length, syncedAt: formatSriLankaDateTime(now) };
  }
}
