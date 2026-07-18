'use strict';
require('dotenv').config();
const mysql = require('mysql2/promise');

const SRC = { host:'34.42.163.47', port:3306, user:'root', password:'Skaveesha1355660@', database:'thilinadhananjaya_lms', ssl:{rejectUnauthorized:false}, connectTimeout:15000 };
const TGT = { host:process.env.DB_HOST, port:+(process.env.DB_PORT||3306), user:process.env.DB_USERNAME, password:process.env.DB_PASSWORD, database:process.env.DB_DATABASE, connectTimeout:15000 };

async function q(c,sql,p){ try{const[r]=await c.query(sql,p||[]);return r;}catch(e){return[{ERROR:e.message}];} }
function s(t){ console.log(`\n${'═'.repeat(60)}\n  ${t}\n${'═'.repeat(60)}`); }

(async()=>{
  let src; try{src=await mysql.createConnection(SRC);}catch(e){src=await mysql.createConnection({...SRC,ssl:undefined});}
  console.log('[ok] src');
  const tgt=await mysql.createConnection(TGT);
  console.log('[ok] tgt');

  s('SOURCE: Profile table columns + all rows');
  console.log(JSON.stringify(await q(src,'SHOW COLUMNS FROM Profile'),null,2));
  console.log(JSON.stringify(await q(src,'SELECT * FROM Profile ORDER BY id'),null,2));

  s('SOURCE: Enrollment table columns + all rows');
  console.log(JSON.stringify(await q(src,'SHOW COLUMNS FROM Enrollment'),null,2));
  console.log(JSON.stringify(await q(src,'SELECT * FROM Enrollment ORDER BY id'),null,2));

  s('SOURCE: ALL Users with roles');
  console.log(JSON.stringify(await q(src,'SELECT id, email, role, orgId, createdAt FROM `User` ORDER BY role, email'),null,2));

  s('SOURCE: Institute table');
  console.log(JSON.stringify(await q(src,'SELECT * FROM Institute'),null,2));

  s('SOURCE: ALL Classes');
  console.log(JSON.stringify(await q(src,'SELECT * FROM Class ORDER BY name'),null,2));

  s('SOURCE: Recording (all) — check recording_url / videoUrl');
  console.log(JSON.stringify(await q(src,'SHOW COLUMNS FROM Recording'),null,2));
  console.log(JSON.stringify(await q(src,'SELECT * FROM Recording ORDER BY id'),null,2));

  s('SOURCE: Lecture (all) — check recording_url');
  console.log(JSON.stringify(await q(src,'SHOW COLUMNS FROM Lecture'),null,2));
  console.log(JSON.stringify(await q(src,'SELECT * FROM Lecture ORDER BY id'),null,2));

  // TARGET: what users already exist for Thilina institute
  s('TARGET: Existing institute_user for Thilina');
  const [thiInst] = await q(tgt,`SELECT id, name FROM institutes WHERE name LIKE '%hilina%' OR code LIKE '%THI%' LIMIT 1`);
  const thiId = thiInst?.id;
  console.log('Thilina institute_id:', thiId);

  console.log(JSON.stringify(await q(tgt,
    `SELECT iu.user_id, iu.institute_user_type, iu.status, u.email, u.first_name, u.last_name, u.phone_number
     FROM institute_user iu
     JOIN users u ON u.id=iu.user_id
     WHERE iu.institute_id=?
     ORDER BY iu.institute_user_type, u.email`, [thiId]),null,2));

  s('TARGET: Existing class_students for Thilina');
  console.log(JSON.stringify(await q(tgt,
    `SELECT ics.student_user_id, ics.institute_class_id, ics.is_verified, ics.student_type, u.email, c.name AS class_name
     FROM institute_class_students ics
     JOIN users u ON u.id=ics.student_user_id
     JOIN institute_classes c ON c.id=ics.institute_class_id
     WHERE ics.institute_id=?
     ORDER BY c.name, u.email`, [thiId]),null,2));

  s('TARGET: Classes in Thilina tenant');
  console.log(JSON.stringify(await q(tgt,
    `SELECT id, name, code FROM institute_classes WHERE institute_id=? ORDER BY name`, [thiId]),null,2));

  await src.end(); await tgt.end();
  console.log('\n[done]');
})().catch(e=>{console.error(e);process.exit(1);});
