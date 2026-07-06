import { MigrationInterface, QueryRunner } from 'typeorm';
import { tableExists } from './utils/safe-table-ops';

/**
 * Converts attendance_records to a monthly RANGE-partitioned table, sized for
 * ~50k students/day (~2-5M rows/month). Done now while the table is small
 * (~9.3k rows) so the rebuild is instant instead of hours at scale.
 *
 * MySQL partitioning rules force two key changes (partition column must be part
 * of every unique key, and partitioned InnoDB tables cannot have FKs — this
 * table already has none):
 *   - PRIMARY KEY (id)                    -> PRIMARY KEY (id, date)
 *   - UNIQUE (dynamo_pk, dynamo_sk)       -> UNIQUE (dynamo_pk, dynamo_sk, date)
 *     (same pk+sk always implies the same date — the sk embeds it — so upsert
 *      ON DUPLICATE KEY semantics are unchanged)
 *
 * Secondary indexes are consolidated at the same time (10 keys -> 8), dropping
 * redundant/overlapping ones so writes at 50k+/day don't maintain dead weight:
 *   kept:    (institute_id, date, class_id)      [replaces IDX_institute_date, adds class pruning]
 *            (student_id, institute_id, date)    [unchanged]
 *            (student_id, date)                  [unchanged — my-history across institutes]
 *            (event_id, student_id)              [replaces IDX_event + idx_inst_event_student]
 *            (class_session_id, student_id, check_out_time)  [unchanged — open-checkout lookup]
 *            (calendar_day_id)                   [unchanged]
 *            (sync_status)                       [unchanged — sync scheduler]
 *   dropped: IDX_institute_date, IDX_event, idx_inst_event_student,
 *            IDX_institute_event_checkin_open (5-col; served by (student_id, institute_id, date))
 *
 * Partitions run from the earliest data month through +2 months lookahead, plus a
 * pMAX catch-all. AttendancePartitionScheduler keeps future months created
 * (current + 2 ahead, self-healing) and optionally drops months older than the
 * hot-retention window.
 *
 * The old table is renamed to _deprecated_attendance_records_prepartition (not
 * dropped) for rollback safety.
 */
export class PartitionAttendanceRecordsMonthly1852000000000 implements MigrationInterface {
  name = 'PartitionAttendanceRecordsMonthly1852000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (await tableExists(queryRunner, '_deprecated_attendance_records_prepartition')) {
      throw new Error(
        '_deprecated_attendance_records_prepartition already exists — a previous run of this ' +
        'migration was interrupted. Resolve manually before re-running.',
      );
    }

    // Partition boundaries: earliest data month .. current month + 2 lookahead months.
    const [minRow] = await queryRunner.query(
      `SELECT DATE_FORMAT(MIN(\`date\`), '%Y-%m-01') AS minMonth FROM attendance_records`,
    );
    const startMonth = minRow?.minMonth ? new Date(`${minRow.minMonth}T00:00:00Z`) : new Date();
    startMonth.setUTCDate(1);

    const endMonth = new Date();
    endMonth.setUTCDate(1);
    endMonth.setUTCHours(0, 0, 0, 0);
    endMonth.setUTCMonth(endMonth.getUTCMonth() + 2);

    const partitionClauses: string[] = [];
    const cursor = new Date(startMonth);
    while (cursor <= endMonth) {
      const name = `p${cursor.getUTCFullYear()}${String(cursor.getUTCMonth() + 1).padStart(2, '0')}`;
      const upper = new Date(cursor);
      upper.setUTCMonth(upper.getUTCMonth() + 1);
      const upperStr = upper.toISOString().slice(0, 10);
      partitionClauses.push(`PARTITION ${name} VALUES LESS THAN ('${upperStr}')`);
      cursor.setUTCMonth(cursor.getUTCMonth() + 1);
    }
    partitionClauses.push(`PARTITION pMAX VALUES LESS THAN (MAXVALUE)`);

    await queryRunner.query(`
      CREATE TABLE \`attendance_records_partitioned\` (
        \`id\` bigint NOT NULL AUTO_INCREMENT,
        \`dynamo_pk\` varchar(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL COMMENT 'DynamoDB partition key: I#<instituteId>',
        \`dynamo_sk\` varchar(512) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL COMMENT 'DynamoDB sort key',
        \`institute_id\` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
        \`student_id\` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
        \`date\` date NOT NULL COMMENT 'Attendance date (YYYY-MM-DD) — monthly partition key',
        \`status\` tinyint NOT NULL COMMENT '0=Absent, 1=Present, 2=Late, 3=Left, 4=LeftEarly, 5=LeftLately',
        \`timestamp\` bigint NOT NULL COMMENT 'DynamoDB write timestamp (epoch ms)',
        \`check_in_time\` datetime DEFAULT NULL COMMENT 'When the student checked in (first mark of this attendance instance)',
        \`check_in_status\` tinyint DEFAULT NULL COMMENT 'Status at check-in: 0=Absent,1=Present,2=Late,3=Left,4=LeftEarly,5=LeftLately',
        \`check_in_marked_by\` varchar(64) DEFAULT NULL COMMENT 'User ID (or system/device UID) who recorded the check-in',
        \`check_out_time\` datetime DEFAULT NULL COMMENT 'When the student checked out, if this instance has a checkout',
        \`check_out_status\` tinyint DEFAULT NULL COMMENT 'Status at check-out, independent of check_in_status',
        \`check_out_marked_by\` varchar(64) DEFAULT NULL COMMENT 'User ID (or system/device UID) who recorded the check-out',
        \`class_id\` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci DEFAULT NULL,
        \`subject_id\` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci DEFAULT NULL,
        \`calendar_day_id\` bigint DEFAULT NULL COMMENT 'FK -> institute_calendar_days.id (app-enforced)',
        \`event_id\` bigint DEFAULT NULL COMMENT 'FK -> institute_calendar_events.id (app-enforced)',
        \`location\` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci DEFAULT NULL,
        \`latitude\` decimal(10,8) DEFAULT NULL COMMENT 'Latitude coordinate (decimal degrees)',
        \`longitude\` decimal(11,8) DEFAULT NULL COMMENT 'Longitude coordinate (decimal degrees)',
        \`remarks\` text CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci,
        \`marking_method\` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci DEFAULT NULL COMMENT 'MANUAL, NFC, QR, DEVICE, FACE, etc.',
        \`user_type\` varchar(32) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci DEFAULT NULL COMMENT 'STUDENT, TEACHER, INSTITUTE_ADMIN, etc.',
        \`device_uid\` varchar(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci DEFAULT NULL COMMENT 'Attendance device UID',
        \`advertisement_id\` varchar(128) DEFAULT NULL COMMENT 'Advertisement ID associated with this attendance record (for delivery capability tracking)',
        \`sync_status\` varchar(16) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL DEFAULT 'SYNCED' COMMENT 'PENDING, SYNCED, FAILED, SKIPPED',
        \`sync_error\` text CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci COMMENT 'Error message if sync_status=FAILED',
        \`synced_at\` timestamp NULL DEFAULT NULL COMMENT 'When this record was synced to MySQL',
        \`created_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`class_session_id\` varchar(36) DEFAULT NULL,
        PRIMARY KEY (\`id\`, \`date\`),
        UNIQUE KEY \`UQ_dynamo_pk_sk_date\` (\`dynamo_pk\`, \`dynamo_sk\`, \`date\`),
        KEY \`IDX_institute_date_class\` (\`institute_id\`, \`date\`, \`class_id\`),
        KEY \`IDX_student_institute_date\` (\`student_id\`, \`institute_id\`, \`date\`),
        KEY \`IDX_student_date\` (\`student_id\`, \`date\`),
        KEY \`IDX_event_student\` (\`event_id\`, \`student_id\`),
        KEY \`IDX_session_checkin_open\` (\`class_session_id\`, \`student_id\`, \`check_out_time\`),
        KEY \`IDX_calendar_day\` (\`calendar_day_id\`),
        KEY \`IDX_sync_status\` (\`sync_status\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
      PARTITION BY RANGE COLUMNS(\`date\`) (
        ${partitionClauses.join(',\n        ')}
      )
    `);

    await queryRunner.query(`
      INSERT INTO attendance_records_partitioned
      SELECT * FROM attendance_records
    `);

    // Verify the copy before the swap — a silent partial copy here would lose data.
    const [oldCount] = await queryRunner.query(`SELECT COUNT(*) AS c FROM attendance_records`);
    const [newCount] = await queryRunner.query(`SELECT COUNT(*) AS c FROM attendance_records_partitioned`);
    if (Number(oldCount.c) !== Number(newCount.c)) {
      throw new Error(
        `Row count mismatch after copy: old=${oldCount.c} new=${newCount.c} — aborting before swap.`,
      );
    }

    await queryRunner.query(`
      RENAME TABLE attendance_records TO _deprecated_attendance_records_prepartition,
                   attendance_records_partitioned TO attendance_records
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (!(await tableExists(queryRunner, '_deprecated_attendance_records_prepartition'))) {
      throw new Error(
        'Cannot revert: _deprecated_attendance_records_prepartition not found.',
      );
    }

    // Rows written after the partition swap exist only in the new table — copy them
    // back into the old-format table before restoring it, so no marks are lost.
    await queryRunner.query(`
      INSERT IGNORE INTO _deprecated_attendance_records_prepartition
      SELECT * FROM attendance_records
    `);

    await queryRunner.query(`
      RENAME TABLE attendance_records TO attendance_records_partitioned,
                   _deprecated_attendance_records_prepartition TO attendance_records
    `);
    await queryRunner.query(`DROP TABLE attendance_records_partitioned`);
  }
}
