import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds frozen attendance-summary counts to class attendance sessions.
 * These are computed once when a session is closed, so viewing a closed session
 * never needs live COUNT queries over attendance_records.
 */
export class AddSummaryCountsToClassAttendanceSessions1828000000000 implements MigrationInterface {
  name = 'AddSummaryCountsToClassAttendanceSessions1828000000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    const table = 'institute_class_attendance_sessions';
    const intCols = ['summary_present_count', 'summary_absent_count', 'summary_late_count'];
    for (const c of intCols) {
      if (!(await queryRunner.hasColumn(table, c))) {
        await queryRunner.query(`ALTER TABLE ${table} ADD COLUMN ${c} int NULL`);
      }
    }
    if (!(await queryRunner.hasColumn(table, 'summary_attendance_percent'))) {
      await queryRunner.query(`ALTER TABLE ${table} ADD COLUMN summary_attendance_percent decimal(5,2) NULL`);
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    const table = 'institute_class_attendance_sessions';
    const cols = [
      'summary_attendance_percent',
      'summary_late_count',
      'summary_absent_count',
      'summary_present_count',
    ];
    for (const c of cols) {
      if (await queryRunner.hasColumn(table, c)) {
        await queryRunner.query(`ALTER TABLE ${table} DROP COLUMN ${c}`);
      }
    }
  }
}
