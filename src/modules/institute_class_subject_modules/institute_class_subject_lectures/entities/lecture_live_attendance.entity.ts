import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, Index, CreateDateColumn } from 'typeorm';
import { InstituteClassSubjectLecture } from './institute_class_subject_lecture.entity';
import { UserEntity } from '../../../user/entities/user.entity';

@Entity('lecture_live_attendance')
@Index(['lectureId'])
@Index(['userId'])
@Index(['lectureId', 'userId'])
@Index(['instituteId', 'classId'])
export class LectureLiveAttendance {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string;

  @Column({ name: 'lecture_id', type: 'bigint' })
  lectureId: string;

  @ManyToOne(() => InstituteClassSubjectLecture, { onDelete: 'CASCADE' })
  @JoinColumn([{ name: 'lecture_id' }])
  lecture: InstituteClassSubjectLecture;

  // Denormalised scope for fast class/subject-level reporting without joining lectures table
  @Column({ name: 'institute_id', type: 'varchar', length: 36, nullable: true })
  instituteId?: string;

  @Column({ name: 'class_id', type: 'varchar', length: 36, nullable: true })
  classId?: string;

  @Column({ name: 'subject_id', type: 'varchar', length: 36, nullable: true })
  subjectId?: string;

  @Column({ name: 'user_id', type: 'bigint', nullable: true })
  userId?: string;

  @ManyToOne(() => UserEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn([{ name: 'user_id' }])
  user?: UserEntity;

  // For guest users (ANYONE mode)
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

  @Column({ name: 'join_time', type: 'timestamp' })
  joinTime: Date;

  @Column({ name: 'leave_time', type: 'timestamp', nullable: true })
  leaveTime?: Date;

  @Column({ name: 'ip_address', type: 'varchar', length: 50, nullable: true })
  ipAddress?: string;

  @Column({ name: 'user_agent', type: 'text', nullable: true })
  userAgent?: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
