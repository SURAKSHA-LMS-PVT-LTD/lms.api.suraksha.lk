import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Registers the 'smart-cards' feature and seeds it DISABLED for every existing institute.
 *
 * Feature toggles default to ENABLED when no row exists (features.service.ts), so to make
 * this feature off-by-default and only system-admin-enabled we must insert an explicit
 * `enabled = 0` toggle for each institute. New institutes are special-cased to default off
 * in FeaturesService.getFeaturesForInstitute.
 *
 * Idempotent: ON DUPLICATE KEY UPDATE on the catalog row; toggles inserted only where
 * missing so a re-run never flips an admin's later choice back to disabled.
 */
export class AddSmartCardsFeatureSeededDisabled1815000000002 implements MigrationInterface {
  name = 'AddSmartCardsFeatureSeededDisabled1815000000002';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `INSERT INTO feature_catalog
         (\`key\`, label, description, scope, category, pricing, billing_cycle, is_core, dependencies, ui_targets, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         label = VALUES(label), description = VALUES(description), scope = VALUES(scope),
         category = VALUES(category), pricing = VALUES(pricing), billing_cycle = VALUES(billing_cycle),
         is_core = VALUES(is_core), dependencies = VALUES(dependencies), ui_targets = VALUES(ui_targets),
         is_active = VALUES(is_active)`,
      [
        'smart-cards',
        'Manage Smart Cards',
        'Pre-printed ID card inventory: assign Suraksha (global) and institute smart cards to users at registration.',
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

    // Seed a disabled toggle for every institute that doesn't already have one for this key.
    await queryRunner.query(
      `INSERT INTO institute_feature_toggles
         (institute_id, feature_key, enabled, enabled_source, enabled_at, created_at, updated_at)
       SELECT i.id, 'smart-cards', 0, 'SYSTEM', NOW(), NOW(), NOW()
       FROM institutes i
       WHERE NOT EXISTS (
         SELECT 1 FROM institute_feature_toggles t
         WHERE t.institute_id = i.id AND t.feature_key = 'smart-cards'
       )`,
    );

    console.log('✅ Seeded smart-cards feature (disabled for all institutes)');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DELETE FROM institute_feature_toggles WHERE feature_key = 'smart-cards'`);
    await queryRunner.query(`DELETE FROM feature_catalog WHERE \`key\` = 'smart-cards'`);
  }
}
