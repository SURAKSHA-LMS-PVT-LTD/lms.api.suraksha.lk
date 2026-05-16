import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migrate institute_classes.id and subjects.id from BIGINT to UUID.
 *
 * Must run AFTER MigrateInstitutesToUUID1790000000001 because
 * institute_classes.institute_id is already VARCHAR(36) by then.
 *
 * Child tables referencing institute_classes.id:
 *   institute_class_students.institute_class_id
 *   institute_class_subjects.class_id
 *   institute_class_subject_students.class_id
 *   institute_class_calendar.class_id
 *   institute_class_calendar.merged_with_class_id
 *   push_notifications.class_id
 *   institute_class_lectures.class_id
 *   institute_lectures.class_id
 *   institute_class_subject_lectures.class_id
 *   lecture_live_attendances.class_id
 *   institute_class_subject_homeworks.class_id
 *   institute_class_subject_exams.class_id
 *   institute_class_subject_resaults.class_id
 *   study_materials.class_id
 *   institute_class_payments.class_id
 *   institute_class_payment_submissions.class_id (via payment)
 *   institute_class_subject_payments.class_id
 *
 * Child tables referencing subjects.id:
 *   institute_class_subjects.subject_id
 *   institute_class_subject_students.subject_id
 *   push_notifications.subject_id
 *   institute_class_subject_lectures.subject_id
 *   lecture_live_attendances.subject_id
 *   institute_class_subject_homeworks.subject_id
 *   institute_class_subject_exams.subject_id
 *   institute_class_subject_resaults.subject_id
 *   study_materials.subject_id
 *   institute_class_subject_payments.subject_id
 */
export class MigrateClassesAndSubjectsToUUID1790000000002 implements MigrationInterface {
  name = 'MigrateClassesAndSubjectsToUUID1790000000002';

  private classChildTables = [
    'institute_class_students',       // column: institute_class_id
    'institute_class_subjects',       // column: class_id
    'institute_class_subject_students',
    'institute_class_calendar',
    'push_notifications',
    'institute_class_lectures',
    'institute_lectures',
    'institute_class_subject_lectures',
    'lecture_live_attendances',
    'institute_class_subject_homeworks',
    'institute_class_subject_exams',
    'institute_class_subject_resaults',
    'study_materials',
    'institute_class_payments',
    'institute_class_subject_payments',
  ];

  private subjectChildTables = [
    'institute_class_subjects',
    'institute_class_subject_students',
    'push_notifications',
    'institute_class_subject_lectures',
    'lecture_live_attendances',
    'institute_class_subject_homeworks',
    'institute_class_subject_exams',
    'institute_class_subject_resaults',
    'study_materials',
    'institute_class_subject_payments',
  ];

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ════════════════════════════════════════════════════════════════
    // Part A: institute_classes
    // ════════════════════════════════════════════════════════════════

    // A1: Add uuid + old_id columns to institute_classes
    await queryRunner.query(`ALTER TABLE institute_classes ADD COLUMN uuid_new VARCHAR(36) NULL`);
    await queryRunner.query(`UPDATE institute_classes SET uuid_new = UUID() WHERE uuid_new IS NULL`);
    await queryRunner.query(`ALTER TABLE institute_classes ADD COLUMN old_id BIGINT NULL`);
    await queryRunner.query(`UPDATE institute_classes SET old_id = id`);

    // A2: Add class_uuid columns to child tables and backfill
    const classColName: Record<string, string> = {
      'institute_class_students': 'institute_class_id',
      'institute_class_calendar': 'class_id',
      'push_notifications': 'class_id',
    };
    for (const table of this.classChildTables) {
      const srcCol = classColName[table] ?? 'class_id';
      try {
        await queryRunner.query(`ALTER TABLE \`${table}\` ADD COLUMN class_uuid VARCHAR(36) NULL`);
        await queryRunner.query(
          `UPDATE \`${table}\` t JOIN institute_classes c ON t.\`${srcCol}\` = c.old_id SET t.class_uuid = c.uuid_new`,
        );
      } catch { /* skip */ }
    }

    // Handle merged_with_class_id separately
    try {
      await queryRunner.query(`ALTER TABLE institute_class_calendar ADD COLUMN merged_class_uuid VARCHAR(36) NULL`);
      await queryRunner.query(
        `UPDATE institute_class_calendar t JOIN institute_classes c ON t.merged_with_class_id = c.old_id SET t.merged_class_uuid = c.uuid_new`,
      );
    } catch { /* skip */ }

    // A3: Drop FKs referencing institute_classes.id
    const fkRows: any[] = await queryRunner.query(`
      SELECT TABLE_NAME, CONSTRAINT_NAME
      FROM information_schema.KEY_COLUMN_USAGE
      WHERE REFERENCED_TABLE_SCHEMA = DATABASE()
        AND REFERENCED_TABLE_NAME = 'institute_classes'
        AND REFERENCED_COLUMN_NAME = 'id'
    `);
    for (const row of fkRows) {
      try {
        await queryRunner.query(`ALTER TABLE \`${row.TABLE_NAME}\` DROP FOREIGN KEY \`${row.CONSTRAINT_NAME}\``);
      } catch { /* ignore */ }
    }

    // A4: Swap institute_classes PK (remove AUTO_INCREMENT first — MySQL requirement)
    await queryRunner.query(`ALTER TABLE institute_classes MODIFY COLUMN id BIGINT NOT NULL`);
    await queryRunner.query(`ALTER TABLE institute_classes DROP PRIMARY KEY`);
    await queryRunner.query(`ALTER TABLE institute_classes MODIFY COLUMN id VARCHAR(36) NOT NULL DEFAULT ''`);
    await queryRunner.query(`UPDATE institute_classes SET id = uuid_new`);
    await queryRunner.query(`ALTER TABLE institute_classes ADD PRIMARY KEY (id)`);
    await queryRunner.query(`ALTER TABLE institute_classes DROP COLUMN uuid_new`);
    await queryRunner.query(`ALTER TABLE institute_classes DROP COLUMN old_id`);
    await queryRunner.query(`ALTER TABLE institute_classes MODIFY COLUMN id VARCHAR(36) NOT NULL`);

    // A5: Swap class_id columns in child tables
    for (const table of this.classChildTables) {
      const srcCol = classColName[table] ?? 'class_id';
      try {
        const cols: any[] = await queryRunner.query(`SHOW COLUMNS FROM \`${table}\` LIKE 'class_uuid'`);
        if (!cols.length) continue;

        try { await queryRunner.query(`ALTER TABLE \`${table}\` DROP PRIMARY KEY`); } catch { /* ok */ }
        try { await queryRunner.query(`ALTER TABLE \`${table}\` DROP COLUMN \`${srcCol}\``); } catch { /* ok */ }

        await queryRunner.query(
          `ALTER TABLE \`${table}\` CHANGE COLUMN class_uuid \`${srcCol}\` VARCHAR(36) NULL`,
        );
      } catch (e) {
        console.warn(`[Migration] Skipped ${table} class_id swap: ${e.message}`);
      }
    }

    // merged_with_class_id
    try {
      await queryRunner.query(`ALTER TABLE institute_class_calendar DROP COLUMN merged_with_class_id`);
      await queryRunner.query(`ALTER TABLE institute_class_calendar CHANGE COLUMN merged_class_uuid merged_with_class_id VARCHAR(36) NULL`);
    } catch { /* skip */ }

    // Re-add composite PKs
    try {
      await queryRunner.query(
        `ALTER TABLE institute_class_students MODIFY institute_class_id VARCHAR(36) NOT NULL, ADD PRIMARY KEY (institute_id, institute_class_id, student_user_id)`,
      );
    } catch { /* ignore */ }
    try {
      await queryRunner.query(
        `ALTER TABLE institute_class_subjects MODIFY class_id VARCHAR(36) NOT NULL, ADD PRIMARY KEY (institute_id, class_id, subject_id)`,
      );
    } catch { /* ignore */ }
    try {
      await queryRunner.query(
        `ALTER TABLE institute_class_subject_students MODIFY class_id VARCHAR(36) NOT NULL, ADD PRIMARY KEY (institute_id, class_id, subject_id, student_id)`,
      );
    } catch { /* ignore */ }

    // ════════════════════════════════════════════════════════════════
    // Part B: subjects
    // ════════════════════════════════════════════════════════════════

    // B1: Add uuid + old_id to subjects
    await queryRunner.query(`ALTER TABLE subjects ADD COLUMN uuid_new VARCHAR(36) NULL`);
    await queryRunner.query(`UPDATE subjects SET uuid_new = UUID() WHERE uuid_new IS NULL`);
    await queryRunner.query(`ALTER TABLE subjects ADD COLUMN old_id BIGINT NULL`);
    await queryRunner.query(`UPDATE subjects SET old_id = id`);

    // B2: Add subject_uuid to child tables
    for (const table of this.subjectChildTables) {
      try {
        await queryRunner.query(`ALTER TABLE \`${table}\` ADD COLUMN subject_uuid VARCHAR(36) NULL`);
        await queryRunner.query(
          `UPDATE \`${table}\` t JOIN subjects s ON t.subject_id = s.old_id SET t.subject_uuid = s.uuid_new`,
        );
      } catch { /* skip */ }
    }

    // B3: Drop FKs referencing subjects.id
    const subFkRows: any[] = await queryRunner.query(`
      SELECT TABLE_NAME, CONSTRAINT_NAME
      FROM information_schema.KEY_COLUMN_USAGE
      WHERE REFERENCED_TABLE_SCHEMA = DATABASE()
        AND REFERENCED_TABLE_NAME = 'subjects'
        AND REFERENCED_COLUMN_NAME = 'id'
    `);
    for (const row of subFkRows) {
      try {
        await queryRunner.query(`ALTER TABLE \`${row.TABLE_NAME}\` DROP FOREIGN KEY \`${row.CONSTRAINT_NAME}\``);
      } catch { /* ignore */ }
    }

    // B4: Swap subjects PK (remove AUTO_INCREMENT first — MySQL requirement)
    await queryRunner.query(`ALTER TABLE subjects MODIFY COLUMN id BIGINT NOT NULL`);
    await queryRunner.query(`ALTER TABLE subjects DROP PRIMARY KEY`);
    await queryRunner.query(`ALTER TABLE subjects MODIFY COLUMN id VARCHAR(36) NOT NULL DEFAULT ''`);
    await queryRunner.query(`UPDATE subjects SET id = uuid_new`);
    await queryRunner.query(`ALTER TABLE subjects ADD PRIMARY KEY (id)`);
    await queryRunner.query(`ALTER TABLE subjects DROP COLUMN uuid_new`);
    await queryRunner.query(`ALTER TABLE subjects DROP COLUMN old_id`);
    await queryRunner.query(`ALTER TABLE subjects MODIFY COLUMN id VARCHAR(36) NOT NULL`);

    // B5: Swap subject_id columns in child tables
    for (const table of this.subjectChildTables) {
      try {
        const cols: any[] = await queryRunner.query(`SHOW COLUMNS FROM \`${table}\` LIKE 'subject_uuid'`);
        if (!cols.length) continue;

        try { await queryRunner.query(`ALTER TABLE \`${table}\` DROP PRIMARY KEY`); } catch { /* ok */ }
        try { await queryRunner.query(`ALTER TABLE \`${table}\` DROP COLUMN subject_id`); } catch { /* ok */ }

        await queryRunner.query(
          `ALTER TABLE \`${table}\` CHANGE COLUMN subject_uuid subject_id VARCHAR(36) NULL`,
        );
      } catch (e) {
        console.warn(`[Migration] Skipped ${table} subject_id swap: ${e.message}`);
      }
    }

    // Re-add composite PKs for junction tables (subject_id restored)
    try {
      await queryRunner.query(
        `ALTER TABLE institute_class_subjects MODIFY subject_id VARCHAR(36) NOT NULL, ADD PRIMARY KEY (institute_id, class_id, subject_id)`,
      );
    } catch { /* ignore */ }
    try {
      await queryRunner.query(
        `ALTER TABLE institute_class_subject_students MODIFY subject_id VARCHAR(36) NOT NULL, ADD PRIMARY KEY (institute_id, class_id, subject_id, student_id)`,
      );
    } catch { /* ignore */ }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    throw new Error(
      'MigrateClassesAndSubjectsToUUID1790000000002: down() not supported. Restore from backup.',
    );
  }
}
