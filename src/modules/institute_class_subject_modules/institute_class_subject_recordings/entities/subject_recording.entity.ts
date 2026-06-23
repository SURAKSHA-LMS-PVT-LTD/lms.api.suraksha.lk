import {
  Entity, PrimaryGeneratedColumn, Column,
  ManyToOne, JoinColumn, Index,
  CreateDateColumn, UpdateDateColumn,
} from 'typeorm';
import { Exclude } from 'class-transformer';
import { InstituteEntity } from '../../../institute/entities/institute.entity';
import { InstituteClassEntity } from '../../../institute_mudules/institue_class/entities/institue_class.entity';
import { SubjectEntity } from '../../../subject/entities/subject.entity';
import { UserEntity } from '../../../user/entities/user.entity';

/**
 * Standalone recording for a class-subject.
 * Admins/teachers upload or link previous recordings here.
 * Supports access control, watch-session tracking, and a welcome message —
 * but has NO live lecture or watch-party concept.
 */
@Entity('subject_recordings')
@Index(['instituteId'])
@Index(['instituteId', 'classId'])
@Index(['instituteId', 'classId', 'subjectId'])
@Index(['uploadedById'])
@Index(['recUrlId'], { unique: true, where: 'rec_url_id IS NOT NULL' })
@Index(['isActive'])
@Index(['status'])
@Index(['createdAt'])
export class SubjectRecording {
  @PrimaryGeneratedColumn('increment', { type: 'bigint', unsigned: true })
  id: string;

  // ─── Scope ────────────────────────────────────────────────────────────────

  @Column({ name: 'institute_id', type: 'varchar', length: 36 })
  instituteId: string;

  @ManyToOne(() => InstituteEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'institute_id' })
  institute: InstituteEntity;

  @Column({ name: 'class_id', type: 'varchar', length: 36, nullable: true })
  classId?: string;

  @ManyToOne(() => InstituteClassEntity, { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'class_id' })
  class?: InstituteClassEntity;

  @Column({ name: 'subject_id', type: 'varchar', length: 36, nullable: true })
  subjectId?: string;

  @ManyToOne(() => SubjectEntity, { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'subject_id' })
  subject?: SubjectEntity;

  @Column({ name: 'uploaded_by_id', type: 'bigint', unsigned: true, nullable: true })
  uploadedById?: string;

  @ManyToOne(() => UserEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'uploaded_by_id' })
  uploadedBy?: UserEntity;

  // ─── Core info ───────────────────────────────────────────────────────────

  @Column({ type: 'varchar', length: 255 })
  title: string;

  @Column({ type: 'text', nullable: true })
  description?: string;

  @Column({
    type: 'enum',
    enum: ['SYSTEM', 'YOUTUBE', 'GOOGLE_DRIVE', 'EXTERNAL'],
    default: 'SYSTEM',
  })
  platform: 'SYSTEM' | 'YOUTUBE' | 'GOOGLE_DRIVE' | 'EXTERNAL';

  @Column({ name: 'recording_url', type: 'text', nullable: true })
  recordingUrl?: string;

  /** Duration in seconds; set after upload/processing */
  @Column({ name: 'duration_seconds', type: 'int', unsigned: true, nullable: true })
  durationSeconds?: number;

  @Column({ name: 'thumbnail_url', type: 'varchar', length: 500, nullable: true })
  thumbnailUrl?: string;

  @Column({ name: 'materials', type: 'json', nullable: true })
  materials?: Array<{
    documentName: string;
    documentUrl: string;
    driveFileId?: string;
    driveWebViewLink?: string;
    source?: string;
  }>;

  @Column({
    type: 'enum',
    enum: ['draft', 'published', 'archived'],
    default: 'draft',
  })
  status: 'draft' | 'published' | 'archived';

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  // ─── Recording access & watch-session tracking ───────────────────────────

  /** When true, watch-sessions and activity events are recorded for this recording */
  @Column({ name: 'rec_attendance_enabled', type: 'boolean', default: false })
  recAttendanceEnabled: boolean;

  /** Unique token embedded in the public recording URL */
  @Column({ name: 'rec_url_id', type: 'varchar', length: 100, unique: true, nullable: true })
  recUrlId?: string;

  @Column({
    name: 'rec_access_level',
    type: 'enum',
    enum: ['ANYONE', 'SURAKSHA_USERS', 'ENROLLED_ONLY', 'PAID_ONLY'],
    default: 'ENROLLED_ONLY',
  })
  recAccessLevel: 'ANYONE' | 'SURAKSHA_USERS' | 'ENROLLED_ONLY' | 'PAID_ONLY';

  @Column({ name: 'rec_payment_id', type: 'varchar', length: 100, nullable: true })
  recPaymentId?: string;

  @Column({ name: 'rec_payment_statuses', type: 'json', nullable: true })
  recPaymentStatuses?: string[];

  @Column({ name: 'rec_entry_bg_url', type: 'varchar', length: 500, nullable: true })
  recEntryBgUrl?: string;

  @Column({ name: 'rec_card_image_url', type: 'varchar', length: 500, nullable: true })
  recCardImageUrl?: string;

  @Column({ name: 'rec_card_image_ttl', type: 'datetime', nullable: true })
  recCardImageTtl?: Date;

  @Column({ name: 'rec_bg_image_ttl', type: 'datetime', nullable: true })
  recBgImageTtl?: Date;

  @Column({ name: 'rec_url_expires_at', type: 'datetime', nullable: true })
  recUrlExpiresAt?: Date;

  /**
   * How many days after publishing to track full watch activity.
   * 0 = only record view attendance (no heartbeat/seek events).
   * 1–30 = track activity for that many days.
   * null = no time limit (always track).
   */
  @Column({ name: 'rec_tracking_days', type: 'int', nullable: true })
  recTrackingDays?: number | null;

  // ─── Welcome message ──────────────────────────────────────────────────────

  @Column({ name: 'welcome_message_enabled', type: 'boolean', default: false })
  welcomeMessageEnabled: boolean;

  @Column({ name: 'welcome_message_text', type: 'text', nullable: true })
  welcomeMessageText?: string;

  @Column({ name: 'welcome_message_voice_enabled', type: 'boolean', default: false })
  welcomeMessageVoiceEnabled: boolean;

  // ─── Timestamps ───────────────────────────────────────────────────────────

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
