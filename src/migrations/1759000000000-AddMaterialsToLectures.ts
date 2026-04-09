import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddMaterialsToLectures1759000000000 implements MigrationInterface {
  name = 'AddMaterialsToLectures1759000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add materials JSON column to institute_class_subject_lectures
    await queryRunner.query(`
      ALTER TABLE \`institute_class_subject_lectures\`
      ADD COLUMN \`materials\` JSON NULL DEFAULT NULL
    `);

    // Add materials JSON column to institute_lectures
    await queryRunner.query(`
      ALTER TABLE \`institute_lectures\`
      ADD COLUMN \`materials\` JSON NULL DEFAULT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE \`institute_class_subject_lectures\`
      DROP COLUMN \`materials\`
    `);

    await queryRunner.query(`
      ALTER TABLE \`institute_lectures\`
      DROP COLUMN \`materials\`
    `);
  }
}
