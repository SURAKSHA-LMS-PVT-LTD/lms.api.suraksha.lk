'use strict';
/**
 * Flip the 12 migrated Thilina students stuck in PENDING to ACTIVE so they can use
 * forgot-password (which requires status=ACTIVE). Idempotent; only touches PENDING rows.
 * Dry-run by default; pass --apply to write.
 */
require('dotenv').config();
const mysql = require('mysql2/promise');
const APPLY = process.argv.includes('--apply');
const TGT = { host: process.env.DB_HOST, port: +(process.env.DB_PORT||3306), user: process.env.DB_USERNAME, password: process.env.DB_PASSWORD, database: process.env.DB_DATABASE, connectTimeout: 15000 };
const THI = '6e09518a-89ac-47e1-8961-326b5fd5fc9c';
async function q(c, sql, p){ const [r]=await c.query(sql,p||[]); return r; }
(async()=>{
  const c = await mysql.createConnection(TGT);
  const pending = await q(c,
    `SELECT user_id, user_id_institue FROM institute_user
     WHERE institute_id=? AND institute_user_type='STUDENT' AND status='PENDING'`, [THI]);
  console.log(`PENDING Thilina students: ${pending.length}`);
  pending.slice(0,20).forEach(p => console.log(`  user_id ${p.user_id} (index ${p.user_id_institue})`));
  if (APPLY) {
    const res = await q(c,
      `UPDATE institute_user SET status='ACTIVE', updated_at=NOW()
       WHERE institute_id=? AND institute_user_type='STUDENT' AND status='PENDING'`, [THI]);
    console.log(`\nRows updated: ${res.affectedRows}`);
    const [{ left }] = await q(c,
      `SELECT COUNT(*) \`left\` FROM institute_user WHERE institute_id=? AND institute_user_type='STUDENT' AND status='PENDING'`, [THI]);
    console.log(`Remaining PENDING: ${left}`);
  } else {
    console.log('\n(dry-run — re-run with --apply to write)');
  }
  await c.end();
})().catch(e=>{console.error('FATAL',e.message);process.exit(1)});
