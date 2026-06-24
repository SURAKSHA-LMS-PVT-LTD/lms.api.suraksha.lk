import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Fix institute_class_subject_results columns that were created with old integer
 * types before the UUID migrations ran:
 *   class_id   — entity: VARCHAR(36), DB: BIGINT
 *   subject_id — entity: VARCHAR(36), DB: BIGINT
 *
 * (institute_id was already fixed by FixResultsInstituteIdType1832000000000)
 *
 * Idempotent: skips any column already varchar.
 */
export class FixResultsUuidColumns1832000000001 implements MigrationInterface {
  name = 'FixResultsUuidColumns1832000000001';

  private readonly TABLE = 'institute_class_subject_results';

  private async columnType(queryRunner: QueryRunner, col: string): Promise<string | null> {
    const [row]: any[] = await queryRunner.query(`
      SELECT DATA_TYPE
      FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME   = '${this.TABLE}'
        AND COLUMN_NAME  = '${col}'
    `);
    return row?.DATA_TYPE ?? null;
  }

  private async dropFks(queryRunner: QueryRunner, col: string): Promise<void> {
    const rows: any[] = await queryRunner.query(`
      SELECT CONSTRAINT_NAME
      FROM information_schema.KEY_COLUMN_USAGE
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME   = '${this.TABLE}'
        AND COLUMN_NAME  = '${col}'
        AND REFERENCED_TABLE_NAME IS NOT NULL
    `);
    for (const row of rows) {
      try {
        await queryRunner.query(
          `ALTER TABLE \`${this.TABLE}\` DROP FOREIGN KEY \`${row.CONSTRAINT_NAME}\``,
        );
      } catch { /* ignore */ }
    }
  }

  private async dropIndex(queryRunner: QueryRunner, name: string): Promise<void> {
    try {
      await queryRunner.query(`ALTER TABLE \`${this.TABLE}\` DROP INDEX \`${name}\``);
    } catch { /* may not exist */ }
  }

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── class_id ──────────────────────────────────────────────────────────────
    const classIdType = await this.columnType(queryRunner, 'class_id');
    if (classIdType && classIdType !== 'varchar') {
      await this.dropFks(queryRunner, 'class_id');
      await this.dropIndex(queryRunner, 'idx_result_institute_class_subject');
      await queryRunner.query(
        `ALTER TABLE \`${this.TABLE}\` MODIFY COLUMN \`class_id\` VARCHAR(36) NOT NULL`,
      );
    }

    // ── subject_id ────────────────────────────────────────────────────────────
    const subjectIdType = await this.columnType(queryRunner, 'subject_id');
    if (subjectIdType && subjectIdType !== 'varchar') {
      await this.dropFks(queryRunner, 'subject_id');
      await this.dropIndex(queryRunner, 'idx_result_institute_class_subject');
      await queryRunner.query(
        `ALTER TABLE \`${this.TABLE}\` MODIFY COLUMN \`subject_id\` VARCHAR(36) NOT NULL`,
      );
    }

    // ── Re-create composite index (safe to try even if nothing changed) ───────
    try {
      await queryRunner.query(
        `CREATE INDEX \`idx_result_institute_class_subject\`
         ON \`${this.TABLE}\` (\`institute_id\`, \`class_id\`, \`subject_id\`)`,
      );
    } catch { /* already exists */ }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    try {
      await queryRunner.query(`ALTER TABLE \`${this.TABLE}\` DROP INDEX \`idx_result_institute_class_subject\``);
    } catch { /* ignore */ }
    await queryRunner.query(
      `ALTER TABLE \`${this.TABLE}\` MODIFY COLUMN \`class_id\` BIGINT NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE \`${this.TABLE}\` MODIFY COLUMN \`subject_id\` BIGINT NOT NULL`,
    );
  }
}
