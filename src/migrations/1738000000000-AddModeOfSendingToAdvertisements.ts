import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migration: Add modeOfSending column to advertisements table
 * 
 * This adds a SET column that defines which delivery channels are used 
 * when actually sending an advertisement. Values: sms, email, whatsapp, 
 * telegram, push-web, push-mobile.
 * 
 * modeOfSending is the PRIMARY channel selector for delivery.
 * supportivePlatforms remains as a fallback / display-only field.
 * 
 * Run: npx typeorm migration:run -d src/data-source.ts
 * Revert: npx typeorm migration:revert -d src/data-source.ts
 */
export class AddModeOfSendingToAdvertisements1738000000000 implements MigrationInterface {
  name = 'AddModeOfSendingToAdvertisements1738000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Check if column already exists (safe for idempotent runs / synchronize=true environments)
    const table = await queryRunner.getTable('advertisements');
    const columnExists = table?.columns.find(col => col.name === 'modeOfSending');

    if (!columnExists) {
      await queryRunner.query(`
        ALTER TABLE \`advertisements\` 
        ADD COLUMN \`modeOfSending\` SET('sms','email','whatsapp','telegram','push-web','push-mobile') NULL
        AFTER \`supportivePlatforms\`
      `);

      console.log('✅ Added modeOfSending column to advertisements table');
    } else {
      console.log('⚠️ modeOfSending column already exists in advertisements table, skipping');
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('advertisements');
    const columnExists = table?.columns.find(col => col.name === 'modeOfSending');

    if (columnExists) {
      await queryRunner.query(`
        ALTER TABLE \`advertisements\` 
        DROP COLUMN \`modeOfSending\`
      `);

      console.log('✅ Removed modeOfSending column from advertisements table');
    }
  }
}
