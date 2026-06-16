import {
  Entity, Column, Index, PrimaryGeneratedColumn,
  CreateDateColumn, UpdateDateColumn,
} from 'typeorm';

export enum DesignTemplateStatus {
  DRAFT     = 'DRAFT',
  PENDING   = 'PENDING',
  APPROVED  = 'APPROVED',
  REJECTED  = 'REJECTED',
  SUSPENDED = 'SUSPENDED',
}

export enum DesignOutputType {
  PNG      = 'PNG',
  PDF      = 'PDF',
  WHATSAPP = 'WHATSAPP',
  PRINT    = 'PRINT',
}

@Entity('design_templates')
@Index('idx_dt_institute', ['instituteId'])
@Index('idx_dt_status', ['status'])
@Index('idx_dt_institute_status', ['instituteId', 'status'])
export class DesignTemplateEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'institute_id', type: 'varchar', length: 36 })
  instituteId: string;

  @Column({ name: 'name', type: 'varchar', length: 255 })
  name: string;

  /** Full CardTemplate JSON (elements, cardWidth/Height, backgroundImageUrl, overlayImageUrl) */
  @Column({ name: 'definition', type: 'json' })
  definition: Record<string, any>;

  @Column({
    name: 'status',
    type: 'enum',
    enum: DesignTemplateStatus,
    default: DesignTemplateStatus.DRAFT,
  })
  status: DesignTemplateStatus;

  // ── Per-output credit prices (set by system admin on approval) ──────────────
  @Column({ name: 'cost_png', type: 'decimal', precision: 10, scale: 2, default: 0 })
  costPng: number;

  @Column({ name: 'cost_pdf', type: 'decimal', precision: 10, scale: 2, default: 0 })
  costPdf: number;

  @Column({ name: 'cost_whatsapp', type: 'decimal', precision: 10, scale: 2, default: 0 })
  costWhatsapp: number;

  @Column({ name: 'cost_print', type: 'decimal', precision: 10, scale: 2, default: 0 })
  costPrint: number;

  // ── Which outputs the admin enabled ─────────────────────────────────────────
  @Column({ name: 'allow_png', type: 'boolean', default: false })
  allowPng: boolean;

  @Column({ name: 'allow_pdf', type: 'boolean', default: false })
  allowPdf: boolean;

  @Column({ name: 'allow_whatsapp', type: 'boolean', default: false })
  allowWhatsapp: boolean;

  @Column({ name: 'allow_print', type: 'boolean', default: false })
  allowPrint: boolean;

  /** S3 TTL (days) for WhatsApp-destined uploaded images — set by system admin */
  @Column({ name: 'whatsapp_ttl_days', type: 'int', nullable: true })
  whatsappTtlDays?: number;

  // ── Approval/rejection metadata ──────────────────────────────────────────────
  @Column({ name: 'rejection_reason', type: 'text', nullable: true })
  rejectionReason?: string;

  @Column({ name: 'admin_notes', type: 'text', nullable: true })
  adminNotes?: string;

  @Column({ name: 'reviewed_by', type: 'varchar', length: 36, nullable: true })
  reviewedBy?: string;

  @Column({ name: 'reviewed_at', type: 'timestamp', nullable: true })
  reviewedAt?: Date;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp' })
  updatedAt: Date;
}
