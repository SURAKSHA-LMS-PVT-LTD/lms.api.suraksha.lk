import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds time-based status rule columns to institute calendar events.
 * These drive auto-resolution of Present / Late / LeftEarly when an attendance
 * marker marks a user against an event (the marker never picks a status).
 */
export class AddTimeRulesToCalendarEvents1830000000000 implements MigrationInterface {
  name = 'AddTimeRulesToCalendarEvents1830000000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    const table = 'institute_calendar_events';
    if (!(await queryRunner.hasColumn(table, 'late_after_minutes'))) {
      await queryRunner.query(`ALTER TABLE ${table} ADD COLUMN late_after_minutes int NULL`);
    }
    if (!(await queryRunner.hasColumn(table, 'left_early_before_minutes'))) {
      await queryRunner.query(`ALTER TABLE ${table} ADD COLUMN left_early_before_minutes int NULL`);
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    const table = 'institute_calendar_events';
    if (await queryRunner.hasColumn(table, 'left_early_before_minutes')) {
      await queryRunner.query(`ALTER TABLE ${table} DROP COLUMN left_early_before_minutes`);
    }
    if (await queryRunner.hasColumn(table, 'late_after_minutes')) {
      await queryRunner.query(`ALTER TABLE ${table} DROP COLUMN late_after_minutes`);
    }
  }
}
