import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAllowServerSideRenderingToDesignTemplates1845000000000 implements MigrationInterface {
  name = 'AddAllowServerSideRenderingToDesignTemplates1845000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const cols = await queryRunner.query(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'design_templates' AND COLUMN_NAME IN ('allow_server_side_rendering','cost_ssr_multiplier')`,
    );
    const existing = new Set(cols.map((r: any) => r.COLUMN_NAME));
    if (!existing.has('allow_server_side_rendering')) {
      await queryRunner.query(
        `ALTER TABLE \`design_templates\` ADD COLUMN \`allow_server_side_rendering\` tinyint(1) NOT NULL DEFAULT 0`,
      );
    }
    if (!existing.has('cost_ssr_multiplier')) {
      await queryRunner.query(
        `ALTER TABLE \`design_templates\` ADD COLUMN \`cost_ssr_multiplier\` decimal(5,2) NOT NULL DEFAULT 1.50`,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE \`design_templates\` DROP COLUMN IF EXISTS \`cost_ssr_multiplier\``);
    await queryRunner.query(`ALTER TABLE \`design_templates\` DROP COLUMN IF EXISTS \`allow_server_side_rendering\``);
  }
}
