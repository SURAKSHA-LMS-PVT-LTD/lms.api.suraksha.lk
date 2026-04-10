import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Add HALF_VERIFIED and QUARTER_VERIFIED to payment submission status enums.
 * These partial statuses allow admins to verify partial payments when a user
 * has paid half or a quarter of the required amount. Students/parents can then
 * resubmit to complete the remaining balance.
 */
export class AddPartialPaymentStatuses1762000000000 implements MigrationInterface {
  name = 'AddPartialPaymentStatuses1762000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Alter institute_class_subject_payment_submissions.status enum
    await queryRunner.query(`
      ALTER TABLE \`institute_class_subject_payment_submissions\`
      MODIFY COLUMN \`status\` ENUM('PENDING','VERIFIED','HALF_VERIFIED','QUARTER_VERIFIED','REJECTED')
      NOT NULL DEFAULT 'PENDING'
    `);

    // Alter institute_payment_submissions.status enum
    await queryRunner.query(`
      ALTER TABLE \`institute_payment_submissions\`
      MODIFY COLUMN \`status\` ENUM('PENDING','VERIFIED','HALF_VERIFIED','QUARTER_VERIFIED','REJECTED')
      NOT NULL DEFAULT 'PENDING'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Revert: convert any HALF_VERIFIED / QUARTER_VERIFIED rows back to PENDING before dropping enum values
    await queryRunner.query(`
      UPDATE \`institute_class_subject_payment_submissions\`
      SET \`status\` = 'PENDING'
      WHERE \`status\` IN ('HALF_VERIFIED', 'QUARTER_VERIFIED')
    `);
    await queryRunner.query(`
      ALTER TABLE \`institute_class_subject_payment_submissions\`
      MODIFY COLUMN \`status\` ENUM('PENDING','VERIFIED','REJECTED')
      NOT NULL DEFAULT 'PENDING'
    `);

    await queryRunner.query(`
      UPDATE \`institute_payment_submissions\`
      SET \`status\` = 'PENDING'
      WHERE \`status\` IN ('HALF_VERIFIED', 'QUARTER_VERIFIED')
    `);
    await queryRunner.query(`
      ALTER TABLE \`institute_payment_submissions\`
      MODIFY COLUMN \`status\` ENUM('PENDING','VERIFIED','REJECTED')
      NOT NULL DEFAULT 'PENDING'
    `);
  }
}
