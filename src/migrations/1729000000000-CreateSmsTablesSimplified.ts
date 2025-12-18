import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';

export class CreateSmsTablesSimplified1729000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create sms_campaigns table
    await queryRunner.createTable(
      new Table({
        name: 'sms_campaigns',
        columns: [
          {
            name: 'id',
            type: 'bigint',
            isPrimary: true,
            isGenerated: true,
            generationStrategy: 'increment',
          },
          {
            name: 'institute_id',
            type: 'bigint',
            isNullable: false,
          },
          {
            name: 'sender_id',
            type: 'varchar',
            length: '20',
            isNullable: false,
          },
          {
            name: 'message',
            type: 'text',
            isNullable: false,
          },
          {
            name: 'type',
            type: 'enum',
            enum: ['SINGLE', 'BULK'],
            default: "'SINGLE'",
          },
          {
            name: 'status',
            type: 'enum',
            enum: ['PENDING', 'SENDING', 'SUCCESS', 'FAILED', 'PARTIALLY_FAILED'],
            default: "'PENDING'",
          },
          {
            name: 'total_recipients',
            type: 'int',
            default: 0,
          },
          {
            name: 'successful_sends',
            type: 'int',
            default: 0,
          },
          {
            name: 'failed_sends',
            type: 'int',
            default: 0,
          },
          {
            name: 'credits_deducted',
            type: 'decimal',
            precision: 10,
            scale: 2,
            default: 0,
          },
          {
            name: 'provider_campaign_id',
            type: 'varchar',
            length: '50',
            isNullable: true,
          },
          {
            name: 'provider_name',
            type: 'varchar',
            length: '50',
            default: "'SMSlenz'",
          },
          {
            name: 'provider_response',
            type: 'json',
            isNullable: true,
          },
          {
            name: 'error_message',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'initiated_by',
            type: 'bigint',
            isNullable: false,
          },
          {
            name: 'created_at',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
          },
          {
            name: 'updated_at',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
            onUpdate: 'CURRENT_TIMESTAMP',
          },
          {
            name: 'sent_at',
            type: 'timestamp',
            isNullable: true,
          },
        ],
      }),
      true,
    );

    // Create indexes for sms_campaigns
    await queryRunner.createIndex(
      'sms_campaigns',
      new TableIndex({
        name: 'idx_sms_campaigns_institute',
        columnNames: ['institute_id'],
      }),
    );

    await queryRunner.createIndex(
      'sms_campaigns',
      new TableIndex({
        name: 'idx_sms_campaigns_status',
        columnNames: ['status'],
      }),
    );

    await queryRunner.createIndex(
      'sms_campaigns',
      new TableIndex({
        name: 'idx_sms_campaigns_created',
        columnNames: ['created_at'],
      }),
    );

    await queryRunner.createIndex(
      'sms_campaigns',
      new TableIndex({
        name: 'idx_institute_id',
        columnNames: ['institute_id'],
      }),
    );

    // Create sms_credits table
    await queryRunner.createTable(
      new Table({
        name: 'sms_credits',
        columns: [
          {
            name: 'institute_id',
            type: 'bigint',
            isPrimary: true,
          },
          {
            name: 'balance',
            type: 'decimal',
            precision: 10,
            scale: 2,
            default: 0,
          },
          {
            name: 'total_purchased',
            type: 'decimal',
            precision: 10,
            scale: 2,
            default: 0,
          },
          {
            name: 'total_used',
            type: 'decimal',
            precision: 10,
            scale: 2,
            default: 0,
          },
          {
            name: 'last_topup_amount',
            type: 'decimal',
            precision: 10,
            scale: 2,
            isNullable: true,
          },
          {
            name: 'last_topup_at',
            type: 'timestamp',
            isNullable: true,
          },
          {
            name: 'created_at',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
          },
          {
            name: 'updated_at',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
            onUpdate: 'CURRENT_TIMESTAMP',
          },
        ],
      }),
      true,
    );

    // Create index for sms_credits
    await queryRunner.createIndex(
      'sms_credits',
      new TableIndex({
        name: 'idx_sms_credits_institute',
        columnNames: ['institute_id'],
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop indexes first
    await queryRunner.dropIndex('sms_credits', 'idx_sms_credits_institute');
    await queryRunner.dropIndex('sms_campaigns', 'idx_institute_id');
    await queryRunner.dropIndex('sms_campaigns', 'idx_sms_campaigns_created');
    await queryRunner.dropIndex('sms_campaigns', 'idx_sms_campaigns_status');
    await queryRunner.dropIndex('sms_campaigns', 'idx_sms_campaigns_institute');

    // Drop tables
    await queryRunner.dropTable('sms_credits');
    await queryRunner.dropTable('sms_campaigns');
  }
}
