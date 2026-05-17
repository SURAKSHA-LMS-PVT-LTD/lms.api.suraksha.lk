import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSubjectRecordingsFeature1800600000000 implements MigrationInterface {
  name = 'AddSubjectRecordingsFeature1800600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      INSERT INTO feature_catalog
        (\`key\`, label, description, scope, category, pricing, billing_cycle, is_core, dependencies, ui_targets, is_active)
      VALUES
        ('subject-recordings', 'Subject Recordings', 'Admin-uploaded video recordings for a subject — students can browse, watch and tracking sessions are captured', 'SUBJECT', 'ACADEMICS', 'PAID', 'MONTHLY', 0, '[]', '["sidebar","dashboard"]', 1)
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
        is_active     = VALUES(is_active)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DELETE FROM feature_catalog WHERE \`key\` = 'subject-recordings'`);
  }
}
