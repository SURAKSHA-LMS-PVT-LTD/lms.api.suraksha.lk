import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migration: AddDriveColumnsToCardPayments
 *
 * Changes:
 * 1. Makes submission_url nullable (Drive payments don't have a cloud storage URL)
 * 2. Adds upload_method ENUM column ('CLOUD_STORAGE' | 'GOOGLE_DRIVE')
 * 3. Adds drive_file_id for the Google Drive file ID
 * 4. Adds drive_web_view_link for the Google Drive shareable link
 * 5. Adds drive_file_name for the original file name
 */
export class AddDriveColumnsToCardPayments1741100000000 implements MigrationInterface {
  name = 'AddDriveColumnsToCardPayments1741100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Make submission_url nullable
    await queryRunner.query(`
      ALTER TABLE \`card_payments\`
        MODIFY COLUMN \`submission_url\` VARCHAR(500) NULL
    `);

    // 2. Add upload_method enum column
    await queryRunner.query(`
      ALTER TABLE \`card_payments\`
        ADD COLUMN \`upload_method\` ENUM('CLOUD_STORAGE','GOOGLE_DRIVE') NULL DEFAULT 'CLOUD_STORAGE'
        AFTER \`submission_url\`
    `);

    // 3. Add drive_file_id column
    await queryRunner.query(`
      ALTER TABLE \`card_payments\`
        ADD COLUMN \`drive_file_id\` VARCHAR(200) NULL
        AFTER \`upload_method\`
    `);

    // 4. Add drive_web_view_link column
    await queryRunner.query(`
      ALTER TABLE \`card_payments\`
        ADD COLUMN \`drive_web_view_link\` VARCHAR(500) NULL
        AFTER \`drive_file_id\`
    `);

    // 5. Add drive_file_name column
    await queryRunner.query(`
      ALTER TABLE \`card_payments\`
        ADD COLUMN \`drive_file_name\` VARCHAR(255) NULL
        AFTER \`drive_web_view_link\`
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE \`card_payments\` DROP COLUMN \`drive_file_name\``);
    await queryRunner.query(`ALTER TABLE \`card_payments\` DROP COLUMN \`drive_web_view_link\``);
    await queryRunner.query(`ALTER TABLE \`card_payments\` DROP COLUMN \`drive_file_id\``);
    await queryRunner.query(`ALTER TABLE \`card_payments\` DROP COLUMN \`upload_method\``);
    await queryRunner.query(`
      ALTER TABLE \`card_payments\`
        MODIFY COLUMN \`submission_url\` VARCHAR(500) NOT NULL
    `);
  }
}
