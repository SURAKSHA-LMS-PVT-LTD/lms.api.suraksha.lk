import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  Index,
  Unique,
} from 'typeorm';
import { InstituteEntity } from './institute.entity';
import { InstituteCalendarDayEntity } from './institute-calendar-day.entity';
import { InstituteClassEntity } from '../../institute_mudules/institue_class/entities/institue_class.entity';
import { ClassDayType } from '../enums/calendar-day-type.enum';

@Entity('institute_class_calendar')
@Unique(['instituteId', 'classId', 'calendarDate'])
@Index(['instituteId', 'classId', 'calendarDate'])
@Index(['calendarDayId'])
export class InstituteClassCalendarEntity {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string;

  @Column({ name: 'institute_id', type: 'bigint' })
  @Index()
  instituteId: string;

  @ManyToOne(() => InstituteEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'institute_id' })
  institute: InstituteEntity;

  @Column({ name: 'class_id', type: 'bigint' })
  classId: string;

  @ManyToOne(() => InstituteClassEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'class_id' })
  class: InstituteClassEntity;

  @Column({ name: 'calendar_day_id', type: 'bigint' })
  calendarDayId: string;

  @ManyToOne(() => InstituteCalendarDayEntity, (day) => day.classOverrides, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'calendar_day_id' })
  calendarDay: InstituteCalendarDayEntity;

  @Column({
    name: 'calendar_date',
    type: 'date',
    comment: 'Denormalized for query performance',
  })
  calendarDate: Date;

  @Column({
    name: 'class_day_type',
    type: 'enum',
    enum: ClassDayType,
  })
  classDayType: ClassDayType;

  @Column({ type: 'varchar', length: 255, nullable: true })
  title: string | null;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({
    name: 'is_attendance_expected',
    type: 'boolean',
    default: true,
  })
  isAttendanceExpected: boolean;

  @Column({ name: 'merged_with_class_id', type: 'bigint', nullable: true })
  mergedWithClassId: string | null;

  @Column({ name: 'substitute_teacher_id', type: 'bigint', nullable: true })
  substituteTeacherId: string | null;

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
