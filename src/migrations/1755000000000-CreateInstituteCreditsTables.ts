import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';

/**
 * Migration: Create centralized institute credits system.
 *
 * Creates:
 * - institute_credits: Global credit balance per institute (replaces sms_credits + credit fields on institute_sms_credentials)
 * - institute_credit_transactions: Immutable ledger of all credit movements
 *
 * Migrates existing data from:
 * - institute_sms_credentials.current_credits → institute_credits.balance
 * - sms_credits.balance → institute_credits.balance (if higher)
 */
export class CreateInstituteCreditsTables1755000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // ════════════════════════════════════════════════════════════════
    // 1. Create institute_credits table
    // ════════════════════════════════════════════════════════════════
    await queryRunner.createTable(
      new Table({
        name: 'institute_credits',
        columns: [
          { name: 'id', type: 'bigint', isPrimary: true, isGenerated: true, generationStrategy: 'increment' },
          { name: 'institute_id', type: 'bigint', isUnique: true, isNullable: false },
          { name: 'balance', type: 'decimal', precision: 12, scale: 2, default: '0' },
          { name: 'total_purchased', type: 'decimal', precision: 12, scale: 2, default: '0' },
          { name: 'total_used', type: 'decimal', precision: 12, scale: 2, default: '0' },
          { name: 'daily_used', type: 'decimal', precision: 10, scale: 2, default: '0' },
          { name: 'monthly_used', type: 'decimal', precision: 10, scale: 2, default: '0' },
          { name: 'daily_limit', type: 'decimal', precision: 10, scale: 2, isNullable: true },
          { name: 'monthly_limit', type: 'decimal', precision: 10, scale: 2, isNullable: true },
          { name: 'last_daily_reset', type: 'date', isNullable: true },
          { name: 'last_monthly_reset', type: 'date', isNullable: true },
          { name: 'last_topup_amount', type: 'decimal', precision: 10, scale: 2, isNullable: true },
          { name: 'last_topup_at', type: 'timestamp', isNullable: true },
          { name: 'is_active', type: 'boolean', default: true },
          { name: 'created_at', type: 'timestamp', default: 'CURRENT_TIMESTAMP' },
          { name: 'updated_at', type: 'timestamp', default: 'CURRENT_TIMESTAMP', onUpdate: 'CURRENT_TIMESTAMP' },
        ],
      }),
      true,
    );

    await queryRunner.createIndex('institute_credits', new TableIndex({
      name: 'idx_ic_institute',
      columnNames: ['institute_id'],
      isUnique: true,
    }));

    // ════════════════════════════════════════════════════════════════
    // 2. Create institute_credit_transactions table
    // ════════════════════════════════════════════════════════════════
    await queryRunner.createTable(
      new Table({
        name: 'institute_credit_transactions',
        columns: [
          { name: 'id', type: 'bigint', isPrimary: true, isGenerated: true, generationStrategy: 'increment' },
          { name: 'institute_id', type: 'bigint', isNullable: false },
          {
            name: 'type', type: 'enum',
            enum: [
              'TOP_UP', 'ADMIN_ADJUSTMENT', 'REFUND', 'BONUS', 'MIGRATION',
              'SMS_SEND', 'EMAIL_SEND', 'WHATSAPP_SEND', 'PUSH_NOTIFICATION',
              'FEATURE_PURCHASE', 'STORAGE_PURCHASE',
            ],
          },
          { name: 'amount', type: 'decimal', precision: 12, scale: 2 },
          { name: 'balance_before', type: 'decimal', precision: 12, scale: 2 },
          { name: 'balance_after', type: 'decimal', precision: 12, scale: 2 },
          { name: 'reference_type', type: 'varchar', length: '50', isNullable: true },
          { name: 'reference_id', type: 'varchar', length: '100', isNullable: true },
          { name: 'description', type: 'varchar', length: '500', isNullable: true },
          { name: 'created_by', type: 'bigint', isNullable: true },
          { name: 'created_at', type: 'timestamp', default: 'CURRENT_TIMESTAMP' },
        ],
      }),
      true,
    );

    await queryRunner.createIndex('institute_credit_transactions', new TableIndex({
      name: 'idx_ict_institute', columnNames: ['institute_id'],
    }));
    await queryRunner.createIndex('institute_credit_transactions', new TableIndex({
      name: 'idx_ict_institute_type', columnNames: ['institute_id', 'type'],
    }));
    await queryRunner.createIndex('institute_credit_transactions', new TableIndex({
      name: 'idx_ict_institute_created', columnNames: ['institute_id', 'created_at'],
    }));
    await queryRunner.createIndex('institute_credit_transactions', new TableIndex({
      name: 'idx_ict_reference', columnNames: ['reference_type', 'reference_id'],
    }));

    // ════════════════════════════════════════════════════════════════
    // 3. Migrate data from existing tables
    // ════════════════════════════════════════════════════════════════

    // 3a. Migrate from institute_sms_credentials (primary source)
    const smsCredsExist = await queryRunner.query(
      `SELECT COUNT(*) as cnt FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'institute_sms_credentials'`
    );
    if (smsCredsExist[0]?.cnt > 0) {
      await queryRunner.query(`
        INSERT INTO institute_credits (institute_id, balance, total_purchased, total_used, daily_used, monthly_used, daily_limit, monthly_limit, is_active, created_at, updated_at)
        SELECT
          institute_id,
          COALESCE(current_credits, 0),
          COALESCE(total_purchased, 0),
          COALESCE(total_used, 0),
          COALESCE(daily_used, 0),
          COALESCE(monthly_used, 0),
          daily_limit,
          monthly_limit,
          COALESCE(is_active, 1),
          COALESCE(created_at, NOW()),
          COALESCE(updated_at, NOW())
        FROM institute_sms_credentials
        ON DUPLICATE KEY UPDATE
          balance = GREATEST(institute_credits.balance, VALUES(balance)),
          total_purchased = GREATEST(institute_credits.total_purchased, VALUES(total_purchased)),
          total_used = GREATEST(institute_credits.total_used, VALUES(total_used))
      `);

      // Record migration transactions
      await queryRunner.query(`
        INSERT INTO institute_credit_transactions (institute_id, type, amount, balance_before, balance_after, reference_type, description, created_at)
        SELECT
          ic.institute_id,
          'MIGRATION',
          ic.balance,
          0,
          ic.balance,
          'SMS_CREDENTIALS',
          CONCAT('Migrated from institute_sms_credentials: ', ic.balance, ' credits'),
          NOW()
        FROM institute_credits ic
        WHERE ic.balance > 0
      `);
    }

    // 3b. Merge from sms_credits (legacy table, take higher balance if exists)
    const smsCreditsExist = await queryRunner.query(
      `SELECT COUNT(*) as cnt FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'sms_credits'`
    );
    if (smsCreditsExist[0]?.cnt > 0) {
      await queryRunner.query(`
        INSERT INTO institute_credits (institute_id, balance, total_purchased, total_used, is_active, created_at, updated_at)
        SELECT
          institute_id,
          COALESCE(balance, 0),
          COALESCE(total_purchased, 0),
          COALESCE(total_used, 0),
          1,
          COALESCE(created_at, NOW()),
          COALESCE(updated_at, NOW())
        FROM sms_credits
        ON DUPLICATE KEY UPDATE
          balance = GREATEST(institute_credits.balance, VALUES(balance)),
          total_purchased = GREATEST(institute_credits.total_purchased, VALUES(total_purchased)),
          total_used = GREATEST(institute_credits.total_used, VALUES(total_used)),
          last_topup_amount = (SELECT last_topup_amount FROM sms_credits WHERE sms_credits.institute_id = VALUES(institute_id)),
          last_topup_at = (SELECT last_topup_at FROM sms_credits WHERE sms_credits.institute_id = VALUES(institute_id))
      `);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('institute_credit_transactions', true);
    await queryRunner.dropTable('institute_credits', true);
  }
}
