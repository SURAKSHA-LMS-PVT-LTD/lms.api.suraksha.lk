import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  Index,
  Unique,
} from 'typeorm';
import { InstituteEntity } from './institute.entity';

@Entity('institute_operating_config')
@Unique(['instituteId', 'dayOfWeek', 'academicYear'])
@Index(['instituteId', 'academicYear'])
export class InstituteOperatingConfigEntity {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string;

  @Column({ name: 'institute_id', type: 'varchar', length: 36 })
  @Index()
  instituteId: string;

  @ManyToOne(() => InstituteEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'institute_id' })
  institute: InstituteEntity;

  @Column({
    name: 'day_of_week',
    type: 'tinyint',
    comment: '1=Monday, 2=Tuesday, ..., 7=Sunday (ISO 8601)',
  })
  dayOfWeek: number;

  @Column({ name: 'is_operating', type: 'boolean', default: true })
  isOperating: boolean;

  @Column({
    name: 'start_time',
    type: 'time',
    nullable: true,
    comment: 'Default operating start, e.g. 08:00:00',
  })
  startTime: string | null;

  @Column({
    name: 'end_time',
    type: 'time',
    nullable: true,
    comment: 'Default operating end, e.g. 15:00:00',
  })
  endTime: string | null;

  @Column({
    name: 'academic_year',
    type: 'varchar',
    length: 20,
    comment: 'e.g. 2025 or 2025/2026',
  })
  academicYear: string;

  @Column({
    name: 'created_at',
    type: 'timestamp',
    default: () => 'CURRENT_TIMESTAMP',
  })
  createdAt: Date;

  @Column({
    name: 'updated_at',
    type: 'timestamp',
    default: () => 'CURRENT_TIMESTAMP',
    onUpdate: 'CURRENT_TIMESTAMP',
  })
  updatedAt: Date;

  @Column({ name: 'created_by', type: 'bigint', nullable: true })
  createdBy: string | null;
}
