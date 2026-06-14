import { MigrationInterface, QueryRunner } from 'typeorm';

export class FinanceExtensions1800000000002 implements MigrationInterface {
  name = 'FinanceExtensions1800000000002';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Add teacher_commission_pct to institute_class_payments
    const [commCol] = await queryRunner.query(`
      SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME   = 'institute_class_payments'
        AND COLUMN_NAME  = 'teacher_commission_pct'
    `);
    if (!commCol) {
      await queryRunner.query(`
        ALTER TABLE institute_class_payments
          ADD COLUMN teacher_commission_pct DECIMAL(5,2) NOT NULL DEFAULT 0.00
          COMMENT 'Teacher commission % — split applied when payment is approved'
      `);
    }

    // 2. Extend finance_ledger tx_source enum to include TEACHER_ADVANCE
    const [txCol] = await queryRunner.query(`
      SELECT COLUMN_TYPE FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME   = 'finance_ledger'
        AND COLUMN_NAME  = 'tx_source'
    `);
    if (txCol && !String(txCol.COLUMN_TYPE).includes('TEACHER_ADVANCE')) {
      await queryRunner.query(`
        ALTER TABLE finance_ledger
          MODIFY COLUMN tx_source ENUM(
            'PAYMENT_APPROVAL','PHYSICAL_COLLECT','FUND_TRANSFER',
            'TEACHER_PAYOUT','TEACHER_DEDUCTION','TEACHER_ADVANCE','MANUAL'
          ) NOT NULL DEFAULT 'MANUAL'
      `);
    }

    console.log('✅ FinanceExtensions migration complete');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE finance_ledger
        MODIFY COLUMN tx_source ENUM(
          'PAYMENT_APPROVAL','PHYSICAL_COLLECT','FUND_TRANSFER',
          'TEACHER_PAYOUT','TEACHER_DEDUCTION','MANUAL'
        ) NOT NULL DEFAULT 'MANUAL'
    `);
    const [col] = await queryRunner.query(`
      SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME   = 'institute_class_payments'
        AND COLUMN_NAME  = 'teacher_commission_pct'
    `);
    if (col) {
      await queryRunner.query(`ALTER TABLE institute_class_payments DROP COLUMN teacher_commission_pct`);
    }
  }
}
