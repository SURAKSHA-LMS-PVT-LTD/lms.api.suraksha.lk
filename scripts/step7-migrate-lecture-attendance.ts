/**
 * STEP 7 — Migrate Lecture Live Attendance + Guest Joins
 *   Thilina LectureAttendance → lecture_live_attendance
 *   Thilina GuestLectureJoin  → lecture_live_attendance (guest rows)
 *
 * Run:
 *   npx ts-node -r tsconfig-paths/register scripts/step7-migrate-lecture-attendance.ts
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

async function chunkInsert(conn: mysql.Connection, table: string, rows: Record<string, any>[], size = 300) {
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
  console.log('  STEP 7 — Migrate Lecture Attendance');
  console.log('═══════════════════════════════════════════════════════════\n');

  const state = loadState();
  const { instituteId, userIdMap, lectureIdMap, classIdMap } = state;
  if (!instituteId || !userIdMap || !lectureIdMap) {
    console.error('❌ Missing state. Run step1, step2, step5 first.'); process.exit(1);
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

    // ── LectureAttendance ─────────────────────────────────────────
    const [thiLA] = await thiDB.execute<mysql.RowDataPacket[]>(
      `SELECT id, lectureId, userId, joinedAt FROM LectureAttendance`
    );
    console.log(`   Found ${thiLA.length} lecture attendance records`);

    const laRows: Record<string, any>[] = [];
    for (const la of thiLA) {
      const surLecId = lectureIdMap[la.lectureId as string];
      if (!surLecId) continue;
      laRows.push({
        lecture_id: surLecId,
        institute_id: instituteId,
        user_id: userIdMap[la.userId as string] || null,
        join_time: la.joinedAt ? fmt(new Date(la.joinedAt)) : now,
      });
    }
    await chunkInsert(surDB, 'lecture_live_attendance', laRows);
    console.log(`   ✅ Lecture attendance: ${laRows.length} inserted`);

    // ── GuestLectureJoin ──────────────────────────────────────────
    let guestInserted = 0;
    try {
      const [thiGuests] = await thiDB.execute<mysql.RowDataPacket[]>(
        `SELECT id, lectureId, fullName, phone, email, joinedAt FROM GuestLectureJoin`
      );
      console.log(`   Found ${thiGuests.length} guest lecture joins`);

      const guestRows: Record<string, any>[] = [];
      for (const g of thiGuests) {
        const surLecId = lectureIdMap[g.lectureId as string];
        if (!surLecId) continue;
        guestRows.push({
          lecture_id: surLecId,
          institute_id: instituteId,
          user_id: null,
          guest_name: g.fullName || null,
          guest_email: g.email || null,
          guest_phone: g.phone || null,
          join_time: g.joinedAt ? fmt(new Date(g.joinedAt)) : now,
        });
      }
      await chunkInsert(surDB, 'lecture_live_attendance', guestRows);
      guestInserted = guestRows.length;
      console.log(`   ✅ Guest joins: ${guestInserted} inserted`);
    } catch (err: any) {
      console.log(`   ⚠️  GuestLectureJoin table error: ${err.message} — skipping`);
    }

    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('  STEP 7 COMPLETE ✅');
    console.log('═══════════════════════════════════════════════════════════');
    console.log(`  Live attendance: ${laRows.length}`);
    console.log(`  Guest joins    : ${guestInserted}`);
    console.log('\n  → Run STEP 8 next: npx ts-node -r tsconfig-paths/register scripts/step8-migrate-physical-attendance.ts\n');

  } finally {
    await surDB.end();
    await thiDB.end();
  }
}

main().catch(err => { console.error('❌ FAILED:', err); process.exit(1); });
