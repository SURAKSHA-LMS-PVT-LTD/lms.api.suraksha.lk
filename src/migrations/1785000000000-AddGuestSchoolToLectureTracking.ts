import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddGuestSchoolToLectureTracking1785000000000 implements MigrationInterface {
  name = 'AddGuestSchoolToLectureTracking1785000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE \`lecture_live_attendance\` ADD COLUMN \`guest_school\` varchar(255) NULL AFTER \`guest_dob\``);
    await queryRunner.query(`ALTER TABLE \`lecture_recording_sessions\` ADD COLUMN \`guest_school\` varchar(255) NULL AFTER \`guest_dob\``);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE \`lecture_recording_sessions\` DROP COLUMN \`guest_school\``);
    await queryRunner.query(`ALTER TABLE \`lecture_live_attendance\` DROP COLUMN \`guest_school\``);
  }
}
