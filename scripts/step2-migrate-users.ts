/**
 * STEP 2 — Migrate students from Thilina DB → Suraksha users + institute_user
 *
 * Run:
 *   npx ts-node -r tsconfig-paths/register scripts/step2-migrate-users.ts
 *
 * Reads:  scripts/migration-state.json  (instituteId written by step1)
 * Writes: scripts/migration-state.json  (adds userIdMap: thiUserId → surUserId)
 *
 * What it does:
 *   - Reads all STUDENT users + profiles from Thilina DB
 *   - Creates global Suraksha user (if not exists by email)
 *   - Sets users.password = NULL  (no global system access for migrated students)
 *   - Copies the Thilina bcrypt hash into institute_user.institute_password ONLY
 *   - Maps barcodeId → institute_card_id,  profile.instituteId → user_id_institue
 *
 * Password strategy:
 *   Migrated students have NO global password (users.password = NULL).
 *   They can ONLY log in via the institute login endpoint using their original
 *   Thilina password, which is verified against institute_user.institute_password.
 *   institute-login.service.ts accepts the plain-bcrypt Thilina hash via the
 *   legacy no-pepper fallback in comparePasswordFull(), and auto-upgrades it to
 *   the peppered format on first successful login.
 *
 *   Students log in with exactly the same password they used in Thilina LMS.
 *   No password reset required.
 */

import * as mysql from 'mysql2/promise';
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

function randomUserId(): string {
  const min = 100_000_000n;
  const range = 900_000_000n;
  const rand = BigInt(Math.floor(Math.random() * Number(range)));
  return String(min + rand);
}

function splitName(fullName: string): { firstName: string; lastName: string } {
  const parts = (fullName || '').trim().split(/\s+/);
  if (parts.length <= 1) return { firstName: parts[0] || '', lastName: '' };
  const lastName = parts.pop()!;
  return { firstName: parts.join(' '), lastName };
}

function mapStatus(thilinaStatus: string): string {
  const map: Record<string, string> = { ACTIVE: 'ACTIVE', INACTIVE: 'INACTIVE', PENDING: 'PENDING', OLD: 'FORMER' };
  return map[thilinaStatus] ?? 'ACTIVE';
}

function fmt(d: Date | null | undefined): string | null {
  if (!d) return null;
  const dt = d instanceof Date ? d : new Date(d as any);
  return isNaN(dt.getTime()) ? null : dt.toISOString().replace('T', ' ').replace('Z', '').substring(0, 19);
}

async function main() {
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('  STEP 2 — Migrate Users');
  console.log('═══════════════════════════════════════════════════════════\n');

  const state = loadState();
  const { instituteId } = state;
  if (!instituteId) { console.error('❌ instituteId missing in state. Run step1 first.'); process.exit(1); }
  console.log(`   Institute ID : ${instituteId}`);
  console.log(`   Passwords    : Thilina bcrypt hash reused as-is (legacy fallback in comparePasswordFull)\n`);

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
    const [thiUsers] = await thiDB.execute<mysql.RowDataPacket[]>(
      `SELECT
         u.id          AS t_user_id,
         u.email,
         u.password,
         p.fullName    AS full_name,
         p.avatarUrl   AS avatar_url,
         p.address,
         p.phone,
         p.whatsappPhone   AS whatsapp_phone,
         p.school,
         p.dateOfBirth     AS date_of_birth,
         p.guardianName    AS guardian_name,
         p.guardianPhone   AS guardian_phone,
         p.relationship,
         p.occupation,
         p.gender,
         p.status,
         p.enrolledDate    AS enrolled_date,
         p.instituteId     AS td_user_code,
         p.barcodeId       AS barcode_id
       FROM User u
       LEFT JOIN Profile p ON p.userId = u.id
       WHERE u.role = 'STUDENT'`
    );
    console.log(`   Found ${thiUsers.length} students in Thilina DB\n`);

    const userIdMap: Record<string, string> = {};
    let created = 0, skipped = 0, linked = 0, noPassword = 0;
    const errors: string[] = [];

    for (const row of thiUsers) {
      const email = (row.email as string || '').trim().toLowerCase();
      if (!email) { skipped++; continue; }

      const now = fmt(new Date())!;
      let surUserId: string;

      // Thilina hash is stored ONLY in institute_user.institute_password (not in users.password).
      // Migrated students log in exclusively via institute login — no global system access.
      const thilinaHash = (row.password as string || '').trim() || null;
      if (!thilinaHash) noPassword++;

      try {
        // ── Find or create global user ────────────────────────────────────────
        const [existing] = await surDB.execute<mysql.RowDataPacket[]>(
          'SELECT id FROM users WHERE email = ?', [email]
        );

        if (existing.length > 0) {
          surUserId = existing[0].id;
          // Keep existing password — don't overwrite a peppered hash with a legacy one
        } else {
          surUserId = randomUserId();
          const { firstName, lastName } = splitName(row.full_name as string || '');

          let dobStr: string | null = null;
          if (row.date_of_birth) {
            try { dobStr = fmt(new Date(row.date_of_birth)); } catch {}
          }

          const gender = row.gender === 'MALE' ? 'MALE' : row.gender === 'FEMALE' ? 'FEMALE' : null;

          await surDB.execute(
            `INSERT INTO users
               (id, first_name, last_name, email, password, user_type,
                phone_number, date_of_birth, gender, address_line1,
                is_active, is_phone_verified, is_email_verified,
                subscription_plan, profile_completion_status, profile_completion_percentage,
                first_login_completed, language, country,
                password_set_at, created_at, updated_at)
             VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
            [
              surUserId,
              firstName || null,
              lastName || null,
              email,
              null,            // password — NULL: no global login; institute_password is the only path
              'USER',
              row.phone || null,
              dobStr,
              gender,
              row.address || null,
              true, false, false,
              'FREE', 'INCOMPLETE', 0,
              false, 'E', 'Sri Lanka',
              null,            // password_set_at — NULL since no global password is set
              now, now,
            ]
          );
          created++;
        }

        userIdMap[row.t_user_id as string] = surUserId;

        // ── Build extra_data ──────────────────────────────────────────────────
        const extraData: Record<string, string> = {};
        if (row.whatsapp_phone) extraData['whatsapp_phone'] = String(row.whatsapp_phone);
        if (row.school) extraData['school'] = String(row.school);
        if (row.guardian_name) extraData['guardian_name'] = String(row.guardian_name);
        if (row.guardian_phone) extraData['guardian_phone'] = String(row.guardian_phone);
        if (row.relationship) extraData['guardian_relationship'] = String(row.relationship);
        if (row.occupation) extraData['occupation'] = String(row.occupation);

        const enrolledAt = row.enrolled_date ? fmt(new Date(row.enrolled_date)) : now;
        const iuStatus = mapStatus(row.status as string);

        // ── Upsert institute_user ─────────────────────────────────────────────
        // institute_password = same Thilina hash — comparePasswordFull legacy fallback accepts it
        // institute_card_id  = barcodeId (used for RFID/barcode scanning)
        // COALESCE: don't overwrite if the user has already set a peppered password
        await surDB.execute(
          `INSERT INTO institute_user
             (institute_id, user_id, user_id_institue, institute_card_id,
              institute_password, institute_password_set_at,
              status, institute_user_type, image_verification_status,
              institute_user_image_url, extra_data, created_at, updated_at)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
           ON DUPLICATE KEY UPDATE
             user_id_institue          = VALUES(user_id_institue),
             institute_card_id         = VALUES(institute_card_id),
             institute_password        = COALESCE(institute_password, VALUES(institute_password)),
             institute_password_set_at = COALESCE(institute_password_set_at, VALUES(institute_password_set_at)),
             status                    = VALUES(status),
             extra_data                = VALUES(extra_data),
             institute_user_image_url  = VALUES(institute_user_image_url),
             updated_at                = VALUES(updated_at)`,
          [
            instituteId,
            surUserId,
            row.td_user_code || null,   // user_id_institue (institute index number)
            row.barcode_id || null,      // institute_card_id (barcode on physical card)
            thilinaHash,                 // institute_password (legacy hash, auto-upgraded on login)
            thilinaHash ? now : null,    // institute_password_set_at
            iuStatus,
            'STUDENT',
            'PENDING',
            row.avatar_url || null,
            Object.keys(extraData).length > 0 ? JSON.stringify(extraData) : null,
            enrolledAt,
            now,
          ]
        );
        linked++;

      } catch (err: any) {
        errors.push(`  ${email}: ${err.message}`);
        skipped++;
      }
    }

    saveState({ userIdMap });

    console.log('═══════════════════════════════════════════════════════════');
    console.log('  STEP 2 COMPLETE ✅');
    console.log('═══════════════════════════════════════════════════════════');
    console.log(`  Total students       : ${thiUsers.length}`);
    console.log(`  Created (new)        : ${created}`);
    console.log(`  Already existed      : ${thiUsers.length - created - skipped}`);
    console.log(`  Linked to institute  : ${linked}`);
    console.log(`  No password in src   : ${noPassword}`);
    console.log(`  Skipped/errors       : ${skipped}`);
    console.log('');
    console.log('  ℹ  Students log in with their original Thilina LMS password.');
    console.log('  ℹ  Hash is auto-upgraded to peppered format on first login.');
    if (errors.length > 0) {
      console.log('\n  Errors:');
      errors.slice(0, 10).forEach(e => console.log('  ' + e));
      if (errors.length > 10) console.log(`  ... and ${errors.length - 10} more`);
    }
    console.log('\n  → Run STEP 3 next: npx ts-node -r tsconfig-paths/register scripts/step3-migrate-classes.ts\n');

  } finally {
    await surDB.end();
    await thiDB.end();
  }
}

main().catch(err => { console.error('❌ FAILED:', err); process.exit(1); });
