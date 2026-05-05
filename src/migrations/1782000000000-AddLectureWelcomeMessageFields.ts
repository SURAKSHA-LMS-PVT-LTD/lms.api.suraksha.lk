import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddLectureWelcomeMessageFields1782000000000 implements MigrationInterface {
  name = 'AddLectureWelcomeMessageFields1782000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE \`institute_class_subject_lectures\`
        ADD COLUMN \`welcome_message_enabled\` boolean NOT NULL DEFAULT false,
        ADD COLUMN \`welcome_message_text\` text NULL,
        ADD COLUMN \`welcome_message_voice_enabled\` boolean NOT NULL DEFAULT false
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE \`institute_class_subject_lectures\`
        DROP COLUMN \`welcome_message_voice_enabled\`,
        DROP COLUMN \`welcome_message_text\`,
        DROP COLUMN \`welcome_message_enabled\`
    `);
  }
}
