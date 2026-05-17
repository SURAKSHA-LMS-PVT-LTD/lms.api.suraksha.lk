import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddDesignTemplatesToInstitute1800000000003 implements MigrationInterface {
  name = 'AddDesignTemplatesToInstitute1800000000003';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE \`institutes\`
      ADD COLUMN \`design_templates\` JSON NULL
      COMMENT 'Institute-level design templates for certificates, birthday wishes, etc.'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE \`institutes\` DROP COLUMN \`design_templates\`
    `);
  }
}
