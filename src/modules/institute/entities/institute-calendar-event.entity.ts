import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { InstituteEntity } from './institute.entity';
import { InstituteCalendarDayEntity } from './institute-calendar-day.entity';
import {
  CalendarEventType,
  CalendarEventStatus,
  CalendarEventScope,
  AttendanceOpenTo,
} from '../enums/calendar-day-type.enum';

@Entity('institute_calendar_events')
@Index(['instituteId', 'eventDate'])
@Index(['instituteId', 'eventType'])
@Index(['instituteId', 'eventDate', 'eventType'])
@Index(['calendarDayId'])
@Index('idx_inst_tracked', [
  'instituteId',
  'isAttendanceTracked',
  'eventDate',
])
export class InstituteCalendarEventEntity {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string;

  @Column({ name: 'institute_id', type: 'varchar', length: 36 })
  @Index()
  instituteId: string;

  @ManyToOne(() => InstituteEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'institute_id' })
  institute: InstituteEntity;

  @Column({
    name: 'calendar_day_id',
    type: 'bigint',
    nullable: true,
    comment:
      'FK to institute_calendar_days. NULL if event spans concepts beyond a single day',
  })
  calendarDayId: string | null;

  @ManyToOne(() => InstituteCalendarDayEntity, (day) => day.events, {
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'calendar_day_id' })
  calendarDay: InstituteCalendarDayEntity;

  @Column({ name: 'event_type', type: 'enum', enum: CalendarEventType })
  eventType: CalendarEventType;

  @Column({ type: 'varchar', length: 255 })
  title: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ name: 'event_date', type: 'date' })
  eventDate: Date;

  @Column({
    name: 'start_time',
    type: 'time',
    nullable: true,
    comment: 'NULL = all day event',
  })
  startTime: string | null;

  @Column({ name: 'end_time', type: 'time', nullable: true })
  endTime: string | null;

  @Column({ name: 'is_all_day', type: 'boolean', default: false })
  isAllDay: boolean;

  @Column({
    name: 'is_attendance_tracked',
    type: 'boolean',
    default: false,
    comment: 'TRUE = system should track who attended this event',
  })
  isAttendanceTracked: boolean;

  @Column({
    name: 'is_default',
    type: 'boolean',
    default: false,
    comment:
      'When TRUE, attendance marked without explicit event_id goes to this event. Only ONE per day.',
  })
  isDefault: boolean;

  @Column({
    name: 'target_user_types',
    type: 'json',
    nullable: true,
    comment:
      '["STUDENT","TEACHER","PARENT","INSTITUTE_ADMIN"] — NULL means all. Reporting only, never enforced.',
  })
  targetUserTypes: string[] | null;

  @Column({
    name: 'attendance_open_to',
    type: 'enum',
    enum: AttendanceOpenTo,
    default: AttendanceOpenTo.ANYONE,
    comment:
      'ANYONE = any user can mark. TARGET_ONLY/ALL_ENROLLED are soft labels for reporting, NOT enforced.',
  })
  attendanceOpenTo: AttendanceOpenTo;

  @Column({
    name: 'target_scope',
    type: 'enum',
    enum: CalendarEventScope,
    default: CalendarEventScope.INSTITUTE,
    comment:
      'INSTITUTE = whole institute, CLASS = specific classes, SUBJECT = specific subjects',
  })
  targetScope: CalendarEventScope;

  @Column({
    name: 'target_class_ids',
    type: 'json',
    nullable: true,
    comment:
      '[1, 5, 12] — specific class IDs. NULL = all classes (when scope is INSTITUTE)',
  })
  targetClassIds: string[] | null;

  @Column({
    name: 'target_subject_ids',
    type: 'json',
    nullable: true,
    comment: '[3, 7] — specific subject IDs. NULL = all subjects',
  })
  targetSubjectIds: string[] | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  venue: string | null;

  @Column({
    name: 'meeting_link',
    type: 'text',
    nullable: true,
    comment: 'For virtual events',
  })
  meetingLink: string | null;

  @Column({
    type: 'enum',
    enum: CalendarEventStatus,
    default: CalendarEventStatus.SCHEDULED,
  })
  status: CalendarEventStatus;

  @Column({ name: 'max_participants', type: 'int', nullable: true })
  maxParticipants: number | null;

  @Column({
    name: 'is_mandatory',
    type: 'boolean',
    default: false,
    comment: 'If TRUE, absence counts against attendance record',
  })
  isMandatory: boolean;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @Column({
    name: 'created_at',
    type: 'timestamp',
    default: () => 'CURRENT_TIMESTAMP',
  })
  createdAt: Date;

  @Column({
    name: 'updated_at',
    type: 'timestamp',
    default: () => 'CURRENT_TIMESTAMP',
    onUpdate: 'CURRENT_TIMESTAMP',
  })
  updatedAt: Date;

  @Column({ name: 'created_by', type: 'bigint', nullable: true })
  createdBy: string | null;
}
