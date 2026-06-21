'use strict';
require('dotenv').config();
const mysql = require('mysql2/promise');

const SRC = {
  host: '34.42.163.47', port: 3306, user: 'root',
  password: 'Skaveesha1355660@', database: 'thilinadhananjaya_lms',
  ssl: { rejectUnauthorized: false }, connectTimeout: 15000,
};
const TGT = {
  host: process.env.DB_HOST, port: +(process.env.DB_PORT || 3306),
  user: process.env.DB_USERNAME, password: process.env.DB_PASSWORD,
  database: process.env.DB_DATABASE, connectTimeout: 15000,
};

function s(t) { console.log(`\n${'═'.repeat(60)}\n  ${t}\n${'═'.repeat(60)}`); }
async function q(c, sql, p) { try { const [r] = await c.query(sql, p||[]); return r; } catch(e) { return [{ERROR:e.message}]; } }
async function sh(l, r) { console.log(`\n── ${l} ──`); console.log(!r.length ? '  (no rows)' : JSON.stringify(r, null, 2)); }

(async () => {
  let src, tgt;
  try { src = await mysql.createConnection(SRC); console.log('[ok] src'); }
  catch(e) { try { src = await mysql.createConnection({...SRC,ssl:undefined}); console.log('[ok] src no-ssl'); } catch(e2) { console.error('SRC FAIL:',e2.message); process.exit(1); } }
  try { tgt = await mysql.createConnection(TGT); console.log('[ok] tgt'); }
  catch(e) { console.error('TGT FAIL:',e.message); process.exit(1); }

  // ── SOURCE: users ─────────────────────────────────────────────────────────
  s('SOURCE: All users');
  await sh('users (all)', await q(src, 'SELECT id, name, email, phone, type, status, created_at FROM users ORDER BY id'));

  s('SOURCE: institute_user (who is in Thilina institute)');
  await sh('institute_user', await q(src, `SELECT iu.id, iu.user_id, iu.institute_id, iu.institute_user_type, u.email, u.name, u.phone, u.type FROM institute_user iu JOIN users u ON u.id=iu.user_id ORDER BY iu.institute_user_type, u.name`));

  s('SOURCE: students table');
  await sh('students', await q(src, `SELECT s.id, s.user_id, u.name, u.email, u.phone FROM students s JOIN users u ON u.id=s.user_id ORDER BY u.name`));

  s('SOURCE: institute_class_students (class enrollments)');
  await sh('class_students', await q(src, `SELECT ics.id, ics.class_id, ics.student_id, s.user_id, u.name, u.email, u.phone, c.name AS class_name FROM institute_class_students ics JOIN students s ON s.id=ics.student_id JOIN users u ON u.id=s.user_id JOIN institute_classes c ON c.id=ics.class_id ORDER BY c.name, u.name`));

  s('SOURCE: institute_class_subject_students (subject enrollments)');
  const subjectStudents = await q(src, `SELECT icss.id, icss.class_id, icss.subject_id, icss.student_id, s.user_id, u.name, u.email, u.phone, c.name AS class_name, sub.name AS subject_name FROM institute_class_subject_students icss JOIN students s ON s.id=icss.student_id JOIN users u ON u.id=s.user_id JOIN institute_classes c ON c.id=icss.class_id JOIN subjects sub ON sub.id=icss.subject_id ORDER BY c.name, sub.name, u.name`);
  await sh('subject_students', subjectStudents);

  s('SOURCE: Recordings with recording_url');
  await sh('recordings with URL', await q(src, `SELECT id, class_id, subject_id, title, platform, recording_url, rec_url_id, status FROM subject_recordings ORDER BY id`));

  s('SOURCE: Lectures with recording_url');
  await sh('lectures with recording_url', await q(src, `SELECT id, class_id, subject_id, title, recording_url, rec_url_id, live_url_id, status FROM institute_class_subject_lectures ORDER BY id`));

  s('SOURCE: users extra_data / institute_user extra columns');
  const extraCols = await q(src, 'SHOW COLUMNS FROM institute_user');
  await sh('institute_user columns', extraCols);

  const userCols = await q(src, 'SHOW COLUMNS FROM users');
  await sh('users columns', userCols);

  await src.end();

  // ── TARGET: current state ─────────────────────────────────────────────────
  const [thiInst] = await q(tgt, `SELECT id, name FROM institutes WHERE name LIKE '%hilina%' OR code LIKE '%THI%' OR email LIKE '%thilina%' LIMIT 1`);
  const thiId = thiInst?.id;
  console.log('\nThilina target institute_id:', thiId);

  s('TARGET: institute_user for Thilina');
  await sh('institute_user', await q(tgt, `SELECT iu.id, iu.user_id, iu.institute_user_type, u.email, u.name FROM institute_user iu JOIN users u ON u.id=iu.id WHERE iu.institute_id=?`, [thiId]));

  s('TARGET: class_students for Thilina');
  await sh('class_students', await q(tgt, `SELECT ics.id, ics.class_id, c.name AS class_name, ics.user_id, u.name, u.email FROM institute_class_students ics JOIN institute_classes c ON c.id=ics.class_id JOIN users u ON u.id=ics.user_id WHERE c.institute_id=? ORDER BY c.name, u.name`, [thiId]));

  s('TARGET: subject_students for Thilina');
  await sh('subject_students', await q(tgt, `SELECT icss.id, icss.class_id, icss.subject_id, icss.user_id, u.name, u.email, c.name AS class_name, s.name AS subject_name FROM institute_class_subject_students icss JOIN users u ON u.id=icss.user_id JOIN institute_classes c ON c.id=icss.class_id JOIN subjects s ON s.id=icss.subject_id WHERE c.institute_id=? ORDER BY c.name, s.name, u.name`, [thiId]));

  s('TARGET: recordings — check recording_url field');
  await sh('recordings', await q(tgt, `SELECT id, title, platform, rec_url_id, recording_url, status FROM subject_recordings WHERE institute_id=? ORDER BY id`, [thiId]));

  s('TARGET: lectures — check recording_url field');
  await sh('lectures', await q(tgt, `SELECT id, title, rec_url_id, live_url_id, recording_url, status FROM institute_class_subject_lectures WHERE institute_id=? ORDER BY id`, [thiId]));

  s('TARGET: institute_class_students columns');
  await sh('columns', await q(tgt, 'SHOW COLUMNS FROM institute_class_students'));

  s('TARGET: users columns (extra_data?)');
  await sh('users columns', await q(tgt, 'SHOW COLUMNS FROM users'));

  s('TARGET: institute_user columns');
  await sh('institute_user columns', await q(tgt, 'SHOW COLUMNS FROM institute_user'));

  await tgt.end();
  console.log('\n[done]');
})().catch(e => { console.error(e); process.exit(1); });
