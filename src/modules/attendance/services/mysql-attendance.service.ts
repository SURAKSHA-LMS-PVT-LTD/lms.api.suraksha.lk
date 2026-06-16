/**
 * 🗄️ MYSQL ATTENDANCE SERVICE
 *
 * Pure MySQL implementation of all attendance operations.
 * Used when ATTENDANCE_DB_MODE=only_mysql.
 *
 * Method signatures mirror DynamoDBAttendanceService so the main
 * AttendanceService can switch between them transparently.
 *
 * Design notes:
 *  - Generates synthetic dynamo_pk / dynamo_sk for entity compatibility.
 *  - Record IDs use base64url(pk~sk) to match the DynamoDB format,
 *    so controllers / deep-links work identically.
 *  - Uses TypeORM QueryBuilder with proper indexes for performance.
 */
import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { AttendanceRecordEntity } from '../entities/attendance-record.entity';
import { UserEntity } from '../../user/entities/user.entity';
import { InstituteEntity } from '../../institute/entities/institute.entity';
import { InstituteClassEntity } from '../../institute_mudules/institue_class/entities/institue_class.entity';
import { SubjectEntity } from '../../subject/entities/subject.entity';
import {
  MarkAttendanceDto,
  BulkAttendanceDto,
  AttendanceStatus,
} from '../dto/attendance.dto';
import { AttendanceRecord } from './dynamodb-attendance.service';
import { AttendanceSyncStatus } from '../enums/attendance-sync-mode.enum';
import { timestampToSriLankaDate } from '../../../common/utils/timezone.util';

@Injectable()
export class MysqlAttendanceService {
  private readonly logger = new Logger(MysqlAttendanceService.name);

  constructor(
    @InjectRepository(AttendanceRecordEntity)
    private readonly repo: Repository<AttendanceRecordEntity>,
    @InjectRepository(UserEntity)
    private readonly userRepo: Repository<UserEntity>,
    @InjectRepository(InstituteEntity)
    private readonly instituteRepo: Repository<InstituteEntity>,
    @InjectRepository(InstituteClassEntity)
    private readonly classRepo: Repository<InstituteClassEntity>,
    @InjectRepository(SubjectEntity)
    private readonly subjectRepo: Repository<SubjectEntity>,
  ) {}

  // ═══════════════════════════════════════════════════════════
  // KEY GENERATION — mirrors DynamoDB key format for ID compat
  // ═══════════════════════════════════════════════════════════

  private sanitize(val: string): string {
    return String(val).replace(/[^a-zA-Z0-9_-]/g, '');
  }

  private generatePk(instituteId: string): string {
    return `I#${this.sanitize(instituteId)}`;
  }

  private generateSk(
    date: string,
    studentId: string,
    classId: string | undefined,
    subjectId: string | undefined,
    timestamp: number,
  ): string {
    const safeDate = String(date).replace(/[^0-9-]/g, '');
    return `ATTENDANCE#${safeDate}#TS#${timestamp}#S#${this.sanitize(studentId)}#C#${classId ? this.sanitize(classId) : 'NONE'}#SUB#${subjectId ? this.sanitize(subjectId) : 'NONE'}`;
  }

  private generateId(pk: string, sk: string): string {
    return Buffer.from(`${pk}~${sk}`).toString('base64url');
  }

  // ═══════════════════════════════════════════════════════════
  // STATUS HELPERS
  // ═══════════════════════════════════════════════════════════

  private statusToNumber(status: AttendanceStatus | string | number): number {
    if (typeof status === 'number') return status;
    const map: Record<string, number> = {
      present: 1, absent: 0, late: 2, left: 3,
      left_early: 4, leftearly: 4, left_lately: 5, leftlately: 5,
    };
    return map[String(status).toLowerCase()] ?? 0;
  }

  private numberToStatus(status: number): AttendanceStatus {
    switch (status) {
      case 1: return AttendanceStatus.PRESENT;
      case 2: return AttendanceStatus.LATE;
      case 3: return AttendanceStatus.LEFT;
      case 4: return AttendanceStatus.LEFT_EARLY;
      case 5: return AttendanceStatus.LEFT_LATELY;
      case 0: default: return AttendanceStatus.ABSENT;
    }
  }

  // ═══════════════════════════════════════════════════════════
  // NAME RESOLUTION — batch-load names from normalised tables
  // ═══════════════════════════════════════════════════════════

  /**
   * Batch-resolve names for a set of attendance entities.
   *
   * Strategy: 4 parallel PK-IN queries directly on the reference tables.
   *   - The caller already holds the entities in memory; we must NOT
   *     re-scan attendance_records.
   *   - Each query hits the table's PRIMARY KEY index (range scan) → O(log n).
   *   - Promise.all makes them concurrent: total latency ≈ max(4 query times),
   *     not sum — effectively a single round-trip to the DB server.
   *   - Sentinel value "default" filtered out before issuing queries so it
   *     never leaks to the reference tables.
   */
  private async resolveNames(
    entities: AttendanceRecordEntity[],
  ): Promise<{
    students:   Map<string, string | null>;
    institutes: Map<string, string | null>;
    classes:    Map<string, string | null>;
    subjects:   Map<string, string | null>;
  }> {
    if (entities.length === 0) {
      return { students: new Map(), institutes: new Map(), classes: new Map(), subjects: new Map() };
    }

    const studentIds   = [...new Set(entities.map(e => e.studentId).filter(Boolean))];
    const instituteIds = [...new Set(entities.map(e => e.instituteId).filter(Boolean))];
    const classIds     = [...new Set(entities.map(e => e.classId).filter(Boolean).filter(x => x !== 'default'))] as string[];
    const subjectIds   = [...new Set(entities.map(e => e.subjectId).filter(Boolean).filter(x => x !== 'default'))] as string[];

    // 4 parallel PK lookups — each is a PRIMARY KEY range scan, never a full scan
    const [users, institutes, classes, subjects] = await Promise.all([
      studentIds.length
        ? this.userRepo.find({ where: { id: In(studentIds) }, select: ['id', 'nameWithInitials', 'firstName', 'lastName'] })
        : [],
      instituteIds.length
        ? this.instituteRepo.find({ where: { id: In(instituteIds) }, select: ['id', 'name'] })
        : [],
      classIds.length
        ? this.classRepo.find({ where: { id: In(classIds) }, select: ['id', 'name'] })
        : [],
      subjectIds.length
        ? this.subjectRepo.find({ where: { id: In(subjectIds) }, select: ['id', 'name'] })
        : [],
    ]);

    const students = new Map<string, string | null>();
    for (const u of users) {
      students.set(String(u.id),
        u.nameWithInitials || [u.firstName, u.lastName].filter(Boolean).join(' ') || null);
    }

    return {
      students,
      institutes: new Map<string, string | null>(institutes.map(i => [String(i.id), i.name] as [string, string | null])),
      classes:    new Map<string, string | null>(classes.map(c => [String(c.id), c.name] as [string, string | null])),
      subjects:   new Map<string, string | null>(subjects.map(s => [String(s.id), s.name] as [string, string | null])),
    };
  }

  /** Build NameMaps directly from a DTO (for write-path responses where names are already known). */
  private nameMapsFromDto(dto: MarkAttendanceDto): {
    students: Map<string, string | null>;
    institutes: Map<string, string | null>;
    classes: Map<string, string | null>;
    subjects: Map<string, string | null>;
  } {
    return {
      students: new Map([[dto.studentId, dto.studentName || null]]),
      institutes: new Map([[dto.instituteId, dto.instituteName || null]]),
      classes: dto.classId ? new Map([[dto.classId, dto.className || null]]) : new Map(),
      subjects: dto.subjectId ? new Map([[dto.subjectId, dto.subjectName || null]]) : new Map(),
    };
  }

  // ═══════════════════════════════════════════════════════════
  // ENTITY ↔ DTO CONVERSION
  // ═══════════════════════════════════════════════════════════

  private entityToDto(
    entity: AttendanceRecordEntity,
    names: {
      students: Map<string, string | null>;
      institutes: Map<string, string | null>;
      classes: Map<string, string | null>;
      subjects: Map<string, string | null>;
    },
  ): MarkAttendanceDto & {
    userType?: string;
    timestamp?: number;
    calendarDayId?: string;
    eventId?: string;
    latitude?: number;
    longitude?: number;
    id?: string;
  } {
    const id = this.generateId(entity.dynamoPk, entity.dynamoSk);
    return {
      studentId: entity.studentId,
      studentName: names.students.get(entity.studentId) || null,
      studentImageUrl: undefined,
      imageUrl: undefined,
      instituteId: entity.instituteId,
      instituteName: names.institutes.get(entity.instituteId) || null,
      classId: entity.classId || undefined,
      className: entity.classId ? names.classes.get(entity.classId) || undefined : undefined,
      subjectId: entity.subjectId || undefined,
      subjectName: entity.subjectId ? names.subjects.get(entity.subjectId) || undefined : undefined,
      date: entity.date,
      status: this.numberToStatus(entity.status),
      location: entity.location || undefined,
      address: entity.latitude != null || entity.longitude != null
        ? { latitude: entity.latitude ?? undefined, longitude: entity.longitude ?? undefined }
        : undefined,
      latitude: entity.latitude ?? undefined,
      longitude: entity.longitude ?? undefined,
      remarks: entity.remarks || undefined,
      markingMethod: entity.markingMethod || undefined,
      userType: entity.userType || 'STUDENT',
      calendarDayId: entity.calendarDayId || undefined,
      eventId: entity.eventId || undefined,
      advertisementId: entity.advertisementId || undefined,
      timestamp: entity.timestamp ? Number(entity.timestamp) : undefined,
      id,
    } as any;
  }

  private entityToRecord(
    entity: AttendanceRecordEntity,
    names: {
      students: Map<string, string | null>;
      institutes: Map<string, string | null>;
      classes: Map<string, string | null>;
      subjects: Map<string, string | null>;
    },
  ): AttendanceRecord {
    const id = this.generateId(entity.dynamoPk, entity.dynamoSk);
    return {
      id,
      pk: entity.dynamoPk,
      sk: entity.dynamoSk,
      gsi_pk: '',
      gsi_sk: '',
      studentId: entity.studentId,
      studentName: names.students.get(entity.studentId) || '',
      instituteId: entity.instituteId,
      instituteName: names.institutes.get(entity.instituteId) || '',
      classId: entity.classId || undefined,
      className: entity.classId ? names.classes.get(entity.classId) || undefined : undefined,
      subjectId: entity.subjectId || undefined,
      subjectName: entity.subjectId ? names.subjects.get(entity.subjectId) || undefined : undefined,
      date: entity.date,
      status: entity.status,
      location: entity.location || undefined,
      address: entity.latitude != null || entity.longitude != null
        ? { latitude: entity.latitude ?? undefined, longitude: entity.longitude ?? undefined }
        : undefined,
      remarks: entity.remarks || undefined,
      markingMethod: entity.markingMethod || undefined,
      userType: entity.userType || undefined,
      calendarDayId: entity.calendarDayId || undefined,
      eventId: entity.eventId || undefined,
      advertisementId: entity.advertisementId || undefined,
      timestamp: entity.timestamp ? Number(entity.timestamp) : Date.now(),
    };
  }

  private dtoToEntity(dto: MarkAttendanceDto, timestamp: number): AttendanceRecordEntity {
    const dateStr = timestampToSriLankaDate(timestamp);
    const pk = this.generatePk(dto.instituteId);
    const sk = this.generateSk(dateStr, dto.studentId, dto.classId, dto.subjectId, timestamp);

    const entity = new AttendanceRecordEntity();
    entity.dynamoPk = pk;
    entity.dynamoSk = sk;
    entity.instituteId = dto.instituteId;
    entity.studentId = dto.studentId;
    // Derive date from the write timestamp — timestamp is the single source of truth.
    // This guarantees date column always matches the actual time of the mark.
    entity.date = dateStr;
    entity.status = this.statusToNumber(dto.status);
    entity.timestamp = String(timestamp);
    entity.classId = dto.classId || null;
    entity.subjectId = dto.subjectId || null;
    entity.calendarDayId = (dto as any).calendarDayId || null;
    entity.eventId = (dto as any).eventId || null;
    entity.classSessionId = (dto as any).classSessionId || null;
    entity.location = dto.location || null;
    entity.latitude = dto.address?.latitude ?? null;
    entity.longitude = dto.address?.longitude ?? null;
    entity.remarks = dto.remarks || null;
    entity.markingMethod = dto.markingMethod || null;
    entity.userType = (dto as any).userType || null;
    entity.deviceUid = (dto as any).deviceUid || null;
    entity.advertisementId = (dto as any).advertisementId || null;
    entity.syncStatus = AttendanceSyncStatus.SYNCED;
    entity.syncError = null;
    entity.syncedAt = new Date();
    return entity;
  }

  // ═══════════════════════════════════════════════════════════
  // WRITE OPERATIONS
  // ═══════════════════════════════════════════════════════════

  /**
   * Mark single attendance → INSERT into MySQL.
   * Returns AttendanceRecord with generated id for deep-links.
   */
  async markAttendance(attendance: MarkAttendanceDto): Promise<AttendanceRecord> {
    const timestamp = Date.now();
    const entity = this.dtoToEntity(attendance, timestamp);

    await this.repo
      .createQueryBuilder()
      .insert()
      .into(AttendanceRecordEntity)
      .values(entity)
      .orUpdate(
        [
          'status', 'class_id',
          'subject_id', 'calendar_day_id', 'event_id', 'class_session_id',
          'location', 'latitude', 'longitude', 'remarks', 'marking_method',
          'user_type', 'device_uid', 'sync_status', 'sync_error', 'synced_at',
        ],
        ['dynamo_pk', 'dynamo_sk'],
      )
      .execute();

    return this.entityToRecord(entity, this.nameMapsFromDto(attendance));
  }

  /**
   * Mark bulk attendance → batch INSERT into MySQL.
   */
  async markBulkAttendance(bulkData: BulkAttendanceDto): Promise<MarkAttendanceDto[]> {
    const results: MarkAttendanceDto[] = [];

    const entities: AttendanceRecordEntity[] = [];
    const entityDtoMap: Array<{ entity: AttendanceRecordEntity; dto: MarkAttendanceDto }> = [];

    for (const studentData of bulkData.students) {
      const dto: MarkAttendanceDto = {
        studentId: studentData.studentId,
        studentName: studentData.studentName,
        studentImageUrl: (studentData as any).studentImageUrl || (studentData as any).imageUrl,
        instituteId: bulkData.instituteId,
        instituteName: bulkData.instituteName,
        classId: bulkData.classId,
        className: bulkData.className,
        subjectId: bulkData.subjectId,
        subjectName: bulkData.subjectName,
        status: studentData.status,
        location: bulkData.location,
        address: bulkData.address,
        remarks: studentData.remarks,
        markingMethod: bulkData.markingMethod,
      } as any;
      // Attach calendar/event from bulk DTO
      (dto as any).calendarDayId = (bulkData as any).calendarDayId;
      (dto as any).eventId = (bulkData as any).defaultEventId || (bulkData as any).eventId;
      (dto as any).userType = (bulkData as any).userTypeMap?.get(studentData.studentId) || undefined;

      // Offset by index to guarantee unique SK per student within the same bulk call
      const timestamp = Date.now() + entities.length;
      const entity = this.dtoToEntity(dto, timestamp);
      entities.push(entity);
      entityDtoMap.push({ entity, dto });
    }

    // Batch insert in chunks of 500
    const BATCH_SIZE = 500;
    for (let i = 0; i < entities.length; i += BATCH_SIZE) {
      const batch = entities.slice(i, i + BATCH_SIZE);
      try {
        await this.repo
          .createQueryBuilder()
          .insert()
          .into(AttendanceRecordEntity)
          .values(batch)
          .orUpdate(
            [
              'status', 'class_id',
              'subject_id', 'calendar_day_id', 'event_id', 'class_session_id',
              'location', 'latitude', 'longitude', 'remarks', 'marking_method',
              'user_type', 'device_uid', 'sync_status', 'sync_error', 'synced_at',
            ],
            ['dynamo_pk', 'dynamo_sk'],
          )
          .execute();
      } catch (error) {
        this.logger.error(`Bulk MySQL insert failed for batch ${i}-${i + batch.length}: ${error.message}`);
      }
    }

    // Build result DTOs with generated IDs
    for (const { entity, dto } of entityDtoMap) {
      const id = this.generateId(entity.dynamoPk, entity.dynamoSk);
      (dto as any).id = id;
      results.push(dto);
    }

    return results;
  }

  /**
   * Update attendance status in MySQL.
   */
  async updateAttendance(
    instituteId: string,
    studentId: string,
    classId: string,
    subjectId: string,
    date: string,
    timestamp: number,
    status: AttendanceStatus,
    remarks?: string,
  ): Promise<MarkAttendanceDto> {
    const pk = this.generatePk(instituteId);
    const sk = this.generateSk(date, studentId, classId, subjectId, timestamp);
    const newTimestamp = Date.now();

    await this.repo
      .createQueryBuilder()
      .update(AttendanceRecordEntity)
      .set({
        status: this.statusToNumber(status),
        remarks: remarks || null,
        timestamp: String(newTimestamp),
      })
      .where('dynamoPk = :pk AND dynamoSk = :sk', { pk, sk })
      .execute();

    // Fetch updated record
    const updated = await this.repo.findOne({
      where: { dynamoPk: pk, dynamoSk: sk },
    });

    if (!updated) {
      throw new Error(`Attendance record not found for update: ${pk} / ${sk}`);
    }

    const names = await this.resolveNames([updated]);
    return this.entityToDto(updated, names);
  }

  /**
   * Delete attendance record from MySQL.
   */
  async deleteAttendance(
    instituteId: string,
    studentId: string,
    classId: string,
    subjectId: string,
    date: string,
    timestamp: number,
  ): Promise<void> {
    const pk = this.generatePk(instituteId);
    const sk = this.generateSk(date, studentId, classId, subjectId, timestamp);

    await this.repo
      .createQueryBuilder()
      .delete()
      .from(AttendanceRecordEntity)
      .where('dynamoPk = :pk AND dynamoSk = :sk', { pk, sk })
      .execute();
  }

  // ═══════════════════════════════════════════════════════════
  // READ OPERATIONS
  // ═══════════════════════════════════════════════════════════

  /**
   * Get attendance by encoded ID (base64url of pk~sk).
   */
  async getAttendanceById(id: string): Promise<AttendanceRecord | null> {
    try {
      const decoded = Buffer.from(id, 'base64url').toString('utf8');
      const separatorIndex = decoded.indexOf('~');
      if (separatorIndex === -1) return null;

      const pk = decoded.substring(0, separatorIndex);
      const sk = decoded.substring(separatorIndex + 1);

      const entity = await this.repo.findOne({
        where: { dynamoPk: pk, dynamoSk: sk },
      });

      if (!entity) return null;
      const names = await this.resolveNames([entity]);
      return this.entityToRecord(entity, names);
    } catch (error) {
      this.logger.error(`getAttendanceById failed: ${error.message}`);
      return null;
    }
  }

  /**
   * Get all attendance for a date at an institute.
   * Uses IDX_institute_date index.
   */
  async getAttendanceByDate(
    instituteId: string,
    date: string,
  ): Promise<MarkAttendanceDto[]> {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      throw new Error('Invalid date format. Expected YYYY-MM-DD.');
    }

    const entities = await this.repo.find({
      where: { instituteId, date },
      order: { timestamp: 'DESC' },
    });

    if (!entities.length) return [];
    const names = await this.resolveNames(entities);
    return entities.map(e => this.entityToDto(e, names));
  }

  /**
   * Get student attendance history with optional date range + institute filter.
   * Uses IDX_student_date or IDX_student_institute_date index.
   */
  async getStudentAttendance(
    studentId: string,
    instituteId: string,
    startDate?: string,
    endDate?: string,
  ): Promise<MarkAttendanceDto[]> {
    const qb = this.repo.createQueryBuilder('ar')
      .where('ar.studentId = :studentId', { studentId })
      .orderBy('ar.timestamp', 'DESC');

    if (instituteId) {
      qb.andWhere('ar.instituteId = :instituteId', { instituteId });
    }

    if (startDate && endDate) {
      qb.andWhere('ar.date >= :startDate AND ar.date <= :endDate', { startDate, endDate });
    }

    const entities = await qb.getMany();
    if (!entities.length) return [];
    const names = await this.resolveNames(entities);
    return entities.map(e => this.entityToDto(e, names));
  }

  /**
   * Get attendance for a specific event.
   * Uses IDX_event index.
   */
  async getAttendanceByEvent(
    instituteId: string,
    eventId: string,
    date?: string,
  ): Promise<MarkAttendanceDto[]> {
    const qb = this.repo.createQueryBuilder('ar')
      .where('ar.instituteId = :instituteId', { instituteId })
      .andWhere('ar.eventId = :eventId', { eventId })
      .orderBy('ar.timestamp', 'DESC');

    if (date) {
      qb.andWhere('ar.date = :date', { date });
    }

    const entities = await qb.getMany();
    if (!entities.length) return [];
    const names = await this.resolveNames(entities);
    return entities.map(e => this.entityToDto(e, names));
  }

  /**
   * Get all attendance for a calendar day.
   * Uses IDX_calendar_day index.
   */
  async getAttendanceByCalendarDay(
    instituteId: string,
    calendarDayId: string,
    userType?: string,
  ): Promise<MarkAttendanceDto[]> {
    const qb = this.repo.createQueryBuilder('ar')
      .where('ar.instituteId = :instituteId', { instituteId })
      .andWhere('ar.calendarDayId = :calendarDayId', { calendarDayId })
      .orderBy('ar.timestamp', 'DESC');

    if (userType) {
      qb.andWhere('ar.userType = :userType', { userType });
    }

    const entities = await qb.getMany();
    if (!entities.length) return [];
    const names = await this.resolveNames(entities);
    return entities.map(e => this.entityToDto(e, names));
  }

  /**
   * Get attendance by user type with optional filters.
   */
  async getAttendanceByUserType(
    instituteId: string,
    userType: string,
    date?: string,
    eventId?: string,
    classId?: string,
    subjectId?: string,
  ): Promise<MarkAttendanceDto[]> {
    const qb = this.repo.createQueryBuilder('ar')
      .where('ar.instituteId = :instituteId', { instituteId })
      .andWhere('ar.userType = :userType', { userType })
      .orderBy('ar.timestamp', 'DESC');

    if (date) qb.andWhere('ar.date = :date', { date });
    if (eventId) qb.andWhere('ar.eventId = :eventId', { eventId });
    if (classId) qb.andWhere('ar.classId = :classId', { classId });
    if (subjectId) qb.andWhere('ar.subjectId = :subjectId', { subjectId });

    const entities = await qb.getMany();
    if (!entities.length) return [];
    const names = await this.resolveNames(entities);
    return entities.map(e => this.entityToDto(e, names));
  }

  /**
   * Get a student's attendance for a specific event.
   */
  async getStudentAttendanceByEvent(
    studentId: string,
    instituteId: string,
    eventId: string,
    startDate?: string,
    endDate?: string,
  ): Promise<MarkAttendanceDto[]> {
    const qb = this.repo.createQueryBuilder('ar')
      .where('ar.studentId = :studentId', { studentId })
      .andWhere('ar.instituteId = :instituteId', { instituteId })
      .andWhere('ar.eventId = :eventId', { eventId })
      .orderBy('ar.timestamp', 'DESC');

    if (startDate && endDate) {
      qb.andWhere('ar.date >= :startDate AND ar.date <= :endDate', { startDate, endDate });
    }

    const entities = await qb.getMany();
    if (!entities.length) return [];
    const names = await this.resolveNames(entities);
    return entities.map(e => this.entityToDto(e, names));
  }

  /**
   * Get student attendance across ALL institutes (for my-history).
   */
  async getStudentAttendanceAllInstitutes(
    studentId: string,
    startDate?: string,
    endDate?: string,
  ): Promise<(MarkAttendanceDto & { timestamp?: number; calendarDayId?: string; eventId?: string })[]> {
    const qb = this.repo.createQueryBuilder('ar')
      .where('ar.studentId = :studentId', { studentId })
      .orderBy('ar.timestamp', 'DESC');

    if (startDate && endDate) {
      qb.andWhere('ar.date >= :startDate AND ar.date <= :endDate', { startDate, endDate });
    }

    const entities = await qb.getMany();
    if (!entities.length) return [];
    const names = await this.resolveNames(entities);
    return entities.map(e => this.entityToDto(e, names));
  }

  /**
   * Get attendance summary with optional record inclusion.
   * Uses SQL aggregation for performance.
   */
  async getAttendanceSummary(
    instituteId: string,
    classId?: string,
    subjectId?: string,
    startDate?: string,
    endDate?: string,
    limit?: number,
    includeRecords: boolean = false,
  ): Promise<any> {
    const maxItems = limit || 10000;

    // Build WHERE conditions
    const qb = this.repo.createQueryBuilder('ar')
      .where('ar.instituteId = :instituteId', { instituteId });

    // Apply hierarchy filters (same logic as DynamoDB service)
    if (classId && subjectId) {
      qb.andWhere('ar.classId = :classId', { classId });
      qb.andWhere('ar.subjectId = :subjectId', { subjectId });
    } else if (classId && !subjectId) {
      qb.andWhere('ar.classId = :classId', { classId });
      qb.andWhere('(ar.subjectId IS NULL OR ar.subjectId = :defaultSubject)', { defaultSubject: 'default' });
    } else if (!classId && !subjectId) {
      qb.andWhere('(ar.classId IS NULL OR ar.classId = :defaultClass)', { defaultClass: 'default' });
    }

    if (startDate && endDate) {
      qb.andWhere('ar.date >= :startDate AND ar.date <= :endDate', { startDate, endDate });
    }

    // One combined aggregate: GROUP BY status + userType simultaneously — single DB round-trip
    const combined = await qb.clone()
      .select('ar.status', 'status')
      .addSelect('ar.userType', 'userType')
      .addSelect('COUNT(*)', 'cnt')
      .groupBy('ar.status')
      .addGroupBy('ar.userType')
      .getRawMany();

    let presentCount = 0, absentCount = 0, lateCount = 0;
    let leftCount = 0, leftEarlyCount = 0, leftLatelyCount = 0;
    let totalRecords = 0;
    const byUserType: Record<string, any> = {};

    for (const row of combined) {
      const cnt = parseInt(row.cnt, 10);
      totalRecords += cnt;
      switch (Number(row.status)) {
        case 1: presentCount += cnt; break;
        case 0: absentCount += cnt; break;
        case 2: lateCount += cnt; break;
        case 3: leftCount += cnt; break;
        case 4: leftEarlyCount += cnt; break;
        case 5: leftLatelyCount += cnt; break;
      }
      const uType = row.userType || 'STUDENT';
      if (!byUserType[uType]) {
        byUserType[uType] = { total: 0, present: 0, absent: 0, late: 0, left: 0, leftEarly: 0, leftLately: 0 };
      }
      byUserType[uType].total += cnt;
      switch (Number(row.status)) {
        case 1: byUserType[uType].present += cnt; break;
        case 0: byUserType[uType].absent += cnt; break;
        case 2: byUserType[uType].late += cnt; break;
        case 3: byUserType[uType].left += cnt; break;
        case 4: byUserType[uType].leftEarly += cnt; break;
        case 5: byUserType[uType].leftLately += cnt; break;
      }
    }

    const attendanceRate = totalRecords > 0
      ? (presentCount / totalRecords) * 100
      : 0;

    // Optionally fetch records for the response
    let records: any[] = [];
    if (includeRecords) {
      const recordsQb = qb.clone()
        .select([
          'ar.studentId AS studentId',
          'ar.date AS date',
          'ar.status AS status',
          'ar.classId AS classId',
          'ar.subjectId AS subjectId',
          'ar.timestamp AS timestamp',
          'ar.userType AS userType',
          'ar.location AS location',
          'ar.markingMethod AS markingMethod',
          'ar.calendarDayId AS calendarDayId',
          'ar.eventId AS eventId',
        ])
        .orderBy('ar.timestamp', 'DESC')
        .take(maxItems);
      const rawRows = await recordsQb.getRawMany();

      // Batch-resolve names for the raw records
      const studentIds = [...new Set(rawRows.map(r => r.studentId).filter(Boolean))];
      const classIds = [...new Set(rawRows.map(r => r.classId).filter(Boolean))];
      const subjectIds = [...new Set(rawRows.map(r => r.subjectId).filter(Boolean))];

      const [users, classes, subjects] = await Promise.all([
        studentIds.length
          ? this.userRepo.find({ where: { id: In(studentIds) }, select: ['id', 'nameWithInitials', 'firstName', 'lastName'] })
          : [],
        classIds.length
          ? this.classRepo.find({ where: { id: In(classIds) }, select: ['id', 'name'] })
          : [],
        subjectIds.length
          ? this.subjectRepo.find({ where: { id: In(subjectIds) }, select: ['id', 'name'] })
          : [],
      ]);

      const userMap = new Map<string, string | null>(users.map(u => [String(u.id), u.nameWithInitials || [u.firstName, u.lastName].filter(Boolean).join(' ') || null] as [string, string | null]));
      const classMap = new Map<string, string | null>(classes.map(c => [String(c.id), c.name] as [string, string | null]));
      const subjectMap = new Map<string, string | null>(subjects.map(s => [String(s.id), s.name] as [string, string | null]));

      records = rawRows.map(row => {
        const statusValue = Number(row.status);
        return {
          studentId: row.studentId,
          studentName: userMap.get(row.studentId) || null,
          date: row.date,
          status: this.numberToStatus(isNaN(statusValue) ? 0 : statusValue),
          className: row.classId ? classMap.get(row.classId) || null : null,
          subjectName: row.subjectId ? subjectMap.get(row.subjectId) || null : null,
          timestamp: row.timestamp ? Number(row.timestamp) : undefined,
          userType: row.userType,
          location: row.location,
          markingMethod: row.markingMethod,
          calendarDayId: row.calendarDayId,
          eventId: row.eventId,
        };
      });
    }

    return {
      totalRecords,
      presentCount,
      absentCount,
      lateCount,
      leftCount,
      leftEarlyCount,
      leftLatelyCount,
      attendanceRate: parseFloat(attendanceRate.toFixed(2)),
      byUserType,
      records: includeRecords ? records : undefined,
    };
  }

  /**
   * Get monthly attendance count grouped by status.
   * Efficient SQL aggregation — single round-trip.
   */
  async getMonthlyAttendanceCount(
    instituteId: string,
    year: number,
    month: number,
    classId?: string,
    subjectId?: string,
    eventId?: string,
  ): Promise<{
    totalRecords: number;
    presentCount: number;
    absentCount: number;
    lateCount: number;
    leftCount: number;
    leftEarlyCount: number;
    leftLatelyCount: number;
    attendanceRate: number;
  }> {
    const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
    const lastDay = new Date(year, month, 0).getDate();
    const endDate = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

    const qb = this.repo.createQueryBuilder('ar')
      .where('ar.instituteId = :instituteId', { instituteId })
      .andWhere('ar.date >= :startDate AND ar.date <= :endDate', { startDate, endDate });

    if (classId && subjectId) {
      qb.andWhere('ar.classId = :classId', { classId });
      qb.andWhere('ar.subjectId = :subjectId', { subjectId });
    } else if (classId && !subjectId) {
      qb.andWhere('ar.classId = :classId', { classId });
      qb.andWhere('(ar.subjectId IS NULL OR ar.subjectId = :defaultSubject)', { defaultSubject: 'default' });
    } else if (!classId && !subjectId) {
      qb.andWhere('(ar.classId IS NULL OR ar.classId = :defaultClass)', { defaultClass: 'default' });
    }

    if (eventId) {
      qb.andWhere('ar.eventId = :eventId', { eventId });
    }

    const rows = await qb
      .select('ar.status', 'status')
      .addSelect('COUNT(*)', 'cnt')
      .groupBy('ar.status')
      .getRawMany();

    let presentCount = 0, absentCount = 0, lateCount = 0;
    let leftCount = 0, leftEarlyCount = 0, leftLatelyCount = 0;
    let totalRecords = 0;

    for (const row of rows) {
      const cnt = parseInt(row.cnt, 10);
      totalRecords += cnt;
      switch (Number(row.status)) {
        case 1: presentCount = cnt; break;
        case 0: absentCount = cnt; break;
        case 2: lateCount = cnt; break;
        case 3: leftCount = cnt; break;
        case 4: leftEarlyCount = cnt; break;
        case 5: leftLatelyCount = cnt; break;
      }
    }

    const attendanceRate = totalRecords > 0
      ? parseFloat(((presentCount / totalRecords) * 100).toFixed(2))
      : 0;

    return {
      totalRecords,
      presentCount,
      absentCount,
      lateCount,
      leftCount,
      leftEarlyCount,
      leftLatelyCount,
      attendanceRate,
    };
  }

  // Normalize any date value (JS Date object, ISO string, or YYYY-MM-DD) → "YYYY-MM-DD"
  private toDateStr(val: any): string {
    if (!val) return '';
    if (val instanceof Date) {
      const y = val.getFullYear();
      const mo = String(val.getMonth() + 1).padStart(2, '0');
      const d = String(val.getDate()).padStart(2, '0');
      return `${y}-${mo}-${d}`;
    }
    const s = String(val);
    const m = s.match(/^(\d{4}-\d{2}-\d{2})/);
    return m ? m[1] : s;
  }

  async getDailyAttendanceCount(
    instituteId: string,
    year: number,
    month: number,
    classId?: string,
    subjectId?: string,
    eventId?: string,
  ): Promise<{ date: string; day: number; presentCount: number; absentCount: number; lateCount: number; leftCount: number; leftEarlyCount: number; leftLatelyCount: number; totalRecords: number }[]> {
    const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
    const lastDay = new Date(year, month, 0).getDate();
    const endDate = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

    const qb = this.repo.createQueryBuilder('ar')
      .where('ar.instituteId = :instituteId', { instituteId })
      .andWhere('ar.date >= :startDate AND ar.date <= :endDate', { startDate, endDate });

    if (classId && subjectId) {
      qb.andWhere('ar.classId = :classId', { classId });
      qb.andWhere('ar.subjectId = :subjectId', { subjectId });
    } else if (classId && !subjectId) {
      qb.andWhere('ar.classId = :classId', { classId });
      qb.andWhere('(ar.subjectId IS NULL OR ar.subjectId = :defaultSubject)', { defaultSubject: 'default' });
    } else if (!classId && !subjectId) {
      qb.andWhere('(ar.classId IS NULL OR ar.classId = :defaultClass)', { defaultClass: 'default' });
    }

    if (eventId) {
      qb.andWhere('ar.eventId = :eventId', { eventId });
    }

    const rows = await qb
      .select('ar.date', 'date')
      .addSelect('ar.status', 'status')
      .addSelect('COUNT(*)', 'cnt')
      .groupBy('ar.date')
      .addGroupBy('ar.status')
      .getRawMany();

    const dayMap: Record<string, { presentCount: number; absentCount: number; lateCount: number; leftCount: number; leftEarlyCount: number; leftLatelyCount: number; totalRecords: number }> = {};
    for (const row of rows) {
      const d = this.toDateStr(row.date);
      if (!d) continue;
      if (!dayMap[d]) {
        dayMap[d] = { presentCount: 0, absentCount: 0, lateCount: 0, leftCount: 0, leftEarlyCount: 0, leftLatelyCount: 0, totalRecords: 0 };
      }
      const cnt = parseInt(row.cnt, 10);
      dayMap[d].totalRecords += cnt;
      switch (Number(row.status)) {
        case 1: dayMap[d].presentCount += cnt; break;
        case 0: dayMap[d].absentCount += cnt; break;
        case 2: dayMap[d].lateCount += cnt; break;
        case 3: dayMap[d].leftCount += cnt; break;
        case 4: dayMap[d].leftEarlyCount += cnt; break;
        case 5: dayMap[d].leftLatelyCount += cnt; break;
      }
    }

    return Object.entries(dayMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, counts]) => ({ date, day: parseInt(date.split('-')[2], 10), ...counts }));
  }
}
