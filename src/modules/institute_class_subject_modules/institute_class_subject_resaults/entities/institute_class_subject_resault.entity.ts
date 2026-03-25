import { Entity, PrimaryGeneratedColumn, Column,  ManyToOne, JoinColumn, Index } from 'typeorm';
import { InstituteEntity } from '../../../institute/entities/institute.entity';
import { InstituteClassEntity } from '../../../institute_mudules/institue_class/entities/institue_class.entity';
import { SubjectEntity } from '../../../subject/entities/subject.entity';
import { UserEntity } from '../../../user/entities/user.entity';
import { InstituteClassSubjectExam } from '../../institute_class_subject_exams/entities/institute_class_subject_exam.entity';
import { Grade } from '../enums/grade.enum';

/**
 * Entity representing results for specific class subjects.
 * Maps to the 'institute_class_subject_results' table in the database.
 */
@Entity('institute_class_subject_results')
@Index('idx_result_institute_class_subject', ['instituteId', 'classId', 'subjectId'])
@Index('idx_result_student', ['studentId'])
@Index('idx_result_exam', ['examId'])
export class InstituteClassSubjectResault {
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

  @Column({ name: 'student_id', type: 'bigint' })
  studentId: string;

  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn([{ name: 'student_id'  }])
  student: UserEntity;

  @Column({ name: 'exam_id', type: 'bigint', nullable: true })
  examId?: string;

  @ManyToOne(() => InstituteClassSubjectExam, { onDelete: 'CASCADE' })
  @JoinColumn([{ name: 'exam_id'  }])
  exam?: InstituteClassSubjectExam;

  @Column({ type: 'decimal', precision: 5, scale: 2, nullable: true })
  score?: string;

  @Column({
    type: 'enum',
    enum: Grade,
    nullable: true,
    name: 'grade'
  })
  grade?: Grade;

  @Column({ type: 'text', nullable: true })
  remarks?: string;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @Column({ name: 'created_at', type: 'timestamp', nullable: true })
  createdAt?: Date;

  @Column({ name: 'updated_at', type: 'timestamp', nullable: true })
  updatedAt?: Date;
}

