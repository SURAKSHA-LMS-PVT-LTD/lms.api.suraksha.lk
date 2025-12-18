import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';

/**
 * Migration to create simplified SMS tables
 * 
 * Tables:
 * 1. sms_campaigns - Track all SMS campaigns with status
 * 2. sms_credits - Institute credit balances
 * 3. sender_masks - Approved sender IDs per institute (SECURITY CRITICAL)
 */
export class CreateSmsTablesSimplified1729000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // ============================================
    // 1. Create sender_masks table (SECURITY CRITICAL)
    // ============================================
    await queryRunner.createTable(
      new Table({
        name: 'sender_masks',
        columns: [
          {
            name: 'id',
            type: 'varchar',
            length: '36',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'uuid_generate_v4()',
          },
          {
            name: 'institute_id',
            type: 'varchar',
            length: '36',
            isNullable: false,
            comment: 'Institute that owns this sender mask',
          },
          {
            name: 'mask_id',
            type: 'varchar',
            length: '20',
            isNullable: false,
            isUnique: true,
            comment: 'The actual sender ID/mask (e.g., COMPANY_NAME)',
          },
          {
            name: 'display_name',
            type: 'varchar',
            length: '100',
            isNullable: true,
            comment: 'Human-readable name for this mask',
          },
          {
            name: 'status',
            type: 'enum',
            enum: ['PENDING', 'ACTIVE', 'SUSPENDED', 'REJECTED'],
            default: "'PENDING'",
            isNullable: false,
            comment: 'Approval status - only ACTIVE masks can send SMS',
          },
          {
            name: 'is_default',
            type: 'boolean',
            default: false,
            isNullable: false,
            comment: 'Whether this is the default mask for the institute',
          },
          {
            name: 'approved_by',
            type: 'varchar',
            length: '36',
            isNullable: true,
            comment: 'Admin user ID who approved this mask',
          },
          {
            name: 'approved_at',
            type: 'timestamp',
            isNullable: true,
            comment: 'When the mask was approved',
          },
          {
            name: 'provider_approval_id',
            type: 'varchar',
            length: '100',
            isNullable: true,
            comment: 'SMS provider approval reference',
          },
          {
            name: 'rejection_reason',
            type: 'text',
            isNullable: true,
            comment: 'Reason for rejection if status is REJECTED',
          },
          {
            name: 'notes',
            type: 'text',
            isNullable: true,
            comment: 'Additional notes about this mask',
          },
          {
            name: 'created_at',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
            isNullable: false,
          },
          {
            name: 'updated_at',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
            onUpdate: 'CURRENT_TIMESTAMP',
            isNullable: false,
          },
        ],
      }),
      true,
    );

    // Create indexes for sender_masks
    await queryRunner.createIndex(
      'sender_masks',
      new TableIndex({
        name: 'IDX_SENDER_MASKS_INSTITUTE',
        columnNames: ['institute_id'],
      }),
    );

    await queryRunner.createIndex(
      'sender_masks',
      new TableIndex({
        name: 'IDX_SENDER_MASKS_STATUS',
        columnNames: ['status'],
      }),
    );

    await queryRunner.createIndex(
      'sender_masks',
      new TableIndex({
        name: 'IDX_SENDER_MASKS_INSTITUTE_STATUS',
        columnNames: ['institute_id', 'status'],
      }),
    );

    // ============================================
    // 2. Create sms_campaigns table
    // ============================================
    await queryRunner.createTable(
      new Table({
        name: 'sms_campaigns',
        columns: [
          {
            name: 'id',
            type: 'varchar',
            length: '36',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'uuid_generate_v4()',
          },
          {
            name: 'institute_id',
            type: 'varchar',
            length: '36',
            isNullable: false,
          },
          {
            name: 'sender_id',
            type: 'varchar',
            length: '20',
            isNullable: false,
            comment: 'The sender mask ID used for this campaign',
          },
          {
            name: 'message',
            type: 'text',
            isNullable: false,
            comment: 'SMS message content (same for all recipients)',
          },
          {
            name: 'type',
            type: 'enum',
            enum: ['SINGLE', 'BULK'],
            isNullable: false,
          },
          {
            name: 'status',
            type: 'enum',
            enum: ['PENDING', 'SENDING', 'SUCCESS', 'FAILED', 'PARTIALLY_FAILED'],
            default: "'PENDING'",
            isNullable: false,
          },
          {
            name: 'total_recipients',
            type: 'int',
            default: 0,
            isNullable: false,
          },
          {
            name: 'successful_sends',
            type: 'int',
            default: 0,
            isNullable: false,
          },
          {
            name: 'failed_sends',
            type: 'int',
            default: 0,
            isNullable: false,
          },
          {
            name: 'credits_deducted',
            type: 'decimal',
            precision: 10,
            scale: 2,
            default: 0,
            isNullable: false,
          },
          {
            name: 'provider_name',
            type: 'varchar',
            length: '50',
            default: "'SMSlenz'",
            isNullable: false,
          },
          {
            name: 'provider_campaign_id',
            type: 'varchar',
            length: '100',
            isNullable: true,
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
            type: 'varchar',
            length: '36',
            isNullable: false,
          },
          {
            name: 'sent_at',
            type: 'timestamp',
            isNullable: true,
          },
          {
            name: 'created_at',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
            isNullable: false,
          },
          {
            name: 'updated_at',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
            onUpdate: 'CURRENT_TIMESTAMP',
            isNullable: false,
          },
        ],
      }),
      true,
    );

    // Create indexes for sms_campaigns
    await queryRunner.createIndex(
      'sms_campaigns',
      new TableIndex({
        name: 'IDX_SMS_CAMPAIGNS_INSTITUTE',
        columnNames: ['institute_id'],
      }),
    );

    await queryRunner.createIndex(
      'sms_campaigns',
      new TableIndex({
        name: 'IDX_SMS_CAMPAIGNS_STATUS',
        columnNames: ['status'],
      }),
    );

    await queryRunner.createIndex(
      'sms_campaigns',
      new TableIndex({
        name: 'IDX_SMS_CAMPAIGNS_TYPE',
        columnNames: ['type'],
      }),
    );

    await queryRunner.createIndex(
      'sms_campaigns',
      new TableIndex({
        name: 'IDX_SMS_CAMPAIGNS_CREATED',
        columnNames: ['created_at'],
      }),
    );

    // ============================================
    // 3. Create sms_credits table
    // ============================================
    await queryRunner.createTable(
      new Table({
        name: 'sms_credits',
        columns: [
          {
            name: 'institute_id',
            type: 'varchar',
            length: '36',
            isPrimary: true,
            comment: 'Primary key - one record per institute',
          },
          {
            name: 'balance',
            type: 'decimal',
            precision: 10,
            scale: 2,
            default: 0,
            isNullable: false,
            comment: 'Current credit balance',
          },
          {
            name: 'total_purchased',
            type: 'decimal',
            precision: 10,
            scale: 2,
            default: 0,
            isNullable: false,
            comment: 'Total credits ever purchased',
          },
          {
            name: 'total_used',
            type: 'decimal',
            precision: 10,
            scale: 2,
            default: 0,
            isNullable: false,
            comment: 'Total credits ever used',
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
            isNullable: false,
          },
          {
            name: 'updated_at',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
            onUpdate: 'CURRENT_TIMESTAMP',
            isNullable: false,
          },
        ],
      }),
      true,
    );

    console.log('✅ SMS tables created successfully (with sender mask security)');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('sms_credits');
    await queryRunner.dropTable('sms_campaigns');
    await queryRunner.dropTable('sender_masks');
    console.log('✅ SMS tables dropped');
  }
}
