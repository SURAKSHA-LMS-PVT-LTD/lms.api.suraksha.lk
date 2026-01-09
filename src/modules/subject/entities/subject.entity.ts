import { InstituteClassSubjectEntity } from '../../institute_class_modules/institute_class_subject/entities/institute_class_subject.entity';
import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, OneToMany, AfterLoad } from 'typeorm';

export enum SubjectType {
  MAIN = 'MAIN',
  BASKET = 'BASKET',
  COMMON = 'COMMON',
  GRADE_6TO9_BASKET = 'GRADE_6TO9_BASKET',
  GRADE_10TO11_BASKET_1 = 'GRADE_10TO11_BASKET_1',
  GRADE_10TO11_BASKET_2 = 'GRADE_10TO11_BASKET_2',
  GRADE_10TO11_BASKET_3 = 'GRADE_10TO11_BASKET_3',
  GRADE_10TO11_BASKET_4 = 'GRADE_10TO11_BASKET_4',
  GRADE_12TO13_BASKET_1 = 'GRADE_12TO13_BASKET_1',
  GRADE_12TO13_BASKET_2 = 'GRADE_12TO13_BASKET_2',
  GRADE_12TO13_BASKET_3 = 'GRADE_12TO13_BASKET_3',
  GRADE_12TO13_BASKET_4 = 'GRADE_12TO13_BASKET_4',
}

@Entity('subjects')
export class SubjectEntity {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string;

  @Column({ name: 'institute_id', type: 'bigint' })
  instituteId: string;

  @Column({ type: 'varchar', length: 50, unique: true })
  code: string;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description?: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  category?: string;

  @Column({ name: 'credit_hours', type: 'int', nullable: true })
  creditHours?: number;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @Column({ name: 'subject_type', type: 'enum', enum: SubjectType, default: SubjectType.MAIN })
  subjectType: SubjectType;

  //this for print before cell in the mraks eg G003|98%
  @Column({ name: 'basket_category', type: 'varchar', length: 100, nullable: true })
  basketCategory?: string;

  @Column({ name: 'img_url', type: 'varchar', length: 255, nullable: true })
  imgUrl?: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp' })
  updatedAt: Date;

  // Relationships
  @OneToMany(() => InstituteClassSubjectEntity, classSubject => classSubject.subject)
  classSubjects: InstituteClassSubjectEntity[];
}

