import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds the class-scope 'institeu-daily-attendance' feature to the catalog.
 * Defaults OFF (is_default_enabled = 0) — institutes must explicitly enable it.
 * When disabled, the Event Attendance nav item is hidden inside class context.
 * Safe to re-run — uses ON DUPLICATE KEY UPDATE.
 */
export class AddInstitueDailyAttendanceFeature1840000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `INSERT INTO feature_catalog
         (\`key\`, label, description, scope, category, pricing, billing_cycle, is_core, dependencies, ui_targets, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         label         = VALUES(label),
         description   = VALUES(description),
         scope         = VALUES(scope),
         category      = VALUES(category),
         pricing       = VALUES(pricing),
         billing_cycle = VALUES(billing_cycle),
         is_core       = VALUES(is_core),
         dependencies  = VALUES(dependencies),
         ui_targets    = VALUES(ui_targets),
         is_active     = VALUES(is_active)`,
      [
        'institeu-daily-attendance',
        'Event Attendance',
        'Class-filtered view of institute calendar event attendance — mark and track student attendance per event',
        'CLASS',
        'ATTENDANCE',
        'FREE',
        'MONTHLY',
        0,
        '[]',
        '["sidebar","dashboard"]',
        1,
      ],
    );
    console.log('✅ Upserted institeu-daily-attendance into feature_catalog');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DELETE FROM feature_catalog WHERE \`key\` = 'institeu-daily-attendance'`,
    );
  }
}
