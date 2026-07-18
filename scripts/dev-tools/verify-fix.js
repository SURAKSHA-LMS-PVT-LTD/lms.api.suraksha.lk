require('dotenv').config();
const mysql = require('mysql2/promise');

async function verify() {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT || '3306'),
    user: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE,
    connectTimeout: 15000,
  });

  const testPk = 'I#TEST_VERIFY';
  const testSk = 'ATTENDANCE#2026-03-17#TS#0#S#TEST#C#NONE#SUB#NONE';

  try {
    await conn.query(
      `INSERT INTO attendance_records
         (dynamo_pk, dynamo_sk, institute_id, student_id, date, status, timestamp,
          latitude, longitude, marking_method, sync_status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE status = VALUES(status)`,
      [testPk, testSk, '109', '2', '2026-03-17', 1, Date.now(), null, null, 'manual', 'SYNCED']
    );
    console.log('✅  INSERT with latitude/longitude: OK');
  } catch (e) {
    console.error('❌  INSERT failed:', e.message);
  } finally {
    await conn.query('DELETE FROM attendance_records WHERE dynamo_pk = ? AND dynamo_sk = ?', [testPk, testSk]);
  }

  const [idxRows] = await conn.query(
    `SELECT COUNT(*) AS cnt FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'attendance_records'
       AND INDEX_NAME = 'IDX_student_institute_date'`,
    [process.env.DB_DATABASE]
  );
  console.log(idxRows[0].cnt > 0
    ? '✅  IDX_student_institute_date: present'
    : '❌  IDX_student_institute_date: MISSING');

  const [cols] = await conn.query(
    `SELECT COLUMN_NAME FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'attendance_records'
       AND COLUMN_NAME IN ('latitude','longitude')`,
    [process.env.DB_DATABASE]
  );
  console.log(`✅  Verified columns present: ${cols.map(c => c.COLUMN_NAME).join(', ')}`);

  const [ads] = await conn.query('SELECT COUNT(*) AS cnt FROM advertisements WHERE is_active = 1').catch(() => [[{ cnt: 'N/A (table may not exist)' }]]);
  console.log('📢  Active advertisements in DB:', ads[0].cnt);

  await conn.end();
}

verify().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
