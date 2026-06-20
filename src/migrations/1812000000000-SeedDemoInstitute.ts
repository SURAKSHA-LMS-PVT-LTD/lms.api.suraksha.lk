import { MigrationInterface, QueryRunner } from 'typeorm';
import * as bcrypt from 'bcrypt';

/**
 * SEED: Demo institute with mock users / students / parents / classes / subjects /
 * enrollments / attendance — for demonstrations.
 *
 * Everything is tagged to a fixed demo institute id and a reserved user-id range,
 * so down() removes EXACTLY this data and nothing else. Safe to run on a dev DB.
 *
 * Login: every demo account uses the same password (see DEMO_PASSWORD), hashed at
 * runtime with the app's BCRYPT_PEPPER + BCRYPT_SALT_ROUNDS so real login works.
 *
 *   Admin    : demo.admin@suraksha.demo
 *   Teachers : demo.teacher1@ / demo.teacher2@ suraksha.demo
 *   Students : demo.studentNN@suraksha.demo
 *   Parents  : demo.parentNN@suraksha.demo
 */
export class SeedDemoInstitute1812000000000 implements MigrationInterface {
  name = 'SeedDemoInstitute1812000000000';

  // ── Fixed identifiers so teardown is exact ──────────────────────────────────
  private readonly INST = 'de300000-0000-4000-8000-000000000001';
  private readonly UID_BASE = 990000000;      // reserved demo user-id range (990000001+)
  private readonly DEMO_PASSWORD = 'Demo@1234';

  // Deterministic class/subject UUIDs (demo-tagged prefix)
  private classId(n: number)   { return `dec10000-0000-4000-8000-0000000000${String(n).padStart(2, '0')}`; }
  private subjectId(n: number) { return `de500000-0000-4000-8000-0000000000${String(n).padStart(2, '0')}`; }

  public async up(qr: QueryRunner): Promise<void> {
    // Idempotency: if the demo institute already exists, skip.
    const existing = await qr.query(`SELECT id FROM institutes WHERE id = ?`, [this.INST]);
    if (existing.length > 0) {
      console.log('[SeedDemoInstitute] Demo institute already present — skipping.');
      return;
    }

    // Hash the shared demo password the same way the app does (password + pepper).
    const pepper = process.env.BCRYPT_PEPPER || '';
    const rounds = parseInt(process.env.BCRYPT_SALT_ROUNDS || '12', 10);
    const passwordHash = await bcrypt.hash(this.DEMO_PASSWORD + pepper, rounds);

    const now = 'NOW()';

    // ── 1. Institute ──────────────────────────────────────────────────────────
    await qr.query(
      `INSERT INTO institutes (id, name, short_name, code, email, is_active, is_default, type, tier, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 1, 0, 'tuition_institute', 'FREE', NOW(), NOW())`,
      [this.INST, 'Demo Academy (Mock)', 'DemoAcad', 'DEMO-INST-001', 'demo.institute@suraksha.demo'],
    );

    // ── 2. Classes (3) ──────────────────────────────────────────────────────────
    const classNames = ['Grade 10 - A', 'Grade 11 - B', 'Grade 12 - Science'];
    for (let i = 0; i < classNames.length; i++) {
      await qr.query(
        `INSERT INTO institute_classes (id, institute_id, name, code, class_type, academic_year, grade, is_active, created_at, updated_at)
         VALUES (?, ?, ?, ?, 'REGULAR', '2026', ?, 1, NOW(), NOW())`,
        [this.classId(i + 1), this.INST, classNames[i], `DEMO-CLS-${i + 1}`, 10 + i],
      );
    }

    // ── 3. Subjects (4) ──────────────────────────────────────────────────────────
    const subjectNames = ['Mathematics', 'Science', 'English', 'History'];
    for (let i = 0; i < subjectNames.length; i++) {
      await qr.query(
        `INSERT INTO subjects (id, institute_id, code, name, subject_type, is_active, created_at, updated_at)
         VALUES (?, ?, ?, ?, 'MAIN', 1, NOW(), NOW())`,
        [this.subjectId(i + 1), this.INST, `DEMO-SUBJ-${i + 1}`, subjectNames[i]],
      );
    }

    // Helper to create a user + institute_user membership
    const districts = ['COLOMBO', 'GAMPAHA', 'KANDY', 'GALLE'];
    const provinces = ['WESTERN', 'WESTERN', 'CENTRAL', 'SOUTHERN'];
    const createUser = async (
      uid: number, first: string, last: string, email: string,
      userType: string, gender: string,
    ) => {
      const di = uid % districts.length;
      await qr.query(
        `INSERT INTO users
           (id, first_name, last_name, name_with_initials, email, password, phone_number,
            user_type, gender, district, province, country, is_active, subscription_plan,
            is_phone_verified, is_email_verified, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Sri Lanka', 1, 'FREE', 1, 1, NOW(), NOW())`,
        [uid, first, last, `${first[0]}. ${last}`, email, passwordHash,
         `07${String(10000000 + uid % 90000000).slice(0, 8)}`,
         userType, gender, districts[di], provinces[di]],
      );
    };
    const addMembership = async (
      uid: number, type: string, instituteUserId: string, status = 'ACTIVE',
    ) => {
      await qr.query(
        `INSERT INTO institute_user
           (institute_id, user_id, user_id_institue, status, institute_user_type, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, NOW(), NOW())`,
        [this.INST, uid, instituteUserId, status, type],
      );
    };

    // ── 4. Institute admin ──────────────────────────────────────────────────────
    const adminUid = this.UID_BASE + 1;
    await createUser(adminUid, 'Demo', 'Admin', 'demo.admin@suraksha.demo', 'USER', 'MALE');
    await addMembership(adminUid, 'INSTITUTE_ADMIN', 'DEMO-ADM-001');

    // ── 5. Teachers (2) ──────────────────────────────────────────────────────────
    const teacherUids: number[] = [];
    for (let t = 1; t <= 2; t++) {
      const uid = this.UID_BASE + 10 + t;
      teacherUids.push(uid);
      await createUser(uid, `Teacher${t}`, 'Demo', `demo.teacher${t}@suraksha.demo`, 'USER', t === 1 ? 'FEMALE' : 'MALE');
      await addMembership(uid, 'TEACHER', `DEMO-TCH-${t}`);
    }
    // Assign teacher 1 as class teacher of class 1
    await qr.query(`UPDATE institute_classes SET class_teacher_id = ? WHERE id = ?`, [teacherUids[0], this.classId(1)]);

    // ── 6. Students (30) + parents + enrollments ─────────────────────────────────
    const firstNames = ['Nimal', 'Kamala', 'Sunil', 'Anoma', 'Ruwan', 'Dilini', 'Kasun', 'Sanduni',
      'Tharindu', 'Hashini', 'Pasan', 'Ishara', 'Chamod', 'Nethmi', 'Sahan'];
    const lastNames = ['Perera', 'Silva', 'Fernando', 'Jayawardena', 'Bandara', 'Wickrama', 'Rathnayake', 'Gunasekara'];
    const bloodGroups = ['A+', 'B+', 'O+', 'AB+', 'A-', 'O-'];

    const studentUids: { uid: number; classId: string }[] = [];
    for (let s = 1; s <= 30; s++) {
      const sUid = this.UID_BASE + 100 + s;
      const pUid = this.UID_BASE + 500 + s; // parent
      const first = firstNames[s % firstNames.length];
      const last = lastNames[s % lastNames.length];
      const cls = this.classId((s % 3) + 1);

      // student user
      await createUser(sUid, first, last, `demo.student${s}@suraksha.demo`, 'USER', s % 2 ? 'MALE' : 'FEMALE');
      // parent user (USER_WITHOUT_STUDENT = parent-only role)
      await createUser(pUid, `Parent${s}`, last, `demo.parent${s}@suraksha.demo`, 'USER_WITHOUT_STUDENT', s % 2 ? 'FEMALE' : 'MALE');

      // parents row
      await qr.query(
        `INSERT INTO parents (user_id, occupation, is_active, created_at, updated_at)
         VALUES (?, ?, 1, NOW(), NOW())`,
        [pUid, ['ENGINEER', 'DOCTOR', 'TEACHER', 'BUSINESS_OWNER', 'FARMER'][s % 5]],
      );

      // students row (link parent as father or mother)
      const isFather = s % 2 === 1;
      await qr.query(
        `INSERT INTO students (user_id, father_id, mother_id, student_id, blood_group, is_active, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 1, NOW(), NOW())`,
        [sUid, isFather ? pUid : null, isFather ? null : pUid, `DEMO-STU-${String(s).padStart(3, '0')}`, bloodGroups[s % bloodGroups.length]],
      );

      // institute memberships
      await addMembership(sUid, 'STUDENT', `DEMO-S-${String(s).padStart(3, '0')}`);
      await addMembership(pUid, 'PARENT', `DEMO-P-${String(s).padStart(3, '0')}`);

      // class enrollment
      await qr.query(
        `INSERT INTO institute_class_students (institute_id, institute_class_id, student_user_id, is_active, is_verified, created_at, updated_at)
         VALUES (?, ?, ?, 1, 1, NOW(), NOW())`,
        [this.INST, cls, sUid],
      );

      studentUids.push({ uid: sUid, classId: cls });
    }

    // ── 7. Attendance — last 14 days, weekdays only ──────────────────────────────
    // status: 0=Absent 1=Present 2=Late
    const today = new Date();
    let attCount = 0;
    for (let d = 13; d >= 0; d--) {
      const day = new Date(today);
      day.setDate(today.getDate() - d);
      const dow = day.getDay();
      if (dow === 0 || dow === 6) continue; // skip weekends
      const dateStr = day.toISOString().split('T')[0];

      for (const stu of studentUids) {
        // ~85% present, ~8% late, ~7% absent — deterministic-ish by uid+day
        const r = (stu.uid + d) % 100;
        const status = r < 85 ? 1 : r < 93 ? 2 : 0;
        // dynamo_pk/sk are NOT NULL with a unique constraint — build deterministic,
        // unique keys per (institute, student, date). timestamp is epoch ms (bigint).
        const ts = day.getTime();
        const dynamoPk = `INST#${this.INST}`;
        const dynamoSk = `ATT#${stu.uid}#${dateStr}#${stu.classId}`;
        await qr.query(
          `INSERT INTO attendance_records
             (institute_id, student_id, class_id, date, status, timestamp, dynamo_pk, dynamo_sk,
              marking_method, user_type, sync_status, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'MANUAL', 'STUDENT', 'SYNCED', NOW())`,
          [this.INST, String(stu.uid), stu.classId, dateStr, status, ts, dynamoPk, dynamoSk],
        );
        attCount++;
      }
    }

    console.log(
      `[SeedDemoInstitute] Done. institute=${this.INST}, 1 admin, 2 teachers, 30 students, 30 parents, ` +
      `3 classes, 4 subjects, ${attCount} attendance rows. Password for all demo accounts: ${this.DEMO_PASSWORD}`,
    );
  }

  public async down(qr: QueryRunner): Promise<void> {
    // Delete in FK-safe order. Everything is scoped to the demo institute / reserved uid range.
    const uidLow = this.UID_BASE;
    const uidHigh = this.UID_BASE + 1000;

    await qr.query(`DELETE FROM attendance_records WHERE institute_id = ?`, [this.INST]);
    await qr.query(`DELETE FROM institute_class_students WHERE institute_id = ?`, [this.INST]);
    await qr.query(`DELETE FROM students WHERE user_id > ? AND user_id < ?`, [uidLow, uidHigh]);
    await qr.query(`DELETE FROM parents WHERE user_id > ? AND user_id < ?`, [uidLow, uidHigh]);
    await qr.query(`DELETE FROM institute_user WHERE institute_id = ?`, [this.INST]);
    await qr.query(`DELETE FROM subjects WHERE institute_id = ?`, [this.INST]);
    await qr.query(`DELETE FROM institute_classes WHERE institute_id = ?`, [this.INST]);
    await qr.query(`DELETE FROM users WHERE id > ? AND id < ?`, [uidLow, uidHigh]);
    await qr.query(`DELETE FROM institutes WHERE id = ?`, [this.INST]);

    console.log('[SeedDemoInstitute] Demo data removed.');
  }
}
