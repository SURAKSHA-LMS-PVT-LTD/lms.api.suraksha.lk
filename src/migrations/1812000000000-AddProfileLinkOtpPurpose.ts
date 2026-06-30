import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migration: AddProfileLinkOtpPurpose
 * Adds PROFILE_LINK to the otp_purpose ENUM in user_otps table.
 * Used by the parent → child WhatsApp OTP linking flow.
 */
export class AddProfileLinkOtpPurpose1812000000000 implements MigrationInterface {
  name = 'AddProfileLinkOtpPurpose1812000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE \`user_otps\`
      MODIFY COLUMN \`otp_purpose\`
        ENUM(
          'VERIFICATION',
          'PASSWORD_RESET',
          'TWO_FACTOR',
          'PHONE_CHANGE',
          'EMAIL_CHANGE',
          'INSTITUTE_PASSWORD_RESET',
          'INSTITUTE_ACTIVATION',
          'PROFILE_LINK'
        )
        NOT NULL DEFAULT 'VERIFICATION'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE \`user_otps\`
      MODIFY COLUMN \`otp_purpose\`
        ENUM(
          'VERIFICATION',
          'PASSWORD_RESET',
          'TWO_FACTOR',
          'PHONE_CHANGE',
          'EMAIL_CHANGE',
          'INSTITUTE_PASSWORD_RESET',
          'INSTITUTE_ACTIVATION'
        )
        NOT NULL DEFAULT 'VERIFICATION'
    `);
  }
}
