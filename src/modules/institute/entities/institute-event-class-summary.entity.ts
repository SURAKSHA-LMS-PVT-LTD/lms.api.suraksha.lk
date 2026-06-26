import { Entity, PrimaryGeneratedColumn, Column, Index, CreateDateColumn, UpdateDateColumn } from 'typeorm';

/**
 * Class-filtered frozen attendance summary for a single calendar event.
 * Written for each enrolled class when the admin ticks "summarize per class" on close.
 * One row per (event_id, class_id) — composite unique key.
 *
 * Used by the class-level Calendar, Statistics, and Summarize tabs to show
 * per-event attendance data without live COUNT queries.
 */
@Entity('institute_event_class_summaries')
@Index('idx_iecs_institute_date', ['instituteId', 'eventDate'])
@Index('idx_iecs_class_date', ['instituteId', 'classId', 'eventDate'])
@Index('idx_iecs_institute_type', ['instituteId', 'classId', 'eventType'])
export class InstituteEventClassSummaryEntity {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
  id: string;

  @Column({ name: 'institute_id', type: 'varchar', length: 36 })
  @Index()
  instituteId: string;

  @Column({ name: 'event_id', type: 'bigint' })
  eventId: string;

  @Column({ name: 'class_id', type: 'varchar', length: 36 })
  classId: string;

  @Column({ name: 'event_date', type: 'date' })
  eventDate: string;

  @Column({ name: 'event_type', type: 'varchar', length: 50 })
  eventType: string;

  @Column({ name: 'event_title', type: 'varchar', length: 255 })
  eventTitle: string;

  @Column({ name: 'present_count', type: 'int', unsigned: true, default: 0 })
  presentCount: number;

  @Column({ name: 'absent_count', type: 'int', unsigned: true, default: 0 })
  absentCount: number;

  @Column({ name: 'late_count', type: 'int', unsigned: true, default: 0 })
  lateCount: number;

  @Column({ name: 'left_count', type: 'int', unsigned: true, default: 0 })
  leftCount: number;

  @Column({ name: 'total_count', type: 'int', unsigned: true, default: 0 })
  totalCount: number;

  @Column({ name: 'attendance_percent', type: 'decimal', precision: 5, scale: 2, default: 0 })
  attendancePercent: number;

  @Column({
    name: 'unmark_action',
    type: 'enum',
    enum: ['KEEP_NOT_MARKED', 'MARK_ABSENT'],
    default: 'KEEP_NOT_MARKED',
  })
  unmarkAction: 'KEEP_NOT_MARKED' | 'MARK_ABSENT';

  @Column({ name: 'closed_at', type: 'datetime' })
  closedAt: Date;

  @Column({ name: 'closed_by', type: 'varchar', length: 36, nullable: true })
  closedBy: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
