import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  Index,
  CreateDateColumn,
} from 'typeorm';

/**
 * Per-channel delivery log for every system notification.
 *
 * One row per (attendance record, channel) send attempt.
 * Never on the hot path — always written fire-and-forget.
 *
 * WhatsApp status lifecycle (populated by webhook statuses[] events):
 *   sent_at       → row inserted when we call Meta API successfully
 *   wa_delivered_at → set when Meta webhook fires status="delivered"
 *   wa_read_at    → set when Meta webhook fires status="read"
 *   wa_failed_at  → set when Meta webhook fires status="failed"
 *
 * Lookup from webhook: provider_message_id (wamid.xxx) is the join key.
 * Index UQ_AND_wamid ensures O(1) UPDATE on every status event.
 */
@Entity('attendance_notification_deliveries')
@Index('IDX_AND_context',          ['contextType', 'contextId'])
@Index('IDX_AND_institute_channel', ['instituteId', 'channel'])
@Index('IDX_AND_recipient_channel', ['recipientId', 'channel'])
export class AttendanceNotificationDeliveryEntity {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string;

  // ── Context ──────────────────────────────────────────────────────────────

  @Column({ name: 'context_type', type: 'varchar', length: 32,
    comment: 'attendance | design | sms_bulk' })
  contextType: string;

  @Column({ name: 'context_id', type: 'varchar', length: 64, nullable: true,
    comment: 'PK of originating record (attendance_records.id, etc.)' })
  contextId: string | null;

  // ── Recipient ─────────────────────────────────────────────────────────────

  @Column({ name: 'recipient_id', type: 'varchar', length: 64,
    comment: 'User ID of the notification recipient' })
  recipientId: string;

  @Column({ name: 'institute_id', type: 'varchar', length: 64,
    comment: 'Institute ID — denormalized for fast per-institute analytics' })
  instituteId: string;

  // ── Delivery ──────────────────────────────────────────────────────────────

  @Column({ name: 'channel', type: 'varchar', length: 16,
    comment: 'sms | whatsapp | email | telegram | push' })
  channel: string;

  @Column({ name: 'success', type: 'tinyint', default: 0,
    comment: '1 = API accepted the message, 0 = API call failed' })
  success: boolean;

  /**
   * WhatsApp: wamid.xxx returned by Meta Graph API.
   * This is the join key for all webhook status updates.
   * Unique index allows O(1) UPDATE when webhook fires.
   */
  @Index('UQ_AND_wamid', { unique: true })
  @Column({ name: 'provider_message_id', type: 'varchar', length: 255, nullable: true,
    comment: 'wamid from Meta / campaign_id from SMS / SMTP messageId etc.' })
  providerMessageId: string | null;

  @Column({ name: 'attempts', type: 'tinyint', unsigned: true, default: 1,
    comment: 'Total send attempts including retries' })
  attempts: number;

  @Column({ name: 'error_message', type: 'text', nullable: true,
    comment: 'Last error on failure' })
  errorMessage: string | null;

  // ── Advertisement context ─────────────────────────────────────────────────

  /**
   * Advertisement ID shown with this notification (NULL = no ad).
   * Enables per-ad delivery/read analytics for system admins.
   */
  @Column({ name: 'ad_id', type: 'varchar', length: 64, nullable: true,
    comment: 'Advertisement shown alongside this notification — NULL means no ad' })
  adId: string | null;

  // ── WhatsApp status timestamps (set by webhook, all nullable) ─────────────

  /**
   * When Meta confirmed the message reached the recipient's device.
   * Set by webhook status="delivered".
   */
  @Column({ name: 'wa_delivered_at', type: 'datetime', nullable: true,
    comment: 'Meta webhook status=delivered timestamp' })
  waDeliveredAt: Date | null;

  /**
   * When the recipient opened/read the message.
   * Set by webhook status="read".
   */
  @Column({ name: 'wa_read_at', type: 'datetime', nullable: true,
    comment: 'Meta webhook status=read timestamp' })
  waReadAt: Date | null;

  /**
   * When Meta reported a final send failure (e.g. number not on WhatsApp).
   * Set by webhook status="failed".
   */
  @Column({ name: 'wa_failed_at', type: 'datetime', nullable: true,
    comment: 'Meta webhook status=failed timestamp' })
  waFailedAt: Date | null;

  @CreateDateColumn({ name: 'sent_at', comment: 'When we called the Meta API' })
  sentAt: Date;
}
