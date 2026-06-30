import {
  Entity, Column, Index, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn,
} from 'typeorm';

export enum CardGenerationJobStatus {
  /** Credits debited; frontend is rendering and will upload the result */
  PENDING    = 'PENDING',
  /** Frontend uploaded the ZIP to Drive and registered the link */
  COMPLETED  = 'COMPLETED',
  /** Generation failed (partial or total) */
  FAILED     = 'FAILED',
  /** Expired — frontend never completed within the TTL */
  EXPIRED    = 'EXPIRED',
}

/**
 * Records every server-side card generation job.
 *
 * "Server-side" here means the output ZIP is uploaded to the requesting
 * user's Google Drive and a shareable link is returned — not a direct
 * browser download.  This removes the in-browser memory constraint and
 * works on mobile Capacitor apps.
 *
 * Architecture note: this module is intentionally isolated so it can be
 * extracted to a standalone microservice with minimal changes.
 */
@Entity('card_generation_jobs')
@Index('idx_cgj_institute', ['instituteId'])
@Index('idx_cgj_requested_by', ['requestedBy'])
@Index('idx_cgj_status', ['status'])
@Index('idx_cgj_generation_record', ['generationRecordId'])
export class CardGenerationJobEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'institute_id', type: 'varchar', length: 36 })
  instituteId: string;

  /** References design_generation_records.id — the billing record already created */
  @Column({ name: 'generation_record_id', type: 'varchar', length: 36 })
  generationRecordId: string;

  /** User ID of the institute admin who triggered the generation */
  @Column({ name: 'requested_by', type: 'varchar', length: 36 })
  requestedBy: string;

  @Column({ name: 'template_id', type: 'varchar', length: 36 })
  templateId: string;

  @Column({ name: 'template_name', type: 'varchar', length: 255 })
  templateName: string;

  @Column({ name: 'user_count', type: 'int' })
  userCount: number;

  @Column({ name: 'unit_cost', type: 'decimal', precision: 10, scale: 2 })
  unitCost: number;

  @Column({ name: 'total_cost', type: 'decimal', precision: 10, scale: 2 })
  totalCost: number;

  @Column({
    name: 'status',
    type: 'enum',
    enum: CardGenerationJobStatus,
    default: CardGenerationJobStatus.PENDING,
  })
  status: CardGenerationJobStatus;

  /** Google Drive file ID of the uploaded ZIP (set on completion) */
  @Column({ name: 'drive_file_id', type: 'varchar', length: 255, nullable: true })
  driveFileId?: string;

  /** Public shareable link returned to the institute admin */
  @Column({ name: 'drive_share_link', type: 'varchar', length: 1024, nullable: true })
  driveShareLink?: string;

  /** Google Drive file name stored */
  @Column({ name: 'drive_file_name', type: 'varchar', length: 512, nullable: true })
  driveFileName?: string;

  /** Cards successfully rendered */
  @Column({ name: 'success_count', type: 'int', default: 0 })
  successCount: number;

  /** Cards that failed to render */
  @Column({ name: 'fail_count', type: 'int', default: 0 })
  failCount: number;

  /** Credits refunded for failed renders */
  @Column({ name: 'refunded', type: 'decimal', precision: 10, scale: 2, default: 0 })
  refunded: number;

  /** ISO timestamp by which the frontend must complete upload (default: 2 hours from creation) */
  @Column({ name: 'expires_at', type: 'timestamp' })
  expiresAt: Date;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp' })
  updatedAt: Date;
}
