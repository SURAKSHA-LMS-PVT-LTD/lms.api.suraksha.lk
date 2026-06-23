import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds attendance close + frozen summary columns to institute calendar events.
 * Closing an event computes the summary once (present/absent/late/left + %), so
 * viewing a closed event never re-runs COUNT queries over attendance_records.
 */
export class AddAttendanceCloseSummaryToCalendarEvents1829000000000 implements MigrationInterface {
  name = 'AddAttendanceCloseSummaryToCalendarEvents1829000000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    const table = 'institute_calendar_events';

    if (!(await queryRunner.hasColumn(table, 'is_attendance_closed'))) {
      await queryRunner.query(
        `ALTER TABLE ${table} ADD COLUMN is_attendance_closed tinyint(1) NOT NULL DEFAULT 0`,
      );
    }
    if (!(await queryRunner.hasColumn(table, 'attendance_closed_at'))) {
      await queryRunner.query(
        `ALTER TABLE ${table} ADD COLUMN attendance_closed_at timestamp NULL`,
      );
    }
    if (!(await queryRunner.hasColumn(table, 'attendance_close_unmark_action'))) {
      await queryRunner.query(
        `ALTER TABLE ${table} ADD COLUMN attendance_close_unmark_action enum('KEEP_NOT_MARKED','MARK_ABSENT') NULL`,
      );
    }

    const intCols = [
      'summary_present_count',
      'summary_absent_count',
      'summary_late_count',
      'summary_left_count',
      'summary_total_count',
    ];
    for (const c of intCols) {
      if (!(await queryRunner.hasColumn(table, c))) {
        await queryRunner.query(`ALTER TABLE ${table} ADD COLUMN ${c} int NULL`);
      }
    }
    if (!(await queryRunner.hasColumn(table, 'summary_attendance_percent'))) {
      await queryRunner.query(
        `ALTER TABLE ${table} ADD COLUMN summary_attendance_percent decimal(5,2) NULL`,
      );
    }

    // Helps the bulk "summarize past tracked un-summarized events" query.
    const idxExists: any[] = await queryRunner.query(
      `SHOW INDEX FROM ${table} WHERE Key_name = 'idx_inst_close_date'`,
    );
    if (!idxExists.length) {
      await queryRunner.query(
        `CREATE INDEX idx_inst_close_date ON ${table} (institute_id, is_attendance_closed, event_date)`,
      );
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    const table = 'institute_calendar_events';
    const idxExists: any[] = await queryRunner.query(
      `SHOW INDEX FROM ${table} WHERE Key_name = 'idx_inst_close_date'`,
    );
    if (idxExists.length) {
      await queryRunner.query(`DROP INDEX idx_inst_close_date ON ${table}`);
    }
    const cols = [
      'summary_attendance_percent',
      'summary_total_count',
      'summary_left_count',
      'summary_late_count',
      'summary_absent_count',
      'summary_present_count',
      'attendance_close_unmark_action',
      'attendance_closed_at',
      'is_attendance_closed',
    ];
    for (const c of cols) {
      if (await queryRunner.hasColumn(table, c)) {
        await queryRunner.query(`ALTER TABLE ${table} DROP COLUMN ${c}`);
      }
    }
  }
}
