const mysql = require('mysql2/promise');
require('dotenv').config();

async function debugParentChildren() {
  const connection = await mysql.createConnection({
    host: process.env.DATABASE_HOST,
    user: process.env.DATABASE_USERNAME,
    password: process.env.DATABASE_PASSWORD,
    database: process.env.DATABASE_NAME,
    port: process.env.DATABASE_PORT || 3306,
  });

  try {
    console.log('=== Checking Parent ID 5 ===\n');
    
    // Check parent
    const [parents] = await connection.query(
      'SELECT * FROM parents WHERE user_id = ?',
      [5]
    );
    console.log('Parent:', parents[0]);
    
    // Check parent user
    const [parentUsers] = await connection.query(
      'SELECT id, first_name, last_name, email, phone_number, image_url FROM users WHERE id = ?',
      [5]
    );
    console.log('\nParent User:', parentUsers[0]);
    
    // Check children as father
    const [children] = await connection.query(
      'SELECT * FROM students WHERE father_id = ? OR mother_id = ? OR guardian_id = ?',
      [5, 5, 5]
    );
    console.log('\nChildren (Students):', children);
    
    // Check children users
    if (children.length > 0) {
      const childUserIds = children.map(c => c.user_id);
      const [childUsers] = await connection.query(
        `SELECT id, first_name, last_name, email, phone_number, image_url FROM users WHERE id IN (${childUserIds.join(',')})`,
      );
      console.log('\nChildren Users:');
      childUsers.forEach(user => {
        console.log({
          id: user.id,
          name: `${user.first_name} ${user.last_name}`,
          email: user.email,
          phone_number: user.phone_number,
          image_url: user.image_url
        });
      });
    }
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await connection.end();
  }
}

debugParentChildren();
