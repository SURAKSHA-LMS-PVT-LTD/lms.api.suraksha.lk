import { Entity, PrimaryColumn, Column,  ManyToOne, JoinColumn, Index } from 'typeorm';
import { InstituteEntity } from '../../../institute/entities/institute.entity';
import { InstituteClassEntity } from '../../../institute_mudules/institue_class/entities/institue_class.entity';
import { UserEntity } from '../../../user/entities/user.entity';
import { StudentEntity } from '../../../student/entities/student.entity';

/**
 * Entity for managing the relationship between an institute's class and its students.
 * Composite primary key: instituteId, classId, studentUserId.
 * Maps to the 'institute_class_students' table.
 * Includes performance indexes for common queries.
 */
@Entity('institute_class_students')
// 🎯 REAL QUERY-BASED INDEXES - Based on actual codebase queries (Nov 2024)
// Student's active classes: auth.service.ts line 201, 240, 241
@Index('idx_class_students_user_active', ['studentUserId', 'isActive'])
// Class roster: sms.service.ts line 1760, 1761, 1762
@Index('idx_class_students_institute_class', ['instituteId', 'classId', 'isActive'])
// Institute's students: enhanced-jwt.service.ts line 171, 172
@Index('idx_class_students_institute_active', ['instituteId', 'isActive'])
// Verification status
@Index('idx_class_students_verified', ['classId', 'isVerified', 'isActive'])
export class InstituteClassStudentEntity {
  @PrimaryColumn({ name: 'institute_id', type: 'varchar', length: 36 })
  instituteId: string;

  @ManyToOne(() => InstituteEntity, { onDelete: 'CASCADE' })
  @JoinColumn([{ name: 'institute_id' }])
  institute?: InstituteEntity;

  @PrimaryColumn({ name: 'institute_class_id', type: 'varchar', length: 36 })
  classId: string;

  @ManyToOne(() => InstituteClassEntity, { onDelete: 'CASCADE' })
  @JoinColumn([{ name: 'institute_class_id' }])
  class?: InstituteClassEntity;

  @PrimaryColumn({ name: 'student_user_id', type: 'bigint' })
  studentUserId: string;

  @ManyToOne(() => StudentEntity, { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn([{ name: 'student_user_id', referencedColumnName: 'userId' }])
  student?: StudentEntity;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @Column({ name: 'is_verified', type: 'boolean', default: false })
  isVerified: boolean;

  @Column({ name: 'enrollment_method', type: 'varchar', length: 20, default: 'manual', comment: 'manual, self_enrollment, teacher_assigned' })
  enrollmentMethod: string;

  @Column({ name: 'enrollment_reason', type: 'text', nullable: true, comment: 'Additional reason or notes for enrollment request' })
  enrollmentReason?: string;

  @Column({ name: 'verified_by', type: 'bigint', nullable: true })
  verifiedBy?: string;

  @ManyToOne(() => UserEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'verified_by' })
  verifier?: UserEntity;

  @Column({ name: 'verified_at', type: 'timestamp', nullable: true })
  verifiedAt?: Date;

  @Column({ name: 'created_at', type: 'timestamp' })
  createdAt: Date;

  @Column({ name: 'updated_at', type: 'timestamp' })
  updatedAt: Date;

  @Column({ name: 'student_type', type: 'enum', enum: ['normal', 'paid', 'free_card', 'half_paid', 'quarter_paid'], default: 'normal', comment: 'Enrollment type at class level: normal=default, paid=fully paid, half_paid=50% fee paid, quarter_paid=25% fee paid, free_card=exempt from fee' })
  studentType: 'normal' | 'paid' | 'free_card' | 'half_paid' | 'quarter_paid';

  // Institute-defined custom key-value metadata (e.g. phone, notes).
  // Stored as plain JSON — fully visible to admins, no encryption.
  @Column({ name: 'extra_data', type: 'json', nullable: true, comment: 'Institute-defined custom key-value data for this class enrollment. Visible to admins, not encrypted.' })
  extraData?: Record<string, any>;
}

