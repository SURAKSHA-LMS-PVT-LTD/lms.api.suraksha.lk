import { MigrationInterface, QueryRunner } from 'typeorm';

export class FixLiveAttendanceScopeColumnsToUuid1838000000000 implements MigrationInterface {
  name = 'FixLiveAttendanceScopeColumnsToUuid1838000000000';

  private async indexExists(queryRunner: QueryRunner, indexName: string): Promise<boolean> {
    const rows: any[] = await queryRunner.query(`
      SELECT COUNT(*) AS cnt FROM INFORMATION_SCHEMA.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'lecture_live_attendance'
        AND INDEX_NAME = ?
    `, [indexName]);
    return Number(rows[0]?.cnt ?? 0) > 0;
  }

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (await this.indexExists(queryRunner, 'IDX_live_att_inst_class')) {
      await queryRunner.query(`ALTER TABLE \`lecture_live_attendance\` DROP INDEX \`IDX_live_att_inst_class\``);
    }

    await queryRunner.query(`
      ALTER TABLE \`lecture_live_attendance\`
        MODIFY COLUMN \`institute_id\` varchar(36) NULL,
        MODIFY COLUMN \`class_id\`     varchar(36) NULL,
        MODIFY COLUMN \`subject_id\`   varchar(36) NULL
    `);

    if (!(await this.indexExists(queryRunner, 'IDX_live_att_inst_class'))) {
      await queryRunner.query(`
        ALTER TABLE \`lecture_live_attendance\`
          ADD INDEX \`IDX_live_att_inst_class\` (\`institute_id\`, \`class_id\`)
      `);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (await this.indexExists(queryRunner, 'IDX_live_att_inst_class')) {
      await queryRunner.query(`ALTER TABLE \`lecture_live_attendance\` DROP INDEX \`IDX_live_att_inst_class\``);
    }

    await queryRunner.query(`
      ALTER TABLE \`lecture_live_attendance\`
        MODIFY COLUMN \`institute_id\` bigint NULL,
        MODIFY COLUMN \`class_id\`     bigint NULL,
        MODIFY COLUMN \`subject_id\`   bigint NULL
    `);

    if (!(await this.indexExists(queryRunner, 'IDX_live_att_inst_class'))) {
      await queryRunner.query(`
        ALTER TABLE \`lecture_live_attendance\`
          ADD INDEX \`IDX_live_att_inst_class\` (\`institute_id\`, \`class_id\`)
      `);
    }
  }
}
