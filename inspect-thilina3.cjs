'use strict';
require('dotenv').config();
const mysql = require('mysql2/promise');

const SRC_BASE = { host:'34.42.163.47', port:3306, user:'root', password:'Skaveesha1355660@', ssl:{rejectUnauthorized:false}, connectTimeout:15000 };
const TGT = { host:process.env.DB_HOST, port:+(process.env.DB_PORT||3306), user:process.env.DB_USERNAME, password:process.env.DB_PASSWORD, database:process.env.DB_DATABASE, connectTimeout:15000 };

async function q(c,sql,p){ try{const[r]=await c.query(sql,p||[]);return r;}catch(e){return[{ERROR:e.message}];} }

(async()=>{
  // connect without DB to list all databases
  let src;
  try { src = await mysql.createConnection(SRC_BASE); }
  catch(e){ try{ src=await mysql.createConnection({...SRC_BASE,ssl:undefined}); }catch(e2){console.error('SRC FAIL:',e2.message);process.exit(1);} }

  console.log('\n=== ALL DATABASES ON SOURCE ===');
  const dbs = await q(src,'SHOW DATABASES');
  console.log(dbs.map(r=>Object.values(r)[0]).join('\n'));

  // check each DB for a users table
  console.log('\n=== SCANNING FOR users TABLE ===');
  for(const row of dbs){
    const db = Object.values(row)[0];
    if(['information_schema','performance_schema','mysql','sys'].includes(db)) continue;
    const tables = await q(src,`SHOW TABLES FROM \`${db}\``);
    const names = tables.map(r=>Object.values(r)[0]);
    if(names.includes('users')){
      console.log(`DB: ${db} → has users table`);
      const [cnt] = await q(src,`SELECT COUNT(*) AS n FROM \`${db}\`.users`);
      console.log(`  users count: ${cnt.n}`);
      const cols = await q(src,`SHOW COLUMNS FROM \`${db}\`.users`);
      console.log(`  columns: ${cols.map(c=>c.Field).join(', ')}`);
      // sample
      const sample = await q(src,`SELECT * FROM \`${db}\`.users LIMIT 5`);
      console.log('  sample:', JSON.stringify(sample,null,2));
    }
    if(names.includes('User')){
      console.log(`DB: ${db} → has User table (Prisma-style)`);
      const [cnt] = await q(src,`SELECT COUNT(*) AS n FROM \`${db}\`.\`User\``);
      console.log(`  User count: ${cnt.n}`);
      const cols = await q(src,`SHOW COLUMNS FROM \`${db}\`.\`User\``);
      console.log(`  columns: ${cols.map(c=>c.Field).join(', ')}`);
      const sample = await q(src,`SELECT * FROM \`${db}\`.\`User\` LIMIT 5`);
      console.log('  sample:', JSON.stringify(sample,null,2));
    }
  }

  // Also list tables in thilinadhananjaya_lms
  console.log('\n=== TABLES IN thilinadhananjaya_lms ===');
  const thiTables = await q(src,'SHOW TABLES FROM `thilinadhananjaya_lms`');
  console.log(thiTables.map(r=>Object.values(r)[0]).join('\n'));

  // Check for Student/Parent/Teacher tables in Thilina DB
  console.log('\n=== Student/Teacher/Parent tables in thilinadhananjaya_lms ===');
  for(const tbl of ['Student','Teacher','Parent','Admin','ClassStudent','MonthStudent','User','EnrolledStudent']){
    const r = await q(src,`SELECT COUNT(*) AS n FROM \`thilinadhananjaya_lms\`.\`${tbl}\``);
    if(!r[0].ERROR) console.log(`  ${tbl}: ${r[0].n} rows`);
  }

  await src.end();
  console.log('\n[done]');
})().catch(e=>{console.error(e);process.exit(1);});
