import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPrinterSettingsToInstitutes1791000000000 implements MigrationInterface {
  name = 'AddPrinterSettingsToInstitutes1791000000000';

  async up(runner: QueryRunner): Promise<void> {
    const hasCol = async (col: string) => {
      const [r] = await runner.query(
        `SELECT COUNT(*) AS cnt FROM INFORMATION_SCHEMA.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'institutes' AND COLUMN_NAME = ?`,
        [col],
      );
      return parseInt(r.cnt, 10) > 0;
    };

    if (!(await hasCol('printer_settings'))) {
      await runner.query(
        `ALTER TABLE \`institutes\`
           ADD COLUMN \`printer_settings\` JSON NULL
             COMMENT 'Receipt printer configuration: { defaultSize, language, receiptHeader, receiptFooter }'`,
      );
    }
  }

  async down(runner: QueryRunner): Promise<void> {
    await runner.query(`ALTER TABLE \`institutes\` DROP COLUMN \`printer_settings\``);
  }
}
