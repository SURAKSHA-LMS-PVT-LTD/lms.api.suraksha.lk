import { config } from 'dotenv';
import * as mysql from 'mysql2/promise';

// Load environment variables
config();

async function runMigration() {
  console.log('🚀 Starting migration to add name_with_initials column...');
  
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '3306'),
    user: process.env.DB_USERNAME || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_DATABASE || 'test',
  });

  try {
    console.log('✅ Connected to database');
    
    // Check if column already exists
    const [columns] = await connection.query(
      `SELECT COLUMN_NAME 
       FROM INFORMATION_SCHEMA.COLUMNS 
       WHERE TABLE_SCHEMA = ? 
       AND TABLE_NAME = 'users' 
       AND COLUMN_NAME = 'name_with_initials'`,
      [process.env.DB_DATABASE]
    );

    if (Array.isArray(columns) && columns.length > 0) {
      console.log('⚠️  Column name_with_initials already exists, skipping migration');
      await connection.end();
      return;
    }

    // Add the column
    console.log('📝 Adding name_with_initials column to users table...');
    await connection.query(
      `ALTER TABLE users 
       ADD COLUMN name_with_initials VARCHAR(100) NOT NULL DEFAULT ''`
    );

    console.log('✅ Successfully added name_with_initials column to users table');
    console.log('✅ Migration completed successfully!');

  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    throw error;
  } finally {
    await connection.end();
    console.log('🔌 Database connection closed');
  }
}

runMigration()
  .then(() => {
    console.log('✨ All done!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('💥 Fatal error:', error);
    process.exit(1);
  });
