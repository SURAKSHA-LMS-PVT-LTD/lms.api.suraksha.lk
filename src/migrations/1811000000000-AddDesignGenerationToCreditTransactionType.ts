import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddDesignGenerationToCreditTransactionType1811000000000 implements MigrationInterface {
  name = 'AddDesignGenerationToCreditTransactionType1811000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const exists = await queryRunner.hasTable('institute_credit_transactions');
    if (!exists) return;

    await queryRunner.query(`
      ALTER TABLE \`institute_credit_transactions\`
      MODIFY COLUMN \`type\` ENUM(
        'TOP_UP', 'ADMIN_ADJUSTMENT', 'REFUND', 'BONUS', 'MIGRATION',
        'SMS_SEND', 'EMAIL_SEND', 'WHATSAPP_SEND', 'PUSH_NOTIFICATION',
        'FEATURE_PURCHASE', 'STORAGE_PURCHASE', 'DESIGN_GENERATION'
      ) NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const exists = await queryRunner.hasTable('institute_credit_transactions');
    if (!exists) return;

    await queryRunner.query(`
      ALTER TABLE \`institute_credit_transactions\`
      MODIFY COLUMN \`type\` ENUM(
        'TOP_UP', 'ADMIN_ADJUSTMENT', 'REFUND', 'BONUS', 'MIGRATION',
        'SMS_SEND', 'EMAIL_SEND', 'WHATSAPP_SEND', 'PUSH_NOTIFICATION',
        'FEATURE_PURCHASE', 'STORAGE_PURCHASE'
      ) NOT NULL
    `);
  }
}
