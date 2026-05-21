/**
 * STEP 9 — Migrate Payments
 *   Thilina PaymentSlip → institute_class_payments (one header per class+month)
 *                       + institute_class_payment_submissions (one per slip)
 *
 * Run:
 *   npx ts-node -r tsconfig-paths/register scripts/step9-migrate-payments.ts
 */

import * as mysql from 'mysql2/promise';
import { config } from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';

config({ path: path.resolve(__dirname, '../.env') });

const STATE_FILE = path.resolve(__dirname, 'migration-state.json');
function loadState(): Record<string, any> {
  if (!fs.existsSync(STATE_FILE)) { console.error('❌ Run step1 first.'); process.exit(1); }
  return JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8'));
}

function fmt(d: Date | null | undefined): string | null {
  if (!d) return null;
  const dt = d instanceof Date ? d : new Date(d as any);
  return isNaN(dt.getTime()) ? null : dt.toISOString().replace('T', ' ').replace('Z', '').substring(0, 19);
}

async function main() {
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('  STEP 9 — Migrate Payments');
  console.log('═══════════════════════════════════════════════════════════\n');

  const state = loadState();
  const { instituteId, userIdMap, classIdMap, monthIdMap } = state;
  if (!instituteId || !userIdMap || !classIdMap || !monthIdMap) {
    console.error('❌ Missing state. Run step1–3 first.'); process.exit(1);
  }

  const surDB = await mysql.createConnection({
    host: process.env.DB_HOST, port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USERNAME, password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE, charset: 'utf8mb4',
    supportBigNumbers: true, bigNumberStrings: true,
  });
  const thiDB = await mysql.createConnection({
    host: '34.42.163.47', port: 3306,
    user: 'root', password: 'Skaveesha1355660@',
    database: 'thilinadhananjaya_lms', charset: 'utf8mb4',
    supportBigNumbers: true, bigNumberStrings: true,
  });
  console.log('✅ Connected to both databases\n');

  try {
    const now = fmt(new Date())!;

    // Fetch all slips with month name + class info
    const [thiSlips] = await thiDB.execute<mysql.RowDataPacket[]>(
      `SELECT ps.id, ps.userId, ps.monthId, ps.type, ps.reason, ps.slipUrl,
              ps.amount, ps.paidDate, ps.transactionId, ps.paymentMethod,
              ps.paymentPortion, ps.status, ps.adminNote, ps.rejectReason,
              m.name AS monthName, m.classId
       FROM PaymentSlip ps
       JOIN Month m ON m.id = ps.monthId`
    );
    console.log(`   Found ${thiSlips.length} payment slips`);

    // ── Create one payment header per (classId, monthName) ───────
    const paymentHeaderMap = new Map<string, string>(); // `classId:monthName` → surPaymentId
    let headersCreated = 0;

    for (const slip of thiSlips) {
      const surClassId = classIdMap[slip.classId as string];
      if (!surClassId) continue;
      const key = `${surClassId}:${slip.monthName}`;
      if (paymentHeaderMap.has(key)) continue;

      // Check if already created
      const [existing] = await surDB.execute<mysql.RowDataPacket[]>(
        'SELECT id FROM institute_class_payments WHERE class_id = ? AND title = ?',
        [surClassId, slip.monthName]
      );

      let payId: string;
      if (existing.length > 0) {
        payId = String(existing[0].id);
      } else {
        // last_date = 30 days from now
        const lastDate = fmt(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000))!;
        const [ins] = await surDB.execute<mysql.ResultSetHeader>(
          `INSERT INTO institute_class_payments
             (institute_id, class_id, title, description, target_type, priority,
              amount, status, is_active, last_date, created_at, updated_at)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
          [
            instituteId, surClassId,
            slip.monthName,
            `Monthly payment for ${slip.monthName} — migrated from ThilinaDhananjaya LMS`,
            'ALL_STUDENTS',
            'MEDIUM',
            Number(slip.amount || 0),
            'ACTIVE',
            true,
            lastDate,
            now, now,
          ]
        );
        payId = String(ins.insertId);
        headersCreated++;
      }
      paymentHeaderMap.set(key, payId);
    }
    console.log(`   ✅ Payment headers: ${headersCreated} created, ${paymentHeaderMap.size} total`);

    // ── Insert submissions ────────────────────────────────────────
    let subInserted = 0, subSkipped = 0;

    for (const slip of thiSlips) {
      const surUserId = userIdMap[slip.userId as string];
      const surClassId = classIdMap[slip.classId as string];
      if (!surUserId || !surClassId) { subSkipped++; continue; }

      const key = `${surClassId}:${slip.monthName}`;
      const payId = paymentHeaderMap.get(key);
      if (!payId) { subSkipped++; continue; }

      // Get username
      const [userRow] = await surDB.execute<mysql.RowDataPacket[]>(
        'SELECT first_name, last_name, email FROM users WHERE id = ?', [surUserId]
      );
      const username = userRow.length > 0
        ? `${userRow[0].first_name || ''} ${userRow[0].last_name || ''}`.trim() || userRow[0].email || 'Unknown'
        : 'Unknown';

      const subStatus = slip.status === 'VERIFIED' ? 'VERIFIED'
        : slip.status === 'REJECTED' ? 'REJECTED'
        : 'PENDING';

      const payDate = slip.paidDate ? fmt(new Date(slip.paidDate)) : now;
      const slipUrl = slip.slipUrl || 'migrated';
      const slipFilename = slip.slipUrl
        ? String(slip.slipUrl).split('/').pop() || 'receipt.jpg'
        : 'migrated_receipt.jpg';

      try {
        await surDB.execute(
          `INSERT IGNORE INTO institute_class_payment_submissions
             (payment_id, user_id, user_type, username,
              payment_date, receipt_url, receipt_filename,
              transaction_id, submitted_amount, status,
              rejection_reason, notes, uploaded_at, updated_at)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          [
            payId, surUserId,
            'STUDENT', username,
            payDate, slipUrl, slipFilename,
            slip.transactionId || null,
            Number(slip.amount || 0),
            subStatus,
            slip.rejectReason || null,
            slip.adminNote || null,
            now, now,
          ]
        );
        subInserted++;
      } catch (err: any) {
        subSkipped++;
      }
    }

    console.log(`   ✅ Submissions: ${subInserted} inserted, ${subSkipped} skipped`);

    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('  STEP 9 COMPLETE ✅');
    console.log('═══════════════════════════════════════════════════════════');
    console.log(`  Payment headers : ${paymentHeaderMap.size}`);
    console.log(`  Submissions     : ${subInserted}`);
    console.log('\n  🎉 ALL 9 STEPS COMPLETE — Migration finished!\n');

  } finally {
    await surDB.end();
    await thiDB.end();
  }
}

main().catch(err => { console.error('❌ FAILED:', err); process.exit(1); });
