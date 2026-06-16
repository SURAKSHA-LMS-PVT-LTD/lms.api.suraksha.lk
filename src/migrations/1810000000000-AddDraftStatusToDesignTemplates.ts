import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddDraftStatusToDesignTemplates1810000000000 implements MigrationInterface {
  name = 'AddDraftStatusToDesignTemplates1810000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const exists = await queryRunner.hasTable('design_templates');
    if (!exists) return;

    await queryRunner.query(`
      ALTER TABLE \`design_templates\`
      MODIFY COLUMN \`status\` ENUM('DRAFT','PENDING','APPROVED','REJECTED','SUSPENDED')
        NOT NULL DEFAULT 'DRAFT'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const exists = await queryRunner.hasTable('design_templates');
    if (!exists) return;

    await queryRunner.query(`UPDATE \`design_templates\` SET \`status\` = 'PENDING' WHERE \`status\` = 'DRAFT'`);
    await queryRunner.query(`
      ALTER TABLE \`design_templates\`
      MODIFY COLUMN \`status\` ENUM('PENDING','APPROVED','REJECTED','SUSPENDED')
        NOT NULL DEFAULT 'PENDING'
    `);
  }
}
