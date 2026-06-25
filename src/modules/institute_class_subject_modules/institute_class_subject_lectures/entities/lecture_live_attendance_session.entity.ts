import { Entity, PrimaryGeneratedColumn, Column, Index, CreateDateColumn } from 'typeorm';

@Entity('lecture_live_attendance_sessions')
@Index(['lectureId'])
@Index(['urlId'], { unique: true })
@Index(['lectureId', 'createdAt'])
export class LectureLiveAttendanceSession {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // No FK constraint — lecture_id may reference either institute_class_subject_lectures or institute_class_lectures
  @Column({ name: 'lecture_id', type: 'varchar', length: 36 })
  lectureId: string;

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
