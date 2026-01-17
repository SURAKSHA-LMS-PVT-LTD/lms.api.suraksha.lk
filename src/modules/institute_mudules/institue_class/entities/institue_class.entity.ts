import { Entity, PrimaryGeneratedColumn, Column,  ManyToOne, JoinColumn, Index, AfterLoad } from 'typeorm';
import { Transform } from 'class-transformer';
import { InstituteEntity } from '../../../institute/entities/institute.entity';
import { UserEntity } from '../../../user/entities/user.entity';

@Entity('institute_classes')
export class InstituteClassEntity {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string;

  @Column({ name: 'institute_id', type: 'bigint' })
  instituteId: string;

  @ManyToOne(() => InstituteEntity, { onDelete: 'CASCADE' })
  @JoinColumn([{ name: 'institute_id' }])
  institute: InstituteEntity;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ type: 'varchar', length: 50, unique: true })
  code: string;

  @Column({ name: 'academic_year', type: 'varchar', length: 20, nullable: true })
  academicYear?: string;

  @Column({ type: 'int', nullable: true })
  level?: number;

  // Enhanced grade field for better filtering and auto-grading
  @Column({ type: 'int', nullable: true, comment: 'Grade level (1-12) for filtering and auto-grading' })
  grade?: number;

  // Specialty field for subject-based sections
  @Column({ 
    type: 'varchar',
    length: 50,
    nullable: true,
    comment: 'Class specialty (science, commerce, arts, etc.) for filtering and management'
  })
  specialty?: string;

  // Class type for additional categorization
  @Column({ 
    type: 'varchar',
    length: 50,
    name: 'class_type',
    comment: 'Type of class '
  })
  classType: string;

  @Column({ type: 'int', nullable: true })
  capacity?: number;

  @Column({ name: 'class_teacher_id', type: 'bigint', nullable: true })
  classTeacherId?: string;

  @ManyToOne(() => UserEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'class_teacher_id' })
  classTeacher?: UserEntity;

  @Column({ type: 'text', nullable: true })
  description?: string;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @Column({ name: 'start_date', type: 'date', nullable: true })
  @Transform(({ value }) => value instanceof Date ? value.toISOString() : value)
  startDate?: Date;

  @Column({ name: 'end_date', type: 'date', nullable: true })
  @Transform(({ value }) => value instanceof Date ? value.toISOString() : value)
  endDate?: Date;

  // Class image
  @Column({ name: 'image_url', type: 'varchar', length: 255, nullable: true })
  imageUrl?: string;

  // Self-enrollment settings
  @Column({ name: 'enrollment_code', type: 'varchar', length: 50, nullable: true, comment: 'Code for self-enrollment. Can be reused across classes and institutes' })
  enrollmentCode?: string;

  @Column({ name: 'enrollment_enabled', type: 'boolean', default: false, comment: 'When true, enables self-enrollment for this class. Teachers can toggle this setting' })
  enrollmentEnabled: boolean;

  @Column({ name: 'require_teacher_verification', type: 'boolean', default: true })
  requireTeacherVerification: boolean;

  @Column({ name: 'created_at', type: 'timestamp' })
  @Transform(({ value }) => value instanceof Date ? value.toISOString() : value)
  createdAt: Date;

  @Column({ name: 'updated_at', type: 'timestamp' })
  @Transform(({ value }) => value instanceof Date ? value.toISOString() : value)
  updatedAt: Date;

}
