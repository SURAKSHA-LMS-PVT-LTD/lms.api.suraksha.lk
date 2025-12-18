import { Entity, PrimaryColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn, Index } from 'typeorm';
import { InstituteEntity } from '../../../institute/entities/institute.entity';
import { InstituteClassEntity } from '../../../institute_mudules/institue_class/entities/institue_class.entity';
import { UserEntity } from '../../../user/entities/user.entity';
import { SubjectEntity } from '../../../subject/entities/subject.entity';

/**
 * Entity representing the relationship between students and specific class subjects.
 * Maps to the 'institute_class_subject_students' table in the database.
 * Composite primary key: instituteId, classId, subjectId, studentId.
 */

//this may mostly use teacher for get the students who are in the class subject
//this may mostly use students for get the classes_subjects what are he followed

@Entity('institute_class_subject_students')
// 🎯 REAL QUERY-BASED INDEXES - Based on actual codebase queries (Nov 2024)
// Student's subject enrollments: auth.service.ts line 275, 276, 277
@Index('idx_class_subject_students_user', ['studentId', 'isActive'])
// Class subject roster: sms.service.ts line 1785, 1786, 1787, 1788
@Index('idx_class_subject_students_filter', ['instituteId', 'classId', 'subjectId', 'isActive'])
// Subject's active students
@Index('idx_class_subject_students_subject', ['subjectId', 'isActive'])
export class InstituteClassSubjectStudent {
  @PrimaryColumn({ name: 'institute_id', type: 'bigint' })
  instituteId: string;

  @ManyToOne(() => InstituteEntity, { onDelete: 'CASCADE' })
  @JoinColumn([{ name: 'institute_id'  }])
  institute: InstituteEntity;

  @PrimaryColumn({ name: 'class_id', type: 'bigint' })
  classId: string;

  @ManyToOne(() => InstituteClassEntity, { onDelete: 'CASCADE' })
  @JoinColumn([{ name: 'class_id'  }])
  class: InstituteClassEntity;

  @PrimaryColumn({ name: 'subject_id', type: 'bigint' })
   subjectId: string;
 
   @ManyToOne(() => SubjectEntity, { onDelete: 'CASCADE' })
   @JoinColumn([{ name: 'subject_id'  }])
   subject: SubjectEntity;

  @PrimaryColumn({ name: 'student_id', type: 'bigint' })
  studentId: string;

  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn([{ name: 'student_id'  }])
  student: UserEntity;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  // Simple enrollment tracking
  @Column({ name: 'enrollment_method', type: 'enum', enum: ['teacher_assigned', 'self_enrolled'], default: 'teacher_assigned', comment: 'How the student was enrolled' })
  enrollmentMethod: 'teacher_assigned' | 'self_enrolled';

  @Column({ name: 'enrolled_by', type: 'bigint', nullable: true, comment: 'Teacher who enrolled the student' })
  enrolledBy?: string;

  @ManyToOne(() => UserEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn([{ name: 'enrolled_by' }])
  enrolledByTeacher?: UserEntity;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp' })
  updatedAt: Date;
}

