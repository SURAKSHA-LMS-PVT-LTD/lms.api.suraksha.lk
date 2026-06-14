import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateDesignGenerationRecords1806000000001 implements MigrationInterface {
  name = 'CreateDesignGenerationRecords1806000000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const exists = await queryRunner.hasTable('design_generation_records');
    if (exists) return;

    await queryRunner.query(`
      CREATE TABLE \`design_generation_records\` (
        \`id\`                     VARCHAR(36)   NOT NULL,
        \`institute_id\`           VARCHAR(36)   NOT NULL,
        \`template_id\`            VARCHAR(36)   NOT NULL,
        \`output_type\`            ENUM('PNG','PDF','WHATSAPP','PRINT') NOT NULL,
        \`requested_by\`           VARCHAR(36)   NOT NULL,
        \`user_ids\`               JSON          NOT NULL,
        \`user_count\`             INT           NOT NULL,
        \`unit_cost\`              DECIMAL(10,2) NOT NULL,
        \`total_cost\`             DECIMAL(10,2) NOT NULL,
        \`refunded\`               DECIMAL(10,2) NOT NULL DEFAULT 0,
        \`status\`                 ENUM('COMPLETED','PARTIAL','FAILED') NOT NULL DEFAULT 'COMPLETED',
        \`success_count\`          INT           NOT NULL DEFAULT 0,
        \`fail_count\`             INT           NOT NULL DEFAULT 0,
        \`credit_transaction_id\`  VARCHAR(36)   NULL,
        \`result_reported\`        TINYINT(1)    NOT NULL DEFAULT 0,
        \`created_at\`             TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        INDEX \`idx_dgr_institute\` (\`institute_id\`),
        INDEX \`idx_dgr_template\` (\`template_id\`),
        INDEX \`idx_dgr_institute_created\` (\`institute_id\`, \`created_at\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS \`design_generation_records\``);
  }
}
