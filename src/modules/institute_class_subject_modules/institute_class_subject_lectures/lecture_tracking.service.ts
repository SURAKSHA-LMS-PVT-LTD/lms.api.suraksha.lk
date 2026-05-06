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
    ipAddress?: string,
    userAgent?: string,
  ) {
    const lecture = await this.lectureRepo.findOne({ where: { id: lectureId } });
    if (!lecture) throw new NotFoundException('Lecture not found');

    // Idempotent for authenticated users: resume an existing active join instead of creating a duplicate
    if (userId) {
      const existing = await this.liveAttRepo.findOne({
        where: { lectureId, userId, leaveTime: null as any },
      });
      if (existing) {
        return { attendanceId: existing.id, lectureId, joinTime: existing.joinTime };
      }
    }

    const record = this.liveAttRepo.create({
      lectureId,
      instituteId: lecture.instituteId,
      classId: lecture.classId,
      subjectId: lecture.subjectId,
      userId,
      guestName,
      guestEmail,
      guestPhone,
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

  async startRecordingSession(
    lectureId: string,
    userId?: string,
    guestName?: string,
    guestEmail?: string,
    guestPhone?: string,
    ipAddress?: string,
    userAgent?: string,
  ) {
    const session = this.recSessionRepo.create({
      lectureId,
      userId,
      guestName,
      guestEmail,
      guestPhone,
      startTime: new Date(),
      lastPositionSeconds: 0,
      totalWatchedSeconds: 0,
      ipAddress,
      userAgent,
    });
    const saved = await this.recSessionRepo.save(session);
    return { sessionId: saved.id, lectureId };
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
      type: 'PLAY' | 'PAUSE' | 'SEEK' | 'HEARTBEAT';
      videoTimestamp: number;
      wallTime?: number;
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

    const records = activities.map(act =>
      this.recActivityRepo.create({
        sessionId,
        activityType: act.type,
        videoTimestamp: act.videoTimestamp,
      }),
    );
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
        Record<string, { attended: boolean; joinTime?: string; leaveTime?: string; durationMinutes?: number }>
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

          grid[sid][row.lectureId] = {
            attended: true,
            joinTime: nextJoin?.toISOString() || undefined,
            leaveTime: nextLeave?.toISOString() || undefined,
            durationMinutes: accumulatedDuration > 0 ? accumulatedDuration : undefined,
          };
        } catch (timeError) {
          console.error('❌ Error processing attendance row times:', timeError);
          grid[sid][row.lectureId] = { attended: true };
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
    return rows.map(r => {
      const join = r.joinTime ? new Date(r.joinTime) : null;
      const leave = r.leaveTime ? new Date(r.leaveTime) : null;
      return {
        id: r.id,
        userId: r.userId,
        name: r.userId
          ? (r as any).user?.name ??
            `${(r as any).user?.firstName ?? ''} ${(r as any).user?.lastName ?? ''}`.trim()
          : r.guestName ?? 'Guest',
        isGuest: !r.userId,
        guestEmail: r.guestEmail,
        guestPhone: r.guestPhone,
        joinTime: join?.toISOString(),
        leaveTime: leave?.toISOString(),
        durationMinutes: join && leave
          ? Math.round((leave.getTime() - join.getTime()) / 60000)
          : null,
        ipAddress: r.ipAddress,
      };
    });
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
    
    // Get all lectures for this scope
    const lectures = await this.lectureRepo.find({
      where: whereClause,
      order: { startTime: 'DESC' }
    });
    
    if (!lectures.length) return [];
    
    const lectureIds = lectures.map(l => l.id);
    
    // Get live attendance for this student
    const liveAtt = await this.liveAttRepo.find({
      where: { userId: studentId, lectureId: In(lectureIds) },
      order: { joinTime: 'ASC' }
    });
    
    // Get recording sessions for this student
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
}
