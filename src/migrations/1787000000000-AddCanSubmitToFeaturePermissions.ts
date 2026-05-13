import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCanSubmitToFeaturePermissions1787000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE institute_feature_permissions
      ADD COLUMN can_submit TINYINT(1) NOT NULL DEFAULT 0
      AFTER can_report
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE institute_feature_permissions
      DROP COLUMN can_submit
    `);
  }
}
