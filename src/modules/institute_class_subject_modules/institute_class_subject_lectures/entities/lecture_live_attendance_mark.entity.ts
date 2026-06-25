import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, Index, CreateDateColumn } from 'typeorm';
import { LectureLiveAttendanceSession } from './lecture_live_attendance_session.entity';

@Entity('lecture_live_attendance_marks')
@Index(['sessionId'])
@Index(['lectureId'])
@Index(['studentId'])
@Index(['sessionId', 'studentId'], { unique: true })
export class LectureLiveAttendanceMark {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'session_id', type: 'varchar', length: 36 })
  sessionId: string;

  @ManyToOne(() => LectureLiveAttendanceSession, { onDelete: 'CASCADE' })
  @JoinColumn([{ name: 'session_id' }])
  session: LectureLiveAttendanceSession;

  // No FK constraint — lecture_id may reference either lecture table
  @Column({ name: 'lecture_id', type: 'varchar', length: 36 })
  lectureId: string;

  @Column({ name: 'student_id', type: 'bigint' })
  studentId: string;

  @CreateDateColumn({ name: 'marked_at' })
  markedAt: Date;

  @Column({ name: 'ip_address', type: 'varchar', length: 50, nullable: true })
  ipAddress?: string;

  @Column({ name: 'user_agent', type: 'text', nullable: true })
  userAgent?: string;
}
