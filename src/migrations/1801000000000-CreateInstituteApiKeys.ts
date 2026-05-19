import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateInstituteApiKeys1801000000000 implements MigrationInterface {
  name = 'CreateInstituteApiKeys1801000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE \`institute_api_keys\` (
        \`id\`           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        \`institute_id\` VARCHAR(36)     NOT NULL,
        \`name\`         VARCHAR(100)    NOT NULL,
        \`key_hash\`     VARCHAR(64)     NOT NULL,
        \`key_prefix\`   VARCHAR(12)     NOT NULL,
        \`scopes\`       JSON            NOT NULL DEFAULT (JSON_ARRAY()),
        \`is_active\`    TINYINT(1)      NOT NULL DEFAULT 1,
        \`created_by\`   BIGINT UNSIGNED          DEFAULT NULL,
        \`last_used_at\` TIMESTAMP                DEFAULT NULL,
        \`expires_at\`   TIMESTAMP                DEFAULT NULL,
        \`created_at\`   TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updated_at\`   TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`UQ_institute_api_keys_hash\` (\`key_hash\`),
        KEY \`IDX_institute_api_keys_institute_active\` (\`institute_id\`, \`is_active\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS \`institute_api_keys\``);
  }
}
