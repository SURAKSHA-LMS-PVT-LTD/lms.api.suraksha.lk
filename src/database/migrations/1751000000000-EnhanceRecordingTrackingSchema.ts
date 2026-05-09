import { MigrationInterface, QueryRunner } from 'typeorm';

export class EnhanceRecordingTrackingSchema1751000000000 implements MigrationInterface {
  name = 'EnhanceRecordingTrackingSchema1751000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ─────────────────────────────────────────────────────────────
    // Enhance lecture_recording_activities table
    // ─────────────────────────────────────────────────────────────

    // Add new columns to lecture_recording_activities
    await queryRunner.query(
      `ALTER TABLE \`lecture_recording_activities\` 
       ADD COLUMN \`wall_clock_timestamp\` TIMESTAMP NULL AFTER \`video_timestamp\`,
       ADD COLUMN \`metadata\` JSON NULL AFTER \`wall_clock_timestamp\``,
    );

    // Modify activity_type enum to include new activity types
    await queryRunner.query(
      `ALTER TABLE \`lecture_recording_activities\` 
       MODIFY COLUMN \`activity_type\` ENUM('PLAY', 'PAUSE', 'SEEK', 'HEARTBEAT', 'SPEED_CHANGE', 'QUALITY_CHANGE', 'FULLSCREEN_TOGGLE', 'SUBTITLE_TOGGLE')`,
    );

    // Add index for wall_clock_timestamp for timeline queries
    await queryRunner.query(
      `CREATE INDEX \`IDX_recording_activities_wall_clock\` ON \`lecture_recording_activities\`(\`wall_clock_timestamp\`)`,
    );

    // ─────────────────────────────────────────────────────────────
    // Enhance lecture_recording_sessions table
    // ─────────────────────────────────────────────────────────────

    // Add user_type to track enrollment status
    await queryRunner.query(
      `ALTER TABLE \`lecture_recording_sessions\` 
       ADD COLUMN \`user_type\` ENUM('enrolled', 'suraksha_user', 'guest') DEFAULT 'guest' AFTER \`user_id\`,
       ADD COLUMN \`backup_status\` ENUM('pending', 'completed', 'failed') DEFAULT 'pending' AFTER \`guest_dob\`,
       ADD COLUMN \`last_sync_time\` TIMESTAMP NULL AFTER \`backup_status\``,
    );

    // Add index for user_type for filtering queries
    await queryRunner.query(
      `CREATE INDEX \`IDX_recording_sessions_user_type\` ON \`lecture_recording_sessions\`(\`user_type\`)`,
    );

    // Add index for backup_status for sync queries
    await queryRunner.query(
      `CREATE INDEX \`IDX_recording_sessions_backup_status\` ON \`lecture_recording_sessions\`(\`backup_status\`)`,
    );

    // Add composite index for efficient filtering
    await queryRunner.query(
      `CREATE INDEX \`IDX_recording_sessions_lecture_user_type\` ON \`lecture_recording_sessions\`(\`lecture_id\`, \`user_type\`)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Remove indexes
    await queryRunner.query(
      `DROP INDEX IF EXISTS \`IDX_recording_activities_wall_clock\` ON \`lecture_recording_activities\``,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS \`IDX_recording_sessions_user_type\` ON \`lecture_recording_sessions\``,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS \`IDX_recording_sessions_backup_status\` ON \`lecture_recording_sessions\``,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS \`IDX_recording_sessions_lecture_user_type\` ON \`lecture_recording_sessions\``,
    );

    // Remove columns from lecture_recording_activities
    await queryRunner.query(
      `ALTER TABLE \`lecture_recording_activities\` 
       DROP COLUMN \`wall_clock_timestamp\`,
       DROP COLUMN \`metadata\``,
    );

    // Revert activity_type enum
    await queryRunner.query(
      `ALTER TABLE \`lecture_recording_activities\` 
       MODIFY COLUMN \`activity_type\` ENUM('PLAY', 'PAUSE', 'SEEK', 'HEARTBEAT')`,
    );

    // Remove columns from lecture_recording_sessions
    await queryRunner.query(
      `ALTER TABLE \`lecture_recording_sessions\` 
       DROP COLUMN \`user_type\`,
       DROP COLUMN \`backup_status\`,
       DROP COLUMN \`last_sync_time\``,
    );
  }
}
