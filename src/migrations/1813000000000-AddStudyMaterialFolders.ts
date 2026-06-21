import { MigrationInterface, QueryRunner, Table, TableIndex, TableColumn, TableForeignKey } from 'typeorm';

export class AddStudyMaterialFolders1813000000000 implements MigrationInterface {
  name = 'AddStudyMaterialFolders1813000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── 1. Create study_material_folders table ────────────────────────────────
    const folderTableExists = await queryRunner.hasTable('study_material_folders');
    if (!folderTableExists) {
      await queryRunner.createTable(new Table({
        name: 'study_material_folders',
        columns: [
          { name: 'id', type: 'bigint', isPrimary: true, isGenerated: true, generationStrategy: 'increment' },
          { name: 'institute_id', type: 'varchar', length: '36', isNullable: false },
          { name: 'class_id', type: 'varchar', length: '36', isNullable: false },
          { name: 'parent_id', type: 'bigint', isNullable: true },
          { name: 'name', type: 'varchar', length: '255', isNullable: false },
          { name: 'description', type: 'text', isNullable: true },
          { name: 'sort_order', type: 'int', default: 0, isNullable: false },
          { name: 'is_active', type: 'tinyint', default: 1, isNullable: false },
          { name: 'created_by_id', type: 'bigint', isNullable: true },
          { name: 'created_at', type: 'timestamp', default: 'CURRENT_TIMESTAMP', isNullable: false },
          { name: 'updated_at', type: 'timestamp', default: 'CURRENT_TIMESTAMP', onUpdate: 'CURRENT_TIMESTAMP', isNullable: false },
        ],
      }), true);

      await queryRunner.createIndex('study_material_folders', new TableIndex({ name: 'IDX_smf_institute', columnNames: ['institute_id'] }));
      await queryRunner.createIndex('study_material_folders', new TableIndex({ name: 'IDX_smf_class', columnNames: ['institute_id', 'class_id'] }));
      await queryRunner.createIndex('study_material_folders', new TableIndex({ name: 'IDX_smf_parent', columnNames: ['parent_id'] }));
    }

    // ── 2. Alter institute_class_subject_study_materials ─────────────────────

    // Make subject_id nullable (class-level now)
    const hasSm = await queryRunner.hasColumn('institute_class_subject_study_materials', 'subject_id');
    if (hasSm) {
      await queryRunner.changeColumn('institute_class_subject_study_materials', 'subject_id',
        new TableColumn({ name: 'subject_id', type: 'varchar', length: '36', isNullable: true }));
    }

    // Add folder_id
    const hasFolderId = await queryRunner.hasColumn('institute_class_subject_study_materials', 'folder_id');
    if (!hasFolderId) {
      await queryRunner.addColumn('institute_class_subject_study_materials',
        new TableColumn({ name: 'folder_id', type: 'bigint', isNullable: true }));
      await queryRunner.createIndex('institute_class_subject_study_materials',
        new TableIndex({ name: 'IDX_sm_folder', columnNames: ['folder_id'] }));
    }

    // Add access_level
    const hasAccessLevel = await queryRunner.hasColumn('institute_class_subject_study_materials', 'access_level');
    if (!hasAccessLevel) {
      await queryRunner.addColumn('institute_class_subject_study_materials',
        new TableColumn({ name: 'access_level', type: 'enum', enum: ['ANYONE', 'ENROLLED_ONLY', 'PAID_ONLY'], default: "'ENROLLED_ONLY'", isNullable: false }));
    }

    // Add required_payment_id (FK to institute_class_payments)
    const hasPaymentId = await queryRunner.hasColumn('institute_class_subject_study_materials', 'required_payment_id');
    if (!hasPaymentId) {
      await queryRunner.addColumn('institute_class_subject_study_materials',
        new TableColumn({ name: 'required_payment_id', type: 'bigint', isNullable: true }));
      await queryRunner.createIndex('institute_class_subject_study_materials',
        new TableIndex({ name: 'IDX_sm_payment', columnNames: ['required_payment_id'] }));
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const hasPaymentIdx = await queryRunner.hasColumn('institute_class_subject_study_materials', 'required_payment_id');
    if (hasPaymentIdx) {
      await queryRunner.dropIndex('institute_class_subject_study_materials', 'IDX_sm_payment');
      await queryRunner.dropColumn('institute_class_subject_study_materials', 'required_payment_id');
    }
    const hasAccessLevel = await queryRunner.hasColumn('institute_class_subject_study_materials', 'access_level');
    if (hasAccessLevel) {
      await queryRunner.dropColumn('institute_class_subject_study_materials', 'access_level');
    }
    const hasFolderId = await queryRunner.hasColumn('institute_class_subject_study_materials', 'folder_id');
    if (hasFolderId) {
      await queryRunner.dropIndex('institute_class_subject_study_materials', 'IDX_sm_folder');
      await queryRunner.dropColumn('institute_class_subject_study_materials', 'folder_id');
    }
    await queryRunner.dropTable('study_material_folders', true);
  }
}
