import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddBankTransferPaymentType1751200000000 implements MigrationInterface {
  name = 'AddBankTransferPaymentType1751200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Check current ENUM values first — only alter if BANK_TRANSFER is missing
    const rows: any[] = await queryRunner.query(`
      SELECT COLUMN_TYPE FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'card_payments'
        AND COLUMN_NAME = 'payment_type'
    `);

    if (rows.length > 0 && !rows[0].COLUMN_TYPE.includes('BANK_TRANSFER')) {
      await queryRunner.query(`
        ALTER TABLE \`card_payments\`
        MODIFY COLUMN \`payment_type\` ENUM('SLIP_UPLOAD','VISA_MASTER','BANK_TRANSFER') NOT NULL
      `);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Revert to original ENUM (removes BANK_TRANSFER)
    await queryRunner.query(`
      ALTER TABLE \`card_payments\`
      MODIFY COLUMN \`payment_type\` ENUM('SLIP_UPLOAD','VISA_MASTER') NOT NULL
    `);
  }
}
