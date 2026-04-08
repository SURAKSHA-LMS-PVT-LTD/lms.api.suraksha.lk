import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddStudentTypeToClassStudents1757000000000 implements MigrationInterface {
  name = 'AddStudentTypeToClassStudents1757000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE \`institute_class_students\`
      ADD COLUMN \`student_type\` ENUM('normal', 'paid', 'free_card') NOT NULL DEFAULT 'normal'
        COMMENT 'Enrollment type at class level: normal=default, paid=confirmed paid, free_card=exempt from fee'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE \`institute_class_students\` DROP COLUMN \`student_type\`
    `);
  }
}
