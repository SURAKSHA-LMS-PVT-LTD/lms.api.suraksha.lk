import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';

/**
 * Migration: Create user_images table
 *
 * Replaces the single-image tracking on the users table with a dedicated
 * history table so that:
 *  - Every image submission is stored with its full lifecycle (PENDING → VERIFIED | REJECTED)
 *  - user.imageUrl is only updated when an image is approved
 *  - Rejected images keep a DB record (for history) but the cloud file is deleted
 *  - Institute-scoped image submissions are tracked via scope + institute_id columns
 */
export class CreateUserImagesTable1751000000000 implements MigrationInterface {
  name = 'CreateUserImagesTable1751000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const tableExists = await queryRunner.hasTable('user_images');
    if (tableExists) {
      console.log('⚠️  user_images table already exists, skipping creation');
      return;
    }

    await queryRunner.createTable(
      new Table({
        name: 'user_images',
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
            name: 'image_url',
            type: 'varchar',
            length: '500',
            isNullable: false,
          },
          {
            name: 'scope',
            type: 'enum',
            enum: ['GLOBAL', 'INSTITUTE'],
            default: "'GLOBAL'",
            isNullable: false,
          },
          {
            name: 'institute_id',
            type: 'bigint',
            isNullable: true,
          },
          {
            name: 'status',
            type: 'enum',
            enum: ['PENDING', 'VERIFIED', 'REJECTED'],
            default: "'PENDING'",
            isNullable: false,
          },
          {
            name: 'rejection_reason',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'verified_by',
            type: 'bigint',
            isNullable: true,
          },
          {
            name: 'verified_at',
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

    await queryRunner.createIndex(
      'user_images',
      new TableIndex({
        name: 'idx_user_images_user_id',
        columnNames: ['user_id'],
      }),
    );

    await queryRunner.createIndex(
      'user_images',
      new TableIndex({
        name: 'idx_user_images_user_status',
        columnNames: ['user_id', 'status'],
      }),
    );

    console.log('✅ Created user_images table with indexes');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const tableExists = await queryRunner.hasTable('user_images');
    if (tableExists) {
      await queryRunner.dropTable('user_images', true);
      console.log('✅ Dropped user_images table');
    }
  }
}
