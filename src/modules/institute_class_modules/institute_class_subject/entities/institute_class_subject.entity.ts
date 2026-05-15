  import { Entity, PrimaryGeneratedColumn, Column,  ManyToOne, JoinColumn, PrimaryColumn, Index } from 'typeorm';
import { InstituteClassEntity } from '../../../institute_mudules/institue_class/entities/institue_class.entity';
import { SubjectEntity } from '../../../subject/entities/subject.entity';
import { UserEntity } from '../../../user/entities/user.entity';
import { InstituteEntity } from '../../../institute/entities/institute.entity';

/**
 * Entity for managing the relationship between an institute's class and its subjects.
 * Composite primary key: instituteId, classId, subjectId.
 * Maps to the 'institute_class_subjects' table.
 * Includes performance indexes for common queries.
 */
@Entity('institute_class_subjects')
// 🎯 REAL QUERY-BASED INDEXES - Based on actual codebase queries (Nov 2024)
// Teacher's subjects: auth.service.ts line 292, 333, 334, 362, 363
@Index('idx_class_subjects_teacher', ['teacherId', 'isActive'])
// Class subjects lookup
@Index('idx_class_subjects_class', ['classId', 'isActive'])
// Institute subject management
@Index('idx_class_subjects_institute', ['instituteId', 'isActive'])
// Enrollment key lookup (non-unique - uniqueness enforced in application logic since MySQL doesn't support partial unique indexes)
@Index('idx_class_subjects_enrollment_key', ['enrollmentKey'])
export class InstituteClassSubjectEntity {

  @PrimaryColumn({ name: 'institute_id', type: 'varchar', length: 36 })
  instituteId: string;

  @ManyToOne(() => InstituteEntity, { onDelete: 'CASCADE' })
  @JoinColumn([{ name: 'institute_id' }])
  institute: InstituteEntity;

  @PrimaryColumn({ name: 'class_id', type: 'varchar', length: 36 })
  classId: string;

  @ManyToOne(() => InstituteClassEntity, { onDelete: 'CASCADE' })
  @JoinColumn([{ name: 'class_id' }])
  class: InstituteClassEntity;

  @PrimaryColumn({ name: 'subject_id', type: 'varchar', length: 36 })
  subjectId: string;

  @ManyToOne(() => SubjectEntity, { onDelete: 'CASCADE' })
  @JoinColumn([{ name: 'subject_id' }])
  subject: SubjectEntity;

  @Column({ name: 'teacher_id', type: 'bigint', nullable: true })
  teacherId: string;

  @ManyToOne(() => UserEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn([{ name: 'teacher_id' }])
  teacher: UserEntity;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  // Subject enrollment settings
  @Column({ name: 'enrollment_enabled', type: 'boolean', default: false, comment: 'When true, enables self-enrollment for this subject. Teachers can toggle this setting' })
  enrollmentEnabled: boolean;

  @Column({ name: 'enrollment_key', type: 'varchar', length: 50, nullable: true, comment: 'Unique key for self-enrollment. Generated when enrollment is enabled' })
  enrollmentKey?: string;

  // Enrollment fee settings (tuition institutes: monthly fee; schools: subject fee)
  @Column({ name: 'enrollment_fee_required', type: 'boolean', default: false, comment: 'Whether enrollment requires payment' })
  enrollmentFeeRequired: boolean;

  @Column({ name: 'enrollment_fee_amount', type: 'decimal', precision: 10, scale: 2, nullable: true, comment: 'Monthly/enrollment fee amount' })
  enrollmentFeeAmount?: number;

  // Payment-gated enrollment: require student to have paid a specific class-level payment
  @Column({ name: 'enrollment_payment_ref_id', type: 'bigint', nullable: true, comment: 'Class-level payment that gates self-enrollment' })
  enrollmentPaymentRefId?: string;

  @Column({ name: 'enrollment_payment_statuses', type: 'varchar', length: 500, nullable: true, comment: 'Comma-separated allowed submission statuses e.g. VERIFIED,HALF_VERIFIED' })
  enrollmentPaymentStatuses?: string;

  @Column({ name: 'created_at', type: 'timestamp' })
  createdAt: Date;

  @Column({ name: 'updated_at', type: 'timestamp' })
  updatedAt: Date;

}

