import { Entity, PrimaryGeneratedColumn, Column,  Index } from 'typeorm';

export enum EnrollmentStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  REJECTED = 'rejected',
  CANCELLED = 'cancelled',
  SUSPENDED = 'suspended',
  ACTIVE = 'approved' // Alias for backward compatibility
}

@Entity('student_bookhire_enrollment')
@Index('idx_enrollment_student_bookhire', ['studentId', 'bookhireId'])
@Index('idx_enrollment_status', ['status'])
@Index('idx_enrollment_bookhire_status', ['bookhireId', 'status']) // Active students per vehicle (CRITICAL for attendance)
@Index('idx_enrollment_student', ['studentId']) // Student's vehicles (CRITICAL for attendance)
export class StudentBookhireEnrollmentEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 36, nullable: false })
  studentId: string;

  @Column({ type: 'bigint', nullable: false })
  bookhireId: number;

  @Column({ type: 'date', nullable: false })
  enrollmentDate: Date;

  @Column({ type: 'enum', enum: ['pending', 'approved', 'rejected', 'cancelled', 'suspended'], default: 'pending' })
  status: string;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: false })
  monthlyFee: number;

  @Column({ type: 'varchar', length: 255, nullable: true })
  pickupLocation?: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  dropoffLocation?: string;

  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  @Column({ type: 'datetime', nullable: true })
  approvedAt?: Date;

  @Column({ type: 'varchar', length: 36, nullable: true })
  approvedBy?: string;

  @Column({ type: 'datetime', nullable: true })
  rejectedAt?: Date;

  @Column({ type: 'text', nullable: true })
  rejectionReason?: string;

  @Column({ type: 'datetime', nullable: true })
  cancelledAt?: Date;

  @Column({ type: 'text', nullable: true })
  cancellationReason?: string;

  @Column({ name: 'created_at', type: 'timestamp' })
  createdAt: Date;

  @Column({ name: 'updated_at', type: 'timestamp' })
  updatedAt: Date;
}