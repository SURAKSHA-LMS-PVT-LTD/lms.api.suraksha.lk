/**
 * PHASE 1 — Deep inspection + mismatch report
 * Source: Thilina DB at 34.42.163.47
 * Target: Suraksha DB (Thilina tenant) via .env
 *
 * USAGE:
 *   cd lms-api-suraksha-lk
 *   $env:THILINA_DB_PASSWORD = 'yourpassword'
 *   $env:THILINA_DB_DATABASE = 'yourdbname'   # run SHOW DATABASES first if unsure
 *   node inspect-thilina.cjs > thilina-inspect.txt
 *   # paste thilina-inspect.txt contents back in chat
 *
 * Nothing is written — SELECT / SHOW only.
 */
'use strict';
require('dotenv').config();
const mysql = require('mysql2/promise');

const SOURCE_CFG = {
  host:     process.env.THILINA_DB_HOST     || '34.42.163.47',
  port:    +(process.env.THILINA_DB_PORT     || 3306),
  user:     process.env.THILINA_DB_USERNAME  || 'root',
  password: process.env.THILINA_DB_PASSWORD  || '',
  database: process.env.THILINA_DB_DATABASE  || 'thilinadhananjaya_lms',
  ssl: { rejectUnauthorized: false },
  connectTimeout: 15000,
};

const TARGET_CFG = {
  host:     process.env.DB_HOST,
  port:    +(process.env.DB_PORT     || 3306),
  user:     process.env.DB_USERNAME,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_DATABASE,
  connectTimeout: 15000,
};

// ── helpers ───────────────────────────────────────────────────────────────────
function section(title) { console.log(`\n${'═'.repeat(60)}\n  ${title}\n${'═'.repeat(60)}`); }
function sub(title)     { console.log(`\n── ${title} ──`); }

async function q(conn, sql, params) {
  try {
    const [rows] = await conn.query(sql, params || []);
    return rows;
  } catch (e) {
    return [{ ERROR: e.message }];
  }
}

async function show(label, rows) {
  sub(label);
  if (!rows.length) { console.log('  (no rows)'); return; }
  console.log(JSON.stringify(rows, null, 2));
}

async function connectWithFallback(cfg, label) {
  try {
    const c = await mysql.createConnection(cfg);
    console.log(`[ok] ${label}: ${cfg.host}/${cfg.database}`);
    return c;
  } catch (_) {
    try {
      const c = await mysql.createConnection({ ...cfg, ssl: undefined });
      console.log(`[ok] ${label} (no-ssl): ${cfg.host}/${cfg.database}`);
      return c;
    } catch (e2) {
      console.error(`[FAIL] ${label}: ${e2.message}`);
      console.error('  → set THILINA_DB_PASSWORD and THILINA_DB_DATABASE env vars.');
      process.exit(1);
    }
  }
}

// ── main ──────────────────────────────────────────────────────────────────────
(async () => {

  // ── 1. SOURCE (Thilina old DB) ────────────────────────────────────────────
  const src = await connectWithFallback(SOURCE_CFG, 'SOURCE');

  section('SOURCE: Available databases (pick one for THILINA_DB_DATABASE)');
  await show('SHOW DATABASES', await q(src, 'SHOW DATABASES'));

  section('SOURCE: Institutes');
  const srcInstitutes = await q(src, 'SELECT id, name, code, email, type FROM institutes ORDER BY id');
  await show('institutes', srcInstitutes);

  section('SOURCE: Classes (all)');
  const srcClasses = await q(src,
    `SELECT id, institute_id, name, code, academic_year, grade, class_type, is_active
     FROM institute_classes ORDER BY name`);
  await show('institute_classes', srcClasses);

  section('SOURCE: Subjects / Months (all)');
  const srcSubjects = await q(src,
    `SELECT id, institute_id, code, name, subject_type, is_active FROM subjects ORDER BY name`);
  await show('subjects', srcSubjects);

  section('SOURCE: Recordings');
  const [srcRecCount] = await q(src, 'SELECT COUNT(*) AS n FROM subject_recordings');
  console.log('total:', srcRecCount.n);
  await show('sample (8)', await q(src,
    `SELECT id, institute_id, class_id, subject_id, title, platform,
            recording_url, status, rec_url_id
     FROM subject_recordings ORDER BY id LIMIT 8`));
  await show('ALL recordings', await q(src,
    `SELECT id, institute_id, class_id, subject_id, title, platform,
            recording_url, status, rec_url_id, created_at
     FROM subject_recordings ORDER BY id`));

  section('SOURCE: Lectures');
  const [srcLecCount] = await q(src, 'SELECT COUNT(*) AS n FROM institute_class_subject_lectures');
  console.log('total:', srcLecCount.n);
  await show('ALL lectures', await q(src,
    `SELECT id, institute_id, class_id, subject_id, title, start_time,
            status, recording_url, rec_url_id, live_url_id, created_at
     FROM institute_class_subject_lectures ORDER BY id`));

  section('SOURCE: Users');
  const [srcUserCount]    = await q(src, 'SELECT COUNT(*) AS n FROM users');
  const [srcStudCount]    = await q(src, 'SELECT COUNT(*) AS n FROM students');
  const [srcParCount]     = await q(src, 'SELECT COUNT(*) AS n FROM parents');
  const [srcIuCount]      = await q(src, 'SELECT COUNT(*) AS n FROM institute_user');
  const [srcIcsCount]     = await q(src, 'SELECT COUNT(*) AS n FROM institute_class_students');
  console.log(JSON.stringify({ users: srcUserCount.n, students: srcStudCount.n,
    parents: srcParCount?.n ?? 'N/A', institute_user: srcIuCount.n,
    class_students: srcIcsCount.n }, null, 2));

  await show('institute_user sample', await q(src,
    `SELECT iu.id, iu.user_id, iu.institute_id, iu.institute_user_type, u.email, u.name
     FROM institute_user iu JOIN users u ON u.id = iu.user_id LIMIT 20`));

  await show('institute_class_students sample', await q(src,
    `SELECT ics.id, ics.class_id, ics.student_id, s.user_id, u.name, u.email
     FROM institute_class_students ics
     JOIN students s ON s.id = ics.student_id
     JOIN users u ON u.id = s.user_id LIMIT 20`));

  // class_subject mappings
  section('SOURCE: Class-Subject mappings');
  await show('institute_class_subject', await q(src,
    `SELECT id, class_id, subject_id FROM institute_class_subject ORDER BY class_id, subject_id`));

  await src.end();

  // ── 2. TARGET (Suraksha Thilina tenant) ──────────────────────────────────
  const tgt = await connectWithFallback(TARGET_CFG, 'TARGET (Suraksha)');

  section('TARGET: Thilina institute row');
  const tgtInstitutes = await q(tgt,
    `SELECT id, name, code, email FROM institutes WHERE name LIKE '%hilina%' OR name LIKE '%Thilina%'`);
  await show('thilina_institute', tgtInstitutes);

  const thilinaTgtId = tgtInstitutes[0]?.id;
  if (!thilinaTgtId) {
    console.error('  [WARN] No Thilina institute found in target DB — migration has not run yet.');
  }

  section('TARGET: Classes in Thilina tenant');
  const tgtClasses = await q(tgt,
    `SELECT c.id, c.name, c.code, c.grade, c.academic_year, c.class_type, c.is_active
     FROM institute_classes c
     WHERE c.institute_id = ?
     ORDER BY c.name`, [thilinaTgtId]);
  await show('thilina_classes', tgtClasses);

  section('TARGET: Subjects in Thilina tenant');
  const tgtSubjects = await q(tgt,
    `SELECT s.id, s.code, s.name, s.subject_type
     FROM subjects s
     WHERE s.institute_id = ?
     ORDER BY s.name`, [thilinaTgtId]);
  await show('thilina_subjects', tgtSubjects);

  section('TARGET: Recordings in Thilina tenant');
  const [tgtRecCount] = await q(tgt,
    `SELECT COUNT(*) AS n FROM subject_recordings WHERE institute_id = ?`, [thilinaTgtId]);
  console.log('total:', tgtRecCount?.n ?? 0);
  await show('recordings', await q(tgt,
    `SELECT id, class_id, subject_id, title, platform, rec_url_id, status
     FROM subject_recordings WHERE institute_id = ? ORDER BY id`, [thilinaTgtId]));

  section('TARGET: Lectures in Thilina tenant');
  const [tgtLecCount] = await q(tgt,
    `SELECT COUNT(*) AS n FROM institute_class_subject_lectures WHERE institute_id = ?`, [thilinaTgtId]);
  console.log('total:', tgtLecCount?.n ?? 0);
  await show('lectures', await q(tgt,
    `SELECT id, class_id, subject_id, title, rec_url_id, live_url_id, status
     FROM institute_class_subject_lectures WHERE institute_id = ? ORDER BY id`, [thilinaTgtId]));

  section('TARGET: Class-subject mappings in Thilina tenant');
  await show('institute_class_subject', await q(tgt,
    `SELECT ics.id, ics.class_id, ics.subject_id, c.name AS class_name, s.name AS subject_name
     FROM institute_class_subject ics
     JOIN institute_classes c ON c.id = ics.class_id
     JOIN subjects s ON s.id = ics.subject_id
     WHERE c.institute_id = ?
     ORDER BY c.name, s.name`, [thilinaTgtId]));

  section('TARGET: Users in Thilina tenant');
  const [tgtIuCount]  = await q(tgt,
    `SELECT COUNT(*) AS n FROM institute_user WHERE institute_id = ?`, [thilinaTgtId]);
  const [tgtIcsCount] = await q(tgt,
    `SELECT COUNT(*) AS n FROM institute_class_students ics
     JOIN institute_classes c ON c.id = ics.class_id WHERE c.institute_id = ?`, [thilinaTgtId]);
  console.log(JSON.stringify({ institute_user: tgtIuCount?.n ?? 0, class_students: tgtIcsCount?.n ?? 0 }, null, 2));

  // ── 3. MISMATCH REPORT ────────────────────────────────────────────────────
  section('MISMATCH REPORT');

  // Classes by name
  const srcClassNames = new Set(srcClasses.map(r => r.name.trim()));
  const tgtClassNames = new Set(tgtClasses.map(r => r.name.trim()));
  const classesOnlyInSrc = [...srcClassNames].filter(n => !tgtClassNames.has(n));
  const classesOnlyInTgt = [...tgtClassNames].filter(n => !srcClassNames.has(n));

  console.log('\n[Classes only in SOURCE (need to migrate):');
  if (classesOnlyInSrc.length) classesOnlyInSrc.forEach(n => console.log('  MISSING:', n));
  else console.log('  (none — all source classes exist in target)');

  console.log('\nClasses only in TARGET (extra / orphaned):');
  if (classesOnlyInTgt.length) classesOnlyInTgt.forEach(n => console.log('  EXTRA:', n));
  else console.log('  (none)');

  // Subjects by code
  const srcSubjectCodes = new Set(srcSubjects.map(r => r.code?.trim()));
  const tgtSubjectCodes = new Set(tgtSubjects.map(r => r.code?.trim()));
  const subjectsOnlyInSrc = [...srcSubjectCodes].filter(c => c && !tgtSubjectCodes.has(c));
  const subjectsOnlyInTgt = [...tgtSubjectCodes].filter(c => c && !srcSubjectCodes.has(c));

  console.log('\nSubjects only in SOURCE (need to migrate):');
  if (subjectsOnlyInSrc.length) subjectsOnlyInSrc.forEach(c => {
    const row = srcSubjects.find(r => r.code?.trim() === c);
    console.log(`  MISSING: ${c} — ${row?.name}`);
  });
  else console.log('  (none)');

  console.log('\nSubjects only in TARGET (extra / orphaned):');
  if (subjectsOnlyInTgt.length) subjectsOnlyInTgt.forEach(c => {
    const row = tgtSubjects.find(r => r.code?.trim() === c);
    console.log(`  EXTRA: ${c} — ${row?.name}`);
  });
  else console.log('  (none)');

  // Counts
  console.log('\nCOUNT SUMMARY:');
  console.log(JSON.stringify({
    classes:    { source: srcClasses.length,   target: tgtClasses.length,   diff: srcClasses.length - tgtClasses.length },
    subjects:   { source: srcSubjects.length,  target: tgtSubjects.length,  diff: srcSubjects.length - tgtSubjects.length },
    recordings: { source: srcRecCount.n,        target: tgtRecCount?.n ?? 0, diff: srcRecCount.n - (tgtRecCount?.n ?? 0) },
    lectures:   { source: srcLecCount.n,        target: tgtLecCount?.n ?? 0, diff: srcLecCount.n - (tgtLecCount?.n ?? 0) },
    users:      { source: srcUserCount.n,       target: tgtIuCount?.n ?? 0 },
  }, null, 2));

  await tgt.end();
  console.log('\n[done] paste this entire output back in the chat (no passwords included).');
})().catch(e => { console.error(e); process.exit(1); });
