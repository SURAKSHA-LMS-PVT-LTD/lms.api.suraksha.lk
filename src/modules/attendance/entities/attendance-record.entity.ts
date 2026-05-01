/**
 * 📋 ATTENDANCE RECORD — MySQL mirror of DynamoDB attendance records
 * 
 * Table: attendance_records
 * 
 * This entity stores attendance records synced from DynamoDB into MySQL
 * for reporting, analytics, and relational queries. The sync strategy
 * is controlled by the system-wide ATTENDANCE.SYNC_MODE setting.
 * 
 * The DynamoDB record is ALWAYS the source of truth. This MySQL table
 * is a read-optimized replica used for:
 *   - SQL-based reporting (JOIN with students, classes, etc.)
 *   - Calendar-linked attendance views
 *   - Export and analytics queries
 * 
 * Primary key is the DynamoDB partition key + sort key pair (composite unique).
 * 
 * synchronize: false — managed via manual migrations
 */
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  Index,
  Unique,
} from 'typeorm';

@Entity('attendance_records')
@Unique('UQ_dynamo_pk_sk', ['dynamoPk', 'dynamoSk'])
@Index('IDX_institute_date', ['instituteId', 'date'])
@Index('IDX_student_date', ['studentId', 'date'])
@Index('IDX_student_institute_date', ['studentId', 'instituteId', 'date'])
@Index('IDX_calendar_day', ['calendarDayId'])
@Index('IDX_event', ['eventId'])
@Index('IDX_sync_status', ['syncStatus'])
export class AttendanceRecordEntity {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string;

  // ══════════════════════════════════════════════════
  // DynamoDB Key Reference (for dedup / upsert)
  // ══════════════════════════════════════════════════

  @Column({
    name: 'dynamo_pk',
    type: 'varchar',
    length: 128,
    comment: 'DynamoDB partition key: I#<instituteId>',
  })
  dynamoPk: string;

  @Column({
    name: 'dynamo_sk',
    type: 'varchar',
    length: 512,
    comment: 'DynamoDB sort key: ATTENDANCE#<date>#TS#<ts>#S#<studentId>#C#<classId>#SUB#<subjectId>',
  })
  dynamoSk: string;

  // ══════════════════════════════════════════════════
  // Core Attendance Data
  // ══════════════════════════════════════════════════

  @Column({
    name: 'institute_id',
    type: 'varchar',
    length: 64,
    comment: 'Institute that owns this attendance record',
  })
  instituteId: string;

  @Column({
    name: 'student_id',
    type: 'varchar',
    length: 64,
    comment: 'Student who was marked (user ID or student ID)',
  })
  studentId: string;

  @Column({
    name: 'date',
    type: 'date',
    comment: 'Attendance date (YYYY-MM-DD)',
  })
  date: string;

  @Column({
    name: 'status',
    type: 'tinyint',
    comment: '0=Absent, 1=Present, 2=Late, 3=Left, 4=LeftEarly, 5=LeftLately',
  })
  status: number;

  @Column({
    name: 'timestamp',
    type: 'bigint',
    comment: 'DynamoDB write timestamp (epoch ms)',
  })
  timestamp: string;

  // ══════════════════════════════════════════════════
  // Optional Class / Subject
  // ══════════════════════════════════════════════════

  @Column({
    name: 'class_id',
    type: 'varchar',
    length: 64,
    nullable: true,
  })
  classId: string | null;

  @Column({
    name: 'subject_id',
    type: 'varchar',
    length: 64,
    nullable: true,
  })
  subjectId: string | null;

  // ══════════════════════════════════════════════════
  // Calendar Linkage (from Step 3.5 / 8.5)
  // ══════════════════════════════════════════════════

  @Column({
    name: 'calendar_day_id',
    type: 'bigint',
    nullable: true,
    comment: 'FK → institute_calendar_days.id',
  })
  calendarDayId: string | null;

  @Column({
    name: 'event_id',
    type: 'bigint',
    nullable: true,
    comment: 'FK → institute_calendar_events.id',
  })
  eventId: string | null;

  // ══════════════════════════════════════════════════
  // Optional Metadata
  // ══════════════════════════════════════════════════

  @Column({
    name: 'location',
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  location: string | null;

  @Column({
    name: 'latitude',
    type: 'decimal',
    precision: 10,
    scale: 8,
    nullable: true,
    comment: 'Latitude coordinate (decimal degrees)',
  })
  latitude: number | null;

  @Column({
    name: 'longitude',
    type: 'decimal',
    precision: 11,
    scale: 8,
    nullable: true,
    comment: 'Longitude coordinate (decimal degrees)',
  })
  longitude: number | null;

  @Column({
    name: 'remarks',
    type: 'text',
    nullable: true,
  })
  remarks: string | null;

  @Column({
    name: 'marking_method',
    type: 'varchar',
    length: 64,
    nullable: true,
    comment: 'How it was marked: MANUAL, NFC, QR, DEVICE, FACE, etc.',
  })
  markingMethod: string | null;

  @Column({
    name: 'user_type',
    type: 'varchar',
    length: 32,
    nullable: true,
    comment: 'STUDENT, TEACHER, INSTITUTE_ADMIN, ATTENDANCE_MARKER, PARENT, NOT_ENROLLED',
  })
  userType: string | null;

  @Column({
    name: 'device_uid',
    type: 'varchar',
    length: 128,
    nullable: true,
    comment: 'Attendance device UID that was used for marking',
  })
  deviceUid: string | null;

  // ══════════════════════════════════════════════════
  // Advertisement Tracking (for delivery capability)
  // ══════════════════════════════════════════════════

  @Column({
    name: 'advertisement_id',
    type: 'varchar',
    length: 128,
    nullable: true,
    comment: 'Advertisement ID associated with this attendance record (for delivery capability tracking)',
  })
  advertisementId: string | null;

  // ══════════════════════════════════════════════════
  // Sync Tracking
  // ══════════════════════════════════════════════════

  @Column({
    name: 'sync_status',
    type: 'varchar',
    length: 16,
    default: "'SYNCED'",
    comment: 'PENDING, SYNCED, FAILED, SKIPPED',
  })
  syncStatus: string;

  @Column({
    name: 'sync_error',
    type: 'text',
    nullable: true,
    comment: 'Error message if sync_status=FAILED',
  })
  syncError: string | null;

  @Column({
    name: 'synced_at',
    type: 'timestamp',
    nullable: true,
    comment: 'When this record was written/synced to MySQL',
  })
  syncedAt: Date | null;

  @Column({
    name: 'class_session_id',
    type: 'bigint',
    nullable: true,
    comment: 'Links to institute_class_attendance_sessions.id',
  })
  classSessionId: string | null;

  @Column({
    name: 'created_at',
    type: 'timestamp',
    default: () => 'CURRENT_TIMESTAMP',
  })
  createdAt: Date;
}
