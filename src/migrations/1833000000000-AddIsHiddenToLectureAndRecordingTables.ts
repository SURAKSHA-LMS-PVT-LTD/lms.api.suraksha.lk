import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddIsHiddenToLectureAndRecordingTables1833000000000 implements MigrationInterface {
  name = 'AddIsHiddenToLectureAndRecordingTables1833000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const db = queryRunner.connection.options.database as string;

    const tables = [
      'institute_class_subject_lectures',
      'institute_class_lectures',
      'subject_recordings',
    ];

    for (const table of tables) {
      const rows: any[] = await queryRunner.query(
        `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
         WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = 'is_hidden'`,
        [db, table],
      );
      if (rows.length === 0) {
        await queryRunner.query(
          `ALTER TABLE \`${table}\` ADD COLUMN \`is_hidden\` tinyint(1) NOT NULL DEFAULT 0`,
        );
      }
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE \`subject_recordings\` DROP COLUMN \`is_hidden\``);
    await queryRunner.query(`ALTER TABLE \`institute_class_lectures\` DROP COLUMN \`is_hidden\``);
    await queryRunner.query(`ALTER TABLE \`institute_class_subject_lectures\` DROP COLUMN \`is_hidden\``);
  }
}
