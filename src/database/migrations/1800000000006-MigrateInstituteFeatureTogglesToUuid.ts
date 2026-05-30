import { MigrationInterface, QueryRunner } from 'typeorm';

export class MigrateInstituteFeatureTogglesToUuid1800000000006 implements MigrationInterface {
  name = 'MigrateInstituteFeatureTogglesToUuid1800000000006';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE institute_feature_toggles
       MODIFY COLUMN institute_id VARCHAR(36) NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    throw new Error(
      'MigrateInstituteFeatureTogglesToUuid1800000000006: down() is not supported. Restore from backup.',
    );
  }
}
