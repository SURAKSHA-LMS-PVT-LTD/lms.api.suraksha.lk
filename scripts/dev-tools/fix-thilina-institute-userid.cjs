'use strict';
/**
 * Backfill institute_user.user_id_institue for migrated Thilina students that are
 * missing it. The authoritative source is Profile.instituteId (the student's institute
 * index/membership number in the Thilina system); falls back to the barcodeId already
 * stored in the target row when the source value is absent.
 *
 * Matching: target extra_data.sourceUserId → source Profile.userId.
 *
 * SRC credentials are read from env (THILINA_SRC_*), never hardcoded.
 * Dry-run by default. Pass --apply to write.
 *
 *   THILINA_SRC_HOST=... THILINA_SRC_PASSWORD=... node fix-thilina-institute-userid.cjs          # dry run
 *   THILINA_SRC_HOST=... THILINA_SRC_PASSWORD=... node fix-thilina-institute-userid.cjs --apply   # write
 */
require('dotenv').config();
const mysql = require('mysql2/promise');

const APPLY = process.argv.includes('--apply');

const SRC = {
  host: process.env.THILINA_SRC_HOST, port: +(process.env.THILINA_SRC_PORT || 3306),
  user: process.env.THILINA_SRC_USER || 'root', password: process.env.THILINA_SRC_PASSWORD,
  database: process.env.THILINA_SRC_DATABASE || 'thilinadhananjaya_lms',
  ssl: { rejectUnauthorized: false }, connectTimeout: 15000,
};
const TGT = {
  host: process.env.DB_HOST, port: +(process.env.DB_PORT || 3306),
  user: process.env.DB_USERNAME, password: process.env.DB_PASSWORD,
  database: process.env.DB_DATABASE, connectTimeout: 15000,
};
const THI_ID = '6e09518a-89ac-47e1-8961-326b5fd5fc9c';
async function q(c, sql, p) { const [r] = await c.query(sql, p || []); return r; }

(async () => {
  if (!SRC.host || !SRC.password) {
    console.error('Set THILINA_SRC_HOST and THILINA_SRC_PASSWORD env vars first.');
    process.exit(1);
  }
  const src = await mysql.createConnection(SRC);
  const tgt = await mysql.createConnection(TGT);
  console.log(`[ok] connected (${APPLY ? 'APPLY' : 'DRY-RUN'})`);

  // Source: sourceUserId(Profile.userId) → instituteId (index number)
  const profiles = await q(src, 'SELECT userId, instituteId, barcodeId FROM Profile');
  const indexBySourceUserId = {};
  for (const p of profiles) {
    indexBySourceUserId[p.userId] = (p.instituteId ?? p.barcodeId) || null;
  }

  // Target: students missing user_id_institue
  const missing = await q(tgt,
    `SELECT user_id, institute_card_id, extra_data
     FROM institute_user
     WHERE institute_id=? AND institute_user_type='STUDENT'
       AND (user_id_institue IS NULL OR user_id_institue='')`, [THI_ID]);

  console.log(`Students missing user_id_institue: ${missing.length}`);

  let resolved = 0, unresolved = 0, updated = 0;
  for (const m of missing) {
    let ed = {};
    try { ed = typeof m.extra_data === 'string' ? JSON.parse(m.extra_data) : (m.extra_data || {}); } catch {}
    const sourceUserId = ed.sourceUserId;
    // Priority: source Profile.instituteId → target barcodeId in extra_data → institute_card_id
    const indexNo =
      (sourceUserId && indexBySourceUserId[sourceUserId]) ||
      ed.barcodeId ||
      m.institute_card_id ||
      null;

    if (!indexNo) { unresolved++; continue; }
    resolved++;

    if (APPLY) {
      const res = await q(tgt,
        `UPDATE institute_user SET user_id_institue=?, updated_at=NOW()
         WHERE institute_id=? AND user_id=? AND (user_id_institue IS NULL OR user_id_institue='')`,
        [String(indexNo), THI_ID, m.user_id]);
      updated += res.affectedRows || 0;
    } else if (resolved <= 10) {
      console.log(`  user_id ${m.user_id} → user_id_institue '${indexNo}'`);
    }
  }

  console.log(`\nResolved an index for: ${resolved}`);
  console.log(`Could not resolve:      ${unresolved}`);
  if (APPLY) console.log(`Rows updated:           ${updated}`);
  else console.log(`(dry-run — re-run with --apply to write)`);

  // Verify after apply
  if (APPLY) {
    const [{ stillMissing }] = await q(tgt,
      `SELECT COUNT(*) stillMissing FROM institute_user
       WHERE institute_id=? AND institute_user_type='STUDENT'
         AND (user_id_institue IS NULL OR user_id_institue='')`, [THI_ID]);
    console.log(`Remaining missing:      ${stillMissing}`);
  }

  await src.end(); await tgt.end();
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
