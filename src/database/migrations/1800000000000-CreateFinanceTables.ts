import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateFinanceTables1800000000000 implements MigrationInterface {
  name = 'CreateFinanceTables1800000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── 1. finance_accounts ──────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS finance_accounts (
        id               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        institute_id     BIGINT NOT NULL,
        name             VARCHAR(120) NOT NULL,
        type             ENUM('CASH','BANK') NOT NULL DEFAULT 'CASH',
        current_balance  DECIMAL(14,2) NOT NULL DEFAULT 0.00,
        bank_name        VARCHAR(120) NULL,
        account_number   VARCHAR(60) NULL,
        is_active        TINYINT(1) NOT NULL DEFAULT 1,
        created_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        KEY idx_fa_institute (institute_id, is_active)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // ── 2. finance_categories ─────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS finance_categories (
        id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        institute_id BIGINT NOT NULL,
        name         VARCHAR(100) NOT NULL,
        type         ENUM('INCOME','EXPENSE') NOT NULL,
        description  TEXT NULL,
        is_active    TINYINT(1) NOT NULL DEFAULT 1,
        created_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        KEY idx_fc_institute (institute_id, is_active)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // ── 3. teacher_wallets ────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS teacher_wallets (
        id                BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        teacher_id        BIGINT NOT NULL,
        institute_id      BIGINT NOT NULL,
        balance           DECIMAL(14,2) NOT NULL DEFAULT 0.00,
        total_earned      DECIMAL(14,2) NOT NULL DEFAULT 0.00,
        total_deductions  DECIMAL(14,2) NOT NULL DEFAULT 0.00,
        total_paid_out    DECIMAL(14,2) NOT NULL DEFAULT 0.00,
        created_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE KEY idx_tw_teacher_institute (teacher_id, institute_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // ── 4. finance_ledger ─────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS finance_ledger (
        id                  BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        institute_id        BIGINT NOT NULL,
        amount              DECIMAL(14,2) NOT NULL,
        type                ENUM('CREDIT','DEBIT') NOT NULL,
        tx_source           ENUM('PAYMENT_APPROVAL','PHYSICAL_COLLECT','FUND_TRANSFER','TEACHER_PAYOUT','TEACHER_DEDUCTION','MANUAL') NOT NULL DEFAULT 'MANUAL',
        from_account_id     BIGINT UNSIGNED NULL,
        to_account_id       BIGINT UNSIGNED NULL,
        category_id         BIGINT UNSIGNED NULL,
        teacher_id          BIGINT NULL,
        teacher_amount      DECIMAL(14,2) NULL,
        institute_amount    DECIMAL(14,2) NULL,
        commission_pct      DECIMAL(5,2) NULL,
        reference_id        VARCHAR(100) NULL,
        student_id          BIGINT NULL,
        student_name        VARCHAR(200) NULL,
        description         VARCHAR(300) NULL,
        admin_note          TEXT NULL,
        created_by_user_id  BIGINT NOT NULL,
        created_by_name     VARCHAR(200) NULL,
        created_at          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        KEY idx_fl_institute_date  (institute_id, created_at),
        KEY idx_fl_collector       (created_by_user_id, institute_id),
        KEY idx_fl_teacher         (teacher_id, institute_id),
        KEY idx_fl_account         (to_account_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // ── 5. Add commission_pct to institute_class table (idempotent) ───────────
    const [commCol] = await queryRunner.query(`
      SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME   = 'institute_classes'
        AND COLUMN_NAME  = 'teacher_commission_pct'
    `);
    if (!commCol) {
      await queryRunner.query(`
        ALTER TABLE institute_classes
        ADD COLUMN teacher_commission_pct DECIMAL(5,2) NOT NULL DEFAULT 0.00
          COMMENT 'Percentage of fee income kept by the institute; remainder goes to teacher wallet'
      `).catch(() => {
        // table may be named differently — ignore, can be set manually
      });
    }

    // ── 6. Seed default "Cash Locker" account for every existing institute ────
    await queryRunner.query(`
      INSERT IGNORE INTO finance_accounts (institute_id, name, type, is_active)
      SELECT id, 'Cash Locker', 'CASH', 1 FROM institutes WHERE is_active = 1
    `);

    // ── 7. Seed default categories for every existing institute ───────────────
    await queryRunner.query(`
      INSERT IGNORE INTO finance_categories (institute_id, name, type)
      SELECT i.id, cats.name, cats.type
      FROM institutes i
      CROSS JOIN (
        SELECT 'Tuition Fee'    AS name, 'INCOME'  AS type UNION ALL
        SELECT 'Facility Fee',           'INCOME'           UNION ALL
        SELECT 'Exam Fee',               'INCOME'           UNION ALL
        SELECT 'Printing',               'EXPENSE'          UNION ALL
        SELECT 'Salary',                 'EXPENSE'          UNION ALL
        SELECT 'Utilities',              'EXPENSE'
      ) cats
      WHERE i.is_active = 1
    `);

    console.log('✅ Finance tables created and seeded');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS finance_ledger`);
    await queryRunner.query(`DROP TABLE IF EXISTS teacher_wallets`);
    await queryRunner.query(`DROP TABLE IF EXISTS finance_categories`);
    await queryRunner.query(`DROP TABLE IF EXISTS finance_accounts`);
  }
}
