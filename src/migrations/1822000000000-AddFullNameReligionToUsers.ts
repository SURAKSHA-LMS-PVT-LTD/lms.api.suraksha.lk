import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds `full_name` and `religion` columns to the `users` table.
 * Idempotent — checks for column existence before adding.
 */
export class AddFullNameReligionToUsers1822000000000 implements MigrationInterface {
  name = 'AddFullNameReligionToUsers1822000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const hasFullName = await queryRunner.hasColumn('users', 'full_name');
    if (!hasFullName) {
      await queryRunner.query(`ALTER TABLE \`users\` ADD COLUMN \`full_name\` varchar(150) NULL AFTER \`name_with_initials\``);
    }

    const hasReligion = await queryRunner.hasColumn('users', 'religion');
    if (!hasReligion) {
      await queryRunner.query(`ALTER TABLE \`users\` ADD COLUMN \`religion\` varchar(100) NULL`);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const hasReligion = await queryRunner.hasColumn('users', 'religion');
    if (hasReligion) {
      await queryRunner.query(`ALTER TABLE \`users\` DROP COLUMN \`religion\``);
    }
    const hasFullName = await queryRunner.hasColumn('users', 'full_name');
    if (hasFullName) {
      await queryRunner.query(`ALTER TABLE \`users\` DROP COLUMN \`full_name\``);
    }
  }
}
