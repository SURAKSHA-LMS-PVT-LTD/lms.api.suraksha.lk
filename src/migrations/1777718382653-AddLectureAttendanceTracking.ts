import { MigrationInterface, QueryRunner } from "typeorm";

export class AddLectureAttendanceTracking1777718382653 implements MigrationInterface {
    name = 'AddLectureAttendanceTracking1777718382653'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // 1. Alter existing lecture table
        await queryRunner.query(`ALTER TABLE \`institute_class_subject_lectures\` MODIFY \`subject_id\` bigint NULL`);
        
        await queryRunner.query(`ALTER TABLE \`institute_class_subject_lectures\` ADD \`live_attendance_enabled\` tinyint NOT NULL DEFAULT 0`);
        await queryRunner.query(`ALTER TABLE \`institute_class_subject_lectures\` ADD \`live_url_id\` varchar(100) NULL`);
        await queryRunner.query(`ALTER TABLE \`institute_class_subject_lectures\` ADD \`live_access_level\` enum ('ANYONE', 'SURAKSHA_USERS', 'ENROLLED_ONLY', 'PAID_ONLY') NOT NULL DEFAULT 'ENROLLED_ONLY'`);
        await queryRunner.query(`ALTER TABLE \`institute_class_subject_lectures\` ADD \`live_payment_id\` varchar(100) NULL`);
        await queryRunner.query(`ALTER TABLE \`institute_class_subject_lectures\` ADD \`live_payment_statuses\` json NULL`);
        await queryRunner.query(`ALTER TABLE \`institute_class_subject_lectures\` ADD \`live_entry_bg_url\` varchar(500) NULL`);
        
        await queryRunner.query(`ALTER TABLE \`institute_class_subject_lectures\` ADD \`rec_attendance_enabled\` tinyint NOT NULL DEFAULT 0`);
        await queryRunner.query(`ALTER TABLE \`institute_class_subject_lectures\` ADD \`rec_url_id\` varchar(100) NULL`);
        await queryRunner.query(`ALTER TABLE \`institute_class_subject_lectures\` ADD \`rec_platform\` enum ('SYSTEM', 'YOUTUBE', 'GOOGLE_DRIVE') NOT NULL DEFAULT 'SYSTEM'`);
        await queryRunner.query(`ALTER TABLE \`institute_class_subject_lectures\` ADD \`rec_access_level\` enum ('ANYONE', 'SURAKSHA_USERS', 'ENROLLED_ONLY', 'PAID_ONLY') NOT NULL DEFAULT 'ENROLLED_ONLY'`);
        await queryRunner.query(`ALTER TABLE \`institute_class_subject_lectures\` ADD \`rec_payment_id\` varchar(100) NULL`);
        await queryRunner.query(`ALTER TABLE \`institute_class_subject_lectures\` ADD \`rec_payment_statuses\` json NULL`);
        
        await queryRunner.query(`ALTER TABLE \`institute_class_subject_lectures\` ADD UNIQUE INDEX \`IDX_live_url_id\` (\`live_url_id\`)`);
        await queryRunner.query(`ALTER TABLE \`institute_class_subject_lectures\` ADD UNIQUE INDEX \`IDX_rec_url_id\` (\`rec_url_id\`)`);

        // 2. Create new tables
        await queryRunner.query(`CREATE TABLE \`lecture_live_attendance\` (\`id\` bigint NOT NULL AUTO_INCREMENT, \`lecture_id\` bigint NOT NULL, \`user_id\` bigint NULL, \`guest_name\` varchar(255) NULL, \`guest_email\` varchar(255) NULL, \`guest_phone\` varchar(50) NULL, \`guest_dob\` date NULL, \`join_time\` timestamp NOT NULL, \`leave_time\` timestamp NULL, \`ip_address\` varchar(50) NULL, \`user_agent\` text NULL, \`created_at\` timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), INDEX \`IDX_live_att_lecture\` (\`lecture_id\`), INDEX \`IDX_live_att_user\` (\`user_id\`), INDEX \`IDX_live_att_lec_user\` (\`lecture_id\`, \`user_id\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`);
        await queryRunner.query(`CREATE TABLE \`lecture_recording_sessions\` (\`id\` bigint NOT NULL AUTO_INCREMENT, \`lecture_id\` bigint NOT NULL, \`user_id\` bigint NULL, \`guest_name\` varchar(255) NULL, \`start_time\` timestamp NOT NULL, \`end_time\` timestamp NULL, \`total_watched_seconds\` int NOT NULL DEFAULT 0, \`ip_address\` varchar(50) NULL, \`user_agent\` text NULL, \`created_at\` timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`updated_at\` timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), INDEX \`IDX_rec_sess_lecture\` (\`lecture_id\`), INDEX \`IDX_rec_sess_user\` (\`user_id\`), INDEX \`IDX_rec_sess_lec_user\` (\`lecture_id\`, \`user_id\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`);
        await queryRunner.query(`CREATE TABLE \`lecture_recording_activities\` (\`id\` bigint NOT NULL AUTO_INCREMENT, \`session_id\` bigint NOT NULL, \`activity_type\` enum ('PLAY', 'PAUSE', 'SEEK', 'HEARTBEAT') NOT NULL, \`video_timestamp\` float NOT NULL, \`created_at\` timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), INDEX \`IDX_rec_act_sess\` (\`session_id\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`);

        // 3. Add Foreign Keys
        await queryRunner.query(`ALTER TABLE \`lecture_live_attendance\` ADD CONSTRAINT \`FK_live_att_lecture\` FOREIGN KEY (\`lecture_id\`) REFERENCES \`institute_class_subject_lectures\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE \`lecture_live_attendance\` ADD CONSTRAINT \`FK_live_att_user\` FOREIGN KEY (\`user_id\`) REFERENCES \`users\`(\`id\`) ON DELETE SET NULL ON UPDATE NO ACTION`);
        
        await queryRunner.query(`ALTER TABLE \`lecture_recording_sessions\` ADD CONSTRAINT \`FK_rec_sess_lecture\` FOREIGN KEY (\`lecture_id\`) REFERENCES \`institute_class_subject_lectures\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE \`lecture_recording_sessions\` ADD CONSTRAINT \`FK_rec_sess_user\` FOREIGN KEY (\`user_id\`) REFERENCES \`users\`(\`id\`) ON DELETE SET NULL ON UPDATE NO ACTION`);
        
        await queryRunner.query(`ALTER TABLE \`lecture_recording_activities\` ADD CONSTRAINT \`FK_rec_act_sess\` FOREIGN KEY (\`session_id\`) REFERENCES \`lecture_recording_sessions\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE \`lecture_recording_activities\` DROP FOREIGN KEY \`FK_rec_act_sess\``);
        await queryRunner.query(`ALTER TABLE \`lecture_recording_sessions\` DROP FOREIGN KEY \`FK_rec_sess_user\``);
        await queryRunner.query(`ALTER TABLE \`lecture_recording_sessions\` DROP FOREIGN KEY \`FK_rec_sess_lecture\``);
        await queryRunner.query(`ALTER TABLE \`lecture_live_attendance\` DROP FOREIGN KEY \`FK_live_att_user\``);
        await queryRunner.query(`ALTER TABLE \`lecture_live_attendance\` DROP FOREIGN KEY \`FK_live_att_lecture\``);

        await queryRunner.query(`DROP TABLE \`lecture_recording_activities\``);
        await queryRunner.query(`DROP TABLE \`lecture_recording_sessions\``);
        await queryRunner.query(`DROP TABLE \`lecture_live_attendance\``);

        await queryRunner.query(`ALTER TABLE \`institute_class_subject_lectures\` DROP INDEX \`IDX_rec_url_id\``);
        await queryRunner.query(`ALTER TABLE \`institute_class_subject_lectures\` DROP INDEX \`IDX_live_url_id\``);
        
        await queryRunner.query(`ALTER TABLE \`institute_class_subject_lectures\` DROP COLUMN \`rec_payment_statuses\``);
        await queryRunner.query(`ALTER TABLE \`institute_class_subject_lectures\` DROP COLUMN \`rec_payment_id\``);
        await queryRunner.query(`ALTER TABLE \`institute_class_subject_lectures\` DROP COLUMN \`rec_access_level\``);
        await queryRunner.query(`ALTER TABLE \`institute_class_subject_lectures\` DROP COLUMN \`rec_platform\``);
        await queryRunner.query(`ALTER TABLE \`institute_class_subject_lectures\` DROP COLUMN \`rec_url_id\``);
        await queryRunner.query(`ALTER TABLE \`institute_class_subject_lectures\` DROP COLUMN \`rec_attendance_enabled\``);
        
        await queryRunner.query(`ALTER TABLE \`institute_class_subject_lectures\` DROP COLUMN \`live_entry_bg_url\``);
        await queryRunner.query(`ALTER TABLE \`institute_class_subject_lectures\` DROP COLUMN \`live_payment_statuses\``);
        await queryRunner.query(`ALTER TABLE \`institute_class_subject_lectures\` DROP COLUMN \`live_payment_id\``);
        await queryRunner.query(`ALTER TABLE \`institute_class_subject_lectures\` DROP COLUMN \`live_access_level\``);
        await queryRunner.query(`ALTER TABLE \`institute_class_subject_lectures\` DROP COLUMN \`live_url_id\``);
        await queryRunner.query(`ALTER TABLE \`institute_class_subject_lectures\` DROP COLUMN \`live_attendance_enabled\``);

        await queryRunner.query(`ALTER TABLE \`institute_class_subject_lectures\` MODIFY \`subject_id\` bigint NOT NULL`);
    }
}
