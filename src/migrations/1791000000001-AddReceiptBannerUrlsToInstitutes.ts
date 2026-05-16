import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddReceiptBannerUrlsToInstitutes1791000000001 implements MigrationInterface {
  name = 'AddReceiptBannerUrlsToInstitutes1791000000001';

  async up(runner: QueryRunner): Promise<void> {
    const hasCol = async (col: string) => {
      const [r] = await runner.query(
        `SELECT COUNT(*) AS cnt FROM INFORMATION_SCHEMA.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'institutes' AND COLUMN_NAME = ?`,
        [col],
      );
      return parseInt(r.cnt, 10) > 0;
    };

    if (!(await hasCol('receipt_header_url'))) {
      await runner.query(
        `ALTER TABLE \`institutes\`
           ADD COLUMN \`receipt_header_url\` VARCHAR(500) NULL
             COMMENT 'S3 path for receipt printer header image (thermal paper width)'`,
      );
    }

    if (!(await hasCol('receipt_footer_url'))) {
      await runner.query(
        `ALTER TABLE \`institutes\`
           ADD COLUMN \`receipt_footer_url\` VARCHAR(500) NULL
             COMMENT 'S3 path for receipt printer footer image (thermal paper width)'`,
      );
    }
  }

  async down(runner: QueryRunner): Promise<void> {
    await runner.query(`ALTER TABLE \`institutes\` DROP COLUMN \`receipt_footer_url\``);
    await runner.query(`ALTER TABLE \`institutes\` DROP COLUMN \`receipt_header_url\``);
  }
}
