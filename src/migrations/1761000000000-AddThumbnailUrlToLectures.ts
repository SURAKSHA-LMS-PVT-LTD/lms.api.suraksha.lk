import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddThumbnailUrlToLectures1761000000000 implements MigrationInterface {
  name = 'AddThumbnailUrlToLectures1761000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add thumbnail_url column to institute_lectures
    await queryRunner.query(`
      ALTER TABLE \`institute_lectures\`
      ADD COLUMN \`thumbnail_url\` VARCHAR(500) NULL DEFAULT NULL
    `);

    // Add thumbnail_url column to institute_class_subject_lectures
    await queryRunner.query(`
      ALTER TABLE \`institute_class_subject_lectures\`
      ADD COLUMN \`thumbnail_url\` VARCHAR(500) NULL DEFAULT NULL
    `);

    // Add thumbnail_url column to institute_class_lectures
    await queryRunner.query(`
      ALTER TABLE \`institute_class_lectures\`
      ADD COLUMN \`thumbnail_url\` VARCHAR(500) NULL DEFAULT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE \`institute_lectures\`
      DROP COLUMN \`thumbnail_url\`
    `);

    await queryRunner.query(`
      ALTER TABLE \`institute_class_subject_lectures\`
      DROP COLUMN \`thumbnail_url\`
    `);

    await queryRunner.query(`
      ALTER TABLE \`institute_class_lectures\`
      DROP COLUMN \`thumbnail_url\`
    `);
  }
}
