import { Entity, PrimaryGeneratedColumn, Column,  ManyToOne, JoinColumn, Index, ValueTransformer } from 'typeorm';
import { Exclude } from 'class-transformer';
import { InstituteEntity } from '../../../institute/entities/institute.entity';
import { InstituteClassEntity } from '../../../institute_mudules/institue_class/entities/institue_class.entity';
import { SubjectEntity } from '../../../subject/entities/subject.entity';
import { UserEntity } from '../../../user/entities/user.entity';

// Transformer to ensure dates are properly serialized
const dateTransformer: ValueTransformer = {
  to: (value: Date | string) => value,
  from: (value: Date | string) => {
    if (!value) return value;
    return value instanceof Date ? value : new Date(value);
  }
};

/**
 * Entity representing lectures for a specific class subject.
 * Maps to the 'institute_class_subject_lectures' table in the database.
 * Supports filtering by institute, class, subject, and teacher as mentioned in comments.
 */

//these lectures need t0 filter by instute id
//these lectures need t0 filter by instute id,claas_id
//these lectures need t0 filter by instute id,claas_id,subjectId
//these lectures need t0 filter by teacher_id  from institue_classs_subject.teacherId
//others also 

@Entity('institute_class_subject_lectures')
@Index(['instituteId']) // For institute-wise filtering
@Index(['instituteId', 'classId']) // For institute and class filtering
@Index(['instituteId', 'classId', 'subjectId']) // For institute, class, and subject filtering
@Index(['instructorId']) // For teacher-wise filtering
@Index(['instituteId', 'instructorId']) // For institute and teacher filtering
@Index(['startTime']) // For date/time-based queries
@Index(['lectureType', 'isActive']) // For lecture type filtering
@Index(['status', 'startTime']) // For status and date filtering
export class InstituteClassSubjectLecture {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string;

  @Column({ name: 'institute_id', type: 'varchar', length: 36 })
  instituteId: string;

  @ManyToOne(() => InstituteEntity, { onDelete: 'CASCADE' })
  @JoinColumn([{ name: 'institute_id'  }])
  institute: InstituteEntity;

  @Column({ name: 'class_id', type: 'varchar', length: 36, nullable: true })
  classId?: string;

  @ManyToOne(() => InstituteClassEntity, { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn([{ name: 'class_id'  }])
  class?: InstituteClassEntity;

  @Column({ name: 'subject_id', type: 'varchar', length: 36, nullable: true })
  subjectId?: string;

  @ManyToOne(() => SubjectEntity, { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn([{ name: 'subject_id'  }])
  subject?: SubjectEntity;

  @Column({ name: 'instructor_id', type: 'bigint', nullable: true })
  instructorId?: string;

  @ManyToOne(() => UserEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn([{ name: 'instructor_id'  }])
  instructor?: UserEntity;

  @Column({ type: 'varchar', length: 255 })
  title: string;

  @Column({ type: 'text', nullable: true })
  description?: string;

  @Column({ name: 'lecture_type', type: 'enum', enum: ['online', 'physical', 'hybrid'], default: 'physical' })
  lectureType: 'online' | 'physical' | 'hybrid';

  @Column({ name: 'venue', type: 'varchar', length: 255, nullable: true })
  venue?: string;

  @Column({ name: 'start_time', type: 'timestamp', transformer: dateTransformer })
  startTime: Date;

  @Column({ name: 'end_time', type: 'timestamp', transformer: dateTransformer })
  endTime: Date;

  @Column({ name: 'status', type: 'enum', enum: ['scheduled', 'live', 'completed', 'cancelled'], default: 'scheduled' })
  status: 'scheduled' | 'live' | 'completed' | 'cancelled';

  @Column({ name: 'meeting_link', type: 'text', nullable: true })
  meetingLink?: string;

  @Column({ name: 'meeting_id', type: 'varchar', length: 100, nullable: true })
  meetingId?: string;

  @Exclude()
  @Column({ name: 'meeting_password', type: 'varchar', length: 50, nullable: true, select: false })
  meetingPassword?: string;

  @Column({ name: 'recording_url', type: 'text', nullable: true })
  recordingUrl?: string;

  @Column({ name: 'is_recorded', type: 'boolean', default: false })
  isRecorded: boolean;

  @Column({ name: 'max_participants', type: 'int', nullable: true })
  maxParticipants?: number;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

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

  // --- Live Lecture Access & Tracking Settings ---
  @Column({ name: 'live_attendance_enabled', type: 'boolean', default: false })
  liveAttendanceEnabled: boolean;

  @Column({ name: 'live_url_id', type: 'varchar', length: 100, unique: true, nullable: true })
  liveUrlId?: string;

  @Column({ name: 'live_access_level', type: 'enum', enum: ['ANYONE', 'SURAKSHA_USERS', 'ENROLLED_ONLY', 'PAID_ONLY'], default: 'ENROLLED_ONLY' })
  liveAccessLevel: 'ANYONE' | 'SURAKSHA_USERS' | 'ENROLLED_ONLY' | 'PAID_ONLY';

  @Column({ name: 'live_payment_id', type: 'varchar', length: 100, nullable: true })
  livePaymentId?: string;

  @Column({ name: 'live_payment_statuses', type: 'json', nullable: true })
  livePaymentStatuses?: string[]; // e.g., ['VERIFIED', 'HALF_PAID', 'FREE_CARD']

  @Column({ name: 'live_entry_bg_url', type: 'varchar', length: 500, nullable: true })
  liveEntryBgUrl?: string;

  @Column({ name: 'live_card_image_url', type: 'varchar', length: 500, nullable: true })
  liveCardImageUrl?: string;

  @Column({ name: 'live_card_image_ttl', type: 'datetime', nullable: true })
  liveCardImageTtl?: Date;

  @Column({ name: 'live_bg_image_ttl', type: 'datetime', nullable: true })
  liveBgImageTtl?: Date;

  @Column({ name: 'live_url_expires_at', type: 'datetime', nullable: true })
  liveUrlExpiresAt?: Date;

  // --- Recording Access & Tracking Settings ---
  @Column({ name: 'rec_attendance_enabled', type: 'boolean', default: false })
  recAttendanceEnabled: boolean;

  @Column({ name: 'rec_url_id', type: 'varchar', length: 100, unique: true, nullable: true })
  recUrlId?: string;

  @Column({ name: 'rec_platform', type: 'enum', enum: ['SYSTEM', 'YOUTUBE', 'GOOGLE_DRIVE'], default: 'SYSTEM' })
  recPlatform: 'SYSTEM' | 'YOUTUBE' | 'GOOGLE_DRIVE';

  @Column({ name: 'rec_access_level', type: 'enum', enum: ['ANYONE', 'SURAKSHA_USERS', 'ENROLLED_ONLY', 'PAID_ONLY'], default: 'ENROLLED_ONLY' })
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

  @Column({ name: 'rec_duration_seconds', type: 'int', nullable: true })
  recDurationSeconds?: number;

  /**
   * How many days after publishing to track full watch activity.
   * 0 = only record view attendance (no heartbeat/seek events).
   * 1–30 = track activity for that many days.
   * null = no time limit (always track).
   */
  @Column({ name: 'rec_tracking_days', type: 'int', nullable: true })
  recTrackingDays?: number | null;

  @Column({ name: 'welcome_message_enabled', type: 'boolean', default: false })
  welcomeMessageEnabled: boolean;

  @Column({ name: 'welcome_message_text', type: 'text', nullable: true })
  welcomeMessageText?: string;

  @Column({ name: 'welcome_message_voice_enabled', type: 'boolean', default: false })
  welcomeMessageVoiceEnabled: boolean;

  @Column({ name: 'closed_at', type: 'timestamp', nullable: true })
  closedAt?: Date;

  @Column({ name: 'lecture_summary', type: 'json', nullable: true })
  lectureSummary?: {
    // attendance via links
    totalAttendanceSessions: number;
    totalStudentsMarked: number;
    fullAttendanceCount: number;
    studentAttendance: Array<{
      studentId: string;
      attendCount: number;
      attendPercent: number;
      firstAt: string;
      lastAt: string;
    }>;
    // direct live
    liveDirectJoins: number;
    liveDirectUniqueUsers: number;
    liveGuestJoins: number;
    liveAvgDurationMinutes: number;
    // recording
    recUniqueViewers: number;
    recTimesViewed: number;
    recTotalWatchedMinutes: number;
    recAvgWatchedMinutes: number;
    recPerStudentWatch: Array<{
      userId: string;
      watchedMinutes: number;
      completionPercent: number | null;
      timesViewed: number;
      lastPositionMinutes: number;
    }>;
    closedBy?: string;
  } | null;

  @Column({ name: 'created_at', type: 'timestamp', nullable: true, transformer: dateTransformer })
  createdAt?: Date;

  @Column({ name: 'updated_at', type: 'timestamp', nullable: true, transformer: dateTransformer })
  updatedAt?: Date;

  // Ensure dates are properly serialized when converting to JSON
  toJSON() {
    return {
      ...this,
      startTime: this.startTime instanceof Date ? this.startTime.toISOString() : this.startTime,
      endTime: this.endTime instanceof Date ? this.endTime.toISOString() : this.endTime,
      closedAt: this.closedAt instanceof Date ? this.closedAt.toISOString() : this.closedAt,
      createdAt: this.createdAt instanceof Date ? this.createdAt.toISOString() : this.createdAt,
      updatedAt: this.updatedAt instanceof Date ? this.updatedAt.toISOString() : this.updatedAt,
    };
  }
}

