import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';

/**
 * Daily ad pre-assignment table.
 *
 * Holds one row per eligible user: the advertisement chosen for them today by the
 * once-daily assignment job. The attendance hot path reads this with a single indexed
 * `WHERE user_id = ?` lookup instead of running the matching engine per scan.
 *
 * Idempotent: checks for the table before creating.
 *
 * Run: npx typeorm migration:run -d src/data-source.ts
 */
export class CreateDailyAdAssignments1805000000000 implements MigrationInterface {
  name = 'CreateDailyAdAssignments1805000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const exists = await queryRunner.hasTable('daily_ad_assignments');
    if (exists) {
      return;
    }

    await queryRunner.createTable(
      new Table({
        name: 'daily_ad_assignments',
        columns: [
          { name: 'id', type: 'bigint', isPrimary: true, isGenerated: true, generationStrategy: 'increment' },
          { name: 'user_id', type: 'varchar', length: '36', isNullable: false },
          { name: 'ad_id', type: 'varchar', length: '36', isNullable: false },
          { name: 'assigned_date', type: 'varchar', length: '10', isNullable: false },
          { name: 'media_url', type: 'varchar', length: '500', isNullable: true },
          { name: 'media_type', type: 'varchar', length: '20', isNullable: true },
          { name: 'title', type: 'varchar', length: '255', isNullable: true },
          { name: 'content', type: 'text', isNullable: true },
          { name: 'sending_url', type: 'varchar', length: '500', isNullable: true },
          { name: 'supportive_platforms', type: 'json', isNullable: true },
          { name: 'mode_of_sending', type: 'json', isNullable: true },
          { name: 'cascade_to_parents', type: 'tinyint', width: 1, default: 0 },
          { name: 'created_at', type: 'timestamp', default: 'CURRENT_TIMESTAMP' },
        ],
      }),
      true,
    );

    await queryRunner.createIndex(
      'daily_ad_assignments',
      new TableIndex({ name: 'idx_daily_ad_user', columnNames: ['user_id'], isUnique: true }),
    );

    await queryRunner.createIndex(
      'daily_ad_assignments',
      new TableIndex({ name: 'idx_daily_ad_date', columnNames: ['assigned_date'] }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const exists = await queryRunner.hasTable('daily_ad_assignments');
    if (exists) {
      await queryRunner.dropTable('daily_ad_assignments');
    }
  }
}
