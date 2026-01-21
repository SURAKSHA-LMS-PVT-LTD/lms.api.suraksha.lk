import { MigrationInterface, QueryRunner, Table, TableIndex, TableForeignKey } from 'typeorm';

export class CreatePushNotificationTables1737500000000 implements MigrationInterface {
  name = 'CreatePushNotificationTables1737500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create push_notifications table
    await queryRunner.createTable(
      new Table({
        name: 'push_notifications',
        columns: [
          {
            name: 'id',
            type: 'bigint',
            isPrimary: true,
            isGenerated: true,
            generationStrategy: 'increment',
          },
          {
            name: 'title',
            type: 'varchar',
            length: '255',
            isNullable: false,
          },
          {
            name: 'body',
            type: 'text',
            isNullable: false,
          },
          {
            name: 'image_url',
            type: 'varchar',
            length: '500',
            isNullable: true,
          },
          {
            name: 'icon',
            type: 'varchar',
            length: '100',
            isNullable: true,
          },
          {
            name: 'action_url',
            type: 'varchar',
            length: '500',
            isNullable: true,
            comment: 'Deep link or URL when notification is clicked',
          },
          {
            name: 'data_payload',
            type: 'json',
            isNullable: true,
            comment: 'Additional data to send with the notification',
          },
          {
            name: 'scope',
            type: 'enum',
            enum: ['GLOBAL', 'INSTITUTE', 'CLASS', 'SUBJECT'],
            default: "'INSTITUTE'",
          },
          {
            name: 'target_user_types',
            type: 'json',
            isNullable: false,
            comment: 'Array of target user types',
          },
          {
            name: 'institute_id',
            type: 'bigint',
            isNullable: true,
          },
          {
            name: 'class_id',
            type: 'bigint',
            isNullable: true,
          },
          {
            name: 'subject_id',
            type: 'bigint',
            isNullable: true,
          },
          {
            name: 'priority',
            type: 'enum',
            enum: ['HIGH', 'NORMAL', 'LOW'],
            default: "'NORMAL'",
          },
          {
            name: 'status',
            type: 'enum',
            enum: ['DRAFT', 'SCHEDULED', 'SENDING', 'SENT', 'FAILED', 'CANCELLED'],
            default: "'DRAFT'",
          },
          {
            name: 'collapse_key',
            type: 'varchar',
            length: '100',
            isNullable: true,
            comment: 'FCM collapse key for grouping',
          },
          {
            name: 'time_to_live',
            type: 'int',
            default: 86400,
            comment: 'TTL in seconds (default 24 hours)',
          },
          {
            name: 'scheduled_at',
            type: 'timestamp',
            isNullable: true,
            comment: 'When to send the notification (null for immediate)',
          },
          {
            name: 'sent_at',
            type: 'timestamp',
            isNullable: true,
          },
          {
            name: 'sender_id',
            type: 'bigint',
            isNullable: true,
          },
          {
            name: 'sender_role',
            type: 'varchar',
            length: '50',
            isNullable: false,
            comment: 'Role of sender when notification was created',
          },
          {
            name: 'total_recipients',
            type: 'int',
            default: 0,
          },
          {
            name: 'sent_count',
            type: 'int',
            default: 0,
          },
          {
            name: 'failed_count',
            type: 'int',
            default: 0,
          },
          {
            name: 'read_count',
            type: 'int',
            default: 0,
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

    // Create indexes for push_notifications
    await queryRunner.createIndex(
      'push_notifications',
      new TableIndex({
        name: 'idx_push_notifications_institute',
        columnNames: ['institute_id', 'status'],
      }),
    );

    await queryRunner.createIndex(
      'push_notifications',
      new TableIndex({
        name: 'idx_push_notifications_scope',
        columnNames: ['scope', 'status'],
      }),
    );

    await queryRunner.createIndex(
      'push_notifications',
      new TableIndex({
        name: 'idx_push_notifications_created',
        columnNames: ['created_at'],
      }),
    );

    await queryRunner.createIndex(
      'push_notifications',
      new TableIndex({
        name: 'idx_push_notifications_scheduled',
        columnNames: ['scheduled_at', 'status'],
      }),
    );

    await queryRunner.createIndex(
      'push_notifications',
      new TableIndex({
        name: 'idx_push_notifications_sender',
        columnNames: ['sender_id'],
      }),
    );

    // Create foreign keys for push_notifications
    await queryRunner.createForeignKey(
      'push_notifications',
      new TableForeignKey({
        columnNames: ['institute_id'],
        referencedColumnNames: ['id'],
        referencedTableName: 'institutes',
        onDelete: 'CASCADE',
      }),
    );

    await queryRunner.createForeignKey(
      'push_notifications',
      new TableForeignKey({
        columnNames: ['class_id'],
        referencedColumnNames: ['id'],
        referencedTableName: 'institute_classes',
        onDelete: 'CASCADE',
      }),
    );

    await queryRunner.createForeignKey(
      'push_notifications',
      new TableForeignKey({
        columnNames: ['subject_id'],
        referencedColumnNames: ['id'],
        referencedTableName: 'subjects',
        onDelete: 'CASCADE',
      }),
    );

    await queryRunner.createForeignKey(
      'push_notifications',
      new TableForeignKey({
        columnNames: ['sender_id'],
        referencedColumnNames: ['id'],
        referencedTableName: 'users',
        onDelete: 'SET NULL',
      }),
    );

    // Create notification_reads table
    await queryRunner.createTable(
      new Table({
        name: 'notification_reads',
        columns: [
          {
            name: 'id',
            type: 'bigint',
            isPrimary: true,
            isGenerated: true,
            generationStrategy: 'increment',
          },
          {
            name: 'user_id',
            type: 'bigint',
            isNullable: false,
          },
          {
            name: 'notification_id',
            type: 'bigint',
            isNullable: false,
          },
          {
            name: 'read_at',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
          },
        ],
      }),
      true,
    );

    // Create unique index for notification_reads
    await queryRunner.createIndex(
      'notification_reads',
      new TableIndex({
        name: 'idx_notification_reads_unique',
        columnNames: ['user_id', 'notification_id'],
        isUnique: true,
      }),
    );

    // Create user index for notification_reads
    await queryRunner.createIndex(
      'notification_reads',
      new TableIndex({
        name: 'idx_notification_reads_user',
        columnNames: ['user_id'],
      }),
    );

    // Create foreign keys for notification_reads
    await queryRunner.createForeignKey(
      'notification_reads',
      new TableForeignKey({
        columnNames: ['user_id'],
        referencedColumnNames: ['id'],
        referencedTableName: 'users',
        onDelete: 'CASCADE',
      }),
    );

    await queryRunner.createForeignKey(
      'notification_reads',
      new TableForeignKey({
        columnNames: ['notification_id'],
        referencedColumnNames: ['id'],
        referencedTableName: 'push_notifications',
        onDelete: 'CASCADE',
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop notification_reads table
    await queryRunner.dropTable('notification_reads', true, true, true);

    // Drop push_notifications table
    await queryRunner.dropTable('push_notifications', true, true, true);
  }
}
