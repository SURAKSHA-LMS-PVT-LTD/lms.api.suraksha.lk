import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';

/**
 * Migration: Create tenant_service_payments table.
 *
 * Records payment submissions by institutes for any chargeable platform service:
 * monthly invoices, SMS/Email/WhatsApp credit top-ups, storage purchases,
 * subdomain/domain fees, etc.
 *
 * System admins verify/reject submissions → on verification, the corresponding
 * service (credits, storage, etc.) is activated via the institute-credits system.
 */
export class CreateTenantServicePaymentsTable1756000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'tenant_service_payments',
        columns: [
          {
            name: 'id',
            type: 'bigint',
            isPrimary: true,
            isGenerated: true,
            generationStrategy: 'increment',
          },
          { name: 'institute_id', type: 'bigint', isNullable: false },
          { name: 'billing_month', type: 'char', length: '7', isNullable: false },
          {
            name: 'service_type',
            type: 'enum',
            enum: [
              'CREDITS',
              'MONTHLY_INVOICE',
              'SUBDOMAIN_FEE',
              'CUSTOM_DOMAIN_FEE',
              'SMS_CREDITS',
              'EMAIL_CREDITS',
              'WHATSAPP_CREDITS',
              'STORAGE_PURCHASE',
              'OTHER',
            ],
            default: "'CREDITS'",
          },
          { name: 'service_description', type: 'varchar', length: '300', isNullable: true },
          { name: 'payment_amount', type: 'decimal', precision: 10, scale: 2, isNullable: false },
          {
            name: 'payment_method',
            type: 'enum',
            enum: ['BANK_TRANSFER', 'ONLINE_PAYMENT', 'CASH_DEPOSIT'],
            isNullable: false,
          },
          { name: 'payment_reference', type: 'varchar', length: '100', isNullable: true },
          { name: 'payment_slip_url', type: 'varchar', length: '500', isNullable: true },
          { name: 'requested_quantity', type: 'int', isNullable: true },
          { name: 'granted_quantity', type: 'int', isNullable: true },
          { name: 'service_metadata', type: 'json', isNullable: true },
          { name: 'payment_date', type: 'date', isNullable: false },
          {
            name: 'status',
            type: 'enum',
            enum: ['PENDING', 'VERIFIED', 'REJECTED'],
            default: "'PENDING'",
          },
          { name: 'submitted_by', type: 'bigint', isNullable: false },
          { name: 'submitted_at', type: 'timestamp', default: 'CURRENT_TIMESTAMP' },
          { name: 'verified_by', type: 'bigint', isNullable: true },
          { name: 'verified_at', type: 'timestamp', isNullable: true },
          { name: 'rejection_reason', type: 'varchar', length: '300', isNullable: true },
          { name: 'notes', type: 'varchar', length: '500', isNullable: true },
          { name: 'created_at', type: 'timestamp', default: 'CURRENT_TIMESTAMP' },
          {
            name: 'updated_at',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
            onUpdate: 'CURRENT_TIMESTAMP',
          },
        ],
      }),
      true, // ifNotExists
    );

    // Indexes matching the entity's @Index decorators
    await queryRunner.createIndex(
      'tenant_service_payments',
      new TableIndex({ name: 'idx_tsp_institute_month', columnNames: ['institute_id', 'billing_month'] }),
    );
    await queryRunner.createIndex(
      'tenant_service_payments',
      new TableIndex({ name: 'idx_tsp_status', columnNames: ['status'] }),
    );
    await queryRunner.createIndex(
      'tenant_service_payments',
      new TableIndex({ name: 'idx_tsp_institute_status', columnNames: ['institute_id', 'status'] }),
    );
    await queryRunner.createIndex(
      'tenant_service_payments',
      new TableIndex({ name: 'idx_tsp_service_type', columnNames: ['service_type'] }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('tenant_service_payments', true);
  }
}
