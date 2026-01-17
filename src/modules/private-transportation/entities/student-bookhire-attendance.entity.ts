import { Entity, PrimaryGeneratedColumn, Column, Index } from 'typeorm';

export enum AttendanceStatus {
  PRESENT = 'present',
  ABSENT = 'absent',
  LATE = 'late'
}

@Entity('student_bookhire_attendance')
@Index('idx_attendance_student', ['studentId'])
@Index('idx_attendance_bookhire', ['bookhireId'])
@Index('idx_attendance_date', ['attendanceDate'])
export class StudentBookhireAttendanceEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 36, nullable: false })
  enrollmentId: string;

  @Column({ type: 'varchar', length: 36, nullable: false })
  studentId: string;

  @Column({ type: 'bigint', nullable: false })
  bookhireId: number;

  @Column({ type: 'date', nullable: false })
  attendanceDate: Date;

  @Column({ type: 'datetime', nullable: true })
  pickupTime?: Date;

  @Column({ type: 'datetime', nullable: true })
  dropoffTime?: Date;

  @Column({ type: 'enum', enum: ['present', 'absent', 'late'], default: 'absent' })
  pickupStatus: string;

  @Column({ type: 'enum', enum: ['present', 'absent', 'late'], default: 'absent' })
  dropoffStatus: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  pickupLocation?: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  dropoffLocation?: string;

  @Column({ type: 'varchar', length: 36, nullable: true })
  markedBy?: string;

  @Column({ type: 'varchar', length: 50, nullable: true })
  rfidCardId?: string;

  @Column({ type: 'text', nullable: true })
  notes?: string;

  @Column({ name: 'created_at', type: 'timestamp' })
  createdAt: Date;

  @Column({ name: 'updated_at', type: 'timestamp' })
  updatedAt: Date;
}