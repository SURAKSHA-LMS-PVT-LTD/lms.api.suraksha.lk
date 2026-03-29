import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateInstituteHouseTables1753000000000 implements MigrationInterface {
  name = 'CreateInstituteHouseTables1753000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── 1. institute_house table ──────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE \`institute_house\` (
        \`id\`           BIGINT NOT NULL AUTO_INCREMENT,
        \`institute_id\` BIGINT NOT NULL,
        \`name\`         VARCHAR(100) NOT NULL,
        \`color\`        VARCHAR(30) NULL,
        \`description\`  TEXT NULL,
        \`image_url\`    VARCHAR(500) NULL,
        \`is_active\`    TINYINT(1) NOT NULL DEFAULT 1,
        \`created_by\`   BIGINT NULL,
        \`created_at\`   TIMESTAMP NOT NULL,
        \`updated_at\`   TIMESTAMP NOT NULL,
        PRIMARY KEY (\`id\`),
        INDEX \`idx_institute_house_institute\` (\`institute_id\`),
        INDEX \`idx_institute_house_active\` (\`institute_id\`, \`is_active\`),
        CONSTRAINT \`fk_institute_house_institute\`
          FOREIGN KEY (\`institute_id\`) REFERENCES \`institutes\`(\`id\`) ON DELETE CASCADE,
        CONSTRAINT \`fk_institute_house_creator\`
          FOREIGN KEY (\`created_by\`) REFERENCES \`users\`(\`id\`) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // ── 2. institute_house_member table ───────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE \`institute_house_member\` (
        \`id\`                BIGINT NOT NULL AUTO_INCREMENT,
        \`house_id\`          BIGINT NOT NULL,
        \`institute_id\`      BIGINT NOT NULL,
        \`user_id\`           BIGINT NOT NULL,
        \`enrolled_by\`       BIGINT NULL,
        \`enrollment_method\` ENUM('manual','auto','self') NOT NULL DEFAULT 'manual',
        \`is_active\`         TINYINT(1) NOT NULL DEFAULT 1,
        \`created_at\`        TIMESTAMP NOT NULL,
        \`updated_at\`        TIMESTAMP NOT NULL,
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`uq_house_member\` (\`house_id\`, \`user_id\`, \`institute_id\`),
        INDEX \`idx_house_member_house\` (\`house_id\`, \`is_active\`),
        INDEX \`idx_house_member_user\` (\`user_id\`, \`institute_id\`),
        INDEX \`idx_house_member_institute\` (\`institute_id\`),
        CONSTRAINT \`fk_house_member_house\`
          FOREIGN KEY (\`house_id\`) REFERENCES \`institute_house\`(\`id\`) ON DELETE CASCADE,
        CONSTRAINT \`fk_house_member_institute\`
          FOREIGN KEY (\`institute_id\`) REFERENCES \`institutes\`(\`id\`) ON DELETE CASCADE,
        CONSTRAINT \`fk_house_member_user\`
          FOREIGN KEY (\`user_id\`) REFERENCES \`users\`(\`id\`) ON DELETE CASCADE,
        CONSTRAINT \`fk_house_member_enrolled_by\`
          FOREIGN KEY (\`enrolled_by\`) REFERENCES \`users\`(\`id\`) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // ── 3. Add house_id column to institute_user ──────────────────────────
    await queryRunner.query(`
      ALTER TABLE \`institute_user\`
        ADD COLUMN \`house_id\` BIGINT NULL AFTER \`image_verified_by\`,
        ADD INDEX \`idx_institute_user_house\` (\`house_id\`),
        ADD CONSTRAINT \`fk_institute_user_house\`
          FOREIGN KEY (\`house_id\`) REFERENCES \`institute_house\`(\`id\`) ON DELETE SET NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Remove FK + column from institute_user
    await queryRunner.query(`
      ALTER TABLE \`institute_user\`
        DROP FOREIGN KEY \`fk_institute_user_house\`,
        DROP INDEX \`idx_institute_user_house\`,
        DROP COLUMN \`house_id\`
    `);

    // Drop child table first (FK references institute_house)
    await queryRunner.query(`DROP TABLE IF EXISTS \`institute_house_member\``);

    // Drop parent table
    await queryRunner.query(`DROP TABLE IF EXISTS \`institute_house\``);
  }
}
