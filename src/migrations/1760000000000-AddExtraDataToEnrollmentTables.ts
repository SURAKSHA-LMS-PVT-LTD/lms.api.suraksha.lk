import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migration: AddExtraDataToEnrollmentTables
 *
 * Adds a nullable JSON column `extra_data` to three enrollment-related tables:
 *   - institute_user                        (institute ↔ user relation)
 *   - institute_class_students              (class-level enrollment)
 *   - institute_class_subject_students      (subject-level enrollment)
 *
 * Purpose: Allow admins to store arbitrary key-value metadata per enrolment
 * (e.g. phoneNumber, email, custom notes). Data is stored as plain JSON —
 * no encryption — and is visible to institute admins.
 */
export class AddExtraDataToEnrollmentTables1760000000000 implements MigrationInterface {
  name = 'AddExtraDataToEnrollmentTables1760000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. institute_user table
    await queryRunner.query(`
      ALTER TABLE \`institute_user\`
      ADD COLUMN \`extra_data\` JSON NULL
        COMMENT 'Institute-defined custom key-value data. Visible to admins, not encrypted.'
        AFTER \`house_id\`
    `);

    // 2. institute_class_students table
    await queryRunner.query(`
      ALTER TABLE \`institute_class_students\`
      ADD COLUMN \`extra_data\` JSON NULL
        COMMENT 'Institute-defined custom key-value data for this class enrollment. Visible to admins, not encrypted.'
        AFTER \`student_type\`
    `);

    // 3. institute_class_subject_students table
    await queryRunner.query(`
      ALTER TABLE \`institute_class_subject_students\`
      ADD COLUMN \`extra_data\` JSON NULL
        COMMENT 'Institute-defined custom key-value data for this subject enrollment. Visible to admins, not encrypted.'
        AFTER \`enrollment_payment_id\`
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE \`institute_class_subject_students\` DROP COLUMN \`extra_data\``);
    await queryRunner.query(`ALTER TABLE \`institute_class_students\` DROP COLUMN \`extra_data\``);
    await queryRunner.query(`ALTER TABLE \`institute_user\` DROP COLUMN \`extra_data\``);
  }
}
