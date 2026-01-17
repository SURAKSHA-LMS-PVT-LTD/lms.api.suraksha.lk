import { Entity, PrimaryGeneratedColumn, Column,  ManyToOne, JoinColumn, Index, AfterLoad } from 'typeorm';
import { OrganizationEntity } from './organization.entity';

@Entity({ name: 'org_causes', synchronize: false }) // Don't modify existing table
@Index('idx_cause_org', ['organizationId'])
@Index('idx_cause_public', ['isPublic'])
export class CauseEntity {
  @PrimaryGeneratedColumn('increment', { type: 'bigint', name: 'causeId' })
  causeId: string;

  @Column({ type: 'varchar', length: 255, nullable: false })
  title: string;

  @Column({ type: 'text', nullable: true })
  description?: string;

  @Column({ type: 'varchar', length: 255, nullable: true, name: 'imageUrl' })
  imageUrl?: string;

  @Column({ type: 'varchar', length: 255, nullable: true, name: 'introVideoUrl' })
  introVideoUrl?: string;

  @Column({ type: 'boolean', default: false, name: 'isPublic' })
  isPublic: boolean;

  @Column({ type: 'bigint', name: 'organizationId' })
  organizationId: string;

  @Column({ type: 'datetime', precision: 3, name: 'createdAt' })
  createdAt: Date;

  @Column({ type: 'datetime', precision: 3, name: 'updatedAt' })
  updatedAt: Date;

  // Relations
  @ManyToOne(() => OrganizationEntity, org => org.causes, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'organizationId' })
  organization: OrganizationEntity;

}
