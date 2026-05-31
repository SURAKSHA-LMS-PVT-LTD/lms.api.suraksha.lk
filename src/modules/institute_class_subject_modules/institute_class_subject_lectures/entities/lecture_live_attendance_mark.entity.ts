import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, Index, CreateDateColumn } from 'typeorm';
import { LectureLiveAttendanceSession } from './lecture_live_attendance_session.entity';
import { InstituteClassSubjectLecture } from './institute_class_subject_lecture.entity';

@Entity('lecture_live_attendance_marks')
@Index(['sessionId'])
@Index(['lectureId'])
@Index(['studentId'])
@Index(['sessionId', 'studentId'], { unique: true })
export class LectureLiveAttendanceMark {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string;

  @Column({ name: 'session_id', type: 'bigint' })
  sessionId: string;

  @ManyToOne(() => LectureLiveAttendanceSession, { onDelete: 'CASCADE' })
  @JoinColumn([{ name: 'session_id' }])
  session: LectureLiveAttendanceSession;

  @Column({ name: 'lecture_id', type: 'bigint' })
  lectureId: string;

  @ManyToOne(() => InstituteClassSubjectLecture, { onDelete: 'CASCADE' })
  @JoinColumn([{ name: 'lecture_id' }])
  lecture: InstituteClassSubjectLecture;

  @Column({ name: 'student_id', type: 'bigint' })
  studentId: string;

  @CreateDateColumn({ name: 'marked_at' })
  markedAt: Date;

  @Column({ name: 'ip_address', type: 'varchar', length: 50, nullable: true })
  ipAddress?: string;

  @Column({ name: 'user_agent', type: 'text', nullable: true })
  userAgent?: string;
}
