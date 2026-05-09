import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, Index, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { InstituteClassSubjectLecture } from './institute_class_subject_lecture.entity';
import { UserEntity } from '../../../user/entities/user.entity';

@Entity('lecture_recording_sessions')
@Index(['lectureId'])
@Index(['userId'])
@Index(['lectureId', 'userId'])
@Index(['userType'])
export class LectureRecordingSession {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string;

  @Column({ name: 'lecture_id', type: 'bigint' })
  lectureId: string;

  @ManyToOne(() => InstituteClassSubjectLecture, { onDelete: 'CASCADE' })
  @JoinColumn([{ name: 'lecture_id' }])
  lecture: InstituteClassSubjectLecture;

  @Column({ name: 'user_id', type: 'bigint', nullable: true })
  userId?: string;

  @ManyToOne(() => UserEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn([{ name: 'user_id' }])
  user?: UserEntity;

  // User type: 'enrolled' (class/subject enrolled), 'suraksha_user' (any Suraksha LMS user), 'guest' (public/guest access)
  @Column({
    name: 'user_type',
    type: 'enum',
    enum: ['enrolled', 'suraksha_user', 'guest'],
    default: 'guest',
  })
  userType: 'enrolled' | 'suraksha_user' | 'guest' = 'guest';

  // For guest users
  @Column({ name: 'guest_name', type: 'varchar', length: 255, nullable: true })
  guestName?: string;

  @Column({ name: 'guest_email', type: 'varchar', length: 255, nullable: true })
  guestEmail?: string;

  @Column({ name: 'guest_phone', type: 'varchar', length: 50, nullable: true })
  guestPhone?: string;

  @Column({ name: 'guest_dob', type: 'date', nullable: true })
  guestDob?: Date;

  @Column({ name: 'guest_school', type: 'varchar', length: 255, nullable: true })
  guestSchool?: string;

  // Backup/sync tracking
  @Column({ name: 'backup_status', type: 'enum', enum: ['pending', 'completed', 'failed'], default: 'pending' })
  backupStatus: 'pending' | 'completed' | 'failed' = 'pending';

  @Column({ name: 'last_sync_time', type: 'timestamp', nullable: true })
  lastSyncTime?: Date;

  @Column({ name: 'start_time', type: 'timestamp' })
  startTime: Date;

  @Column({ name: 'end_time', type: 'timestamp', nullable: true })
  endTime?: Date;

  @Column({ name: 'total_watched_seconds', type: 'int', default: 0 })
  totalWatchedSeconds: number;

  @Column({ name: 'last_position_seconds', type: 'int', default: 0 })
  lastPositionSeconds: number;

  @Column({ name: 'ip_address', type: 'varchar', length: 50, nullable: true })
  ipAddress?: string;

  @Column({ name: 'user_agent', type: 'text', nullable: true })
  userAgent?: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
