const mysql = require('mysql2/promise');
async function main() {
  const conn = await mysql.createConnection({
    host: '34.42.98.39',
    user: 'root',
    password: 'skadaskdadiq24924u9@ewkaldmadkawmidknkjjd1243142W',
    database: 'suraksha-lms-db'
  });
  
  const [rows] = await conn.query('SELECT COUNT(*) as c FROM institute_class_students WHERE class_id = "4b0e5e92-94ff-47dd-ba55-a4888b1c5790"');
  console.log('Total in DB for this class:', rows[0].c);
  conn.end();
}
main();
