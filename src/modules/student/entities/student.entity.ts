// src/students/entities/student.entity.ts
import { Entity, PrimaryColumn, Column, ManyToOne, JoinColumn, OneToOne, Index } from 'typeorm';
import { ParentEntity } from '../../parent/entities/parent.entity';
import { UserEntity } from '../../user/entities/user.entity';
import { BloodGroup } from '../enums/blood-group.enum';
import { CardDeliveryRecipient } from '../../user-card-management/enums/card-delivery-recipient.enum';

@Entity('students')
// 🎯 REAL QUERY-BASED INDEXES - Based on actual codebase queries (Nov 2024)
// Parent's children lookup: auth.service.ts line 398, 441, enhanced-jwt.service.ts line 354-359
@Index('idx_students_father_active', ['fatherId', 'isActive'])
@Index('idx_students_mother_active', ['motherId', 'isActive'])
@Index('idx_students_guardian_active', ['guardianId', 'isActive'])
// Student active status
@Index('idx_students_active', ['isActive'])
export class StudentEntity {
  @PrimaryColumn({ name: 'user_id', type: 'bigint' })
  userId: string;

  @Column({ name: 'father_id', type: 'bigint', nullable: true })
  fatherId?: string;

  @Column({ name: 'mother_id', type: 'bigint', nullable: true })
  motherId?: string;

  @Column({ name: 'guardian_id', type: 'bigint', nullable: true })
  guardianId?: string;

  @Column({ name: 'student_id', type: 'varchar', length: 20, unique: true, nullable: true })
  studentId?: string;

  @Column({ name: 'emergency_contact', type: 'varchar', length: 15, nullable: true })
  emergencyContact?: string;

  @Column({ name: 'medical_conditions', type: 'text', nullable: true })
  medicalConditions?: string;

  @Column({ name: 'allergies', type: 'text', nullable: true })
  allergies?: string;

  @Column({ 
    name: 'blood_group', 
    type: 'enum', 
    enum: BloodGroup, 
    nullable: true 
  })
  bloodGroup?: BloodGroup;

  @Column({
    name: 'card_delivery_recipient',
    type: 'enum',
    enum: CardDeliveryRecipient,
    nullable: true,
    comment: 'Who should receive the physical ID card: SELF, FATHER, MOTHER, GUARDIAN'
  })
  cardDeliveryRecipient?: CardDeliveryRecipient;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @Column({ name: 'created_at', type: 'timestamp' })
  createdAt: Date;

  @Column({ name: 'updated_at', type: 'timestamp' })
  updatedAt: Date;

  // Relations
  @ManyToOne(() => ParentEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn([{ name: 'father_id', referencedColumnName: 'userId' }])
  father?: ParentEntity;

  @ManyToOne(() => ParentEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn([{ name: 'mother_id', referencedColumnName: 'userId' }])
  mother?: ParentEntity;

  @ManyToOne(() => ParentEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn([{ name: 'guardian_id', referencedColumnName: 'userId' }])
  guardian?: ParentEntity;

  @OneToOne(() => UserEntity, { cascade: true, onDelete: 'CASCADE' })
  @JoinColumn([{ name: 'user_id' }])
  user: UserEntity;
}

