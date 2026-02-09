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

  @Column({ name: 'institute_id', type: 'bigint' })
  instituteId: string;

  @ManyToOne(() => InstituteEntity, { onDelete: 'CASCADE' })
  @JoinColumn([{ name: 'institute_id'  }])
  institute: InstituteEntity;

  @Column({ name: 'class_id', type: 'bigint', nullable: true })
  classId?: string;

  @ManyToOne(() => InstituteClassEntity, { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn([{ name: 'class_id'  }])
  class?: InstituteClassEntity;

  @Column({ name: 'subject_id', type: 'bigint' })
  subjectId: string;

  @ManyToOne(() => SubjectEntity, { onDelete: 'CASCADE' })
  @JoinColumn([{ name: 'subject_id'  }])
  subject: SubjectEntity;

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

