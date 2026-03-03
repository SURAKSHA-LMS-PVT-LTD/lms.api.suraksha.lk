/**
 * Run migration: connect to remote MySQL and execute system_config expansion SQL
 */
const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');

async function run() {
  // Connect to remote MySQL (production)
  const conn = await mysql.createConnection({
    host: '136.114.215.145',
    port: 3306,
    user: 'root',
    password: 'Skaveesha1355660@',
    database: 'suraksha-lms-db',
    multipleStatements: true,
    connectTimeout: 30000,
  });

  console.log('Connected to remote MySQL (suraksha-lms-db)');

  // 1. Run the original migration first (create system_config + attendance_records tables)
  const originalMigration = fs.readFileSync(
    path.join(__dirname, 'migrations', '20250708_system_config_attendance_records.sql'),
    'utf8',
  );
  try {
    await conn.query(originalMigration);
    console.log('✅ Original migration executed (system_config + attendance_records tables)');
  } catch (e) {
    console.log('⚠️ Original migration:', e.message);
  }

  // 2. Run the expansion migration (seed all config groups)
  const expansionMigration = fs.readFileSync(
    path.join(__dirname, 'migrations', '20260303_system_config_expand_all_groups.sql'),
    'utf8',
  );
  try {
    await conn.query(expansionMigration);
    console.log('✅ Expansion migration executed (all config groups seeded)');
  } catch (e) {
    console.log('❌ Expansion migration error:', e.message);
  }

  // 3. Verify
  const [rows] = await conn.query('SELECT config_group, COUNT(*) as cnt FROM system_config GROUP BY config_group ORDER BY config_group');
  console.log('\n📊 System Config Summary:');
  let total = 0;
  for (const row of rows) {
    console.log(`   ${row.config_group}: ${row.cnt} entries`);
    total += parseInt(row.cnt);
  }
  console.log(`   ─────────────────`);
  console.log(`   TOTAL: ${total} entries`);

  await conn.end();
}

run().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
