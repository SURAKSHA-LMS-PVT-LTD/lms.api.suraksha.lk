import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAllowUserPhotoUploadToInstitutes1791000000003 implements MigrationInterface {
  name = 'AddAllowUserPhotoUploadToInstitutes1791000000003';

  async up(runner: QueryRunner): Promise<void> {
    const [r] = await runner.query(
      `SELECT COUNT(*) AS cnt FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'institutes' AND COLUMN_NAME = 'allow_user_photo_upload'`,
    );
    if (parseInt(r.cnt, 10) === 0) {
      await runner.query(
        `ALTER TABLE \`institutes\`
           ADD COLUMN \`allow_user_photo_upload\` TINYINT(1) NOT NULL DEFAULT 1
             COMMENT 'When false, institute users cannot upload their own profile photo'`,
      );
    }
  }

  async down(runner: QueryRunner): Promise<void> {
    await runner.query(`ALTER TABLE \`institutes\` DROP COLUMN \`allow_user_photo_upload\``);
  }
}
