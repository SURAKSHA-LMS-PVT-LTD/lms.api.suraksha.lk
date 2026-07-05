import { QueryRunner } from 'typeorm';

/**
 * Migrations that iterate a hardcoded list of table names (e.g. to backfill a UUID
 * column across many child tables) have repeatedly hidden typos: a name in the list
 * that doesn't match the real table is silently skipped by a blanket `try/catch`,
 * leaving that one table's column un-migrated with no error anywhere. This has
 * happened at least four times in this codebase (institute_house_members vs the real
 * institute_house_member, institute_class_subject_resaults vs …results, study_materials
 * vs institute_class_subject_study_materials, lecture_live_attendances vs …attendance).
 *
 * Any new migration that loops over a table-name list MUST use `assertTableExists`
 * (or `tableExists`) instead of a bare try/catch around the DDL, so a typo fails the
 * migration loudly instead of silently no-op'ing on that table.
 */

/** True if `tableName` exists in the current database schema. */
export async function tableExists(queryRunner: QueryRunner, tableName: string): Promise<boolean> {
  const rows: any[] = await queryRunner.query(
    `SELECT 1 FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1`,
    [tableName],
  );
  return rows.length > 0;
}

/** Throws with a clear message if `tableName` does not exist — use before any DDL keyed off a hardcoded name. */
export async function assertTableExists(queryRunner: QueryRunner, tableName: string): Promise<void> {
  if (!(await tableExists(queryRunner, tableName))) {
    throw new Error(
      `Migration references table "${tableName}", which does not exist. ` +
      `This is very likely a typo (check for singular/plural or spelling mismatches against the ` +
      `real @Entity() table name) — fix the name in this migration rather than catching and ` +
      `ignoring the error.`,
    );
  }
}

/** True if `columnName` exists on `tableName` in the current database schema. */
export async function columnExists(queryRunner: QueryRunner, tableName: string, columnName: string): Promise<boolean> {
  const rows: any[] = await queryRunner.query(
    `SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ? LIMIT 1`,
    [tableName, columnName],
  );
  return rows.length > 0;
}

/** True if an index named `indexName` exists on `tableName` in the current database schema. */
export async function indexExists(queryRunner: QueryRunner, tableName: string, indexName: string): Promise<boolean> {
  const rows: any[] = await queryRunner.query(
    `SELECT 1 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ? LIMIT 1`,
    [tableName, indexName],
  );
  return rows.length > 0;
}
