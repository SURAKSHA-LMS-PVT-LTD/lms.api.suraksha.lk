import { MigrationInterface, QueryRunner } from 'typeorm';

export class SafeAddClassIdToStructuredLectures1751300000000 implements MigrationInterface {
  name = 'SafeAddClassIdToStructuredLectures1751300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add class_id column only if it doesn't already exist (idempotent)
    const classIdColumn = await queryRunner.query(`
      SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'structured_lectures'
        AND COLUMN_NAME = 'class_id'
    `);

    if (classIdColumn.length === 0) {
      await queryRunner.query(`
        ALTER TABLE \`structured_lectures\`
        ADD COLUMN \`class_id\` BIGINT NULL DEFAULT NULL
      `);
    }

    // Add composite index for (class_id, subject_id) only if it doesn't exist
    const classSubjectIndex = await queryRunner.query(`
      SELECT INDEX_NAME FROM INFORMATION_SCHEMA.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'structured_lectures'
        AND INDEX_NAME = 'idx_lecture_class_subject'
    `);

    if (classSubjectIndex.length === 0) {
      await queryRunner.query(`
        CREATE INDEX \`idx_lecture_class_subject\`
        ON \`structured_lectures\` (\`class_id\`, \`subjectId\`)
      `);
    }

    // Add institute+class+subject composite index if not exists
    const instituteClassSubjectIndex = await queryRunner.query(`
      SELECT INDEX_NAME FROM INFORMATION_SCHEMA.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'structured_lectures'
        AND INDEX_NAME = 'idx_lecture_institute_class_subject'
    `);

    if (instituteClassSubjectIndex.length === 0) {
      await queryRunner.query(`
        CREATE INDEX \`idx_lecture_institute_class_subject\`
        ON \`structured_lectures\` (\`institute_id\`, \`class_id\`, \`subjectId\`)
      `);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop indexes first
    const indexes = ['idx_lecture_institute_class_subject', 'idx_lecture_class_subject'];
    for (const indexName of indexes) {
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

    // Drop column
    const classIdColumn = await queryRunner.query(`
      SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'structured_lectures'
        AND COLUMN_NAME = 'class_id'
    `);
    if (classIdColumn.length > 0) {
      await queryRunner.query(`ALTER TABLE \`structured_lectures\` DROP COLUMN \`class_id\``);
    }
  }
}
