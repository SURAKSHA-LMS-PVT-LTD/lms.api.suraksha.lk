import {
  Entity, PrimaryGeneratedColumn, Column,
  ManyToOne, JoinColumn, Index, CreateDateColumn,
} from 'typeorm';
import { SubjectRecordingSession } from './subject_recording_session.entity';

/**
 * Granular player-event log for a SubjectRecordingSession.
 * Mirrors LectureRecordingActivity exactly so the timeline
 * and heartbeat endpoints work identically.
 */
@Entity('subject_recording_activities')
@Index(['sessionId'])
@Index(['activityType'])
export class SubjectRecordingActivity {
  @PrimaryGeneratedColumn('increment', { type: 'bigint', unsigned: true })
  id: string;

  @Column({ name: 'session_id', type: 'bigint', unsigned: true })
  sessionId: string;

  @ManyToOne(() => SubjectRecordingSession, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'session_id' })
  session: SubjectRecordingSession;

  @Column({
    name: 'activity_type',
    type: 'enum',
    enum: [
      'PLAY',
      'PAUSE',
      'SEEK',
      'HEARTBEAT',
      'SPEED_CHANGE',
      'QUALITY_CHANGE',
      'FULLSCREEN_TOGGLE',
      'SUBTITLE_TOGGLE',
      'WATCH_RANGE',
      'TAB_HIDDEN',
      'TAB_VISIBLE',
    ],
  })
  activityType:
    | 'PLAY'
    | 'PAUSE'
    | 'SEEK'
    | 'HEARTBEAT'
    | 'SPEED_CHANGE'
    | 'QUALITY_CHANGE'
    | 'FULLSCREEN_TOGGLE'
    | 'SUBTITLE_TOGGLE'
    | 'WATCH_RANGE'
    | 'TAB_HIDDEN'
    | 'TAB_VISIBLE';

  @Column({ name: 'video_timestamp', type: 'float' })
  videoTimestamp: number;

  @Column({ name: 'wall_clock_timestamp', type: 'timestamp', nullable: true })
  wallClockTimestamp?: Date;

  @Column({ name: 'metadata', type: 'json', nullable: true })
  metadata?: Record<string, any>;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
