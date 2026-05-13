import { MigrationInterface, QueryRunner } from 'typeorm';

export class SeedFinanceFeatures1800000000001 implements MigrationInterface {
  name = 'SeedFinanceFeatures1800000000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      INSERT IGNORE INTO feature_catalog (\`key\`, label, description, scope, category, pricing, billing_cycle, is_core)
      VALUES
        ('suraksha-finance', 'Finance Hub', 'Double-entry accounting: accounts, ledger, teacher wallets, analytics', 'INSTITUTE', 'PAYMENTS', 'PAID', 'MONTHLY', 0),
        ('teacher-finance',  'Teacher Earnings',    'Teacher earnings wallet and transaction history',                 'INSTITUTE', 'PAYMENTS', 'FREE', 'MONTHLY', 0)
    `);

    // Enable for all existing active institutes
    await queryRunner.query(`
      INSERT IGNORE INTO institute_feature_toggles (institute_id, feature_key, enabled)
      SELECT id, 'suraksha-finance', 1 FROM institutes WHERE is_active = 1
    `).catch(() => {});

    await queryRunner.query(`
      INSERT IGNORE INTO institute_feature_toggles (institute_id, feature_key, enabled)
      SELECT id, 'teacher-finance', 1 FROM institutes WHERE is_active = 1
    `).catch(() => {});

    console.log('✅ Finance feature keys seeded');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DELETE FROM institute_feature_toggles WHERE feature_key IN ('suraksha-finance','teacher-finance')`);
    await queryRunner.query(`DELETE FROM feature_catalog WHERE \`key\` IN ('suraksha-finance','teacher-finance')`);
  }
}
