import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds a soft-delete flag to class attendance sessions. Deleting a session
 * sets is_active = false and removes its attendance_records rows (see
 * ClassAttendanceSessionService.deleteSession), so every existing fetch path
 * (student self-service, admin institute/class/subject views, aggregates,
 * profile reports) stops returning it without needing per-endpoint changes.
 */
export class AddIsActiveToClassAttendanceSessions1853000000000 implements MigrationInterface {
  name = 'AddIsActiveToClassAttendanceSessions1853000000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    const table = 'institute_class_attendance_sessions';
    if (!(await queryRunner.hasColumn(table, 'is_active'))) {
      await queryRunner.query(`ALTER TABLE ${table} ADD COLUMN is_active tinyint(1) NOT NULL DEFAULT 1`);
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    const table = 'institute_class_attendance_sessions';
    if (await queryRunner.hasColumn(table, 'is_active')) {
      await queryRunner.query(`ALTER TABLE ${table} DROP COLUMN is_active`);
    }
  }
}
