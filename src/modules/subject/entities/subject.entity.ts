import { InstituteClassSubjectEntity } from '../../institute_class_modules/institute_class_subject/entities/institute_class_subject.entity';
import { Entity, PrimaryGeneratedColumn, Column, Index, OneToMany, AfterLoad } from 'typeorm';

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
@Index('idx_subjects_institute_active', ['instituteId', 'isActive'])
@Index('idx_subjects_code', ['code'])
@Index('idx_subjects_type', ['subjectType'])
export class SubjectEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'institute_id', type: 'varchar', length: 36 })
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

  @Column({ name: 'subject_type', type: 'varchar', length: 100, default: SubjectType.MAIN })
  subjectType: string;

  //this for print before cell in the mraks eg G003|98%
  @Column({ name: 'basket_category', type: 'varchar', length: 100, nullable: true })
  basketCategory?: string;

  @Column({ name: 'img_url', type: 'varchar', length: 255, nullable: true })
  imgUrl?: string;

  @Column({ name: 'created_at', type: 'timestamp' })
  createdAt: Date;

  @Column({ name: 'updated_at', type: 'timestamp' })
  updatedAt: Date;

  // Relationships
  @OneToMany(() => InstituteClassSubjectEntity, classSubject => classSubject.subject)
  classSubjects: InstituteClassSubjectEntity[];
}

