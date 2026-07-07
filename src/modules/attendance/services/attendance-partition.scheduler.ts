import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

/**
 * Keeps attendance_records' monthly partitions healthy:
 *
 * 1. LOOKAHEAD — ensures partitions exist for the current month plus
 *    ATTENDANCE_PARTITION_LOOKAHEAD_MONTHS ahead (default 2, i.e. a "backup
 *    month": even if every scheduled run this month fails, next month's
 *    partition already exists and marking is unaffected). Runs on app
 *    bootstrap AND weekly, and always creates ALL missing months up to the
 *    target — so a run after any outage self-heals the full gap.
 *
 * 2. RETENTION — optionally drops partitions older than ATTENDANCE_HOT_MONTHS
 *    (default 18). DISABLED by default (ATTENDANCE_PARTITION_RETENTION_ENABLED
 *    must be exactly 'true') because dropping a partition irreversibly deletes
 *    that month's attendance rows. Enable only once an archival/export flow
 *    exists or the data is confirmed disposable.
 *
 * New months are split out of the pMAX catch-all with REORGANIZE PARTITION,
 * which is instant while pMAX is empty — precisely why the lookahead matters:
 * if a month ever starts landing in pMAX, reorganizing becomes a data-moving
 * operation. If that state is detected (rows already in pMAX), it still works,
 * just slower, and a warning is logged.
 */
@Injectable()
export class AttendancePartitionScheduler implements OnApplicationBootstrap {
  private readonly logger = new Logger(AttendancePartitionScheduler.name);
  private readonly TABLE = 'attendance_records';

  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  private get lookaheadMonths(): number {
    const n = parseInt(process.env.ATTENDANCE_PARTITION_LOOKAHEAD_MONTHS ?? '2', 10);
    return Number.isFinite(n) && n >= 1 ? Math.min(n, 12) : 2;
  }

  private get hotMonths(): number {
    const n = parseInt(process.env.ATTENDANCE_HOT_MONTHS ?? '18', 10);
    return Number.isFinite(n) && n >= 3 ? n : 18;
  }

  private get retentionEnabled(): boolean {
    return process.env.ATTENDANCE_PARTITION_RETENTION_ENABLED === 'true';
  }

  async onApplicationBootstrap(): Promise<void> {
    // Every deploy/restart is also a healing opportunity — don't wait for the cron.
    await this.maintainPartitions().catch(err =>
      this.logger.error(`Partition maintenance on bootstrap failed: ${err.message}`),
    );
  }

  // Weekly (not monthly) so a single failed run never leaves a whole month uncovered —
  // combined with the +2 month lookahead there are always multiple chances to heal.
  @Cron(CronExpression.EVERY_WEEK, { name: 'attendance-partition-maintenance' })
  async maintainPartitionsCron(): Promise<void> {
    await this.maintainPartitions().catch(err =>
      this.logger.error(`Weekly partition maintenance failed: ${err.message}`),
    );
  }

  async maintainPartitions(): Promise<void> {
    const partitions = await this.getPartitions();
    if (partitions === null) {
      this.logger.error(
        `${this.TABLE} is NOT partitioned — run migration 1852000000000-PartitionAttendanceRecordsMonthly. Skipping maintenance.`,
      );
      return;
    }

    await this.ensureLookaheadPartitions(partitions);

    if (this.retentionEnabled) {
      await this.dropExpiredPartitions(partitions);
    }
  }

  /** All non-pMAX month partitions, sorted. null when the table isn't partitioned. */
  private async getPartitions(): Promise<Array<{ name: string; upperBound: string }> | null> {
    const rows: Array<{ PARTITION_NAME: string | null; PARTITION_DESCRIPTION: string | null }> =
      await this.dataSource.query(
        `SELECT PARTITION_NAME, PARTITION_DESCRIPTION
         FROM information_schema.PARTITIONS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND PARTITION_NAME IS NOT NULL
         ORDER BY PARTITION_ORDINAL_POSITION`,
        [this.TABLE],
      );
    if (!rows.length) return null;
    return rows
      .filter(r => r.PARTITION_NAME !== 'pMAX')
      .map(r => ({
        name: r.PARTITION_NAME as string,
        // PARTITION_DESCRIPTION for RANGE COLUMNS(date) is the quoted upper bound, e.g. '2026-08-01'
        upperBound: String(r.PARTITION_DESCRIPTION).replace(/'/g, ''),
      }));
  }

  private async ensureLookaheadPartitions(
    existing: Array<{ name: string; upperBound: string }>,
  ): Promise<void> {
    // Target: partition for every month from the latest existing one through
    // current month + lookahead. Creating them all in one pass self-heals gaps.
    const target = new Date();
    target.setUTCDate(1);
    target.setUTCHours(0, 0, 0, 0);
    target.setUTCMonth(target.getUTCMonth() + this.lookaheadMonths);

    // Highest existing upper bound = first month NOT yet covered.
    const sortedUppers = existing.map(p => p.upperBound).sort();
    const highestUpper = existing.length
      ? sortedUppers[sortedUppers.length - 1]
      : new Date().toISOString().slice(0, 8) + '01';

    const cursor = new Date(`${highestUpper}T00:00:00Z`);
    const missing: Array<{ name: string; upper: string }> = [];
    while (cursor <= target) {
      const name = `p${cursor.getUTCFullYear()}${String(cursor.getUTCMonth() + 1).padStart(2, '0')}`;
      const upper = new Date(cursor);
      upper.setUTCMonth(upper.getUTCMonth() + 1);
      missing.push({ name, upper: upper.toISOString().slice(0, 10) });
      cursor.setUTCMonth(cursor.getUTCMonth() + 1);
    }

    if (!missing.length) {
      this.logger.log(`Attendance partitions healthy (covered through ${highestUpper}, lookahead ${this.lookaheadMonths}m).`);
      return;
    }

    const [pmaxRows] = await this.dataSource.query(
      `SELECT TABLE_ROWS AS c FROM information_schema.PARTITIONS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND PARTITION_NAME = 'pMAX'`,
      [this.TABLE],
    );
    if (Number(pmaxRows?.c) > 0) {
      this.logger.warn(
        `pMAX holds ~${pmaxRows.c} rows — a month was missed and data landed in the catch-all. ` +
        `REORGANIZE will move those rows into their proper month partitions now (slower than the usual instant split).`,
      );
    }

    const clauses = missing
      .map(m => `PARTITION ${m.name} VALUES LESS THAN ('${m.upper}')`)
      .join(', ');
    await this.dataSource.query(
      `ALTER TABLE ${this.TABLE} REORGANIZE PARTITION pMAX INTO (${clauses}, PARTITION pMAX VALUES LESS THAN (MAXVALUE))`,
    );
    this.logger.log(`Created attendance partitions: ${missing.map(m => m.name).join(', ')}`);
  }

  private async dropExpiredPartitions(
    existing: Array<{ name: string; upperBound: string }>,
  ): Promise<void> {
    // A partition is expired when its UPPER bound is older than the hot window —
    // i.e. every row in it is older than ATTENDANCE_HOT_MONTHS months.
    const cutoff = new Date();
    cutoff.setUTCDate(1);
    cutoff.setUTCHours(0, 0, 0, 0);
    cutoff.setUTCMonth(cutoff.getUTCMonth() - this.hotMonths);
    const cutoffStr = cutoff.toISOString().slice(0, 10);

    const expired = existing.filter(p => p.upperBound <= cutoffStr);
    if (!expired.length) return;

    for (const p of expired) {
      this.logger.warn(
        `RETENTION: dropping attendance partition ${p.name} (all rows older than ${this.hotMonths} months) — this permanently deletes that month's attendance rows.`,
      );
      await this.dataSource.query(`ALTER TABLE ${this.TABLE} DROP PARTITION ${p.name}`);
    }
    this.logger.log(`Retention dropped ${expired.length} partition(s): ${expired.map(p => p.name).join(', ')}`);
  }
}
