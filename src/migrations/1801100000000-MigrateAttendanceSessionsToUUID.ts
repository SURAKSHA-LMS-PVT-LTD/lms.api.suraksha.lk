import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migrate institute_class_attendance_sessions.id and
 * institute_class_attendance_session_groups.id from BIGINT to UUID (VARCHAR 36).
 *
 * Also migrates FK columns that reference them:
 *   institute_class_attendance_sessions.session_group_id  → VARCHAR(36)
 *   attendance_records.class_session_id                   → VARCHAR(36)
 *
 * This migration is idempotent: each step checks current DB state before acting,
 * so it can be safely re-run after a partial failure.
 */
export class MigrateAttendanceSessionsToUUID1801100000000 implements MigrationInterface {
  name = 'MigrateAttendanceSessionsToUUID1801100000000';

  private async columnExists(queryRunner: QueryRunner, table: string, column: string): Promise<boolean> {
    const [row] = await queryRunner.query(`
      SELECT 1 FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?
      LIMIT 1
    `, [table, column]);
    return !!row;
  }

  private async columnType(queryRunner: QueryRunner, table: string, column: string): Promise<string | null> {
    const [row] = await queryRunner.query(`
      SELECT DATA_TYPE FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?
      LIMIT 1
    `, [table, column]);
    return row?.DATA_TYPE ?? null;
  }

  private async pkIsAutoIncrement(queryRunner: QueryRunner, table: string): Promise<boolean> {
    const [row] = await queryRunner.query(`
      SELECT EXTRA FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?
        AND COLUMN_KEY = 'PRI'
      LIMIT 1
    `, [table]);
    return (row?.EXTRA ?? '').toLowerCase().includes('auto_increment');
  }

  public async up(queryRunner: QueryRunner): Promise<void> {

    // ── 1. GROUPS — add temp columns if absent, backfill ─────────────────────

    if (!(await this.columnExists(queryRunner, 'institute_class_attendance_session_groups', 'uuid_new'))) {
      await queryRunner.query(`
        ALTER TABLE \`institute_class_attendance_session_groups\`
          ADD COLUMN \`uuid_new\` VARCHAR(36) NULL
      `);
    }
    if (!(await this.columnExists(queryRunner, 'institute_class_attendance_session_groups', 'old_id'))) {
      await queryRunner.query(`
        ALTER TABLE \`institute_class_attendance_session_groups\`
          ADD COLUMN \`old_id\` BIGINT NULL
      `);
    }

    // Only backfill rows that have not been filled yet (uuid_new IS NULL means not done)
    await queryRunner.query(`
      UPDATE \`institute_class_attendance_session_groups\`
      SET \`uuid_new\` = UUID(), \`old_id\` = \`id\`
      WHERE \`uuid_new\` IS NULL
    `);

    // ── 2. SESSIONS — add temp columns if absent, backfill ───────────────────

    if (!(await this.columnExists(queryRunner, 'institute_class_attendance_sessions', 'uuid_new'))) {
      await queryRunner.query(`
        ALTER TABLE \`institute_class_attendance_sessions\`
          ADD COLUMN \`uuid_new\` VARCHAR(36) NULL
      `);
    }
    if (!(await this.columnExists(queryRunner, 'institute_class_attendance_sessions', 'old_id'))) {
      await queryRunner.query(`
        ALTER TABLE \`institute_class_attendance_sessions\`
          ADD COLUMN \`old_id\` BIGINT NULL
      `);
    }
    if (!(await this.columnExists(queryRunner, 'institute_class_attendance_sessions', 'group_uuid_new'))) {
      await queryRunner.query(`
        ALTER TABLE \`institute_class_attendance_sessions\`
          ADD COLUMN \`group_uuid_new\` VARCHAR(36) NULL
      `);
    }

    await queryRunner.query(`
      UPDATE \`institute_class_attendance_sessions\`
      SET \`uuid_new\` = UUID(), \`old_id\` = \`id\`
      WHERE \`uuid_new\` IS NULL
    `);

    await queryRunner.query(`
      UPDATE \`institute_class_attendance_sessions\` s
      JOIN   \`institute_class_attendance_session_groups\` g
             ON s.session_group_id = g.old_id
      SET    s.group_uuid_new = g.uuid_new
      WHERE  s.group_uuid_new IS NULL AND s.session_group_id IS NOT NULL
    `);

    // ── 3. ATTENDANCE_RECORDS — backfill session UUID ─────────────────────────

    if (!(await this.columnExists(queryRunner, 'attendance_records', 'session_uuid_new'))) {
      await queryRunner.query(`
        ALTER TABLE \`attendance_records\`
          ADD COLUMN \`session_uuid_new\` VARCHAR(36) NULL
      `);
    }
    await queryRunner.query(`
      UPDATE \`attendance_records\` r
      JOIN   \`institute_class_attendance_sessions\` s
             ON r.class_session_id = s.old_id
      SET    r.session_uuid_new = s.uuid_new
      WHERE  r.session_uuid_new IS NULL AND r.class_session_id IS NOT NULL
    `);

    // ── 4. DROP FK CONSTRAINTS ────────────────────────────────────────────────

    const [fkSessionGroup]: any[] = await queryRunner.query(`
      SELECT CONSTRAINT_NAME FROM information_schema.KEY_COLUMN_USAGE
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME   = 'institute_class_attendance_sessions'
        AND COLUMN_NAME  = 'session_group_id'
        AND REFERENCED_TABLE_NAME = 'institute_class_attendance_session_groups'
      LIMIT 1
    `);
    if (fkSessionGroup?.CONSTRAINT_NAME) {
      await queryRunner.query(`
        ALTER TABLE \`institute_class_attendance_sessions\`
          DROP FOREIGN KEY \`${fkSessionGroup.CONSTRAINT_NAME}\`
      `);
    }

    // ── 5. DROP AUTO_INCREMENT then DROP PRIMARY KEYS ─────────────────────────

    if (await this.pkIsAutoIncrement(queryRunner, 'institute_class_attendance_session_groups')) {
      await queryRunner.query(`
        ALTER TABLE \`institute_class_attendance_session_groups\`
          MODIFY COLUMN \`id\` BIGINT NOT NULL
      `);
    }

    const groupIdType = await this.columnType(queryRunner, 'institute_class_attendance_session_groups', 'id');
    if (groupIdType && groupIdType.toLowerCase() !== 'varchar') {
      await queryRunner.query(`
        ALTER TABLE \`institute_class_attendance_session_groups\`
          DROP PRIMARY KEY
      `);
    }

    if (await this.pkIsAutoIncrement(queryRunner, 'institute_class_attendance_sessions')) {
      await queryRunner.query(`
        ALTER TABLE \`institute_class_attendance_sessions\`
          MODIFY COLUMN \`id\` BIGINT NOT NULL
      `);
    }

    const sessionIdType = await this.columnType(queryRunner, 'institute_class_attendance_sessions', 'id');
    if (sessionIdType && sessionIdType.toLowerCase() !== 'varchar') {
      await queryRunner.query(`
        ALTER TABLE \`institute_class_attendance_sessions\`
          DROP PRIMARY KEY
      `);
    }

    // ── 6. PROMOTE UUIDs — GROUPS ─────────────────────────────────────────────

    const currentGroupIdType = await this.columnType(queryRunner, 'institute_class_attendance_session_groups', 'id');
    if (currentGroupIdType && currentGroupIdType.toLowerCase() !== 'varchar') {
      await queryRunner.query(`
        ALTER TABLE \`institute_class_attendance_session_groups\`
          MODIFY COLUMN \`id\` VARCHAR(36) NOT NULL
      `);
      await queryRunner.query(`
        UPDATE \`institute_class_attendance_session_groups\`
        SET \`id\` = \`uuid_new\`
      `);
    }

    if (await this.columnExists(queryRunner, 'institute_class_attendance_session_groups', 'uuid_new')) {
      await queryRunner.query(`
        ALTER TABLE \`institute_class_attendance_session_groups\`
          DROP COLUMN \`uuid_new\`
      `);
    }
    if (await this.columnExists(queryRunner, 'institute_class_attendance_session_groups', 'old_id')) {
      await queryRunner.query(`
        ALTER TABLE \`institute_class_attendance_session_groups\`
          DROP COLUMN \`old_id\`
      `);
    }

    // Re-add PK only if not already a PK on VARCHAR
    const [groupPkCheck]: any[] = await queryRunner.query(`
      SELECT COLUMN_KEY FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME   = 'institute_class_attendance_session_groups'
        AND COLUMN_NAME  = 'id'
      LIMIT 1
    `);
    if (groupPkCheck?.COLUMN_KEY !== 'PRI') {
      await queryRunner.query(`
        ALTER TABLE \`institute_class_attendance_session_groups\`
          ADD PRIMARY KEY (\`id\`)
      `);
    }

    // ── 7. PROMOTE UUIDs — SESSIONS ───────────────────────────────────────────

    const currentSessionIdType = await this.columnType(queryRunner, 'institute_class_attendance_sessions', 'id');
    const currentGroupFkType   = await this.columnType(queryRunner, 'institute_class_attendance_sessions', 'session_group_id');

    const needModifySessions =
      (currentSessionIdType && currentSessionIdType.toLowerCase() !== 'varchar') ||
      (currentGroupFkType   && currentGroupFkType.toLowerCase()   !== 'varchar');

    if (needModifySessions) {
      const clauses: string[] = [];
      if (currentSessionIdType && currentSessionIdType.toLowerCase() !== 'varchar')
        clauses.push('MODIFY COLUMN `id` VARCHAR(36) NOT NULL');
      if (currentGroupFkType && currentGroupFkType.toLowerCase() !== 'varchar')
        clauses.push('MODIFY COLUMN `session_group_id` VARCHAR(36) NULL');
      await queryRunner.query(`ALTER TABLE \`institute_class_attendance_sessions\` ${clauses.join(', ')}`);

      await queryRunner.query(`
        UPDATE \`institute_class_attendance_sessions\`
        SET \`id\`               = \`uuid_new\`,
            \`session_group_id\` = \`group_uuid_new\`
      `);
    }

    if (await this.columnExists(queryRunner, 'institute_class_attendance_sessions', 'uuid_new')) {
      await queryRunner.query(`ALTER TABLE \`institute_class_attendance_sessions\` DROP COLUMN \`uuid_new\``);
    }
    if (await this.columnExists(queryRunner, 'institute_class_attendance_sessions', 'old_id')) {
      await queryRunner.query(`ALTER TABLE \`institute_class_attendance_sessions\` DROP COLUMN \`old_id\``);
    }
    if (await this.columnExists(queryRunner, 'institute_class_attendance_sessions', 'group_uuid_new')) {
      await queryRunner.query(`ALTER TABLE \`institute_class_attendance_sessions\` DROP COLUMN \`group_uuid_new\``);
    }

    const [sessionPkCheck]: any[] = await queryRunner.query(`
      SELECT COLUMN_KEY FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME   = 'institute_class_attendance_sessions'
        AND COLUMN_NAME  = 'id'
      LIMIT 1
    `);
    if (sessionPkCheck?.COLUMN_KEY !== 'PRI') {
      await queryRunner.query(`
        ALTER TABLE \`institute_class_attendance_sessions\`
          ADD PRIMARY KEY (\`id\`)
      `);
    }

    // ── 8. PROMOTE UUIDs — ATTENDANCE_RECORDS.class_session_id ───────────────

    const arSessionType = await this.columnType(queryRunner, 'attendance_records', 'class_session_id');
    if (arSessionType && arSessionType.toLowerCase() !== 'varchar') {
      await queryRunner.query(`
        ALTER TABLE \`attendance_records\`
          MODIFY COLUMN \`class_session_id\` VARCHAR(36) NULL
      `);
      await queryRunner.query(`
        UPDATE \`attendance_records\`
        SET \`class_session_id\` = \`session_uuid_new\`
        WHERE \`session_uuid_new\` IS NOT NULL
      `);
    }

    if (await this.columnExists(queryRunner, 'attendance_records', 'session_uuid_new')) {
      await queryRunner.query(`
        ALTER TABLE \`attendance_records\`
          DROP COLUMN \`session_uuid_new\`
      `);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    throw new Error(
      'MigrateAttendanceSessionsToUUID: down() is intentionally not supported. Restore from backup if needed.',
    );
  }
}
