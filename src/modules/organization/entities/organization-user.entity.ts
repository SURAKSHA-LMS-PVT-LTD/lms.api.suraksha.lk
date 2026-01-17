import { Entity, PrimaryColumn, Column,  ManyToOne, JoinColumn, Index } from 'typeorm';
import { OrganizationEntity } from './organization.entity';
import { UserEntity } from '../../user/entities/user.entity';

export enum OrganizationRole {
  PRESIDENT = 'PRESIDENT',
  ADMIN = 'ADMIN',
  MODERATOR = 'MODERATOR',
  MEMBER = 'MEMBER'
}

@Entity({ name: 'org_organization_users', synchronize: false }) // Don't modify existing table
@Index('idx_org_user_verified', ['organizationId', 'isVerified'])
@Index('idx_org_user_role', ['organizationId', 'role'])
export class OrganizationUserEntity {
  @PrimaryColumn({ type: 'bigint', name: 'organizationId' })
  organizationId: string;

  @PrimaryColumn({ type: 'bigint', name: 'userId' })
  userId: string;

  @Column({ type: 'enum', enum: OrganizationRole, default: OrganizationRole.MEMBER })
  role: OrganizationRole;

  @Column({ type: 'boolean', default: false, name: 'isVerified' })
  isVerified: boolean;

  @Column({ type: 'bigint', nullable: true, name: 'verifiedBy' })
  verifiedBy?: string;

  @Column({ type: 'datetime', nullable: true, name: 'verifiedAt' })
  verifiedAt?: Date;

  @Column({ type: 'datetime', precision: 3, name: 'createdAt' })
  createdAt: Date;

  @Column({ type: 'datetime', precision: 3, name: 'updatedAt' })
  updatedAt: Date;

  // Relations
  @ManyToOne(() => OrganizationEntity, org => org.organizationUsers, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'organizationId' })
  organization: OrganizationEntity;

  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: UserEntity;

  @ManyToOne(() => UserEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'verifiedBy' })
  verifier?: UserEntity;
}
