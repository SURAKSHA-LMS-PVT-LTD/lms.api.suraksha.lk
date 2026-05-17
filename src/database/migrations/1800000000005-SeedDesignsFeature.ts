import { MigrationInterface, QueryRunner } from 'typeorm';

export class SeedDesignsFeature1800000000005 implements MigrationInterface {
  name = 'SeedDesignsFeature1800000000005';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      INSERT INTO feature_catalog (\`key\`, label, description, scope, category, pricing, billing_cycle, is_core, dependencies, ui_targets, is_active)
      VALUES (
        'institute-designs',
        'Designs',
        'Design templates for ID cards, certificates, birthday wishes, and more. Generate and export in bulk.',
        'INSTITUTE',
        'SERVICES',
        'FREE',
        'MONTHLY',
        0,
        '[]',
        '["sidebar"]',
        1
      )
      ON DUPLICATE KEY UPDATE
        label        = VALUES(label),
        description  = VALUES(description),
        scope        = VALUES(scope),
        category     = VALUES(category),
        pricing      = VALUES(pricing),
        billing_cycle = VALUES(billing_cycle),
        is_core      = VALUES(is_core),
        ui_targets   = VALUES(ui_targets),
        is_active    = VALUES(is_active)
    `);

    console.log('✅ institute-designs feature seeded into feature_catalog');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DELETE FROM feature_catalog WHERE \`key\` = 'institute-designs'`);
    await queryRunner.query(`DELETE FROM institute_feature_toggles WHERE feature_key = 'institute-designs'`);
  }
}
