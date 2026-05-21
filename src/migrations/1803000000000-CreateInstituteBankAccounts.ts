import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';

export class CreateInstituteBankAccounts1803000000000 implements MigrationInterface {
  name = 'CreateInstituteBankAccounts1803000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'institute_bank_accounts',
        columns: [
          {
            name: 'id',
            type: 'varchar',
            length: '36',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: '(UUID())',
          },
          { name: 'institute_id', type: 'varchar', length: '36', isNullable: false },
          { name: 'label', type: 'varchar', length: '100', isNullable: false, comment: 'Friendly display name e.g. "Main Payments Account"' },
          { name: 'bank_name', type: 'varchar', length: '100', isNullable: false },
          { name: 'branch', type: 'varchar', length: '100', isNullable: true, default: null },
          { name: 'account_holder_name', type: 'varchar', length: '150', isNullable: false },
          { name: 'account_number', type: 'varchar', length: '50', isNullable: false },
          { name: 'is_active', type: 'tinyint', width: 1, default: 1 },
          { name: 'created_at', type: 'timestamp', default: 'CURRENT_TIMESTAMP' },
          { name: 'updated_at', type: 'timestamp', default: 'CURRENT_TIMESTAMP', onUpdate: 'CURRENT_TIMESTAMP' },
        ],
      }),
      true,
    );

    await queryRunner.createIndex(
      'institute_bank_accounts',
      new TableIndex({ name: 'idx_iba_institute', columnNames: ['institute_id'] }),
    );

    // Make bank fields nullable on institute_class_subject_payments (same as class payments)
    await queryRunner.query(`ALTER TABLE institute_class_subject_payments
      MODIFY COLUMN bank_name VARCHAR(100) NULL DEFAULT NULL,
      MODIFY COLUMN account_holder_name VARCHAR(150) NULL DEFAULT NULL,
      MODIFY COLUMN account_holder_number VARCHAR(50) NULL DEFAULT NULL`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('institute_bank_accounts', true);
    await queryRunner.query(`ALTER TABLE institute_class_subject_payments
      MODIFY COLUMN bank_name VARCHAR(100) NOT NULL DEFAULT '',
      MODIFY COLUMN account_holder_name VARCHAR(150) NOT NULL DEFAULT '',
      MODIFY COLUMN account_holder_number VARCHAR(50) NOT NULL DEFAULT ''`);
  }
}
