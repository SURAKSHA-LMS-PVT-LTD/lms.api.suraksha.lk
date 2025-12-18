/**
 * Convert timestamp columns to datetime
 */

require('dotenv').config();
const mysql = require('mysql2/promise');

async function convertTimestamps() {
  let connection;
  
  try {
    connection = await mysql.createConnection({
      host: process.env.DB_HOST,
      user: process.env.DB_USERNAME || process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_DATABASE,
      port: parseInt(process.env.DB_PORT) || 3306,
      ssl: process.env.NODE_ENV === 'production' ? {
        rejectUnauthorized: false
      } : undefined
    });

    console.log('✅ Connected to database');
    console.log('');

    // Convert columns
    console.log('🔄 Converting timestamp columns to datetime...');
    
    await connection.query(`
      ALTER TABLE institute_lectures 
        MODIFY COLUMN start_time DATETIME NOT NULL,
        MODIFY COLUMN end_time DATETIME NOT NULL,
        MODIFY COLUMN created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        MODIFY COLUMN updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    `);
    
    console.log('✅ Columns converted successfully');
    console.log('');

    // Verify
    const [lectures] = await connection.query(`
      SELECT id, title, start_time, end_time, created_at, updated_at 
      FROM institute_lectures 
      WHERE id = 4
    `);
    
    console.log('📋 Verified data:');
    console.log(JSON.stringify(lectures[0], null, 2));
    console.log('');
    console.log('✅ Migration complete! Restart your NestJS application.');

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

convertTimestamps();
