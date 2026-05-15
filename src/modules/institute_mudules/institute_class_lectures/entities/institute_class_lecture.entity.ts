import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, Index, ValueTransformer } from 'typeorm';
import { Exclude } from 'class-transformer';
import { InstituteEntity } from '../../../institute/entities/institute.entity';
import { InstituteClassEntity } from '../../institue_class/entities/institue_class.entity';
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
 * Entity representing lectures scoped to an institute class (all class members).
 * Unlike institute_class_subject_lectures, this is NOT filtered by subject —
 * all students in the class can see these lectures regardless of their subject enrollment.
 *
 * Maps to the 'institute_class_lectures' table in the database.
 */
@Entity('institute_class_lectures')
@Index(['instituteId', 'classId']) // Primary filter: institute + class
@Index(['instituteId', 'classId', 'startTime']) // For class schedule queries
@Index(['instituteId', 'startTime']) // For institute-wide schedule
@Index(['classId', 'startTime']) // For class-wise scheduling
@Index(['instructorId', 'startTime']) // For instructor schedule
@Index(['status', 'startTime']) // For status-based date filtering
@Index(['lectureType', 'isActive']) // For lecture type filtering
export class InstituteClassLectureEntity {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string;

  @Column({ name: 'institute_id', type: 'varchar', length: 36 })
  @Index()
  instituteId: string;

  @ManyToOne(() => InstituteEntity, { onDelete: 'CASCADE' })
  @JoinColumn([{ name: 'institute_id' }])
  institute: InstituteEntity;

  @Column({ name: 'class_id', type: 'varchar', length: 36 })
  @Index()
  classId: string;

  @ManyToOne(() => InstituteClassEntity, { onDelete: 'CASCADE' })
  @JoinColumn([{ name: 'class_id' }])
  class: InstituteClassEntity;

  @Column({ name: 'instructor_id', type: 'bigint', nullable: true })
  instructorId?: string;

  @ManyToOne(() => UserEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn([{ name: 'instructor_id' }])
  instructor?: UserEntity;

  @Column({ type: 'varchar', length: 255 })
  title: string;

  @Column({ type: 'text', nullable: true })
  description?: string;

  @Column({ name: 'lecture_type', type: 'enum', enum: ['online', 'physical', 'hybrid'], default: 'physical' })
  lectureType: 'online' | 'physical' | 'hybrid';

  @Column({ name: 'venue', type: 'varchar', length: 255, nullable: true })
  venue?: string;

  @Column({ name: 'subject', type: 'varchar', length: 100, nullable: true })
  subject?: string; // Free-text subject name (not a FK, for display only)

  @Column({ name: 'start_time', type: 'timestamp', transformer: dateTransformer })
  startTime: Date;

  @Column({ name: 'end_time', type: 'timestamp', transformer: dateTransformer })
  endTime: Date;

  @Column({ name: 'status', type: 'enum', enum: ['scheduled', 'ongoing', 'completed', 'cancelled'], default: 'scheduled' })
  status: 'scheduled' | 'ongoing' | 'completed' | 'cancelled';

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
      createdAt: this.createdAt instanceof Date ? this.createdAt.toISOString() : this.createdAt,
      updatedAt: this.updatedAt instanceof Date ? this.updatedAt.toISOString() : this.updatedAt,
    };
  }
}
