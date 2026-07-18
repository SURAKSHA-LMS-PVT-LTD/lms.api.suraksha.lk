require('dotenv').config();
const { DataSource } = require('typeorm');
const ds = new DataSource({
  type: 'mysql',
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '3306'),
  username: process.env.DB_USERNAME || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_DATABASE || 'suraksha_lms'
});
ds.initialize().then(() => {
  return ds.query('SELECT * FROM institute_user_types WHERE slug = "student" OR slug = "STUDENT"');
}).then(res => {
  console.log(res);
  process.exit(0);
}).catch(console.error);
