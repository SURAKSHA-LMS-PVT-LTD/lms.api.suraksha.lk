import { Entity, PrimaryGeneratedColumn, Column,  ManyToOne, OneToMany, JoinColumn, Index, AfterLoad } from 'typeorm';
import { InstituteEntity } from '../../institute/entities/institute.entity';

export enum OrganizationType {
  INSTITUTE = 'INSTITUTE',
  GLOBAL = 'GLOBAL'
}

@Entity({ name: 'org_organizations', synchronize: false }) // Don't modify existing table
@Index('idx_org_type', ['type'])
@Index('idx_org_public', ['isPublic'])
@Index('idx_org_institute', ['instituteId'])
export class OrganizationEntity {
  @PrimaryGeneratedColumn('increment', { type: 'bigint', name: 'organizationId' })
  organizationId: string;

  @Column({ type: 'varchar', length: 255, nullable: false })
  name: string;

  @Column({ type: 'enum', enum: OrganizationType, nullable: false })
  type: OrganizationType;

  @Column({ type: 'boolean', default: false, name: 'isPublic' })
  isPublic: boolean;

  @Column({ type: 'varchar', length: 255, nullable: true, name: 'enrollmentKey' })
  enrollmentKey?: string;

  @Column({ type: 'boolean', default: true, name: 'needEnrollmentVerification' })
  needEnrollmentVerification: boolean;

  @Column({ type: 'boolean', default: true, name: 'enabledEnrollments' })
  enabledEnrollments: boolean;

  @Column({ type: 'varchar', length: 255, nullable: true, name: 'imageUrl' })
  imageUrl?: string;

  @Column({ type: 'bigint', nullable: true, name: 'instituteId' })
  instituteId?: string;

  @Column({ type: 'datetime', precision: 3, name: 'createdAt' })
  createdAt: Date;

  @Column({ type: 'datetime', precision: 3, name: 'updatedAt' })
  updatedAt: Date;

  // Relations
  @ManyToOne(() => InstituteEntity, { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'instituteId' })
  institute?: InstituteEntity;

  @OneToMany(() => require('./organization-user.entity').OrganizationUserEntity, (ou: any) => ou.organization)
  organizationUsers: any[];

  @OneToMany(() => require('./cause.entity').CauseEntity, (cause: any) => cause.organization)
  causes: any[];

}
