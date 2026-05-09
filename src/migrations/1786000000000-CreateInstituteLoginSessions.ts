import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateInstituteLoginSessions1786000000000 implements MigrationInterface {
  name = 'CreateInstituteLoginSessions1786000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── 1. institute_login_sessions table ────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`institute_login_sessions\` (
        \`id\`                  BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        \`institute_id\`        BIGINT UNSIGNED NOT NULL,
        \`user_id\`             BIGINT UNSIGNED NOT NULL,
        \`user_id_by_institute\` VARCHAR(100)    NOT NULL,
        \`token_hash\`          VARCHAR(64)     NOT NULL COMMENT 'SHA-256 of the refresh_token — used for revocation',
        \`device_label\`        VARCHAR(255)    NULL      COMMENT 'Browser / OS summary from User-Agent',
        \`ip_address\`          VARCHAR(45)     NULL,
        \`login_method\`        ENUM('SUBDOMAIN','CUSTOM_DOMAIN','MAIN') NOT NULL DEFAULT 'MAIN',
        \`scope_host\`          VARCHAR(255)    NULL COMMENT 'Subdomain or custom domain this session is scoped to',
        \`is_active\`           TINYINT(1)      NOT NULL DEFAULT 1,
        \`deactivated_reason\`  VARCHAR(100)    NULL,
        \`last_active_at\`      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`expires_at\`          DATETIME        NOT NULL,
        \`created_at\`          DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`uq_token_hash\` (\`token_hash\`),
        KEY \`idx_institute_user\` (\`institute_id\`, \`user_id\`),
        KEY \`idx_institute_active\` (\`institute_id\`, \`is_active\`),
        KEY \`idx_scope_host\` (\`scope_host\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // ── 2. max_devices_per_user column on institute_users ────────────────────
    // Defaults to NULL = unlimited.  Admin sets e.g. 1 to enforce single-device.
    try {
      await queryRunner.query(`
        ALTER TABLE \`institute_users\`
          ADD COLUMN \`max_devices_per_user\` TINYINT UNSIGNED NULL DEFAULT NULL
            COMMENT 'Max simultaneous active institute sessions per user. NULL = unlimited.'
      `);
    } catch (e) {
      // Column may already exist
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS \`institute_login_sessions\``);
    try {
      await queryRunner.query(`ALTER TABLE \`institute_users\` DROP COLUMN \`max_devices_per_user\``);
    } catch (e) {
      // Column may not exist
    }
  }
}
