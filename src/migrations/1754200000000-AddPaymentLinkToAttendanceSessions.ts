import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPaymentLinkToAttendanceSessions1754200000000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    const hasLinked = await queryRunner.hasColumn('institute_class_attendance_sessions', 'linked_payment_id');
    if (!hasLinked) {
      await queryRunner.query(`ALTER TABLE \`institute_class_attendance_sessions\` ADD COLUMN \`linked_payment_id\` BIGINT NULL DEFAULT NULL`);
    }
    const hasMode = await queryRunner.hasColumn('institute_class_attendance_sessions', 'payment_mode');
    if (!hasMode) {
      await queryRunner.query(`ALTER TABLE \`institute_class_attendance_sessions\` ADD COLUMN \`payment_mode\` ENUM('OPTIONAL','REQUIRED') NULL DEFAULT NULL`);
    }
  }
  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE \`institute_class_attendance_sessions\` DROP COLUMN IF EXISTS \`payment_mode\``);
    await queryRunner.query(`ALTER TABLE \`institute_class_attendance_sessions\` DROP COLUMN IF EXISTS \`linked_payment_id\``);
  }
}
