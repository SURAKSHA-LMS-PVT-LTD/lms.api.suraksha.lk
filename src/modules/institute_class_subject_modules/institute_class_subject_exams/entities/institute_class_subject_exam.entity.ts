import { Entity, PrimaryGeneratedColumn, Column,  ManyToOne, JoinColumn, Index, ValueTransformer } from 'typeorm';
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
 * Entity representing exams for specific class subjects.
 * Maps to the 'institute_class_subject_exams' table in the database.
 * Supports online and physical exams with scheduling and assignment features.
 */

@Entity('institute_class_subject_exams')
@Index(['instituteId', 'classId', 'subjectId']) // For subject-wise exam queries
@Index(['instituteId', 'scheduleDate']) // For date-based exam queries
@Index(['examType', 'status']) // For filtering by type and status
@Index(['createdBy', 'isActive']) // For teacher's exam management
@Index(['scheduleDate', 'status']) // For upcoming exams
export class InstituteClassSubjectExam {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string;

  @Column({ name: 'institute_id', type: 'bigint' })
  instituteId: string;

  @ManyToOne(() => InstituteEntity, { onDelete: 'CASCADE' })
  @JoinColumn([{ name: 'institute_id'  }])
  institute: InstituteEntity;

  @Column({ name: 'class_id', type: 'bigint' })
  classId: string;

  @ManyToOne(() => InstituteClassEntity, { onDelete: 'CASCADE' })
  @JoinColumn([{ name: 'class_id'  }])
  class: InstituteClassEntity;

  @Column({ name: 'subject_id', type: 'bigint' })
  subjectId: string;

  @ManyToOne(() => SubjectEntity, { onDelete: 'CASCADE' })
  @JoinColumn([{ name: 'subject_id'  }])
  subject: SubjectEntity;

  @Column({ type: 'varchar', length: 255 })
  title: string;

  @Column({ type: 'text', nullable: true })
  description?: string;

  @Column({ name: 'exam_type', type: 'enum', enum: ['online', 'physical'], default: 'physical' })
  examType: 'online' | 'physical';

  @Column({ name: 'duration_minutes', type: 'int' })
  durationMinutes: number;

  @Column({ name: 'total_marks', type: 'decimal', precision: 5, scale: 2 })
  totalMarks: number;

  @Column({ name: 'passing_marks', type: 'decimal', precision: 5, scale: 2 })
  passingMarks: number;

  @Column({ name: 'schedule_date', type: 'timestamp', transformer: dateTransformer })
  scheduleDate: Date;

  @Column({ name: 'start_time', type: 'timestamp', transformer: dateTransformer })
  startTime: Date;

  @Column({ name: 'end_time', type: 'timestamp', transformer: dateTransformer })
  endTime: Date;

  @Column({ name: 'venue', type: 'varchar', length: 255, nullable: true })
  venue?: string;

  @Column({ name: 'exam_link', type: 'varchar', length: 255, nullable: true })
  examLink?: string;

  @Column({ name: 'instructions', type: 'text', nullable: true })
  instructions?: string;

  @Column({ name: 'status', type: 'enum', enum: ['draft', 'scheduled', 'active', 'completed', 'cancelled'], default: 'draft' })
  status: 'draft' | 'scheduled' | 'active' | 'completed' | 'cancelled';

  @Column({ name: 'created_by', type: 'bigint', nullable: true })
  createdBy?: string;

  @ManyToOne(() => UserEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn([{ name: 'created_by'  }])
  creator?: UserEntity;

  @Column({ name: 'to_whom', type: 'enum', enum: ['everyone', 'selected_students'], default: 'everyone' })
  toWhom: 'everyone' | 'selected_students';

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
      scheduleDate: this.scheduleDate instanceof Date ? this.scheduleDate.toISOString() : this.scheduleDate,
      startTime: this.startTime instanceof Date ? this.startTime.toISOString() : this.startTime,
      endTime: this.endTime instanceof Date ? this.endTime.toISOString() : this.endTime,
      createdAt: this.createdAt instanceof Date ? this.createdAt.toISOString() : this.createdAt,
      updatedAt: this.updatedAt instanceof Date ? this.updatedAt.toISOString() : this.updatedAt,
    };
  }
}

