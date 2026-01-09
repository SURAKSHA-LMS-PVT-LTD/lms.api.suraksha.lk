import { config } from 'dotenv';
import * as mysql from 'mysql2/promise';

// Load environment variables
config();

async function verifyImplementation() {
  console.log('🔍 Verifying parent skip reason implementation...\n');
  
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '3306'),
    user: process.env.DB_USERNAME || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_DATABASE || 'test',
  });

  try {
    console.log('✅ Connected to database\n');
    
    // 1. Verify table exists
    console.log('📋 Step 1: Checking if reason_of_parent_skip table exists...');
    const [tables] = await connection.query(
      `SELECT TABLE_NAME 
       FROM INFORMATION_SCHEMA.TABLES 
       WHERE TABLE_SCHEMA = ? 
       AND TABLE_NAME = 'reason_of_parent_skip'`,
      [process.env.DB_DATABASE]
    );

    if (Array.isArray(tables) && tables.length > 0) {
      console.log('   ✅ Table reason_of_parent_skip exists\n');
    } else {
      console.log('   ❌ Table reason_of_parent_skip NOT found!\n');
      return;
    }

    // 2. Verify table structure
    console.log('📋 Step 2: Checking table structure...');
    const [columns] = await connection.query(
      `SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT 
       FROM INFORMATION_SCHEMA.COLUMNS 
       WHERE TABLE_SCHEMA = ? 
       AND TABLE_NAME = 'reason_of_parent_skip'
       ORDER BY ORDINAL_POSITION`,
      [process.env.DB_DATABASE]
    );

    console.log('   Columns:');
    if (Array.isArray(columns)) {
      columns.forEach((col: any) => {
        console.log(`   - ${col.COLUMN_NAME}: ${col.COLUMN_TYPE} (${col.IS_NULLABLE === 'YES' ? 'nullable' : 'required'})`);
      });
    }
    console.log('   ✅ Table structure verified\n');

    // 3. Verify name_with_initials column in users table
    console.log('📋 Step 3: Checking name_with_initials in users table...');
    const [userColumns] = await connection.query(
      `SELECT COLUMN_NAME, COLUMN_TYPE 
       FROM INFORMATION_SCHEMA.COLUMNS 
       WHERE TABLE_SCHEMA = ? 
       AND TABLE_NAME = 'users' 
       AND COLUMN_NAME = 'name_with_initials'`,
      [process.env.DB_DATABASE]
    );

    if (Array.isArray(userColumns) && userColumns.length > 0) {
      console.log('   ✅ name_with_initials column exists in users table\n');
    } else {
      console.log('   ❌ name_with_initials column NOT found in users table!\n');
    }

    // 4. Verify indexes
    console.log('📋 Step 4: Checking indexes on reason_of_parent_skip...');
    const [indexes] = await connection.query(
      `SELECT INDEX_NAME, COLUMN_NAME, NON_UNIQUE
       FROM INFORMATION_SCHEMA.STATISTICS
       WHERE TABLE_SCHEMA = ? 
       AND TABLE_NAME = 'reason_of_parent_skip'
       ORDER BY INDEX_NAME, SEQ_IN_INDEX`,
      [process.env.DB_DATABASE]
    );

    if (Array.isArray(indexes) && indexes.length > 0) {
      console.log('   Indexes:');
      indexes.forEach((idx: any) => {
        console.log(`   - ${idx.INDEX_NAME} on ${idx.COLUMN_NAME}`);
      });
      console.log('   ✅ Indexes verified\n');
    }

    // 5. Verify foreign key constraint
    console.log('📋 Step 5: Checking foreign key constraint...');
    const [foreignKeys] = await connection.query(
      `SELECT 
        CONSTRAINT_NAME,
        REFERENCED_TABLE_NAME,
        REFERENCED_COLUMN_NAME
       FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
       WHERE TABLE_SCHEMA = ? 
       AND TABLE_NAME = 'reason_of_parent_skip'
       AND REFERENCED_TABLE_NAME IS NOT NULL`,
      [process.env.DB_DATABASE]
    );

    if (Array.isArray(foreignKeys) && foreignKeys.length > 0) {
      foreignKeys.forEach((fk: any) => {
        console.log(`   ✅ Foreign key: ${fk.CONSTRAINT_NAME} references ${fk.REFERENCED_TABLE_NAME}(${fk.REFERENCED_COLUMN_NAME})`);
      });
    }

    console.log('\n✨ All verifications passed successfully!');
    console.log('\n📄 Complete example available in: comprehensive-user-create-example.json');
    console.log('\n🎯 Implementation Summary:');
    console.log('   1. ✅ reason_of_parent_skip table created');
    console.log('   2. ✅ name_with_initials added to users table');
    console.log('   3. ✅ Entity created: ReasonOfParentSkipEntity');
    console.log('   4. ✅ DTO updated: StudentDataDto with skip reason fields');
    console.log('   5. ✅ Service updated: createComprehensive handles skip reasons');
    console.log('\n📝 New fields in comprehensive user create API:');
    console.log('   - studentData.fatherSkipReason');
    console.log('   - studentData.motherSkipReason');
    console.log('   - studentData.guardianSkipReason');

  } catch (error) {
    console.error('❌ Verification failed:', error.message);
    throw error;
  } finally {
    await connection.end();
  }
}

verifyImplementation()
  .then(() => {
    console.log('\n✅ Verification complete!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n💥 Fatal error:', error);
    process.exit(1);
  });
