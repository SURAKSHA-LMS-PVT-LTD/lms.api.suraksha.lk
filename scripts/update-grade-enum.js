const mysql = require('mysql2/promise');
require('dotenv').config();

async function updateGradeEnum() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USERNAME || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_DATABASE || 'laas',
    port: process.env.DB_PORT || 3306
  });

  try {
    console.log('🔄 Starting Grade enum migration from D to S...');
    
    // Step 1: Update existing D grades to S
    console.log('Step 1: Updating existing D grades to S...');
    const [updateResult] = await connection.execute(
      "UPDATE institute_class_subject_results SET grade = 'S' WHERE grade = 'D'"
    );
    console.log(`✅ Updated ${updateResult.affectedRows} records from D to S`);
    
    // Step 2: Alter the column enum definition
    console.log('Step 2: Altering column enum definition...');
    await connection.execute(
      "ALTER TABLE institute_class_subject_results MODIFY COLUMN grade ENUM('A+', 'A', 'B+', 'B', 'C+', 'C', 'S', 'F') NULL"
    );
    console.log('✅ Column enum definition updated successfully');
    
    // Step 3: Verification
    console.log('Step 3: Verifying changes...');
    const [results] = await connection.execute(
      "SELECT DISTINCT grade, COUNT(*) as count FROM institute_class_subject_results GROUP BY grade"
    );
    console.log('✅ Current grade distribution:');
    console.table(results);
    
    console.log('🎉 Migration completed successfully!');
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    throw error;
  } finally {
    await connection.end();
  }
}

// Run the migration
updateGradeEnum()
  .then(() => {
    console.log('Migration script finished');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Migration script failed:', error);
    process.exit(1);
  });
