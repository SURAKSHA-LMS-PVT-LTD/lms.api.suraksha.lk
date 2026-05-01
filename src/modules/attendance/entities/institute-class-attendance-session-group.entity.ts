import { Entity, PrimaryGeneratedColumn, Column, Index } from 'typeorm';

@Entity('institute_class_attendance_session_groups')
@Index('idx_icasg_class', ['instituteId', 'classId'])
export class InstituteClassAttendanceSessionGroupEntity {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string;

  @Column({ name: 'institute_id', type: 'varchar', length: 64 })
  instituteId: string;

  @Column({ name: 'class_id', type: 'varchar', length: 64 })
  classId: string;

  @Column({ type: 'varchar', length: 100 })
  name: string;

  @Column({ type: 'varchar', length: 20, nullable: true, comment: 'Hex color e.g. #3B82F6' })
  color?: string;

  @Column({ name: 'display_order', type: 'int', default: 0 })
  displayOrder: number;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @Column({ name: 'created_by', type: 'bigint', nullable: true })
  createdBy?: string;

  @Column({ name: 'created_at', type: 'timestamp' })
  createdAt: Date;

  @Column({ name: 'updated_at', type: 'timestamp' })
  updatedAt: Date;
}
