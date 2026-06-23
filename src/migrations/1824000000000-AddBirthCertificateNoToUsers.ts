import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds `birth_certificate_no` column to the `users` table.
 * Idempotent — checks for column existence before adding.
 */
export class AddBirthCertificateNoToUsers1824000000000 implements MigrationInterface {
  name = 'AddBirthCertificateNoToUsers1824000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const hasBirthCertificateNo = await queryRunner.hasColumn('users', 'birth_certificate_no');
    if (!hasBirthCertificateNo) {
      await queryRunner.query(
        `ALTER TABLE \`users\` ADD COLUMN \`birth_certificate_no\` varchar(50) NULL UNIQUE`,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const hasBirthCertificateNo = await queryRunner.hasColumn('users', 'birth_certificate_no');
    if (hasBirthCertificateNo) {
      await queryRunner.query(`ALTER TABLE \`users\` DROP COLUMN \`birth_certificate_no\``);
    }
  }
}
