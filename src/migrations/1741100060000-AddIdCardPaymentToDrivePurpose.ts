import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migration: AddIdCardPaymentToDrivePurpose
 *
 * Adds 'ID_CARD_PAYMENT' to the `purpose` ENUM column on the `user_drive_files` table,
 * allowing users to register their ID card payment receipt files via Google Drive.
 */
export class AddIdCardPaymentToDrivePurpose1741100060000 implements MigrationInterface {
  name = 'AddIdCardPaymentToDrivePurpose1741100060000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE \`user_drive_files\`
        MODIFY COLUMN \`purpose\`
          ENUM(
            'HOMEWORK_SUBMISSION',
            'HOMEWORK_REFERENCE',
            'HOMEWORK_CORRECTION',
            'EXAM_SUBMISSION',
            'PROFILE_DOCUMENT',
            'ID_CARD_PAYMENT',
            'GENERAL'
          ) NOT NULL DEFAULT 'GENERAL'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Remove ID_CARD_PAYMENT – existing rows with this value must be cleaned up first
    await queryRunner.query(`
      UPDATE \`user_drive_files\` SET \`purpose\` = 'GENERAL' WHERE \`purpose\` = 'ID_CARD_PAYMENT'
    `);
    await queryRunner.query(`
      ALTER TABLE \`user_drive_files\`
        MODIFY COLUMN \`purpose\`
          ENUM(
            'HOMEWORK_SUBMISSION',
            'HOMEWORK_REFERENCE',
            'HOMEWORK_CORRECTION',
            'EXAM_SUBMISSION',
            'PROFILE_DOCUMENT',
            'GENERAL'
          ) NOT NULL DEFAULT 'GENERAL'
    `);
  }
}
