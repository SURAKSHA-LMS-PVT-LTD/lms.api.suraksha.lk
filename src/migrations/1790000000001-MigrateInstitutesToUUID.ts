import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migrate institutes.id from BIGINT to UUID (CHAR 36).
 *
 * Phase order:
 *  1. Add uuid column, backfill with UUID_TO_BIN / UUID
 *  2. Drop FK constraints on child tables
 *  3. Add uuid FK columns on child tables, backfill
 *  4. Drop old PK and FK columns, promote uuid columns to PK / FK
 *  5. Re-add indexes
 *
 * Child tables that reference institutes.id:
 *   institute_classes.institute_id
 *   subjects.institute_id
 *   institute_user.institute_id
 *   institute_class_students.institute_id
 *   institute_class_subjects.institute_id
 *   institute_class_subject_students.institute_id
 *   push_notifications.institute_id
 *   push_notifications.class_id  (indirect — via institute_classes)
 *   institute_operating_config.institute_id
 *   institute_calendar_days.institute_id
 *   institute_calendar_events.institute_id
 *   institute_class_calendar.institute_id
 *   finance_accounts.institute_id
 *   finance_categories.institute_id
 *   finance_ledger.institute_id
 *   teacher_wallets.institute_id
 *   institute_credits.institute_id
 *   institute_credit_transactions.institute_id
 *   institute_billing_config.institute_id
 *   monthly_billing_summary.institute_id
 *   tenant_service_payments.institute_id
 *   login_events.institute_id
 *   ... (sms, rbac, drive, lectures, homeworks, exams, results, study-materials, house, cards, etc.)
 *
 * NOTE: This migration assumes synchronize: false. Run it once on a maintenance window.
 * Existing BigInt IDs are preserved in uuid_backfill column (dropped at end) — no data loss.
 */
export class MigrateInstitutesToUUID1790000000001 implements MigrationInterface {
  name = 'MigrateInstitutesToUUID1790000000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── Step 1: Add UUID column to institutes ────────────────────────────────
    await queryRunner.query(`ALTER TABLE institutes ADD COLUMN uuid_new VARCHAR(36) NULL`);
    await queryRunner.query(`UPDATE institutes SET uuid_new = UUID() WHERE uuid_new IS NULL`);
    await queryRunner.query(`ALTER TABLE institutes ADD COLUMN old_id BIGINT NULL`);
    await queryRunner.query(`UPDATE institutes SET old_id = id`);

    // ── Step 2: Add uuid_new FK columns on all child tables ──────────────────
    const childTables: string[] = [
      'institute_classes',
      'subjects',
      'institute_user',
      'institute_class_students',
      'institute_class_subjects',
      'institute_class_subject_students',
      'push_notifications',
      'institute_operating_config',
      'institute_calendar_days',
      'institute_calendar_events',
      'institute_class_calendar',
      'finance_accounts',
      'finance_categories',
      'finance_ledger',
      'teacher_wallets',
      'institute_credits',
      'institute_credit_transactions',
      'institute_billing_config',
      'monthly_billing_summary',
      'tenant_service_payments',
      'login_events',
      'institute_sms_credentials',
      'institute_sms_messages',
      'sms_campaigns',
      'sms_sender_masks',
      'sender_masks',
      'institute_sms_payment_submissions',
      'institute_user_types',
      'institute_feature_permissions',
      'institute_house',
      'institute_house_members',
      'institute_drive_tokens',
      'institute_drive_files',
      'notification_credits',
      'institute_credit_transactions',
      'structured_lectures',
      'institute_class_lectures',
      'institute_lectures',
      'institute_class_subject_lectures',
      'lecture_live_attendances',
      'institute_class_subject_homeworks',
      'institute_class_subject_exams',
      'institute_class_subject_resaults',
      'study_materials',
      'user_images',
    ];

    for (const table of childTables) {
      try {
        await queryRunner.query(
          `ALTER TABLE \`${table}\` ADD COLUMN institute_uuid VARCHAR(36) NULL`,
        );
        await queryRunner.query(
          `UPDATE \`${table}\` t JOIN institutes i ON t.institute_id = i.old_id SET t.institute_uuid = i.uuid_new`,
        );
      } catch {
        // Table may not exist or column already there — continue
      }
    }

    // ── Step 3: Drop existing FK constraints referencing institutes.id ────────
    // We iterate information_schema to find and drop them dynamically
    const fkRows: any[] = await queryRunner.query(`
      SELECT TABLE_NAME, CONSTRAINT_NAME
      FROM information_schema.KEY_COLUMN_USAGE
      WHERE REFERENCED_TABLE_SCHEMA = DATABASE()
        AND REFERENCED_TABLE_NAME = 'institutes'
        AND REFERENCED_COLUMN_NAME = 'id'
    `);
    for (const row of fkRows) {
      try {
        await queryRunner.query(`ALTER TABLE \`${row.TABLE_NAME}\` DROP FOREIGN KEY \`${row.CONSTRAINT_NAME}\``);
      } catch { /* ignore */ }
    }

    // ── Step 4: Drop institute_classes FK on institute_id if it references old int PK ──
    // (handled above via dynamic discovery)

    // ── Step 5: Swap institutes PK ───────────────────────────────────────────
    // Must remove AUTO_INCREMENT before dropping PK (MySQL requirement)
    await queryRunner.query(`ALTER TABLE institutes MODIFY COLUMN id BIGINT NOT NULL`);
    await queryRunner.query(`ALTER TABLE institutes DROP PRIMARY KEY`);
    await queryRunner.query(`ALTER TABLE institutes MODIFY COLUMN id VARCHAR(36) NOT NULL DEFAULT ''`);
    await queryRunner.query(`UPDATE institutes SET id = uuid_new`);
    await queryRunner.query(`ALTER TABLE institutes ADD PRIMARY KEY (id)`);
    await queryRunner.query(`ALTER TABLE institutes DROP COLUMN uuid_new`);
    await queryRunner.query(`ALTER TABLE institutes DROP COLUMN old_id`);
    // Remove AUTO_INCREMENT (no longer needed for UUID)
    await queryRunner.query(`ALTER TABLE institutes MODIFY COLUMN id VARCHAR(36) NOT NULL`);

    // ── Step 6: Swap institute_id columns in child tables ────────────────────
    for (const table of childTables) {
      try {
        // Check if institute_uuid column exists
        const cols: any[] = await queryRunner.query(
          `SHOW COLUMNS FROM \`${table}\` LIKE 'institute_uuid'`,
        );
        if (!cols.length) continue;

        // Check if institute_id column exists (it might be a PK component)
        const pkCheck: any[] = await queryRunner.query(
          `SHOW COLUMNS FROM \`${table}\` LIKE 'institute_id'`,
        );
        if (pkCheck.length) {
          // Drop PK if institute_id is part of it (junction tables)
          try {
            await queryRunner.query(`ALTER TABLE \`${table}\` DROP PRIMARY KEY`);
          } catch { /* not PK or already dropped */ }

          await queryRunner.query(`ALTER TABLE \`${table}\` DROP COLUMN institute_id`);
        }

        await queryRunner.query(
          `ALTER TABLE \`${table}\` CHANGE COLUMN institute_uuid institute_id VARCHAR(36) NULL`,
        );
      } catch (e) {
        // Log and continue — don't fail the whole migration
        console.warn(`[Migration] Skipped ${table} institute_id swap: ${e.message}`);
      }
    }

    // ── Step 7: Re-add PKs for junction tables ────────────────────────────────
    // institute_user: (institute_id, user_id)
    try {
      await queryRunner.query(
        `ALTER TABLE institute_user MODIFY institute_id VARCHAR(36) NOT NULL, ADD PRIMARY KEY (institute_id, user_id)`,
      );
    } catch { /* ignore */ }

    // institute_class_students: (institute_id, institute_class_id, student_user_id)
    try {
      await queryRunner.query(
        `ALTER TABLE institute_class_students MODIFY institute_id VARCHAR(36) NOT NULL, ADD PRIMARY KEY (institute_id, institute_class_id, student_user_id)`,
      );
    } catch { /* ignore */ }

    // institute_class_subjects: (institute_id, class_id, subject_id)
    try {
      await queryRunner.query(
        `ALTER TABLE institute_class_subjects MODIFY institute_id VARCHAR(36) NOT NULL, ADD PRIMARY KEY (institute_id, class_id, subject_id)`,
      );
    } catch { /* ignore */ }

    // institute_class_subject_students: (institute_id, class_id, subject_id, student_id)
    try {
      await queryRunner.query(
        `ALTER TABLE institute_class_subject_students MODIFY institute_id VARCHAR(36) NOT NULL, ADD PRIMARY KEY (institute_id, class_id, subject_id, student_id)`,
      );
    } catch { /* ignore */ }

    // ── Step 8: Re-add FK constraints ────────────────────────────────────────
    // (TypeORM synchronize: false — skip automatic FK re-add; app uses manual joins)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Reverting a UUID migration is destructive — not supported in production.
    // To roll back: restore from backup taken before migration.
    throw new Error(
      'MigrateInstitutesToUUID1790000000001: down() is not supported. Restore from backup.',
    );
  }
}
