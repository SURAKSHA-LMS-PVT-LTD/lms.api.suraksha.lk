import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migrate institute_class_attendance_sessions.id and
 * institute_class_attendance_session_groups.id from BIGINT to UUID (VARCHAR 36).
 *
 * Also migrates the FK columns that reference them:
 *   institute_class_attendance_sessions.session_group_id  → VARCHAR(36)
 *   attendance_records.class_session_id                   → VARCHAR(36)
 */
export class MigrateAttendanceSessionsToUUID1801100000000 implements MigrationInterface {
  name = 'MigrateAttendanceSessionsToUUID1801100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── 1. GROUPS TABLE ────────────────────────────────────────────────────────

    // 1a. Add uuid column + preserve old bigint id for backfill
    await queryRunner.query(`ALTER TABLE \`institute_class_attendance_session_groups\`
      ADD COLUMN \`uuid_new\` VARCHAR(36) NULL,
      ADD COLUMN \`old_id\`   BIGINT NULL`);

    await queryRunner.query(`UPDATE \`institute_class_attendance_session_groups\`
      SET \`uuid_new\` = UUID(), \`old_id\` = \`id\`
      WHERE \`uuid_new\` IS NULL`);

    // ── 2. SESSIONS TABLE ──────────────────────────────────────────────────────

    // 2a. Add uuid column + old_id on sessions
    await queryRunner.query(`ALTER TABLE \`institute_class_attendance_sessions\`
      ADD COLUMN \`uuid_new\`       VARCHAR(36) NULL,
      ADD COLUMN \`old_id\`         BIGINT NULL,
      ADD COLUMN \`group_uuid_new\` VARCHAR(36) NULL`);

    await queryRunner.query(`UPDATE \`institute_class_attendance_sessions\`
      SET \`uuid_new\` = UUID(), \`old_id\` = \`id\`
      WHERE \`uuid_new\` IS NULL`);

    // 2b. Backfill group_uuid_new from groups.uuid_new
    await queryRunner.query(`
      UPDATE \`institute_class_attendance_sessions\` s
      JOIN   \`institute_class_attendance_session_groups\` g ON s.session_group_id = g.old_id
      SET    s.group_uuid_new = g.uuid_new
    `);

    // ── 3. ATTENDANCE_RECORDS — backfill session UUID ──────────────────────────

    await queryRunner.query(`ALTER TABLE \`attendance_records\`
      ADD COLUMN \`session_uuid_new\` VARCHAR(36) NULL`);

    await queryRunner.query(`
      UPDATE \`attendance_records\` r
      JOIN   \`institute_class_attendance_sessions\` s ON r.class_session_id = s.old_id
      SET    r.session_uuid_new = s.uuid_new
      WHERE  r.class_session_id IS NOT NULL
    `);

    // ── 4. DROP FK / PK CONSTRAINTS ───────────────────────────────────────────

    // Drop FK on sessions → groups (if exists)
    const [fkRow]: any[] = await queryRunner.query(`
      SELECT CONSTRAINT_NAME FROM information_schema.KEY_COLUMN_USAGE
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'institute_class_attendance_sessions'
        AND COLUMN_NAME = 'session_group_id'
        AND REFERENCED_TABLE_NAME = 'institute_class_attendance_session_groups'
      LIMIT 1
    `);
    if (fkRow?.CONSTRAINT_NAME) {
      await queryRunner.query(`ALTER TABLE \`institute_class_attendance_sessions\`
        DROP FOREIGN KEY \`${fkRow.CONSTRAINT_NAME}\``);
    }

    // ── 5. PROMOTE UUIDs ──────────────────────────────────────────────────────

    // 5a. Groups: promote uuid_new → id
    await queryRunner.query(`ALTER TABLE \`institute_class_attendance_session_groups\`
      MODIFY COLUMN \`id\` VARCHAR(36) NOT NULL`);
    await queryRunner.query(`UPDATE \`institute_class_attendance_session_groups\`
      SET \`id\` = \`uuid_new\``);
    await queryRunner.query(`ALTER TABLE \`institute_class_attendance_session_groups\`
      DROP COLUMN \`uuid_new\`,
      DROP COLUMN \`old_id\``);

    // 5b. Sessions: promote uuid_new → id, group_uuid_new → session_group_id
    await queryRunner.query(`ALTER TABLE \`institute_class_attendance_sessions\`
      MODIFY COLUMN \`id\`               VARCHAR(36) NOT NULL,
      MODIFY COLUMN \`session_group_id\` VARCHAR(36) NULL`);
    await queryRunner.query(`UPDATE \`institute_class_attendance_sessions\`
      SET \`id\` = \`uuid_new\`,
          \`session_group_id\` = \`group_uuid_new\``);
    await queryRunner.query(`ALTER TABLE \`institute_class_attendance_sessions\`
      DROP COLUMN \`uuid_new\`,
      DROP COLUMN \`old_id\`,
      DROP COLUMN \`group_uuid_new\``);

    // 5c. attendance_records: promote session_uuid_new → class_session_id
    await queryRunner.query(`ALTER TABLE \`attendance_records\`
      MODIFY COLUMN \`class_session_id\` VARCHAR(36) NULL`);
    await queryRunner.query(`UPDATE \`attendance_records\`
      SET \`class_session_id\` = \`session_uuid_new\`
      WHERE \`session_uuid_new\` IS NOT NULL`);
    await queryRunner.query(`ALTER TABLE \`attendance_records\`
      DROP COLUMN \`session_uuid_new\``);

    // ── 6. RE-ADD INDEXES ─────────────────────────────────────────────────────

    await queryRunner.query(`ALTER TABLE \`institute_class_attendance_sessions\`
      ADD PRIMARY KEY (\`id\`)`);

    await queryRunner.query(`ALTER TABLE \`institute_class_attendance_session_groups\`
      ADD PRIMARY KEY (\`id\`)`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Reversing a UUID migration is destructive — old bigint values are gone.
    // This down() is a no-op to prevent accidental data loss.
    throw new Error('MigrateAttendanceSessionsToUUID: down() is intentionally not supported. Restore from backup if needed.');
  }
}
