import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * WhatsApp contact session tracker.
 *
 * ONE row per phone number — created only when a user REPLIES (not on outbound).
 * "Thanks" button tap → single INSERT … ON DUPLICATE KEY UPDATE on the PK.
 * Any other inbound → same upsert, thanks_count unchanged.
 *
 * session_expires_at = last_reply_at + 24h (Meta free-messaging window).
 */
export class CreateWhatsAppContactSessions1812000000000 implements MigrationInterface {
  name = 'CreateWhatsAppContactSessions1812000000000';

  public async up(qr: QueryRunner): Promise<void> {
    const hasTable = await qr.hasTable('whatsapp_contact_sessions');
    if (hasTable) return;

    await qr.query(`
      CREATE TABLE whatsapp_contact_sessions (
        phone               VARCHAR(20)   NOT NULL,
        user_id             VARCHAR(64)   NULL        COMMENT 'users.id — NULL if phone not registered in system',
        first_reply_at      DATETIME      NOT NULL    COMMENT 'When the user first replied to us',
        last_reply_at       DATETIME      NOT NULL    COMMENT 'Most recent inbound message from user',
        session_expires_at  DATETIME      NOT NULL    COMMENT 'last_reply_at + 24h — Meta free-messaging window deadline',
        thanks_count        INT UNSIGNED  NOT NULL DEFAULT 0  COMMENT 'How many Thanks button taps received',
        total_replies       INT UNSIGNED  NOT NULL DEFAULT 1  COMMENT 'Total inbound messages from this number',
        updated_at          DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (phone),
        INDEX idx_wcs_user_id         (user_id),
        INDEX idx_wcs_session_expires (session_expires_at),
        INDEX idx_wcs_last_reply      (last_reply_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        COMMENT='One row per WhatsApp phone — created on first inbound reply, tracks session window'
    `);
  }

  public async down(qr: QueryRunner): Promise<void> {
    await qr.query(`DROP TABLE IF EXISTS whatsapp_contact_sessions`);
  }
}
