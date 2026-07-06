import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Shifts every attendance_records row's date/time columns forward by exactly +1 day
 * (date, timestamp, check_in_time, check_out_time), and institute_class_attendance_sessions.date
 * in lockstep, since 8,979 of 9,315 attendance rows reference a session via class_session_id.
 *
 * Runs row by row (not a single bulk UPDATE) so progress can be observed/verified incrementally
 * on this production table, at the cost of a longer migration run.
 *
 * dynamo_pk/dynamo_sk are deliberately left untouched: they are an internal sync/dedup key
 * (UQ_dynamo_pk_sk), not read by any date-range query, and simulating the shift against them
 * produced 240 collisions with already-existing keys — rewriting them is unnecessary risk for
 * a key nothing user-facing depends on.
 *
 * Session `name` text columns are deliberately NOT touched even though some embed a date
 * substring (e.g. "2026-04-22-Wed-AL27") — explicit instruction: only real date/timestamp
 * columns shift, not free-text labels.
 *
 * Only 6 attendance rows reference institute_calendar_days/institute_calendar_events
 * (ids 3, 5, 8, 9, shared correctly among those 6 rows). Shifting those shared day/event rows
 * by +1 day would create a duplicate calendar day for the same institute+date in two cases
 * (id 5 -> collides with existing id 6; id 8 -> collides with existing id 9), since there's no
 * unique(institute_id, calendar_date) constraint to catch that. Instead of mutating the shared
 * rows, this migration repoints those 6 attendance rows' calendar_day_id/event_id to the
 * already-existing day/event for the shifted date, avoiding duplicate calendar days entirely.
 */
export class ShiftAttendanceDatesByOneDay1851000000000 implements MigrationInterface {
  name = 'ShiftAttendanceDatesByOneDay1851000000000';

  private readonly calendarRepoints: Array<{ attendanceId: number; newCalendarDayId: number; newEventId: number; oldCalendarDayId: number; oldEventId: number }> = [
    // id 9169 (date 06-24 -> 06-25): existing calendar_day/event id 6 already represents 06-25
    { attendanceId: 9169, newCalendarDayId: 6, newEventId: 6, oldCalendarDayId: 5, oldEventId: 5 },
    // id 9186 (date 06-26 -> 06-27): existing calendar_day/event id 9 already represents 06-27
    { attendanceId: 9186, newCalendarDayId: 9, newEventId: 9, oldCalendarDayId: 8, oldEventId: 8 },
  ];

  public async up(queryRunner: QueryRunner): Promise<void> {
    const attendanceIds: Array<{ id: number }> = await queryRunner.query(
      `SELECT id FROM attendance_records ORDER BY id`,
    );
    for (const { id } of attendanceIds) {
      await queryRunner.query(
        `UPDATE attendance_records
         SET
           \`date\` = DATE_ADD(\`date\`, INTERVAL 1 DAY),
           \`timestamp\` = \`timestamp\` + 86400000,
           check_in_time = CASE WHEN check_in_time IS NOT NULL THEN DATE_ADD(check_in_time, INTERVAL 1 DAY) ELSE NULL END,
           check_out_time = CASE WHEN check_out_time IS NOT NULL THEN DATE_ADD(check_out_time, INTERVAL 1 DAY) ELSE NULL END
         WHERE id = ?`,
        [id],
      );
    }

    const sessionIds: Array<{ id: string }> = await queryRunner.query(
      `SELECT id FROM institute_class_attendance_sessions ORDER BY id`,
    );
    for (const { id } of sessionIds) {
      await queryRunner.query(
        `UPDATE institute_class_attendance_sessions SET \`date\` = DATE_ADD(\`date\`, INTERVAL 1 DAY) WHERE id = ?`,
        [id],
      );
    }

    // ids 3 and 9 shift in place (no pre-existing day/event for the shifted date for that institute);
    // ids 5 and 8 are NOT shifted in place (would collide with existing days 6 and 9) — instead the
    // 6 attendance rows are repointed below.
    for (const dayId of [3, 9]) {
      await queryRunner.query(
        `UPDATE institute_calendar_days SET calendar_date = DATE_ADD(calendar_date, INTERVAL 1 DAY) WHERE id = ?`,
        [dayId],
      );
    }
    for (const eventId of [3, 9]) {
      await queryRunner.query(
        `UPDATE institute_calendar_events SET event_date = DATE_ADD(event_date, INTERVAL 1 DAY) WHERE id = ?`,
        [eventId],
      );
    }

    for (const r of this.calendarRepoints) {
      await queryRunner.query(
        `UPDATE attendance_records SET calendar_day_id = ?, event_id = ? WHERE id = ?`,
        [r.newCalendarDayId, r.newEventId, r.attendanceId],
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const r of this.calendarRepoints) {
      await queryRunner.query(
        `UPDATE attendance_records SET calendar_day_id = ?, event_id = ? WHERE id = ?`,
        [r.oldCalendarDayId, r.oldEventId, r.attendanceId],
      );
    }

    for (const eventId of [3, 9]) {
      await queryRunner.query(
        `UPDATE institute_calendar_events SET event_date = DATE_SUB(event_date, INTERVAL 1 DAY) WHERE id = ?`,
        [eventId],
      );
    }
    for (const dayId of [3, 9]) {
      await queryRunner.query(
        `UPDATE institute_calendar_days SET calendar_date = DATE_SUB(calendar_date, INTERVAL 1 DAY) WHERE id = ?`,
        [dayId],
      );
    }

    const sessionIds: Array<{ id: string }> = await queryRunner.query(
      `SELECT id FROM institute_class_attendance_sessions ORDER BY id`,
    );
    for (const { id } of sessionIds) {
      await queryRunner.query(
        `UPDATE institute_class_attendance_sessions SET \`date\` = DATE_SUB(\`date\`, INTERVAL 1 DAY) WHERE id = ?`,
        [id],
      );
    }

    const attendanceIds: Array<{ id: number }> = await queryRunner.query(
      `SELECT id FROM attendance_records ORDER BY id`,
    );
    for (const { id } of attendanceIds) {
      await queryRunner.query(
        `UPDATE attendance_records
         SET
           \`date\` = DATE_SUB(\`date\`, INTERVAL 1 DAY),
           \`timestamp\` = \`timestamp\` - 86400000,
           check_in_time = CASE WHEN check_in_time IS NOT NULL THEN DATE_SUB(check_in_time, INTERVAL 1 DAY) ELSE NULL END,
           check_out_time = CASE WHEN check_out_time IS NOT NULL THEN DATE_SUB(check_out_time, INTERVAL 1 DAY) ELSE NULL END
         WHERE id = ?`,
        [id],
      );
    }
  }
}
