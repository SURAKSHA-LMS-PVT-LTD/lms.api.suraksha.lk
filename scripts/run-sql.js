#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const dotenv = require('dotenv');

dotenv.config();

async function run() {
  try {
    const sqlPath = process.argv[2] || path.join(__dirname, 'migrate-class-attendance-sessions.sql');
    if (!fs.existsSync(sqlPath)) {
      console.error('SQL file not found:', sqlPath);
      process.exit(2);
    }

    let sql = fs.readFileSync(sqlPath, 'utf8');

    const host = process.env.DB_HOST || 'localhost';
    const port = parseInt(process.env.DB_PORT || '3306', 10);
    const user = process.env.DB_USERNAME || process.env.DB_USER;
    const password = process.env.DB_PASSWORD || process.env.DB_PASS;
    const database = process.env.DB_DATABASE || process.env.DB_NAME;

    if (!user || !password || !database) {
      console.error('Missing DB credentials. Please set DB_USERNAME/DB_PASSWORD/DB_DATABASE in environment or .env');
      process.exit(3);
    }

    console.log(`Connecting to ${host}:${port} as ${user}, database=${database}`);

    const conn = await mysql.createConnection({
      host,
      port,
      user,
      password,
      database,
      multipleStatements: true,
      // keep default charset/timezone as configured by the server
    });

    console.log('Executing SQL file (CREATE TABLE statements)...');

    // Remove ALTER TABLE attendance_records ... IF NOT EXISTS parts for compatibility
    const alterRegex = /ALTER TABLE\s+attendance_records[\s\S]*?;\s*$/im;
    let alterBlock = null;
    if (alterRegex.test(sql)) {
      alterBlock = sql.match(alterRegex)[0];
      sql = sql.replace(alterRegex, '');
    }

    // Execute the remaining SQL (CREATE TABLEs)
    const [results] = await conn.query(sql);
    console.log('Create statements executed.');

    // Handle ALTER TABLE for attendance_records in a compatible way
    if (alterBlock) {
      console.log('Processing ALTER TABLE attendance_records block separately for compatibility...');

      const [rows] = await conn.query(
        "SELECT COUNT(*) AS cnt FROM information_schema.columns WHERE table_schema = ? AND table_name = 'attendance_records' AND column_name = 'class_session_id'",
        [database]
      );

      const exists = rows && rows[0] && rows[0].cnt > 0;
      if (exists) {
        console.log('Column `class_session_id` already exists on attendance_records — skipping ALTER.');
      } else {
        console.log('Adding `class_session_id` column and index to attendance_records...');
        await conn.query(
          "ALTER TABLE attendance_records ADD COLUMN class_session_id BIGINT UNSIGNED NULL COMMENT 'Links to institute_class_attendance_sessions.id'"
        );
        await conn.query(
          "CREATE INDEX idx_ar_class_session ON attendance_records (class_session_id)"
        );
        console.log('ALTER TABLE completed.');
      }
    }

    await conn.end();
    console.log('Migration completed successfully.');
  } catch (err) {
    console.error('Migration failed:', err && err.message ? err.message : err);
    process.exit(1);
  }
}

run();
