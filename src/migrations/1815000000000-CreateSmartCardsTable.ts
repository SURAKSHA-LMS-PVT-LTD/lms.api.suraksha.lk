import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';

/**
 * Smart-card pre-printed ID inventory.
 *
 * Idempotent: checks for the table before creating.
 * Run: npx typeorm migration:run -d src/data-source.ts
 */
export class CreateSmartCardsTable1815000000000 implements MigrationInterface {
  name = 'CreateSmartCardsTable1815000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasTable('smart_cards')) {
      return;
    }

    await queryRunner.createTable(
      new Table({
        name: 'smart_cards',
        columns: [
          { name: 'id', type: 'bigint', isPrimary: true, isGenerated: true, generationStrategy: 'increment' },
          { name: 'card_name', type: 'varchar', length: '100', isNullable: false },
          { name: 'card_id', type: 'varchar', length: '30', isNullable: false },
          { name: 'card_type', type: 'enum', enum: ['BARCODE', 'QR', 'RFID', 'NFC'], isNullable: false },
          { name: 'scope', type: 'enum', enum: ['GLOBAL', 'INSTITUTE'], isNullable: false },
          {
            name: 'status',
            type: 'enum',
            enum: ['AVAILABLE', 'ASSIGNED_INSTITUTE', 'ASSIGNED_CLASS', 'ASSIGNED_USER', 'INACTIVE'],
            default: "'AVAILABLE'",
            isNullable: false,
          },
          { name: 'institute_id', type: 'varchar', length: '36', isNullable: true },
          { name: 'class_id', type: 'varchar', length: '36', isNullable: true },
          { name: 'assigned_user_id', type: 'bigint', isNullable: true },
          { name: 'assigned_at', type: 'timestamp', isNullable: true },
          { name: 'created_at', type: 'timestamp', default: 'CURRENT_TIMESTAMP' },
          { name: 'updated_at', type: 'timestamp', default: 'CURRENT_TIMESTAMP', onUpdate: 'CURRENT_TIMESTAMP' },
        ],
      }),
      true,
    );

    await queryRunner.createIndex(
      'smart_cards',
      new TableIndex({ name: 'idx_smart_cards_scope_status', columnNames: ['scope', 'status'] }),
    );
    await queryRunner.createIndex(
      'smart_cards',
      new TableIndex({ name: 'idx_smart_cards_institute_status', columnNames: ['institute_id', 'status'] }),
    );
    await queryRunner.createIndex(
      'smart_cards',
      new TableIndex({ name: 'idx_smart_cards_class_status', columnNames: ['class_id', 'status'] }),
    );
    // A card value is unique within its scope (prevents duplicate global/institute ids).
    await queryRunner.createIndex(
      'smart_cards',
      new TableIndex({ name: 'idx_smart_cards_scope_cardid', columnNames: ['scope', 'card_id'], isUnique: true }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasTable('smart_cards')) {
      await queryRunner.dropTable('smart_cards');
    }
  }
}
