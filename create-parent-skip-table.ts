import { config } from 'dotenv';
import * as mysql from 'mysql2/promise';

// Load environment variables
config();

async function runMigration() {
  console.log('🚀 Starting migration to create reason_of_parent_skip table...');
  
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '3306'),
    user: process.env.DB_USERNAME || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_DATABASE || 'test',
  });

  try {
    console.log('✅ Connected to database');
    
    // Check if table already exists
    const [tables] = await connection.query(
      `SELECT TABLE_NAME 
       FROM INFORMATION_SCHEMA.TABLES 
       WHERE TABLE_SCHEMA = ? 
       AND TABLE_NAME = 'reason_of_parent_skip'`,
      [process.env.DB_DATABASE]
    );

    if (Array.isArray(tables) && tables.length > 0) {
      console.log('⚠️  Table reason_of_parent_skip already exists, skipping migration');
      await connection.end();
      return;
    }

    // Create the table
    console.log('📝 Creating reason_of_parent_skip table...');
    await connection.query(`
      CREATE TABLE reason_of_parent_skip (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        user_id BIGINT NOT NULL,
        parent_type ENUM('father', 'mother', 'guardian') NOT NULL,
        reason TEXT NOT NULL,
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_user_id (user_id),
        INDEX idx_parent_type (parent_type),
        INDEX idx_is_active (is_active),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    console.log('✅ Successfully created reason_of_parent_skip table');
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
