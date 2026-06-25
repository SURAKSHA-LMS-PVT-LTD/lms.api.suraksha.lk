import { MigrationInterface, QueryRunner } from 'typeorm';

export class MigrateStudyMaterialsToUUID1834000000000 implements MigrationInterface {
  name = 'MigrateStudyMaterialsToUUID1834000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const table = 'institute_class_subject_study_materials';

    // Drop FK_sm_institute if it exists
    const fks = await queryRunner.query(
      `SELECT CONSTRAINT_NAME FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME LIKE 'FK_sm_%'`,
      [table],
    );
    for (const { CONSTRAINT_NAME } of fks) {
      await queryRunner.query(`ALTER TABLE \`${table}\` DROP FOREIGN KEY \`${CONSTRAINT_NAME}\``);
    }

    // Convert institute_id: bigint → varchar(36)
    const instCol = await queryRunner.query(
      `SELECT DATA_TYPE FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = 'institute_id'`,
      [table],
    );
    if (instCol.length > 0 && instCol[0].DATA_TYPE !== 'varchar') {
      await queryRunner.query(
        `ALTER TABLE \`${table}\` MODIFY COLUMN \`institute_id\` varchar(36) NOT NULL DEFAULT ''`,
      );
    }

    // Convert class_id: bigint → varchar(36)
    const classCol = await queryRunner.query(
      `SELECT DATA_TYPE FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = 'class_id'`,
      [table],
    );
    if (classCol.length > 0 && classCol[0].DATA_TYPE !== 'varchar') {
      await queryRunner.query(
        `ALTER TABLE \`${table}\` MODIFY COLUMN \`class_id\` varchar(36) NULL`,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Intentionally a no-op — reverting UUID columns to bigint would lose data
  }
}
