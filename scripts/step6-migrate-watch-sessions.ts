/**
 * STEP 6 — Migrate Watch Sessions + Activities
 *   Thilina WatchSession → subject_recording_sessions + subject_recording_activities
 *   Thilina Attendance   → subject_recording_sessions (video watch totals)
 *
 * Run:
 *   npx ts-node -r tsconfig-paths/register scripts/step6-migrate-watch-sessions.ts
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
    await conn.execute(`INSERT INTO \`${table}\` (${cols.map(c => `\`${c}\``).join(',')}) VALUES ${ph}`, vals);
  }
}

async function main() {
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('  STEP 6 — Migrate Watch Sessions');
  console.log('═══════════════════════════════════════════════════════════\n');

  const state = loadState();
  const { userIdMap, recordingIdMap } = state;
  if (!userIdMap || !recordingIdMap) {
    console.error('❌ Missing state. Run step2 and step5 first.'); process.exit(1);
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

    // ── WatchSession rows ─────────────────────────────────────────
    const [thiWS] = await thiDB.execute<mysql.RowDataPacket[]>(
      `SELECT id, userId, recordingId, startedAt, endedAt,
              videoStartPos, videoEndPos, totalWatchedSec, status, events
       FROM WatchSession`
    );
    console.log(`   Found ${thiWS.length} watch sessions`);

    let wsInserted = 0;
    const activityRows: Record<string, any>[] = [];

    for (const ws of thiWS) {
      const surRecId = recordingIdMap[ws.recordingId as string];
      if (!surRecId) continue;

      const surUserId = userIdMap[ws.userId as string] || null;
      const backupStatus = ws.status === 'ENDED' ? 'completed' : 'pending';
      const startTime = ws.startedAt ? fmt(new Date(ws.startedAt)) : now;

      try {
        const [ins] = await surDB.execute<mysql.ResultSetHeader>(
          `INSERT INTO subject_recording_sessions
             (recording_id, user_id, user_type,
              start_time, end_time,
              total_watched_seconds, effective_watched_seconds,
              last_playback_speed, last_position_seconds,
              backup_status, created_at, updated_at)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
          [
            surRecId,
            surUserId,
            surUserId ? 'enrolled' : 'guest',
            startTime,
            ws.endedAt ? fmt(new Date(ws.endedAt)) : null,
            Number(ws.totalWatchedSec || 0),
            Number(ws.totalWatchedSec || 0),
            1,
            Number(ws.videoEndPos || 0),
            backupStatus,
            now, now,
          ]
        );

        if (ins.insertId) {
          wsInserted++;
          const surSessionId = String(ins.insertId);

          // Expand events JSON → activity rows
          if (ws.events) {
            let events: any[] = [];
            try { events = typeof ws.events === 'string' ? JSON.parse(ws.events) : ws.events; } catch {}
            for (const ev of events) {
              const actType = ['PLAY','PAUSE','SEEK','HEARTBEAT','SPEED_CHANGE'].includes(ev.type) ? ev.type : 'HEARTBEAT';
              activityRows.push({
                session_id: surSessionId,
                activity_type: actType,
                video_timestamp: Number(ev.videoTime || 0),
                wall_clock_timestamp: ev.wallTime ? fmt(new Date(ev.wallTime)) : null,
                metadata: ev.metadata ? JSON.stringify(ev.metadata) : null,
              });
            }
          }
        }
      } catch {}
    }

    // Bulk insert activities
    if (activityRows.length > 0) {
      await chunkInsert(surDB, 'subject_recording_activities', activityRows);
    }
    console.log(`   ✅ Watch sessions: ${wsInserted}, activities: ${activityRows.length}`);

    // ── Attendance → watch totals (for students who don't have WatchSession rows) ──
    const [thiAtt] = await thiDB.execute<mysql.RowDataPacket[]>(
      `SELECT id, userId, recordingId, status, watchedSec, liveJoinedAt
       FROM Attendance WHERE recordingId IS NOT NULL`
    );
    console.log(`   Found ${thiAtt.length} Attendance video records`);

    let attInserted = 0;
    for (const att of thiAtt) {
      const surRecId = recordingIdMap[att.recordingId as string];
      if (!surRecId) continue;
      const surUserId = userIdMap[att.userId as string] || null;
      const startTime = att.liveJoinedAt ? fmt(new Date(att.liveJoinedAt)) : now;

      try {
        await surDB.execute(
          `INSERT INTO subject_recording_sessions
             (recording_id, user_id, user_type,
              start_time, total_watched_seconds, effective_watched_seconds,
              last_playback_speed, last_position_seconds,
              backup_status, created_at, updated_at)
           VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
          [
            surRecId, surUserId,
            surUserId ? 'enrolled' : 'guest',
            startTime,
            Number(att.watchedSec || 0),
            Number(att.watchedSec || 0),
            1, 0,
            att.status === 'COMPLETED' ? 'completed' : 'pending',
            now, now,
          ]
        );
        attInserted++;
      } catch {}
    }
    console.log(`   ✅ Attendance watch sessions: ${attInserted}`);

    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('  STEP 6 COMPLETE ✅');
    console.log('═══════════════════════════════════════════════════════════');
    console.log('\n  → Run STEP 7 next: npx ts-node -r tsconfig-paths/register scripts/step7-migrate-lecture-attendance.ts\n');

  } finally {
    await surDB.end();
    await thiDB.end();
  }
}

main().catch(err => { console.error('❌ FAILED:', err); process.exit(1); });
