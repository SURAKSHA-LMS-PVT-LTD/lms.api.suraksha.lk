import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddClosedAtAndSummaryToLectures1827000000000 implements MigrationInterface {
  name = 'AddClosedAtAndSummaryToLectures1827000000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasColumn('institute_class_subject_lectures', 'closed_at'))) {
      await queryRunner.query(
        `ALTER TABLE institute_class_subject_lectures ADD COLUMN closed_at timestamp NULL`,
      );
    }
    if (!(await queryRunner.hasColumn('institute_class_subject_lectures', 'lecture_summary'))) {
      await queryRunner.query(
        `ALTER TABLE institute_class_subject_lectures ADD COLUMN lecture_summary json NULL`,
      );
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasColumn('institute_class_subject_lectures', 'lecture_summary')) {
      await queryRunner.query(`ALTER TABLE institute_class_subject_lectures DROP COLUMN lecture_summary`);
    }
    if (await queryRunner.hasColumn('institute_class_subject_lectures', 'closed_at')) {
      await queryRunner.query(`ALTER TABLE institute_class_subject_lectures DROP COLUMN closed_at`);
    }
  }
}
