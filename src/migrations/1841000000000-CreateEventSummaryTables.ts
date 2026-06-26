import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Creates two frozen-summary side-tables that are written once when an admin
 * closes an event's attendance.  Querying them is a single keyed read — no
 * COUNT over attendance_records at view time.
 *
 * institute_event_summaries
 *   One row per event.  Institute-wide totals (all students regardless of class).
 *   Written by every close (admin always gets the global picture).
 *
 * institute_event_class_summaries
 *   One row per (event, class).  Class-filtered totals.
 *   Written only when the admin ticks "summarize per class" on close.
 *   Used by the class-level Calendar / Statistics / Summarize tabs to avoid
 *   heavy live queries.
 */
export class CreateEventSummaryTables1841000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── institute_event_summaries ─────────────────────────────────────────────
    // event_date kept here for index-based range queries (avoids joining just to filter by month).
    // event_type and event_title are NOT stored — JOIN to institute_calendar_events instead.
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS institute_event_summaries (
        id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        institute_id  VARCHAR(36)  NOT NULL,
        event_id      BIGINT       NOT NULL,
        event_date    DATE         NOT NULL,

        present_count   INT UNSIGNED NOT NULL DEFAULT 0,
        absent_count    INT UNSIGNED NOT NULL DEFAULT 0,
        late_count      INT UNSIGNED NOT NULL DEFAULT 0,
        left_count      INT UNSIGNED NOT NULL DEFAULT 0,
        total_count     INT UNSIGNED NOT NULL DEFAULT 0,
        attendance_percent DECIMAL(5,2) NOT NULL DEFAULT 0.00,

        unmark_action   ENUM('KEEP_NOT_MARKED','MARK_ABSENT') NOT NULL DEFAULT 'KEEP_NOT_MARKED',
        closed_at       DATETIME     NOT NULL,
        closed_by       VARCHAR(36)  NULL,

        created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

        PRIMARY KEY (id),
        UNIQUE KEY uq_event_summary (event_id),
        INDEX idx_ies_institute_date (institute_id, event_date)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // ── institute_event_class_summaries ───────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS institute_event_class_summaries (
        id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        institute_id  VARCHAR(36)  NOT NULL,
        event_id      BIGINT       NOT NULL,
        class_id      VARCHAR(36)  NOT NULL,
        event_date    DATE         NOT NULL,

        present_count   INT UNSIGNED NOT NULL DEFAULT 0,
        absent_count    INT UNSIGNED NOT NULL DEFAULT 0,
        late_count      INT UNSIGNED NOT NULL DEFAULT 0,
        left_count      INT UNSIGNED NOT NULL DEFAULT 0,
        total_count     INT UNSIGNED NOT NULL DEFAULT 0,
        attendance_percent DECIMAL(5,2) NOT NULL DEFAULT 0.00,

        unmark_action   ENUM('KEEP_NOT_MARKED','MARK_ABSENT') NOT NULL DEFAULT 'KEEP_NOT_MARKED',
        closed_at       DATETIME     NOT NULL,
        closed_by       VARCHAR(36)  NULL,

        created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

        PRIMARY KEY (id),
        UNIQUE KEY uq_event_class_summary (event_id, class_id),
        INDEX idx_iecs_institute_date (institute_id, event_date),
        INDEX idx_iecs_class_date (institute_id, class_id, event_date)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    console.log('✅ Created institute_event_summaries and institute_event_class_summaries');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS institute_event_class_summaries`);
    await queryRunner.query(`DROP TABLE IF EXISTS institute_event_summaries`);
  }
}
