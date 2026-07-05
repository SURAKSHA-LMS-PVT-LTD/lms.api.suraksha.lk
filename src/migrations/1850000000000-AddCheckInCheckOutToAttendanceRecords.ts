import { MigrationInterface, QueryRunner } from 'typeorm';
import { columnExists, indexExists } from './utils/safe-table-ops';

/**
 * Adds independent check-in / check-out tracking to `attendance_records`.
 *
 * Design notes (see conversation record for full rationale):
 * - Six new nullable columns, added to the existing row rather than a second
 *   table — one attendance instance stays one row; check-out is an UPDATE,
 *   not a new INSERT.
 * - No new UNIQUE constraint. Real historical data already contains
 *   legitimate/test duplicate rows on every candidate key (e.g. the same
 *   student marked 4x in one class_session_id, or 2x for the same
 *   institute+student+date+event_id) because this system allows multiple
 *   independent attendance instances per student per day by design. Adding
 *   a UNIQUE index here would fail outright against real data, and cleaning
 *   up historical rows to force one is out of scope. Pairing a check-out to
 *   its check-in is instead done at the application layer: find the most
 *   recent matching row with check_out_time IS NULL.
 * - Backfill: existing rows get check_in_* copied from their current
 *   status/timestamp (the only information we have about them).
 *   check_in_marked_by backfills to 'legacy' since who marked historical
 *   rows was never recorded. check_out_* stays NULL — no historical row
 *   has a known checkout.
 */
export class AddCheckInCheckOutToAttendanceRecords1850000000000 implements MigrationInterface {
  name = 'AddCheckInCheckOutToAttendanceRecords1850000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const table = 'attendance_records';

    if (!(await columnExists(queryRunner, table, 'check_in_time'))) {
      await queryRunner.query(`
        ALTER TABLE \`${table}\`
          ADD COLUMN \`check_in_time\` DATETIME NULL COMMENT 'When the student checked in (first mark of this attendance instance)' AFTER \`timestamp\`,
          ADD COLUMN \`check_in_status\` TINYINT NULL COMMENT 'Status at check-in: 0=Absent,1=Present,2=Late,3=Left,4=LeftEarly,5=LeftLately' AFTER \`check_in_time\`,
          ADD COLUMN \`check_in_marked_by\` VARCHAR(64) NULL COMMENT 'User ID (or system/device UID) who recorded the check-in' AFTER \`check_in_status\`,
          ADD COLUMN \`check_out_time\` DATETIME NULL COMMENT 'When the student checked out, if this instance has a checkout' AFTER \`check_in_marked_by\`,
          ADD COLUMN \`check_out_status\` TINYINT NULL COMMENT 'Status at check-out, independent of check_in_status' AFTER \`check_out_time\`,
          ADD COLUMN \`check_out_marked_by\` VARCHAR(64) NULL COMMENT 'User ID (or system/device UID) who recorded the check-out' AFTER \`check_out_status\`
      `);
    }

    // Non-unique indexes to keep "find most recent open check-in" fast for both pairing modes.
    if (!(await indexExists(queryRunner, table, 'IDX_session_checkin_open'))) {
      await queryRunner.query(`
        CREATE INDEX \`IDX_session_checkin_open\` ON \`${table}\` (\`class_session_id\`, \`student_id\`, \`check_out_time\`)
      `);
    }
    if (!(await indexExists(queryRunner, table, 'IDX_institute_event_checkin_open'))) {
      await queryRunner.query(`
        CREATE INDEX \`IDX_institute_event_checkin_open\` ON \`${table}\` (\`institute_id\`, \`student_id\`, \`date\`, \`event_id\`, \`check_out_time\`)
      `);
    }

    // Backfill existing rows: check-in mirrors the legacy status/timestamp;
    // checkout is unknown for historical rows and stays NULL.
    await queryRunner.query(`
      UPDATE \`${table}\`
      SET
        \`check_in_time\` = FROM_UNIXTIME(\`timestamp\` / 1000),
        \`check_in_status\` = \`status\`,
        \`check_in_marked_by\` = 'legacy'
      WHERE \`check_in_time\` IS NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const table = 'attendance_records';

    if (await indexExists(queryRunner, table, 'IDX_institute_event_checkin_open')) {
      await queryRunner.query(`DROP INDEX \`IDX_institute_event_checkin_open\` ON \`${table}\``);
    }
    if (await indexExists(queryRunner, table, 'IDX_session_checkin_open')) {
      await queryRunner.query(`DROP INDEX \`IDX_session_checkin_open\` ON \`${table}\``);
    }

    if (await columnExists(queryRunner, table, 'check_in_time')) {
      await queryRunner.query(`
        ALTER TABLE \`${table}\`
          DROP COLUMN \`check_in_time\`,
          DROP COLUMN \`check_in_status\`,
          DROP COLUMN \`check_in_marked_by\`,
          DROP COLUMN \`check_out_time\`,
          DROP COLUMN \`check_out_status\`,
          DROP COLUMN \`check_out_marked_by\`
      `);
    }
  }
}
