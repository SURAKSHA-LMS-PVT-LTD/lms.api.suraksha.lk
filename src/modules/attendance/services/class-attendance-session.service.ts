import {
  Injectable, Logger, NotFoundException,
  BadRequestException, ForbiddenException,
} from '@nestjs/common';
import { InjectRepository, InjectDataSource } from '@nestjs/typeorm';
import { Repository, In, DataSource } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { InstituteClassAttendanceSessionGroupEntity } from '../entities/institute-class-attendance-session-group.entity';
import { InstituteClassAttendanceSessionEntity, CloseUnmarkAction } from '../entities/institute-class-attendance-session.entity';
import { AttendanceRecordEntity } from '../entities/attendance-record.entity';
import { InstituteClassStudentEntity } from '../../institute_class_modules/institute_class_student/entities/institute_class_student.entity';
import { InstituteUserEntity } from '../../institute_mudules/institue_user/entities/institue_user.entity';
import { UserEntity } from '../../user/entities/user.entity';
import { StudentEntity } from '../../student/entities/student.entity';
import { now, getCurrentSriLankaDate, getCurrentSriLankaISO } from '../../../common/utils/timezone.util';
import { AdvertisementDeliveryService } from '../../advertisement/services/advertisement-delivery.service';
import {
  CreateSessionGroupDto,
  UpdateSessionGroupDto,
  CreateSessionDto,
  UpdateSessionDto,
  CloseSessionDto,
  MarkSessionAttendanceDto,
  BulkMarkSessionAttendanceDto,
  GetSessionsQueryDto,
  GetSessionGridQueryDto,
  STATUS_LABEL,
  SessionGroupResponse,
  SessionResponse,
  SessionDetailResponse,
  SessionStudentRecord,
  SessionGridResponse,
  GridStudentRow,
} from '../dto/class-attendance-session.dto';

const SL_OFFSET_MS = 5.5 * 60 * 60 * 1000; // UTC+5:30

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

function currentSLMinutes(): number {
  const d = new Date(Date.now() + SL_OFFSET_MS);
  return d.getUTCHours() * 60 + d.getUTCMinutes();
}

function resolveAutoStatus(
  session: InstituteClassAttendanceSessionEntity,
): number {
  const nowMin = currentSLMinutes();
  const startMin = toMinutes(session.startTime);

  if (session.lateAfterMinutes != null && nowMin > startMin + session.lateAfterMinutes) {
    if (session.endTime && session.leftEarlyBeforeMinutes != null) {
      const endMin = toMinutes(session.endTime);
      if (nowMin < endMin - session.leftEarlyBeforeMinutes) return 2; // Late
      return 4; // LeftEarly
    }
    return 2; // Late
  }
  return 1; // Present
}

function toSLTimeString(date: Date | string | null): string | null {
  if (!date) return null;
  const d = typeof date === 'string' ? new Date(date) : date;
  const sl = new Date(d.getTime() + SL_OFFSET_MS);
  return sl.toUTCString().slice(17, 25); // HH:MM:SS
}

function mapGroup(g: InstituteClassAttendanceSessionGroupEntity): SessionGroupResponse {
  return {
    id: g.id,
    name: g.name,
    color: g.color,
    displayOrder: g.displayOrder,
    isActive: g.isActive,
  };
}

function mapSession(s: InstituteClassAttendanceSessionEntity): SessionResponse {
  return {
    id: s.id,
    name: s.name,
    date: s.date,
    startTime: s.startTime,
    endTime: s.endTime,
    lateAfterMinutes: s.lateAfterMinutes,
    leftEarlyBeforeMinutes: s.leftEarlyBeforeMinutes,
    isClosed: s.isClosed,
    closedAt: s.closedAt,
    closeUnmarkAction: s.closeUnmarkAction,
    totalStudents: s.totalStudents,
    sessionGroupId: s.sessionGroupId,
    group: s.group ? mapGroup(s.group) : undefined,
    sendNotifications: s.sendNotifications ?? true,
    linkedPaymentId: s.linkedPaymentId,
    paymentMode: s.paymentMode,
    createdAt: s.createdAt,
  };
}

@Injectable()
export class ClassAttendanceSessionService {
  private readonly logger = new Logger(ClassAttendanceSessionService.name);
  private readonly notificationsEnabled: boolean;

  constructor(
    @InjectRepository(InstituteClassAttendanceSessionGroupEntity)
    private readonly groupRepo: Repository<InstituteClassAttendanceSessionGroupEntity>,
    @InjectRepository(InstituteClassAttendanceSessionEntity)
    private readonly sessionRepo: Repository<InstituteClassAttendanceSessionEntity>,
    @InjectRepository(AttendanceRecordEntity)
    private readonly recordRepo: Repository<AttendanceRecordEntity>,
    @InjectRepository(InstituteClassStudentEntity)
    private readonly classStudentRepo: Repository<InstituteClassStudentEntity>,
    @InjectRepository(InstituteUserEntity)
    private readonly instituteUserRepo: Repository<InstituteUserEntity>,
    @InjectRepository(UserEntity)
    private readonly userRepo: Repository<UserEntity>,
    @InjectRepository(StudentEntity)
    private readonly studentRepo: Repository<StudentEntity>,
    private readonly advertisementDeliveryService: AdvertisementDeliveryService,
    private readonly configService: ConfigService,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {
    this.notificationsEnabled = this.configService.get('ENABLE_ATTENDANCE_NOTIFICATIONS', 'true') === 'true';
  }

  // ─────────────────────────────────────────────────────────────
  // SESSION GROUPS
  // ─────────────────────────────────────────────────────────────

  async createSessionGroup(
    instituteId: string,
    classId: string,
    dto: CreateSessionGroupDto,
    userId?: string,
  ): Promise<SessionGroupResponse> {
    const timestamp = now();
    const group = this.groupRepo.create({
      instituteId,
      classId,
      name: dto.name,
      color: dto.color,
      displayOrder: dto.displayOrder ?? 0,
      isActive: true,
      createdBy: userId,
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    const saved = await this.groupRepo.save(group);
    return mapGroup(saved);
  }

  async getSessionGroups(instituteId: string, classId: string): Promise<SessionGroupResponse[]> {
    const groups = await this.groupRepo.find({
      where: { instituteId, classId, isActive: true },
      order: { displayOrder: 'ASC', name: 'ASC' },
    });
    return groups.map(mapGroup);
  }

  async updateSessionGroup(
    groupId: string,
    instituteId: string,
    dto: UpdateSessionGroupDto,
  ): Promise<SessionGroupResponse> {
    const group = await this.groupRepo.findOne({ where: { id: groupId, instituteId } });
    if (!group) throw new NotFoundException('Session group not found');

    if (dto.name !== undefined)         group.name = dto.name;
    if (dto.color !== undefined)        group.color = dto.color;
    if (dto.displayOrder !== undefined) group.displayOrder = dto.displayOrder;
    if (dto.isActive !== undefined)     group.isActive = dto.isActive;
    group.updatedAt = now();

    const saved = await this.groupRepo.save(group);
    return mapGroup(saved);
  }

  async deleteSessionGroup(groupId: string, instituteId: string): Promise<void> {
    const group = await this.groupRepo.findOne({ where: { id: groupId, instituteId } });
    if (!group) throw new NotFoundException('Session group not found');
    group.isActive = false;
    group.updatedAt = now();
    await this.groupRepo.save(group);
  }

  // ─────────────────────────────────────────────────────────────
  // SESSIONS
  // ─────────────────────────────────────────────────────────────

  async createSession(
    instituteId: string,
    classId: string,
    dto: CreateSessionDto,
    userId?: string,
  ): Promise<SessionResponse> {
    const date = dto.date ?? getCurrentSriLankaDate();

    const totalStudents = await this.classStudentRepo.count({
      where: { instituteId, classId, isActive: true, isVerified: true },
    });

    const timestamp = now();
    const session = this.sessionRepo.create({
      instituteId,
      classId,
      sessionGroupId: dto.sessionGroupId,
      name: dto.name,
      date,
      startTime: dto.startTime,
      endTime: dto.endTime,
      lateAfterMinutes: dto.lateAfterMinutes,
      leftEarlyBeforeMinutes: dto.leftEarlyBeforeMinutes,
      isClosed: false,
      closeUnmarkAction: CloseUnmarkAction.KEEP_NOT_MARKED,
      totalStudents,
      sendNotifications: dto.sendNotifications ?? true,
      linkedPaymentId: dto.linkedPaymentId,
      paymentMode: dto.paymentMode,
      createdBy: userId,
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    const saved = await this.sessionRepo.save(session);
    this.logger.log(`Created session ${saved.id} for class ${classId} on ${date}`);
    return mapSession(saved);
  }

  async updateSession(
    sessionId: string,
    instituteId: string,
    dto: UpdateSessionDto,
  ): Promise<SessionResponse> {
    const session = await this.getSessionById(sessionId, instituteId);
    if (dto.name !== undefined)                 session.name = dto.name;
    if (dto.startTime !== undefined)            session.startTime = dto.startTime;
    if (dto.endTime !== undefined)              session.endTime = dto.endTime;
    if (dto.lateAfterMinutes !== undefined)     session.lateAfterMinutes = dto.lateAfterMinutes;
    if (dto.leftEarlyBeforeMinutes !== undefined) session.leftEarlyBeforeMinutes = dto.leftEarlyBeforeMinutes;
    if ('sessionGroupId' in dto)               session.sessionGroupId = dto.sessionGroupId ?? undefined;
    if (dto.sendNotifications !== undefined)   session.sendNotifications = dto.sendNotifications;
    if ('linkedPaymentId' in dto)              session.linkedPaymentId = dto.linkedPaymentId ?? undefined;
    if ('paymentMode' in dto)                  session.paymentMode = dto.paymentMode ?? undefined;
    session.updatedAt = now();
    const saved = await this.sessionRepo.save(session);
    return mapSession(saved);
  }

  async getSessions(
    instituteId: string,
    classId: string,
    query: GetSessionsQueryDto,
  ): Promise<SessionResponse[]> {
    const qb = this.sessionRepo
      .createQueryBuilder('s')
      .leftJoinAndSelect('s.group', 'group')
      .where('s.instituteId = :instituteId', { instituteId })
      .andWhere('s.classId = :classId', { classId });

    if (query.date) {
      qb.andWhere('s.date = :date', { date: query.date });
    } else if (query.startDate && query.endDate) {
      qb.andWhere('s.date BETWEEN :startDate AND :endDate', {
        startDate: query.startDate,
        endDate: query.endDate,
      });
    }

    if (query.sessionGroupId) {
      qb.andWhere('s.sessionGroupId = :groupId', { groupId: query.sessionGroupId });
    }
    if (query.includeClosed === false) {
      qb.andWhere('s.isClosed = false');
    }

    qb.orderBy('s.date', 'DESC').addOrderBy('s.startTime', 'ASC');
    const sessions = await qb.getMany();
    return sessions.map(mapSession);
  }

  async getSessionById(sessionId: string, instituteId: string): Promise<InstituteClassAttendanceSessionEntity> {
    const session = await this.sessionRepo.findOne({
      where: { id: sessionId, instituteId },
      relations: ['group'],
    });
    if (!session) throw new NotFoundException('Session not found');
    return session;
  }

  // ─────────────────────────────────────────────────────────────
  // SESSION DETAIL (with all students + their attendance status)
  // ─────────────────────────────────────────────────────────────

  async getSessionDetail(sessionId: string, instituteId: string): Promise<SessionDetailResponse> {
    const session = await this.getSessionById(sessionId, instituteId);

    const rows: any[] = await this.dataSource.query(`
      SELECT
        cs.student_user_id         AS studentId,
        u.name_with_initials       AS studentName,
        COALESCE(iu.institute_user_image_url, u.image_url) AS imageUrl,
        iu.user_id_institue        AS userIdInstitute,
        iu.institute_card_id       AS cardId,
        ar.status                  AS statusCode,
        ar.created_at              AS markedAt,
        ar.remarks                 AS remarks,
        ${session.linkedPaymentId ? `
        CASE
          WHEN sub.id IS NOT NULL AND sub.status IN ('VERIFIED','HALF_VERIFIED','QUARTER_VERIFIED') THEN 'PAID'
          WHEN sub.id IS NOT NULL THEN 'PENDING'
          ELSE 'UNPAID'
        END AS paymentStatus
        ` : `NULL AS paymentStatus`}
      FROM institute_class_students cs
      JOIN users u         ON u.id = cs.student_user_id
      JOIN institute_user iu
                           ON iu.user_id = cs.student_user_id
                          AND iu.institute_id = cs.institute_id
      LEFT JOIN attendance_records ar
                           ON ar.class_session_id = ?
                          AND ar.student_id = cs.student_user_id
      ${session.linkedPaymentId ? `
      LEFT JOIN institute_class_payment_submissions sub
                           ON sub.payment_id = ?
                          AND sub.user_id = cs.student_user_id
      ` : ''}
      WHERE cs.institute_id = ?
        AND cs.class_id    = ?
        AND cs.is_active   = 1
        AND cs.is_verified = 1
      ORDER BY u.name_with_initials ASC
    `, session.linkedPaymentId
        ? [sessionId, session.linkedPaymentId, instituteId, session.classId]
        : [sessionId, instituteId, session.classId]);

    let presentCount = 0, absentCount = 0, lateCount = 0, notMarkedCount = 0;

    const studentRows: SessionStudentRecord[] = rows.map(r => {
      const statusCode: number | null = r.statusCode !== null && r.statusCode !== undefined ? Number(r.statusCode) : null;
      const label = statusCode !== null ? (STATUS_LABEL[statusCode] ?? 'Unknown') : 'NotMarked';

      if (statusCode === 1) presentCount++;
      else if (statusCode === 0) absentCount++;
      else if (statusCode === 2) lateCount++;
      else notMarkedCount++;

      return {
        studentId: r.studentId,
        studentName: r.studentName ?? 'Unknown',
        imageUrl: r.imageUrl ?? null,
        userIdInstitute: r.userIdInstitute ?? null,
        cardId: r.cardId ?? null,
        statusCode,
        statusLabel: label,
        markedAt: r.markedAt ? toSLTimeString(r.markedAt) : null,
        remarks: r.remarks ?? null,
        isFromOtherSource: false,
        paymentStatus: r.paymentStatus ?? null,
      };
    });

    return { ...mapSession(session), students: studentRows, presentCount, absentCount, lateCount, notMarkedCount };
  }

  // ─────────────────────────────────────────────────────────────
  // MARK ATTENDANCE IN SESSION
  // ─────────────────────────────────────────────────────────────

  async markAttendanceInSession(
    sessionId: string,
    instituteId: string,
    dto: MarkSessionAttendanceDto,
    userId?: string,
  ): Promise<{ success: boolean; record: any }> {
    const session = await this.getSessionById(sessionId, instituteId);
    if (session.isClosed) throw new ForbiddenException('Session is closed');

    // Payment enforcement
    if (session.linkedPaymentId && session.paymentMode === 'REQUIRED') {
      const [subRow]: any[] = await this.dataSource.query(
        `SELECT id, status FROM institute_class_payment_submissions WHERE payment_id = ? AND user_id = ? LIMIT 1`,
        [session.linkedPaymentId, dto.studentId],
      );
      if (!subRow || !['VERIFIED', 'HALF_VERIFIED', 'QUARTER_VERIFIED'].includes(subRow.status)) {
        throw new ForbiddenException('Student has not completed payment for this session');
      }
    }

    const today = getCurrentSriLankaDate();
    // Normalize session.date to YYYY-MM-DD string
    // Cast to any: entity types date as string, but TypeORM may return a Date object at runtime
    const rawDate: any = session.date;
    const sessionDate: string =
      rawDate instanceof Date
        ? new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Colombo' }).format(rawDate as Date)
        : String(rawDate).substring(0, 10);

    if (sessionDate < today) {
      throw new BadRequestException('Cannot mark attendance for past sessions');
    }
    if (sessionDate > today) {
      throw new BadRequestException('Cannot mark attendance for future sessions');
    }

    // Session records always take precedence in the session view, so non-session records
    // from other sources (e.g. gate check-in) are allowed to co-exist.
    const autoStatus = dto.status ?? resolveAutoStatus(session);
    const timestamp = now();

    const existing = await this.recordRepo.findOne({
      where: { classSessionId: sessionId, studentId: dto.studentId },
    });

    if (existing) {
      existing.status = autoStatus;
      existing.remarks = dto.remarks ?? existing.remarks;
      existing.createdAt = timestamp;
      await this.recordRepo.save(existing);
      return { success: true, record: existing };
    }

    const syntheticPk = `I#${instituteId}`;
    const syntheticSk = `SESSION#${sessionId}#S#${dto.studentId}#TS#${Date.now()}`;

    const record = this.recordRepo.create({
      dynamoPk: syntheticPk,
      dynamoSk: syntheticSk,
      instituteId,
      classId: session.classId,
      classSessionId: sessionId,
      studentId: dto.studentId,
      date: session.date,
      status: autoStatus,
      timestamp: BigInt(Date.now()).toString(),
      remarks: dto.remarks ?? null,
      markingMethod: 'MANUAL',
      userType: 'STUDENT',
      syncStatus: 'SYNCED',
      syncError: null,
      syncedAt: timestamp,
      createdAt: timestamp,
      calendarDayId: null,
      eventId: null,
      location: null,
      latitude: null,
      longitude: null,
      deviceUid: null,
      advertisementId: null,
    });
    const saved = await this.recordRepo.save(record);

    // Send parent notification for ABSENT (0) or LATE (2) when session has notifications enabled
    if (session.sendNotifications && (autoStatus === 0 || autoStatus === 2)) {
      this.sendSessionAttendanceNotification(session, dto.studentId, autoStatus, saved.id).catch(
        err => this.logger.warn(`Session notification failed: ${err.message}`),
      );
    }

    return { success: true, record: saved };
  }

  async bulkMarkAttendanceInSession(
    sessionId: string,
    instituteId: string,
    dto: BulkMarkSessionAttendanceDto,
    userId?: string,
  ): Promise<{ marked: number; updated: number; errors: string[] }> {
    const session = await this.getSessionById(sessionId, instituteId);
    if (session.isClosed) throw new ForbiddenException('Session is closed');

    // Pre-fetch payment statuses for REQUIRED mode (one query for all students)
    let approvedStudentIds: Set<string> | null = null;
    if (session.linkedPaymentId && session.paymentMode === 'REQUIRED') {
      const studentIds = dto.records.map(r => r.studentId);
      if (studentIds.length > 0) {
        const payRows: any[] = await this.dataSource.query(
          `SELECT user_id FROM institute_class_payment_submissions WHERE payment_id = ? AND user_id IN (${studentIds.map(() => '?').join(',')}) AND status IN ('VERIFIED','HALF_VERIFIED','QUARTER_VERIFIED')`,
          [session.linkedPaymentId, ...studentIds],
        );
        approvedStudentIds = new Set(payRows.map(r => String(r.user_id)));
      } else {
        approvedStudentIds = new Set();
      }
    }

    let marked = 0, updated = 0;
    const errors: string[] = [];

    for (const item of dto.records) {
      if (approvedStudentIds !== null && !approvedStudentIds.has(item.studentId)) {
        errors.push(`${item.studentId}: Student has not completed payment for this session`);
        continue;
      }
      try {
        const res = await this.markAttendanceInSession(sessionId, instituteId, item, userId);
        if (res.record.id) marked++;
      } catch (e) {
        errors.push(`${item.studentId}: ${e.message}`);
      }
    }
    return { marked, updated, errors };
  }

  // ─────────────────────────────────────────────────────────────
  // NOTIFICATION (fire-and-forget)
  // ─────────────────────────────────────────────────────────────

  private async sendSessionAttendanceNotification(
    session: InstituteClassAttendanceSessionEntity,
    studentId: string,
    statusCode: number,
    recordId: string,
  ): Promise<void> {
    if (!this.notificationsEnabled) return;

    try {
      const student = await this.studentRepo.findOne({
        where: { userId: studentId },
        relations: ['user', 'father', 'father.user', 'mother', 'mother.user', 'guardian', 'guardian.user'],
        select: {
          userId: true,
          fatherId: true,
          motherId: true,
          guardianId: true,
          user: { id: true, firstName: true, lastName: true, nameWithInitials: true, subscriptionPlan: true },
          father: { userId: true, user: { id: true, firstName: true, lastName: true, nameWithInitials: true, phoneNumber: true, email: true, telegramId: true, firstLoginCompleted: true } },
          mother: { userId: true, user: { id: true, firstName: true, lastName: true, nameWithInitials: true, phoneNumber: true, email: true, telegramId: true, firstLoginCompleted: true } },
          guardian: { userId: true, user: { id: true, firstName: true, lastName: true, nameWithInitials: true, phoneNumber: true, email: true, telegramId: true, firstLoginCompleted: true } },
        },
      });

      if (!student?.user) return;

      // Pick primary parent in order: father → mother → guardian
      const parentEntry = student.father?.user
        ? { userId: student.father.userId, user: student.father.user }
        : student.mother?.user
          ? { userId: student.mother.userId, user: student.mother.user }
          : student.guardian?.user
            ? { userId: student.guardian.userId, user: student.guardian.user }
            : null;

      if (!parentEntry) return;

      const { userId: parentUserId, user: parentUser } = parentEntry;
      const parentContact = parentUser.phoneNumber || null;
      const parentEmail = parentUser.email || null;
      const parentTelegramId = (parentUser as any).telegramId || null;

      if (!parentContact && !parentEmail && !parentTelegramId) return;

      const studentName = student.user.nameWithInitials ||
        `${student.user.firstName} ${(student.user as any).lastName || ''}`.trim();
      const parentName = parentUser.nameWithInitials ||
        `${parentUser.firstName} ${(parentUser as any).lastName || ''}`.trim() || 'Parent/Guardian';
      const subscriptionPlan = (student.user as any).subscriptionPlan || 'FREE';

      await this.advertisementDeliveryService.sendAttendanceWithAdvertisement(studentId, {
        studentId,
        studentName,
        parentName,
        parentContact,
        parentEmail,
        parentTelegramId,
        parentUserId,
        instituteId: session.instituteId,
        attendanceId: recordId,
        attendanceStatus: 'ABSENT',  // LATE (2) also triggers absent-style alert (type only supports PRESENT|ABSENT)
        attendanceType: 'CLASS',
        date: session.date,
        time: getCurrentSriLankaISO(),
        className: statusCode === 2 ? `${session.name} (Late)` : session.name,
        subscriptionPlan,
        firstLoginCompleted: (parentUser as any).firstLoginCompleted ?? false,
      });
    } catch (err) {
      this.logger.warn(`sendSessionAttendanceNotification error for student ${studentId}: ${err.message}`);
    }
  }

  // ─────────────────────────────────────────────────────────────
  // CLOSE SESSION
  // ─────────────────────────────────────────────────────────────

  async closeSession(
    sessionId: string,
    instituteId: string,
    dto: CloseSessionDto,
    userId?: string,
  ): Promise<SessionResponse> {
    const session = await this.getSessionById(sessionId, instituteId);
    if (session.isClosed) throw new BadRequestException('Session is already closed');

    if (dto.closeUnmarkAction === CloseUnmarkAction.MARK_ABSENT) {
      const markedIds = await this.recordRepo
        .createQueryBuilder('r')
        .select('r.student_id', 'studentId')
        .where('r.class_session_id = :sessionId', { sessionId })
        .getRawMany()
        .then(rows => rows.map(r => r.studentId));

      const allStudents = await this.classStudentRepo.find({
        where: { instituteId, classId: session.classId, isActive: true, isVerified: true },
        select: ['studentUserId'],
      });

      const unmarked = allStudents.filter(s => !markedIds.includes(s.studentUserId));
      if (unmarked.length > 0) {
        const timestamp = now();
        const absentRecords = unmarked.map(s => {
          const syntheticSk = `SESSION#${sessionId}#S#${s.studentUserId}#TS#${Date.now() + Math.random()}`;
          return this.recordRepo.create({
            dynamoPk: `I#${instituteId}`,
            dynamoSk: syntheticSk,
            instituteId,
            classId: session.classId,
            classSessionId: sessionId,
            studentId: s.studentUserId,
            date: session.date,
            status: 0, // Absent
            timestamp: BigInt(Date.now()).toString(),
            remarks: 'Auto-marked absent on session close',
            markingMethod: 'SYSTEM',
            userType: 'STUDENT',
            syncStatus: 'SYNCED',
            syncError: null,
            syncedAt: timestamp,
            createdAt: timestamp,
            calendarDayId: null,
            eventId: null,
            location: null,
            latitude: null,
            longitude: null,
            deviceUid: null,
            advertisementId: null,
          });
        });
        await this.recordRepo.save(absentRecords);
        this.logger.log(`Auto-marked ${absentRecords.length} students absent on session ${sessionId} close`);
      }
    }

    session.isClosed = true;
    session.closedAt = now();
    session.closeUnmarkAction = dto.closeUnmarkAction;
    session.updatedAt = now();
    const saved = await this.sessionRepo.save(session);
    return mapSession(saved);
  }

  // ─────────────────────────────────────────────────────────────
  // MULTI-SESSION GRID VIEW
  // ─────────────────────────────────────────────────────────────

  async getSessionGrid(
    instituteId: string,
    classId: string,
    query: GetSessionGridQueryDto,
  ): Promise<SessionGridResponse> {
    const sessionIds = query.sessionIds.split(',').map(s => s.trim()).filter(Boolean);
    if (!sessionIds.length) throw new BadRequestException('sessionIds is required');

    const sessions = await this.sessionRepo.find({
      where: { id: In(sessionIds), instituteId, classId },
      relations: ['group'],
      order: { date: 'ASC', startTime: 'ASC' },
    });
    if (!sessions.length) throw new NotFoundException('No sessions found');

    const students = await this.classStudentRepo.find({
      where: { instituteId, classId, isActive: true, isVerified: true },
    });
    const studentIds = students.map(s => s.studentUserId);

    const [records, instituteUsers, users] = await Promise.all([
      studentIds.length && sessionIds.length
        ? this.recordRepo.find({
            where: { classSessionId: In(sessionIds), studentId: In(studentIds) },
            select: ['studentId', 'classSessionId', 'status', 'createdAt'],
          })
        : Promise.resolve([]),
      studentIds.length
        ? this.instituteUserRepo.find({
            where: { instituteId, userId: In(studentIds) },
            select: ['userId', 'userIdByInstitute', 'instituteCardId', 'instituteUserImageUrl'],
          })
        : Promise.resolve([]),
      studentIds.length
        ? this.userRepo.find({
            where: { id: In(studentIds) },
            select: ['id', 'nameWithInitials', 'imageUrl'],
          })
        : Promise.resolve([]),
    ]);

    // Map: studentId → sessionId → record
    const recMap = new Map<string, Map<string, typeof records[0]>>();
    for (const r of records) {
      if (!recMap.has(r.studentId)) recMap.set(r.studentId, new Map());
      recMap.get(r.studentId)!.set(r.classSessionId!, r);
    }

    const iuMap = new Map(instituteUsers.map(u => [u.userId, u]));
    const userMap = new Map(users.map(u => [u.id, u]));

    const gridStudents: GridStudentRow[] = students.map(s => {
      const iu   = iuMap.get(s.studentUserId);
      const user = userMap.get(s.studentUserId);
      const sessionRecords: GridStudentRow['sessions'] = {};

      for (const sess of sessions) {
        const rec = recMap.get(s.studentUserId)?.get(sess.id);
        const code = rec ? Number(rec.status) : null;
        sessionRecords[sess.id] = {
          statusCode: code,
          statusLabel: code !== null ? (STATUS_LABEL[code] ?? 'Unknown') : 'NotMarked',
          markedAt: rec ? toSLTimeString(rec.createdAt) : null,
        };
      }

      return {
        studentId: s.studentUserId,
        studentName: user?.nameWithInitials ?? 'Unknown',
        imageUrl: iu?.instituteUserImageUrl ?? user?.imageUrl ?? null,
        userIdInstitute: iu?.userIdByInstitute ?? null,
        cardId: iu?.instituteCardId ?? null,
        sessions: sessionRecords,
      };
    });

    return {
      sessions: sessions.map(mapSession),
      students: gridStudents,
    };
  }
}
