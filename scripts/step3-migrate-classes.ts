/**
 * STEP 3 — Migrate Classes + Subjects (Thilina Month → Suraksha Subject)
 *
 * Run:
 *   npx ts-node -r tsconfig-paths/register scripts/step3-migrate-classes.ts
 *
 * Reads:  scripts/migration-state.json  (instituteId)
 * Writes: scripts/migration-state.json  (adds classIdMap, monthIdMap, monthToClassMap)
 *
 * What it does:
 *   - Each Thilina Class → Suraksha institute_classes row
 *   - Each Thilina Month → Suraksha subjects row (code: TD-YYYY-MM-<classShort>)
 *   - Links each month-subject to its class via institute_class_subjects
 */

import * as mysql from 'mysql2/promise';
import { v4 as uuidv4 } from 'uuid';
import { config } from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';

config({ path: path.resolve(__dirname, '../.env') });

const STATE_FILE = path.resolve(__dirname, 'migration-state.json');
function loadState(): Record<string, any> {
  if (!fs.existsSync(STATE_FILE)) { console.error('❌ migration-state.json not found. Run step1 first.'); process.exit(1); }
  return JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8'));
}
function saveState(data: Record<string, any>) {
  const current = loadState();
  fs.writeFileSync(STATE_FILE, JSON.stringify({ ...current, ...data }, null, 2));
}

function fmt(d: Date): string {
  return d.toISOString().replace('T', ' ').replace('Z', '').substring(0, 19);
}

async function main() {
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('  STEP 3 — Migrate Classes + Subjects');
  console.log('═══════════════════════════════════════════════════════════\n');

  const state = loadState();
  const { instituteId } = state;
  if (!instituteId) { console.error('❌ instituteId missing. Run step1 first.'); process.exit(1); }
  console.log(`   Institute ID: ${instituteId}\n`);

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
    // ── Classes ──────────────────────────────────────────────────────
    const [thiClasses] = await thiDB.execute<mysql.RowDataPacket[]>(
      `SELECT id, name, subject, description, thumbnail, status, monthlyFee, vision, mission FROM Class`
    );
    console.log(`   Found ${thiClasses.length} classes in Thilina DB`);

    const classIdMap: Record<string, string> = {};
    let classCreated = 0;

    const now = fmt(new Date());

    for (const cls of thiClasses) {
      // Check if already migrated
      const [existing] = await surDB.execute<mysql.RowDataPacket[]>(
        'SELECT id FROM institute_classes WHERE institute_id = ? AND name = ?',
        [instituteId, cls.name]
      );

      let surClassId: string;
      if (existing.length > 0) {
        surClassId = existing[0].id;
      } else {
        surClassId = uuidv4();

        // Build a unique code: TD- + first 10 alphanumeric chars of name
        const short = (cls.name as string).replace(/[^a-zA-Z0-9]/g, '').substring(0, 10).toUpperCase();
        let classCode = `TD-${short}`;
        // Ensure code uniqueness
        const [codeCheck] = await surDB.execute<mysql.RowDataPacket[]>(
          'SELECT id FROM institute_classes WHERE code = ?', [classCode]
        );
        if (codeCheck.length > 0) classCode = `TD-${short}-${surClassId.substring(0, 4).toUpperCase()}`;

        const descParts: string[] = [];
        if (cls.description) descParts.push(cls.description as string);
        if (cls.vision) descParts.push(`Vision: ${cls.vision}`);
        if (cls.mission) descParts.push(`Mission: ${cls.mission}`);
        if (cls.monthlyFee) descParts.push(`Monthly Fee: Rs. ${cls.monthlyFee}`);

        await surDB.execute(
          `INSERT INTO institute_classes
             (id, institute_id, name, code, specialty, description,
              image_url, is_active, class_type,
              enrollment_enabled, require_teacher_verification,
              created_at, updated_at)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          [
            surClassId,
            instituteId,
            cls.name,
            classCode,
            cls.subject || null,
            descParts.length > 0 ? descParts.join('\n') : null,
            cls.thumbnail || null,
            cls.status !== 'INACTIVE',
            'TUITION_CLASS',
            false, true,
            now, now,
          ]
        );
        classCreated++;
      }

      classIdMap[cls.id as string] = surClassId;
    }
    console.log(`   ✅ Classes: ${classCreated} created, ${thiClasses.length - classCreated} already existed`);

    // ── Months → Subjects ─────────────────────────────────────────
    const [thiMonths] = await thiDB.execute<mysql.RowDataPacket[]>(
      `SELECT id, classId, name, year, month, status FROM Month`
    );
    console.log(`   Found ${thiMonths.length} months (→ subjects) in Thilina DB`);

    const monthIdMap: Record<string, string> = {};
    const monthToClassMap: Record<string, string> = {};
    let subCreated = 0;

    for (const m of thiMonths) {
      const surClassId = classIdMap[m.classId as string];
      if (!surClassId) { console.log(`   ⚠️  No class found for month ${m.id} (classId=${m.classId})`); continue; }

      monthToClassMap[m.id as string] = m.classId as string;

      // Code format: TD-2026-01-<first6ofClassUUID>
      const globalCode = `TD-${m.year}-${String(m.month).padStart(2, '0')}-${surClassId.substring(0, 6)}`;

      const [existing] = await surDB.execute<mysql.RowDataPacket[]>(
        'SELECT id FROM subjects WHERE code = ?', [globalCode]
      );

      let surSubjectId: string;
      if (existing.length > 0) {
        surSubjectId = existing[0].id;
      } else {
        surSubjectId = uuidv4();
        await surDB.execute(
          `INSERT INTO subjects
             (id, institute_id, code, name, description, is_active, subject_type, created_at, updated_at)
           VALUES (?,?,?,?,?,?,?,?,?)`,
          [
            surSubjectId,
            instituteId,
            globalCode,
            m.name,
            null,
            m.status !== 'INACTIVE',
            'MAIN',
            now, now,
          ]
        );

        // Link subject to class
        await surDB.execute(
          `INSERT IGNORE INTO institute_class_subjects
             (institute_id, class_id, subject_id, is_active,
              enrollment_enabled, enrollment_fee_required, created_at, updated_at)
           VALUES (?,?,?,?,?,?,?,?)`,
          [instituteId, surClassId, surSubjectId, true, false, false, now, now]
        );
        subCreated++;
      }

      monthIdMap[m.id as string] = surSubjectId;
    }
    console.log(`   ✅ Subjects: ${subCreated} created, ${thiMonths.length - subCreated} already existed`);

    // Save to state
    saveState({ classIdMap, monthIdMap, monthToClassMap });

    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('  STEP 3 COMPLETE ✅');
    console.log('═══════════════════════════════════════════════════════════');
    console.log(`  Classes  : ${Object.keys(classIdMap).length} mapped`);
    console.log(`  Subjects : ${Object.keys(monthIdMap).length} mapped`);
    console.log('\n  → Run STEP 4 next: npx ts-node -r tsconfig-paths/register scripts/step4-migrate-enrolments.ts\n');

  } finally {
    await surDB.end();
    await thiDB.end();
  }
}

main().catch(err => { console.error('❌ FAILED:', err); process.exit(1); });
