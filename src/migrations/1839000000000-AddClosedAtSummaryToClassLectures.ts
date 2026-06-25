import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddClosedAtSummaryToClassLectures1839000000000 implements MigrationInterface {
  name = 'AddClosedAtSummaryToClassLectures1839000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE \`institute_class_lectures\`
        ADD COLUMN \`closed_at\`       timestamp    NULL AFTER \`updated_at\`,
        ADD COLUMN \`lecture_summary\` json         NULL AFTER \`closed_at\`
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE \`institute_class_lectures\`
        DROP COLUMN \`lecture_summary\`,
        DROP COLUMN \`closed_at\`
    `);
  }
}
