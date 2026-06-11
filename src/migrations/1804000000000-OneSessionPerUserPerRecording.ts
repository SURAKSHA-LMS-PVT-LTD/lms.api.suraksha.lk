import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * One session row per user per recording.
 *
 * Changes:
 * 1. Add `times_viewed` (int, default 1) to both session tables.
 * 2. Add UNIQUE KEY (lecture_id, user_id) on lecture_recording_sessions   — for logged-in users.
 * 3. Add UNIQUE KEY (recording_id, user_id) on subject_recording_sessions — for logged-in users.
 *    Guest rows keep user_id = NULL so multiple guest rows can coexist.
 * 4. Add missing composite + single indexes to lecture_recording_sessions
 *    (subject table already has them from the original migration).
 * 5. Deduplicate any existing duplicate (lecture_id, user_id) rows first,
 *    keeping the row with the highest total_watched_seconds.
 */
export class OneSessionPerUserPerRecording1804000000000 implements MigrationInterface {
  async up(qr: QueryRunner): Promise<void> {
    // ── 1. Deduplicate lecture_recording_sessions ─────────────────────────
    // Keep the row with the highest total_watched_seconds per (lecture_id, user_id).
    await qr.query(`
      DELETE lrs
      FROM lecture_recording_sessions lrs
      INNER JOIN lecture_recording_sessions keep_row
        ON  keep_row.lecture_id = lrs.lecture_id
        AND keep_row.user_id    = lrs.user_id
        AND keep_row.user_id    IS NOT NULL
        AND (
          keep_row.total_watched_seconds > lrs.total_watched_seconds
          OR (keep_row.total_watched_seconds = lrs.total_watched_seconds AND keep_row.id > lrs.id)
        )
      WHERE lrs.user_id IS NOT NULL
    `);

    // ── 2. Deduplicate subject_recording_sessions ─────────────────────────
    await qr.query(`
      DELETE srs
      FROM subject_recording_sessions srs
      INNER JOIN subject_recording_sessions keep_row
        ON  keep_row.recording_id = srs.recording_id
        AND keep_row.user_id      = srs.user_id
        AND keep_row.user_id      IS NOT NULL
        AND (
          keep_row.total_watched_seconds > srs.total_watched_seconds
          OR (keep_row.total_watched_seconds = srs.total_watched_seconds AND keep_row.id > srs.id)
        )
      WHERE srs.user_id IS NOT NULL
    `);

    // ── 3. Add times_viewed to lecture_recording_sessions ─────────────────
    await qr.query(`
      ALTER TABLE lecture_recording_sessions
        ADD COLUMN times_viewed INT UNSIGNED NOT NULL DEFAULT 1
          AFTER last_position_seconds
    `);

    // ── 4. Add times_viewed to subject_recording_sessions ────────────────
    await qr.query(`
      ALTER TABLE subject_recording_sessions
        ADD COLUMN times_viewed INT UNSIGNED NOT NULL DEFAULT 1
          AFTER last_position_seconds
    `);

    // ── 5. Add indexes + unique constraint to lecture_recording_sessions ──
    await qr.query(`ALTER TABLE lecture_recording_sessions ADD INDEX IDX_lrs_lecture  (lecture_id)`);
    await qr.query(`ALTER TABLE lecture_recording_sessions ADD INDEX IDX_lrs_user     (user_id)`);
    await qr.query(`ALTER TABLE lecture_recording_sessions ADD INDEX IDX_lrs_user_type (user_type)`);
    await qr.query(`ALTER TABLE lecture_recording_sessions ADD INDEX IDX_lrs_backup   (backup_status)`);
    // Unique only for logged-in users — NULL user_id (guests) are excluded
    await qr.query(`
      ALTER TABLE lecture_recording_sessions
        ADD UNIQUE KEY UQ_lrs_lecture_user (lecture_id, user_id)
    `);

    // ── 6. Add unique constraint to subject_recording_sessions ────────────
    await qr.query(`
      ALTER TABLE subject_recording_sessions
        ADD UNIQUE KEY UQ_srs_recording_user (recording_id, user_id)
    `);
  }

  async down(qr: QueryRunner): Promise<void> {
    await qr.query(`ALTER TABLE subject_recording_sessions DROP INDEX UQ_srs_recording_user`);
    await qr.query(`ALTER TABLE lecture_recording_sessions  DROP INDEX UQ_lrs_lecture_user`);
    await qr.query(`ALTER TABLE lecture_recording_sessions  DROP INDEX IDX_lrs_backup`);
    await qr.query(`ALTER TABLE lecture_recording_sessions  DROP INDEX IDX_lrs_user_type`);
    await qr.query(`ALTER TABLE lecture_recording_sessions  DROP INDEX IDX_lrs_user`);
    await qr.query(`ALTER TABLE lecture_recording_sessions  DROP INDEX IDX_lrs_lecture`);
    await qr.query(`ALTER TABLE subject_recording_sessions  DROP COLUMN times_viewed`);
    await qr.query(`ALTER TABLE lecture_recording_sessions  DROP COLUMN times_viewed`);
  }
}
