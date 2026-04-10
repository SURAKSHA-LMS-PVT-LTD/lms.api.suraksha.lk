import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateInstituteClassLectures1749600000000 implements MigrationInterface {
    name = 'CreateInstituteClassLectures1749600000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TABLE \`institute_class_lectures\` (
                \`id\` BIGINT NOT NULL AUTO_INCREMENT,
                \`institute_id\` BIGINT NOT NULL,
                \`class_id\` BIGINT NOT NULL,
                \`instructor_id\` BIGINT NULL,
                \`title\` VARCHAR(255) NOT NULL,
                \`description\` TEXT NULL,
                \`lecture_type\` ENUM('online', 'physical', 'hybrid') NOT NULL DEFAULT 'physical',
                \`venue\` VARCHAR(255) NULL,
                \`subject\` VARCHAR(100) NULL,
                \`start_time\` TIMESTAMP NOT NULL,
                \`end_time\` TIMESTAMP NOT NULL,
                \`status\` ENUM('scheduled', 'ongoing', 'completed', 'cancelled') NOT NULL DEFAULT 'scheduled',
                \`meeting_link\` TEXT NULL,
                \`meeting_id\` VARCHAR(100) NULL,
                \`meeting_password\` VARCHAR(50) NULL,
                \`recording_url\` TEXT NULL,
                \`is_recorded\` TINYINT(1) NOT NULL DEFAULT 0,
                \`max_participants\` INT NULL,
                \`is_active\` TINYINT(1) NOT NULL DEFAULT 1,
                \`thumbnail_url\` VARCHAR(500) NULL,
                \`materials\` JSON NULL,
                \`created_at\` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
                \`updated_at\` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                PRIMARY KEY (\`id\`),
                INDEX \`IDX_icl_institute_id\` (\`institute_id\`),
                INDEX \`IDX_icl_class_id\` (\`class_id\`),
                INDEX \`IDX_icl_institute_class\` (\`institute_id\`, \`class_id\`),
                INDEX \`IDX_icl_institute_class_starttime\` (\`institute_id\`, \`class_id\`, \`start_time\`),
                INDEX \`IDX_icl_institute_starttime\` (\`institute_id\`, \`start_time\`),
                INDEX \`IDX_icl_class_starttime\` (\`class_id\`, \`start_time\`),
                INDEX \`IDX_icl_instructor_starttime\` (\`instructor_id\`, \`start_time\`),
                INDEX \`IDX_icl_status_starttime\` (\`status\`, \`start_time\`),
                INDEX \`IDX_icl_type_active\` (\`lecture_type\`, \`is_active\`),
                CONSTRAINT \`FK_icl_institute\` FOREIGN KEY (\`institute_id\`) REFERENCES \`institutes\`(\`id\`) ON DELETE CASCADE,
                CONSTRAINT \`FK_icl_class\` FOREIGN KEY (\`class_id\`) REFERENCES \`institute_classes\`(\`id\`) ON DELETE CASCADE,
                CONSTRAINT \`FK_icl_instructor\` FOREIGN KEY (\`instructor_id\`) REFERENCES \`users\`(\`id\`) ON DELETE SET NULL
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE IF EXISTS \`institute_class_lectures\``);
    }
}
