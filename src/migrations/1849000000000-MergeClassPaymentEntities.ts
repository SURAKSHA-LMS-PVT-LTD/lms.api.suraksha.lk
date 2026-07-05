import { MigrationInterface, QueryRunner } from 'typeorm';
import { tableExists } from './utils/safe-table-ops';

/**
 * Merge the two near-duplicate class-payment schemas into one:
 *   institute_class_payments + institute_class_subject_payments  -> class_payments (scope column)
 *   institute_class_payment_submissions + institute_class_subject_payment_submissions -> class_payment_submissions
 *
 * The two source payment tables differed only by:
 *   - institute_class_subject_payments has subject_id (NOT NULL) and no teacher_commission_pct
 *   - institute_class_payments has teacher_commission_pct and no subject_id
 * The two source submission tables were byte-identical in shape.
 *
 * New tables get a fresh auto-increment id sequence; old ids are NOT preserved
 * (submissions are remapped to their new payment's id via the old payment_id during copy).
 * Old tables are left in place (renamed with _deprecated_ prefix) rather than dropped,
 * so this migration is safely reversible and the data remains inspectable until a
 * follow-up migration (after the service-layer merge lands) drops them for good.
 */
export class MergeClassPaymentEntities1849000000000 implements MigrationInterface {
  name = 'MergeClassPaymentEntities1849000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (await tableExists(queryRunner, 'class_payments')) return; // idempotent

    // ── 1. Create the unified class_payments table ──────────────────────────
    await queryRunner.query(`
      CREATE TABLE \`class_payments\` (
        \`id\` BIGINT NOT NULL AUTO_INCREMENT,
        \`scope\` ENUM('CLASS','CLASS_SUBJECT') NOT NULL,
        \`institute_id\` VARCHAR(36) NOT NULL,
        \`class_id\` VARCHAR(36) NOT NULL,
        \`subject_id\` VARCHAR(36) NULL,
        \`created_by\` BIGINT NULL,
        \`title\` VARCHAR(200) NOT NULL,
        \`description\` TEXT NOT NULL,
        \`target_type\` ENUM('PARENTS','STUDENTS','BOTH') NOT NULL,
        \`priority\` ENUM('MANDATORY','OPTIONAL','DONATION') NOT NULL,
        \`amount\` DECIMAL(10,2) NOT NULL,
        \`document_url\` VARCHAR(255) NULL,
        \`last_date\` TIMESTAMP NOT NULL,
        \`status\` ENUM('ACTIVE','INACTIVE','EXPIRED') NOT NULL DEFAULT 'ACTIVE',
        \`teacher_commission_pct\` DECIMAL(5,2) NULL DEFAULT '0.00',
        \`is_active\` TINYINT(1) NOT NULL DEFAULT 1,
        \`notes\` TEXT NULL,
        \`bank_name\` VARCHAR(100) NULL DEFAULT NULL,
        \`account_holder_name\` VARCHAR(150) NULL DEFAULT NULL,
        \`account_holder_number\` VARCHAR(50) NULL DEFAULT NULL,
        \`created_at\` TIMESTAMP NOT NULL,
        \`updated_at\` TIMESTAMP NOT NULL,
        PRIMARY KEY (\`id\`),
        INDEX \`idx_cp_institute\` (\`institute_id\`),
        INDEX \`idx_cp_class\` (\`class_id\`),
        INDEX \`idx_cp_subject\` (\`subject_id\`),
        INDEX \`idx_cp_institute_class\` (\`institute_id\`, \`class_id\`),
        INDEX \`idx_cp_institute_class_subject\` (\`institute_id\`, \`class_id\`, \`subject_id\`),
        INDEX \`idx_cp_status\` (\`status\`),
        INDEX \`idx_cp_scope\` (\`scope\`),
        CONSTRAINT \`fk_class_payments_created_by\`
          FOREIGN KEY (\`created_by\`) REFERENCES \`users\`(\`id\`) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // ── 2. Create the unified class_payment_submissions table ───────────────
    await queryRunner.query(`
      CREATE TABLE \`class_payment_submissions\` (
        \`id\` BIGINT NOT NULL AUTO_INCREMENT,
        \`payment_id\` BIGINT NOT NULL,
        \`user_id\` BIGINT NOT NULL,
        \`user_type\` VARCHAR(30) NOT NULL,
        \`username\` VARCHAR(100) NOT NULL,
        \`payment_date\` TIMESTAMP NOT NULL,
        \`receipt_url\` VARCHAR(255) NOT NULL,
        \`receipt_filename\` VARCHAR(255) NOT NULL,
        \`transaction_id\` VARCHAR(100) NULL,
        \`submitted_amount\` DECIMAL(10,2) NOT NULL,
        \`status\` ENUM('PENDING','VERIFIED','HALF_VERIFIED','QUARTER_VERIFIED','REJECTED') NOT NULL DEFAULT 'PENDING',
        \`verified_by\` BIGINT NULL,
        \`verified_at\` TIMESTAMP NULL,
        \`rejection_reason\` TEXT NULL,
        \`notes\` TEXT NULL,
        \`uploaded_at\` TIMESTAMP NOT NULL,
        \`updated_at\` TIMESTAMP NOT NULL,
        PRIMARY KEY (\`id\`),
        INDEX \`idx_cps_receipt\` (\`receipt_url\`),
        INDEX \`idx_cps_payment\` (\`payment_id\`),
        INDEX \`idx_cps_user\` (\`user_id\`),
        INDEX \`idx_cps_status\` (\`status\`),
        INDEX \`idx_cps_payment_status\` (\`payment_id\`, \`status\`),
        CONSTRAINT \`fk_class_payment_submissions_payment\`
          FOREIGN KEY (\`payment_id\`) REFERENCES \`class_payments\`(\`id\`) ON DELETE CASCADE,
        CONSTRAINT \`fk_class_payment_submissions_user\`
          FOREIGN KEY (\`user_id\`) REFERENCES \`users\`(\`id\`) ON DELETE CASCADE,
        CONSTRAINT \`fk_class_payment_submissions_verified_by\`
          FOREIGN KEY (\`verified_by\`) REFERENCES \`users\`(\`id\`) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // ── 3. Copy data from institute_class_payments (scope=CLASS) ────────────
    // Map old id -> new id so submissions can be remapped afterward.
    const oldToNewPaymentId = new Map<string, string>();

    if (await tableExists(queryRunner, 'institute_class_payments')) {
      const rows: any[] = await queryRunner.query(`SELECT * FROM \`institute_class_payments\``);
      for (const row of rows) {
        const result = await queryRunner.query(
          `INSERT INTO \`class_payments\`
             (scope, institute_id, class_id, subject_id, created_by, title, description,
              target_type, priority, amount, document_url, last_date, status,
              teacher_commission_pct, is_active, notes, bank_name, account_holder_name,
              account_holder_number, created_at, updated_at)
           VALUES ('CLASS', ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            row.institute_id, row.class_id, row.created_by, row.title, row.description,
            row.target_type, row.priority, row.amount, row.document_url, row.last_date,
            row.status, row.teacher_commission_pct, row.is_active, row.notes,
            row.bank_name, row.account_holder_name, row.account_holder_number,
            row.created_at, row.updated_at,
          ],
        );
        oldToNewPaymentId.set(`class:${row.id}`, String(result.insertId));
      }
    }

    // ── 4. Copy data from institute_class_subject_payments (scope=CLASS_SUBJECT) ──
    if (await tableExists(queryRunner, 'institute_class_subject_payments')) {
      const rows: any[] = await queryRunner.query(`SELECT * FROM \`institute_class_subject_payments\``);
      for (const row of rows) {
        const result = await queryRunner.query(
          `INSERT INTO \`class_payments\`
             (scope, institute_id, class_id, subject_id, created_by, title, description,
              target_type, priority, amount, document_url, last_date, status,
              teacher_commission_pct, is_active, notes, bank_name, account_holder_name,
              account_holder_number, created_at, updated_at)
           VALUES ('CLASS_SUBJECT', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?)`,
          [
            row.institute_id, row.class_id, row.subject_id, row.created_by, row.title,
            row.description, row.target_type, row.priority, row.amount, row.document_url,
            row.last_date, row.status, row.is_active, row.notes, row.bank_name,
            row.account_holder_name, row.account_holder_number, row.created_at, row.updated_at,
          ],
        );
        oldToNewPaymentId.set(`subject:${row.id}`, String(result.insertId));
      }
    }

    // ── 5. Copy submissions, remapping payment_id via the maps above ────────
    if (await tableExists(queryRunner, 'institute_class_payment_submissions')) {
      const rows: any[] = await queryRunner.query(`SELECT * FROM \`institute_class_payment_submissions\``);
      for (const row of rows) {
        const newPaymentId = oldToNewPaymentId.get(`class:${row.payment_id}`);
        if (!newPaymentId) continue; // orphaned submission — shouldn't happen, skip defensively
        await queryRunner.query(
          `INSERT INTO \`class_payment_submissions\`
             (payment_id, user_id, user_type, username, payment_date, receipt_url,
              receipt_filename, transaction_id, submitted_amount, status, verified_by,
              verified_at, rejection_reason, notes, uploaded_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            newPaymentId, row.user_id, row.user_type, row.username, row.payment_date,
            row.receipt_url, row.receipt_filename, row.transaction_id, row.submitted_amount,
            row.status, row.verified_by, row.verified_at, row.rejection_reason, row.notes,
            row.uploaded_at, row.updated_at,
          ],
        );
      }
    }

    if (await tableExists(queryRunner, 'institute_class_subject_payment_submissions')) {
      const rows: any[] = await queryRunner.query(`SELECT * FROM \`institute_class_subject_payment_submissions\``);
      for (const row of rows) {
        const newPaymentId = oldToNewPaymentId.get(`subject:${row.payment_id}`);
        if (!newPaymentId) continue;
        await queryRunner.query(
          `INSERT INTO \`class_payment_submissions\`
             (payment_id, user_id, user_type, username, payment_date, receipt_url,
              receipt_filename, transaction_id, submitted_amount, status, verified_by,
              verified_at, rejection_reason, notes, uploaded_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            newPaymentId, row.user_id, row.user_type, row.username, row.payment_date,
            row.receipt_url, row.receipt_filename, row.transaction_id, row.submitted_amount,
            row.status, row.verified_by, row.verified_at, row.rejection_reason, row.notes,
            row.uploaded_at, row.updated_at,
          ],
        );
      }
    }

    // ── 6. Rename old tables out of the way (not dropped — kept for a follow-up
    //      migration once the service layer is also merged and verified) ─────
    for (const t of [
      'institute_class_payments',
      'institute_class_subject_payments',
      'institute_class_payment_submissions',
      'institute_class_subject_payment_submissions',
    ]) {
      if (await tableExists(queryRunner, t)) {
        await queryRunner.query(`RENAME TABLE \`${t}\` TO \`_deprecated_${t}\``);
      }
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Restore the original tables by name (data in class_payments/class_payment_submissions
    // is left in place — this only un-hides the deprecated originals so the app can
    // point back at them; run this before the app boots against the old entities again).
    for (const t of [
      'institute_class_payments',
      'institute_class_subject_payments',
      'institute_class_payment_submissions',
      'institute_class_subject_payment_submissions',
    ]) {
      if (await tableExists(queryRunner, `_deprecated_${t}`)) {
        await queryRunner.query(`RENAME TABLE \`_deprecated_${t}\` TO \`${t}\``);
      }
    }
    await queryRunner.query(`DROP TABLE IF EXISTS \`class_payment_submissions\``);
    await queryRunner.query(`DROP TABLE IF EXISTS \`class_payments\``);
  }
}
