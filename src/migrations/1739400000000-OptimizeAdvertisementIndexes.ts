import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migration: Optimize advertisement indexes.
 *
 * Rationale (PERF-F):
 *  - MySQL cannot use a plain B-tree index for SET-column membership (FIND_IN_SET),
 *    so the per-column indexes on targetUserTypes / targetSubscriptionPlans / targetGenders
 *    and the standalone (minBornYear,maxBornYear) index were pure write/storage overhead —
 *    demographic targeting is filtered in application code against the cached active-ad set.
 *  - The hot query (active-ads for attendance notifications) filters
 *    isActive + startDate + endDate (+ currentSendings<maxSendings) and orders by priority,
 *    so a single composite index on (isActive, startDate, endDate, priority) covers it.
 *
 * Idempotent: checks existing indexes before adding/dropping.
 *
 * Run: npx typeorm migration:run -d src/data-source.ts
 */
export class OptimizeAdvertisementIndexes1739400000000 implements MigrationInterface {
  name = 'OptimizeAdvertisementIndexes1739400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('advertisements');
    if (!table) {
      console.log('⚠️ advertisements table not found, skipping index optimization');
      return;
    }

    // 1) Add the covering composite index if missing
    const hasComposite = table.indices.some(
      idx =>
        idx.name === 'idx_ads_active_window' ||
        (idx.columnNames.includes('isActive') &&
          idx.columnNames.includes('startDate') &&
          idx.columnNames.includes('endDate') &&
          idx.columnNames.includes('priority')),
    );
    if (!hasComposite) {
      await queryRunner.query(
        `CREATE INDEX \`idx_ads_active_window\` ON \`advertisements\` (\`isActive\`, \`startDate\`, \`endDate\`, \`priority\`)`,
      );
      console.log('✅ Added idx_ads_active_window covering composite index');
    } else {
      console.log('⚠️ Covering composite index already present, skipping');
    }

    // 2) Drop dead single-column indexes that MySQL cannot use for SET membership,
    //    plus the standalone date-window index now superseded by the composite.
    //    We match by the column set so auto-generated IDX_<hash> names are handled.
    const deadSingleColumnSets: string[][] = [
      ['targetUserTypes'],
      ['targetSubscriptionPlans'],
      ['targetGenders'],
      ['mediaType'],
      ['priority'],
      ['minBornYear', 'maxBornYear'],
      ['isActive', 'startDate', 'endDate'], // superseded by idx_ads_active_window
    ];

    for (const cols of deadSingleColumnSets) {
      const match = table.indices.find(
        idx =>
          idx.name !== 'idx_ads_active_window' &&
          idx.columnNames.length === cols.length &&
          cols.every(c => idx.columnNames.includes(c)),
      );
      if (match?.name) {
        await queryRunner.query(
          `DROP INDEX \`${match.name}\` ON \`advertisements\``,
        );
        console.log(`✅ Dropped dead index ${match.name} (${cols.join(', ')})`);
      }
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('advertisements');
    if (!table) return;

    // Recreate the previously-existing indexes (best-effort) and drop the composite.
    const recreate: Array<{ name: string; cols: string[] }> = [
      { name: 'IDX_ads_active_legacy', cols: ['isActive', 'startDate', 'endDate'] },
      { name: 'IDX_ads_priority_legacy', cols: ['priority'] },
      { name: 'IDX_ads_media_type_legacy', cols: ['mediaType'] },
      { name: 'IDX_ads_born_legacy', cols: ['minBornYear', 'maxBornYear'] },
    ];

    for (const idx of recreate) {
      const exists = table.indices.some(
        i => i.columnNames.length === idx.cols.length && idx.cols.every(c => i.columnNames.includes(c)),
      );
      if (!exists) {
        await queryRunner.query(
          `CREATE INDEX \`${idx.name}\` ON \`advertisements\` (${idx.cols.map(c => `\`${c}\``).join(', ')})`,
        );
      }
    }

    const composite = table.indices.find(i => i.name === 'idx_ads_active_window');
    if (composite?.name) {
      await queryRunner.query(`DROP INDEX \`${composite.name}\` ON \`advertisements\``);
    }
  }
}
