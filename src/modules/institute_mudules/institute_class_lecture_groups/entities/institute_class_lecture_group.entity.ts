import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, Index, CreateDateColumn, UpdateDateColumn, OneToMany } from 'typeorm';
import { InstituteEntity } from '../../../institute/entities/institute.entity';
import { InstituteClassEntity } from '../../institue_class/entities/institue_class.entity';
import { UserEntity } from '../../../user/entities/user.entity';
import { InstituteClassLectureEntity } from '../../institute_class_lectures/entities/institute_class_lecture.entity';

@Entity('institute_class_lecture_groups')
@Index(['instituteId', 'classId'])
export class InstituteClassLectureGroupEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'institute_id', type: 'varchar', length: 36 })
  @Index()
  instituteId: string;

  @ManyToOne(() => InstituteEntity, { onDelete: 'CASCADE' })
  @JoinColumn([{ name: 'institute_id' }])
  institute: InstituteEntity;

  @Column({ name: 'class_id', type: 'varchar', length: 36 })
  @Index()
  classId: string;

  @ManyToOne(() => InstituteClassEntity, { onDelete: 'CASCADE' })
  @JoinColumn([{ name: 'class_id' }])
  class: InstituteClassEntity;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  image?: string;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @OneToMany(() => InstituteClassLectureEntity, (lecture) => lecture.group)
  lectures: InstituteClassLectureEntity[];

  @Column({ name: 'created_by', type: 'bigint', nullable: true })
  createdBy?: string;

  @ManyToOne(() => UserEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn([{ name: 'created_by' }])
  createdByUser?: UserEntity;

  @Column({ name: 'updated_by', type: 'bigint', nullable: true })
  updatedBy?: string;

  @ManyToOne(() => UserEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn([{ name: 'updated_by' }])
  updatedByUser?: UserEntity;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp' })
  updatedAt: Date;
}
