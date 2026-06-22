import {
  Entity,
  PrimaryColumn,
  Column,
  Index,
  UpdateDateColumn,
} from 'typeorm';

/**
 * One row per WhatsApp phone number.
 *
 * Created ONLY when the user sends an inbound message (reply, button tap, etc.).
 * Never created on outbound sends — no outbound data stored here.
 *
 * "Thanks" button tap → INSERT … ON DUPLICATE KEY UPDATE (upsert on PK).
 * Any other inbound   → same upsert, thanks_count unchanged.
 *
 * session_expires_at = last_reply_at + 24h (Meta free-messaging window).
 */
@Entity('whatsapp_contact_sessions')
export class WhatsAppContactSessionEntity {
  /** E.164-normalised phone — primary key, one row per number. */
  @PrimaryColumn({ name: 'phone', type: 'varchar', length: 20 })
  phone: string;

  /**
   * System user ID — NULL when this phone has never logged into the app.
   * Resolved once on first inbound and cached here.
   */
  @Column({ name: 'user_id', type: 'varchar', length: 64, nullable: true })
  @Index('idx_wcs_user_id')
  userId: string | null;

  /** When the user first replied to any of our messages. */
  @Column({ name: 'first_reply_at', type: 'datetime' })
  firstReplyAt: Date;

  /** Timestamp of the most recent inbound message. */
  @Column({ name: 'last_reply_at', type: 'datetime' })
  lastReplyAt: Date;

  /**
   * last_reply_at + 24 h — the Meta free-messaging window deadline.
   * While NOW() < sessionExpiresAt, free session messages can be sent.
   */
  @Column({ name: 'session_expires_at', type: 'datetime' })
  @Index('idx_wcs_session_expires')
  sessionExpiresAt: Date;

  /** Count of "🙏 Thanks!" button taps received. */
  @Column({ name: 'thanks_count', type: 'int', unsigned: true, default: 0 })
  thanksCount: number;

  /** Total inbound messages received from this number. */
  @Column({ name: 'total_replies', type: 'int', unsigned: true, default: 1 })
  totalReplies: number;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
