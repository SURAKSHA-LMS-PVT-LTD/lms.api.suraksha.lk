import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSpeedTrackingToRecordingSessions1800700000000 implements MigrationInterface {
  name = 'AddSpeedTrackingToRecordingSessions1800700000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    // effective_watched_seconds: wall-clock time the student actually spent watching
    // (video seconds / playback speed) — not inflated by 2x/1.5x skipping
    await queryRunner.query(`
      ALTER TABLE \`subject_recording_sessions\`
        ADD COLUMN \`effective_watched_seconds\` INT UNSIGNED NOT NULL DEFAULT 0
          AFTER \`total_watched_seconds\`,
        ADD COLUMN \`last_playback_speed\` FLOAT NOT NULL DEFAULT 1
          AFTER \`effective_watched_seconds\`
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE \`subject_recording_sessions\`
        DROP COLUMN \`last_playback_speed\`,
        DROP COLUMN \`effective_watched_seconds\`
    `);
  }
}
