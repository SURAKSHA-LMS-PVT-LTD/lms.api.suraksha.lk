/**
 * STEP 1 — Create ThilinaDhananjaya institute + link admin
 *
 * Run:
 *   npx ts-node -r tsconfig-paths/register scripts/step1-create-institute.ts
 *
 * What it does:
 *   1. Creates an institute record for "Thilina Dhananjaya"
 *   2. Creates/finds the admin user (kapilakarunarathna056@gmail.com)
 *   3. Links admin as INSTITUTE_ADMIN on that institute
 *   4. Saves institute UUID to scripts/migration-state.json for next steps
 */

import * as mysql from 'mysql2/promise';
import * as bcrypt from 'bcrypt';
import { v4 as uuidv4 } from 'uuid';
import { config } from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';

config({ path: path.resolve(__dirname, '../.env') });

const STATE_FILE = path.resolve(__dirname, 'migration-state.json');

function loadState(): Record<string, any> {
  if (fs.existsSync(STATE_FILE)) return JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8'));
  return {};
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

function fmt(d: Date): string {
  return d.toISOString().replace('T', ' ').replace('Z', '').substring(0, 19);
}

async function main() {
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('  STEP 1 — Create Institute + Admin');
  console.log('═══════════════════════════════════════════════════════════\n');

  const db = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE,
    charset: 'utf8mb4',
    supportBigNumbers: true,
    bigNumberStrings: true,
  });
  console.log('✅ Connected to Suraksha DB\n');

  const ADMIN_EMAIL = 'kapilakarunarathna056@gmail.com';
  const INSTITUTE_CODE = 'TD';
  const now = fmt(new Date());

  try {
    // ── Create or find institute ──────────────────────────────────────
    let instituteId: string;
    const [existingInst] = await db.execute<mysql.RowDataPacket[]>(
      'SELECT id FROM institutes WHERE code = ?', [INSTITUTE_CODE]
    );

    if (existingInst.length > 0) {
      instituteId = existingInst[0].id;
      console.log(`⚠️  Institute already exists (code=${INSTITUTE_CODE})`);
      console.log(`   ID: ${instituteId}\n`);
    } else {
      instituteId = uuidv4();

      const extraSchema = JSON.stringify([
        { key: 'whatsapp_phone', label: 'WhatsApp Phone', type: 'phone', applicableTo: ['Student'] },
        { key: 'school', label: 'School', type: 'text', applicableTo: ['Student'] },
        { key: 'guardian_name', label: 'Guardian Name', type: 'text', applicableTo: ['Student'] },
        { key: 'guardian_phone', label: 'Guardian Phone', type: 'phone', applicableTo: ['Student'] },
        { key: 'guardian_relationship', label: 'Guardian Relationship', type: 'select',
          options: ['Father', 'Mother', 'Guardian', 'Sibling', 'Other'], applicableTo: ['Student'] },
        { key: 'occupation', label: 'Occupation', type: 'text', applicableTo: ['Student'] },
      ]);

      await db.execute(
        `INSERT INTO institutes
           (id, name, short_name, code, email, type, tier, subdomain,
            is_active, is_default,
            is_session_limit_enabled, default_sessions_per_user_count, is_strict_session_limit,
            custom_login_enabled, login_background_type,
            is_visible_in_app, is_visible_in_web_selector,
            powered_by_visible, allow_user_photo_upload,
            user_extra_data_schema,
            created_at, updated_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [
          instituteId,
          'Thilina Dhananjaya',
          'TD',
          INSTITUTE_CODE,
          'admin@thilinadhananjaya.lk',
          'tuition_institute',
          'PROFESSIONAL',
          'thilinadhananjaya',
          true, false,
          false, 1, false,
          false, 'COLOR',
          true, true,
          true, true,
          extraSchema,
          now, now,
        ]
      );
      console.log(`✅ Institute created`);
      console.log(`   ID       : ${instituteId}`);
      console.log(`   Name     : Thilina Dhananjaya`);
      console.log(`   Code     : ${INSTITUTE_CODE}`);
      console.log(`   Subdomain: thilinadhananjaya\n`);
    }

    // ── Create or find admin user ────────────────────────────────────
    let adminUserId: string;
    const [existingAdmin] = await db.execute<mysql.RowDataPacket[]>(
      'SELECT id FROM users WHERE email = ?', [ADMIN_EMAIL.toLowerCase()]
    );

    if (existingAdmin.length > 0) {
      adminUserId = existingAdmin[0].id;
      console.log(`⚠️  Admin user already exists`);
      console.log(`   ID   : ${adminUserId}`);
      console.log(`   Email: ${ADMIN_EMAIL}\n`);
    } else {
      adminUserId = randomUserId();
      const hash = await bcrypt.hash('Thilina@2026', 12);

      await db.execute(
        `INSERT INTO users
           (id, first_name, last_name, email, password, user_type,
            is_active, is_phone_verified, is_email_verified,
            subscription_plan, profile_completion_status, profile_completion_percentage,
            first_login_completed, language, country,
            password_set_at, created_at, updated_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [
          adminUserId,
          'Kapila', 'Karunarathna',
          ADMIN_EMAIL.toLowerCase(),
          hash,
          'INSTITUTE_ADMIN',
          true, false, false,
          'FREE', 'INCOMPLETE', 0,
          false, 'ENGLISH', 'SRI_LANKA',
          now, now, now,
        ]
      );
      console.log(`✅ Admin user created`);
      console.log(`   ID       : ${adminUserId}`);
      console.log(`   Email    : ${ADMIN_EMAIL}`);
      console.log(`   Password : Thilina@2026  ← change this immediately!\n`);
    }

    // ── Link admin to institute ──────────────────────────────────────
    const [existingLink] = await db.execute<mysql.RowDataPacket[]>(
      'SELECT 1 FROM institute_user WHERE institute_id = ? AND user_id = ?',
      [instituteId, adminUserId]
    );

    if (existingLink.length > 0) {
      console.log(`⚠️  Admin already linked to institute\n`);
    } else {
      await db.execute(
        `INSERT INTO institute_user
           (institute_id, user_id, status, institute_user_type,
            image_verification_status, created_at, updated_at)
         VALUES (?,?,?,?,?,?,?)`,
        [instituteId, adminUserId, 'ACTIVE', 'INSTITUTE_ADMIN', 'PENDING', now, now]
      );
      console.log(`✅ Admin linked as INSTITUTE_ADMIN\n`);
    }

    // ── Save state ───────────────────────────────────────────────────
    saveState({ instituteId, adminUserId, adminEmail: ADMIN_EMAIL });

    console.log('═══════════════════════════════════════════════════════════');
    console.log('  STEP 1 COMPLETE ✅');
    console.log('═══════════════════════════════════════════════════════════');
    console.log(`  Institute ID : ${instituteId}`);
    console.log(`  Admin ID     : ${adminUserId}`);
    console.log(`  State saved  : scripts/migration-state.json`);
    console.log('\n  → Run STEP 2 next: npx ts-node -r tsconfig-paths/register scripts/step2-migrate-users.ts\n');

  } finally {
    await db.end();
  }
}

main().catch(err => { console.error('❌ FAILED:', err); process.exit(1); });
