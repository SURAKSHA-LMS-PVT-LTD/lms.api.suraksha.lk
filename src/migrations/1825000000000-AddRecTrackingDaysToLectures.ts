import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds `rec_tracking_days` (nullable INT) to institute_class_subject_lectures
 * and subject_recordings.
 *
 * Semantics:
 *   null  → no time limit, always track full activity
 *   0     → attendance-only (mark viewed, no heartbeat/seek events)
 *   1–30  → track full activity for that many days after publish
 *
 * Idempotent — checks column existence before altering.
 */
export class AddRecTrackingDaysToLectures1825000000000 implements MigrationInterface {
  name = 'AddRecTrackingDaysToLectures1825000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const hasLecture = await queryRunner.hasColumn('institute_class_subject_lectures', 'rec_tracking_days');
    if (!hasLecture) {
      await queryRunner.query(
        `ALTER TABLE \`institute_class_subject_lectures\` ADD COLUMN \`rec_tracking_days\` int NULL`,
      );
    }

    const hasRecording = await queryRunner.hasColumn('subject_recordings', 'rec_tracking_days');
    if (!hasRecording) {
      await queryRunner.query(
        `ALTER TABLE \`subject_recordings\` ADD COLUMN \`rec_tracking_days\` int NULL`,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const hasLecture = await queryRunner.hasColumn('institute_class_subject_lectures', 'rec_tracking_days');
    if (hasLecture) {
      await queryRunner.query(
        `ALTER TABLE \`institute_class_subject_lectures\` DROP COLUMN \`rec_tracking_days\``,
      );
    }

    const hasRecording = await queryRunner.hasColumn('subject_recordings', 'rec_tracking_days');
    if (hasRecording) {
      await queryRunner.query(
        `ALTER TABLE \`subject_recordings\` DROP COLUMN \`rec_tracking_days\``,
      );
    }
  }
}
