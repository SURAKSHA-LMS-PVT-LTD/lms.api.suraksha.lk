import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Fix institute_payments.institute_id column type.
 *
 * The table was created before institutes switched to UUID primary keys, so
 * institute_id is still a BIGINT in the live database while the entity
 * declares it as VARCHAR(36). This causes:
 *   "Incorrect integer value: '<uuid>' for column 'institute_id' at row 1"
 *
 * The column is NOT a FK in this table (institute_id is stored as a plain
 * reference, no FOREIGN KEY constraint), so no FK needs to be dropped first.
 * Existing rows (if any) will have their old integer IDs left as strings —
 * they are orphaned data from before the UUID migration and can be ignored.
 *
 * Idempotent: checks column type before altering.
 */
export class FixInstitutePaymentsInstituteIdType1817000000000 implements MigrationInterface {
  name = 'FixInstitutePaymentsInstituteIdType1817000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Check current column type
    const [col]: any[] = await queryRunner.query(`
      SELECT DATA_TYPE, CHARACTER_MAXIMUM_LENGTH
      FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME   = 'institute_payments'
        AND COLUMN_NAME  = 'institute_id'
    `);

    if (!col) return; // table doesn't exist yet — nothing to do

    // Only alter if still an integer type (bigint / int)
    if (col.DATA_TYPE !== 'varchar') {
      // Drop any index on institute_id first (MySQL requires this before type change)
      try {
        await queryRunner.query(`ALTER TABLE \`institute_payments\` DROP INDEX \`idx_inst_pay_institute\``);
      } catch { /* index may not exist */ }
      try {
        await queryRunner.query(`ALTER TABLE \`institute_payments\` DROP INDEX \`idx_inst_pay_institute_status\``);
      } catch { /* index may not exist */ }

      await queryRunner.query(
        `ALTER TABLE \`institute_payments\` MODIFY COLUMN \`institute_id\` VARCHAR(36) NOT NULL`,
      );

      // Re-create the indexes
      try {
        await queryRunner.query(
          `CREATE INDEX \`idx_inst_pay_institute\` ON \`institute_payments\` (\`institute_id\`)`,
        );
      } catch { /* already exists */ }
      try {
        await queryRunner.query(
          `CREATE INDEX \`idx_inst_pay_institute_status\` ON \`institute_payments\` (\`institute_id\`, \`status\`)`,
        );
      } catch { /* already exists */ }
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Revert to BIGINT (data loss for UUID values — only safe in dev)
    try {
      await queryRunner.query(`ALTER TABLE \`institute_payments\` DROP INDEX \`idx_inst_pay_institute\``);
    } catch { /* ignore */ }
    try {
      await queryRunner.query(`ALTER TABLE \`institute_payments\` DROP INDEX \`idx_inst_pay_institute_status\``);
    } catch { /* ignore */ }

    await queryRunner.query(
      `ALTER TABLE \`institute_payments\` MODIFY COLUMN \`institute_id\` BIGINT NOT NULL`,
    );
  }
}
