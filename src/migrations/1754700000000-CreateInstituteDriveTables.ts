import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateInstituteDriveTables1754700000000 implements MigrationInterface {
  name = 'CreateInstituteDriveTables1754700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ─── institute_drive_tokens ───────────────────────────────────────────────
    const tokensExists = await queryRunner.query(`
      SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'institute_drive_tokens'
    `);

    if (tokensExists.length === 0) {
      await queryRunner.query(`
        CREATE TABLE \`institute_drive_tokens\` (
          \`id\`                        BIGINT NOT NULL AUTO_INCREMENT,
          \`institute_id\`              BIGINT NOT NULL UNIQUE,
          \`connected_by_user_id\`      BIGINT NULL,
          \`google_email\`              VARCHAR(255) NULL,
          \`google_display_name\`       VARCHAR(255) NULL,
          \`google_profile_picture\`    VARCHAR(500) NULL,
          \`encrypted_refresh_token\`   TEXT NOT NULL,
          \`granted_scopes\`            VARCHAR(500) NULL,
          \`access_token_expires_at\`   DATETIME NULL,
          \`is_active\`                 TINYINT(1) NOT NULL DEFAULT 1,
          \`last_used_at\`              DATETIME NULL,
          \`refresh_count\`             INT NOT NULL DEFAULT 0,
          \`consecutive_failures\`      INT NOT NULL DEFAULT 0,
          \`last_failure_reason\`       VARCHAR(500) NULL,
          \`authorized_ip\`             VARCHAR(100) NULL,
          \`authorized_user_agent\`     VARCHAR(500) NULL,
          \`created_at\`                DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
          \`updated_at\`                DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
          PRIMARY KEY (\`id\`),
          UNIQUE KEY \`idx_inst_drive_institute\` (\`institute_id\`),
          KEY \`idx_inst_drive_active\` (\`is_active\`, \`institute_id\`),
          KEY \`idx_inst_drive_expires\` (\`access_token_expires_at\`),
          CONSTRAINT \`fk_inst_drive_token_institute\`
            FOREIGN KEY (\`institute_id\`) REFERENCES \`institutes\` (\`id\`) ON DELETE CASCADE,
          CONSTRAINT \`fk_inst_drive_token_user\`
            FOREIGN KEY (\`connected_by_user_id\`) REFERENCES \`users\` (\`id\`) ON DELETE SET NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
    }

    // ─── institute_drive_files ────────────────────────────────────────────────
    const filesExists = await queryRunner.query(`
      SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'institute_drive_files'
    `);

    if (filesExists.length === 0) {
      await queryRunner.query(`
        CREATE TABLE \`institute_drive_files\` (
          \`id\`                    BIGINT NOT NULL AUTO_INCREMENT,
          \`institute_id\`          BIGINT NOT NULL,
          \`uploaded_by_user_id\`   BIGINT NULL,
          \`drive_file_id\`         VARCHAR(255) NOT NULL,
          \`drive_web_view_link\`   VARCHAR(500) NULL,
          \`drive_web_content_link\` VARCHAR(500) NULL,
          \`drive_folder_id\`       VARCHAR(255) NULL,
          \`drive_folder_path\`     VARCHAR(1000) NULL,
          \`file_name\`             VARCHAR(500) NOT NULL,
          \`mime_type\`             VARCHAR(100) NOT NULL,
          \`file_size\`             BIGINT NULL,
          \`purpose\`               VARCHAR(50) NOT NULL DEFAULT 'GENERAL',
          \`reference_type\`        VARCHAR(100) NULL,
          \`reference_id\`          BIGINT NULL,
          \`subject_name\`          VARCHAR(255) NULL,
          \`class_name\`            VARCHAR(255) NULL,
          \`grade\`                 INT NULL,
          \`sharing_permissions\`   TEXT NULL,
          \`is_active\`             TINYINT(1) NOT NULL DEFAULT 1,
          \`uploaded_at\`           DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
          \`updated_at\`            DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
          PRIMARY KEY (\`id\`),
          KEY \`idx_inst_file_institute\`  (\`institute_id\`),
          KEY \`idx_inst_file_drive_id\`   (\`drive_file_id\`),
          KEY \`idx_inst_file_purpose\`    (\`purpose\`),
          KEY \`idx_inst_file_reference\`  (\`reference_type\`, \`reference_id\`),
          KEY \`idx_inst_file_uploader\`   (\`uploaded_by_user_id\`),
          CONSTRAINT \`fk_inst_file_institute\`
            FOREIGN KEY (\`institute_id\`) REFERENCES \`institutes\` (\`id\`) ON DELETE CASCADE,
          CONSTRAINT \`fk_inst_file_user\`
            FOREIGN KEY (\`uploaded_by_user_id\`) REFERENCES \`users\` (\`id\`) ON DELETE SET NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS \`institute_drive_files\``);
    await queryRunner.query(`DROP TABLE IF EXISTS \`institute_drive_tokens\``);
  }
}
