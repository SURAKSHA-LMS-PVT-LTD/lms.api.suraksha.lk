import { MigrationInterface, QueryRunner } from 'typeorm';
import { tableExists } from './utils/safe-table-ops';

/**
 * Standardize `user_id` columns that were declared VARCHAR (as if they held a UUID)
 * even though they actually store `users.id`, which is BIGINT. Confirmed no FK
 * constraints reference these columns (none exist), so widening the type is safe.
 *
 * Affected:
 *   - attendance_device_sessions.user_id  VARCHAR(64) -> BIGINT  (0 rows)
 *   - daily_ad_assignments.user_id        VARCHAR(36) -> BIGINT  (0 rows)
 *   - whatsapp_contact_sessions.user_id   VARCHAR(64) -> BIGINT  (has data; values
 *     are confirmed numeric strings written from `users.id`, e.g. "2")
 *
 * Idempotent: skips any table whose column is already BIGINT (or doesn't exist).
 */
export class FixUserIdColumnTypes1848000000000 implements MigrationInterface {
  name = 'FixUserIdColumnTypes1848000000000';

  private async columnType(queryRunner: QueryRunner, table: string, column: string): Promise<string | null> {
    const [row]: any[] = await queryRunner.query(
      `SELECT DATA_TYPE FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
      [table, column],
    );
    return row?.DATA_TYPE ?? null;
  }

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (await tableExists(queryRunner, 'attendance_device_sessions')) {
      const t = await this.columnType(queryRunner, 'attendance_device_sessions', 'user_id');
      if (t && t !== 'bigint') {
        await queryRunner.query(
          `ALTER TABLE \`attendance_device_sessions\` MODIFY COLUMN \`user_id\` BIGINT NULL`,
        );
      }
    }

    if (await tableExists(queryRunner, 'daily_ad_assignments')) {
      const t = await this.columnType(queryRunner, 'daily_ad_assignments', 'user_id');
      if (t && t !== 'bigint') {
        await queryRunner.query(
          `ALTER TABLE \`daily_ad_assignments\` MODIFY COLUMN \`user_id\` BIGINT NOT NULL`,
        );
      }
    }

    if (await tableExists(queryRunner, 'whatsapp_contact_sessions')) {
      const t = await this.columnType(queryRunner, 'whatsapp_contact_sessions', 'user_id');
      if (t && t !== 'bigint') {
        // Drop the index before widening — MySQL allows MODIFY under an indexed
        // column, but recreate defensively in case the engine requires it.
        try {
          await queryRunner.query(`ALTER TABLE \`whatsapp_contact_sessions\` DROP INDEX \`idx_wcs_user_id\``);
        } catch { /* index name may differ or already gone */ }
        await queryRunner.query(
          `ALTER TABLE \`whatsapp_contact_sessions\` MODIFY COLUMN \`user_id\` BIGINT NULL`,
        );
        await queryRunner.query(
          `CREATE INDEX \`idx_wcs_user_id\` ON \`whatsapp_contact_sessions\` (\`user_id\`)`,
        );
      }
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (await tableExists(queryRunner, 'attendance_device_sessions')) {
      await queryRunner.query(
        `ALTER TABLE \`attendance_device_sessions\` MODIFY COLUMN \`user_id\` VARCHAR(64) NULL`,
      );
    }
    if (await tableExists(queryRunner, 'daily_ad_assignments')) {
      await queryRunner.query(
        `ALTER TABLE \`daily_ad_assignments\` MODIFY COLUMN \`user_id\` VARCHAR(36) NOT NULL`,
      );
    }
    if (await tableExists(queryRunner, 'whatsapp_contact_sessions')) {
      try {
        await queryRunner.query(`ALTER TABLE \`whatsapp_contact_sessions\` DROP INDEX \`idx_wcs_user_id\``);
      } catch { /* ignore */ }
      await queryRunner.query(
        `ALTER TABLE \`whatsapp_contact_sessions\` MODIFY COLUMN \`user_id\` VARCHAR(64) NULL`,
      );
      await queryRunner.query(
        `CREATE INDEX \`idx_wcs_user_id\` ON \`whatsapp_contact_sessions\` (\`user_id\`)`,
      );
    }
  }
}
