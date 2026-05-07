import { Entity, PrimaryGeneratedColumn, Column, Index, ManyToOne, JoinColumn } from 'typeorm';
import { InstituteClassAttendanceSessionGroupEntity } from './institute-class-attendance-session-group.entity';

export enum CloseUnmarkAction {
  KEEP_NOT_MARKED = 'KEEP_NOT_MARKED',
  MARK_ABSENT     = 'MARK_ABSENT',
}

@Entity('institute_class_attendance_sessions')
@Index('idx_icas_class_date', ['instituteId', 'classId', 'date'])
@Index('idx_icas_group', ['sessionGroupId'])
export class InstituteClassAttendanceSessionEntity {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string;

  @Column({ name: 'institute_id', type: 'varchar', length: 64 })
  instituteId: string;

  @Column({ name: 'class_id', type: 'varchar', length: 64 })
  classId: string;

  @Column({ name: 'session_group_id', type: 'bigint', nullable: true })
  sessionGroupId?: string;

  @Column({ type: 'varchar', length: 100 })
  name: string;

  @Column({ type: 'date', comment: 'YYYY-MM-DD session date' })
  date: string;

  @Column({ name: 'start_time', type: 'time', comment: 'HH:MM session start time' })
  startTime: string;

  @Column({ name: 'end_time', type: 'time', nullable: true, comment: 'HH:MM session end time' })
  endTime?: string;

  @Column({ name: 'late_after_minutes', type: 'int', nullable: true,
    comment: 'Minutes after start_time after which marking is automatically LATE' })
  lateAfterMinutes?: number;

  @Column({ name: 'left_early_before_minutes', type: 'int', nullable: true,
    comment: 'Minutes before end_time before which a mark-out is LEFT_EARLY' })
  leftEarlyBeforeMinutes?: number;

  @Column({ name: 'is_closed', type: 'boolean', default: false })
  isClosed: boolean;

  @Column({ name: 'closed_at', type: 'timestamp', nullable: true })
  closedAt?: Date;

  @Column({ name: 'close_unmark_action', type: 'enum', enum: CloseUnmarkAction,
    default: CloseUnmarkAction.KEEP_NOT_MARKED })
  closeUnmarkAction: CloseUnmarkAction;

  @Column({ name: 'total_students', type: 'int', default: 0,
    comment: 'Snapshot of student count when session was created' })
  totalStudents: number;

  @Column({ name: 'send_notifications', type: 'boolean', default: true,
    comment: 'Whether to send parent notifications when marking attendance in this session' })
  sendNotifications: boolean;

  @Column({ name: 'created_by', type: 'bigint', nullable: true })
  createdBy?: string;

  @Column({ name: 'created_at', type: 'timestamp' })
  createdAt: Date;

  @Column({ name: 'updated_at', type: 'timestamp' })
  updatedAt: Date;

  @ManyToOne(() => InstituteClassAttendanceSessionGroupEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'session_group_id' })
  group?: InstituteClassAttendanceSessionGroupEntity;
}
