import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddGoogleDriveFieldsToHomeworkSubmissions1737547300000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add Google Drive related columns
    await queryRunner.addColumn(
      'institute_class_subject_homeworks_submissions',
      new TableColumn({
        name: 'drive_file_id',
        type: 'varchar',
        length: '255',
        isNullable: true,
        comment: 'Google Drive file ID - NOT storing access tokens',
      })
    );

    await queryRunner.addColumn(
      'institute_class_subject_homeworks_submissions',
      new TableColumn({
        name: 'drive_file_name',
        type: 'varchar',
        length: '500',
        isNullable: true,
        comment: 'Original file name from Google Drive',
      })
    );

    await queryRunner.addColumn(
      'institute_class_subject_homeworks_submissions',
      new TableColumn({
        name: 'drive_mime_type',
        type: 'varchar',
        length: '100',
        isNullable: true,
        comment: 'MIME type of the file',
      })
    );

    await queryRunner.addColumn(
      'institute_class_subject_homeworks_submissions',
      new TableColumn({
        name: 'drive_file_size',
        type: 'bigint',
        isNullable: true,
        comment: 'File size in bytes',
      })
    );

    await queryRunner.addColumn(
      'institute_class_subject_homeworks_submissions',
      new TableColumn({
        name: 'submission_type',
        type: 'enum',
        enum: ['UPLOAD', 'GOOGLE_DRIVE'],
        default: "'UPLOAD'",
        comment: 'Type of submission: traditional upload or Google Drive',
      })
    );

    // Create index for drive_file_id for quick lookups
    await queryRunner.query(
      `CREATE INDEX IDX_homework_submissions_drive_file_id 
       ON institute_class_subject_homeworks_submissions(drive_file_id)`
    );

    // Create index for submission_type for filtering
    await queryRunner.query(
      `CREATE INDEX IDX_homework_submissions_type 
       ON institute_class_subject_homeworks_submissions(submission_type)`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop indexes
    await queryRunner.query(
      `DROP INDEX IF EXISTS IDX_homework_submissions_drive_file_id 
       ON institute_class_subject_homeworks_submissions`
    );

    await queryRunner.query(
      `DROP INDEX IF EXISTS IDX_homework_submissions_type 
       ON institute_class_subject_homeworks_submissions`
    );

    // Drop columns
    await queryRunner.dropColumn('institute_class_subject_homeworks_submissions', 'submission_type');
    await queryRunner.dropColumn('institute_class_subject_homeworks_submissions', 'drive_file_size');
    await queryRunner.dropColumn('institute_class_subject_homeworks_submissions', 'drive_mime_type');
    await queryRunner.dropColumn('institute_class_subject_homeworks_submissions', 'drive_file_name');
    await queryRunner.dropColumn('institute_class_subject_homeworks_submissions', 'drive_file_id');
  }
}
