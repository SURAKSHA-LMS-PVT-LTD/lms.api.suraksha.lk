import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migration: AddInstituteActivationOtpPurpose
 * Adds INSTITUTE_ACTIVATION to the otp_purpose ENUM in user_otps table.
 */
export class AddInstituteActivationOtpPurpose1760000000002 implements MigrationInterface {
  name = 'AddInstituteActivationOtpPurpose1760000000002';

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
          'INSTITUTE_ACTIVATION'
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
          'INSTITUTE_PASSWORD_RESET'
        )
        NOT NULL DEFAULT 'VERIFICATION'
    `);
  }
}
