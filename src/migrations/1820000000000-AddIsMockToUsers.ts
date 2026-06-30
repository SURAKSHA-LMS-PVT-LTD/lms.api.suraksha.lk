import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddIsMockToUsers1820000000000 implements MigrationInterface {
  name = 'AddIsMockToUsers1820000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('users');
    const column = table?.findColumnByName('is_mock');
    if (column) {
      console.log('[AddIsMockToUsers] Column is_mock already exists — skipping.');
      return;
    }
    await queryRunner.query(`
      ALTER TABLE \`users\`
      ADD COLUMN \`is_mock\` tinyint(1) NOT NULL DEFAULT 0
      COMMENT 'True = hollow record pre-created by institute admin; set to false when student self-registers and claims the record'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE \`users\` DROP COLUMN \`is_mock\``);
  }
}
