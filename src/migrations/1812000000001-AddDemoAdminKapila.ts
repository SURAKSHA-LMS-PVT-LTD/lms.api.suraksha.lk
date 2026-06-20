import { MigrationInterface, QueryRunner } from 'typeorm';
import * as bcrypt from 'bcrypt';

/**
 * Adds a second institute admin (kapilakarunarathna056@gmail.com) to the demo
 * institute seeded by SeedDemoInstitute1812000000000.
 *
 * Login password: same shared demo password (Demo@1234), hashed with the app's
 * BCRYPT_PEPPER + BCRYPT_SALT_ROUNDS at runtime.
 */
export class AddDemoAdminKapila1812000000001 implements MigrationInterface {
  name = 'AddDemoAdminKapila1812000000001';

  private readonly INST = 'de300000-0000-4000-8000-000000000001';
  private readonly UID = 990000002;            // within the reserved demo uid range
  private readonly EMAIL = 'kapilakarunarathna056@gmail.com';
  private readonly DEMO_PASSWORD = 'Demo@1234';

  public async up(qr: QueryRunner): Promise<void> {
    // Only proceed if the demo institute exists.
    const inst = await qr.query(`SELECT id FROM institutes WHERE id = ?`, [this.INST]);
    if (inst.length === 0) {
      console.log('[AddDemoAdminKapila] Demo institute not found — skipping.');
      return;
    }
    // Reuse the existing user if this email is already registered (it may be a
    // real account that's an admin of other institutes). Otherwise create the
    // demo user. Either way, we (re)grant an INSTITUTE_ADMIN membership on the
    // DEMO institute only — we never touch the user's other institute memberships.
    const byEmail = await qr.query(`SELECT id FROM users WHERE email = ?`, [this.EMAIL]);
    let userId: string | number;

    if (byEmail.length > 0) {
      userId = byEmail[0].id;
      console.log(`[AddDemoAdminKapila] Email already exists (user id=${userId}); reusing it.`);
    } else {
      userId = this.UID;
      const pepper = process.env.BCRYPT_PEPPER || '';
      const rounds = parseInt(process.env.BCRYPT_SALT_ROUNDS || '12', 10);
      const passwordHash = await bcrypt.hash(this.DEMO_PASSWORD + pepper, rounds);
      await qr.query(
        `INSERT INTO users
           (id, first_name, last_name, name_with_initials, email, password, phone_number,
            user_type, gender, district, province, country, is_active, subscription_plan,
            is_phone_verified, is_email_verified, created_at, updated_at)
         VALUES (?, 'Kapila', 'Karunarathna', 'K. Karunarathna', ?, ?, '0710000002',
                 'USER', 'MALE', 'COLOMBO', 'WESTERN', 'Sri Lanka', 1, 'FREE', 1, 1, NOW(), NOW())`,
        [this.UID, this.EMAIL, passwordHash],
      );
    }

    // Grant demo-institute admin membership only if not already present.
    const member = await qr.query(
      `SELECT 1 FROM institute_user WHERE institute_id = ? AND user_id = ?`,
      [this.INST, userId],
    );
    if (member.length === 0) {
      await qr.query(
        `INSERT INTO institute_user
           (institute_id, user_id, user_id_institue, status, institute_user_type, created_at, updated_at)
         VALUES (?, ?, 'DEMO-ADM-002', 'ACTIVE', 'INSTITUTE_ADMIN', NOW(), NOW())`,
        [this.INST, userId],
      );
      console.log(`[AddDemoAdminKapila] Granted ${this.EMAIL} (user id=${userId}) INSTITUTE_ADMIN on the demo institute.`);
    } else {
      console.log('[AddDemoAdminKapila] Demo membership already exists — nothing to do.');
    }
  }

  public async down(qr: QueryRunner): Promise<void> {
    // Remove ONLY the demo-institute membership (for whichever user holds this email),
    // never the user's memberships in other institutes.
    const byEmail = await qr.query(`SELECT id FROM users WHERE email = ?`, [this.EMAIL]);
    if (byEmail.length > 0) {
      await qr.query(`DELETE FROM institute_user WHERE institute_id = ? AND user_id = ?`, [this.INST, byEmail[0].id]);
    }
    // Delete the user row ONLY if it was the one this migration created (the
    // reserved demo uid). Never delete a pre-existing real account.
    await qr.query(`DELETE FROM users WHERE id = ? AND email = ?`, [this.UID, this.EMAIL]);
    console.log('[AddDemoAdminKapila] Removed demo admin membership for Kapila.');
  }
}
