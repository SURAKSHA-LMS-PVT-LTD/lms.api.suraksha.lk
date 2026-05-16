import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migrate institute_login_sessions.institute_id from BIGINT to VARCHAR(36) UUID.
 *
 * The institutes table was already migrated to UUID primary keys in migration
 * 1790000000001-MigrateInstitutesToUUID. The institute_login_sessions table was
 * accidentally omitted from that migration, leaving its institute_id as BIGINT.
 * This causes all admin session queries to return empty results because UUID
 * strings like "e20359c4-..." never match BIGINT column values.
 *
 * Since sessions are ephemeral (short-lived refresh tokens), existing rows
 * cannot be backfilled — the old BIGINT→UUID mapping is gone. We truncate the
 * table and change the column type so new sessions work correctly.
 */
export class MigrateInstituteLoginSessionsToUUID1791000000004 implements MigrationInterface {
  name = 'MigrateInstituteLoginSessionsToUUID1791000000004';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Check current column type
    const cols: any[] = await queryRunner.query(
      `SELECT DATA_TYPE, COLUMN_TYPE FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = 'institute_login_sessions'
         AND COLUMN_NAME = 'institute_id'`,
    );

    if (!cols.length) {
      // Table doesn't exist yet — nothing to do
      return;
    }

    const currentType = (cols[0]?.DATA_TYPE || '').toLowerCase();
    if (currentType === 'varchar') {
      // Already migrated
      return;
    }

    // Drop indexes that reference institute_id before altering
    const indexes: any[] = await queryRunner.query(
      `SELECT INDEX_NAME FROM INFORMATION_SCHEMA.STATISTICS
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = 'institute_login_sessions'
         AND COLUMN_NAME = 'institute_id'
         AND INDEX_NAME != 'PRIMARY'`,
    );
    const dropped = new Set<string>();
    for (const idx of indexes) {
      if (!dropped.has(idx.INDEX_NAME)) {
        try {
          await queryRunner.query(
            `ALTER TABLE \`institute_login_sessions\` DROP INDEX \`${idx.INDEX_NAME}\``,
          );
          dropped.add(idx.INDEX_NAME);
        } catch { /* ignore */ }
      }
    }

    // Sessions with old BIGINT institute_id values are unresolvable — truncate
    await queryRunner.query(`TRUNCATE TABLE \`institute_login_sessions\``);

    // Change institute_id from BIGINT to VARCHAR(36)
    await queryRunner.query(
      `ALTER TABLE \`institute_login_sessions\`
         MODIFY COLUMN \`institute_id\` VARCHAR(36) NOT NULL`,
    );

    // Restore composite indexes
    try {
      await queryRunner.query(
        `CREATE INDEX \`idx_institute_user\` ON \`institute_login_sessions\` (institute_id, user_id)`,
      );
    } catch { /* already exists */ }

    try {
      await queryRunner.query(
        `CREATE INDEX \`idx_institute_active\` ON \`institute_login_sessions\` (institute_id, is_active)`,
      );
    } catch { /* already exists */ }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Revert is destructive — sessions will be lost either way
    await queryRunner.query(`TRUNCATE TABLE \`institute_login_sessions\``);
    await queryRunner.query(
      `ALTER TABLE \`institute_login_sessions\`
         MODIFY COLUMN \`institute_id\` BIGINT UNSIGNED NOT NULL`,
    );
  }
}
