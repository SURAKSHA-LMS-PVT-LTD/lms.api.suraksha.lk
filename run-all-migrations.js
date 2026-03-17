/**
 * run-all-migrations.js
 *
 * Reads DB credentials from .env (same source as the NestJS app) and
 * applies every pending migration in order.
 *
 * Usage:
 *   node run-all-migrations.js
 */
require('dotenv').config();
const mysql = require('mysql2/promise');
const fs    = require('fs');
const path  = require('path');

const DB_HOST = process.env.DB_HOST;
const DB_PORT = parseInt(process.env.DB_PORT || '3306', 10);
const DB_USER = process.env.DB_USERNAME;
const DB_PASS = process.env.DB_PASSWORD;
const DB_NAME = process.env.DB_DATABASE;

if (!DB_HOST || !DB_USER || !DB_PASS || !DB_NAME) {
  console.error('❌  Missing DB_* env vars. Make sure .env is present.');
  process.exit(1);
}

// ── ordered list of migration files ────────────────────────────────────────
const MIGRATIONS = [
  '20250708_system_config_attendance_records.sql',
  '20260303_system_config_expand_all_groups.sql',
  '20260317_attendance_records_add_lat_lng.sql',
  '20260317_attendance_records_normalize_names.sql',
  '20260317_attendance_records_add_class_subject_indexes.sql',
];

async function run() {
  console.log(`\n🔌  Connecting to MySQL ${DB_HOST}:${DB_PORT} / ${DB_NAME} …`);
  const conn = await mysql.createConnection({
    host:               DB_HOST,
    port:               DB_PORT,
    user:               DB_USER,
    password:           DB_PASS,
    database:           DB_NAME,
    multipleStatements: true,
    connectTimeout:     30_000,
  });
  console.log('✅  Connected.\n');

  for (const file of MIGRATIONS) {
    const filePath = path.join(__dirname, 'migrations', file);
    if (!fs.existsSync(filePath)) {
      console.log(`⚠️   ${file} — file not found, skipping.`);
      continue;
    }

    const sql = fs.readFileSync(filePath, 'utf8');
    console.log(`▶   Running ${file} …`);
    try {
      await conn.query(sql);
      console.log(`✅  ${file} — OK\n`);
    } catch (e) {
      // Treat "already exists" class of errors as warnings, not hard failures
      if (
        e.code === 'ER_TABLE_EXISTS_ERROR' ||
        e.code === 'ER_DUP_KEYNAME'        ||
        e.message?.includes('Duplicate')
      ) {
        console.log(`ℹ️   ${file} — already applied (${e.message})\n`);
      } else {
        console.error(`❌  ${file} — ERROR: ${e.message}\n`);
        // Don't abort; still attempt remaining migrations
      }
    }
  }

  // ── Verify attendance_records schema ────────────────────────────────────
  console.log('── Schema verification ─────────────────────────────────────');
  const [cols] = await conn.query(
    `SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'attendance_records'
     ORDER BY ORDINAL_POSITION`,
    [DB_NAME],
  );

  const colNames = cols.map(c => c.COLUMN_NAME);
  const required = [
    'id', 'dynamo_pk', 'dynamo_sk', 'institute_id', 'student_id',
    'date', 'status', 'timestamp', 'latitude', 'longitude',
    'location', 'remarks', 'marking_method', 'user_type', 'device_uid',
    'sync_status', 'sync_error', 'synced_at', 'created_at',
  ];

  let allPresent = true;
  for (const col of required) {
    const ok = colNames.includes(col);
    console.log(`  ${ok ? '✅' : '❌'} attendance_records.${col}`);
    if (!ok) allPresent = false;
  }

  // ── Verify indexes ───────────────────────────────────────────────────────
  const [idxRows] = await conn.query(
    `SELECT INDEX_NAME FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'attendance_records'
     GROUP BY INDEX_NAME`,
    [DB_NAME],
  );
  const idxNames = idxRows.map(r => r.INDEX_NAME);
  const requiredIdx = [
    'UQ_dynamo_pk_sk', 'IDX_institute_date', 'IDX_student_date',
    'IDX_student_institute_date', 'IDX_calendar_day', 'IDX_event', 'IDX_sync_status',
  ];
  console.log('');
  for (const idx of requiredIdx) {
    const ok = idxNames.includes(idx);
    console.log(`  ${ok ? '✅' : '❌'} index: ${idx}`);
    if (!ok) allPresent = false;
  }

  // ── system_config entries ────────────────────────────────────────────────
  const [cfgRows] = await conn.query(
    `SELECT config_group, COUNT(*) AS cnt FROM system_config GROUP BY config_group ORDER BY config_group`,
  );
  console.log('\n── system_config summary ───────────────────────────────────');
  let total = 0;
  for (const r of cfgRows) {
    console.log(`  ${r.config_group}: ${r.cnt} entries`);
    total += parseInt(r.cnt, 10);
  }
  console.log(`  TOTAL: ${total} entries`);

  await conn.end();

  console.log('\n' + (allPresent
    ? '🎉  All migrations applied and schema verified!'
    : '⚠️   Some columns/indexes are still missing — check errors above.'));
}

run().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
