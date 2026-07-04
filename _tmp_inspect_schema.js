require('dotenv').config();
const mysql = require('mysql2/promise');

async function main() {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    user: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE,
    ssl: { rejectUnauthorized: false },
  });

  const db = process.env.DB_DATABASE;

  // 1. Parent tables and their id column type
  const parents = ['institutes', 'institute_classes', 'subjects', 'users', 'students', 'institute_user'];
  console.log('=== PARENT TABLE PK TYPES ===');
  for (const t of parents) {
    const [rows] = await conn.query(
      `SELECT COLUMN_NAME, COLUMN_TYPE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=? AND TABLE_NAME=? AND COLUMN_NAME='id'`,
      [db, t]
    );
    console.log(t, '->', rows);
  }

  // 2. Suspect tables from name-mismatch findings
  const suspects = [
    ['institute_class_subject_results', 'institute_id'],
    ['institute_class_subject_results', 'class_id'],
    ['institute_class_subject_results', 'subject_id'],
    ['institute_class_subject_study_materials', 'institute_id'],
    ['institute_class_subject_study_materials', 'class_id'],
    ['institute_class_subject_study_materials', 'subject_id'],
    ['lecture_live_attendance', 'institute_id'],
    ['lecture_live_attendance', 'class_id'],
    ['lecture_live_attendance', 'subject_id'],
    ['institute_house_member', 'institute_id'],
  ];
  console.log('\n=== SUSPECT TABLES (name-mismatch candidates) ===');
  for (const [t, c] of suspects) {
    const [rows] = await conn.query(
      `SELECT TABLE_NAME, COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=? AND TABLE_NAME=? AND COLUMN_NAME=?`,
      [db, t, c]
    );
    console.log(t, c, '->', JSON.stringify(rows));
  }

  await conn.end();
}
main().catch(e => { console.error(e); process.exit(1); });
