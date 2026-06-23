import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds institute-level user-ID auto-generation config to the institutes table:
 *   user_id_auto_generate  BOOLEAN  — when true, system generates userIdByInstitute;
 *                                     admins cannot enter it manually.
 *   user_id_prefix         VARCHAR  — prefix prepended before the auto-incremented counter
 *                                     (e.g. "RC" → "RC001", "RC002", ...).
 *
 * Idempotent — checks column existence before altering.
 */
export class AddUserIdAutoGenerateToInstitute1826000000000 implements MigrationInterface {
  name = 'AddUserIdAutoGenerateToInstitute1826000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const hasAutoGen = await queryRunner.hasColumn('institutes', 'user_id_auto_generate');
    if (!hasAutoGen) {
      await queryRunner.query(
        `ALTER TABLE \`institutes\` ADD COLUMN \`user_id_auto_generate\` tinyint(1) NOT NULL DEFAULT 0`,
      );
    }
    const hasPrefix = await queryRunner.hasColumn('institutes', 'user_id_prefix');
    if (!hasPrefix) {
      await queryRunner.query(
        `ALTER TABLE \`institutes\` ADD COLUMN \`user_id_prefix\` varchar(20) NULL`,
      );
    }
    const hasCounter = await queryRunner.hasColumn('institutes', 'user_id_last_counter');
    if (!hasCounter) {
      await queryRunner.query(
        `ALTER TABLE \`institutes\` ADD COLUMN \`user_id_last_counter\` int UNSIGNED NULL DEFAULT NULL`,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const hasCounter = await queryRunner.hasColumn('institutes', 'user_id_last_counter');
    if (hasCounter) {
      await queryRunner.query(`ALTER TABLE \`institutes\` DROP COLUMN \`user_id_last_counter\``);
    }
    const hasPrefix = await queryRunner.hasColumn('institutes', 'user_id_prefix');
    if (hasPrefix) {
      await queryRunner.query(`ALTER TABLE \`institutes\` DROP COLUMN \`user_id_prefix\``);
    }
    const hasAutoGen = await queryRunner.hasColumn('institutes', 'user_id_auto_generate');
    if (hasAutoGen) {
      await queryRunner.query(`ALTER TABLE \`institutes\` DROP COLUMN \`user_id_auto_generate\``);
    }
  }
}
