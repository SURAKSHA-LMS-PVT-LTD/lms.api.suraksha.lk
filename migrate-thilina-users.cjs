'use strict';
/**
 * Thilina → Suraksha migration (v3)
 *
 * The previous migration already created:
 *   - 432 empty user records (IDs 3-434, no email/name/password)
 *   - institute_user rows linking those users to Thilina institute (434 total)
 *   - institute_class_students rows (418 total)
 *
 * This script:
 *   1. UPDATE existing empty user records with actual email/name/phone/password
 *      by matching on barcodeId stored in institute_user.extra_data
 *   2. For any source students NOT yet in target (new ones), INSERT them
 *   3. Create institute_user if missing
 *   4. Create institute_class_students if missing
 *   5. Migrate all 40 source Recordings → subject_recordings
 */

require('dotenv').config();
const mysql = require('mysql2/promise');
const bcrypt = require('bcrypt');

const SRC = {
  host: '34.42.163.47', port: 3306,
  user: 'root', password: 'Skaveesha1355660@',
  database: 'thilinadhananjaya_lms',
  ssl: { rejectUnauthorized: false },
  connectTimeout: 15000,
};
const TGT = {
  host: process.env.DB_HOST,
  port: +(process.env.DB_PORT || 3306),
  user: process.env.DB_USERNAME,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_DATABASE,
  connectTimeout: 15000,
};

const THI_ID = '6e09518a-89ac-47e1-8961-326b5fd5fc9c';

const CLASS_MAP = {
  // Thilina (inst-td-001)
  'd9438d82-8e72-42be-853f-46b8877377d4': '0a61e43b-5011-436a-9626-cc24076a3872',
  '7675c9ef-2a66-47f7-94d0-1e3564b88441': 'e162555c-20b5-4965-8f09-0c930a5fdac3',
  '2a2cbbe9-7eb5-4a2f-b78d-9cbdee342a9d': 'a79eed1b-18b0-41b3-8f99-0b81233c5079',
  '36b5e873-198b-4467-9eb3-9f9e8a1855bf': '4f051c64-05c7-4b08-a522-3c79e752fd07',
  'ac24d52c-e602-4507-a668-370a2a39e22d': '9e397c30-ef43-4729-9eac-c345442a9f61',
  // WINS (ba1485bc)
  '085e6528-db3b-489a-80b8-97133d6aa7cf': '29c42a3e-0ba3-4b74-9ccd-e03723d41ad8',
  '5f6c0676-f493-49b5-ba05-9c731c834c4c': 'e4dd366b-4009-4473-975b-2e8d0e4f4e1f',
  '6271348d-06d5-4cff-a3c8-3287251eded5': '73e28239-5f63-4f59-b930-094dd693490e',
  'cf4fc091-86f5-4850-bdd6-f27223599d81': '4b0e5e92-94ff-47dd-ba55-a4888b1c5790',
  // Sihasma (c0d6b894)
  '797fd98f-815e-488d-ac88-e33afcdb3b10': '9b01a145-0566-4179-a4f2-95ccd8a92d2f',
};

async function q(c, sql, p) {
  try { const [r] = await c.query(sql, p || []); return r; }
  catch (e) { console.error('QUERY ERROR:', e.message); throw e; }
}

function splitName(fullName) {
  if (!fullName) return { first: 'Unknown', last: '' };
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 1) return { first: parts[0], last: '' };
  return { first: parts[0], last: parts.slice(1).join(' ') };
}

(async () => {
  let src;
  try { src = await mysql.createConnection(SRC); }
  catch (e) { src = await mysql.createConnection({ ...SRC, ssl: undefined }); }
  console.log('[ok] src connected');
  const tgt = await mysql.createConnection(TGT);
  console.log('[ok] tgt connected');

  // ─── Load source data ─────────────────────────────────────────────────────
  console.log('\n=== Loading source data ===');

  const srcStudents = await q(src, 'SELECT * FROM `User` WHERE role = "STUDENT" ORDER BY email');
  console.log(`  Source students: ${srcStudents.length}`);

  const srcAdmin = (await q(src, 'SELECT * FROM `User` WHERE role = "ADMIN" LIMIT 1'))[0];

  const srcProfiles = await q(src, 'SELECT * FROM Profile');
  const profileByUserId = {};
  const profileByBarcodeId = {};
  for (const p of srcProfiles) {
    profileByUserId[p.userId] = p;
    if (p.barcodeId) profileByBarcodeId[p.barcodeId] = p;
  }
  console.log(`  Source profiles: ${srcProfiles.length}`);

  const srcEnrollments = await q(src, 'SELECT * FROM Enrollment');
  console.log(`  Source enrollments: ${srcEnrollments.length}`);

  const srcMonths = await q(src, 'SELECT id, classId FROM Month');
  const monthToClass = {};
  for (const m of srcMonths) monthToClass[m.id] = m.classId;

  const srcRecordings = await q(src, 'SELECT * FROM Recording ORDER BY monthId, title');
  console.log(`  Source recordings: ${srcRecordings.length}`);

  // ─── Load target state ────────────────────────────────────────────────────
  console.log('\n=== Loading target state ===');

  // All existing users
  const tgtUsers = await q(tgt, 'SELECT id, email, first_name, last_name FROM users ORDER BY id');
  const emailToUserId = {};
  const emptyUserIds = []; // users without email (from previous migration)
  for (const u of tgtUsers) {
    if (u.email) emailToUserId[u.email.toLowerCase()] = u.id;
    else emptyUserIds.push(u.id);
  }
  console.log(`  Target users total: ${tgtUsers.length} (${emptyUserIds.length} without email)`);

  // Load institute_user with extra_data for barcodeId matching
  const iuRows = await q(tgt, 'SELECT user_id, institute_user_type, extra_data FROM institute_user WHERE institute_id=?', [THI_ID]);
  const existingIU = new Set();
  // Map barcodeId → existing empty user_id
  const barcodeToUserId = {};
  for (const iu of iuRows) {
    existingIU.add(iu.user_id);
    if (iu.extra_data) {
      const ed = typeof iu.extra_data === 'string' ? JSON.parse(iu.extra_data) : iu.extra_data;
      if (ed.barcodeId) barcodeToUserId[ed.barcodeId] = iu.user_id;
    }
  }
  console.log(`  Existing institute_user: ${existingIU.size}`);
  console.log(`  BarcodeId mappings found: ${Object.keys(barcodeToUserId).length}`);

  const csRows = await q(tgt, 'SELECT student_user_id, institute_class_id FROM institute_class_students WHERE institute_id=?', [THI_ID]);
  const existingCS = new Set();
  for (const r of csRows) existingCS.add(`${r.student_user_id}:${r.institute_class_id}`);
  console.log(`  Existing class_students: ${existingCS.size}`);

  // Hash password
  console.log('\n=== Hashing default password ===');
  const hashedDefault = await bcrypt.hash('Thilina@2024', 12);
  console.log('  Done');

  // ─── STEP 1: Update existing empty users + handle new students ────────────
  console.log('\n=== STEP 1: Update users with actual data ===');

  let updatedUsers = 0, newUsers = 0, skippedUsers = 0;
  // srcUserId → targetUserId mapping for enrollment step
  const srcToTgt = {};

  // Get next available ID (max + 1000 to avoid conflicts)
  const maxIdResult = await q(tgt, 'SELECT MAX(id) AS mx FROM users');
  let nextId = (maxIdResult[0].mx || 0) + 1;
  // If max is very large (like 990000530 from seeded data), use a safe counter
  // We'll keep IDs sequential from current max+1
  if (nextId > 900000000) nextId = emptyUserIds.length + 1000; // safe fallback

  for (const su of srcStudents) {
    const email = (su.email || '').toLowerCase().trim();
    const profile = profileByUserId[su.id];
    const barcodeId = profile?.barcodeId || null;
    const fullName = profile?.fullName || '';
    const { first, last } = splitName(fullName);
    const phone = profile?.phone || profile?.whatsappPhone || null;
    const school = profile?.school || null;
    const guardianName = profile?.guardianName || null;
    const guardianPhone = profile?.guardianPhone || null;
    const dob = profile?.dateOfBirth ? new Date(profile.dateOfBirth) : null;
    const gender = profile?.gender ? profile.gender.toUpperCase() : null;
    const avatarUrl = profile?.avatarUrl || null;

    let targetUserId = null;

    // Priority 1: match by email
    if (email && emailToUserId[email]) {
      targetUserId = emailToUserId[email];
      skippedUsers++;
    }
    // Priority 2: match by barcodeId (previous migration stored it in extra_data)
    else if (barcodeId && barcodeToUserId[barcodeId]) {
      targetUserId = barcodeToUserId[barcodeId];
      // Update this empty user with actual data
      const now = new Date();
      await q(tgt, `
        UPDATE users SET
          email=?, password=?, first_name=?, last_name=?,
          phone_number=?, date_of_birth=?, gender=?, image_url=?,
          is_phone_verified=0, is_email_verified=0,
          profile_completion_status='BASIC', profile_completion_percentage=30,
          updated_at=?
        WHERE id=? AND (email IS NULL OR email='')
      `, [
        email || null, hashedDefault, first, last || null,
        phone, dob ? dob.toISOString().slice(0, 10) : null,
        gender, avatarUrl, now, targetUserId,
      ]);
      if (email) emailToUserId[email] = targetUserId;
      updatedUsers++;
    }
    // Priority 3: create new user
    else {
      // Check one more time by email in case it was just added
      if (email && emailToUserId[email]) {
        targetUserId = emailToUserId[email];
        skippedUsers++;
      } else {
        const now = new Date();
        const newId = nextId++;
        await q(tgt, `
          INSERT INTO users (
            id, email, password, first_name, last_name, phone_number,
            user_type, date_of_birth, gender, image_url,
            is_active, is_phone_verified, is_email_verified,
            profile_completion_status, profile_completion_percentage,
            first_login_completed, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, 'USER', ?, ?, ?, 1, 0, 0, 'BASIC', 30, 0, ?, ?)
        `, [
          newId, email || null, hashedDefault,
          first, last || null, phone,
          dob ? dob.toISOString().slice(0, 10) : null,
          gender, avatarUrl, now, now,
        ]);
        targetUserId = newId;
        if (email) emailToUserId[email] = targetUserId;
        newUsers++;
      }
    }

    srcToTgt[su.id] = targetUserId;

    // Ensure user exists in students table (FK requirement for institute_class_students)
    await q(tgt, `INSERT IGNORE INTO students (user_id, is_active, created_at, updated_at) VALUES (?, 1, NOW(), NOW())`, [targetUserId]);

    // Update institute_user extra_data + set institute_card_id = barcodeId
    if (targetUserId && existingIU.has(targetUserId)) {
      const extraData = JSON.stringify({
        school, barcodeId, guardianName, guardianPhone,
        sourceUserId: su.id,
        migratedAt: new Date().toISOString(),
      });
      const cardId = barcodeId || String(targetUserId);
      await q(tgt, `UPDATE institute_user SET extra_data=?, institute_card_id=?, updated_at=NOW() WHERE user_id=? AND institute_id=?`,
        [extraData, cardId, targetUserId, THI_ID]);
    } else if (targetUserId && !existingIU.has(targetUserId)) {
      // Create institute_user
      const extraData = JSON.stringify({ school, barcodeId, guardianName, guardianPhone, sourceUserId: su.id });
      const now = new Date();
      const cardId2 = barcodeId || String(targetUserId);
      await q(tgt, `
        INSERT INTO institute_user (user_id, institute_id, institute_user_type, status, institute_card_id, extra_data, created_at, updated_at)
        VALUES (?, ?, 'STUDENT', 'ACTIVE', ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE status='ACTIVE', institute_card_id=VALUES(institute_card_id), extra_data=VALUES(extra_data), updated_at=VALUES(updated_at)
      `, [targetUserId, THI_ID, cardId2, extraData, now, now]);
      existingIU.add(targetUserId);
    }
  }

  console.log(`  Updated existing: ${updatedUsers}, New: ${newUsers}, Already had email: ${skippedUsers}`);

  // ─── STEP 1b: Admin user ─────────────────────────────────────────────────
  if (srcAdmin) {
    const adminEmail = (srcAdmin.email || '').toLowerCase();
    let adminId = emailToUserId[adminEmail];
    if (!adminId) {
      const newId = nextId++;
      const now = new Date();
      await q(tgt, `
        INSERT INTO users (id, email, password, first_name, last_name, user_type,
          is_active, is_phone_verified, is_email_verified,
          profile_completion_status, profile_completion_percentage,
          first_login_completed, created_at, updated_at)
        VALUES (?, ?, ?, 'Thilina', 'Dhananjaya', 'USER', 1, 0, 1, 'BASIC', 60, 0, ?, ?)
      `, [newId, adminEmail, hashedDefault, now, now]);
      adminId = newId;
      emailToUserId[adminEmail] = adminId;
      console.log(`  Created admin user id=${adminId}`);
    }
    await q(tgt, `
      INSERT INTO institute_user (user_id, institute_id, institute_user_type, status, created_at, updated_at)
      VALUES (?, ?, 'INSTITUTE_ADMIN', 'ACTIVE', NOW(), NOW())
      ON DUPLICATE KEY UPDATE institute_user_type='INSTITUTE_ADMIN', status='ACTIVE', updated_at=NOW()
    `, [adminId, THI_ID]);
    console.log(`  Admin (${adminEmail}) set as INSTITUTE_ADMIN`);
  }

  // ─── STEP 2: Enrollments → institute_class_students ──────────────────────
  console.log('\n=== STEP 2: Enrollments → class_students ===');
  let createdCS = 0, skippedCS = 0, unmappedCS = 0;

  for (const en of srcEnrollments) {
    const tgtClassId = CLASS_MAP[en.classId];
    if (!tgtClassId) { unmappedCS++; continue; }

    const tgtUserId = srcToTgt[en.userId];
    if (!tgtUserId) { console.warn(`  WARN: no target user for src ${en.userId}`); continue; }

    const csKey = `${tgtUserId}:${tgtClassId}`;
    if (existingCS.has(csKey)) { skippedCS++; continue; }

    const studentType = en.paymentType === 'FREE' ? 'free_card' :
                        en.paymentType === 'HALF' ? 'half_paid' : 'paid';
    const now = new Date();
    const extraData = JSON.stringify({ srcEnrollmentId: en.id, srcClassId: en.classId });
    await q(tgt, `
      INSERT INTO institute_class_students (
        student_user_id, institute_class_id, institute_id,
        is_active, is_verified, enrollment_method, enrollment_reason,
        student_type, extra_data, created_at, updated_at
      ) VALUES (?, ?, ?, 1, 1, 'MIGRATED', 'Migrated from Thilina LMS', ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE is_active=1, is_verified=1, student_type=VALUES(student_type), updated_at=VALUES(updated_at)
    `, [tgtUserId, tgtClassId, THI_ID, studentType, extraData, now, now]);
    existingCS.add(csKey);
    createdCS++;
  }

  console.log(`  Created: ${createdCS}, Skipped: ${skippedCS}, Unmapped class: ${unmappedCS}`);

  // ─── STEP 3: Recordings → subject_recordings ─────────────────────────────
  console.log('\n=== STEP 3: Recordings → subject_recordings ===');

  const existingRecIds = new Set();
  const existingRecRows = await q(tgt,
    'SELECT rec_url_id FROM subject_recordings WHERE institute_id=? AND rec_url_id IS NOT NULL',
    [THI_ID]);
  for (const r of existingRecRows) existingRecIds.add(r.rec_url_id);
  console.log(`  Already in target: ${existingRecIds.size}`);

  let createdRecs = 0, skippedRecs = 0, noMapRecs = 0;

  for (const rec of srcRecordings) {
    if (existingRecIds.has(rec.id)) { skippedRecs++; continue; }

    const srcClassId = monthToClass[rec.monthId];
    if (!srcClassId) { noMapRecs++; continue; }
    const tgtClassId = CLASS_MAP[srcClassId];
    if (!tgtClassId) { console.warn(`  WARN: no class map for ${srcClassId} (${rec.title})`); noMapRecs++; continue; }

    const now = new Date();
    await q(tgt, `
      INSERT INTO subject_recordings (
        institute_id, class_id, subject_id,
        title, description, platform, recording_url,
        thumbnail_url, status, is_active,
        rec_attendance_enabled, rec_url_id, rec_access_level,
        welcome_message_enabled, welcome_message_text,
        created_at, updated_at
      ) VALUES (?, ?, NULL, ?, ?, 'YOUTUBE', ?, ?, 'published', 1, 1, ?, 'ENROLLED_ONLY', ?, ?, ?, ?)
    `, [
      THI_ID, tgtClassId,
      rec.title || 'Untitled',
      rec.description || null,
      rec.videoUrl || null,
      rec.thumbnail || null,
      rec.id,  // source rec id as rec_url_id for idempotency
      rec.welcomeMessage ? 1 : 0,
      rec.welcomeMessage || null,
      rec.createdAt ? new Date(rec.createdAt) : now,
      now,
    ]);
    existingRecIds.add(rec.id);
    createdRecs++;
  }

  console.log(`  Created: ${createdRecs}, Skipped: ${skippedRecs}, No map: ${noMapRecs}`);

  // ─── Final counts ─────────────────────────────────────────────────────────
  const [finalIU] = await q(tgt, 'SELECT COUNT(*) AS n FROM institute_user WHERE institute_id=?', [THI_ID]);
  const [finalCS] = await q(tgt, 'SELECT COUNT(*) AS n FROM institute_class_students WHERE institute_id=?', [THI_ID]);
  const [finalRec] = await q(tgt, 'SELECT COUNT(*) AS n FROM subject_recordings WHERE institute_id=?', [THI_ID]);

  console.log('\n=== FINAL COUNTS ===');
  console.log(`  institute_user: ${finalIU.n}`);
  console.log(`  class_students: ${finalCS.n}`);
  console.log(`  subject_recordings: ${finalRec.n}`);

  await src.end();
  await tgt.end();
  console.log('\n[done]');
})().catch(e => { console.error('FATAL:', e); process.exit(1); });
