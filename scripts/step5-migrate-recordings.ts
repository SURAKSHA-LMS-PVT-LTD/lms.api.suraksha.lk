/**
 * STEP 5 — Migrate Recordings + Lectures
 *   Thilina Recording → subject_recordings
 *   Thilina Lecture   → institute_class_subject_lectures
 *
 * Run:
 *   npx ts-node -r tsconfig-paths/register scripts/step5-migrate-recordings.ts
 *
 * Reads:  migration-state.json (instituteId, classIdMap, monthIdMap, monthToClassMap)
 * Writes: migration-state.json (adds recordingIdMap, lectureIdMap)
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
function saveState(data: Record<string, any>) {
  const current = loadState();
  fs.writeFileSync(STATE_FILE, JSON.stringify({ ...current, ...data }, null, 2));
}

function fmt(d: Date | null | undefined): string | null {
  if (!d) return null;
  const dt = d instanceof Date ? d : new Date(d as any);
  return isNaN(dt.getTime()) ? null : dt.toISOString().replace('T', ' ').replace('Z', '').substring(0, 19);
}

function mapVideoType(vt: string): string {
  if (vt === 'YOUTUBE') return 'YOUTUBE';
  if (vt === 'DRIVE') return 'GOOGLE_DRIVE';
  return 'EXTERNAL';
}

function mapRecStatus(status: string): { recStatus: string; recAccessLevel: string } {
  if (status === 'INACTIVE') return { recStatus: 'archived', recAccessLevel: 'ENROLLED_ONLY' };
  if (status === 'PRIVATE') return { recStatus: 'draft', recAccessLevel: 'ENROLLED_ONLY' };
  if (status === 'PAID_ONLY') return { recStatus: 'published', recAccessLevel: 'PAID_ONLY' };
  if (status === 'ANYONE') return { recStatus: 'published', recAccessLevel: 'ANYONE' };
  return { recStatus: 'published', recAccessLevel: 'ENROLLED_ONLY' };
}

async function main() {
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('  STEP 5 — Migrate Recordings + Lectures');
  console.log('═══════════════════════════════════════════════════════════\n');

  const state = loadState();
  const { instituteId, classIdMap, monthIdMap, monthToClassMap } = state;
  if (!instituteId || !classIdMap || !monthIdMap || !monthToClassMap) {
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

    // ── Recordings ───────────────────────────────────────────────────
    const [thiRecs] = await thiDB.execute<mysql.RowDataPacket[]>(
      `SELECT id, monthId, title, description, videoUrl, videoType,
              thumbnail, duration, topic, materials, welcomeMessage,
              isLive, liveUrl, liveToken, liveStartedAt, liveEndedAt,
              status, \`order\`
       FROM Recording`
    );
    console.log(`   Found ${thiRecs.length} recordings`);

    const recordingIdMap: Record<string, string> = {};
    let recCreated = 0, recSkipped = 0;

    for (const rec of thiRecs) {
      const surSubjectId = monthIdMap[rec.monthId as string];
      const thiClassId = monthToClassMap[rec.monthId as string];
      const surClassId = thiClassId ? classIdMap[thiClassId] : null;
      if (!surSubjectId || !surClassId) { recSkipped++; continue; }

      const { recStatus, recAccessLevel } = mapRecStatus(rec.status as string);
      const platform = mapVideoType(rec.videoType as string);

      let materials: any[] = [];
      if (rec.materials) {
        try {
          const parsed = typeof rec.materials === 'string' ? JSON.parse(rec.materials) : rec.materials;
          if (Array.isArray(parsed)) {
            materials = parsed.map((m: any) => ({
              documentName: m.name || m.title || 'Material',
              documentUrl: m.url || m.fileUrl || '',
            }));
          }
        } catch {}
      }

      try {
        const [inserted] = await surDB.execute<mysql.ResultSetHeader>(
          `INSERT INTO subject_recordings
             (institute_id, class_id, subject_id,
              title, description, platform, recording_url,
              duration_seconds, thumbnail_url, materials, status, is_active,
              rec_attendance_enabled, rec_access_level,
              welcome_message_enabled, welcome_message_text,
              created_at, updated_at)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          [
            instituteId, surClassId, surSubjectId,
            rec.title, rec.description || null,
            platform, rec.videoUrl || null,
            rec.duration ? Number(rec.duration) : null,
            rec.thumbnail || null,
            materials.length > 0 ? JSON.stringify(materials) : null,
            recStatus, true,
            true, recAccessLevel,
            rec.welcomeMessage ? true : false,
            rec.welcomeMessage || null,
            now, now,
          ]
        );
        if (inserted.insertId) {
          recordingIdMap[rec.id as string] = String(inserted.insertId);
          recCreated++;
        }
      } catch (err: any) {
        console.log(`   ⚠️  Recording ${rec.id}: ${err.message}`);
        recSkipped++;
      }
    }
    console.log(`   ✅ Recordings: ${recCreated} created, ${recSkipped} skipped`);

    // ── Lectures ─────────────────────────────────────────────────────
    const [thiLecs] = await thiDB.execute<mysql.RowDataPacket[]>(
      `SELECT id, monthId, title, description, mode, platform,
              startTime, endTime, sessionLink, meetingId, meetingPassword,
              maxParticipants, welcomeMessage, liveToken, cardImageUrl,
              bgMediaUrl, status
       FROM Lecture`
    );
    console.log(`   Found ${thiLecs.length} lectures`);

    const lectureIdMap: Record<string, string> = {};
    let lecCreated = 0, lecSkipped = 0;

    for (const lec of thiLecs) {
      const surSubjectId = monthIdMap[lec.monthId as string];
      const thiClassId = monthToClassMap[lec.monthId as string];
      const surClassId = thiClassId ? classIdMap[thiClassId] : null;
      if (!surSubjectId || !surClassId) { lecSkipped++; continue; }

      const lecStatus = lec.status === 'COMPLETED' ? 'completed'
        : lec.status === 'CANCELLED' ? 'cancelled'
        : lec.status === 'LIVE' ? 'live'
        : 'scheduled';

      const lecType = lec.mode === 'ONLINE' ? 'online' : 'physical';
      const startTime = lec.startTime ? fmt(new Date(lec.startTime)) : now;
      const endTime = lec.endTime ? fmt(new Date(lec.endTime)) : now;

      const lecMaterials: any[] = [];
      if (lec.meetingId) lecMaterials.push({ documentName: 'Meeting ID', documentUrl: String(lec.meetingId) });
      if (lec.sessionLink && lec.sessionLink !== lec.meetingId)
        lecMaterials.push({ documentName: 'Session Link', documentUrl: String(lec.sessionLink) });

      try {
        const [inserted] = await surDB.execute<mysql.ResultSetHeader>(
          `INSERT INTO institute_class_subject_lectures
             (institute_id, class_id, subject_id,
              title, description, lecture_type,
              start_time, end_time, status,
              meeting_link, meeting_id,
              max_participants, materials,
              is_active, is_recorded,
              live_attendance_enabled, live_access_level,
              live_entry_bg_url, live_card_image_url,
              welcome_message_enabled, welcome_message_text,
              rec_attendance_enabled, rec_access_level,
              created_at, updated_at)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          [
            instituteId, surClassId, surSubjectId,
            lec.title, lec.description || null, lecType,
            startTime, endTime, lecStatus,
            lec.sessionLink || null, lec.meetingId || null,
            lec.maxParticipants || null,
            lecMaterials.length > 0 ? JSON.stringify(lecMaterials) : null,
            true, false,
            true, 'ANYONE',
            lec.bgMediaUrl || null, lec.cardImageUrl || null,
            lec.welcomeMessage ? true : false, lec.welcomeMessage || null,
            false, 'ENROLLED_ONLY',
            now, now,
          ]
        );
        if (inserted.insertId) {
          lectureIdMap[lec.id as string] = String(inserted.insertId);
          lecCreated++;
        }
      } catch (err: any) {
        console.log(`   ⚠️  Lecture ${lec.id}: ${err.message}`);
        lecSkipped++;
      }
    }
    console.log(`   ✅ Lectures: ${lecCreated} created, ${lecSkipped} skipped`);

    saveState({ recordingIdMap, lectureIdMap });

    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('  STEP 5 COMPLETE ✅');
    console.log('═══════════════════════════════════════════════════════════');
    console.log(`  Recordings: ${recCreated}`);
    console.log(`  Lectures  : ${lecCreated}`);
    console.log('\n  → Run STEP 6 next: npx ts-node -r tsconfig-paths/register scripts/step6-migrate-watch-sessions.ts\n');

  } finally {
    await surDB.end();
    await thiDB.end();
  }
}

main().catch(err => { console.error('❌ FAILED:', err); process.exit(1); });
