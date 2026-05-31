import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateLectureLiveAttendanceSessions1802000000000 implements MigrationInterface {
  name = 'CreateLectureLiveAttendanceSessions1802000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE \`lecture_live_attendance_sessions\` (
        \`id\` bigint NOT NULL AUTO_INCREMENT,
        \`lecture_id\` bigint NOT NULL,
        \`url_id\` varchar(100) NOT NULL,
        \`valid_seconds\` int NOT NULL DEFAULT 300,
        \`expires_at\` timestamp NOT NULL,
        \`created_by\` bigint NULL,
        \`created_at\` timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        UNIQUE INDEX \`IDX_live_att_sess_url\` (\`url_id\`),
        INDEX \`IDX_live_att_sess_lecture\` (\`lecture_id\`),
        INDEX \`IDX_live_att_sess_exp\` (\`expires_at\`),
        PRIMARY KEY (\`id\`)
      ) ENGINE=InnoDB
    `);

    await queryRunner.query(`
      CREATE TABLE \`lecture_live_attendance_marks\` (
        \`id\` bigint NOT NULL AUTO_INCREMENT,
        \`session_id\` bigint NOT NULL,
        \`lecture_id\` bigint NOT NULL,
        \`student_id\` bigint NOT NULL,
        \`marked_at\` timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        \`ip_address\` varchar(50) NULL,
        \`user_agent\` text NULL,
        UNIQUE INDEX \`IDX_live_att_mark_session_student\` (\`session_id\`, \`student_id\`),
        INDEX \`IDX_live_att_mark_session\` (\`session_id\`),
        INDEX \`IDX_live_att_mark_lecture\` (\`lecture_id\`),
        INDEX \`IDX_live_att_mark_student\` (\`student_id\`),
        PRIMARY KEY (\`id\`)
      ) ENGINE=InnoDB
    `);

    await queryRunner.query(`
      ALTER TABLE \`lecture_live_attendance_sessions\`
        ADD CONSTRAINT \`FK_live_att_sess_lecture\`
          FOREIGN KEY (\`lecture_id\`) REFERENCES \`institute_class_subject_lectures\`(\`id\`)
          ON DELETE CASCADE ON UPDATE NO ACTION,
        ADD CONSTRAINT \`FK_live_att_sess_created_by\`
          FOREIGN KEY (\`created_by\`) REFERENCES \`users\`(\`id\`)
          ON DELETE SET NULL ON UPDATE NO ACTION
    `);

    await queryRunner.query(`
      ALTER TABLE \`lecture_live_attendance_marks\`
        ADD CONSTRAINT \`FK_live_att_mark_session\`
          FOREIGN KEY (\`session_id\`) REFERENCES \`lecture_live_attendance_sessions\`(\`id\`)
          ON DELETE CASCADE ON UPDATE NO ACTION,
        ADD CONSTRAINT \`FK_live_att_mark_lecture\`
          FOREIGN KEY (\`lecture_id\`) REFERENCES \`institute_class_subject_lectures\`(\`id\`)
          ON DELETE CASCADE ON UPDATE NO ACTION,
        ADD CONSTRAINT \`FK_live_att_mark_student\`
          FOREIGN KEY (\`student_id\`) REFERENCES \`users\`(\`id\`)
          ON DELETE CASCADE ON UPDATE NO ACTION
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE \`lecture_live_attendance_marks\` DROP FOREIGN KEY \`FK_live_att_mark_student\``);
    await queryRunner.query(`ALTER TABLE \`lecture_live_attendance_marks\` DROP FOREIGN KEY \`FK_live_att_mark_lecture\``);
    await queryRunner.query(`ALTER TABLE \`lecture_live_attendance_marks\` DROP FOREIGN KEY \`FK_live_att_mark_session\``);
    await queryRunner.query(`ALTER TABLE \`lecture_live_attendance_sessions\` DROP FOREIGN KEY \`FK_live_att_sess_created_by\``);
    await queryRunner.query(`ALTER TABLE \`lecture_live_attendance_sessions\` DROP FOREIGN KEY \`FK_live_att_sess_lecture\``);

    await queryRunner.query(`DROP TABLE \`lecture_live_attendance_marks\``);
    await queryRunner.query(`DROP TABLE \`lecture_live_attendance_sessions\``);
  }
}
