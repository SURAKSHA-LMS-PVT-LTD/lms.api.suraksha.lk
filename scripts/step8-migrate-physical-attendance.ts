/**
 * STEP 8 — Migrate Physical Attendance
 *   Thilina ClassAttendanceWeek    → institute_class_attendance_session_groups
 *   Thilina ClassAttendanceSession → institute_class_attendance_sessions
 *   Thilina ClassAttendance        → attendance_records
 *
 * Run:
 *   npx ts-node -r tsconfig-paths/register scripts/step8-migrate-physical-attendance.ts
 */

import * as mysql from 'mysql2/promise';
import { v4 as uuidv4 } from 'uuid';
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

function dateStr(d: any): string {
  if (!d) return new Date().toISOString().substring(0, 10);
  const dt = d instanceof Date ? d : new Date(d);
  return isNaN(dt.getTime()) ? new Date().toISOString().substring(0, 10) : dt.toISOString().substring(0, 10);
}

function mapAttStatus(s: string): number {
  if (s === 'PRESENT') return 1;
  if (s === 'LATE') return 2;
  if (s === 'EXCUSED') return 0;
  return 0; // ABSENT
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
  console.log('  STEP 8 — Migrate Physical Attendance');
  console.log('═══════════════════════════════════════════════════════════\n');

  const state = loadState();
  const { instituteId, userIdMap, classIdMap } = state;
  if (!instituteId || !userIdMap || !classIdMap) {
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

    // ── Weeks → session groups ────────────────────────────────────
    let weekRows: mysql.RowDataPacket[] = [];
    try {
      [weekRows] = await thiDB.execute<mysql.RowDataPacket[]>(
        `SELECT id, classId, name, orderNo FROM ClassAttendanceWeek`
      ) as [mysql.RowDataPacket[], any];
    } catch { weekRows = []; }
    console.log(`   Found ${weekRows.length} attendance weeks`);

    const weekGroupMap: Record<string, string> = {};
    for (const w of weekRows) {
      const surClassId = classIdMap[w.classId as string];
      if (!surClassId) continue;
      const gId = uuidv4();
      await surDB.execute(
        `INSERT IGNORE INTO institute_class_attendance_session_groups
           (id, institute_id, class_id, name, display_order, is_active, created_at, updated_at)
         VALUES (?,?,?,?,?,?,?,?)`,
        [gId, instituteId, surClassId, w.name, Number(w.orderNo || 0), true, now, now]
      );
      weekGroupMap[w.id as string] = gId;
    }
    console.log(`   ✅ Session groups: ${Object.keys(weekGroupMap).length} created`);

    // ── Sessions ──────────────────────────────────────────────────
    let sessionRows: mysql.RowDataPacket[] = [];
    try {
      [sessionRows] = await thiDB.execute<mysql.RowDataPacket[]>(
        `SELECT id, classId, weekId, date, sessionTime, sessionCode FROM ClassAttendanceSession`
      ) as [mysql.RowDataPacket[], any];
    } catch { sessionRows = []; }
    console.log(`   Found ${sessionRows.length} attendance sessions`);

    const sessionMap: Record<string, string> = {};
    for (const s of sessionRows) {
      const surClassId = classIdMap[s.classId as string];
      if (!surClassId) continue;
      const surGroupId = s.weekId ? weekGroupMap[s.weekId as string] : null;
      const sId = uuidv4();
      const dStr = dateStr(s.date);
      const startTime = s.sessionTime || '08:00';

      await surDB.execute(
        `INSERT IGNORE INTO institute_class_attendance_sessions
           (id, institute_id, class_id, session_group_id,
            name, date, start_time, is_closed, close_unmark_action,
            total_students, send_notifications, created_at, updated_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [
          sId, instituteId, surClassId, surGroupId || null,
          s.sessionCode || `Session ${dStr}`, dStr, startTime,
          false, 'KEEP_NOT_MARKED',
          0, false, now, now,
        ]
      );
      sessionMap[s.id as string] = sId;
    }
    console.log(`   ✅ Attendance sessions: ${Object.keys(sessionMap).length} created`);

    // ── Attendance records ────────────────────────────────────────
    let attRows: mysql.RowDataPacket[] = [];
    try {
      [attRows] = await thiDB.execute<mysql.RowDataPacket[]>(
        `SELECT id, userId, classId, date, sessionCode, status, method, note
         FROM ClassAttendance`
      ) as [mysql.RowDataPacket[], any];
    } catch { attRows = []; }
    console.log(`   Found ${attRows.length} physical attendance records`);

    const recRows: Record<string, any>[] = [];
    let attSkipped = 0;

    for (const ar of attRows) {
      const surUserId = userIdMap[ar.userId as string];
      const surClassId = classIdMap[ar.classId as string];
      if (!surUserId || !surClassId) { attSkipped++; continue; }

      const dStr = dateStr(ar.date);
      const ts = Date.now() + recRows.length; // unique enough for synthetic key
      const remarkParts: string[] = [];
      if (ar.note) remarkParts.push(String(ar.note));
      if (ar.method) remarkParts.push(`method:${ar.method}`);

      recRows.push({
        dynamo_pk: `I#${instituteId}`,
        dynamo_sk: `ATTENDANCE#${dStr}#TS#${ts}#S#${surUserId}#C#${surClassId}#SUB#none`,
        institute_id: instituteId,
        student_id: surUserId,
        date: dStr,
        status: mapAttStatus(ar.status as string),
        timestamp: String(ts),
        class_id: surClassId,
        subject_id: null,
        calendar_day_id: null,
        event_id: null,
        location: null,
        latitude: null,
        longitude: null,
        remarks: remarkParts.length > 0 ? remarkParts.join('; ') : null,
        marking_method: ar.method || 'MANUAL',
        user_type: 'STUDENT',
        device_uid: null,
        advertisement_id: null,
        sync_status: 'SYNCED',
        sync_error: null,
        synced_at: now,
        class_session_id: null,
      });
    }

    await chunkInsert(surDB, 'attendance_records', recRows);

    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('  STEP 8 COMPLETE ✅');
    console.log('═══════════════════════════════════════════════════════════');
    console.log(`  Session groups  : ${Object.keys(weekGroupMap).length}`);
    console.log(`  Sessions        : ${Object.keys(sessionMap).length}`);
    console.log(`  Attendance recs : ${recRows.length} inserted, ${attSkipped} skipped`);
    console.log('\n  → Run STEP 9 next: npx ts-node -r tsconfig-paths/register scripts/step9-migrate-payments.ts\n');

  } finally {
    await surDB.end();
    await thiDB.end();
  }
}

main().catch(err => { console.error('❌ FAILED:', err); process.exit(1); });
