import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddLessonLectureNumberProviderToStructuredLectures1751600000000
  implements MigrationInterface
{
  name = 'AddLessonLectureNumberProviderToStructuredLectures1751600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // lesson_number
    const lessonNumberExists = await queryRunner.query(`
      SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'structured_lectures'
        AND COLUMN_NAME = 'lesson_number'
    `);
    if (lessonNumberExists.length === 0) {
      await queryRunner.query(`
        ALTER TABLE \`structured_lectures\`
        ADD COLUMN \`lesson_number\` INT NULL DEFAULT NULL
      `);
    }

    // lecture_number
    const lectureNumberExists = await queryRunner.query(`
      SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'structured_lectures'
        AND COLUMN_NAME = 'lecture_number'
    `);
    if (lectureNumberExists.length === 0) {
      await queryRunner.query(`
        ALTER TABLE \`structured_lectures\`
        ADD COLUMN \`lecture_number\` INT NULL DEFAULT NULL
      `);
    }

    // provider
    const providerExists = await queryRunner.query(`
      SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'structured_lectures'
        AND COLUMN_NAME = 'provider'
    `);
    if (providerExists.length === 0) {
      await queryRunner.query(`
        ALTER TABLE \`structured_lectures\`
        ADD COLUMN \`provider\` VARCHAR(255) NULL DEFAULT NULL
      `);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE \`structured_lectures\` DROP COLUMN IF EXISTS \`provider\``);
    await queryRunner.query(`ALTER TABLE \`structured_lectures\` DROP COLUMN IF EXISTS \`lecture_number\``);
    await queryRunner.query(`ALTER TABLE \`structured_lectures\` DROP COLUMN IF EXISTS \`lesson_number\``);
  }
}
