import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Converts lecture primary keys from bigint AUTO_INCREMENT to UUID (varchar 36).
 * Also converts all FK columns in child tables.
 *
 * ⚠️ Drops all existing lecture data — intended for dev environments only.
 */
export class ConvertLectureIdsToUuid1836000000000 implements MigrationInterface {
  name = 'ConvertLectureIdsToUuid1836000000000';

  private async dropFkIfExists(queryRunner: QueryRunner, table: string, fk: string): Promise<void> {
    const db = (await queryRunner.query('SELECT DATABASE() AS db'))[0].db;
    const rows: any[] = await queryRunner.query(
      `SELECT CONSTRAINT_NAME FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
       WHERE CONSTRAINT_TYPE = 'FOREIGN KEY'
         AND TABLE_SCHEMA = ? AND TABLE_NAME = ? AND CONSTRAINT_NAME = ?`,
      [db, table, fk],
    );
    if (rows.length > 0) {
      await queryRunner.query(`ALTER TABLE \`${table}\` DROP FOREIGN KEY \`${fk}\``);
    }
  }

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Drop FK constraints (check-before-drop — MySQL doesn't support IF EXISTS)
    await this.dropFkIfExists(queryRunner, 'lecture_live_attendance_marks', 'FK_live_att_mark_student');
    await this.dropFkIfExists(queryRunner, 'lecture_live_attendance_marks', 'FK_live_att_mark_lecture');
    await this.dropFkIfExists(queryRunner, 'lecture_live_attendance_marks', 'FK_live_att_mark_session');
    await this.dropFkIfExists(queryRunner, 'lecture_live_attendance_sessions', 'FK_live_att_sess_created_by');
    await this.dropFkIfExists(queryRunner, 'lecture_live_attendance_sessions', 'FK_live_att_sess_lecture');
    await this.dropFkIfExists(queryRunner, 'lecture_recording_activities', 'FK_rec_act_session');
    await this.dropFkIfExists(queryRunner, 'lecture_recording_sessions', 'FK_rec_sess_lecture');
    await this.dropFkIfExists(queryRunner, 'lecture_live_attendance', 'FK_live_att_lecture');

    // Truncate all data (dev only)
    await queryRunner.query(`SET FOREIGN_KEY_CHECKS = 0`);
    await queryRunner.query(`TRUNCATE TABLE \`lecture_recording_activities\``);
    await queryRunner.query(`TRUNCATE TABLE \`lecture_recording_sessions\``);
    await queryRunner.query(`TRUNCATE TABLE \`lecture_live_attendance_marks\``);
    await queryRunner.query(`TRUNCATE TABLE \`lecture_live_attendance_sessions\``);
    await queryRunner.query(`TRUNCATE TABLE \`lecture_live_attendance\``);
    await queryRunner.query(`TRUNCATE TABLE \`institute_class_subject_lectures\``);
    await queryRunner.query(`TRUNCATE TABLE \`institute_class_lectures\``);
    await queryRunner.query(`SET FOREIGN_KEY_CHECKS = 1`);

    // Alter institute_class_subject_lectures PK to UUID
    await queryRunner.query(`ALTER TABLE \`institute_class_subject_lectures\` MODIFY \`id\` VARCHAR(36) NOT NULL`);

    // Alter child FK columns to varchar(36)
    await queryRunner.query(`ALTER TABLE \`lecture_live_attendance\` MODIFY \`id\` VARCHAR(36) NOT NULL, MODIFY \`lecture_id\` VARCHAR(36) NOT NULL`);
    await queryRunner.query(`ALTER TABLE \`lecture_live_attendance_sessions\` MODIFY \`id\` VARCHAR(36) NOT NULL, MODIFY \`lecture_id\` VARCHAR(36) NOT NULL`);
    await queryRunner.query(`ALTER TABLE \`lecture_live_attendance_marks\` MODIFY \`id\` VARCHAR(36) NOT NULL, MODIFY \`session_id\` VARCHAR(36) NOT NULL, MODIFY \`lecture_id\` VARCHAR(36) NOT NULL`);
    await queryRunner.query(`ALTER TABLE \`lecture_recording_sessions\` MODIFY \`id\` VARCHAR(36) NOT NULL, MODIFY \`lecture_id\` VARCHAR(36) NOT NULL`);
    await queryRunner.query(`ALTER TABLE \`lecture_recording_activities\` MODIFY \`id\` VARCHAR(36) NOT NULL, MODIFY \`session_id\` VARCHAR(36) NOT NULL`);

    // Alter institute_class_lectures PK to UUID
    await queryRunner.query(`ALTER TABLE \`institute_class_lectures\` MODIFY \`id\` VARCHAR(36) NOT NULL`);

    // Re-add only FKs that are still valid (lecture_id FKs dropped — they reference two tables now)
    await queryRunner.query(`
      ALTER TABLE \`lecture_live_attendance_sessions\`
        ADD CONSTRAINT \`FK_live_att_sess_created_by\`
          FOREIGN KEY (\`created_by\`) REFERENCES \`users\`(\`id\`)
          ON DELETE SET NULL ON UPDATE NO ACTION
    `);

    await queryRunner.query(`
      ALTER TABLE \`lecture_live_attendance_marks\`
        ADD CONSTRAINT \`FK_live_att_mark_session\`
          FOREIGN KEY (\`session_id\`) REFERENCES \`lecture_live_attendance_sessions\`(\`id\`)
          ON DELETE CASCADE ON UPDATE NO ACTION,
        ADD CONSTRAINT \`FK_live_att_mark_student\`
          FOREIGN KEY (\`student_id\`) REFERENCES \`users\`(\`id\`)
          ON DELETE CASCADE ON UPDATE NO ACTION
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await this.dropFkIfExists(queryRunner, 'lecture_live_attendance_marks', 'FK_live_att_mark_student');
    await this.dropFkIfExists(queryRunner, 'lecture_live_attendance_marks', 'FK_live_att_mark_lecture');
    await this.dropFkIfExists(queryRunner, 'lecture_live_attendance_marks', 'FK_live_att_mark_session');
    await this.dropFkIfExists(queryRunner, 'lecture_live_attendance_sessions', 'FK_live_att_sess_created_by');
    await this.dropFkIfExists(queryRunner, 'lecture_live_attendance_sessions', 'FK_live_att_sess_lecture');

    await queryRunner.query(`SET FOREIGN_KEY_CHECKS = 0`);
    await queryRunner.query(`TRUNCATE TABLE \`lecture_recording_activities\``);
    await queryRunner.query(`TRUNCATE TABLE \`lecture_recording_sessions\``);
    await queryRunner.query(`TRUNCATE TABLE \`lecture_live_attendance_marks\``);
    await queryRunner.query(`TRUNCATE TABLE \`lecture_live_attendance_sessions\``);
    await queryRunner.query(`TRUNCATE TABLE \`lecture_live_attendance\``);
    await queryRunner.query(`TRUNCATE TABLE \`institute_class_subject_lectures\``);
    await queryRunner.query(`TRUNCATE TABLE \`institute_class_lectures\``);
    await queryRunner.query(`SET FOREIGN_KEY_CHECKS = 1`);

    await queryRunner.query(`ALTER TABLE \`institute_class_subject_lectures\` MODIFY \`id\` BIGINT NOT NULL AUTO_INCREMENT`);
    await queryRunner.query(`ALTER TABLE \`lecture_live_attendance\` MODIFY \`id\` BIGINT NOT NULL AUTO_INCREMENT, MODIFY \`lecture_id\` BIGINT NOT NULL`);
    await queryRunner.query(`ALTER TABLE \`lecture_live_attendance_sessions\` MODIFY \`id\` BIGINT NOT NULL AUTO_INCREMENT, MODIFY \`lecture_id\` BIGINT NOT NULL`);
    await queryRunner.query(`ALTER TABLE \`lecture_live_attendance_marks\` MODIFY \`id\` BIGINT NOT NULL AUTO_INCREMENT, MODIFY \`session_id\` BIGINT NOT NULL, MODIFY \`lecture_id\` BIGINT NOT NULL`);
    await queryRunner.query(`ALTER TABLE \`lecture_recording_sessions\` MODIFY \`id\` BIGINT NOT NULL AUTO_INCREMENT, MODIFY \`lecture_id\` BIGINT NOT NULL`);
    await queryRunner.query(`ALTER TABLE \`lecture_recording_activities\` MODIFY \`id\` BIGINT NOT NULL AUTO_INCREMENT, MODIFY \`session_id\` BIGINT NOT NULL`);
    await queryRunner.query(`ALTER TABLE \`institute_class_lectures\` MODIFY \`id\` BIGINT NOT NULL AUTO_INCREMENT`);

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
}
