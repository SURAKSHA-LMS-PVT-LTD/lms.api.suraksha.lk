import { config } from 'dotenv';
import * as mysql from 'mysql2/promise';

// Load environment variables
config();

async function verifyMigration() {
  console.log('🔍 Verifying migration...');
  
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '3306'),
    user: process.env.DB_USERNAME || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_DATABASE || 'test',
  });

  try {
    console.log('✅ Connected to database');
    
    // Check column details
    const [columns] = await connection.query(
      `SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT 
       FROM INFORMATION_SCHEMA.COLUMNS 
       WHERE TABLE_SCHEMA = ? 
       AND TABLE_NAME = 'users' 
       AND COLUMN_NAME = 'name_with_initials'`,
      [process.env.DB_DATABASE]
    );

    if (Array.isArray(columns) && columns.length > 0) {
      console.log('✅ Column name_with_initials exists!');
      console.log('📋 Column details:', columns[0]);
    } else {
      console.log('❌ Column name_with_initials NOT found!');
    }

  } catch (error) {
    console.error('❌ Verification failed:', error.message);
    throw error;
  } finally {
    await connection.end();
  }
}

verifyMigration()
  .then(() => {
    console.log('✨ Verification complete!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('💥 Fatal error:', error);
    process.exit(1);
  });
