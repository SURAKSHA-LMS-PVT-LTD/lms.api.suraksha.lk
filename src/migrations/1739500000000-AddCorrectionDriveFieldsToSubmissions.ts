import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

/**
 * Migration: Add Google Drive fields for teacher correction files
 * 
 * Adds columns to support teacher corrections via Google Drive:
 * - correction_drive_file_id: Google Drive file ID for correction
 * - correction_drive_file_name: Original file name on Drive
 * - correction_drive_mime_type: MIME type of the correction file
 * - correction_drive_file_size: File size in bytes
 * - correction_type: UPLOAD or GOOGLE_DRIVE enum
 * 
 * Run: npx typeorm migration:run -d src/data-source.ts
 */
export class AddCorrectionDriveFieldsToSubmissions1739500000000 implements MigrationInterface {
  name = 'AddCorrectionDriveFieldsToSubmissions1739500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('institute_class_subject_homeworks_submissions');

    // Add correction_drive_file_id column
    const col1 = table?.columns.find(col => col.name === 'correction_drive_file_id');
    if (!col1) {
      await queryRunner.addColumn('institute_class_subject_homeworks_submissions', new TableColumn({
        name: 'correction_drive_file_id',
        type: 'varchar',
        length: '255',
        isNullable: true,
        comment: 'Google Drive file ID for teacher correction file'
      }));
      console.log('✅ Added correction_drive_file_id column');
    }

    // Add correction_drive_file_name column
    const col2 = table?.columns.find(col => col.name === 'correction_drive_file_name');
    if (!col2) {
      await queryRunner.addColumn('institute_class_subject_homeworks_submissions', new TableColumn({
        name: 'correction_drive_file_name',
        type: 'varchar',
        length: '500',
        isNullable: true,
        comment: 'Original file name of teacher correction on Google Drive'
      }));
      console.log('✅ Added correction_drive_file_name column');
    }

    // Add correction_drive_mime_type column
    const col3 = table?.columns.find(col => col.name === 'correction_drive_mime_type');
    if (!col3) {
      await queryRunner.addColumn('institute_class_subject_homeworks_submissions', new TableColumn({
        name: 'correction_drive_mime_type',
        type: 'varchar',
        length: '100',
        isNullable: true,
        comment: 'MIME type of teacher correction file on Google Drive'
      }));
      console.log('✅ Added correction_drive_mime_type column');
    }

    // Add correction_drive_file_size column
    const col4 = table?.columns.find(col => col.name === 'correction_drive_file_size');
    if (!col4) {
      await queryRunner.addColumn('institute_class_subject_homeworks_submissions', new TableColumn({
        name: 'correction_drive_file_size',
        type: 'bigint',
        isNullable: true,
        comment: 'File size in bytes of teacher correction on Google Drive'
      }));
      console.log('✅ Added correction_drive_file_size column');
    }

    // Add correction_type column
    const col5 = table?.columns.find(col => col.name === 'correction_type');
    if (!col5) {
      await queryRunner.addColumn('institute_class_subject_homeworks_submissions', new TableColumn({
        name: 'correction_type',
        type: 'enum',
        enum: ['UPLOAD', 'GOOGLE_DRIVE'],
        isNullable: true,
        comment: 'How the correction file was uploaded: UPLOAD (S3/cloud) or GOOGLE_DRIVE'
      }));
      console.log('✅ Added correction_type column');
    }

    // Set correction_type='UPLOAD' for existing rows that have correction files
    await queryRunner.query(`
      UPDATE \`institute_class_subject_homeworks_submissions\`
      SET \`correction_type\` = 'UPLOAD'
      WHERE \`teacher_correction_file_url\` IS NOT NULL
      AND \`teacher_correction_file_url\` != ''
      AND \`correction_type\` IS NULL
    `);
    console.log('✅ Updated existing correction files to type UPLOAD');

    console.log('✅ Migration complete: AddCorrectionDriveFieldsToSubmissions');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('institute_class_subject_homeworks_submissions');

    if (table?.columns.find(col => col.name === 'correction_type')) {
      await queryRunner.dropColumn('institute_class_subject_homeworks_submissions', 'correction_type');
    }
    if (table?.columns.find(col => col.name === 'correction_drive_file_size')) {
      await queryRunner.dropColumn('institute_class_subject_homeworks_submissions', 'correction_drive_file_size');
    }
    if (table?.columns.find(col => col.name === 'correction_drive_mime_type')) {
      await queryRunner.dropColumn('institute_class_subject_homeworks_submissions', 'correction_drive_mime_type');
    }
    if (table?.columns.find(col => col.name === 'correction_drive_file_name')) {
      await queryRunner.dropColumn('institute_class_subject_homeworks_submissions', 'correction_drive_file_name');
    }
    if (table?.columns.find(col => col.name === 'correction_drive_file_id')) {
      await queryRunner.dropColumn('institute_class_subject_homeworks_submissions', 'correction_drive_file_id');
    }

    console.log('✅ Rolled back: AddCorrectionDriveFieldsToSubmissions');
  }
}
