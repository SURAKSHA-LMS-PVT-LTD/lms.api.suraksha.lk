import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migration: Make bank fields nullable on institute_class_payments.
 *
 * Reason: bank_name / account_holder_name / account_holder_number were NOT NULL,
 * which blocks inserting migrated records (e.g. Thilina LMS) that carry no bank
 * details. Month identification is handled via the payment title (e.g. "January 2026").
 */
export class AddPaymentPeriodAndNullableBankFields1802000000000 implements MigrationInterface {
  name = 'AddPaymentPeriodAndNullableBankFields1802000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE \`institute_class_payments\`
      MODIFY COLUMN \`bank_name\`             VARCHAR(100) NULL DEFAULT NULL,
      MODIFY COLUMN \`account_holder_name\`   VARCHAR(150) NULL DEFAULT NULL,
      MODIFY COLUMN \`account_holder_number\` VARCHAR(50)  NULL DEFAULT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Backfill NULLs before restoring NOT NULL constraint
    await queryRunner.query(`
      UPDATE \`institute_class_payments\`
      SET \`bank_name\`             = COALESCE(\`bank_name\`, ''),
          \`account_holder_name\`   = COALESCE(\`account_holder_name\`, ''),
          \`account_holder_number\` = COALESCE(\`account_holder_number\`, '')
      WHERE \`bank_name\` IS NULL
         OR \`account_holder_name\` IS NULL
         OR \`account_holder_number\` IS NULL
    `);

    await queryRunner.query(`
      ALTER TABLE \`institute_class_payments\`
      MODIFY COLUMN \`bank_name\`             VARCHAR(100) NOT NULL,
      MODIFY COLUMN \`account_holder_name\`   VARCHAR(150) NOT NULL,
      MODIFY COLUMN \`account_holder_number\` VARCHAR(50)  NOT NULL
    `);
  }
}
