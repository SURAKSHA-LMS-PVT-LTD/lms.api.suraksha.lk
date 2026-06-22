import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';

/**
 * Public self-registration links for institutes (served at /forms/:token).
 *
 * Idempotent: checks for the table before creating.
 * Run: npx typeorm migration:run -d src/data-source.ts
 */
export class CreateInstituteRegistrationLinks1821000000000 implements MigrationInterface {
  name = 'CreateInstituteRegistrationLinks1821000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasTable('institute_registration_links')) {
      return;
    }

    await queryRunner.createTable(
      new Table({
        name: 'institute_registration_links',
        columns: [
          { name: 'id', type: 'varchar', length: '36', isPrimary: true, isGenerated: true, generationStrategy: 'uuid' },
          { name: 'token', type: 'varchar', length: '40', isNullable: false },
          { name: 'institute_id', type: 'varchar', length: '36', isNullable: false },
          { name: 'created_by', type: 'bigint', isNullable: true },
          { name: 'label', type: 'varchar', length: '120', isNullable: true },
          { name: 'allowed_user_types', type: 'json', isNullable: false },
          { name: 'auto_assign_card', type: 'tinyint', width: 1, default: 0 },
          { name: 'card_scope', type: 'enum', enum: ['INSTITUTE', 'GLOBAL', 'BOTH'], default: "'INSTITUTE'" },
          { name: 'card_empty_pool_behavior', type: 'enum', enum: ['skip', 'error'], default: "'skip'" },
          { name: 'allow_class_enrollment', type: 'tinyint', width: 1, default: 0 },
          { name: 'allow_subject_enrollment', type: 'tinyint', width: 1, default: 0 },
          { name: 'require_phone_verification', type: 'tinyint', width: 1, default: 1 },
          { name: 'require_email_verification', type: 'tinyint', width: 1, default: 1 },
          { name: 'extra_data_fields', type: 'json', isNullable: true },
          { name: 'is_active', type: 'tinyint', width: 1, default: 1 },
          { name: 'expires_at', type: 'timestamp', isNullable: true },
          { name: 'registration_count', type: 'int', unsigned: true, default: 0 },
          { name: 'created_at', type: 'timestamp', default: 'CURRENT_TIMESTAMP' },
          { name: 'updated_at', type: 'timestamp', default: 'CURRENT_TIMESTAMP', onUpdate: 'CURRENT_TIMESTAMP' },
        ],
      }),
      true,
    );

    await queryRunner.createIndex(
      'institute_registration_links',
      new TableIndex({ name: 'idx_irl_token', columnNames: ['token'], isUnique: true }),
    );
    await queryRunner.createIndex(
      'institute_registration_links',
      new TableIndex({ name: 'idx_irl_institute', columnNames: ['institute_id'] }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasTable('institute_registration_links')) {
      await queryRunner.dropTable('institute_registration_links');
    }
  }
}
