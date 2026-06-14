import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateDesignTemplatesTable1806000000000 implements MigrationInterface {
  name = 'CreateDesignTemplatesTable1806000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const exists = await queryRunner.hasTable('design_templates');
    if (exists) return;

    await queryRunner.query(`
      CREATE TABLE \`design_templates\` (
        \`id\`                VARCHAR(36)     NOT NULL,
        \`institute_id\`      VARCHAR(36)     NOT NULL,
        \`name\`              VARCHAR(255)    NOT NULL,
        \`definition\`        JSON            NOT NULL,
        \`status\`            ENUM('PENDING','APPROVED','REJECTED','SUSPENDED')
                              NOT NULL DEFAULT 'PENDING',
        \`cost_png\`          DECIMAL(10,2)   NOT NULL DEFAULT 0,
        \`cost_pdf\`          DECIMAL(10,2)   NOT NULL DEFAULT 0,
        \`cost_whatsapp\`     DECIMAL(10,2)   NOT NULL DEFAULT 0,
        \`cost_print\`        DECIMAL(10,2)   NOT NULL DEFAULT 0,
        \`allow_png\`         TINYINT(1)      NOT NULL DEFAULT 0,
        \`allow_pdf\`         TINYINT(1)      NOT NULL DEFAULT 0,
        \`allow_whatsapp\`    TINYINT(1)      NOT NULL DEFAULT 0,
        \`allow_print\`       TINYINT(1)      NOT NULL DEFAULT 0,
        \`whatsapp_ttl_days\` INT             NULL,
        \`rejection_reason\`  TEXT            NULL,
        \`admin_notes\`       TEXT            NULL,
        \`reviewed_by\`       VARCHAR(36)     NULL,
        \`reviewed_at\`       TIMESTAMP       NULL,
        \`created_at\`        TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updated_at\`        TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        INDEX \`idx_dt_institute\` (\`institute_id\`),
        INDEX \`idx_dt_status\` (\`status\`),
        INDEX \`idx_dt_institute_status\` (\`institute_id\`, \`status\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS \`design_templates\``);
  }
}
