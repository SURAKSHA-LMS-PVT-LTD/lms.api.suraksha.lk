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

  @Column({ name: 'activity_type', type: 'enum', enum: ['PLAY', 'PAUSE', 'SEEK', 'HEARTBEAT'] })
  activityType: 'PLAY' | 'PAUSE' | 'SEEK' | 'HEARTBEAT';

  @Column({ name: 'video_timestamp', type: 'float' })
  videoTimestamp: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
