import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, Index, CreateDateColumn } from 'typeorm';
import { LectureRecordingSession } from './lecture_recording_session.entity';

@Entity('lecture_recording_activities')
@Index(['sessionId'])
export class LectureRecordingActivity {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string;

  @Column({ name: 'session_id', type: 'bigint' })
  sessionId: string;

  @ManyToOne(() => LectureRecordingSession, { onDelete: 'CASCADE' })
  @JoinColumn([{ name: 'session_id' }])
  session: LectureRecordingSession;

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
