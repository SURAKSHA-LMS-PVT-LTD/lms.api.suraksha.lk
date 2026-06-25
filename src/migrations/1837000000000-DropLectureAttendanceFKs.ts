import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Drop FK constraints that restrict lecture_id columns to only
 * institute_class_subject_lectures. These tables now support both
 * subject-level and class-level lectures, so no single-table FK is valid.
 * Application-level validation (resolveLecture) replaces the DB constraint.
 */
export class DropLectureAttendanceFKs1837000000000 implements MigrationInterface {
  name = 'DropLectureAttendanceFKs1837000000000';

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
    await this.dropFkIfExists(queryRunner, 'lecture_live_attendance', 'FK_live_att_lecture');
    await this.dropFkIfExists(queryRunner, 'lecture_live_attendance_sessions', 'FK_live_att_sess_lecture');
    await this.dropFkIfExists(queryRunner, 'lecture_live_attendance_marks', 'FK_live_att_mark_lecture');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Re-adding these FKs would break class-lecture attendance — intentionally left as no-op
  }
}
