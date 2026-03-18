import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddTimestampsToBookhires1752000000000 implements MigrationInterface {
  name = 'AddTimestampsToBookhires1752000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const createdAtExists = await queryRunner.query(`
      SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'bookhires'
        AND COLUMN_NAME = 'created_at'
    `);

    if (createdAtExists.length === 0) {
      await queryRunner.query(`
        ALTER TABLE bookhires
        ADD COLUMN created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      `);
    }

    const updatedAtExists = await queryRunner.query(`
      SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'bookhires'
        AND COLUMN_NAME = 'updated_at'
    `);

    if (updatedAtExists.length === 0) {
      await queryRunner.query(`
        ALTER TABLE bookhires
        ADD COLUMN updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      `);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const updatedAtExists = await queryRunner.query(`
      SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'bookhires'
        AND COLUMN_NAME = 'updated_at'
    `);

    if (updatedAtExists.length > 0) {
      await queryRunner.query(`ALTER TABLE bookhires DROP COLUMN updated_at`);
    }

    const createdAtExists = await queryRunner.query(`
      SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'bookhires'
        AND COLUMN_NAME = 'created_at'
    `);

    if (createdAtExists.length > 0) {
      await queryRunner.query(`ALTER TABLE bookhires DROP COLUMN created_at`);
    }
  }
}
