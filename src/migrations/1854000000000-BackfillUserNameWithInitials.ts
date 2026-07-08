import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 562 of 2154 users had name_with_initials = NULL despite having valid
 * first_name/last_name — the login/refresh response only ever sends
 * nameWithInitials (never firstName/lastName), so these users displayed as
 * the generic "User" fallback everywhere on the frontend after login.
 * Backfills using the same "F. Lastname" convention the frontend's own
 * generateNameWithInitials() already uses, so display stays consistent.
 */
export class BackfillUserNameWithInitials1854000000000 implements MigrationInterface {
  name = 'BackfillUserNameWithInitials1854000000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    // first_name only
    await queryRunner.query(`
      UPDATE users
      SET name_with_initials = CONCAT(UPPER(LEFT(first_name, 1)), '.')
      WHERE (name_with_initials IS NULL OR name_with_initials = '')
        AND first_name IS NOT NULL AND first_name != ''
        AND (last_name IS NULL OR last_name = '')
    `);

    // first_name + last_name
    await queryRunner.query(`
      UPDATE users
      SET name_with_initials = CONCAT(UPPER(LEFT(first_name, 1)), '. ', last_name)
      WHERE (name_with_initials IS NULL OR name_with_initials = '')
        AND first_name IS NOT NULL AND first_name != ''
        AND last_name IS NOT NULL AND last_name != ''
    `);

    // last_name only (no first_name)
    await queryRunner.query(`
      UPDATE users
      SET name_with_initials = last_name
      WHERE (name_with_initials IS NULL OR name_with_initials = '')
        AND (first_name IS NULL OR first_name = '')
        AND last_name IS NOT NULL AND last_name != ''
    `);
  }

  async down(): Promise<void> {
    // Backfill is not reversible to the prior NULL state without losing
    // information about which rows were originally NULL — intentionally a no-op.
  }
}
