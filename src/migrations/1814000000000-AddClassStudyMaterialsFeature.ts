import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds the class-scope 'class-study-materials' feature to the catalog.
 * Study Materials is a class-level feature (not subject-level).
 * Safe to re-run — uses ON DUPLICATE KEY UPDATE.
 */
export class AddClassStudyMaterialsFeature1814000000000 implements MigrationInterface {
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
        'class-study-materials',
        'Study Materials',
        'Class-level study materials with folder organisation and payment-gated access',
        'CLASS',
        'ACADEMICS',
        'FREE',
        'MONTHLY',
        0,
        '[]',
        '["sidebar","dashboard"]',
        1,
      ],
    );
    console.log('✅ Upserted class-study-materials into feature_catalog');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DELETE FROM feature_catalog WHERE \`key\` = 'class-study-materials'`,
    );
  }
}
