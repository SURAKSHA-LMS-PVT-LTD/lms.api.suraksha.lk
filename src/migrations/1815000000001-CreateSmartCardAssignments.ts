import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';

/**
 * Per-user smart-card assignment history.
 *
 * Idempotent: checks for the table before creating.
 * Run: npx typeorm migration:run -d src/data-source.ts
 */
export class CreateSmartCardAssignments1815000000001 implements MigrationInterface {
  name = 'CreateSmartCardAssignments1815000000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasTable('smart_card_assignments')) {
      return;
    }

    await queryRunner.createTable(
      new Table({
        name: 'smart_card_assignments',
        columns: [
          { name: 'id', type: 'bigint', isPrimary: true, isGenerated: true, generationStrategy: 'increment' },
          { name: 'smart_card_id', type: 'bigint', isNullable: false },
          { name: 'card_value', type: 'varchar', length: '30', isNullable: false },
          { name: 'user_id', type: 'bigint', isNullable: false },
          { name: 'institute_id', type: 'varchar', length: '36', isNullable: false },
          { name: 'class_id', type: 'varchar', length: '36', isNullable: true },
          { name: 'is_active', type: 'tinyint', width: 1, default: 1 },
          { name: 'assigned_by', type: 'bigint', isNullable: true },
          { name: 'assigned_at', type: 'timestamp', default: 'CURRENT_TIMESTAMP' },
          { name: 'revoked_at', type: 'timestamp', isNullable: true },
          { name: 'revoke_reason', type: 'varchar', length: '255', isNullable: true },
          { name: 'created_at', type: 'timestamp', default: 'CURRENT_TIMESTAMP' },
        ],
      }),
      true,
    );

    await queryRunner.createIndex(
      'smart_card_assignments',
      new TableIndex({ name: 'idx_sca_card_active', columnNames: ['smart_card_id', 'is_active'] }),
    );
    await queryRunner.createIndex(
      'smart_card_assignments',
      new TableIndex({ name: 'idx_sca_user_active', columnNames: ['user_id', 'is_active'] }),
    );
    await queryRunner.createIndex(
      'smart_card_assignments',
      new TableIndex({ name: 'idx_sca_institute', columnNames: ['institute_id'] }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasTable('smart_card_assignments')) {
      await queryRunner.dropTable('smart_card_assignments');
    }
  }
}
