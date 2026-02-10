import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migration: Add created_at and updated_at columns to advertisements table
 * 
 * The entity defines these columns but they were never added to the production DB.
 * Error: Unknown column 'AdvertisementEntity.created_at' in 'field list'
 * 
 * Run: npx typeorm migration:run -d src/data-source.ts
 * Or manually execute the SQL below on production.
 */
export class AddTimestampsToAdvertisements1739300000000 implements MigrationInterface {
  name = 'AddTimestampsToAdvertisements1739300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('advertisements');

    const createdAtExists = table?.columns.find(col => col.name === 'created_at');
    if (!createdAtExists) {
      await queryRunner.query(`
        ALTER TABLE \`advertisements\`
        ADD COLUMN \`created_at\` TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)
      `);
      console.log('✅ Added created_at column to advertisements table');
    } else {
      console.log('⚠️ created_at column already exists, skipping');
    }

    const updatedAtExists = table?.columns.find(col => col.name === 'updated_at');
    if (!updatedAtExists) {
      await queryRunner.query(`
        ALTER TABLE \`advertisements\`
        ADD COLUMN \`updated_at\` TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6)
      `);
      console.log('✅ Added updated_at column to advertisements table');
    } else {
      console.log('⚠️ updated_at column already exists, skipping');
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('advertisements');

    if (table?.columns.find(col => col.name === 'updated_at')) {
      await queryRunner.query(`ALTER TABLE \`advertisements\` DROP COLUMN \`updated_at\``);
      console.log('✅ Removed updated_at column');
    }

    if (table?.columns.find(col => col.name === 'created_at')) {
      await queryRunner.query(`ALTER TABLE \`advertisements\` DROP COLUMN \`created_at\``);
      console.log('✅ Removed created_at column');
    }
  }
}
