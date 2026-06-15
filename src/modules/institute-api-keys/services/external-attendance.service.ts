import { Injectable, Logger, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectRepository, InjectDataSource } from '@nestjs/typeorm';
import { Repository, DataSource, In } from 'typeorm';
import { InstituteClassAttendanceSessionEntity } from '../../attendance/entities/institute-class-attendance-session.entity';
import { AttendanceRecordEntity } from '../../attendance/entities/attendance-record.entity';
import { InstituteClassStudentEntity } from '../../institute_class_modules/institute_class_student/entities/institute_class_student.entity';
import { InstituteUserEntity } from '../../institute_mudules/institue_user/entities/institue_user.entity';
import {
  BulkExternalAttendanceDto,
  BulkExternalAttendanceResult,
  ExternalAttendanceFailure,
} from '../dto/external-attendance.dto';
import { now, getCurrentSriLankaDate } from '../../../common/utils/timezone.util';

function resolveAutoStatus(session: InstituteClassAttendanceSessionEntity): number {
  const SL_OFFSET_MS = 5.5 * 60 * 60 * 1000;
  const d = new Date(Date.now() + SL_OFFSET_MS);
  const nowMin = d.getUTCHours() * 60 + d.getUTCMinutes();
  const [h, m] = session.startTime.split(':').map(Number);
  const startMin = h * 60 + m;

  if (session.lateAfterMinutes != null && nowMin > startMin + session.lateAfterMinutes) {
    if (session.endTime && session.leftEarlyBeforeMinutes != null) {
      const [eh, em] = session.endTime.split(':').map(Number);
      const endMin = eh * 60 + em;
      if (nowMin < endMin - session.leftEarlyBeforeMinutes) return 2; // Late
      return 4; // LeftEarly
    }
    return 2; // Late
  }
  return 1; // Present
}

@Injectable()
export class ExternalAttendanceService {
  private readonly logger = new Logger(ExternalAttendanceService.name);

  constructor(
    @InjectRepository(InstituteClassAttendanceSessionEntity)
    private readonly sessionRepo: Repository<InstituteClassAttendanceSessionEntity>,
    @InjectRepository(AttendanceRecordEntity)
    private readonly recordRepo: Repository<AttendanceRecordEntity>,
    @InjectRepository(InstituteClassStudentEntity)
    private readonly classStudentRepo: Repository<InstituteClassStudentEntity>,
    @InjectRepository(InstituteUserEntity)
    private readonly instituteUserRepo: Repository<InstituteUserEntity>,
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  async bulkMarkAttendance(
    sessionId: string,
    instituteId: string,
    dto: BulkExternalAttendanceDto,
    apiKeyId: string,
  ): Promise<BulkExternalAttendanceResult> {
    // 1. Load session — must belong to this institute
    const session = await this.sessionRepo.findOne({
      where: { id: sessionId, instituteId },
    });

    if (!session) {
      throw new NotFoundException(`Session '${sessionId}' not found for this institute`);
    }

    if (session.isClosed) {
      throw new ForbiddenException('Session is closed and no longer accepts attendance');
    }

    // 2. Validate session date is today
    const today = getCurrentSriLankaDate();
    const rawDate: any = session.date;
    const sessionDate: string =
      rawDate instanceof Date
        ? new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Colombo' }).format(rawDate as Date)
        : String(rawDate).substring(0, 10);

    // Past sessions ARE allowed here: this endpoint doubles as a migration entry point
    // for importing historical attendance from another system. Future sessions remain
    // blocked since they can't have real check-ins yet.
    if (sessionDate > today) {
      throw new ForbiddenException('Cannot mark attendance for future sessions');
    }

    if (!dto.records?.length) {
      return { sessionId, successCount: 0, failedCount: 0, failures: [] };
    }

    const incomingIds = dto.records.map(r => r.studentId);

    // 3. Resolve each incoming id → the real Suraksha student user ID.
    // An incoming id may be EITHER a Suraksha user ID OR the institute's own
    // legacy id (stored as institute_user.userIdByInstitute during migration).
    // We look up both within this institute and build incomingId → realUserId.
    const memberships = await this.instituteUserRepo.find({
      where: [
        { instituteId, userId: In(incomingIds) },
        { instituteId, userIdByInstitute: In(incomingIds) },
      ],
      select: ['userId', 'userIdByInstitute'],
    });
    const idToUserId = new Map<string, string>();
    for (const m of memberships) {
      // A direct user-ID match wins; also index the legacy id when present.
      idToUserId.set(String(m.userId), String(m.userId));
      if (m.userIdByInstitute) idToUserId.set(String(m.userIdByInstitute), String(m.userId));
    }

    // The set of resolved user IDs we now need to check class-enrollment for.
    const resolvedUserIds = [...new Set([...idToUserId.values()])];

    // 4. Verify the resolved students are enrolled in this class.
    const enrolled = resolvedUserIds.length
      ? await this.classStudentRepo.find({
          where: {
            studentUserId: In(resolvedUserIds),
            classId: session.classId,
            instituteId,
            isActive: true,
          },
          select: ['studentUserId'],
        })
      : [];
    const enrolledSet = new Set(enrolled.map(e => String(e.studentUserId)));

    // 5. Payment enforcement (REQUIRED mode only) — keyed by resolved user IDs.
    let approvedPaymentIds: Set<string> | null = null;
    if (session.linkedPaymentId && session.paymentMode === 'REQUIRED' && resolvedUserIds.length) {
      const payRows: any[] = await this.dataSource.query(
        `SELECT user_id FROM institute_class_payment_submissions
         WHERE payment_id = ? AND user_id IN (${resolvedUserIds.map(() => '?').join(',')})
         AND status IN ('VERIFIED','HALF_VERIFIED','QUARTER_VERIFIED')`,
        [session.linkedPaymentId, ...resolvedUserIds],
      );
      approvedPaymentIds = new Set(payRows.map(r => String(r.user_id)));
    }

    // 6. Pre-load existing records for this session (avoid N+1 on update), keyed by real user ID.
    const existingRecords = resolvedUserIds.length
      ? await this.recordRepo.find({
          where: { classSessionId: sessionId, studentId: In(resolvedUserIds) },
        })
      : [];
    const existingMap = new Map(existingRecords.map(r => [String(r.studentId), r]));

    // 7. Process each record. Failures echo back the ORIGINAL incoming id so the
    // caller can match them to its source rows (e.g. legacy ids in a CSV).
    let successCount = 0;
    const failures: ExternalAttendanceFailure[] = [];
    const timestamp = now();

    for (const item of dto.records) {
      const realUserId = idToUserId.get(String(item.studentId));

      // Unknown id: not a member of this institute under either id form.
      if (!realUserId) {
        failures.push({ studentId: item.studentId, reason: 'Student not found in this institute (no matching user id or institute id)' });
        continue;
      }

      // Check enrollment in the session's class.
      if (!enrolledSet.has(realUserId)) {
        failures.push({ studentId: item.studentId, reason: 'Student is not enrolled in this class' });
        continue;
      }

      // Check payment.
      if (approvedPaymentIds !== null && !approvedPaymentIds.has(realUserId)) {
        failures.push({ studentId: item.studentId, reason: 'Student has not completed required payment' });
        continue;
      }

      try {
        const autoStatus = item.status ?? resolveAutoStatus(session);

        // Preserve the original check-in time when migrating historical attendance.
        // Falls back to the current time when checkInTime is omitted or unparseable.
        let checkInMs = Date.now();
        if (item.checkInTime) {
          const parsed = Date.parse(item.checkInTime);
          if (!Number.isNaN(parsed)) checkInMs = parsed;
        }
        const checkInDate = new Date(checkInMs);

        const existing = existingMap.get(realUserId);
        if (existing) {
          existing.status = autoStatus;
          if (item.remarks !== undefined) existing.remarks = item.remarks;
          existing.timestamp = BigInt(checkInMs).toString();
          existing.createdAt = checkInDate;
          await this.recordRepo.save(existing);
        } else {
          const record = this.recordRepo.create({
            dynamoPk: `I#${instituteId}`,
            dynamoSk: `SESSION#${sessionId}#S#${realUserId}#TS#${checkInMs}`,
            instituteId,
            classId: session.classId,
            classSessionId: sessionId,
            studentId: realUserId,
            date: session.date,
            status: autoStatus,
            timestamp: BigInt(checkInMs).toString(),
            remarks: item.remarks ?? null,
            markingMethod: 'API',
            userType: 'STUDENT',
            syncStatus: 'SYNCED',
            syncError: null,
            syncedAt: timestamp,
            createdAt: checkInDate,
            calendarDayId: null,
            eventId: null,
            location: null,
            latitude: null,
            longitude: null,
            deviceUid: null,
            advertisementId: null,
          });
          await this.recordRepo.save(record);
        }

        successCount++;
      } catch (err) {
        this.logger.warn(`API key attendance mark failed for student ${item.studentId}: ${err.message}`);
        failures.push({ studentId: item.studentId, reason: err.message });
      }
    }

    return {
      sessionId,
      successCount,
      failedCount: failures.length,
      failures,
    };
  }
}
