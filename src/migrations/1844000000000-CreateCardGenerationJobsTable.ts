import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateCardGenerationJobsTable1844000000000 implements MigrationInterface {
  name = 'CreateCardGenerationJobsTable1844000000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`card_generation_jobs\` (
        \`id\`                   VARCHAR(36)      NOT NULL,
        \`institute_id\`         VARCHAR(36)      NOT NULL,
        \`generation_record_id\` VARCHAR(36)      NOT NULL,
        \`requested_by\`         VARCHAR(36)      NOT NULL,
        \`template_id\`          VARCHAR(36)      NOT NULL,
        \`template_name\`        VARCHAR(255)     NOT NULL,
        \`user_count\`           INT              NOT NULL,
        \`unit_cost\`            DECIMAL(10,2)    NOT NULL,
        \`total_cost\`           DECIMAL(10,2)    NOT NULL,
        \`status\`               ENUM('PENDING','COMPLETED','FAILED','EXPIRED') NOT NULL DEFAULT 'PENDING',
        \`drive_file_id\`        VARCHAR(255)     NULL,
        \`drive_share_link\`     VARCHAR(1024)    NULL,
        \`drive_file_name\`      VARCHAR(512)     NULL,
        \`success_count\`        INT              NOT NULL DEFAULT 0,
        \`fail_count\`           INT              NOT NULL DEFAULT 0,
        \`refunded\`             DECIMAL(10,2)    NOT NULL DEFAULT 0,
        \`expires_at\`           TIMESTAMP        NOT NULL,
        \`created_at\`           TIMESTAMP        NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updated_at\`           TIMESTAMP        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        INDEX \`idx_cgj_institute\`         (\`institute_id\`),
        INDEX \`idx_cgj_requested_by\`      (\`requested_by\`),
        INDEX \`idx_cgj_status\`            (\`status\`),
        INDEX \`idx_cgj_generation_record\` (\`generation_record_id\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS \`card_generation_jobs\``);
  }
}
