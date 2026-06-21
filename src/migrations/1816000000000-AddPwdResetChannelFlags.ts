import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Per-institute password-reset OTP channel flags.
 *
 * Controls which delivery methods forgot-password offers:
 *   - WhatsApp (reverse-OTP) ON by default — the primary channel.
 *   - SMS and Email OFF by default — an institute admin enables them per institute.
 *
 * Idempotent: each column is added only when missing.
 */
export class AddPwdResetChannelFlags1816000000000 implements MigrationInterface {
  name = 'AddPwdResetChannelFlags1816000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasColumn('institutes', 'pwd_reset_whatsapp_enabled'))) {
      await queryRunner.query(
        `ALTER TABLE institutes ADD COLUMN pwd_reset_whatsapp_enabled TINYINT(1) NOT NULL DEFAULT 1`,
      );
    }
    if (!(await queryRunner.hasColumn('institutes', 'pwd_reset_sms_enabled'))) {
      await queryRunner.query(
        `ALTER TABLE institutes ADD COLUMN pwd_reset_sms_enabled TINYINT(1) NOT NULL DEFAULT 0`,
      );
    }
    if (!(await queryRunner.hasColumn('institutes', 'pwd_reset_email_enabled'))) {
      await queryRunner.query(
        `ALTER TABLE institutes ADD COLUMN pwd_reset_email_enabled TINYINT(1) NOT NULL DEFAULT 0`,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const col of ['pwd_reset_whatsapp_enabled', 'pwd_reset_sms_enabled', 'pwd_reset_email_enabled']) {
      if (await queryRunner.hasColumn('institutes', col)) {
        await queryRunner.query(`ALTER TABLE institutes DROP COLUMN ${col}`);
      }
    }
  }
}
