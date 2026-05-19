import { Injectable, Logger, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectRepository, InjectDataSource } from '@nestjs/typeorm';
import { Repository, DataSource, In } from 'typeorm';
import { InstituteClassAttendanceSessionEntity } from '../../attendance/entities/institute-class-attendance-session.entity';
import { AttendanceRecordEntity } from '../../attendance/entities/attendance-record.entity';
import { InstituteClassStudentEntity } from '../../institute_class_modules/institute_class_student/entities/institute_class_student.entity';
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

    if (sessionDate < today) {
      throw new ForbiddenException('Cannot mark attendance for past sessions');
    }
    if (sessionDate > today) {
      throw new ForbiddenException('Cannot mark attendance for future sessions');
    }

    if (!dto.records?.length) {
      return { sessionId, successCount: 0, failedCount: 0, failures: [] };
    }

    const incomingIds = dto.records.map(r => r.studentId);

    // 3. Verify all incoming students are enrolled in this class
    const enrolled = await this.classStudentRepo.find({
      where: {
        studentUserId: In(incomingIds),
        classId: session.classId,
        instituteId,
        isActive: true,
      },
      select: ['studentUserId'],
    });
    const enrolledSet = new Set(enrolled.map(e => e.studentUserId));

    // 4. Payment enforcement (REQUIRED mode only)
    let approvedPaymentIds: Set<string> | null = null;
    if (session.linkedPaymentId && session.paymentMode === 'REQUIRED') {
      const payRows: any[] = await this.dataSource.query(
        `SELECT user_id FROM institute_class_payment_submissions
         WHERE payment_id = ? AND user_id IN (${incomingIds.map(() => '?').join(',')})
         AND status IN ('VERIFIED','HALF_VERIFIED','QUARTER_VERIFIED')`,
        [session.linkedPaymentId, ...incomingIds],
      );
      approvedPaymentIds = new Set(payRows.map(r => String(r.user_id)));
    }

    // 5. Pre-load existing records for this session (avoid N+1 on update)
    const existingRecords = await this.recordRepo.find({
      where: { classSessionId: sessionId, studentId: In(incomingIds) },
    });
    const existingMap = new Map(existingRecords.map(r => [r.studentId, r]));

    // 6. Process each record
    let successCount = 0;
    const failures: ExternalAttendanceFailure[] = [];
    const timestamp = now();

    for (const item of dto.records) {
      // Check enrollment
      if (!enrolledSet.has(item.studentId)) {
        failures.push({ studentId: item.studentId, reason: 'Student is not enrolled in this class' });
        continue;
      }

      // Check payment
      if (approvedPaymentIds !== null && !approvedPaymentIds.has(item.studentId)) {
        failures.push({ studentId: item.studentId, reason: 'Student has not completed required payment' });
        continue;
      }

      try {
        const autoStatus = item.status ?? resolveAutoStatus(session);

        const existing = existingMap.get(item.studentId);
        if (existing) {
          existing.status = autoStatus;
          if (item.remarks !== undefined) existing.remarks = item.remarks;
          existing.createdAt = timestamp;
          await this.recordRepo.save(existing);
        } else {
          const record = this.recordRepo.create({
            dynamoPk: `I#${instituteId}`,
            dynamoSk: `SESSION#${sessionId}#S#${item.studentId}#TS#${Date.now()}`,
            instituteId,
            classId: session.classId,
            classSessionId: sessionId,
            studentId: item.studentId,
            date: session.date,
            status: autoStatus,
            timestamp: BigInt(Date.now()).toString(),
            remarks: item.remarks ?? null,
            markingMethod: 'API',
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
