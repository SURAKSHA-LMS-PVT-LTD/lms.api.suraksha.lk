import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  Index,
  Unique,
} from 'typeorm';
import { InstituteHouseEntity } from './institute_house.entity';
import { InstituteEntity } from '../../../institute/entities/institute.entity';
import { UserEntity } from '../../../user/entities/user.entity';

export enum HouseEnrollmentMethod {
  MANUAL = 'manual',  // assigned by institute admin
  AUTO = 'auto',      // auto-enrolled at user creation
  SELF = 'self',      // user self-enrolled
}

@Entity('institute_house_member')
@Unique('uq_house_member', ['houseId', 'userId', 'instituteId'])
@Index('idx_house_member_house', ['houseId', 'isActive'])
@Index('idx_house_member_user', ['userId', 'instituteId'])
@Index('idx_house_member_institute', ['instituteId'])
export class InstituteHouseMemberEntity {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string;

  @Column({ name: 'house_id', type: 'bigint' })
  houseId: string;

  @Column({ name: 'institute_id', type: 'varchar', length: 36 })
  instituteId: string;

  @Column({ name: 'user_id', type: 'bigint' })
  userId: string;

  @Column({ name: 'enrolled_by', type: 'bigint', nullable: true })
  enrolledBy?: string;

  @Column({
    name: 'enrollment_method',
    type: 'enum',
    enum: HouseEnrollmentMethod,
    default: HouseEnrollmentMethod.MANUAL,
  })
  enrollmentMethod: HouseEnrollmentMethod;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @Column({ name: 'created_at', type: 'timestamp' })
  createdAt: Date;

  @Column({ name: 'updated_at', type: 'timestamp' })
  updatedAt: Date;

  @ManyToOne(() => InstituteHouseEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'house_id' })
  house: InstituteHouseEntity;

  @ManyToOne(() => InstituteEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'institute_id' })
  institute: InstituteEntity;

  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: UserEntity;

  @ManyToOne(() => UserEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'enrolled_by' })
  enrolledByUser?: UserEntity;
}
