import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddEnrollmentPaymentGating1779000000000 implements MigrationInterface {
  name = 'AddEnrollmentPaymentGating1779000000000';

  async up(runner: QueryRunner): Promise<void> {
    const [refExists] = await runner.query(`
      SELECT COUNT(*) AS cnt FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME  = 'institute_class_subjects'
        AND COLUMN_NAME = 'enrollment_payment_ref_id'
    `);
    if (parseInt(refExists.cnt, 10) === 0) {
      await runner.query(`
        ALTER TABLE institute_class_subjects
          ADD COLUMN \`enrollment_payment_ref_id\` BIGINT NULL
            COMMENT 'Class-level payment that gates self-enrollment (FK to institute_class_subject_payments)'
      `);
    }

    const [statusExists] = await runner.query(`
      SELECT COUNT(*) AS cnt FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME  = 'institute_class_subjects'
        AND COLUMN_NAME = 'enrollment_payment_statuses'
    `);
    if (parseInt(statusExists.cnt, 10) === 0) {
      await runner.query(`
        ALTER TABLE institute_class_subjects
          ADD COLUMN \`enrollment_payment_statuses\` VARCHAR(500) NULL
            COMMENT 'Comma-separated allowed submission statuses e.g. VERIFIED,HALF_VERIFIED'
      `);
    }
  }

  async down(runner: QueryRunner): Promise<void> {
    await runner.query(`
      ALTER TABLE institute_class_subjects
        DROP COLUMN \`enrollment_payment_ref_id\`,
        DROP COLUMN \`enrollment_payment_statuses\`
    `);
  }
}
