import { Entity, PrimaryGeneratedColumn, Column, Index, CreateDateColumn } from 'typeorm';

/**
 * Audit record of a WhatsApp broadcast send.
 *
 * Captures the filter snapshot that defined the audience, the message body,
 * and the delivery breakdown — including how many recipients had an OPEN
 * session window (since in a large selection most sessions may be closed, the
 * admin needs to see that explicitly).
 */
@Entity('whatsapp_campaigns')
@Index('idx_wa_campaign_created', ['createdAt'])
export class WhatsAppCampaignEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 160, nullable: true })
  name?: string;

  // The message body actually sent (pre-substitution, with {placeholders}).
  @Column({ type: 'text' })
  body: string;

  @Column({ name: 'template_id', type: 'varchar', length: 36, nullable: true })
  templateId?: string;

  // Snapshot of the audience filter used (for audit / re-run).
  @Column({ name: 'filter_snapshot', type: 'json', nullable: true })
  filterSnapshot?: Record<string, any>;

  // ── Delivery breakdown ──
  @Column({ name: 'total_matched', type: 'int', default: 0 })
  totalMatched: number; // audience size the filter resolved to

  @Column({ name: 'total_targeted', type: 'int', default: 0 })
  totalTargeted: number; // actually attempted (had a phone)

  @Column({ name: 'sent_count', type: 'int', default: 0 })
  sentCount: number;

  @Column({ name: 'failed_count', type: 'int', default: 0 })
  failedCount: number;

  @Column({ name: 'skipped_no_phone', type: 'int', default: 0 })
  skippedNoPhone: number;

  @Column({ name: 'skipped_closed_session', type: 'int', default: 0 })
  skippedClosedSession: number;

  // How many of the matched recipients had an OPEN session window at send time.
  @Column({ name: 'open_session_count', type: 'int', default: 0 })
  openSessionCount: number;

  @Column({ name: 'status', type: 'enum', enum: ['COMPLETED', 'PARTIAL', 'FAILED'], default: 'COMPLETED' })
  status: 'COMPLETED' | 'PARTIAL' | 'FAILED';

  @Column({ name: 'created_by', type: 'bigint', nullable: true })
  createdBy?: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
