import { MigrationInterface, QueryRunner, Table, TableIndex, TableForeignKey } from 'typeorm';

/**
 * Migration: Create institute_class_subject_study_materials table
 *
 * Study materials at the institute → class → subject level.
 * Teachers and admins can attach files (S3 / Google Drive) or external links
 * with configurable download & share permissions.
 */
export class CreateStudyMaterialsTable1755000000000 implements MigrationInterface {
  name = 'CreateStudyMaterialsTable1755000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const tableExists = await queryRunner.hasTable('institute_class_subject_study_materials');
    if (tableExists) {
      console.log('⚠️  institute_class_subject_study_materials table already exists, skipping');
      return;
    }

    await queryRunner.createTable(
      new Table({
        name: 'institute_class_subject_study_materials',
        columns: [
          {
            name: 'id',
            type: 'bigint',
            isPrimary: true,
            isGenerated: true,
            generationStrategy: 'increment',
          },
          { name: 'institute_id', type: 'bigint', isNullable: false },
          { name: 'class_id', type: 'bigint', isNullable: true },
          { name: 'subject_id', type: 'bigint', isNullable: false },
          { name: 'title', type: 'varchar', length: '255', isNullable: false },
          { name: 'description', type: 'text', isNullable: true },
          {
            name: 'material_type',
            type: 'enum',
            enum: ['FILE', 'LINK'],
            default: "'FILE'",
          },
          { name: 'file_url', type: 'text', isNullable: true },
          { name: 'file_name', type: 'varchar', length: '500', isNullable: true },
          { name: 'file_size', type: 'bigint', isNullable: true },
          { name: 'mime_type', type: 'varchar', length: '100', isNullable: true },
          { name: 'source', type: 'varchar', length: '50', default: "'GOOGLE_DRIVE'" },
          { name: 'drive_file_id', type: 'varchar', length: '255', isNullable: true },
          { name: 'drive_web_view_link', type: 'text', isNullable: true },
          { name: 'thumbnail_url', type: 'varchar', length: '500', isNullable: true },
          { name: 'download_enabled', type: 'tinyint', default: 1 },
          { name: 'share_enabled', type: 'tinyint', default: 0 },
          { name: 'is_active', type: 'tinyint', default: 1 },
          { name: 'sort_order', type: 'int', default: 0 },
          { name: 'created_by_id', type: 'bigint', isNullable: true },
          { name: 'created_at', type: 'timestamp', default: 'CURRENT_TIMESTAMP' },
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

    // Indexes
    await queryRunner.createIndex(
      'institute_class_subject_study_materials',
      new TableIndex({ name: 'IDX_sm_institute', columnNames: ['institute_id'] }),
    );
    await queryRunner.createIndex(
      'institute_class_subject_study_materials',
      new TableIndex({ name: 'IDX_sm_inst_class', columnNames: ['institute_id', 'class_id'] }),
    );
    await queryRunner.createIndex(
      'institute_class_subject_study_materials',
      new TableIndex({ name: 'IDX_sm_inst_class_sub', columnNames: ['institute_id', 'class_id', 'subject_id'] }),
    );
    await queryRunner.createIndex(
      'institute_class_subject_study_materials',
      new TableIndex({ name: 'IDX_sm_created_by', columnNames: ['created_by_id'] }),
    );
    await queryRunner.createIndex(
      'institute_class_subject_study_materials',
      new TableIndex({ name: 'IDX_sm_active_sort', columnNames: ['is_active', 'sort_order'] }),
    );

    // Foreign keys
    await queryRunner.createForeignKey(
      'institute_class_subject_study_materials',
      new TableForeignKey({
        name: 'FK_sm_institute',
        columnNames: ['institute_id'],
        referencedTableName: 'institutes',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
    );
    await queryRunner.createForeignKey(
      'institute_class_subject_study_materials',
      new TableForeignKey({
        name: 'FK_sm_class',
        columnNames: ['class_id'],
        referencedTableName: 'institute_classes',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
    );
    await queryRunner.createForeignKey(
      'institute_class_subject_study_materials',
      new TableForeignKey({
        name: 'FK_sm_subject',
        columnNames: ['subject_id'],
        referencedTableName: 'subjects',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
    );
    await queryRunner.createForeignKey(
      'institute_class_subject_study_materials',
      new TableForeignKey({
        name: 'FK_sm_created_by',
        columnNames: ['created_by_id'],
        referencedTableName: 'users',
        referencedColumnNames: ['id'],
        onDelete: 'SET NULL',
      }),
    );

    console.log('✅ Created institute_class_subject_study_materials table');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('institute_class_subject_study_materials', true, true, true);
    console.log('✅ Dropped institute_class_subject_study_materials table');
  }
}
