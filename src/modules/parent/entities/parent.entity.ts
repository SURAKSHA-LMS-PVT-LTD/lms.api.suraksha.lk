// src/students/entities/parent.entity.ts
import { Entity, PrimaryGeneratedColumn, Column, OneToOne, JoinColumn, OneToMany, Index } from 'typeorm';
import { UserEntity } from '../../user/entities/user.entity';
import { StudentEntity } from '../../student/entities/student.entity';
import { Occupation } from '../../user/enums/occupation.enum';

@Entity('parents')
// 🎯 REAL QUERY-BASED INDEXES - Based on actual codebase queries (Nov 2024)
// Parent lookup by user_id: user.service.ts line 1708, 1719, 1852, 1863
@Index('idx_parents_user_id', ['userId', 'isActive'])
export class ParentEntity {
  @PrimaryGeneratedColumn('increment', { name: 'id', type: 'bigint' })
  id: string;

  @Column({ name: 'user_id', type: 'bigint', unique: true })
  userId: string;

  @Column({ 
    name: 'occupation', 
    type: 'enum', 
    enum: Occupation, 
    nullable: true 
  })
  occupation?: Occupation;

  @Column({ name: 'workplace', type: 'varchar', length: 100, nullable: true })
  workplace?: string;

  @Column({ name: 'work_phone', type: 'varchar', length: 15, nullable: true })
  workPhone?: string;

  @Column({ name: 'education_level', type: 'varchar', length: 100, nullable: true })
  educationLevel?: string;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @Column({ name: 'created_at', type: 'timestamp' })
  createdAt: Date;

  @Column({ name: 'updated_at', type: 'timestamp' })
  updatedAt: Date;

  // Relations
  @OneToOne(() => UserEntity, { cascade: true, onDelete: 'CASCADE' })
  @JoinColumn([{ name: 'user_id' }])
  user: UserEntity;

  @OneToMany(() => StudentEntity, (student) => student.father)
  childrenAsFather: StudentEntity[];

  @OneToMany(() => StudentEntity, (student) => student.mother)
  childrenAsMother: StudentEntity[];

  @OneToMany(() => StudentEntity, (student) => student.guardian)
  childrenAsGuardian: StudentEntity[];
}
