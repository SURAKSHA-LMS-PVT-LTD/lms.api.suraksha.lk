const mysql = require('mysql2/promise');
require('dotenv').config();

async function runMigration() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT || 3306,
    user: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE
  });

  try {
    console.log('✅ Connected to database');
    
    // Check if columns already exist
    const [columns] = await connection.query(
      `SHOW COLUMNS FROM \`advertisements\` WHERE Field IN ('created_at', 'updated_at')`
    );
    
    if (columns.length > 0) {
      console.log('⚠️  Columns already exist, skipping migration');
      return;
    }
    
    // Add created_at column
    await connection.query(
      `ALTER TABLE \`advertisements\` 
       ADD COLUMN \`created_at\` TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)`
    );
    console.log('✅ Added created_at column');
    
    // Add updated_at column
    await connection.query(
      `ALTER TABLE \`advertisements\` 
       ADD COLUMN \`updated_at\` TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6)`
    );
    console.log('✅ Added updated_at column');
    
    // Verify
    const [result] = await connection.query(
      `SHOW COLUMNS FROM \`advertisements\` WHERE Field IN ('created_at', 'updated_at')`
    );
    console.log('✅ Migration completed successfully');
    console.log('Columns added:', result.map(r => r.Field));
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    throw error;
  } finally {
    await connection.end();
  }
}

runMigration()
  .then(() => process.exit(0))
  .catch(() => process.exit(1));
