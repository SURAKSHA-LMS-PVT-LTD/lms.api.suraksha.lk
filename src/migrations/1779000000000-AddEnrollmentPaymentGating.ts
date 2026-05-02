import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds payment-gating columns to institute_class_subjects so enrollment
 * can be configured to require a specific class-level payment.
 *
 *  enrollment_payment_ref_id  – FK to institute_class_subject_payments (nullable)
 *  enrollment_payment_statuses – comma-separated allowed submission statuses
 */
export class AddEnrollmentPaymentGating1779000000000 implements MigrationInterface {
  name = 'AddEnrollmentPaymentGating1779000000000';

  async up(runner: QueryRunner): Promise<void> {
    await runner.query(`
      ALTER TABLE institute_class_subjects
        ADD COLUMN IF NOT EXISTS \`enrollment_payment_ref_id\`   BIGINT        NULL
          COMMENT 'Class-level payment that gates self-enrollment (FK to institute_class_subject_payments)',
        ADD COLUMN IF NOT EXISTS \`enrollment_payment_statuses\` VARCHAR(500)  NULL
          COMMENT 'Comma-separated allowed submission statuses e.g. VERIFIED,HALF_VERIFIED'
    `);
  }

  async down(runner: QueryRunner): Promise<void> {
    await runner.query(`
      ALTER TABLE institute_class_subjects
        DROP COLUMN IF EXISTS \`enrollment_payment_ref_id\`,
        DROP COLUMN IF EXISTS \`enrollment_payment_statuses\`
    `);
  }
}
