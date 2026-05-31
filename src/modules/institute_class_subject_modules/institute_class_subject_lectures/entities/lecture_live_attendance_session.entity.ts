import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, Index, CreateDateColumn } from 'typeorm';
import { InstituteClassSubjectLecture } from './institute_class_subject_lecture.entity';

@Entity('lecture_live_attendance_sessions')
@Index(['lectureId'])
@Index(['urlId'], { unique: true })
@Index(['lectureId', 'createdAt'])
export class LectureLiveAttendanceSession {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string;

  @Column({ name: 'lecture_id', type: 'bigint' })
  lectureId: string;

  @ManyToOne(() => InstituteClassSubjectLecture, { onDelete: 'CASCADE' })
  @JoinColumn([{ name: 'lecture_id' }])
  lecture: InstituteClassSubjectLecture;

  @Column({ name: 'url_id', type: 'varchar', length: 100 })
  urlId: string;

  @Column({ name: 'valid_seconds', type: 'int', default: 300 })
  validSeconds: number;

  @Column({ name: 'expires_at', type: 'timestamp' })
  expiresAt: Date;

  @Column({ name: 'created_by', type: 'bigint', nullable: true })
  createdBy?: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
