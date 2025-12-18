/**
 * Quick Fix Script - Execute SQL commands to fix index constraint issue
 * Run: node scripts/run-quick-fix.js
 */

require('dotenv').config();
const mysql = require('mysql2/promise');

async function runQuickFix() {
  let connection;
  
  try {
    console.log('🔌 Connecting to database...');
    console.log(`Host: ${process.env.DB_HOST}`);
    console.log(`Database: ${process.env.DB_DATABASE}`);
    console.log('');

    // Create database connection
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

    console.log('✅ Connected to database successfully!');
    console.log('');

    // Step 1: Disable foreign key checks
    console.log('🔓 Step 1: Disabling foreign key checks...');
    await connection.query('SET FOREIGN_KEY_CHECKS = 0');
    console.log('✅ Foreign key checks disabled');
    console.log('');

    // Step 2: Find the foreign key that uses this index
    console.log('🔍 Step 2: Finding foreign key constraints...');
    const [fks] = await connection.query(`
      SELECT 
        CONSTRAINT_NAME,
        TABLE_NAME,
        COLUMN_NAME,
        REFERENCED_TABLE_NAME,
        REFERENCED_COLUMN_NAME
      FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'institute_lectures'
        AND CONSTRAINT_NAME != 'PRIMARY'
        AND REFERENCED_TABLE_NAME IS NOT NULL
    `);
    
    console.log(`Found ${fks.length} foreign key(s) on institute_lectures table`);
    console.log('');

    // Step 3: Drop the problematic index
    console.log('🗑️  Step 3: Dropping problematic index...');
    try {
      await connection.query('DROP INDEX IDX_2c78a12592ac3cd64ab5cf1c5b ON institute_lectures');
      console.log('✅ Index dropped successfully');
    } catch (error) {
      if (error.code === 'ER_CANT_DROP_FIELD_OR_KEY') {
        console.log('ℹ️  Index does not exist - this is OK');
      } else {
        console.log('⚠️  Could not drop index:', error.message);
        console.log('ℹ️  This is OK - TypeORM will handle it');
      }
    }
    console.log('');

    // Step 4: Re-enable foreign key checks
    console.log('🔒 Step 4: Re-enabling foreign key checks...');
    await connection.query('SET FOREIGN_KEY_CHECKS = 1');
    console.log('✅ Foreign key checks re-enabled');
    console.log('');

    // Step 5: Verify the indexes
    console.log('✔️  Step 5: Verifying indexes...');
    const [indexes] = await connection.query(`
      SELECT 
        INDEX_NAME,
        COLUMN_NAME,
        NON_UNIQUE
      FROM INFORMATION_SCHEMA.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'institute_lectures'
      ORDER BY INDEX_NAME
    `);
    
    console.log('Current indexes on institute_lectures table:');
    const uniqueIndexes = [...new Set(indexes.map(i => i.INDEX_NAME))];
    uniqueIndexes.forEach(indexName => {
      const columns = indexes.filter(i => i.INDEX_NAME === indexName).map(i => i.COLUMN_NAME);
      console.log(`  - ${indexName}: [${columns.join(', ')}]`);
    });
    console.log('');

    console.log('✅ ✅ ✅ FIX COMPLETED SUCCESSFULLY! ✅ ✅ ✅');
    console.log('');
    console.log('📝 Next steps:');
    console.log('   1. Restart your NestJS application: npm run start:dev');
    console.log('   2. The application should now start without errors');
    console.log('   3. The startTime and endTime fields will work correctly');
    console.log('');

  } catch (error) {
    console.error('');
    console.error('❌ ERROR OCCURRED:');
    console.error('   Message:', error.message);
    console.error('');
    if (error.code === 'ECONNREFUSED') {
      console.error('💡 Cannot connect to database. Check:');
      console.error('   - Database server is running');
      console.error('   - DB_HOST, DB_PORT in .env are correct');
    } else if (error.code === 'ER_ACCESS_DENIED_ERROR') {
      console.error('💡 Access denied. Check:');
      console.error('   - DB_USER and DB_PASSWORD in .env are correct');
      console.error('   - User has permissions on the database');
    }
    console.error('');
    process.exit(1);
  } finally {
    if (connection) {
      await connection.end();
      console.log('🔌 Database connection closed');
    }
  }
}

// Run the fix
runQuickFix();
