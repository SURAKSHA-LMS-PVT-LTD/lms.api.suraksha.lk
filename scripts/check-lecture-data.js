/**
 * Check lecture data in database
 */

require('dotenv').config();
const mysql = require('mysql2/promise');

async function checkLectureData() {
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

    // Check lecture with id 4
    const [lectures] = await connection.query(`
      SELECT 
        id,
        title,
        start_time,
        end_time,
        created_at,
        updated_at,
        status
      FROM institute_lectures
      WHERE id = 4
    `);
    
    if (lectures.length > 0) {
      console.log('📋 Lecture data from database:');
      console.log(JSON.stringify(lectures[0], null, 2));
    } else {
      console.log('❌ No lecture found with id 4');
    }
    console.log('');

    // Check all lectures
    const [allLectures] = await connection.query(`
      SELECT 
        id,
        title,
        start_time,
        end_time
      FROM institute_lectures
      LIMIT 5
    `);
    
    console.log('📋 All lectures (first 5):');
    allLectures.forEach(lecture => {
      console.log(`ID ${lecture.id}: start_time=${lecture.start_time}, end_time=${lecture.end_time}`);
    });

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

checkLectureData();
