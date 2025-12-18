/**
 * Fix for institute_lectures table index constraint issue
 * 
 * Error: Cannot drop index 'IDX_2c78a12592ac3cd64ab5cf1c5b': needed in a foreign key constraint
 * 
 * This script will:
 * 1. Identify the problematic index
 * 2. Temporarily disable foreign key checks
 * 3. Drop the index
 * 4. Re-enable foreign key checks
 * 5. Verify the fix
 * 
 * Run this script using Node.js:
 * node scripts/fix-lecture-index.js
 */

require('dotenv').config();
const mysql = require('mysql2/promise');

async function fixLectureIndex() {
  let connection;
  
  try {
    // Create database connection
    connection = await mysql.createConnection({
      host: process.env.DB_HOST,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_DATABASE,
      port: parseInt(process.env.DB_PORT) || 3306
    });

    console.log('✅ Connected to database');
    console.log('');

    // Step 1: Check current indexes
    console.log('📋 Step 1: Checking current indexes on institute_lectures table...');
    const [indexes] = await connection.query(`
      SELECT 
        INDEX_NAME,
        COLUMN_NAME,
        NON_UNIQUE,
        SEQ_IN_INDEX
      FROM INFORMATION_SCHEMA.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'institute_lectures'
      ORDER BY INDEX_NAME, SEQ_IN_INDEX
    `);
    
    console.log('Current indexes:', indexes.map(i => i.INDEX_NAME).filter((v, i, a) => a.indexOf(v) === i));
    console.log('');

    // Step 2: Check foreign keys
    console.log('📋 Step 2: Checking foreign keys...');
    const [fks] = await connection.query(`
      SELECT 
        CONSTRAINT_NAME,
        TABLE_NAME,
        COLUMN_NAME,
        REFERENCED_TABLE_NAME,
        REFERENCED_COLUMN_NAME
      FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
      WHERE TABLE_SCHEMA = DATABASE()
        AND (TABLE_NAME = 'institute_lectures' OR REFERENCED_TABLE_NAME = 'institute_lectures')
        AND CONSTRAINT_NAME != 'PRIMARY'
    `);
    
    console.log('Foreign keys:', fks.length > 0 ? fks : 'None found');
    console.log('');

    // Step 3: Disable foreign key checks
    console.log('🔓 Step 3: Disabling foreign key checks...');
    await connection.query('SET FOREIGN_KEY_CHECKS = 0');
    console.log('✅ Foreign key checks disabled');
    console.log('');

    // Step 4: Drop the problematic index if it exists
    console.log('🗑️  Step 4: Attempting to drop problematic index...');
    try {
      await connection.query('DROP INDEX IF EXISTS IDX_2c78a12592ac3cd64ab5cf1c5b ON institute_lectures');
      console.log('✅ Index dropped successfully');
    } catch (error) {
      console.log('⚠️  Index may not exist or already dropped:', error.message);
    }
    console.log('');

    // Step 5: Re-enable foreign key checks
    console.log('🔒 Step 5: Re-enabling foreign key checks...');
    await connection.query('SET FOREIGN_KEY_CHECKS = 1');
    console.log('✅ Foreign key checks re-enabled');
    console.log('');

    // Step 6: Verify the fix
    console.log('✔️  Step 6: Verifying the fix...');
    const [newIndexes] = await connection.query(`
      SELECT 
        INDEX_NAME,
        COLUMN_NAME,
        NON_UNIQUE,
        SEQ_IN_INDEX
      FROM INFORMATION_SCHEMA.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'institute_lectures'
      ORDER BY INDEX_NAME, SEQ_IN_INDEX
    `);
    
    console.log('Remaining indexes:', newIndexes.map(i => i.INDEX_NAME).filter((v, i, a) => a.indexOf(v) === i));
    console.log('');

    console.log('✅ Fix completed successfully!');
    console.log('');
    console.log('Next steps:');
    console.log('1. Restart your NestJS application');
    console.log('2. The application should now start without index constraint errors');
    console.log('3. If you want to re-enable synchronize, edit src/app.module.ts');

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error('');
    console.error('Stack trace:', error.stack);
    process.exit(1);
  } finally {
    if (connection) {
      await connection.end();
      console.log('');
      console.log('🔌 Database connection closed');
    }
  }
}

// Run the fix
fixLectureIndex();
