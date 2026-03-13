import { MigrationInterface, QueryRunner } from 'typeorm';

export class DropClassIdAddInstituteSubjectIndexes1751400000000 implements MigrationInterface {
  name = 'DropClassIdAddInstituteSubjectIndexes1751400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Drop any lingering class_id indexes (created partially before — idempotent)
    const classIndexNames = ['idx_lecture_class_subject', 'idx_lecture_institute_class_subject', 'idx_lecture_institute_class', 'idx_lecture_institute_class_subject_grade'];
    for (const indexName of classIndexNames) {
      const exists = await queryRunner.query(`
        SELECT INDEX_NAME FROM INFORMATION_SCHEMA.STATISTICS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'structured_lectures'
          AND INDEX_NAME = '${indexName}'
      `);
      if (exists.length > 0) {
        await queryRunner.query(`DROP INDEX \`${indexName}\` ON \`structured_lectures\``);
      }
    }

    // Drop class_id column if it exists
    const classIdColumn = await queryRunner.query(`
      SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'structured_lectures'
        AND COLUMN_NAME = 'class_id'
    `);
    if (classIdColumn.length > 0) {
      await queryRunner.query(`ALTER TABLE \`structured_lectures\` DROP COLUMN \`class_id\``);
    }

    // Add institute+subject composite index (primary student query path)
    const instSubjectIndex = await queryRunner.query(`
      SELECT INDEX_NAME FROM INFORMATION_SCHEMA.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'structured_lectures'
        AND INDEX_NAME = 'idx_lecture_institute_subject'
    `);
    if (instSubjectIndex.length === 0) {
      await queryRunner.query(`
        CREATE INDEX \`idx_lecture_institute_subject\`
        ON \`structured_lectures\` (\`institute_id\`, \`subjectId\`)
      `);
    }

    // Add institute+subject+grade composite index
    const instSubjectGradeIndex = await queryRunner.query(`
      SELECT INDEX_NAME FROM INFORMATION_SCHEMA.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'structured_lectures'
        AND INDEX_NAME = 'idx_lecture_institute_subject_grade'
    `);
    if (instSubjectGradeIndex.length === 0) {
      await queryRunner.query(`
        CREATE INDEX \`idx_lecture_institute_subject_grade\`
        ON \`structured_lectures\` (\`institute_id\`, \`subjectId\`, \`grade\`)
      `);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop the new indexes
    for (const indexName of ['idx_lecture_institute_subject_grade', 'idx_lecture_institute_subject']) {
      const exists = await queryRunner.query(`
        SELECT INDEX_NAME FROM INFORMATION_SCHEMA.STATISTICS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'structured_lectures'
          AND INDEX_NAME = '${indexName}'
      `);
      if (exists.length > 0) {
        await queryRunner.query(`DROP INDEX \`${indexName}\` ON \`structured_lectures\``);
      }
    }
  }
}
