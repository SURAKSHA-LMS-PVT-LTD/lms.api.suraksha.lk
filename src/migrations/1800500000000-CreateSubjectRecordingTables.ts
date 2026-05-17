import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateSubjectRecordingTables1800500000000 implements MigrationInterface {
  name = 'CreateSubjectRecordingTables1800500000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    // ── subject_recordings ───────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE \`subject_recordings\` (
        \`id\`                          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        \`institute_id\`                VARCHAR(36)     NOT NULL,
        \`class_id\`                    VARCHAR(36)     NULL,
        \`subject_id\`                  VARCHAR(36)     NULL,
        \`uploaded_by_id\`              BIGINT NULL,

        \`title\`                       VARCHAR(255)    NOT NULL,
        \`description\`                 TEXT            NULL,
        \`platform\`                    ENUM('SYSTEM','YOUTUBE','GOOGLE_DRIVE','EXTERNAL')
                                        NOT NULL DEFAULT 'SYSTEM',
        \`recording_url\`               TEXT            NULL,
        \`duration_seconds\`            INT UNSIGNED    NULL,
        \`thumbnail_url\`               VARCHAR(500)    NULL,
        \`materials\`                   JSON            NULL,
        \`status\`                      ENUM('draft','published','archived')
                                        NOT NULL DEFAULT 'draft',
        \`is_active\`                   TINYINT(1)      NOT NULL DEFAULT 1,

        -- Recording tracking (mirrors rec_* on institute_class_subject_lectures)
        \`rec_attendance_enabled\`      TINYINT(1)      NOT NULL DEFAULT 0,
        \`rec_url_id\`                  VARCHAR(100)    NULL,
        \`rec_access_level\`            ENUM('ANYONE','SURAKSHA_USERS','ENROLLED_ONLY','PAID_ONLY')
                                        NOT NULL DEFAULT 'ENROLLED_ONLY',
        \`rec_payment_id\`              VARCHAR(100)    NULL,
        \`rec_payment_statuses\`        JSON            NULL,
        \`rec_entry_bg_url\`            VARCHAR(500)    NULL,
        \`rec_card_image_url\`          VARCHAR(500)    NULL,
        \`rec_card_image_ttl\`          DATETIME        NULL,
        \`rec_bg_image_ttl\`            DATETIME        NULL,
        \`rec_url_expires_at\`          DATETIME        NULL,

        -- Welcome message (mirrors lecture welcome message)
        \`welcome_message_enabled\`     TINYINT(1)      NOT NULL DEFAULT 0,
        \`welcome_message_text\`        TEXT            NULL,
        \`welcome_message_voice_enabled\` TINYINT(1)   NOT NULL DEFAULT 0,

        \`created_at\`                  DATETIME(6)     NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        \`updated_at\`                  DATETIME(6)     NOT NULL DEFAULT CURRENT_TIMESTAMP(6)
                                        ON UPDATE CURRENT_TIMESTAMP(6),

        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`UQ_sr_rec_url_id\`  (\`rec_url_id\`),

        INDEX \`IDX_sr_institute\`            (\`institute_id\`),
        INDEX \`IDX_sr_institute_class\`      (\`institute_id\`, \`class_id\`),
        INDEX \`IDX_sr_institute_class_subj\` (\`institute_id\`, \`class_id\`, \`subject_id\`),
        INDEX \`IDX_sr_uploaded_by\`          (\`uploaded_by_id\`),
        INDEX \`IDX_sr_status\`               (\`status\`),
        INDEX \`IDX_sr_is_active\`            (\`is_active\`),
        INDEX \`IDX_sr_created_at\`           (\`created_at\`),

        CONSTRAINT \`FK_sr_institute\`    FOREIGN KEY (\`institute_id\`)   REFERENCES \`institutes\`(\`id\`)          ON DELETE CASCADE,
        CONSTRAINT \`FK_sr_class\`        FOREIGN KEY (\`class_id\`)       REFERENCES \`institute_classes\`(\`id\`)   ON DELETE CASCADE,
        CONSTRAINT \`FK_sr_subject\`      FOREIGN KEY (\`subject_id\`)     REFERENCES \`subjects\`(\`id\`)            ON DELETE CASCADE,
        CONSTRAINT \`FK_sr_uploaded_by\`  FOREIGN KEY (\`uploaded_by_id\`) REFERENCES \`users\`(\`id\`)              ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
    `);

    // ── subject_recording_sessions ───────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE \`subject_recording_sessions\` (
        \`id\`                     BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        \`recording_id\`           BIGINT UNSIGNED NOT NULL,
        \`user_id\`                BIGINT NULL,
        \`user_type\`              ENUM('enrolled','suraksha_user','guest')
                                   NOT NULL DEFAULT 'guest',
        \`guest_name\`             VARCHAR(255)    NULL,
        \`guest_email\`            VARCHAR(255)    NULL,
        \`guest_phone\`            VARCHAR(50)     NULL,
        \`guest_dob\`              DATE            NULL,
        \`guest_school\`           VARCHAR(255)    NULL,
        \`start_time\`             TIMESTAMP       NOT NULL,
        \`end_time\`               TIMESTAMP       NULL,
        \`total_watched_seconds\`  INT UNSIGNED    NOT NULL DEFAULT 0,
        \`last_position_seconds\`  INT UNSIGNED    NOT NULL DEFAULT 0,
        \`backup_status\`          ENUM('pending','completed','failed')
                                   NOT NULL DEFAULT 'pending',
        \`last_sync_time\`         TIMESTAMP       NULL,
        \`ip_address\`             VARCHAR(50)     NULL,
        \`user_agent\`             TEXT            NULL,
        \`created_at\`             DATETIME(6)     NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        \`updated_at\`             DATETIME(6)     NOT NULL DEFAULT CURRENT_TIMESTAMP(6)
                                   ON UPDATE CURRENT_TIMESTAMP(6),

        PRIMARY KEY (\`id\`),
        INDEX \`IDX_srs_recording\`        (\`recording_id\`),
        INDEX \`IDX_srs_user\`             (\`user_id\`),
        INDEX \`IDX_srs_recording_user\`   (\`recording_id\`, \`user_id\`),
        INDEX \`IDX_srs_user_type\`        (\`user_type\`),
        INDEX \`IDX_srs_backup_status\`    (\`backup_status\`),

        CONSTRAINT \`FK_srs_recording\` FOREIGN KEY (\`recording_id\`) REFERENCES \`subject_recordings\`(\`id\`) ON DELETE CASCADE,
        CONSTRAINT \`FK_srs_user\`      FOREIGN KEY (\`user_id\`)      REFERENCES \`users\`(\`id\`)             ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
    `);

    // ── subject_recording_activities ─────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE \`subject_recording_activities\` (
        \`id\`                    BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        \`session_id\`            BIGINT UNSIGNED NOT NULL,
        \`activity_type\`         ENUM(
                                    'PLAY','PAUSE','SEEK','HEARTBEAT',
                                    'SPEED_CHANGE','QUALITY_CHANGE',
                                    'FULLSCREEN_TOGGLE','SUBTITLE_TOGGLE'
                                  ) NOT NULL,
        \`video_timestamp\`       FLOAT           NOT NULL,
        \`wall_clock_timestamp\`  TIMESTAMP       NULL,
        \`metadata\`              JSON            NULL,
        \`created_at\`            DATETIME(6)     NOT NULL DEFAULT CURRENT_TIMESTAMP(6),

        PRIMARY KEY (\`id\`),
        INDEX \`IDX_sra_session\`        (\`session_id\`),
        INDEX \`IDX_sra_activity_type\`  (\`activity_type\`),

        CONSTRAINT \`FK_sra_session\` FOREIGN KEY (\`session_id\`) REFERENCES \`subject_recording_sessions\`(\`id\`) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
    `);

  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS \`subject_recording_activities\``);
    await queryRunner.query(`DROP TABLE IF EXISTS \`subject_recording_sessions\``);
    await queryRunner.query(`DROP TABLE IF EXISTS \`subject_recordings\``);
  }
}
