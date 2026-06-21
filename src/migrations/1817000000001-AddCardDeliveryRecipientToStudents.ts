import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Add card_delivery_recipient column to the students table.
 *
 * StudentEntity declares this field but it was never migrated to the live DB,
 * causing "Unknown column 'StudentEntity.card_delivery_recipient' in 'field list'"
 * on any query that touches the students table (e.g. /v2/auth/institute/available-contacts).
 *
 * Idempotent: no-op if the column already exists.
 */
export class AddCardDeliveryRecipientToStudents1817000000001 implements MigrationInterface {
  name = 'AddCardDeliveryRecipientToStudents1817000000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasColumn('students', 'card_delivery_recipient'))) {
      await queryRunner.query(
        `ALTER TABLE \`students\` ADD COLUMN \`card_delivery_recipient\` ENUM('SELF','FATHER','MOTHER','GUARDIAN') NULL COMMENT 'Who should receive the physical ID card: SELF, FATHER, MOTHER, GUARDIAN'`,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasColumn('students', 'card_delivery_recipient')) {
      await queryRunner.query(`ALTER TABLE \`students\` DROP COLUMN \`card_delivery_recipient\``);
    }
  }
}
