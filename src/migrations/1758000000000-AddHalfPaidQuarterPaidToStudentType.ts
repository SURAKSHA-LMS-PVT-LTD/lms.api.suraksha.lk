import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddHalfPaidQuarterPaidToStudentType1758000000000 implements MigrationInterface {
  name = 'AddHalfPaidQuarterPaidToStudentType1758000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Extend student_type ENUM in institute_class_subject_students
    await queryRunner.query(`
      ALTER TABLE \`institute_class_subject_students\`
      MODIFY COLUMN \`student_type\`
        ENUM('normal', 'paid', 'free_card', 'half_paid', 'quarter_paid')
        NOT NULL DEFAULT 'normal'
        COMMENT 'Student type: normal=default, paid=fully paid, half_paid=50% fee paid, quarter_paid=25% fee paid, free_card=exempt from enrollment fee'
    `);

    // Extend student_type ENUM in institute_class_students
    await queryRunner.query(`
      ALTER TABLE \`institute_class_students\`
      MODIFY COLUMN \`student_type\`
        ENUM('normal', 'paid', 'free_card', 'half_paid', 'quarter_paid')
        NOT NULL DEFAULT 'normal'
        COMMENT 'Enrollment type at class level: normal=default, paid=fully paid, half_paid=50% fee paid, quarter_paid=25% fee paid, free_card=exempt from fee'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Revert any half_paid / quarter_paid rows to 'normal' before shrinking the enum
    await queryRunner.query(`
      UPDATE \`institute_class_subject_students\`
      SET \`student_type\` = 'normal'
      WHERE \`student_type\` IN ('half_paid', 'quarter_paid')
    `);
    await queryRunner.query(`
      UPDATE \`institute_class_students\`
      SET \`student_type\` = 'normal'
      WHERE \`student_type\` IN ('half_paid', 'quarter_paid')
    `);

    // Shrink back to original ENUM
    await queryRunner.query(`
      ALTER TABLE \`institute_class_subject_students\`
      MODIFY COLUMN \`student_type\`
        ENUM('normal', 'paid', 'free_card')
        NOT NULL DEFAULT 'normal'
    `);
    await queryRunner.query(`
      ALTER TABLE \`institute_class_students\`
      MODIFY COLUMN \`student_type\`
        ENUM('normal', 'paid', 'free_card')
        NOT NULL DEFAULT 'normal'
    `);
  }
}
