import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Widen `users.rfid` from varchar(20) to varchar(30).
 *
 * Suraksha (GLOBAL) smart-card values are written to `users.rfid`. Card ids run up to
 * 30 characters, so the column must match the smart_cards.card_id width. The UNIQUE
 * constraint is preserved by MODIFY (it does not touch indexes).
 */
export class WidenUserRfidTo301815000000003 implements MigrationInterface {
  name = 'WidenUserRfidTo301815000000003';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('users');
    const col = table?.findColumnByName('rfid');
    if (col && col.length === '30') {
      return;
    }
    await queryRunner.query('ALTER TABLE `users` MODIFY `rfid` VARCHAR(30) NULL');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE `users` MODIFY `rfid` VARCHAR(20) NULL');
  }
}
