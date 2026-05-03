import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddUserExtraDataSchemaToInstitutes1780000000000 implements MigrationInterface {
  name = 'AddUserExtraDataSchemaToInstitutes1780000000000';

  async up(runner: QueryRunner): Promise<void> {
    const [colExists] = await runner.query(`
      SELECT COUNT(*) AS cnt FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME  = 'institutes'
        AND COLUMN_NAME = 'user_extra_data_schema'
    `);
    if (parseInt(colExists.cnt, 10) === 0) {
      await runner.query(`
        ALTER TABLE \`institutes\`
          ADD COLUMN \`user_extra_data_schema\` JSON NULL
            COMMENT 'Array of custom column definitions for institute_user.extra_data: [{key,label,type,applicableTo}]'
      `);
    }
  }

  async down(runner: QueryRunner): Promise<void> {
    await runner.query(`ALTER TABLE \`institutes\` DROP COLUMN \`user_extra_data_schema\``);
  }
}
