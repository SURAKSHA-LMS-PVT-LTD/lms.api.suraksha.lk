/**
 * Read-only audit for attendance session linkage.
 * Uses env vars to connect to Suraksha and Thilina DBs and prints schema + counts.
 *
 * Run:
 *   npx ts-node -r tsconfig-paths/register scripts/audit-attendance-tables.ts
 */

import * as mysql from 'mysql2/promise';
import { config } from 'dotenv';
import * as path from 'path';

config({ path: path.resolve(__dirname, '../.env') });

type DbConfig = {
  label: string;
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
};

function env(name: string): string | null {
  const v = process.env[name];
  return v && v.trim() ? v.trim() : null;
}

function loadSurakshaConfig(): DbConfig | null {
  const host = env('DB_HOST');
  const port = Number(env('DB_PORT') || 3306);
  const user = env('DB_USERNAME');
  const password = env('DB_PASSWORD');
  const database = env('DB_DATABASE');
  const missing = [
    !host && 'DB_HOST',
    !user && 'DB_USERNAME',
    !password && 'DB_PASSWORD',
    !database && 'DB_DATABASE',
  ].filter(Boolean);
  if (missing.length) {
    console.log(`Missing Suraksha DB env: ${missing.join(', ')}`);
    return null;
  }
  return { label: 'Suraksha', host: host!, port, user: user!, password: password!, database: database! };
}

function loadThilinaConfig(): DbConfig | null {
  const host = env('THILINA_DB_HOST');
  const port = Number(env('THILINA_DB_PORT') || 3306);
  const user = env('THILINA_DB_USERNAME');
  const password = env('THILINA_DB_PASSWORD');
  const database = env('THILINA_DB_DATABASE');
  const missing = [
    !host && 'THILINA_DB_HOST',
    !user && 'THILINA_DB_USERNAME',
    !password && 'THILINA_DB_PASSWORD',
    !database && 'THILINA_DB_DATABASE',
  ].filter(Boolean);
  if (missing.length) {
    console.log(`Missing Thilina DB env: ${missing.join(', ')}`);
    return null;
  }
  return { label: 'Thilina', host: host!, port, user: user!, password: password!, database: database! };
}

async function connectDb(cfg: DbConfig): Promise<mysql.Connection> {
  return mysql.createConnection({
    host: cfg.host,
    port: cfg.port,
    user: cfg.user,
    password: cfg.password,
    database: cfg.database,
    charset: 'utf8mb4',
    supportBigNumbers: true,
    bigNumberStrings: true,
  });
}

async function getColumns(conn: mysql.Connection, tables: string[]): Promise<mysql.RowDataPacket[]> {
  const [rows] = await conn.execute<mysql.RowDataPacket[]>(
    `SELECT TABLE_NAME, COLUMN_NAME, DATA_TYPE, COLUMN_TYPE, IS_NULLABLE
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME IN (${tables.map(() => '?').join(',')})
     ORDER BY TABLE_NAME, ORDINAL_POSITION`,
    tables
  );
  return rows;
}

async function hasColumn(conn: mysql.Connection, table: string, column: string): Promise<boolean> {
  const [rows] = await conn.execute<mysql.RowDataPacket[]>(
    `SELECT 1
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = ? AND COLUMN_NAME = ?
     LIMIT 1`,
    [table, column]
  );
  return rows.length > 0;
}

function printColumns(label: string, rows: mysql.RowDataPacket[]) {
  console.log(`\n${label} columns:`);
  for (const r of rows) {
    console.log(`  ${r.TABLE_NAME}.${r.COLUMN_NAME} - ${r.COLUMN_TYPE} ${r.IS_NULLABLE === 'YES' ? 'NULL' : 'NOT NULL'}`);
  }
}

async function auditSuraksha(conn: mysql.Connection) {
  console.log('\n=== Suraksha DB Audit ===');
  const columns = await getColumns(conn, [
    'attendance_records',
    'institute_class_attendance_sessions',
    'institute_class_attendance_session_groups',
  ]);
  printColumns('Suraksha', columns);

  const [[sessionCount]] = await conn.execute<mysql.RowDataPacket[]>(
    `SELECT COUNT(*) AS total_sessions FROM institute_class_attendance_sessions`
  );
  const [[groupCount]] = await conn.execute<mysql.RowDataPacket[]>(
    `SELECT COUNT(*) AS total_groups FROM institute_class_attendance_session_groups`
  );
  const [[attendanceCount]] = await conn.execute<mysql.RowDataPacket[]>(
    `SELECT COUNT(*) AS total_records FROM attendance_records`
  );
  const [[linkCount]] = await conn.execute<mysql.RowDataPacket[]>(
    `SELECT
       SUM(class_session_id IS NOT NULL) AS linked_records,
       SUM(class_session_id IS NULL)     AS unlinked_records
     FROM attendance_records`
  );
  const [[orphanCount]] = await conn.execute<mysql.RowDataPacket[]>(
    `SELECT COUNT(*) AS orphan_links
     FROM attendance_records r
     LEFT JOIN institute_class_attendance_sessions s
       ON r.class_session_id = s.id
     WHERE r.class_session_id IS NOT NULL AND s.id IS NULL`
  );
  const [[multiSessionDates]] = await conn.execute<mysql.RowDataPacket[]>(
    `SELECT COUNT(*) AS multi_session_dates
     FROM (
       SELECT class_id, date, COUNT(*) AS c
       FROM institute_class_attendance_sessions
       GROUP BY class_id, date
       HAVING c > 1
     ) t`
  );

  console.log(`\nSuraksha counts:`);
  console.log(`  Sessions           : ${sessionCount.total_sessions}`);
  console.log(`  Session groups     : ${groupCount.total_groups}`);
  console.log(`  Attendance records : ${attendanceCount.total_records}`);
  console.log(`  Linked records     : ${linkCount.linked_records}`);
  console.log(`  Unlinked records   : ${linkCount.unlinked_records}`);
  console.log(`  Orphaned links     : ${orphanCount.orphan_links}`);
  console.log(`  Multi-session dates: ${multiSessionDates.multi_session_dates}`);
}

async function auditThilina(conn: mysql.Connection) {
  console.log('\n=== Thilina DB Audit ===');
  const columns = await getColumns(conn, [
    'ClassAttendance',
    'ClassAttendanceSession',
    'ClassAttendanceWeek',
  ]);
  printColumns('Thilina', columns);

  const [[attendanceCount]] = await conn.execute<mysql.RowDataPacket[]>(
    `SELECT COUNT(*) AS total_records FROM ClassAttendance`
  );
  const [[sessionCount]] = await conn.execute<mysql.RowDataPacket[]>(
    `SELECT COUNT(*) AS total_sessions FROM ClassAttendanceSession`
  );
  const [[weekCount]] = await conn.execute<mysql.RowDataPacket[]>(
    `SELECT COUNT(*) AS total_weeks FROM ClassAttendanceWeek`
  );

  const hasSessionTime = await hasColumn(conn, 'ClassAttendance', 'sessionTime');
  const hasSessionCode = await hasColumn(conn, 'ClassAttendance', 'sessionCode');
  let sessionTimeCount = null as null | number;
  let sessionCodeCount = null as null | number;

  if (hasSessionTime) {
    const [[row]] = await conn.execute<mysql.RowDataPacket[]>(
      `SELECT SUM(sessionTime IS NOT NULL) AS with_session_time FROM ClassAttendance`
    );
    sessionTimeCount = Number(row.with_session_time || 0);
  }
  if (hasSessionCode) {
    const [[row]] = await conn.execute<mysql.RowDataPacket[]>(
      `SELECT SUM(sessionCode IS NOT NULL) AS with_session_code FROM ClassAttendance`
    );
    sessionCodeCount = Number(row.with_session_code || 0);
  }

  console.log(`\nThilina counts:`);
  console.log(`  ClassAttendance        : ${attendanceCount.total_records}`);
  console.log(`  ClassAttendanceSession : ${sessionCount.total_sessions}`);
  console.log(`  ClassAttendanceWeek    : ${weekCount.total_weeks}`);
  if (hasSessionTime) console.log(`  With sessionTime       : ${sessionTimeCount}`);
  if (hasSessionCode) console.log(`  With sessionCode       : ${sessionCodeCount}`);
}

async function main() {
  const surakshaCfg = loadSurakshaConfig();
  const thilinaCfg = loadThilinaConfig();

  if (!surakshaCfg || !thilinaCfg) {
    console.log('\nSet the missing env vars and re-run. No queries executed.');
    process.exit(1);
  }

  const surConn = await connectDb(surakshaCfg);
  const thiConn = await connectDb(thilinaCfg);

  try {
    await auditSuraksha(surConn);
    await auditThilina(thiConn);
  } finally {
    await surConn.end();
    await thiConn.end();
  }
}

main().catch(err => {
  console.error('Audit failed:', err?.message || err);
  process.exit(1);
});
