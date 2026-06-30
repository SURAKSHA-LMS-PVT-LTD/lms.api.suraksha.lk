import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCostSsrMultiplierToDesignTemplates1846000000000 implements MigrationInterface {
  name = 'AddCostSsrMultiplierToDesignTemplates1846000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`design_templates\` ADD COLUMN \`cost_ssr_multiplier\` decimal(5,2) NOT NULL DEFAULT 1.50`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`design_templates\` DROP COLUMN \`cost_ssr_multiplier\``,
    );
  }
}
