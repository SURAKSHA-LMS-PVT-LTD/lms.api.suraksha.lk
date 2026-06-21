import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Thilina tenant fix-up:
 *
 * 1. INSTITUTE_ADMIN rows in `institute_user` that have a NULL `user_id_institue`
 *    get an auto-generated ID in the format ADM-<YYYYMMDD>-<N> so that institute
 *    admins appear correctly in the admin attendance / user list UI.
 *
 * 2. System user id=2 gets phone_number set to +94779550317 (Kaveesha — the main
 *    system admin account). This is idempotent: only updates if phone is NULL or
 *    currently empty.
 *
 * Both operations are idempotent and safe to re-run.
 */
export class FixThilinaAdminInstituteUserIds1818000000000 implements MigrationInterface {
  name = 'FixThilinaAdminInstituteUserIds1818000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── 1. Generate institute user IDs for admins that are missing one ──────────
    const nullAdmins: any[] = await queryRunner.query(`
      SELECT iu.institute_id, iu.user_id
      FROM institute_user iu
      WHERE iu.institute_user_type = 'INSTITUTE_ADMIN'
        AND (iu.user_id_institue IS NULL OR iu.user_id_institue = '')
      ORDER BY iu.institute_id, iu.user_id
    `);

    if (nullAdmins.length > 0) {
      const today = new Date();
      const dateStr = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}${String(today.getDate()).padStart(2, '0')}`;

      // Generate a unique ID per (institute, user) pair — counter per institute
      const counters: Record<string, number> = {};
      for (const row of nullAdmins) {
        const iid: string = row.institute_id;
        counters[iid] = (counters[iid] ?? 0) + 1;
        const newId = `ADM-${dateStr}-${String(counters[iid]).padStart(3, '0')}`;

        await queryRunner.query(
          `UPDATE institute_user SET user_id_institue = ? WHERE institute_id = ? AND user_id = ? AND (user_id_institue IS NULL OR user_id_institue = '')`,
          [newId, iid, row.user_id],
        );
      }
      console.log(`[FixThilinaAdminInstituteUserIds] Assigned institute user IDs to ${nullAdmins.length} admin row(s).`);
    } else {
      console.log('[FixThilinaAdminInstituteUserIds] No admin rows with missing institute user ID — skipping.');
    }

    // ── 2. Set phone for system user id=2 if not already set ─────────────────
    const [userRow]: any[] = await queryRunner.query(
      `SELECT id, phone_number FROM users WHERE id = 2`,
    );
    if (userRow) {
      if (!userRow.phone_number || userRow.phone_number.trim() === '') {
        await queryRunner.query(
          `UPDATE users SET phone_number = '+94779550317', updated_at = NOW() WHERE id = 2`,
        );
        console.log('[FixThilinaAdminInstituteUserIds] Set phone_number for user id=2 to +94779550317.');
      } else {
        console.log(`[FixThilinaAdminInstituteUserIds] User id=2 already has phone_number (${userRow.phone_number}) — skipping.`);
      }
    } else {
      console.log('[FixThilinaAdminInstituteUserIds] User id=2 not found — skipping phone update.');
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Revert: clear the auto-generated IDs (only the ones we set — identifiable
    // by the ADM-YYYYMMDD-NNN format). We can't restore the old NULLs precisely,
    // so just null them out again.
    await queryRunner.query(`
      UPDATE institute_user
      SET user_id_institue = NULL
      WHERE institute_user_type = 'INSTITUTE_ADMIN'
        AND user_id_institue REGEXP '^ADM-[0-9]{8}-[0-9]{3}$'
    `);
    // Revert phone for user 2 only if it still matches what we set
    await queryRunner.query(`
      UPDATE users SET phone_number = NULL, updated_at = NOW()
      WHERE id = 2 AND phone_number = '+94779550317'
    `);
    console.log('[FixThilinaAdminInstituteUserIds] Reverted admin institute user IDs and user-2 phone.');
  }
}
