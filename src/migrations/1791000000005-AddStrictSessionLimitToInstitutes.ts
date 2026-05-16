import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Add is_strict_session_limit column to institutes.
 *
 * When false (default / "relaxed"): reaching the device limit auto-kicks the
 * oldest session so the new login always succeeds. The displaced session
 * appears in history as REPLACED_BY_NEW_SESSION.
 *
 * When true ("strict"): reaching the device limit blocks the new login with
 * a 403. The user must ask the institute admin to revoke an existing session
 * before they can log in on a new device.
 */
export class AddStrictSessionLimitToInstitutes1791000000005 implements MigrationInterface {
  name = 'AddStrictSessionLimitToInstitutes1791000000005';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const [row] = await queryRunner.query(
      `SELECT COUNT(*) AS cnt FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = 'institutes'
         AND COLUMN_NAME = 'is_strict_session_limit'`,
    );
    if (parseInt(row.cnt, 10) === 0) {
      await queryRunner.query(
        `ALTER TABLE \`institutes\`
           ADD COLUMN \`is_strict_session_limit\` TINYINT(1) NOT NULL DEFAULT 0
             COMMENT 'When true, new login is blocked if device limit reached. When false, oldest session is auto-kicked.'`,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`institutes\` DROP COLUMN \`is_strict_session_limit\``,
    );
  }
}
