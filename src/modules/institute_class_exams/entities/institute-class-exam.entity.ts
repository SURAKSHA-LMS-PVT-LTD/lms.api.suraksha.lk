import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  
  
  ManyToOne,
  JoinColumn,
  Index
} from 'typeorm';
import { InstituteEntity } from '../../institute/entities/institute.entity';
import { InstituteClassEntity } from '../../institute_mudules/institue_class/entities/institue_class.entity';
import { ExamType, ExamStatus, Grade } from '../enums/exam.enum';

@Entity('institute_class_exams')
@Index(['instituteId', 'classId', 'examType', 'startDate'], { unique: true })
export class InstituteClassExamEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'institute_id' })
  instituteId: string;

  @Column({ name: 'class_id' })
  classId: string;

  @Column({
    type: 'enum',
    enum: ExamType,
    name: 'exam_type'
  })
  examType: ExamType;

  @Column({
    type: 'enum',
    enum: Grade,
    nullable: true,
    name: 'grade'
  })
  grade: Grade;

  @Column({ length: 255 })
  title: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({
    type: 'enum',
    enum: ExamStatus,
    default: ExamStatus.DRAFT,
    name: 'status'
  })
  status: ExamStatus;

  @Column({
    type: 'timestamp',
    name: 'start_date'
  })
  startDate: Date;

  @Column({
    type: 'timestamp',
    name: 'end_date'
  })
  endDate: Date;

  @Column({
    type: 'timestamp',
    nullable: true,
    name: 'results_published_date'
  })
  resultsPublishedDate: Date;

  @Column({
    default: false,
    name: 'is_results_published'
  })
  isResultsPublished: boolean;

  @Column({
    nullable: true,
    name: 'created_by'
  })
  createdBy: string;

  @Column({
    nullable: true,
    name: 'updated_by'
  })
  updatedBy: string;

  @Column({
    nullable: true,
    name: 'results_published_by'
  })
  resultsPublishedBy: string;

  @Column({
    type: 'int',
    default: 0,
    name: 'total_students'
  })
  totalStudents: number;

  @Column({
    type: 'int',
    default: 0,
    name: 'marks_entered_count'
  })
  marksEnteredCount: number;

  @Column({
    type: 'decimal',
    precision: 5,
    scale: 2,
    nullable: true,
    name: 'completion_percentage'
  })
  completionPercentage: number;

  @Column({
    default: true,
    name: 'is_active'
  })
  isActive: boolean;

  @Column({ name: 'created_at', type: 'timestamp' })
  createdAt: Date;

  @Column({ name: 'updated_at', type: 'timestamp' })
  updatedAt: Date;

  // Relations
  @ManyToOne(() => InstituteEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'institute_id' })
  institute: InstituteEntity;

  @ManyToOne(() => InstituteClassEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'class_id' })
  class: InstituteClassEntity;
}
