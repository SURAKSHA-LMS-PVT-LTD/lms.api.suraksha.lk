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

function normalizeText(v: any): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s.length ? s : null;
}

function normalizeTime(v: any): string | null {
  const s = normalizeText(v);
  if (!s) return null;
  const match = s.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (!match) return null;
  const hh = match[1].padStart(2, '0');
  const mm = match[2];
  return `${hh}:${mm}`;
}

function buildGroupKey(classId: string, name: string | null, orderNo: number): string {
  return `${classId}|${name || 'unnamed'}|${orderNo}`;
}

function buildLegacySessionKey(legacyClassId: string, date: string, code?: string | null, time?: string | null): string {
  const codeKey = normalizeText(code) || 'none';
  const timeKey = normalizeTime(time) || 'none';
  return `${legacyClassId}|${date}|${codeKey}|${timeKey}`;
}

function buildClassDateKey(legacyClassId: string, date: string): string {
  return `${legacyClassId}|${date}`;
}

function addBucket(map: Record<string, string[]>, key: string, value: string) {
  if (!map[key]) map[key] = [value];
  else if (!map[key].includes(value)) map[key].push(value);
}

function resolveBucket(map: Record<string, string[]>, key: string): { id: string | null; ambiguous: boolean } {
  const bucket = map[key];
  if (!bucket || bucket.length === 0) return { id: null, ambiguous: false };
  if (bucket.length > 1) return { id: null, ambiguous: true };
  return { id: bucket[0], ambiguous: false };
}

function parseDateTimeUtc(date: string, time?: string | null): number | null {
  const parts = date.split('-').map(n => Number(n));
  if (parts.length !== 3 || parts.some(n => Number.isNaN(n))) return null;
  const [y, m, d] = parts;
  let hh = 0; let mm = 0; let ss = 0;
  const t = normalizeTime(time);
  if (t) {
    const tParts = t.split(':').map(n => Number(n));
    if (tParts.length >= 2) {
      hh = tParts[0] || 0;
      mm = tParts[1] || 0;
      ss = tParts[2] || 0;
    }
  }
  const ts = Date.UTC(y, m - 1, d, hh, mm, ss);
  return Number.isFinite(ts) ? ts : null;
}

function hashString(input: string): number {
  let h = 0;
  for (let i = 0; i < input.length; i += 1) {
    h = (h * 31 + input.charCodeAt(i)) >>> 0;
  }
  return h;
}

function stableTimestamp(legacyId: string | null, date: string, time?: string | null, sessionAt?: any): number {
  if (sessionAt) {
    const ts = new Date(sessionAt).getTime();
    if (!Number.isNaN(ts)) return ts;
  }
  const base = parseDateTimeUtc(date, time);
  const seed = `${legacyId || ''}|${date}|${normalizeTime(time) || ''}`;
  const hash = hashString(seed);
  if (base === null || Number.isNaN(base)) return Date.now() + (hash % 1000);
  const offset = time ? (hash % 1000) : (hash % 86400000);
  return base + offset;
}

function mapAttStatus(s: string): number {
  if (s === 'PRESENT') return 1;
  if (s === 'LATE') return 2;
  if (s === 'EXCUSED') return 0;
  return 0; // ABSENT
}

async function chunkInsert(
  conn: mysql.Connection,
  table: string,
  rows: Record<string, any>[],
  size = 300,
  updateColumns: string[] = [],
) {
  if (!rows.length) return;
  for (let i = 0; i < rows.length; i += size) {
    const chunk = rows.slice(i, i + size);
    const cols = Object.keys(chunk[0]);
    const ph = chunk.map(() => `(${cols.map(() => '?').join(',')})`).join(',');
    const vals = chunk.flatMap(r => cols.map(c => r[c] ?? null));
    const baseSql = `INSERT INTO \`${table}\` (${cols.map(c => `\`${c}\``).join(',')}) VALUES ${ph}`;
    const sql = updateColumns.length > 0
      ? `${baseSql} ON DUPLICATE KEY UPDATE ${updateColumns.map(c => `\`${c}\`=VALUES(\`${c}\`)`).join(',')}`
      : `${baseSql} ON DUPLICATE KEY UPDATE \`${cols[0]}\`=\`${cols[0]}\``;
    await conn.execute(sql, vals);
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

    const [existingGroups] = await surDB.execute<mysql.RowDataPacket[]>(
      `SELECT id, class_id, name, display_order
       FROM institute_class_attendance_session_groups
       WHERE institute_id = ?`,
      [instituteId]
    ) as [mysql.RowDataPacket[], any];

    const existingGroupMap: Record<string, string> = {};
    for (const g of existingGroups) {
      const key = buildGroupKey(String(g.class_id), normalizeText(g.name) || 'unnamed', Number(g.display_order || 0));
      if (!existingGroupMap[key]) existingGroupMap[key] = String(g.id);
    }

    const [existingSessions] = await surDB.execute<mysql.RowDataPacket[]>(
      `SELECT id, class_id, date, start_time, name, session_group_id
       FROM institute_class_attendance_sessions
       WHERE institute_id = ?`,
      [instituteId]
    ) as [mysql.RowDataPacket[], any];

    const existingSessionMap: Record<string, string> = {};
    const existingSessionGroupMap: Record<string, string | null> = {};
    for (const s of existingSessions) {
      const dStr = dateStr(s.date);
      const nameKey = normalizeText(s.name) || `Session ${dStr}`;
      const startTimeKey = normalizeTime(s.start_time) || '08:00';
      const key = `${String(s.class_id)}|${dStr}|${startTimeKey}|${nameKey}`;
      if (!existingSessionMap[key]) existingSessionMap[key] = String(s.id);
      existingSessionGroupMap[String(s.id)] = s.session_group_id ? String(s.session_group_id) : null;
    }

    const sessionKeyBuckets: Record<string, string[]> = {};
    const sessionCodeBuckets: Record<string, string[]> = {};
    const sessionTimeBuckets: Record<string, string[]> = {};
    const classDateBuckets: Record<string, string[]> = {};

    // ── Weeks → session groups ────────────────────────────────────
    let weekRows: mysql.RowDataPacket[] = [];
    try {
      [weekRows] = await thiDB.execute<mysql.RowDataPacket[]>(
        `SELECT id, classId, name, orderNo FROM ClassAttendanceWeek`
      ) as [mysql.RowDataPacket[], any];
    } catch { weekRows = []; }
    console.log(`   Found ${weekRows.length} attendance weeks`);

    const weekGroupMap: Record<string, string> = {};
    let groupsCreated = 0;
    let groupsReused = 0;
    for (const w of weekRows) {
      const surClassId = classIdMap[w.classId as string];
      if (!surClassId) continue;
      const groupName = normalizeText(w.name) || 'Week';
      const groupOrder = Number(w.orderNo || 0);
      const gKey = buildGroupKey(surClassId, groupName, groupOrder);
      let gId = existingGroupMap[gKey];
      if (!gId) {
        gId = uuidv4();
        await surDB.execute(
          `INSERT INTO institute_class_attendance_session_groups
             (id, institute_id, class_id, name, display_order, is_active, created_at, updated_at)
           VALUES (?,?,?,?,?,?,?,?)`,
          [gId, instituteId, surClassId, groupName, groupOrder, true, now, now]
        );
        existingGroupMap[gKey] = gId;
        groupsCreated += 1;
      } else {
        groupsReused += 1;
      }
      weekGroupMap[w.id as string] = gId;
    }
    console.log(`   ✅ Session groups: ${Object.keys(weekGroupMap).length} mapped (${groupsCreated} new, ${groupsReused} reused)`);

    // ── Sessions ──────────────────────────────────────────────────
    let sessionRows: mysql.RowDataPacket[] = [];
    try {
      [sessionRows] = await thiDB.execute<mysql.RowDataPacket[]>(
        `SELECT id, classId, weekId, date, sessionTime, sessionCode FROM ClassAttendanceSession`
      ) as [mysql.RowDataPacket[], any];
    } catch { sessionRows = []; }
    console.log(`   Found ${sessionRows.length} attendance sessions`);

    const sessionMap: Record<string, string> = {};
    let sessionsCreated = 0;
    let sessionsReused = 0;
    let sessionsUpdated = 0;
    for (const s of sessionRows) {
      const legacyClassId = String(s.classId);
      const surClassId = classIdMap[s.classId as string];
      if (!surClassId) continue;
      const surGroupId = s.weekId ? weekGroupMap[s.weekId as string] : null;
      const dStr = dateStr(s.date);
      const startTime = normalizeTime(s.sessionTime) || '08:00';
      const name = normalizeText(s.sessionCode) || `Session ${dStr}`;
      const sKey = `${surClassId}|${dStr}|${startTime}|${name}`;
      let sId = existingSessionMap[sKey];

      if (!sId) {
        sId = uuidv4();
        await surDB.execute(
          `INSERT INTO institute_class_attendance_sessions
             (id, institute_id, class_id, session_group_id,
              name, date, start_time, is_closed, close_unmark_action,
              total_students, send_notifications, created_at, updated_at)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          [
            sId, instituteId, surClassId, surGroupId || null,
            name, dStr, startTime,
            false, 'KEEP_NOT_MARKED',
            0, false, now, now,
          ]
        );
        existingSessionMap[sKey] = sId;
        existingSessionGroupMap[sId] = surGroupId || null;
        sessionsCreated += 1;
      } else {
        sessionsReused += 1;
        const existingGroupId = existingSessionGroupMap[sId];
        if (!existingGroupId && surGroupId) {
          await surDB.execute(
            `UPDATE institute_class_attendance_sessions
             SET session_group_id = ?, updated_at = ?
             WHERE id = ?`,
            [surGroupId, now, sId]
          );
          existingSessionGroupMap[sId] = surGroupId;
          sessionsUpdated += 1;
        }
      }

      sessionMap[s.id as string] = sId;
      addBucket(sessionKeyBuckets, buildLegacySessionKey(legacyClassId, dStr, s.sessionCode, s.sessionTime), sId);
      addBucket(classDateBuckets, buildClassDateKey(legacyClassId, dStr), sId);
      if (normalizeText(s.sessionCode)) {
        addBucket(sessionCodeBuckets, buildLegacySessionKey(legacyClassId, dStr, s.sessionCode, null), sId);
      }
      if (normalizeTime(s.sessionTime)) {
        addBucket(sessionTimeBuckets, buildLegacySessionKey(legacyClassId, dStr, null, s.sessionTime), sId);
      }
    }
    console.log(`   ✅ Attendance sessions: ${Object.keys(sessionMap).length} mapped (${sessionsCreated} new, ${sessionsReused} reused, ${sessionsUpdated} updated)`);

    // ── Attendance records ────────────────────────────────────────
    let attRows: mysql.RowDataPacket[] = [];
    try {
      [attRows] = await thiDB.execute<mysql.RowDataPacket[]>(
        `SELECT id, userId, classId, date, sessionTime, sessionCode, status, method, note
         FROM ClassAttendance`
      ) as [mysql.RowDataPacket[], any];
    } catch (err) {
      try {
        [attRows] = await thiDB.execute<mysql.RowDataPacket[]>(
          `SELECT id, userId, classId, date, sessionCode, status, method, note
           FROM ClassAttendance`
        ) as [mysql.RowDataPacket[], any];
        console.log('   INFO: sessionTime column missing in ClassAttendance — falling back to date-only mapping');
      } catch { attRows = []; }
    }
    console.log(`   Found ${attRows.length} physical attendance records`);

    const recRows: Record<string, any>[] = [];
    let attSkipped = 0;
    let attMissingSession = 0;
    let attAmbiguousSession = 0;

    for (const ar of attRows) {
      const surUserId = userIdMap[ar.userId as string];
      const surClassId = classIdMap[ar.classId as string];
      if (!surUserId || !surClassId) { attSkipped++; continue; }

      const dStr = dateStr(ar.date);
      const attSessionTime = normalizeTime((ar as any).sessionTime);
      const attSessionCode = normalizeText(ar.sessionCode);
      const ts = stableTimestamp(String(ar.id || ''), dStr, attSessionTime, (ar as any).sessionAt);
      const remarkParts: string[] = [];
      if (ar.note) remarkParts.push(String(ar.note));
      if (ar.method) remarkParts.push(`method:${ar.method}`);

      const fullKey = buildLegacySessionKey(String(ar.classId), dStr, attSessionCode, attSessionTime);
      const codeKey = buildLegacySessionKey(String(ar.classId), dStr, attSessionCode, null);
      const timeKey = buildLegacySessionKey(String(ar.classId), dStr, null, attSessionTime);
      const dateKey = buildClassDateKey(String(ar.classId), dStr);

      let classSessionId: string | null = null;
      let ambiguousHit = false;

      const full = resolveBucket(sessionKeyBuckets, fullKey);
      if (full.ambiguous) ambiguousHit = true;
      if (full.id) classSessionId = full.id;

      if (!classSessionId && !ambiguousHit) {
        const byCode = resolveBucket(sessionCodeBuckets, codeKey);
        if (byCode.ambiguous) ambiguousHit = true;
        if (byCode.id) classSessionId = byCode.id;
      }

      if (!classSessionId && !ambiguousHit) {
        const byTime = resolveBucket(sessionTimeBuckets, timeKey);
        if (byTime.ambiguous) ambiguousHit = true;
        if (byTime.id) classSessionId = byTime.id;
      }

      if (!classSessionId && !ambiguousHit) {
        const byDate = resolveBucket(classDateBuckets, dateKey);
        if (byDate.ambiguous) ambiguousHit = true;
        if (byDate.id) classSessionId = byDate.id;
      }

      if (ambiguousHit) attAmbiguousSession += 1;
      if (!classSessionId) attMissingSession += 1;

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
        class_session_id: classSessionId,
      });
    }

    await chunkInsert(
      surDB,
      'attendance_records',
      recRows,
      300,
      ['status', 'remarks', 'marking_method', 'class_session_id', 'synced_at', 'sync_status', 'timestamp']
    );

    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('  STEP 8 COMPLETE ✅');
    console.log('═══════════════════════════════════════════════════════════');
    console.log(`  Session groups  : ${Object.keys(weekGroupMap).length}`);
    console.log(`  Sessions        : ${Object.keys(sessionMap).length}`);
    console.log(`  Attendance recs : ${recRows.length} upserted, ${attSkipped} skipped`);
    console.log(`  Session links   : ${recRows.length - attMissingSession} linked, ${attMissingSession} missing, ${attAmbiguousSession} ambiguous`);
    console.log('\n  → Run STEP 9 next: npx ts-node -r tsconfig-paths/register scripts/step9-migrate-payments.ts\n');

  } finally {
    await surDB.end();
    await thiDB.end();
  }
}

main().catch(err => { console.error('❌ FAILED:', err); process.exit(1); });
