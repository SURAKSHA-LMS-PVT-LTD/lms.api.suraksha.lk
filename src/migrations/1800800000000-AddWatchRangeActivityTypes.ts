import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds WATCH_RANGE, TAB_HIDDEN, TAB_VISIBLE to the activity_type enum
 * on both lecture_recording_activities and subject_recording_activities tables.
 * MySQL ALTER TABLE ... MODIFY COLUMN replaces the enum definition in full.
 */
export class AddWatchRangeActivityTypes1800800000000 implements MigrationInterface {
  name = 'AddWatchRangeActivityTypes1800800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE \`lecture_recording_activities\`
      MODIFY COLUMN \`activity_type\` ENUM(
        'PLAY','PAUSE','SEEK','HEARTBEAT',
        'SPEED_CHANGE','QUALITY_CHANGE','FULLSCREEN_TOGGLE','SUBTITLE_TOGGLE',
        'WATCH_RANGE','TAB_HIDDEN','TAB_VISIBLE'
      ) NOT NULL
    `);

    await queryRunner.query(`
      ALTER TABLE \`subject_recording_activities\`
      MODIFY COLUMN \`activity_type\` ENUM(
        'PLAY','PAUSE','SEEK','HEARTBEAT',
        'SPEED_CHANGE','QUALITY_CHANGE','FULLSCREEN_TOGGLE','SUBTITLE_TOGGLE',
        'WATCH_RANGE','TAB_HIDDEN','TAB_VISIBLE'
      ) NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE \`subject_recording_activities\`
      MODIFY COLUMN \`activity_type\` ENUM(
        'PLAY','PAUSE','SEEK','HEARTBEAT',
        'SPEED_CHANGE','QUALITY_CHANGE','FULLSCREEN_TOGGLE','SUBTITLE_TOGGLE'
      ) NOT NULL
    `);

    await queryRunner.query(`
      ALTER TABLE \`lecture_recording_activities\`
      MODIFY COLUMN \`activity_type\` ENUM(
        'PLAY','PAUSE','SEEK','HEARTBEAT',
        'SPEED_CHANGE','QUALITY_CHANGE','FULLSCREEN_TOGGLE','SUBTITLE_TOGGLE'
      ) NOT NULL
    `);
  }
}
