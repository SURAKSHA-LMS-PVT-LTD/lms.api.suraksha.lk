import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Creates attendance_notification_deliveries — the generic per-channel
 * notification delivery log shared across features.
 *
 * context_type discriminates the originating feature:
 *   'attendance' → attendance notification to parent
 *   'design'     → design WhatsApp delivery (Phase 2)
 *   'sms_bulk'   → per-recipient delivery for bulk SMS campaigns
 *
 * context_id is the PK of the originating record (varchar to support both
 * bigint IDs and UUIDs without a schema change when new features are added).
 *
 * provider_message_id captures the external reference from each channel:
 *   sms      → SMSlenz campaign_id
 *   whatsapp → Facebook Graph API wamid (messages[0].id)
 *   email    → SMTP messageId header
 *   telegram → Telegram message_id
 *   push     → synthetic push_<ts>_<userId>
 */
export class CreateAttendanceNotificationDeliveries1819000000000 implements MigrationInterface {
  name = 'CreateAttendanceNotificationDeliveries1819000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const tableExists = await queryRunner.hasTable('attendance_notification_deliveries');
    if (tableExists) {
      console.log('[CreateAttendanceNotificationDeliveries] Table already exists — skipping.');
      return;
    }

    await queryRunner.query(`
      CREATE TABLE attendance_notification_deliveries (
        id                  BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,

        -- Context (which feature + which originating record)
        context_type        VARCHAR(32)  NOT NULL COMMENT 'attendance | design | sms_bulk',
        context_id          VARCHAR(64)  NULL     COMMENT 'PK of the originating record (bigint str or UUID)',

        -- Recipient
        recipient_id        VARCHAR(64)  NOT NULL COMMENT 'User ID of the notification recipient',
        institute_id        VARCHAR(64)  NOT NULL COMMENT 'Denormalized institute ID',

        -- Delivery
        channel             VARCHAR(16)  NOT NULL COMMENT 'sms | whatsapp | email | telegram | push',
        success             TINYINT(1)   NOT NULL DEFAULT 0 COMMENT '1=delivered 0=failed',
        provider_message_id VARCHAR(255) NULL     COMMENT 'Provider-returned message/campaign ID',
        attempts            TINYINT UNSIGNED NOT NULL DEFAULT 1 COMMENT 'Total attempts including retries',
        error_message       TEXT         NULL     COMMENT 'Last error message on failure',
        sent_at             TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'When the notification was attempted',

        PRIMARY KEY (id),
        INDEX IDX_AND_context         (context_type, context_id),
        INDEX IDX_AND_institute_channel (institute_id, channel),
        INDEX IDX_AND_recipient_channel (recipient_id, channel)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        COMMENT='Generic per-channel delivery tracking for system notifications'
    `);

    console.log('[CreateAttendanceNotificationDeliveries] Table created successfully.');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS attendance_notification_deliveries`);
    console.log('[CreateAttendanceNotificationDeliveries] Table dropped.');
  }
}
