import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Fix institute_house_member.institute_id column type.
 *
 * Migration 1790000000001 (MigrateInstitutesToUUID) listed this table under the
 * plural name 'institute_house_members' in its childTables array, but the table
 * created by 1753000000000 is actually named 'institute_house_member' (singular).
 * Because of that name mismatch, the UUID backfill/swap silently no-op'd for this
 * table (caught by the migration's try/catch), leaving institute_id as BIGINT while
 * the entity declares VARCHAR(36) — causing:
 *   "Incorrect integer value: '<uuid>' for column 'institute_id' at row 1"
 *
 * institute_house (singular, no "member" suffix) was migrated correctly and is not
 * affected — only institute_house_member needs this fix. The table is confirmed
 * empty in production at the time of writing, so no data backfill is needed.
 *
 * Idempotent: skips if the column is already varchar.
 */
export class FixInstituteHouseMemberInstituteIdType1847000000000 implements MigrationInterface {
  name = 'FixInstituteHouseMemberInstituteIdType1847000000000';

  private readonly TABLE = 'institute_house_member';

  private async columnType(queryRunner: QueryRunner): Promise<string | null> {
    const [row]: any[] = await queryRunner.query(`
      SELECT DATA_TYPE
      FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME   = '${this.TABLE}'
        AND COLUMN_NAME  = 'institute_id'
    `);
    return row?.DATA_TYPE ?? null;
  }

  private async dropIndexIfExists(queryRunner: QueryRunner, name: string): Promise<void> {
    try {
      await queryRunner.query(`ALTER TABLE \`${this.TABLE}\` DROP INDEX \`${name}\``);
    } catch { /* may not exist */ }
  }

  public async up(queryRunner: QueryRunner): Promise<void> {
    const currentType = await this.columnType(queryRunner);
    if (!currentType || currentType === 'varchar') return;

    // Drop indexes/unique constraints that include institute_id before altering its type.
    await this.dropIndexIfExists(queryRunner, 'uq_house_member');
    await this.dropIndexIfExists(queryRunner, 'idx_house_member_user');
    await this.dropIndexIfExists(queryRunner, 'idx_house_member_institute');

    await queryRunner.query(
      `ALTER TABLE \`${this.TABLE}\` MODIFY COLUMN \`institute_id\` VARCHAR(36) NOT NULL`,
    );

    // Re-create the indexes dropped above.
    await queryRunner.query(
      `ALTER TABLE \`${this.TABLE}\` ADD UNIQUE KEY \`uq_house_member\` (\`house_id\`, \`user_id\`, \`institute_id\`)`,
    );
    await queryRunner.query(
      `CREATE INDEX \`idx_house_member_user\` ON \`${this.TABLE}\` (\`user_id\`, \`institute_id\`)`,
    );
    await queryRunner.query(
      `CREATE INDEX \`idx_house_member_institute\` ON \`${this.TABLE}\` (\`institute_id\`)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await this.dropIndexIfExists(queryRunner, 'uq_house_member');
    await this.dropIndexIfExists(queryRunner, 'idx_house_member_user');
    await this.dropIndexIfExists(queryRunner, 'idx_house_member_institute');

    await queryRunner.query(
      `ALTER TABLE \`${this.TABLE}\` MODIFY COLUMN \`institute_id\` BIGINT NOT NULL`,
    );

    await queryRunner.query(
      `ALTER TABLE \`${this.TABLE}\` ADD UNIQUE KEY \`uq_house_member\` (\`house_id\`, \`user_id\`, \`institute_id\`)`,
    );
    await queryRunner.query(
      `CREATE INDEX \`idx_house_member_user\` ON \`${this.TABLE}\` (\`user_id\`, \`institute_id\`)`,
    );
    await queryRunner.query(
      `CREATE INDEX \`idx_house_member_institute\` ON \`${this.TABLE}\` (\`institute_id\`)`,
    );
  }
}
