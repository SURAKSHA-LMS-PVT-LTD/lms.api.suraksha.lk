import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds allow_multiple_marks to calendar events. When TRUE, a user may have more
 * than one attendance record for the event (e.g. arrival then departure). When
 * FALSE the marker UI prevents a second mark for the same user.
 */
export class AddAllowMultipleMarksToCalendarEvents1831000000000 implements MigrationInterface {
  name = 'AddAllowMultipleMarksToCalendarEvents1831000000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    const table = 'institute_calendar_events';
    if (!(await queryRunner.hasColumn(table, 'allow_multiple_marks'))) {
      await queryRunner.query(
        `ALTER TABLE ${table} ADD COLUMN allow_multiple_marks tinyint(1) NOT NULL DEFAULT 0`,
      );
    }

    // Performance: the event attendance view + per-student summary filter by
    // (institute_id, event_id) and group by student_id. This composite index makes
    // those reads index-only and avoids scanning unrelated records.
    const idx: any[] = await queryRunner.query(
      `SHOW INDEX FROM attendance_records WHERE Key_name = 'idx_inst_event_student'`,
    );
    if (!idx.length) {
      await queryRunner.query(
        `CREATE INDEX idx_inst_event_student ON attendance_records (institute_id, event_id, student_id)`,
      );
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    const table = 'institute_calendar_events';
    const idx: any[] = await queryRunner.query(
      `SHOW INDEX FROM attendance_records WHERE Key_name = 'idx_inst_event_student'`,
    );
    if (idx.length) {
      await queryRunner.query(`DROP INDEX idx_inst_event_student ON attendance_records`);
    }
    if (await queryRunner.hasColumn(table, 'allow_multiple_marks')) {
      await queryRunner.query(`ALTER TABLE ${table} DROP COLUMN allow_multiple_marks`);
    }
  }
}
