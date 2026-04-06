const mysql = require('mysql2/promise');
require('dotenv').config();

(async () => {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    user: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE,
  });

  // Set subdomain + enable custom login + upgrade tier for institute 102
  await conn.execute(
    `UPDATE institutes SET subdomain = 'royal-science', tier = 'STARTER', custom_login_enabled = 1 WHERE id = 102`
  );

  const [rows] = await conn.execute(
    'SELECT id, name, subdomain, tier, custom_login_enabled, logo_url, primary_color_code FROM institutes WHERE id = 102'
  );
  console.log('Updated institute:');
  console.table(rows);
  await conn.end();
})();
