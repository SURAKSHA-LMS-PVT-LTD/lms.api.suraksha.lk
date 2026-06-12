import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateErrorReports1800500000000 implements MigrationInterface {
  name = 'CreateErrorReports1800500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`error_reports\` (
        \`id\`                  CHAR(36)         NOT NULL COMMENT 'UUID primary key',

        \`kind\`                ENUM('REACT_BOUNDARY','API_5XX','API_CLIENT','UNHANDLED_JS')
                                                 NOT NULL DEFAULT 'REACT_BOUNDARY',

        \`status\`              ENUM('NEW','VIEWED','FIXING','FIXED','IGNORED')
                                                 NOT NULL DEFAULT 'NEW',

        \`error_message\`       VARCHAR(500)     NOT NULL,
        \`error_stack\`         TEXT             NULL,
        \`component_stack\`     TEXT             NULL,

        \`http_status\`         INT              NULL,
        \`request_id\`          VARCHAR(100)     NULL,
        \`api_path\`            VARCHAR(1000)    NULL,

        \`page_url\`            VARCHAR(2000)    NOT NULL,
        \`user_agent\`          VARCHAR(500)     NOT NULL,
        \`app_version\`         VARCHAR(20)      NULL,
        \`platform\`            VARCHAR(20)      NULL,
        \`context\`             JSON             NULL,

        \`screenshot_data_url\` MEDIUMTEXT       NULL,

        \`user_id\`             BIGINT           NULL,
        \`admin_note\`          TEXT             NULL,
        \`resolved_by_user_id\` BIGINT           NULL,
        \`resolved_at\`         TIMESTAMP        NULL,

        \`created_at\`          TIMESTAMP        NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updated_at\`          TIMESTAMP        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

        PRIMARY KEY (\`id\`),
        KEY \`idx_error_reports_status\`     (\`status\`),
        KEY \`idx_error_reports_kind\`       (\`kind\`),
        KEY \`idx_error_reports_user\`       (\`user_id\`),
        KEY \`idx_error_reports_created\`    (\`created_at\`),
        KEY \`idx_error_reports_request_id\` (\`request_id\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS \`error_reports\``);
  }
}
