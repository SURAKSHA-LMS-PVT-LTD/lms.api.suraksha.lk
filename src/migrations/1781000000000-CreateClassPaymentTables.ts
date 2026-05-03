import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';

export class CreateClassPaymentTables1781000000000 implements MigrationInterface {
  name = 'CreateClassPaymentTables1781000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── institute_class_payments ──────────────────────────────────────────────
    await queryRunner.createTable(new Table({
      name: 'institute_class_payments',
      columns: [
        { name: 'id', type: 'bigint', isPrimary: true, isGenerated: true, generationStrategy: 'increment' },
        { name: 'institute_id', type: 'bigint', isNullable: false },
        { name: 'class_id', type: 'bigint', isNullable: false },
        { name: 'created_by', type: 'bigint', isNullable: true },
        { name: 'title', type: 'varchar', length: '200', isNullable: false },
        { name: 'description', type: 'text', isNullable: false },
        { name: 'target_type', type: 'enum', enum: ['PARENTS', 'STUDENTS', 'BOTH'], isNullable: false },
        { name: 'priority', type: 'enum', enum: ['MANDATORY', 'OPTIONAL', 'DONATION'], isNullable: false },
        { name: 'amount', type: 'decimal', precision: 10, scale: 2, isNullable: false },
        { name: 'document_url', type: 'varchar', length: '255', isNullable: true },
        { name: 'last_date', type: 'timestamp', isNullable: false },
        { name: 'status', type: 'enum', enum: ['ACTIVE', 'INACTIVE', 'EXPIRED'], default: "'ACTIVE'", isNullable: false },
        { name: 'is_active', type: 'boolean', default: true, isNullable: false },
        { name: 'notes', type: 'text', isNullable: true },
        { name: 'bank_name', type: 'varchar', length: '100', isNullable: false },
        { name: 'account_holder_name', type: 'varchar', length: '150', isNullable: false },
        { name: 'account_holder_number', type: 'varchar', length: '50', isNullable: false },
        { name: 'created_at', type: 'timestamp', isNullable: false },
        { name: 'updated_at', type: 'timestamp', isNullable: false },
      ],
    }), true);

    await queryRunner.createIndex('institute_class_payments', new TableIndex({ name: 'idx_cp_institute', columnNames: ['institute_id'] }));
    await queryRunner.createIndex('institute_class_payments', new TableIndex({ name: 'idx_cp_class', columnNames: ['class_id'] }));
    await queryRunner.createIndex('institute_class_payments', new TableIndex({ name: 'idx_cp_institute_class', columnNames: ['institute_id', 'class_id'] }));
    await queryRunner.createIndex('institute_class_payments', new TableIndex({ name: 'idx_cp_status', columnNames: ['status'] }));

    // ── institute_class_payment_submissions ───────────────────────────────────
    await queryRunner.createTable(new Table({
      name: 'institute_class_payment_submissions',
      columns: [
        { name: 'id', type: 'bigint', isPrimary: true, isGenerated: true, generationStrategy: 'increment' },
        { name: 'payment_id', type: 'bigint', isNullable: false },
        { name: 'user_id', type: 'bigint', isNullable: false },
        { name: 'user_type', type: 'enum', enum: ['USER', 'SUPER_ADMIN', 'ORGANIZATION_MANAGER'], isNullable: false },
        { name: 'username', type: 'varchar', length: '100', isNullable: false },
        { name: 'payment_date', type: 'timestamp', isNullable: false },
        { name: 'receipt_url', type: 'varchar', length: '255', isNullable: false },
        { name: 'receipt_filename', type: 'varchar', length: '255', isNullable: false },
        { name: 'transaction_id', type: 'varchar', length: '100', isNullable: true },
        { name: 'submitted_amount', type: 'decimal', precision: 10, scale: 2, isNullable: false },
        { name: 'status', type: 'enum', enum: ['PENDING', 'VERIFIED', 'HALF_VERIFIED', 'QUARTER_VERIFIED', 'REJECTED'], default: "'PENDING'", isNullable: false },
        { name: 'verified_by', type: 'bigint', isNullable: true },
        { name: 'verified_at', type: 'timestamp', isNullable: true },
        { name: 'rejection_reason', type: 'text', isNullable: true },
        { name: 'notes', type: 'text', isNullable: true },
        { name: 'uploaded_at', type: 'timestamp', isNullable: false },
        { name: 'updated_at', type: 'timestamp', isNullable: false },
      ],
    }), true);

    await queryRunner.createIndex('institute_class_payment_submissions', new TableIndex({ name: 'idx_cps_payment', columnNames: ['payment_id'] }));
    await queryRunner.createIndex('institute_class_payment_submissions', new TableIndex({ name: 'idx_cps_user', columnNames: ['user_id'] }));
    await queryRunner.createIndex('institute_class_payment_submissions', new TableIndex({ name: 'idx_cps_status', columnNames: ['status'] }));
    await queryRunner.createIndex('institute_class_payment_submissions', new TableIndex({ name: 'idx_cps_payment_status', columnNames: ['payment_id', 'status'] }));
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('institute_class_payment_submissions', true);
    await queryRunner.dropTable('institute_class_payments', true);
  }
}
