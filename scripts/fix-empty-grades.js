const mysql = require('mysql2/promise');
require('dotenv').config();

async function fixEmptyGrades() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USERNAME || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_DATABASE || 'laas',
    port: process.env.DB_PORT || 3306
  });

  try {
    console.log('🔄 Fixing empty grades...');
    
    // Step 1: Set grade 'S' for Ordinary Pass (scores typically 45-54)
    console.log('Step 1: Setting grade S for Ordinary Pass...');
    const [result1] = await connection.execute(
      "UPDATE institute_class_subject_results SET grade = 'S' WHERE (grade IS NULL OR grade = '') AND remarks LIKE '%Ordinary Pass%'"
    );
    console.log(`✅ Updated ${result1.affectedRows} records to grade S`);
    
    // Step 2: Set grade 'C' for Credit Pass (scores typically 55-64)
    console.log('Step 2: Setting grade C for Credit Pass...');
    const [result2] = await connection.execute(
      "UPDATE institute_class_subject_results SET grade = 'C' WHERE (grade IS NULL OR grade = '') AND remarks LIKE '%Credit Pass%'"
    );
    console.log(`✅ Updated ${result2.affectedRows} records to grade C`);
    
    // Step 3: Set grade based on score ranges for remaining empty grades
    console.log('Step 3: Setting grades based on score ranges...');
    
    // S grade: 45-54
    const [result3] = await connection.execute(
      "UPDATE institute_class_subject_results SET grade = 'S' WHERE (grade IS NULL OR grade = '') AND CAST(score AS DECIMAL) >= 45 AND CAST(score AS DECIMAL) < 55"
    );
    console.log(`✅ Updated ${result3.affectedRows} records to grade S (score-based)`);
    
    // C grade: 55-64
    const [result4] = await connection.execute(
      "UPDATE institute_class_subject_results SET grade = 'C' WHERE (grade IS NULL OR grade = '') AND CAST(score AS DECIMAL) >= 55 AND CAST(score AS DECIMAL) < 65"
    );
    console.log(`✅ Updated ${result4.affectedRows} records to grade C (score-based)`);
    
    // Step 4: Verification
    console.log('Step 4: Verifying final grade distribution...');
    const [results] = await connection.execute(
      "SELECT DISTINCT grade, COUNT(*) as count FROM institute_class_subject_results GROUP BY grade ORDER BY grade"
    );
    console.log('✅ Final grade distribution:');
    console.table(results);
    
    // Show remaining empty grades if any
    const [emptyGrades] = await connection.execute(
      "SELECT id, score, remarks, grade FROM institute_class_subject_results WHERE grade IS NULL OR grade = '' LIMIT 10"
    );
    if (emptyGrades.length > 0) {
      console.log('⚠️ Remaining empty grades:');
      console.table(emptyGrades);
    } else {
      console.log('✅ No empty grades remaining!');
    }
    
    console.log('🎉 Grade fix completed successfully!');
  } catch (error) {
    console.error('❌ Grade fix failed:', error.message);
    throw error;
  } finally {
    await connection.end();
  }
}

// Run the fix
fixEmptyGrades()
  .then(() => {
    console.log('Fix script finished');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Fix script failed:', error);
    process.exit(1);
  });
