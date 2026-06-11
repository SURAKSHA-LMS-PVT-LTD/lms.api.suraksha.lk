import {
  Entity, PrimaryGeneratedColumn, Column,
  ManyToOne, JoinColumn, Index,
  CreateDateColumn, UpdateDateColumn,
} from 'typeorm';
import { SubjectRecording } from './subject_recording.entity';
import { UserEntity } from '../../../user/entities/user.entity';

/**
 * Tracks an individual watch session for a SubjectRecording.
 * Structurally mirrors LectureRecordingSession so the same UI
 * and reporting logic works for both lecture recordings and
 * standalone subject recordings.
 */
@Entity('subject_recording_sessions')
@Index(['recordingId'])
@Index(['userId'])
@Index(['recordingId', 'userId'])
@Index(['userType'])
@Index(['backupStatus'])
export class SubjectRecordingSession {
  @PrimaryGeneratedColumn('increment', { type: 'bigint', unsigned: true })
  id: string;

  @Column({ name: 'recording_id', type: 'bigint', unsigned: true })
  recordingId: string;

  @ManyToOne(() => SubjectRecording, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'recording_id' })
  recording: SubjectRecording;

  @Column({ name: 'user_id', type: 'bigint', unsigned: true, nullable: true })
  userId?: string;

  @ManyToOne(() => UserEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'user_id' })
  user?: UserEntity;

  @Column({
    name: 'user_type',
    type: 'enum',
    enum: ['enrolled', 'suraksha_user', 'guest'],
    default: 'guest',
  })
  userType: 'enrolled' | 'suraksha_user' | 'guest';

  // ─── Guest info ───────────────────────────────────────────────────────────

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

  // ─── Progress ─────────────────────────────────────────────────────────────

  @Column({ name: 'start_time', type: 'timestamp' })
  startTime: Date;

  @Column({ name: 'end_time', type: 'timestamp', nullable: true })
  endTime?: Date;

  @Column({ name: 'total_watched_seconds', type: 'int', unsigned: true, default: 0 })
  totalWatchedSeconds: number;

  /** Wall-clock seconds actually spent watching — video seconds divided by playback speed.
   *  Watching 60s of video at 2x = 30 effective seconds. Use this for real engagement metrics. */
  @Column({ name: 'effective_watched_seconds', type: 'int', unsigned: true, default: 0 })
  effectiveWatchedSeconds: number;

  /** Last known playback speed (e.g. 1, 1.25, 1.5, 2). Updated on every SPEED_CHANGE and heartbeat batch. */
  @Column({ name: 'last_playback_speed', type: 'float', default: 1 })
  lastPlaybackSpeed: number;

  @Column({ name: 'last_position_seconds', type: 'int', unsigned: true, default: 0 })
  lastPositionSeconds: number;

  @Column({ name: 'times_viewed', type: 'int', unsigned: true, default: 1 })
  timesViewed: number;

  // ─── Sync / backup ────────────────────────────────────────────────────────

  @Column({
    name: 'backup_status',
    type: 'enum',
    enum: ['pending', 'completed', 'failed'],
    default: 'pending',
  })
  backupStatus: 'pending' | 'completed' | 'failed';

  @Column({ name: 'last_sync_time', type: 'timestamp', nullable: true })
  lastSyncTime?: Date;

  // ─── Network info ─────────────────────────────────────────────────────────

  @Column({ name: 'ip_address', type: 'varchar', length: 50, nullable: true })
  ipAddress?: string;

  @Column({ name: 'user_agent', type: 'text', nullable: true })
  userAgent?: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
