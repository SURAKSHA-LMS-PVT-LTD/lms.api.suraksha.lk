import { MigrationInterface, QueryRunner, Table, TableIndex, TableForeignKey } from 'typeorm';

export class CreateHomeworkReferencesTable1737600000000 implements MigrationInterface {
  name = 'CreateHomeworkReferencesTable1737600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create the homework references table
    await queryRunner.createTable(
      new Table({
        name: 'institute_class_subject_homework_references',
        columns: [
          {
            name: 'id',
            type: 'bigint',
            isPrimary: true,
            isGenerated: true,
            generationStrategy: 'increment',
          },
          {
            name: 'homework_id',
            type: 'bigint',
            isNullable: false,
          },
          {
            name: 'uploaded_by_id',
            type: 'bigint',
            isNullable: true,
          },
          {
            name: 'title',
            type: 'varchar',
            length: '255',
            isNullable: false,
          },
          {
            name: 'description',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'reference_type',
            type: 'enum',
            enum: ['VIDEO', 'IMAGE', 'PDF', 'DOCUMENT', 'LINK', 'AUDIO', 'OTHER'],
            default: "'OTHER'",
          },
          {
            name: 'reference_source',
            type: 'enum',
            enum: ['S3_UPLOAD', 'GOOGLE_DRIVE', 'MANUAL_LINK'],
            default: "'S3_UPLOAD'",
          },
          {
            name: 'display_order',
            type: 'int',
            default: 0,
          },
          // S3 Upload fields
          {
            name: 'file_url',
            type: 'varchar',
            length: '500',
            isNullable: true,
          },
          {
            name: 'file_name',
            type: 'varchar',
            length: '255',
            isNullable: true,
          },
          {
            name: 'file_size',
            type: 'bigint',
            isNullable: true,
          },
          {
            name: 'mime_type',
            type: 'varchar',
            length: '100',
            isNullable: true,
          },
          // Google Drive fields
          {
            name: 'drive_file_id',
            type: 'varchar',
            length: '255',
            isNullable: true,
          },
          {
            name: 'drive_file_name',
            type: 'varchar',
            length: '500',
            isNullable: true,
          },
          {
            name: 'drive_mime_type',
            type: 'varchar',
            length: '100',
            isNullable: true,
          },
          {
            name: 'drive_file_size',
            type: 'bigint',
            isNullable: true,
          },
          // Manual Link fields
          {
            name: 'external_url',
            type: 'varchar',
            length: '1000',
            isNullable: true,
          },
          {
            name: 'link_title',
            type: 'varchar',
            length: '255',
            isNullable: true,
          },
          // Video specific fields
          {
            name: 'video_duration',
            type: 'int',
            isNullable: true,
            comment: 'Duration in seconds',
          },
          {
            name: 'thumbnail_url',
            type: 'varchar',
            length: '500',
            isNullable: true,
          },
          // Status & timestamps
          {
            name: 'is_active',
            type: 'boolean',
            default: true,
          },
          {
            name: 'created_at',
            type: 'timestamp',
            isNullable: true,
            default: 'CURRENT_TIMESTAMP',
          },
          {
            name: 'updated_at',
            type: 'timestamp',
            isNullable: true,
            default: 'CURRENT_TIMESTAMP',
            onUpdate: 'CURRENT_TIMESTAMP',
          },
        ],
      }),
      true,
    );

    // Create indexes
    await queryRunner.createIndex(
      'institute_class_subject_homework_references',
      new TableIndex({
        name: 'IDX_homework_reference_homework_id',
        columnNames: ['homework_id'],
      }),
    );

    await queryRunner.createIndex(
      'institute_class_subject_homework_references',
      new TableIndex({
        name: 'IDX_homework_reference_type',
        columnNames: ['reference_type'],
      }),
    );

    await queryRunner.createIndex(
      'institute_class_subject_homework_references',
      new TableIndex({
        name: 'IDX_homework_reference_source',
        columnNames: ['reference_source'],
      }),
    );

    await queryRunner.createIndex(
      'institute_class_subject_homework_references',
      new TableIndex({
        name: 'IDX_homework_reference_is_active',
        columnNames: ['is_active'],
      }),
    );

    await queryRunner.createIndex(
      'institute_class_subject_homework_references',
      new TableIndex({
        name: 'IDX_homework_reference_display_order',
        columnNames: ['homework_id', 'display_order'],
      }),
    );

    // Create foreign keys
    await queryRunner.createForeignKey(
      'institute_class_subject_homework_references',
      new TableForeignKey({
        columnNames: ['homework_id'],
        referencedTableName: 'institute_class_subject_homeworks',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
        name: 'FK_homework_reference_homework',
      }),
    );

    await queryRunner.createForeignKey(
      'institute_class_subject_homework_references',
      new TableForeignKey({
        columnNames: ['uploaded_by_id'],
        referencedTableName: 'users',
        referencedColumnNames: ['id'],
        onDelete: 'SET NULL',
        name: 'FK_homework_reference_uploaded_by',
      }),
    );

    console.log('✅ Created institute_class_subject_homework_references table');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop foreign keys first
    await queryRunner.dropForeignKey(
      'institute_class_subject_homework_references',
      'FK_homework_reference_uploaded_by',
    );
    await queryRunner.dropForeignKey(
      'institute_class_subject_homework_references',
      'FK_homework_reference_homework',
    );

    // Drop indexes
    await queryRunner.dropIndex(
      'institute_class_subject_homework_references',
      'IDX_homework_reference_display_order',
    );
    await queryRunner.dropIndex(
      'institute_class_subject_homework_references',
      'IDX_homework_reference_is_active',
    );
    await queryRunner.dropIndex(
      'institute_class_subject_homework_references',
      'IDX_homework_reference_source',
    );
    await queryRunner.dropIndex(
      'institute_class_subject_homework_references',
      'IDX_homework_reference_type',
    );
    await queryRunner.dropIndex(
      'institute_class_subject_homework_references',
      'IDX_homework_reference_homework_id',
    );

    // Drop table
    await queryRunner.dropTable('institute_class_subject_homework_references');

    console.log('✅ Dropped institute_class_subject_homework_references table');
  }
}
