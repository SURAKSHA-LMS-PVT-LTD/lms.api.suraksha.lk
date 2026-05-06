import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddReportBrandingToInstitutes1783000000000 implements MigrationInterface {
  name = 'AddReportBrandingToInstitutes1783000000000';

  async up(runner: QueryRunner): Promise<void> {
    const check = async (col: string) => {
      const [r] = await runner.query(
        `SELECT COUNT(*) AS cnt FROM INFORMATION_SCHEMA.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'institutes' AND COLUMN_NAME = ?`,
        [col],
      );
      return parseInt(r.cnt, 10) > 0;
    };

    if (!(await check('report_header_url'))) {
      await runner.query(
        `ALTER TABLE \`institutes\`
           ADD COLUMN \`report_header_url\` VARCHAR(500) NULL
             COMMENT 'S3 relative path for the PDF report header banner image (wide, ~8:1 ratio)'`,
      );
    }
    if (!(await check('report_footer_url'))) {
      await runner.query(
        `ALTER TABLE \`institutes\`
           ADD COLUMN \`report_footer_url\` VARCHAR(500) NULL
             COMMENT 'S3 relative path for the PDF report footer banner image (wide, ~14:1 ratio)'`,
      );
    }
  }

  async down(runner: QueryRunner): Promise<void> {
    await runner.query(`ALTER TABLE \`institutes\` DROP COLUMN \`report_footer_url\``);
    await runner.query(`ALTER TABLE \`institutes\` DROP COLUMN \`report_header_url\``);
  }
}
