import { Entity, PrimaryGeneratedColumn, Column,  ManyToOne, JoinColumn, Index } from 'typeorm';
import { Exclude } from 'class-transformer';
import { InstituteEntity } from '../../../institute/entities/institute.entity';
import { InstituteClassEntity } from '../../institue_class/entities/institue_class.entity';
import { UserEntity } from '../../../user/entities/user.entity';
import { LectureStatus, LectureType } from '../enums/lecture.enum';


@Entity('institute_lectures')
@Index(['instituteId', 'startTime']) // For institute lecture scheduling
@Index(['classId', 'startTime']) // For class-wise lectures
@Index(['instructorId', 'startTime']) // For instructor schedule
export class InstituteLectureEntity {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string;

  @Column({ name: 'institute_id', type: 'varchar', length: 36 })
  @Index()
  instituteId: string;

  @Column({ name: 'class_id', type: 'varchar', length: 36, nullable: true })
  classId?: string;

  @Column({ name: 'instructor_id', type: 'bigint', nullable: true })
  instructorId?: string;

  @Column({ type: 'varchar', length: 255 })
  title: string;

  @Column({ type: 'text', nullable: true })
  description?: string;

  @Column({ 
    name: 'lecture_type', 
    type: 'enum', 
    enum: LectureType,
    default: LectureType.PHYSICAL
  })
  lectureType: LectureType;

  @Column({ name: 'venue', type: 'varchar', length: 255, nullable: true })
  venue?: string; // Room number or location for physical lectures

  @Column({ name: 'subject', type: 'varchar', length: 100, nullable: true })
  subject?: string;

  @Column({ name: 'start_time', type: 'datetime' })
  @Index()
  startTime: Date;

  @Column({ name: 'end_time', type: 'datetime' })
  endTime: Date;

  @Column({ 
    type: 'enum', 
    enum: LectureStatus,
    default: LectureStatus.SCHEDULED
  })
  status: LectureStatus;

  @Column({ name: 'meeting_link', type: 'varchar', length: 255, nullable: true })
  meetingLink?: string;

  @Column({ name: 'meeting_id', type: 'varchar', length: 100, nullable: true })
  meetingId?: string;

  @Exclude()
  @Column({ name: 'meeting_password', type: 'varchar', length: 50, nullable: true, select: false })
  meetingPassword?: string;

  // Recording for online/hybrid lectures
  @Column({ name: 'recording_url', type: 'varchar', length: 255, nullable: true })
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

  @Column({ name: 'created_at', type: 'timestamp' })
  createdAt: Date;

  @Column({ name: 'updated_at', type: 'timestamp' })
  updatedAt: Date;

  // Relations
  @ManyToOne(() => InstituteEntity, { onDelete: 'CASCADE' })
  @JoinColumn([{ name: 'institute_id' }])
  institute: InstituteEntity;

  @ManyToOne(() => InstituteClassEntity, { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn([{ name: 'class_id' }])
  class?: InstituteClassEntity;

  @ManyToOne(() => UserEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn([{ name: 'instructor_id' }])
  instructor?: UserEntity;

  // Computed properties as methods instead of getters to avoid JSON serialization issues
  getDuration(): number {
    if (!this.startTime || !this.endTime) return 0;
    return Math.floor((this.endTime.getTime() - this.startTime.getTime()) / (1000 * 60)); // Duration in minutes
  }

  getIsOngoing(): boolean {
    if (!this.startTime || !this.endTime) return false;
    const now = new Date();
    return this.status === LectureStatus.ONGOING || 
           (this.status === LectureStatus.SCHEDULED && 
            now >= this.startTime && 
            now <= this.endTime);
  }

  getIsUpcoming(): boolean {
    if (!this.startTime) return false;
    const now = new Date();
    return this.status === LectureStatus.SCHEDULED && now < this.startTime;
  }
}
