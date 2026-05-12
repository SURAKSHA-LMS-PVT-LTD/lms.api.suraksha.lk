import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSessionLimitsToInstitute1778327214046 implements MigrationInterface {
  name = 'AddSessionLimitsToInstitute1778327214046';

  private async columnExists(queryRunner: QueryRunner, table: string, column: string): Promise<boolean> {
    const [result] = await queryRunner.query(
      `SELECT COUNT(*) AS cnt FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
      [table, column],
    );
    return parseInt(result.cnt, 10) > 0;
  }

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await this.columnExists(queryRunner, 'institutes', 'is_session_limit_enabled'))) {
      await queryRunner.query(
        `ALTER TABLE \`institutes\` ADD COLUMN \`is_session_limit_enabled\` tinyint NOT NULL COMMENT 'Whether institute session limits are active' DEFAULT 0`,
      );
    }
    if (!(await this.columnExists(queryRunner, 'institutes', 'default_sessions_per_user_count'))) {
      await queryRunner.query(
        `ALTER TABLE \`institutes\` ADD COLUMN \`default_sessions_per_user_count\` int NOT NULL COMMENT 'Default device limit when new users enroll' DEFAULT 1`,
      );
    }
    if (!(await this.columnExists(queryRunner, 'institute_user', 'max_devices_per_user'))) {
      await queryRunner.query(
        `ALTER TABLE \`institute_user\` ADD COLUMN \`max_devices_per_user\` TINYINT UNSIGNED NULL DEFAULT NULL COMMENT 'Max simultaneous active institute sessions per user. NULL = unlimited.'`,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE \`institute_user\` DROP COLUMN \`max_devices_per_user\``);
    await queryRunner.query(`ALTER TABLE \`institutes\` DROP COLUMN \`default_sessions_per_user_count\``);
    await queryRunner.query(`ALTER TABLE \`institutes\` DROP COLUMN \`is_session_limit_enabled\``);
  }
}
