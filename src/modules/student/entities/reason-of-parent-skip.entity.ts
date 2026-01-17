import { Entity, PrimaryGeneratedColumn, Column,  Index, ManyToOne, JoinColumn } from 'typeorm';
import { UserEntity } from '../../user/entities/user.entity';

export enum ParentType {
  FATHER = 'father',
  MOTHER = 'mother',
  GUARDIAN = 'guardian'
}

@Entity('reason_of_parent_skip')
@Index('idx_user_id', ['userId'])
@Index('idx_parent_type', ['parentType'])
@Index('idx_is_active', ['isActive'])
export class ReasonOfParentSkipEntity {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string;

  @Column({ name: 'user_id', type: 'bigint' })
  userId: string;

  @Column({ name: 'parent_type', type: 'enum', enum: ParentType })
  parentType: ParentType;

  @Column({ type: 'text' })
  reason: string;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @Column({ name: 'created_at', type: 'timestamp' })
  createdAt: Date;

  @Column({ name: 'updated_at', type: 'timestamp' })
  updatedAt: Date;

  // Relationships
  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: UserEntity;
}
