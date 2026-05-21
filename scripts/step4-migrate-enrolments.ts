/**
 * STEP 4 — Migrate Enrolments (Thilina Enrollment → institute_class_students)
 *
 * Run:
 *   npx ts-node -r tsconfig-paths/register scripts/step4-migrate-enrolments.ts
 *
 * Reads:  migration-state.json (instituteId, userIdMap, classIdMap)
 * Writes: nothing extra to state
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

function mapPaymentType(pt: string): string {
  if (pt === 'FULL') return 'paid';
  if (pt === 'HALF') return 'half_paid';
  if (pt === 'FREE') return 'free_card';
  return 'normal';
}

function fmt(d: Date | null | undefined): string | null {
  if (!d) return null;
  const dt = d instanceof Date ? d : new Date(d as any);
  return isNaN(dt.getTime()) ? null : dt.toISOString().replace('T', ' ').replace('Z', '').substring(0, 19);
}

async function chunkInsert(conn: mysql.Connection, table: string, rows: Record<string, any>[], size = 200) {
  if (!rows.length) return;
  for (let i = 0; i < rows.length; i += size) {
    const chunk = rows.slice(i, i + size);
    const cols = Object.keys(chunk[0]);
    const ph = chunk.map(() => `(${cols.map(() => '?').join(',')})`).join(',');
    const vals = chunk.flatMap(r => cols.map(c => r[c] ?? null));
    await conn.execute(`INSERT IGNORE INTO \`${table}\` (${cols.map(c => `\`${c}\``).join(',')}) VALUES ${ph}`, vals);
  }
}

async function main() {
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('  STEP 4 — Migrate Enrolments');
  console.log('═══════════════════════════════════════════════════════════\n');

  const state = loadState();
  const { instituteId, userIdMap, classIdMap } = state;
  if (!instituteId || !userIdMap || !classIdMap) {
    console.error('❌ Missing state. Run step1, step2, step3 first.'); process.exit(1);
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
    const [thiEnrolments] = await thiDB.execute<mysql.RowDataPacket[]>(
      `SELECT id, userId, classId, paymentType, createdAt FROM Enrollment`
    );
    console.log(`   Found ${thiEnrolments.length} enrolments in Thilina DB`);

    const rows: Record<string, any>[] = [];
    let skipped = 0;
    const now = fmt(new Date())!;

    // Collect unique user IDs that need a students row
    const neededUserIds = new Set<string>();
    for (const e of thiEnrolments) {
      const surUserId = userIdMap[e.userId as string];
      if (surUserId) neededUserIds.add(surUserId);
    }

    // Ensure students rows exist for all migrated users
    let studentsCreated = 0;
    for (const userId of neededUserIds) {
      try {
        await surDB.execute(
          `INSERT IGNORE INTO students (user_id, is_active, created_at, updated_at) VALUES (?,?,?,?)`,
          [userId, true, now, now]
        );
        studentsCreated++;
      } catch {}
    }
    console.log(`   Ensured students rows: ${studentsCreated} created (IGNORE skips existing)`);

    for (const e of thiEnrolments) {
      const surUserId = userIdMap[e.userId as string];
      const surClassId = classIdMap[e.classId as string];
      if (!surUserId || !surClassId) { skipped++; continue; }

      const enrolledAt = e.createdAt ? fmt(new Date(e.createdAt)) : now;
      rows.push({
        institute_id: instituteId,
        institute_class_id: surClassId,
        student_user_id: surUserId,
        is_active: 1,
        is_verified: 1,
        enrollment_method: 'migration',
        student_type: mapPaymentType(e.paymentType as string),
        created_at: enrolledAt,
        updated_at: enrolledAt,
      });
    }

    await chunkInsert(surDB, 'institute_class_students', rows);

    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('  STEP 4 COMPLETE ✅');
    console.log('═══════════════════════════════════════════════════════════');
    console.log(`  Total enrolments : ${thiEnrolments.length}`);
    console.log(`  Inserted         : ${rows.length}`);
    console.log(`  Skipped (no map) : ${skipped}`);
    console.log('\n  → Run STEP 5 next: npx ts-node -r tsconfig-paths/register scripts/step5-migrate-recordings.ts\n');

  } finally {
    await surDB.end();
    await thiDB.end();
  }
}

main().catch(err => { console.error('❌ FAILED:', err); process.exit(1); });
