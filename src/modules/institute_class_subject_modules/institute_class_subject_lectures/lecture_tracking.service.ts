import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { InstituteClassSubjectLecture } from './entities/institute_class_subject_lecture.entity';
import { LectureLiveAttendance } from './entities/lecture_live_attendance.entity';
import { LectureRecordingSession } from './entities/lecture_recording_session.entity';
import { LectureRecordingActivity } from './entities/lecture_recording_activity.entity';
import { InstituteClassStudentEntity } from '../../institute_class_modules/institute_class_student/entities/institute_class_student.entity';
import { InstituteClassSubjectStudent } from '../institute_class_subject_students/entities/institute_class_subject_student.entity';
import { InstituteClassSubjectPaymentSubmission } from '../../payment/entities/institute-class-subject-payment-submission.entity';
import { formatSriLankaDateTime, formatSriLankaTime } from '../../../common/utils/timezone.util';

const BASE_DOMAIN = process.env.BASE_DOMAIN ?? 'lms.suraksha.lk';

function buildPublicUrl(
  path: string,
  subdomain?: string | null,
  customDomain?: string | null,
): string {
  if (customDomain) return `https://${customDomain}/${path}`;
  if (subdomain) return `https://${subdomain}.suraksha.lk/${path}`;
  return `https://${BASE_DOMAIN}/${path}`;
}

@Injectable()
export class LectureTrackingService {
  constructor(
    @InjectRepository(InstituteClassSubjectLecture)
    private readonly lectureRepo: Repository<InstituteClassSubjectLecture>,
    @InjectRepository(LectureLiveAttendance)
    private readonly liveAttRepo: Repository<LectureLiveAttendance>,
    @InjectRepository(LectureRecordingSession)
    private readonly recSessionRepo: Repository<LectureRecordingSession>,
    @InjectRepository(LectureRecordingActivity)
    private readonly recActivityRepo: Repository<LectureRecordingActivity>,
    @InjectRepository(InstituteClassStudentEntity)
    private readonly classStudentRepo: Repository<InstituteClassStudentEntity>,
    @InjectRepository(InstituteClassSubjectStudent)
    private readonly subjectStudentRepo: Repository<InstituteClassSubjectStudent>,
    @InjectRepository(InstituteClassSubjectPaymentSubmission)
    private readonly paymentSubmissionRepo: Repository<InstituteClassSubjectPaymentSubmission>,
  ) {}

  // ─────────────────────────────────────────────────────────────
  // Access validation helpers
  // ─────────────────────────────────────────────────────────────

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
          instituteId,
          classId,
          subjectId,
          studentId: userId,
          isActive: true,
          verificationStatus: 'verified' as any,
        },
      });
      if (row) return true;
      // Also allow free_card enrolled
      const freeRow = await this.subjectStudentRepo.findOne({
        where: {
          instituteId,
          classId,
          subjectId,
          studentId: userId,
          isActive: true,
          verificationStatus: 'enrolled_free_card' as any,
        },
      });
      return !!freeRow;
    }

    // Class-level only
    const row = await this.classStudentRepo.findOne({
      where: {
        instituteId,
        classId,
        studentUserId: userId,
        isActive: true,
        isVerified: true,
      },
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
    // Free-card check: if FREE_CARD is in allowed statuses, check student type
    if (allowedStatuses.includes('FREE_CARD') && classId) {
      if (subjectId) {
        const freeRow = await this.subjectStudentRepo.findOne({
          where: {
            instituteId,
            classId,
            subjectId,
            studentId: userId,
            isActive: true,
            studentType: 'free_card' as any,
          },
        });
        if (freeRow) return true;
      } else {
        const freeRow = await this.classStudentRepo.findOne({
          where: {
            instituteId,
            classId,
            studentUserId: userId,
            isActive: true,
            studentType: 'free_card' as any,
          },
        });
        if (freeRow) return true;
      }
    }

    // Check payment submission status
    const submission = await this.paymentSubmissionRepo.findOne({
      where: { paymentId, userId },
    });
    if (!submission) return false;

    const submissionStatus = (submission as any).status?.toUpperCase?.() ?? '';
    return allowedStatuses.some(s => s.toUpperCase() === submissionStatus);
  }

  // ─────────────────────────────────────────────────────────────
  // Live lecture access validation & join URL
  // ─────────────────────────────────────────────────────────────

  async validateLiveAccess(urlId: string, user: any) {
    const lecture = await this.lectureRepo.findOne({
      where: { liveUrlId: urlId, liveAttendanceEnabled: true },
      relations: ['institute'],
    });
    if (!lecture) throw new NotFoundException('Lecture not found or attendance tracking is disabled');

    // Check TTL
    if (lecture.liveUrlExpiresAt && new Date() > new Date(lecture.liveUrlExpiresAt)) {
      throw new ForbiddenException('This lecture link has expired');
    }

    let hasAccess = false;
    let requirePayment = false;
    let notPaidPaymentId: string | undefined;

    const level = lecture.liveAccessLevel;

    if (level === 'ANYONE') {
      hasAccess = true;
    } else if (level === 'SURAKSHA_USERS') {
      hasAccess = !!user;
    } else if (level === 'ENROLLED_ONLY') {
      if (!user) {
        hasAccess = false;
      } else {
        hasAccess = await this.checkEnrollment(
          user.id,
          lecture.instituteId,
          lecture.classId,
          lecture.subjectId,
        );
      }
    } else if (level === 'PAID_ONLY') {
      if (!user) {
        hasAccess = false;
        requirePayment = true;
      } else if (lecture.livePaymentId) {
        const paid = await this.checkPaymentAccess(
          user.id,
          lecture.instituteId,
          lecture.classId,
          lecture.subjectId,
          lecture.livePaymentId,
          lecture.livePaymentStatuses ?? ['VERIFIED'],
        );
        if (paid) {
          hasAccess = true;
        } else {
          hasAccess = false;
          requirePayment = true;
          notPaidPaymentId = lecture.livePaymentId;
        }
      } else {
        // No payment linked — fall back to enrollment check
        hasAccess = await this.checkEnrollment(
          user.id,
          lecture.instituteId,
          lecture.classId,
          lecture.subjectId,
        );
      }
    }

    const inst = lecture.institute as any;
    const liveJoinUrl = buildPublicUrl(
      `live-lecture/${urlId}`,
      inst?.subdomain,
      inst?.customDomain,
    );

    return {
      lectureId: lecture.id,
      title: lecture.title,
      description: lecture.description,
      status: lecture.status,
      startTime: lecture.startTime,
      endTime: lecture.endTime,
      instituteId: lecture.instituteId,
      instituteName: inst?.name,
      instituteLogoUrl: inst?.logoUrl,
      subdomain: inst?.subdomain,
      customDomain: inst?.customDomain,
      accessLevel: level,
      bgUrl: lecture.liveEntryBgUrl,
      cardImageUrl: lecture.liveCardImageUrl,
      liveJoinUrl,
      hasAccess,
      requirePayment,
      notPaidPaymentId,
      paymentId: lecture.livePaymentId,
      paymentStatuses: lecture.livePaymentStatuses,
      welcomeMessageEnabled: lecture.welcomeMessageEnabled,
      welcomeMessageText: lecture.welcomeMessageText,
      welcomeMessageVoiceEnabled: lecture.welcomeMessageVoiceEnabled,
      // Only expose meeting link when access is granted
      meetingLink: hasAccess ? lecture.meetingLink : undefined,
    };
  }

  // ─────────────────────────────────────────────────────────────
  // Recording access validation
  // ─────────────────────────────────────────────────────────────

  async validateRecordingAccess(urlId: string, user: any) {
    const lecture = await this.lectureRepo.findOne({
      where: { recUrlId: urlId, recAttendanceEnabled: true },
      relations: ['institute'],
    });
    if (!lecture) throw new NotFoundException('Recording not found or tracking is disabled');

    if (lecture.recUrlExpiresAt && new Date() > new Date(lecture.recUrlExpiresAt)) {
      throw new ForbiddenException('This recording link has expired');
    }

    let hasAccess = false;
    let requirePayment = false;
    let notPaidPaymentId: string | undefined;

    const level = lecture.recAccessLevel;

    if (level === 'ANYONE') {
      hasAccess = true;
    } else if (level === 'SURAKSHA_USERS') {
      hasAccess = !!user;
    } else if (level === 'ENROLLED_ONLY') {
      hasAccess = user
        ? await this.checkEnrollment(
            user.id,
            lecture.instituteId,
            lecture.classId,
            lecture.subjectId,
          )
        : false;
    } else if (level === 'PAID_ONLY') {
      if (!user) {
        hasAccess = false;
        requirePayment = true;
      } else if (lecture.recPaymentId) {
        const paid = await this.checkPaymentAccess(
          user.id,
          lecture.instituteId,
          lecture.classId,
          lecture.subjectId,
          lecture.recPaymentId,
          lecture.recPaymentStatuses ?? ['VERIFIED'],
        );
        if (paid) {
          hasAccess = true;
        } else {
          hasAccess = false;
          requirePayment = true;
          notPaidPaymentId = lecture.recPaymentId;
        }
      } else {
        hasAccess = user
          ? await this.checkEnrollment(
              user.id,
              lecture.instituteId,
              lecture.classId,
              lecture.subjectId,
            )
          : false;
      }
    }

    const inst = lecture.institute as any;

    return {
      lectureId: lecture.id,
      title: lecture.title,
      description: lecture.description,
      instituteId: lecture.instituteId,
      instituteName: inst?.name,
      instituteLogoUrl: inst?.logoUrl,
      subdomain: inst?.subdomain,
      customDomain: inst?.customDomain,
      accessLevel: level,
      platform: lecture.recPlatform,
      durationSeconds: lecture.recDurationSeconds,
      bgUrl: lecture.recEntryBgUrl,
      cardImageUrl: lecture.recCardImageUrl,
      hasAccess,
      requirePayment,
      notPaidPaymentId,
      paymentId: lecture.recPaymentId,
      paymentStatuses: lecture.recPaymentStatuses,
      materials: lecture.materials,
      welcomeMessageEnabled: lecture.welcomeMessageEnabled,
      welcomeMessageText: lecture.welcomeMessageText,
      welcomeMessageVoiceEnabled: lecture.welcomeMessageVoiceEnabled,
      // Only expose recording URL when access granted
      recordingUrl: hasAccess ? lecture.recordingUrl : undefined,
    };
  }

  // ─────────────────────────────────────────────────────────────
  // Live attendance recording
  // ─────────────────────────────────────────────────────────────

  async recordLiveJoin(
    lectureId: string,
    userId?: string,
    guestName?: string,
    guestEmail?: string,
    guestPhone?: string,
    guestSchool?: string,
    ipAddress?: string,
    userAgent?: string,
  ) {
    const lecture = await this.lectureRepo.findOne({ where: { id: lectureId } });
    if (!lecture) throw new NotFoundException('Lecture not found');

    const record = this.liveAttRepo.create({
      lectureId,
      instituteId: lecture.instituteId,
      classId: lecture.classId,
      subjectId: lecture.subjectId,
      userId,
      guestName,
      guestEmail,
      guestPhone,
      guestSchool,
      joinTime: new Date(),
      ipAddress,
      userAgent,
    });
    const saved = await this.liveAttRepo.save(record);
    return { attendanceId: saved.id, lectureId, joinTime: saved.joinTime };
  }

  async recordLiveLeave(attendanceId: string, userId?: string) {
    const record = await this.liveAttRepo.findOne({ where: { id: attendanceId } });
    if (!record) throw new NotFoundException('Attendance record not found');
    if (userId && record.userId && record.userId !== userId) {
      throw new ForbiddenException('Not your attendance record');
    }
    await this.liveAttRepo.update(attendanceId, { leaveTime: new Date() });
    return { success: true };
  }

  // ─────────────────────────────────────────────────────────────
  // Recording session management
  // ─────────────────────────────────────────────────────────────

  /**
   * Determine user type for recording access:
   * - 'enrolled': Student enrolled in this lecture's class/subject
   * - 'suraksha_user': Any Suraksha LMS user (not enrolled)
   * - 'guest': Guest/public user (no registered account)
   */
  private async determineUserType(
    userId: string | undefined,
    instituteId: string,
    classId?: string,
    subjectId?: string,
  ): Promise<'enrolled' | 'suraksha_user' | 'guest'> {
    if (!userId) return 'guest';

    // Check if user is enrolled in this lecture
    const isEnrolled = await this.checkEnrollment(userId, instituteId, classId, subjectId);
    if (isEnrolled) return 'enrolled';

    // Otherwise, if they have a userId, they're a Suraksha LMS user
    return 'suraksha_user';
  }

  async startRecordingSession(
    lectureId: string,
    instituteId: string,
    classId: string | undefined,
    subjectId: string | undefined,
    userId?: string,
    guestName?: string,
    guestEmail?: string,
    guestPhone?: string,
    guestSchool?: string,
    ipAddress?: string,
    userAgent?: string,
  ) {
    const userType = await this.determineUserType(userId, instituteId, classId, subjectId);

    const session = this.recSessionRepo.create({
      lectureId,
      userId,
      userType,
      guestName: userType === 'guest' ? guestName : undefined,
      guestEmail: userType === 'guest' ? guestEmail : undefined,
      guestPhone: userType === 'guest' ? guestPhone : undefined,
      guestSchool: userType === 'guest' ? guestSchool : undefined,
      startTime: new Date(),
      lastPositionSeconds: 0,
      totalWatchedSeconds: 0,
      ipAddress,
      userAgent,
      backupStatus: 'pending',
    });
    const saved = await this.recSessionRepo.save(session);
    return { sessionId: saved.id, lectureId, userType };
  }

  async endRecordingSession(sessionId: string, lastPositionSeconds?: number, userId?: string) {
    const session = await this.recSessionRepo.findOne({ where: { id: sessionId } });
    if (!session) throw new NotFoundException('Session not found');
    if (userId && session.userId && session.userId !== userId) {
      throw new ForbiddenException('Not your session');
    }
    const update: Partial<LectureRecordingSession> = { endTime: new Date() };
    if (lastPositionSeconds !== undefined) {
      update.lastPositionSeconds = lastPositionSeconds;
    }
    await this.recSessionRepo.update(sessionId, update);
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

    const session = await this.recSessionRepo.findOne({ where: { id: sessionId } });
    if (!session) throw new NotFoundException('Session not found');
    if (userId && session.userId && session.userId !== userId) {
      throw new ForbiddenException('Not your session');
    }

    const records = activities.map(act => {
      const record = this.recActivityRepo.create({
        sessionId,
        activityType: act.type,
        videoTimestamp: act.videoTimestamp,
        metadata: act.metadata,
      });

      // If wallTime is provided as ISO string, convert to Date; if number (timestamp), convert from ms
      if (act.wallTime) {
        if (typeof act.wallTime === 'string') {
          record.wallClockTimestamp = new Date(act.wallTime);
        } else if (typeof act.wallTime === 'number') {
          // Assume milliseconds since epoch
          record.wallClockTimestamp = new Date(act.wallTime);
        }
      } else {
        // Default to current server time if not provided
        record.wallClockTimestamp = new Date();
      }

      return record;
    });

    await this.recActivityRepo.save(records);

    // Update last known position from the most recent heartbeat/play event
    const lastPlay = [...activities]
      .reverse()
      .find(a => a.type === 'PLAY' || a.type === 'HEARTBEAT');
    if (lastPlay !== undefined) {
      await this.recSessionRepo.update(sessionId, {
        lastPositionSeconds: Math.floor(lastPlay.videoTimestamp),
      });
    }

    return { success: true };
  }

  // ─────────────────────────────────────────────────────────────
  // Attendance grid  (students × lectures)
  // ─────────────────────────────────────────────────────────────

  async getAttendanceGrid(
    lectureIds: string[],
    classId: string,
    instituteId: string,
    includeSubjectLectures = true,
  ) {
    try {
      if (!lectureIds.length) return { lectures: [], students: [], grid: {} };

      // Validate and convert IDs
      const validIds = lectureIds.map(id => String(id).trim()).filter(id => id && id !== 'undefined' && id !== 'null');
      if (!validIds.length) return { lectures: [], students: [], grid: {} };

      // 1. Load lectures (validates ownership)
      let lectures = [];
      try {
        lectures = await this.lectureRepo.find({
          where: { id: In(validIds), classId, instituteId },
        });
      } catch (dbError) {
        console.error('❌ Error loading lectures:', dbError);
        return { lectures: [], students: [], grid: {} };
      }
      
      if (!lectures.length) return { lectures: [], students: [], grid: {} };

      // 2. Load enrolled students for the correct scope
      const subjectId = lectures.every(l => l.subjectId && String(l.subjectId) === String(lectures[0]?.subjectId))
        ? lectures[0]?.subjectId
        : null;

      let classStudents = [];
      try {
        if (subjectId) {
          classStudents = await this.subjectStudentRepo.find({
            where: {
              instituteId,
              classId,
              subjectId,
              isActive: true,
              verificationStatus: In(['verified', 'enrolled_free_card'] as any),
            },
            relations: ['student'],
            order: { createdAt: 'ASC' },
          });

          // If the subject roster is empty, fall back to the class roster so the report still renders.
          if (!classStudents.length) {
            classStudents = await this.classStudentRepo.find({
              where: { classId, instituteId, isActive: true, isVerified: true },
              relations: ['student'],
            });
          }
        } else {
          classStudents = await this.classStudentRepo.find({
            where: { classId, instituteId, isActive: true, isVerified: true },
            relations: ['student'],
          });
        }
      } catch (dbError) {
        console.error('❌ Error loading students:', dbError);
        classStudents = [];
      }

      // 3. Load all live attendance rows for these lectures
      let attRows = [];
      try {
        attRows = await this.liveAttRepo.find({
          where: { lectureId: In(validIds) },
          order: { joinTime: 'ASC', createdAt: 'ASC', id: 'ASC' } as any,
        });
      } catch (dbError) {
        console.error('❌ Error loading attendance rows:', dbError);
        attRows = [];
      }

      // Build a map: studentId → lectureId → attendance entry
      const grid: Record<
        string,
        Record<string, {
          attended: boolean;
          loginCount?: number;
          joinTime?: string;
          leaveTime?: string;
          durationMinutes?: number;
          visits?: Array<{ joinTime?: string; leaveTime?: string; durationMinutes?: number; ipAddress?: string; userAgent?: string }>;
        }>
      > = {};

      for (const s of classStudents) {
        const sid = s.studentUserId;
        grid[sid] = {};
        for (const lid of validIds) {
          grid[sid][lid] = { attended: false };
        }
      }

      for (const row of attRows) {
        const sid = row.userId ?? `guest-${row.id}`;
        if (!grid[sid]) grid[sid] = {};
        try {
          const join = row.joinTime ? new Date(row.joinTime) : null;
          const leave = row.leaveTime ? new Date(row.leaveTime) : null;
          const durationMinutes = join && leave && join.getTime() < leave.getTime()
            ? Math.round((leave.getTime() - join.getTime()) / 60000)
            : 0;

          const existing = grid[sid][row.lectureId];
          const existingJoin = existing?.joinTime ? new Date(existing.joinTime) : null;
          const existingLeave = existing?.leaveTime ? new Date(existing.leaveTime) : null;

          const nextJoin = existingJoin && join
            ? (join.getTime() < existingJoin.getTime() ? join : existingJoin)
            : (join ?? existingJoin);
          const nextLeave = existingLeave && leave
            ? (leave.getTime() > existingLeave.getTime() ? leave : existingLeave)
            : (leave ?? existingLeave);

          const accumulatedDuration = (existing?.durationMinutes ?? 0) + durationMinutes;

          const prevVisits = existing?.visits ?? [];
          const thisVisit = {
            joinTime: join?.toISOString(),
            leaveTime: leave?.toISOString(),
            durationMinutes: durationMinutes > 0 ? durationMinutes : undefined,
            ipAddress: row.ipAddress ?? undefined,
            userAgent: row.userAgent ?? undefined,
          };

          grid[sid][row.lectureId] = {
            attended: true,
            loginCount: (existing?.loginCount ?? 0) + 1,
            joinTime: nextJoin?.toISOString() || undefined,
            leaveTime: nextLeave?.toISOString() || undefined,
            durationMinutes: accumulatedDuration > 0 ? accumulatedDuration : undefined,
            visits: [...prevVisits, thisVisit],
          };
        } catch (timeError) {
          console.error('❌ Error processing attendance row times:', timeError);
          grid[sid][row.lectureId] = { attended: true, loginCount: (grid[sid][row.lectureId]?.loginCount ?? 0) + 1 };
        }
      }

      const studentList = classStudents.map(s => {
        try {
          const student = (s as any).student;
          const name = student?.name ?? 
            (`${student?.firstName ?? ''} ${student?.lastName ?? ''}`.trim() || s.studentUserId);
          return {
            id: s.studentUserId,
            name,
            imageUrl: student?.imageUrl ?? null,
          };
        } catch (err) {
          console.error('❌ Error mapping student:', err);
          return {
            id: s.studentUserId,
            name: s.studentUserId,
            imageUrl: null,
          };
        }
      });

      const lectureList = lectures.map(l => ({
        id: l.id,
        title: l.title ?? 'Untitled Lecture',
        startTime: l.startTime,
        subjectId: l.subjectId ?? null,
        status: l.status,
      }));

      return { lectures: lectureList, students: studentList, grid };
    } catch (error) {
      console.error('❌ Unexpected error in getAttendanceGrid:', error);
      throw error;
    }
  }

  // ─────────────────────────────────────────────────────────────
  // Reports
  // ─────────────────────────────────────────────────────────────

  async getLiveAttendanceReport(lectureId: string) {
    const rows = await this.liveAttRepo.find({
      where: { lectureId },
      relations: ['user'],
      order: { joinTime: 'ASC' },
    });

    // Group rows by userId (or guest key) so multi-login shows as one entry with visits[]
    const grouped = new Map<string, {
      id: string;
      userId?: string;
      name: string;
      isGuest: boolean;
      guestEmail?: string;
      guestPhone?: string;
      loginCount: number;
      totalDurationMinutes: number;
      firstJoinTime?: string;
      lastLeaveTime?: string;
      ipAddress?: string;
      visits: Array<{ joinTime?: string; leaveTime?: string; durationMinutes?: number; ipAddress?: string; userAgent?: string }>;
    }>();

    for (const r of rows) {
      const groupKey = r.userId ?? `guest-${r.guestEmail ?? r.guestPhone ?? r.id}`;
      const join = r.joinTime ? new Date(r.joinTime) : null;
      const leave = r.leaveTime ? new Date(r.leaveTime) : null;
      const durationMinutes = join && leave && join.getTime() < leave.getTime()
        ? Math.round((leave.getTime() - join.getTime()) / 60000)
        : null;

      const userName = r.userId
        ? (((r as any).user?.name) ??
            (`${(r as any).user?.firstName ?? ''} ${(r as any).user?.lastName ?? ''}`.trim() || 'Unknown'))
        : (r.guestName ?? 'Guest');

      if (!grouped.has(groupKey)) {
        grouped.set(groupKey, {
          id: r.id,
          userId: r.userId ?? undefined,
          name: userName,
          isGuest: !r.userId,
          guestEmail: r.guestEmail ?? undefined,
          guestPhone: r.guestPhone ?? undefined,
          loginCount: 0,
          totalDurationMinutes: 0,
          firstJoinTime: join?.toISOString(),
          lastLeaveTime: leave?.toISOString(),
          ipAddress: r.ipAddress ?? undefined,
          visits: [],
        });
      }

      const entry = grouped.get(groupKey)!;
      entry.loginCount += 1;
      entry.totalDurationMinutes += durationMinutes ?? 0;

      if (join && (!entry.firstJoinTime || join.getTime() < new Date(entry.firstJoinTime).getTime())) {
        entry.firstJoinTime = join.toISOString();
      }
      if (leave && (!entry.lastLeaveTime || leave.getTime() > new Date(entry.lastLeaveTime).getTime())) {
        entry.lastLeaveTime = leave.toISOString();
      }

      entry.visits.push({
        joinTime: join?.toISOString(),
        leaveTime: leave?.toISOString(),
        durationMinutes: durationMinutes ?? undefined,
        ipAddress: r.ipAddress ?? undefined,
        userAgent: r.userAgent ?? undefined,
      });
    }

    return Array.from(grouped.values()).map(entry => ({
      id: entry.id,
      userId: entry.userId,
      name: entry.name,
      isGuest: entry.isGuest,
      guestEmail: entry.guestEmail,
      guestPhone: entry.guestPhone,
      loginCount: entry.loginCount,
      joinTime: entry.firstJoinTime,
      leaveTime: entry.lastLeaveTime,
      durationMinutes: entry.totalDurationMinutes > 0 ? entry.totalDurationMinutes : null,
      ipAddress: entry.ipAddress,
      visits: entry.visits,
    }));
  }

  async getRecordingActivityReport(lectureId: string) {
    const sessions = await this.recSessionRepo.find({
      where: { lectureId },
      relations: ['user'],
      order: { startTime: 'ASC' },
    });

    if (!sessions.length) return [];

    // Load all activities in one query instead of one-per-session (fixes N+1)
    const sessionIds = sessions.map(s => s.id);
    const allActivities = await this.recActivityRepo.find({
      where: { sessionId: In(sessionIds) },
      order: { createdAt: 'ASC' },
    });

    const actBySession = new Map<string, LectureRecordingActivity[]>();
    for (const act of allActivities) {
      const arr = actBySession.get(act.sessionId) ?? [];
      arr.push(act);
      actBySession.set(act.sessionId, arr);
    }

    return sessions.map(s => ({
      sessionId: s.id,
      userId: s.userId,
      name: s.userId
        ? (s as any).user?.name ??
          `${(s as any).user?.firstName ?? ''} ${(s as any).user?.lastName ?? ''}`.trim()
        : s.guestName ?? 'Guest',
      isGuest: !s.userId,
      startTime: s.startTime,
      endTime: s.endTime,
      totalWatchedSeconds: s.totalWatchedSeconds,
      lastPositionSeconds: s.lastPositionSeconds,
      activities: (actBySession.get(s.id) ?? []).map(a => ({
        type: a.activityType,
        videoTimestamp: a.videoTimestamp,
        at: a.createdAt,
      })),
    }));
  }

  async getStudentLectureActivities(studentId: string, instituteId: string, classId: string, subjectId?: string) {
    const whereClause: any = { instituteId, classId };
    if (subjectId) {
      whereClause.subjectId = subjectId;
    }

    const lectures = await this.lectureRepo.find({
      where: whereClause,
      order: { startTime: 'DESC' }
    });

    if (!lectures.length) return [];

    const lectureIds = lectures.map(l => l.id);

    const liveAtt = await this.liveAttRepo.find({
      where: { userId: studentId, lectureId: In(lectureIds) },
      order: { joinTime: 'ASC' }
    });

    const recSessions = await this.recSessionRepo.find({
      where: { userId: studentId, lectureId: In(lectureIds) },
      order: { startTime: 'ASC' }
    });

    return lectures.map(lecture => {
      const live = liveAtt.filter(l => String(l.lectureId) === String(lecture.id));
      const rec = recSessions.filter(r => String(r.lectureId) === String(lecture.id));

      const liveDurationMinutes = live.reduce((acc, curr) => {
        if (curr.joinTime && curr.leaveTime) {
          return acc + Math.round((new Date(curr.leaveTime).getTime() - new Date(curr.joinTime).getTime()) / 60000);
        }
        return acc;
      }, 0);

      const recWatchedSeconds = rec.reduce((acc, curr) => acc + (curr.totalWatchedSeconds || 0), 0);

      return {
        lecture: {
          id: lecture.id,
          title: lecture.title,
          startTime: lecture.startTime,
          endTime: lecture.endTime,
          liveAttendanceEnabled: lecture.liveAttendanceEnabled,
          recAttendanceEnabled: lecture.recAttendanceEnabled,
        },
        live: live.length > 0 ? {
          sessions: live.map(l => ({ joinTime: l.joinTime, leaveTime: l.leaveTime })),
          totalDurationMinutes: liveDurationMinutes
        } : null,
        recording: rec.length > 0 ? {
          sessions: rec.map(r => ({ startTime: r.startTime, endTime: r.endTime, watchedSeconds: r.totalWatchedSeconds, lastPosition: r.lastPositionSeconds })),
          totalWatchedSeconds: recWatchedSeconds,
          sessionCount: rec.length
        } : null
      };
    });
  }

  // ─────────────────────────────────────────────────────────────
  // Enhanced Recording Reports: Timeline & Watch History
  // ─────────────────────────────────────────────────────────────

  /**
   * Get detailed activity timeline for a recording session with wall-clock timestamps
   * Shows exact time of each interaction and how long user watched between actions
   */
  async getRecordingSessionTimeline(sessionId: string, userId?: string) {
    const session = await this.recSessionRepo.findOne({
      where: { id: sessionId },
      relations: ['user'],
    });

    if (!session) throw new NotFoundException('Session not found');
    if (userId && session.userId && session.userId !== userId) {
      throw new ForbiddenException('Not your session');
    }

    const activities = await this.recActivityRepo.find({
      where: { sessionId },
      order: { createdAt: 'ASC' },
    });

    // Build timeline with computed watch durations
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
        durationUntilNextMs: durationUntilNextMs ? Math.max(0, durationUntilNextMs) : null,
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

  /**
   * Get recording watch history for a lecture, grouped and filtered by user type
   * Returns: enrolled students, other Suraksha users, guest viewers
   */
  async getRecordingWatchHistory(
    lectureId: string,
    userTypeFilter?: 'enrolled' | 'suraksha_user' | 'guest' | 'all',
  ) {
    const lecture = await this.lectureRepo.findOne({ where: { id: lectureId } });
    if (!lecture) throw new NotFoundException('Lecture not found');

    let query = this.recSessionRepo.createQueryBuilder('session')
      .where('session.lectureId = :lectureId', { lectureId })
      .leftJoinAndSelect('session.user', 'user')
      .orderBy('session.startTime', 'ASC');

    if (userTypeFilter && userTypeFilter !== 'all') {
      query = query.andWhere('session.userType = :userType', { userType: userTypeFilter });
    }

    const sessions = await query.getMany();

    // Load activity counts per session
    const sessionIds = sessions.map(s => s.id);
    const activityCounts = await this.recActivityRepo
      .createQueryBuilder('activity')
      .select('activity.sessionId', 'sessionId')
      .addSelect('COUNT(*)', 'count')
      .where('activity.sessionId IN (:...sessionIds)', { sessionIds })
      .groupBy('activity.sessionId')
      .getRawMany();

    const actCountMap = new Map(
      activityCounts.map(ac => [ac.sessionId, parseInt(ac.count, 10)]),
    );

    const grouped = {
      enrolled: [] as any[],
      suraksha_user: [] as any[],
      guest: [] as any[],
    };

    for (const session of sessions) {
      const record = {
        sessionId: session.id,
        userId: session.userId,
        userName: session.userId
          ? (session.user as any)?.name ??
            `${(session.user as any)?.firstName ?? ''} ${(session.user as any)?.lastName ?? ''}`.trim()
          : session.guestName ?? 'Guest',
        userEmail: session.userId ? (session.user as any)?.email : session.guestEmail,
        userPhone: session.guestPhone,
        startTime: formatSriLankaDateTime(session.startTime),
        endTime: session.endTime ? formatSriLankaDateTime(session.endTime) : null,
        totalWatchedSeconds: session.totalWatchedSeconds,
        lastPositionSeconds: session.lastPositionSeconds,
        durationMinutes: session.endTime
          ? Math.round(
              (session.endTime.getTime() - session.startTime.getTime()) / 60000,
            )
          : null,
        activityCount: actCountMap.get(session.id) ?? 0,
        backupStatus: session.backupStatus,
        lastSyncTime: session.lastSyncTime ? formatSriLankaDateTime(session.lastSyncTime) : null,
        ipAddress: session.ipAddress,
      };

      grouped[session.userType].push(record);
    }

    return grouped;
  }

  /**
   * Manually trigger sync of all pending activities for a session
   * Auto-sync should be enabled by default, but manual button available for recovery
   */
  async syncSessionActivities(sessionId: string) {
    const session = await this.recSessionRepo.findOne({ where: { id: sessionId } });
    if (!session) throw new NotFoundException('Session not found');

    // Mark backup as completed and record sync time
    await this.recSessionRepo.update(sessionId, {
      backupStatus: 'completed',
      lastSyncTime: new Date(),
    });

    return {
      success: true,
      sessionId,
      backupStatus: 'completed',
      syncedAt: formatSriLankaDateTime(new Date()),
      message: 'Activities synchronized successfully',
    };
  }

  /**
   * Auto-sync all pending activities (called by background job)
   * Returns count of synced sessions
   */
  async autoSyncPendingActivities() {
    const pendingSessions = await this.recSessionRepo.find({
      where: { backupStatus: 'pending' },
    });

    if (!pendingSessions.length) return { synced: 0 };

    const now = new Date();
    const sessionIds = pendingSessions.map(s => s.id);

    await this.recSessionRepo.update(
      { id: In(sessionIds) },
      {
        backupStatus: 'completed',
        lastSyncTime: now,
      },
    );

    return {
      synced: pendingSessions.length,
      syncedAt: formatSriLankaDateTime(now),
    };
  }
}
