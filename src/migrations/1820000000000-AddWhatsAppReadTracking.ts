import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds WhatsApp delivery-status tracking to attendance_notification_deliveries.
 *
 * Meta sends webhook "statuses" events for every message:
 *   status="sent"      → message accepted by Meta (already tracked via success flag)
 *   status="delivered" → reached recipient device → wa_delivered_at
 *   status="read"      → recipient opened message → wa_read_at
 *   status="failed"    → permanent failure        → wa_failed_at
 *
 * The join key is provider_message_id (wamid.xxx). UQ_AND_wamid makes every
 * webhook UPDATE a single-row indexed write — O(1) regardless of table size.
 *
 * ad_id stores which advertisement was shown, enabling per-ad analytics:
 * "how many users received / delivered / read messages that carried ad X?"
 */
export class AddWhatsAppReadTracking1820000000000 implements MigrationInterface {
  name = 'AddWhatsAppReadTracking1820000000000';

  public async up(qr: QueryRunner): Promise<void> {
    const existing = await this.existingColumns(qr);

    // Drop stale correlation_id column from cancelled earlier design
    if (existing.has('correlation_id')) {
      await qr.query(`ALTER TABLE attendance_notification_deliveries DROP COLUMN correlation_id`);
    }
    if (existing.has('read_at')) {
      await qr.query(`ALTER TABLE attendance_notification_deliveries DROP COLUMN read_at`);
    }

    if (!existing.has('ad_id')) {
      await qr.query(`
        ALTER TABLE attendance_notification_deliveries
          ADD COLUMN ad_id VARCHAR(64) NULL
            COMMENT 'Advertisement shown with this notification — NULL = no ad'
            AFTER provider_message_id
      `);
    }

    if (!existing.has('wa_delivered_at')) {
      await qr.query(`
        ALTER TABLE attendance_notification_deliveries
          ADD COLUMN wa_delivered_at DATETIME NULL
            COMMENT 'Meta webhook status=delivered timestamp'
            AFTER ad_id
      `);
    }

    if (!existing.has('wa_read_at')) {
      await qr.query(`
        ALTER TABLE attendance_notification_deliveries
          ADD COLUMN wa_read_at DATETIME NULL
            COMMENT 'Meta webhook status=read timestamp'
            AFTER wa_delivered_at
      `);
    }

    if (!existing.has('wa_failed_at')) {
      await qr.query(`
        ALTER TABLE attendance_notification_deliveries
          ADD COLUMN wa_failed_at DATETIME NULL
            COMMENT 'Meta webhook status=failed timestamp'
            AFTER wa_read_at
      `);
    }

    // Unique index on wamid — makes webhook UPDATE a single-row PK-equivalent lookup
    const hasWamidIdx = await this.hasIndex(qr, 'UQ_AND_wamid');
    if (!hasWamidIdx) {
      await qr.query(`
        CREATE UNIQUE INDEX UQ_AND_wamid
          ON attendance_notification_deliveries (provider_message_id)
      `);
    }

    // Composite for analytics: undelivered / unread per institute per channel
    const hasAnalyticsIdx = await this.hasIndex(qr, 'IDX_AND_institute_wa_status');
    if (!hasAnalyticsIdx) {
      await qr.query(`
        CREATE INDEX IDX_AND_institute_wa_status
          ON attendance_notification_deliveries (institute_id, channel, wa_delivered_at, wa_read_at)
      `);
    }

    // Per-ad analytics: "how many delivered/read for campaign X?"
    // Leads with channel so the WHERE channel='whatsapp' prefix is covered.
    const hasAdIdx = await this.hasIndex(qr, 'IDX_AND_channel_ad');
    if (!hasAdIdx) {
      await qr.query(`
        CREATE INDEX IDX_AND_channel_ad
          ON attendance_notification_deliveries (channel, ad_id)
      `);
    }

    // Date-range scans: WHERE channel='whatsapp' AND sent_at BETWEEN ... .
    // (DATE(sent_at) grouping still needs a temp table, but range filtering
    //  on sent_at is index-served by this.)
    const hasSentAtIdx = await this.hasIndex(qr, 'IDX_AND_channel_sent_at');
    if (!hasSentAtIdx) {
      await qr.query(`
        CREATE INDEX IDX_AND_channel_sent_at
          ON attendance_notification_deliveries (channel, sent_at)
      `);
    }
  }

  public async down(qr: QueryRunner): Promise<void> {
    await qr.query(`DROP INDEX IF EXISTS IDX_AND_channel_sent_at     ON attendance_notification_deliveries`);
    await qr.query(`DROP INDEX IF EXISTS IDX_AND_channel_ad          ON attendance_notification_deliveries`);
    await qr.query(`DROP INDEX IF EXISTS IDX_AND_institute_wa_status ON attendance_notification_deliveries`);
    await qr.query(`DROP INDEX IF EXISTS UQ_AND_wamid               ON attendance_notification_deliveries`);
    await qr.query(`ALTER TABLE attendance_notification_deliveries DROP COLUMN IF EXISTS wa_failed_at`);
    await qr.query(`ALTER TABLE attendance_notification_deliveries DROP COLUMN IF EXISTS wa_read_at`);
    await qr.query(`ALTER TABLE attendance_notification_deliveries DROP COLUMN IF EXISTS wa_delivered_at`);
    await qr.query(`ALTER TABLE attendance_notification_deliveries DROP COLUMN IF EXISTS ad_id`);
  }

  private async existingColumns(qr: QueryRunner): Promise<Set<string>> {
    const rows: any[] = await qr.query(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'attendance_notification_deliveries'`,
    );
    return new Set(rows.map(r => r.COLUMN_NAME));
  }

  private async hasIndex(qr: QueryRunner, name: string): Promise<boolean> {
    const rows: any[] = await qr.query(
      `SELECT 1 FROM INFORMATION_SCHEMA.STATISTICS
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = 'attendance_notification_deliveries'
         AND INDEX_NAME = ? LIMIT 1`,
      [name],
    );
    return rows.length > 0;
  }
}
