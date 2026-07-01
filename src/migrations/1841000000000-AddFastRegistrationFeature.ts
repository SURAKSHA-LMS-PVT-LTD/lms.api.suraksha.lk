import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds 'fast-registration' to the feature_catalog.
 * Defaults OFF — must be explicitly enabled per institute.
 * Visible to InstituteAdmin, Teacher, AttendanceMarker.
 * Safe to re-run — uses ON DUPLICATE KEY UPDATE.
 */
export class AddFastRegistrationFeature1841000000000 implements MigrationInterface {
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
        'fast-registration',
        'Fast Registration',
        'Ultra-fast batch photo registration for field use — snap passport photos offline, upload all at once. Ideal for low-connectivity class registration sessions.',
        'INSTITUTE',
        'SERVICES',
        'FREE',
        'MONTHLY',
        0,
        '[]',
        '["sidebar"]',
        1,
      ],
    );
    console.log('✅ Upserted fast-registration into feature_catalog');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DELETE FROM feature_catalog WHERE \`key\` = 'fast-registration'`,
    );
  }
}
