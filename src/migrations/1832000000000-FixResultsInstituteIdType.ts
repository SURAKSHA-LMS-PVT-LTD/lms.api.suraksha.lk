import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Fix institute_class_subject_results.institute_id column type.
 *
 * The table was created before institutes switched to UUID primary keys, so
 * institute_id is still a BIGINT while the entity declares it as VARCHAR(36).
 * This causes:
 *   "Incorrect integer value: '<uuid>' for column 'institute_id' at row 1"
 *
 * Idempotent: checks column type before altering.
 */
export class FixResultsInstituteIdType1832000000000 implements MigrationInterface {
  name = 'FixResultsInstituteIdType1832000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const [col]: any[] = await queryRunner.query(`
      SELECT DATA_TYPE, CHARACTER_MAXIMUM_LENGTH
      FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME   = 'institute_class_subject_results'
        AND COLUMN_NAME  = 'institute_id'
    `);

    if (!col) return;
    if (col.DATA_TYPE === 'varchar') return;

    // Drop any FK constraints referencing this column
    const fkRows: any[] = await queryRunner.query(`
      SELECT CONSTRAINT_NAME
      FROM information_schema.KEY_COLUMN_USAGE
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME   = 'institute_class_subject_results'
        AND COLUMN_NAME  = 'institute_id'
        AND REFERENCED_TABLE_NAME IS NOT NULL
    `);
    for (const row of fkRows) {
      try {
        await queryRunner.query(
          `ALTER TABLE \`institute_class_subject_results\` DROP FOREIGN KEY \`${row.CONSTRAINT_NAME}\``,
        );
      } catch { /* ignore */ }
    }

    // Drop indexes that include institute_id
    const indexNames = ['idx_result_institute_class_subject'];
    for (const idx of indexNames) {
      try {
        await queryRunner.query(
          `ALTER TABLE \`institute_class_subject_results\` DROP INDEX \`${idx}\``,
        );
      } catch { /* may not exist */ }
    }

    await queryRunner.query(
      `ALTER TABLE \`institute_class_subject_results\` MODIFY COLUMN \`institute_id\` VARCHAR(36) NOT NULL`,
    );

    // Re-create the composite index
    try {
      await queryRunner.query(
        `CREATE INDEX \`idx_result_institute_class_subject\` ON \`institute_class_subject_results\` (\`institute_id\`, \`class_id\`, \`subject_id\`)`,
      );
    } catch { /* already exists */ }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    try {
      await queryRunner.query(
        `ALTER TABLE \`institute_class_subject_results\` DROP INDEX \`idx_result_institute_class_subject\``,
      );
    } catch { /* ignore */ }

    await queryRunner.query(
      `ALTER TABLE \`institute_class_subject_results\` MODIFY COLUMN \`institute_id\` BIGINT NOT NULL`,
    );
  }
}
