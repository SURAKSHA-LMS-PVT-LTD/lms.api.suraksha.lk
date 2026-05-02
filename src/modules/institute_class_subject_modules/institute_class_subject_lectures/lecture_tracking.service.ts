import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { InstituteClassSubjectLecture } from './entities/institute_class_subject_lecture.entity';
import { LectureLiveAttendance } from './entities/lecture_live_attendance.entity';
import { LectureRecordingSession } from './entities/lecture_recording_session.entity';
import { LectureRecordingActivity } from './entities/lecture_recording_activity.entity';
import { InstituteClassStudentEntity } from '../../institute_class_modules/institute_class_student/entities/institute_class_student.entity';
import { InstituteClassSubjectStudent } from '../institute_class_subject_students/entities/institute_class_subject_student.entity';
import { InstituteClassSubjectPaymentSubmission } from '../../payment/entities/institute-class-subject-payment-submission.entity';

const BASE_DOMAIN = 'lms.suraksha.lk';

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
    // Fetch scope for denormalisation
    const lecture = await this.lectureRepo.findOne({ where: { id: lectureId } });
    const record = this.liveAttRepo.create({
      lectureId,
      instituteId: lecture?.instituteId,
      classId: lecture?.classId,
      subjectId: lecture?.subjectId,
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

  async recordLiveLeave(attendanceId: string) {
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

  async endRecordingSession(sessionId: string, lastPositionSeconds?: number) {
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
  ) {
    if (!activities.length) return { success: true };

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
    if (!lectureIds.length) return { lectures: [], students: [], grid: {} };

    // 1. Load lectures (validates ownership)
    const lectures = await this.lectureRepo.find({
      where: { id: In(lectureIds), classId, instituteId },
    });
    if (!lectures.length) return { lectures: [], students: [], grid: {} };

    // 2. Load enrolled students for this class
    const classStudents = await this.classStudentRepo.find({
      where: { classId, instituteId, isActive: true, isVerified: true },
      relations: ['student'],
    });

    // 3. Load all live attendance rows for these lectures
    const attRows = await this.liveAttRepo.find({
      where: { lectureId: In(lectureIds) },
    });

    // Build a map: studentId → lectureId → attendance entry
    const grid: Record<
      string,
      Record<string, { attended: boolean; joinTime?: string; leaveTime?: string; durationMinutes?: number }>
    > = {};

    for (const s of classStudents) {
      const sid = s.studentUserId;
      grid[sid] = {};
      for (const lid of lectureIds) {
        grid[sid][lid] = { attended: false };
      }
    }

    for (const row of attRows) {
      const sid = row.userId ?? `guest-${row.id}`;
      if (!grid[sid]) grid[sid] = {};
      const join = row.joinTime ? new Date(row.joinTime) : null;
      const leave = row.leaveTime ? new Date(row.leaveTime) : null;
      const durationMinutes = join && leave
        ? Math.round((leave.getTime() - join.getTime()) / 60000)
        : undefined;
      grid[sid][row.lectureId] = {
        attended: true,
        joinTime: join?.toISOString(),
        leaveTime: leave?.toISOString(),
        durationMinutes,
      };
    }

    const studentList = classStudents.map(s => ({
      id: s.studentUserId,
      name:
        (s as any).student?.name ??
        (`${(s as any).student?.firstName ?? ''} ${(s as any).student?.lastName ?? ''}`.trim() ||
        s.studentUserId),
      imageUrl: (s as any).student?.imageUrl ?? null,
    }));

    const lectureList = lectures.map(l => ({
      id: l.id,
      title: l.title,
      startTime: l.startTime,
      subjectId: l.subjectId ?? null,
      status: l.status,
    }));

    return { lectures: lectureList, students: studentList, grid };
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

    const result = [];
    for (const s of sessions) {
      const activities = await this.recActivityRepo.find({
        where: { sessionId: s.id },
        order: { createdAt: 'ASC' },
      });
      result.push({
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
        activities: activities.map(a => ({
          type: a.activityType,
          videoTimestamp: a.videoTimestamp,
          at: a.createdAt,
        })),
      });
    }
    return result;
  }
}
