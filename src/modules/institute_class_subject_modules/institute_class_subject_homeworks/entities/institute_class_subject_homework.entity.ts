import { Entity, PrimaryGeneratedColumn, Column,  ManyToOne, JoinColumn, ValueTransformer, OneToMany, Index } from 'typeorm';
import { InstituteEntity } from '../../../institute/entities/institute.entity';
import { InstituteClassEntity } from '../../../institute_mudules/institue_class/entities/institue_class.entity';
import { SubjectEntity } from '../../../subject/entities/subject.entity';
import { UserEntity } from '../../../user/entities/user.entity';
import { InstituteClassSubjectHomeworkReference } from './institute_class_subject_homework_reference.entity';
import { InstituteClassSubjectHomeworksSubmission } from '../../institute_class_subject_homeworks_submissions/entities/institute_class_subject_homeworks_submission.entity';

// Transformer to ensure dates are properly serialized
const dateTransformer: ValueTransformer = {
  to: (value: Date | string) => value,
  from: (value: Date | string) => {
    if (!value) return value;
    return value instanceof Date ? value : new Date(value);
  }
};

/**
 * Entity representing homework assignments for a specific class subject.
 * Maps to the 'institute_class_subject_homeworks' table in the database.
 */

@Entity('institute_class_subject_homeworks')
@Index('idx_homework_institute_class_subject', ['instituteId', 'classId', 'subjectId'])
@Index('idx_homework_teacher', ['teacherId'])
@Index('idx_homework_active', ['isActive'])
export class InstituteClassSubjectHomework {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string;

  @Column({ name: 'institute_id', type: 'varchar', length: 36 })
  instituteId: string;

  @ManyToOne(() => InstituteEntity, { onDelete: 'CASCADE' })
  @JoinColumn([{ name: 'institute_id'  }])
  institute: InstituteEntity;

  @Column({ name: 'class_id', type: 'varchar', length: 36 })
  classId: string;

  @ManyToOne(() => InstituteClassEntity, { onDelete: 'CASCADE' })
  @JoinColumn([{ name: 'class_id'  }])
  class: InstituteClassEntity;

  @Column({ name: 'subject_id', type: 'varchar', length: 36 })
  subjectId: string;

  @ManyToOne(() => SubjectEntity, { onDelete: 'CASCADE' })
  @JoinColumn([{ name: 'subject_id'  }])
  subject: SubjectEntity;

  @Column({ name: 'teacher_id', type: 'bigint', nullable: true })
  teacherId?: string;

  @ManyToOne(() => UserEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn([{ name: 'teacher_id'  }])
  teacher?: UserEntity;

  @Column({ type: 'varchar', length: 255 })
  title: string;

  @Column({ type: 'text', nullable: true })
  description?: string;

  @Column({ name: 'end_date', type: 'timestamp', nullable: true, transformer: dateTransformer })
  endDate?: Date;

  @Column({ name: 'start_date', type: 'timestamp', nullable: true, transformer: dateTransformer })
  startDate: Date;

  @Column({ name: 'reference_link', type: 'varchar', length: 255, nullable: true })
  referenceLink?: string;

  // One homework can have many reference materials
  @OneToMany(() => InstituteClassSubjectHomeworkReference, reference => reference.homework)
  references: InstituteClassSubjectHomeworkReference[];

  // One homework can have many submissions
  @OneToMany(() => InstituteClassSubjectHomeworksSubmission, submission => submission.homework)
  submissions: InstituteClassSubjectHomeworksSubmission[];

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @Column({ name: 'created_at', type: 'timestamp', transformer: dateTransformer })
  createdAt: Date;

  @Column({ name: 'updated_at', type: 'timestamp', transformer: dateTransformer })
  updatedAt: Date;

  // Ensure dates are properly serialized when converting to JSON
  toJSON() {
    return {
      ...this,
      startDate: this.startDate instanceof Date ? this.startDate.toISOString() : this.startDate,
      endDate: this.endDate instanceof Date ? this.endDate.toISOString() : this.endDate,
      createdAt: this.createdAt instanceof Date ? this.createdAt.toISOString() : this.createdAt,
      updatedAt: this.updatedAt instanceof Date ? this.updatedAt.toISOString() : this.updatedAt,
    };
  }
}

