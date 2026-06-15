import { Entity, PrimaryGeneratedColumn, Column, Index, CreateDateColumn, UpdateDateColumn } from 'typeorm';

/**
 * A reusable WhatsApp message/flow template managed by system admins.
 *
 * - `body` is the session-message text, which may contain {placeholders}
 *   (e.g. {firstname}, {studentid}) substituted per-recipient at send time.
 * - `flowJson` optionally stores a Meta WhatsApp Flow JSON (like the rating-form
 *   example from the Flow Playground) for reference / future Flow-message
 *   delivery. We currently send free session messages, never paid templates.
 * - `placeholders` documents which variables this template expects, for the UI's
 *   click-to-insert chips.
 */
@Entity('whatsapp_message_templates')
@Index('idx_wa_tpl_active', ['isActive'])
export class WhatsAppMessageTemplateEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 120 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description?: string;

  // Session-message body with {placeholder} tokens.
  @Column({ type: 'text' })
  body: string;

  // Optional Meta Flow JSON (stored as text to preserve exact formatting).
  @Column({ name: 'flow_json', type: 'longtext', nullable: true })
  flowJson?: string;

  // Variable names this template uses, e.g. ["firstname","studentid"].
  @Column({ type: 'json', nullable: true })
  placeholders?: string[];

  @Column({ name: 'created_by', type: 'bigint', nullable: true })
  createdBy?: string;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
