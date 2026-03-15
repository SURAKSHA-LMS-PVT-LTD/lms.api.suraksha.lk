import { Entity, PrimaryGeneratedColumn, Column, Index, ManyToOne, JoinColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { InstituteEntity } from '../../institute/entities/institute.entity';

@Entity('structured_lectures')
@Index('idx_lecture_institute_subject', ['instituteId', 'subjectId'])
@Index('idx_lecture_institute_subject_grade', ['instituteId', 'subjectId', 'grade'])
@Index('idx_lecture_subject_grade', ['subjectId', 'grade'])
@Index('idx_lecture_active', ['isActive'])
export class StructuredLectureEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // Institute relationship - lectures belong to an institute (institute-level, not class-level)
  @Column({ name: 'institute_id', type: 'bigint', nullable: true })
  instituteId: string;

  @ManyToOne(() => InstituteEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'institute_id' })
  institute: InstituteEntity;

  @Column({ type: 'varchar', length: 255, nullable: false })
  title: string;

  @Column({ type: 'text', nullable: true })
  description?: string;

  @Column({ type: 'longtext', nullable: true })
  content?: string;

  @Column({ type: 'varchar', length: 36, nullable: false })
  subjectId: string;

  @Column({ type: 'int', nullable: false })
  grade: number;

  @Column({ type: 'int', nullable: true, default: 1 })
  lessonNumber?: number;

  @Column({ type: 'int', nullable: true, default: 1 })
  lectureNumber?: number;

  @Column({ type: 'varchar', length: 255, nullable: true })
  provider?: string;

  @Column({ type: 'int', nullable: true })
  duration?: number;

  @Column({ type: 'varchar', length: 500, nullable: true })
  videoUrl?: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  thumbnailUrl?: string;

  @Column({ type: 'json', nullable: true })
  attachments?: any[];

  @Column({ type: 'json', nullable: true })
  tags?: string[];

  @Column({ type: 'enum', enum: ['beginner', 'intermediate', 'advanced'], default: 'beginner' })
  difficulty: string;

  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  @Column({ type: 'int', default: 0 })
  viewCount: number;

  @Column({ type: 'int', default: 0 })
  likeCount: number;

  @Column({ type: 'varchar', length: 36, nullable: true })
  createdBy?: string;

  @Column({ type: 'varchar', length: 36, nullable: true })
  updatedBy?: string;

  @CreateDateColumn({ type: 'datetime', precision: 6 })
  createdAt: Date;

  @UpdateDateColumn({ type: 'datetime', precision: 6 })
  updatedAt: Date;
}