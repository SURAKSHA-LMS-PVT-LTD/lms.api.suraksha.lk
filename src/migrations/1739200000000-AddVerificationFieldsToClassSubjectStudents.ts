import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddVerificationFieldsToClassSubjectStudents1739200000000 implements MigrationInterface {
  name = 'AddVerificationFieldsToClassSubjectStudents1739200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Add verification_status column
    const hasVerificationStatus = await this.columnExists(queryRunner, 'institute_class_subject_students', 'verification_status');
    if (!hasVerificationStatus) {
      await queryRunner.query(`
        ALTER TABLE \`institute_class_subject_students\`
        ADD COLUMN \`verification_status\` ENUM('verified', 'pending', 'rejected') NOT NULL DEFAULT 'verified'
        COMMENT 'Verification status: verified (default for teacher_assigned), pending (for self_enrolled), rejected'
      `);
    }

    // 2. Add verified_by column
    const hasVerifiedBy = await this.columnExists(queryRunner, 'institute_class_subject_students', 'verified_by');
    if (!hasVerifiedBy) {
      await queryRunner.query(`
        ALTER TABLE \`institute_class_subject_students\`
        ADD COLUMN \`verified_by\` BIGINT NULL
        COMMENT 'Admin/Teacher who verified or rejected the enrollment'
      `);
    }

    // 3. Add verified_at column
    const hasVerifiedAt = await this.columnExists(queryRunner, 'institute_class_subject_students', 'verified_at');
    if (!hasVerifiedAt) {
      await queryRunner.query(`
        ALTER TABLE \`institute_class_subject_students\`
        ADD COLUMN \`verified_at\` TIMESTAMP NULL
      `);
    }

    // 4. Add rejection_reason column
    const hasRejectionReason = await this.columnExists(queryRunner, 'institute_class_subject_students', 'rejection_reason');
    if (!hasRejectionReason) {
      await queryRunner.query(`
        ALTER TABLE \`institute_class_subject_students\`
        ADD COLUMN \`rejection_reason\` TEXT NULL
        COMMENT 'Reason for rejecting the enrollment'
      `);
    }

    // 5. Add foreign key for verified_by -> users.id
    const fkExists = await this.foreignKeyExists(queryRunner, 'institute_class_subject_students', 'FK_class_subject_students_verified_by');
    if (!fkExists) {
      await queryRunner.query(`
        ALTER TABLE \`institute_class_subject_students\`
        ADD CONSTRAINT \`FK_class_subject_students_verified_by\`
        FOREIGN KEY (\`verified_by\`) REFERENCES \`users\`(\`id\`) ON DELETE SET NULL
      `);
    }

    // 6. Add index for querying pending verifications
    const idxExists = await this.indexExists(queryRunner, 'institute_class_subject_students', 'idx_class_subject_students_verification');
    if (!idxExists) {
      await queryRunner.query(`
        CREATE INDEX \`idx_class_subject_students_verification\`
        ON \`institute_class_subject_students\` (\`institute_id\`, \`class_id\`, \`subject_id\`, \`verification_status\`)
      `);
    }

    // 7. Set existing records to 'verified' (they were already active enrollments)
    await queryRunner.query(`
      UPDATE \`institute_class_subject_students\`
      SET \`verification_status\` = 'verified'
      WHERE \`verification_status\` = 'verified'
    `);

    console.log('✅ Migration: Added verification fields to institute_class_subject_students');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Remove index
    const idxExists = await this.indexExists(queryRunner, 'institute_class_subject_students', 'idx_class_subject_students_verification');
    if (idxExists) {
      await queryRunner.query(`DROP INDEX \`idx_class_subject_students_verification\` ON \`institute_class_subject_students\``);
    }

    // Remove foreign key
    const fkExists = await this.foreignKeyExists(queryRunner, 'institute_class_subject_students', 'FK_class_subject_students_verified_by');
    if (fkExists) {
      await queryRunner.query(`ALTER TABLE \`institute_class_subject_students\` DROP FOREIGN KEY \`FK_class_subject_students_verified_by\``);
    }

    // Remove columns
    const columns = ['rejection_reason', 'verified_at', 'verified_by', 'verification_status'];
    for (const col of columns) {
      const exists = await this.columnExists(queryRunner, 'institute_class_subject_students', col);
      if (exists) {
        await queryRunner.query(`ALTER TABLE \`institute_class_subject_students\` DROP COLUMN \`${col}\``);
      }
    }

    console.log('✅ Migration rollback: Removed verification fields from institute_class_subject_students');
  }

  private async columnExists(queryRunner: QueryRunner, table: string, column: string): Promise<boolean> {
    const result = await queryRunner.query(
      `SELECT COUNT(*) as cnt FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
      [table, column]
    );
    return parseInt(result[0].cnt) > 0;
  }

  private async indexExists(queryRunner: QueryRunner, table: string, indexName: string): Promise<boolean> {
    const result = await queryRunner.query(
      `SELECT COUNT(*) as cnt FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ?`,
      [table, indexName]
    );
    return parseInt(result[0].cnt) > 0;
  }

  private async foreignKeyExists(queryRunner: QueryRunner, table: string, fkName: string): Promise<boolean> {
    const result = await queryRunner.query(
      `SELECT COUNT(*) as cnt FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? AND CONSTRAINT_TYPE = 'FOREIGN KEY'`,
      [table, fkName]
    );
    return parseInt(result[0].cnt) > 0;
  }
}
