import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddInstituteLoginIndex1784000000000 implements MigrationInterface {
  name = 'AddInstituteLoginIndex1784000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const [result] = await queryRunner.query(
      `SELECT COUNT(*) AS cnt FROM INFORMATION_SCHEMA.STATISTICS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'institute_user' AND INDEX_NAME = 'idx_institute_user_login'`,
    );
    if (parseInt(result.cnt, 10) === 0) {
      await queryRunner.query(
        `CREATE INDEX \`idx_institute_user_login\` ON \`institute_user\` (\`institute_id\`, \`user_id_institue\`, \`status\`)`,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX \`idx_institute_user_login\` ON \`institute_user\``);
  }
}
