import {
  Entity, PrimaryGeneratedColumn, Column, ManyToOne, OneToMany,
  JoinColumn, Index, CreateDateColumn, UpdateDateColumn,
} from 'typeorm';
import { InstituteEntity } from '../../../institute/entities/institute.entity';
import { InstituteClassEntity } from '../../../institute_mudules/institue_class/entities/institue_class.entity';
import { UserEntity } from '../../../user/entities/user.entity';

@Entity('study_material_folders')
@Index(['instituteId', 'classId'])
export class StudyMaterialFolderEntity {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string;

  @Column({ name: 'institute_id', type: 'varchar', length: 36 })
  instituteId: string;

  @ManyToOne(() => InstituteEntity, { onDelete: 'CASCADE' })
  @JoinColumn([{ name: 'institute_id' }])
  institute: InstituteEntity;

  @Column({ name: 'class_id', type: 'varchar', length: 36 })
  classId: string;

  @ManyToOne(() => InstituteClassEntity, { onDelete: 'CASCADE' })
  @JoinColumn([{ name: 'class_id' }])
  class: InstituteClassEntity;

  @Column({ name: 'parent_id', type: 'bigint', nullable: true })
  parentId?: string;

  @ManyToOne(() => StudyMaterialFolderEntity, f => f.children, { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn([{ name: 'parent_id' }])
  parent?: StudyMaterialFolderEntity;

  @OneToMany(() => StudyMaterialFolderEntity, f => f.parent)
  children: StudyMaterialFolderEntity[];

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description?: string;

  @Column({ name: 'sort_order', type: 'int', default: 0 })
  sortOrder: number;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @Column({ name: 'created_by_id', type: 'bigint', nullable: true })
  createdById?: string;

  @ManyToOne(() => UserEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn([{ name: 'created_by_id' }])
  createdBy?: UserEntity;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
