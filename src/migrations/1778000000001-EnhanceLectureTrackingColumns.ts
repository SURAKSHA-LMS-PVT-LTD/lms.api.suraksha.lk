import { MigrationInterface, QueryRunner } from 'typeorm';

export class EnhanceLectureTrackingColumns1778000000001 implements MigrationInterface {
  name = 'EnhanceLectureTrackingColumns1778000000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── Extra tracking columns on the lecture itself ─────────────────────────
    await queryRunner.query(`
      ALTER TABLE \`institute_class_subject_lectures\`
        ADD COLUMN \`live_card_image_url\`  varchar(500) NULL AFTER \`live_entry_bg_url\`,
        ADD COLUMN \`live_card_image_ttl\`  datetime     NULL AFTER \`live_card_image_url\`,
        ADD COLUMN \`live_bg_image_ttl\`    datetime     NULL AFTER \`live_card_image_ttl\`,
        ADD COLUMN \`live_url_expires_at\`  datetime     NULL AFTER \`live_bg_image_ttl\`,
        ADD COLUMN \`rec_entry_bg_url\`     varchar(500) NULL AFTER \`rec_payment_statuses\`,
        ADD COLUMN \`rec_card_image_url\`   varchar(500) NULL AFTER \`rec_entry_bg_url\`,
        ADD COLUMN \`rec_card_image_ttl\`   datetime     NULL AFTER \`rec_card_image_url\`,
        ADD COLUMN \`rec_bg_image_ttl\`     datetime     NULL AFTER \`rec_card_image_ttl\`,
        ADD COLUMN \`rec_url_expires_at\`   datetime     NULL AFTER \`rec_bg_image_ttl\`,
        ADD COLUMN \`rec_duration_seconds\` int          NULL AFTER \`rec_url_expires_at\`
    `);

    // ── Scope columns on live attendance for efficient class-level reporting ─
    await queryRunner.query(`
      ALTER TABLE \`lecture_live_attendance\`
        ADD COLUMN \`institute_id\` bigint NULL AFTER \`lecture_id\`,
        ADD COLUMN \`class_id\`     bigint NULL AFTER \`institute_id\`,
        ADD COLUMN \`subject_id\`   bigint NULL AFTER \`class_id\`
    `);
    await queryRunner.query(`
      ALTER TABLE \`lecture_live_attendance\`
        ADD INDEX \`IDX_live_att_inst_class\` (\`institute_id\`, \`class_id\`)
    `);

    // ── Guest fields + last position on recording sessions ───────────────────
    await queryRunner.query(`
      ALTER TABLE \`lecture_recording_sessions\`
        ADD COLUMN \`last_position_seconds\` int          NOT NULL DEFAULT 0 AFTER \`total_watched_seconds\`,
        ADD COLUMN \`guest_email\`           varchar(255) NULL     AFTER \`guest_name\`,
        ADD COLUMN \`guest_phone\`           varchar(50)  NULL     AFTER \`guest_email\`,
        ADD COLUMN \`guest_dob\`             date         NULL     AFTER \`guest_phone\`
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE \`lecture_recording_sessions\`
        DROP COLUMN \`guest_dob\`,
        DROP COLUMN \`guest_phone\`,
        DROP COLUMN \`guest_email\`,
        DROP COLUMN \`last_position_seconds\`
    `);

    await queryRunner.query(`ALTER TABLE \`lecture_live_attendance\` DROP INDEX \`IDX_live_att_inst_class\``);
    await queryRunner.query(`
      ALTER TABLE \`lecture_live_attendance\`
        DROP COLUMN \`subject_id\`,
        DROP COLUMN \`class_id\`,
        DROP COLUMN \`institute_id\`
    `);

    await queryRunner.query(`
      ALTER TABLE \`institute_class_subject_lectures\`
        DROP COLUMN \`rec_duration_seconds\`,
        DROP COLUMN \`rec_url_expires_at\`,
        DROP COLUMN \`rec_bg_image_ttl\`,
        DROP COLUMN \`rec_card_image_ttl\`,
        DROP COLUMN \`rec_card_image_url\`,
        DROP COLUMN \`rec_entry_bg_url\`,
        DROP COLUMN \`live_url_expires_at\`,
        DROP COLUMN \`live_bg_image_ttl\`,
        DROP COLUMN \`live_card_image_ttl\`,
        DROP COLUMN \`live_card_image_url\`
    `);
  }
}
