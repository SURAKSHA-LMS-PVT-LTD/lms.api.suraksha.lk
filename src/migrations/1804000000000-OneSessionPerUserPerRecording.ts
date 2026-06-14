import { MigrationInterface, QueryRunner } from 'typeorm';

export class OneSessionPerUserPerRecording1804000000000 implements MigrationInterface {
  async up(qr: QueryRunner): Promise<void> {
    const db = await qr.getCurrentDatabase();

    // ── 1. Deduplicate lecture_recording_sessions ─────────────────────────
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
    const [lrsTv] = await qr.query(
      `SELECT COUNT(*) AS cnt FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'lecture_recording_sessions' AND COLUMN_NAME = 'times_viewed'`,
      [db],
    );
    if (Number(lrsTv.cnt) === 0) {
      await qr.query(`
        ALTER TABLE lecture_recording_sessions
          ADD COLUMN times_viewed INT UNSIGNED NOT NULL DEFAULT 1
            AFTER last_position_seconds
      `);
    }

    // ── 4. Add times_viewed to subject_recording_sessions ────────────────
    const [srsTv] = await qr.query(
      `SELECT COUNT(*) AS cnt FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'subject_recording_sessions' AND COLUMN_NAME = 'times_viewed'`,
      [db],
    );
    if (Number(srsTv.cnt) === 0) {
      await qr.query(`
        ALTER TABLE subject_recording_sessions
          ADD COLUMN times_viewed INT UNSIGNED NOT NULL DEFAULT 1
            AFTER last_position_seconds
      `);
    }

    // ── 5. Add indexes to lecture_recording_sessions ──────────────────────
    const lrsIndexes = await qr.query(
      `SELECT INDEX_NAME FROM INFORMATION_SCHEMA.STATISTICS
       WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'lecture_recording_sessions'`,
      [db],
    );
    const lrsIdxNames = new Set(lrsIndexes.map((r: any) => r.INDEX_NAME));

    if (!lrsIdxNames.has('IDX_lrs_lecture')) {
      await qr.query(`ALTER TABLE lecture_recording_sessions ADD INDEX IDX_lrs_lecture (lecture_id)`);
    }
    if (!lrsIdxNames.has('IDX_lrs_user')) {
      await qr.query(`ALTER TABLE lecture_recording_sessions ADD INDEX IDX_lrs_user (user_id)`);
    }
    if (!lrsIdxNames.has('IDX_lrs_user_type')) {
      await qr.query(`ALTER TABLE lecture_recording_sessions ADD INDEX IDX_lrs_user_type (user_type)`);
    }
    if (!lrsIdxNames.has('IDX_lrs_backup')) {
      await qr.query(`ALTER TABLE lecture_recording_sessions ADD INDEX IDX_lrs_backup (backup_status)`);
    }
    if (!lrsIdxNames.has('UQ_lrs_lecture_user')) {
      await qr.query(`
        ALTER TABLE lecture_recording_sessions
          ADD UNIQUE KEY UQ_lrs_lecture_user (lecture_id, user_id)
      `);
    }

    // ── 6. Add unique constraint to subject_recording_sessions ────────────
    const srsIndexes = await qr.query(
      `SELECT INDEX_NAME FROM INFORMATION_SCHEMA.STATISTICS
       WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'subject_recording_sessions'`,
      [db],
    );
    const srsIdxNames = new Set(srsIndexes.map((r: any) => r.INDEX_NAME));

    if (!srsIdxNames.has('UQ_srs_recording_user')) {
      await qr.query(`
        ALTER TABLE subject_recording_sessions
          ADD UNIQUE KEY UQ_srs_recording_user (recording_id, user_id)
      `);
    }
  }

  async down(qr: QueryRunner): Promise<void> {
    const db = await qr.getCurrentDatabase();
    const dropIdx = async (table: string, name: string) => {
      const [row] = await qr.query(
        `SELECT COUNT(*) AS cnt FROM INFORMATION_SCHEMA.STATISTICS
         WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND INDEX_NAME = ?`,
        [db, table, name],
      );
      if (Number(row.cnt) > 0) {
        await qr.query(`ALTER TABLE \`${table}\` DROP INDEX \`${name}\``);
      }
    };
    const dropCol = async (table: string, col: string) => {
      const exists = await qr.hasColumn(table, col);
      if (exists) await qr.query(`ALTER TABLE \`${table}\` DROP COLUMN \`${col}\``);
    };

    await dropIdx('subject_recording_sessions', 'UQ_srs_recording_user');
    await dropIdx('lecture_recording_sessions',  'UQ_lrs_lecture_user');
    await dropIdx('lecture_recording_sessions',  'IDX_lrs_backup');
    await dropIdx('lecture_recording_sessions',  'IDX_lrs_user_type');
    await dropIdx('lecture_recording_sessions',  'IDX_lrs_user');
    await dropIdx('lecture_recording_sessions',  'IDX_lrs_lecture');
    await dropCol('subject_recording_sessions', 'times_viewed');
    await dropCol('lecture_recording_sessions',  'times_viewed');
  }
}
