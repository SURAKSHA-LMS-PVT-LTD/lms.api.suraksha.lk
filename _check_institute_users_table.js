require('dotenv').config();
const mysql = require('mysql2/promise');

(async () => {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    user: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE,
    ssl: process.env.DB_SSL_REJECT_UNAUTHORIZED === 'false' ? { rejectUnauthorized: false } : undefined,
  });

  const [tables] = await conn.query(`
    SELECT TABLE_NAME FROM information_schema.TABLES
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME IN ('institute_user', 'institute_users')
  `);
  console.log('Tables matching institute_user(s):', JSON.stringify(tables, null, 2));

  for (const t of tables) {
    const [count] = await conn.query(`SELECT COUNT(*) as c FROM \`${t.TABLE_NAME}\``);
    console.log(`${t.TABLE_NAME} row count:`, count[0].c);
  }

  await conn.end();
})().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
