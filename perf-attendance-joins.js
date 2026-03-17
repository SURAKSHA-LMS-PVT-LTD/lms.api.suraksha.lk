/**
 * perf-attendance-joins.js
 * Compares three name-resolution strategies for attendance_records:
 *   A) Current: resolveNames() batch IN queries (4 parallel queries)
 *   B) Bad:     6-table JOIN with CAST on referenced PK → kills index
 *   C) Optimal: 6-table JOIN casting attendance VARCHAR to UNSIGNED → uses PK index
 *
 * Also checks whether attendance_records ID columns (student_id etc.) are indexed,
 * because that affects how efficiently the JOIN filters.
 */
require('dotenv').config();
const mysql = require('mysql2/promise');

const DB = {
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT || '3306', 10),
  user: process.env.DB_USERNAME,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_DATABASE,
};

async function run() {
  console.log(`\n🔌  Connecting to ${DB.host} / ${DB.database} …`);
  const c = await mysql.createConnection({ ...DB, multipleStatements: false });
  console.log('✅  Connected.\n');

  // Get real sample data
  const [ar] = await c.query(
    'SELECT student_id, institute_id, class_id, subject_id, calendar_day_id, event_id FROM attendance_records LIMIT 10'
  );
  const studentIds   = [...new Set(ar.map(r => r.student_id).filter(Boolean))];
  const instituteIds = [...new Set(ar.map(r => r.institute_id).filter(Boolean))];
  const classIds     = [...new Set(ar.map(r => r.class_id).filter(Boolean).filter(x => x !== 'default'))];
  const calDayIds    = [...new Set(ar.map(r => r.calendar_day_id).filter(Boolean))];
  const eventIds     = [...new Set(ar.map(r => r.event_id).filter(Boolean))];
  const sampleInstId = ar[0].institute_id;
  const sampleDate   = '2026-03-16';

  // ──────────────────────────────────────────────────────────────────────────
  // A. Current service approach: resolveNames() → 4 parallel IN queries
  // ──────────────────────────────────────────────────────────────────────────
  console.log('══ A. resolveNames() — 4 parallel batch IN queries (current) ══');
  console.log('These are PK lookups — always use PRIMARY key index.\n');

  for (const [label, sql, params] of [
    ['users',                  'EXPLAIN SELECT id,name_with_initials,first_name,last_name FROM users WHERE id IN (?)',                     [studentIds]],
    ['institutes',             'EXPLAIN SELECT id,name FROM institutes WHERE id IN (?)',                                                    [instituteIds]],
    ['institute_classes',      classIds.length ? 'EXPLAIN SELECT id,name FROM institute_classes WHERE id IN (?)' : null,                    [classIds]],
    ['subjects',               'EXPLAIN SELECT id,name FROM subjects WHERE id IN (?)',                                                      [[1]]],
    ['institute_calendar_days','EXPLAIN SELECT id,calendar_date FROM institute_calendar_days WHERE id IN (?)',                              [calDayIds]],
    ['institute_calendar_events','EXPLAIN SELECT id,title FROM institute_calendar_events WHERE id IN (?)',                                  [eventIds]],
  ]) {
    if (!sql) { console.log(`  ${label}: skipped (no IDs)`); continue; }
    const [rows] = await c.query(sql, params);
    for (const r of rows) {
      const good = r.key && (r.key === 'PRIMARY' || r.type === 'range' || r.type === 'ref' || r.type === 'eq_ref');
      console.log(`  ${good ? '✅' : '❌'} ${label.padEnd(28)} key=${r.key||'NONE'} type=${r.type} rows≈${r.rows} Extra=${r.Extra||'-'}`);
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // B. Bad JOIN: CAST on referenced table PK side → index unusable
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n══ B. JOIN with CAST on referenced PK (BAD — index killer) ══');
  console.log('   ON CAST(u.id AS CHAR) = ar.student_id  ← wrapping PK in function = no index\n');

  const sqlB = `
    EXPLAIN
    SELECT ar.student_id, u.name_with_initials, i.name, cd.calendar_date, ce.title
    FROM attendance_records ar
    LEFT JOIN users u ON CAST(u.id AS CHAR) = ar.student_id
    LEFT JOIN institutes i ON CAST(i.id AS CHAR) = ar.institute_id
    LEFT JOIN institute_calendar_days cd ON cd.id = ar.calendar_day_id
    LEFT JOIN institute_calendar_events ce ON ce.id = ar.event_id
    WHERE ar.institute_id = ? AND ar.date = ?`;

  const [rowsB] = await c.query(sqlB, [sampleInstId, sampleDate]);
  for (const r of rowsB) {
    const bad = !r.key || r.type === 'ALL' || r.type === 'index';
    console.log(`  ${bad ? '❌' : '✅'} ${r.table.padEnd(30)} key=${r.key||'NONE'} type=${r.type} rows≈${r.rows} Extra=${r.Extra||'-'}`);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // C. Optimal JOIN: cast attendance VARCHAR → UNSIGNED so PK index is used
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n══ C. JOIN casting attendance side to UNSIGNED (OPTIMAL) ══');
  console.log('   ON u.id = CAST(ar.student_id AS UNSIGNED)  ← PK stays unwrapped = index used\n');

  const sqlC = `
    EXPLAIN
    SELECT ar.student_id,
           COALESCE(u.name_with_initials, CONCAT_WS(' ', u.first_name, u.last_name)) AS student_name,
           i.name   AS institute_name,
           ic.name  AS class_name,
           s.name   AS subject_name,
           cd.calendar_date,
           ce.title AS event_title
    FROM attendance_records ar
    LEFT JOIN users u                    ON u.id  = CAST(ar.student_id   AS UNSIGNED)
    LEFT JOIN institutes i               ON i.id  = CAST(ar.institute_id  AS UNSIGNED)
    LEFT JOIN institute_classes ic       ON ic.id = CAST(ar.class_id      AS UNSIGNED)
    LEFT JOIN subjects s                 ON s.id  = CAST(ar.subject_id    AS UNSIGNED)
    LEFT JOIN institute_calendar_days cd ON cd.id = ar.calendar_day_id
    LEFT JOIN institute_calendar_events ce ON ce.id = ar.event_id
    WHERE ar.institute_id = ? AND ar.date = ?`;

  const [rowsC] = await c.query(sqlC, [sampleInstId, sampleDate]);
  for (const r of rowsC) {
    const bad = !r.key || r.type === 'ALL' || r.type === 'index';
    console.log(`  ${bad ? '❌' : '✅'} ${r.table.padEnd(30)} key=${r.key||'NONE'} type=${r.type} rows≈${r.rows} Extra=${r.Extra||'-'}`);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // D. Run C with actual data to confirm correct name resolution
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n══ D. Optimal JOIN — live data sample ══');
  const sqlD = `
    SELECT ar.id,
           COALESCE(u.name_with_initials, NULLIF(TRIM(CONCAT_WS(' ',u.first_name,u.last_name)),'')) AS student_name,
           i.name   AS institute_name,
           ic.name  AS class_name,
           s.name   AS subject_name,
           cd.calendar_date,
           ce.title AS event_title
    FROM attendance_records ar
    LEFT JOIN users u                    ON u.id  = CAST(ar.student_id   AS UNSIGNED)
    LEFT JOIN institutes i               ON i.id  = CAST(ar.institute_id  AS UNSIGNED)
    LEFT JOIN institute_classes ic       ON ic.id = CAST(ar.class_id      AS UNSIGNED)
    LEFT JOIN subjects s                 ON s.id  = CAST(ar.subject_id    AS UNSIGNED)
    LEFT JOIN institute_calendar_days cd ON cd.id = ar.calendar_day_id
    LEFT JOIN institute_calendar_events ce ON ce.id = ar.event_id
    ORDER BY ar.created_at DESC
    LIMIT 5`;

  const [rowsD] = await c.query(sqlD);
  console.table(rowsD.map(r => ({
    student:       r.student_name   || '(no match)',
    institute:     r.institute_name || '(no match)',
    class:         r.class_name     || '-',
    subject:       r.subject_name   || '-',
    calendar_date: r.calendar_date ? new Date(r.calendar_date).toISOString().slice(0,10) : '-',
    event:         r.event_title    || '-',
  })));

  // ──────────────────────────────────────────────────────────────────────────
  // E. Index audit on attendance_records ID columns
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n══ E. Indexes on attendance_records ID columns ══');
  const [idxs] = await c.query('SHOW INDEX FROM attendance_records');
  const indexedCols = new Set(idxs.map(r => r.Column_name));
  const idCols = ['student_id','institute_id','class_id','subject_id','calendar_day_id','event_id'];
  for (const col of idCols) {
    const has = indexedCols.has(col);
    // find the index name for this column
    const idx = idxs.find(r => r.Column_name === col);
    console.log(`  ${has ? '✅' : '⚠️ '} ${col.padEnd(22)} ${has ? 'indexed via ' + idx.Key_name : 'NO INDEX — JOIN scan will visit all rows'}`);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // F. Verdict
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n══ F. Performance Verdict ══════════════════════════════════');
  console.log('  Approach A (current — resolveNames batch IN):');
  console.log('    • 4 queries, each hits PK index of referenced table');
  console.log('    • O(1) per batch regardless of attendance set size');
  console.log('    • Best for: list endpoints returning many records');
  console.log('');
  console.log('  Approach C (single 6-table JOIN, CAST on attendance side):');
  console.log('    • 1 query, attendance_records filtered first by IDX_institute_date');
  console.log('    • Then PK index lookups on each referenced table');
  console.log('    • Best for: single-record read or small result sets');
  console.log('    • NOTE: class_id/subject_id are VARCHAR in attendance_records');
  console.log('      CAST AS UNSIGNED handles numeric IDs, but sentinel "default" → 0 (no match) — correct behaviour');
  console.log('');
  console.log('  Approach B (CAST on PK side) → NEVER use — disables all PK indexes');

  await c.end();
}

run().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
