/**
 * 🔄 ATTENDANCE SYNC SCHEDULER SERVICE
 * 
 * Handles DynamoDB → MySQL sync for attendance records.
 * 
 * Three modes of operation (controlled by ATTENDANCE.SYNC_MODE):
 * 
 *   IMMEDIATE:
 *     Called synchronously from markAttendance() after DynamoDB write.
 *     Writes to MySQL inline — if MySQL fails, attendance is still in DynamoDB.
 * 
 *   DYNAMO_FIRST:
 *     Called fire-and-forget from markAttendance(). DynamoDB write completes first,
 *     then MySQL write happens asynchronously. Failures are logged, not retried.
 * 
 *   BACKEND_SCHEDULE:
 *     Cron job runs periodically. Queries DynamoDB for recent records
 *     and batch-upserts them into MySQL. Self-manages the sync watermark
 *     via the system_config table (ATTENDANCE.LAST_SYNC_TIMESTAMP).
 * 
 * All modes use upsert (INSERT ... ON DUPLICATE KEY UPDATE) to be idempotent.
 */
import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AttendanceRecordEntity } from '../entities/attendance-record.entity';
import { AttendanceSyncConfigService } from './attendance-sync-config.service';
import { DynamoDBAttendanceService } from './dynamodb-attendance.service';
import { SystemConfigService } from '../../../common/services/system-config.service';
import { AttendanceSyncMode, AttendanceSyncStatus, AttendanceDbMode } from '../enums/attendance-sync-mode.enum';
import { InstituteEntity } from '../../institute/entities/institute.entity';
import { MarkAttendanceDto } from '../dto/attendance.dto';
import { timestampToSriLankaDate } from '../../../common/utils/timezone.util';

/** DynamoDB record shape (v1 — the one markAttendance() uses) */
interface DynamoRecord {
  pk: string;
  sk: string;
  studentId: string;
  studentName?: string;
  instituteId: string;
  instituteName?: string;
  classId?: string;
  className?: string;
  subjectId?: string;
  subjectName?: string;
  date: string;
  status: number;
  timestamp: number;
  location?: string;
  remarks?: string;
  markingMethod?: string;
  userType?: string;
  calendarDayId?: string;
  eventId?: string;
  deviceUid?: string;
}

@Injectable()
export class AttendanceSyncSchedulerService {
  private readonly logger = new Logger(AttendanceSyncSchedulerService.name);

  constructor(
    @InjectRepository(AttendanceRecordEntity)
    private readonly attendanceRecordRepo: Repository<AttendanceRecordEntity>,
    @InjectRepository(InstituteEntity)
    private readonly instituteRepo: Repository<InstituteEntity>,
    private readonly syncConfigService: AttendanceSyncConfigService,
    private readonly dynamoDBService: DynamoDBAttendanceService,
    private readonly systemConfigService: SystemConfigService,
  ) {}

  // ═══════════════════════════════════════════════════════════
  // IMMEDIATE / DYNAMO_FIRST — called from attendance.service.ts
  // ═══════════════════════════════════════════════════════════

  /**
   * Write a single attendance record to MySQL.
   * Called by markAttendance() in IMMEDIATE or DYNAMO_FIRST mode.
   * 
   * Uses upsert to be idempotent — safe to call multiple times for same record.
   */
  async syncSingleRecord(dynamoRecord: DynamoRecord): Promise<void> {
    try {
      const entity = this.mapToEntity(dynamoRecord);
      entity.syncStatus = AttendanceSyncStatus.SYNCED;
      entity.syncedAt = new Date();

      // Upsert: if dynamo_pk + dynamo_sk already exists, update; else insert
      await this.attendanceRecordRepo
        .createQueryBuilder()
        .insert()
        .into(AttendanceRecordEntity)
        .values(entity)
        .orUpdate(
          [
            'status', 'class_id',
            'subject_id', 'calendar_day_id', 'event_id',
            'location', 'remarks', 'marking_method', 'user_type', 'device_uid',
            'sync_status', 'sync_error', 'synced_at',
          ],
          ['dynamo_pk', 'dynamo_sk'],
        )
        .execute();
    } catch (error) {
      this.logger.error(
        `Failed to sync attendance to MySQL: [${dynamoRecord.pk}/${dynamoRecord.sk}]: ${error.message}`,
      );
      // In IMMEDIATE mode, we don't throw — DynamoDB is the source of truth
      // In DYNAMO_FIRST mode, this is fire-and-forget anyway
    }
  }

  /**
   * Fire-and-forget version — for DYNAMO_FIRST mode.
   * Catches all errors (doesn't block caller).
   */
  syncSingleRecordAsync(dynamoRecord: DynamoRecord): void {
    this.syncSingleRecord(dynamoRecord).catch(err => {
      this.logger.warn(`Async sync failed: ${err.message}`);
    });
  }

  // ═══════════════════════════════════════════════════════════
  // DTO-BASED SYNC — called from attendance.service.ts
  // (MarkAttendanceDto doesn't have pk/sk — we build them here)
  // ═══════════════════════════════════════════════════════════

  /**
   * Sync a MarkAttendanceDto to MySQL.
   * Constructs DynamoDB pk/sk from DTO fields since the DynamoDB service
   * returns the original DTO, not the raw record.
   */
  async syncFromDto(dto: MarkAttendanceDto): Promise<void> {
    try {
      // Use the timestamp that was recorded when the attendance was written to DynamoDB.
      // This MUST match the DynamoDB sort-key timestamp so MySQL upsert hits the same
      // unique key and does not create a duplicate row.
      const ts: number = (dto as any).timestamp ?? Date.now();
      const sanitizedInstituteId = String(dto.instituteId).replace(/[^a-zA-Z0-9_-]/g, '');
      const sanitizedStudentId = String(dto.studentId).replace(/[^a-zA-Z0-9_-]/g, '');
      const classVal = dto.classId ? String(dto.classId).replace(/[^a-zA-Z0-9_-]/g, '') : 'NONE';
      const subjectVal = dto.subjectId ? String(dto.subjectId).replace(/[^a-zA-Z0-9_-]/g, '') : 'NONE';
      // Derive date from the timestamp — timestamp is the single source of truth
      const safeDate = timestampToSriLankaDate(ts);

      const entity = new AttendanceRecordEntity();
      entity.dynamoPk = `I#${sanitizedInstituteId}`;
      entity.dynamoSk = `ATTENDANCE#${safeDate}#TS#${ts}#S#${sanitizedStudentId}#C#${classVal}#SUB#${subjectVal}`;
      entity.instituteId = dto.instituteId;
      entity.studentId = dto.studentId;
      entity.date = safeDate;
      entity.status = this.statusToNumber(dto.status);
      entity.timestamp = String(ts);
      entity.classId = dto.classId || null;
      entity.subjectId = dto.subjectId || null;
      entity.calendarDayId = (dto as any).calendarDayId || null;
      entity.eventId = (dto as any).eventId || null;
      entity.location = dto.location || null;
      entity.remarks = dto.remarks || null;
      entity.markingMethod = dto.markingMethod || null;
      entity.userType = dto.userType || null;
      entity.deviceUid = (dto as any).deviceUid || null;
      entity.syncStatus = AttendanceSyncStatus.SYNCED;
      entity.syncError = null;
      entity.syncedAt = new Date();

      await this.attendanceRecordRepo
        .createQueryBuilder()
        .insert()
        .into(AttendanceRecordEntity)
        .values(entity)
        .orUpdate(
          [
            'status', 'class_id',
            'subject_id', 'calendar_day_id', 'event_id',
            'location', 'remarks', 'marking_method', 'user_type', 'device_uid',
            'sync_status', 'sync_error', 'synced_at',
          ],
          ['dynamo_pk', 'dynamo_sk'],
        )
        .execute();

      this.logger.debug(`✅ Synced attendance to MySQL: ${dto.studentId}@${dto.instituteId} ${safeDate}`);
    } catch (error) {
      this.logger.error(
        `Failed to sync attendance DTO to MySQL: ${dto.studentId}@${dto.instituteId}: ${error.message}`,
      );
    }
  }

  /**
   * Fire-and-forget DTO sync — for DYNAMO_FIRST mode
   */
  syncFromDtoAsync(dto: MarkAttendanceDto): void {
    this.syncFromDto(dto).catch(err => {
      this.logger.warn(`Async DTO sync failed: ${err.message}`);
    });
  }

  private statusToNumber(status: any): number {
    if (typeof status === 'number') return status;
    const map: Record<string, number> = {
      present: 1, absent: 0, late: 2, left: 3,
      left_early: 4, leftearly: 4, left_lately: 5, leftlately: 5,
    };
    return map[String(status).toLowerCase()] ?? 0;
  }

  // ═══════════════════════════════════════════════════════════
  // BACKEND_SCHEDULE — Cron-driven batch sync
  // ═══════════════════════════════════════════════════════════

  /**
   * Scheduled cron job: runs every 15 minutes (configurable).
   * Only active when sync mode is BACKEND_SCHEDULE.
   * 
   * Fetches today's attendance from DynamoDB for all active institutes
   * and batch-upserts into MySQL.
   */
  @Cron('0 */15 * * * *', { name: 'attendance-sync-cron' })
  async handleScheduledSync(): Promise<void> {
    try {
      // Skip sync entirely in MySQL-only mode (no DynamoDB to sync from)
      if (this.syncConfigService.isMysqlOnly()) return;

      // Check if sync is enabled and mode is BACKEND_SCHEDULE
      const enabled = await this.syncConfigService.isSyncEnabled();
      if (!enabled) return;

      const mode = await this.syncConfigService.getSyncMode();
      if (mode !== AttendanceSyncMode.BACKEND_SCHEDULE) return;

      this.logger.log('🔄 Starting scheduled attendance sync (BACKEND_SCHEDULE)...');

      const batchSize = await this.syncConfigService.getBatchSize();
      const today = this.getTodayDateString();

      // Get all active institutes
      const institutes = await this.instituteRepo.find({
        select: ['id'],
      });

      let totalSynced = 0;
      let totalFailed = 0;

      for (const institute of institutes) {
        try {
          const result = await this.syncInstituteAttendance(
            String(institute.id),
            today,
            batchSize,
          );
          totalSynced += result.synced;
          totalFailed += result.failed;
        } catch (error) {
          this.logger.warn(
            `Sync failed for institute ${institute.id}: ${error.message}`,
          );
          totalFailed++;
        }
      }

      // Save watermark
      await this.systemConfigService.set(
        'ATTENDANCE',
        'LAST_SYNC_TIMESTAMP',
        String(Date.now()),
        'SYSTEM_CRON',
        { description: 'Last successful scheduled sync timestamp', valueType: 'NUMBER' },
      );

      this.logger.log(
        `🔄 Scheduled sync complete: ${totalSynced} synced, ${totalFailed} failed across ${institutes.length} institutes`,
      );
    } catch (error) {
      this.logger.error(`Scheduled sync error: ${error.message}`, error.stack);
    }
  }

  /**
   * Sync a single institute's attendance for a given date from DynamoDB → MySQL.
   */
  private async syncInstituteAttendance(
    instituteId: string,
    date: string,
    batchSize: number,
  ): Promise<{ synced: number; failed: number }> {
    // Fetch from DynamoDB
    const dynamoRecords = await this.dynamoDBService.getAttendanceByDate(instituteId, date);

    if (!dynamoRecords || dynamoRecords.length === 0) {
      return { synced: 0, failed: 0 };
    }

    let synced = 0;
    let failed = 0;

    // Process in batches
    for (let i = 0; i < dynamoRecords.length; i += batchSize) {
      const batch = dynamoRecords.slice(i, i + batchSize);

      const entities = batch.map(record => {
        // The DynamoDB service returns MarkAttendanceDto, but we need the raw record
        // with pk/sk. We reconstruct the DynamoRecord from the DTO + known key format.
        const dynamoRecord: DynamoRecord = {
          pk: `I#${record.instituteId || instituteId}`,
          sk: (() => {
            const ts = (record as any).timestamp || Date.now();
            const d = timestampToSriLankaDate(ts);
            return `ATTENDANCE#${d}#TS#${ts}#S#${record.studentId}#C#${(record as any).classId || 'NONE'}#SUB#${(record as any).subjectId || 'NONE'}`;
          })(),
          studentId: record.studentId,
          studentName: record.studentName,
          instituteId: record.instituteId || instituteId,
          instituteName: record.instituteName,
          date: record.date,
          status: typeof record.status === 'string' ? this.statusStringToNumber(record.status) : record.status as any,
          timestamp: (record as any).timestamp || Date.now(),
          classId: (record as any).classId,
          className: (record as any).className,
          subjectId: (record as any).subjectId,
          subjectName: (record as any).subjectName,
          location: (record as any).location,
          remarks: (record as any).remarks,
          markingMethod: (record as any).markingMethod,
          userType: (record as any).userType,
          calendarDayId: (record as any).calendarDayId,
          eventId: (record as any).eventId,
        };
        return this.mapToEntity(dynamoRecord);
      });

      try {
        // Batch upsert
        await this.attendanceRecordRepo
          .createQueryBuilder()
          .insert()
          .into(AttendanceRecordEntity)
          .values(entities)
          .orUpdate(
            [
              'status', 'class_id',
              'subject_id', 'calendar_day_id', 'event_id',
              'location', 'remarks', 'marking_method', 'user_type', 'device_uid',
              'sync_status', 'sync_error', 'synced_at',
            ],
            ['dynamo_pk', 'dynamo_sk'],
          )
          .execute();
        synced += batch.length;
      } catch (error) {
        this.logger.warn(
          `Batch upsert failed for institute ${instituteId}: ${error.message}`,
        );
        failed += batch.length;
      }
    }

    return { synced, failed };
  }

  // ═══════════════════════════════════════════════════════════
  // HELPERS
  // ═══════════════════════════════════════════════════════════

  /**
   * Map a DynamoDB record to a TypeORM entity for MySQL insertion.
   */
  private mapToEntity(record: DynamoRecord): AttendanceRecordEntity {
    const entity = new AttendanceRecordEntity();
    entity.dynamoPk = record.pk;
    entity.dynamoSk = record.sk;
    entity.instituteId = record.instituteId;
    entity.studentId = record.studentId;
    // Derive date from timestamp — timestamp is single source of truth
    entity.date = record.timestamp
      ? timestampToSriLankaDate(record.timestamp)
      : record.date;
    entity.status = record.status;
    entity.timestamp = String(record.timestamp);
    entity.classId = record.classId || null;
    entity.subjectId = record.subjectId || null;
    entity.calendarDayId = record.calendarDayId || null;
    entity.eventId = record.eventId || null;
    entity.location = record.location || null;
    entity.remarks = record.remarks || null;
    entity.markingMethod = record.markingMethod || null;
    entity.userType = record.userType || null;
    entity.deviceUid = record.deviceUid || null;
    entity.syncStatus = AttendanceSyncStatus.SYNCED;
    entity.syncError = null;
    entity.syncedAt = new Date();
    return entity;
  }

  private statusStringToNumber(status: string): number {
    const map: Record<string, number> = {
      present: 1, absent: 0, late: 2, left: 3,
      left_early: 4, leftearly: 4, left_lately: 5, leftlately: 5,
    };
    return map[status.toLowerCase()] ?? 0;
  }

  /**
   * Get today's date in YYYY-MM-DD (Sri Lanka timezone).
   */
  private getTodayDateString(): string {
    const now = new Date();
    // Sri Lanka = UTC+5:30
    const offset = 5.5 * 60 * 60 * 1000;
    const sriLankaTime = new Date(now.getTime() + offset);
    return sriLankaTime.toISOString().split('T')[0];
  }
}
