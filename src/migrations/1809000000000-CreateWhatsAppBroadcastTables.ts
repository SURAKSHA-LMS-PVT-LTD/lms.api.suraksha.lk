import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Tables for the system-admin WhatsApp broadcast portal:
 *  - whatsapp_message_templates: reusable message/flow templates with {placeholders}
 *  - whatsapp_campaigns: audit trail of broadcasts with delivery breakdown
 */
export class CreateWhatsAppBroadcastTables1809000000000 implements MigrationInterface {
  async up(qr: QueryRunner): Promise<void> {
    const hasTemplates = await qr.hasTable('whatsapp_message_templates');
    if (!hasTemplates) {
      await qr.query(`
        CREATE TABLE whatsapp_message_templates (
          id           VARCHAR(36)  NOT NULL PRIMARY KEY,
          name         VARCHAR(120) NOT NULL,
          description  TEXT         NULL,
          body         TEXT         NOT NULL,
          flow_json    LONGTEXT     NULL,
          placeholders JSON         NULL,
          created_by   BIGINT       NULL,
          is_active    TINYINT(1)   NOT NULL DEFAULT 1,
          created_at   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          INDEX idx_wa_tpl_active (is_active)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
    }

    const hasCampaigns = await qr.hasTable('whatsapp_campaigns');
    if (!hasCampaigns) {
      await qr.query(`
        CREATE TABLE whatsapp_campaigns (
          id                     VARCHAR(36)  NOT NULL PRIMARY KEY,
          name                   VARCHAR(160) NULL,
          body                   TEXT         NOT NULL,
          template_id            VARCHAR(36)  NULL,
          filter_snapshot        JSON         NULL,
          total_matched          INT          NOT NULL DEFAULT 0,
          total_targeted         INT          NOT NULL DEFAULT 0,
          sent_count             INT          NOT NULL DEFAULT 0,
          failed_count           INT          NOT NULL DEFAULT 0,
          skipped_no_phone       INT          NOT NULL DEFAULT 0,
          skipped_closed_session INT          NOT NULL DEFAULT 0,
          open_session_count     INT          NOT NULL DEFAULT 0,
          status                 ENUM('COMPLETED','PARTIAL','FAILED') NOT NULL DEFAULT 'COMPLETED',
          created_by             BIGINT       NULL,
          created_at             TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
          INDEX idx_wa_campaign_created (created_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
    }
  }

  async down(qr: QueryRunner): Promise<void> {
    await qr.query(`DROP TABLE IF EXISTS whatsapp_campaigns`);
    await qr.query(`DROP TABLE IF EXISTS whatsapp_message_templates`);
  }
}
