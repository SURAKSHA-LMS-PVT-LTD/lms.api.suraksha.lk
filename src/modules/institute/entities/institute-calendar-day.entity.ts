import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  OneToMany,
  JoinColumn,
  Index,
  Unique,
} from 'typeorm';
import { InstituteEntity } from './institute.entity';
import { InstituteCalendarEventEntity } from './institute-calendar-event.entity';
import { InstituteClassCalendarEntity } from './institute-class-calendar.entity';
import {
  CalendarDayType,
  CalendarDaySource,
} from '../enums/calendar-day-type.enum';

@Entity('institute_calendar_days')
@Unique(['instituteId', 'calendarDate'])
@Index(['instituteId', 'academicYear', 'dayType'])
@Index(['instituteId', 'calendarDate'])
@Index('idx_inst_attendance_expected', [
  'instituteId',
  'isAttendanceExpected',
  'calendarDate',
])
export class InstituteCalendarDayEntity {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string;

  @Column({ name: 'institute_id', type: 'bigint' })
  @Index()
  instituteId: string;

  @ManyToOne(() => InstituteEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'institute_id' })
  institute: InstituteEntity;

  @Column({ name: 'calendar_date', type: 'date' })
  calendarDate: Date;

  @Column({ name: 'academic_year', type: 'varchar', length: 20 })
  academicYear: string;

  @Column({
    name: 'day_type',
    type: 'enum',
    enum: CalendarDayType,
    default: CalendarDayType.REGULAR,
  })
  dayType: CalendarDayType;

  @Column({ type: 'varchar', length: 255, nullable: true })
  title: string | null;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({
    name: 'start_time',
    type: 'time',
    nullable: true,
    comment: 'Override start time for this specific day',
  })
  startTime: string | null;

  @Column({
    name: 'end_time',
    type: 'time',
    nullable: true,
    comment: 'Override end time for this specific day',
  })
  endTime: string | null;

  @Column({
    name: 'is_attendance_expected',
    type: 'boolean',
    default: true,
    comment:
      'FALSE for holidays/weekends. TRUE for working days. Controls reporting.',
  })
  isAttendanceExpected: boolean;

  @Column({
    name: 'source',
    type: 'enum',
    enum: CalendarDaySource,
    default: CalendarDaySource.AUTO_GENERATED,
    comment: 'How this row was created',
  })
  source: CalendarDaySource;

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

  // Relations
  @OneToMany(() => InstituteCalendarEventEntity, (event) => event.calendarDay)
  events: InstituteCalendarEventEntity[];

  @OneToMany(
    () => InstituteClassCalendarEntity,
    (override) => override.calendarDay,
  )
  classOverrides: InstituteClassCalendarEntity[];
}
