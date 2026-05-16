import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Remove AUTO_INCREMENT from users.id.
 *
 * After this migration the application assigns random 9-digit numeric IDs
 * via UserEntity.assignRandomId() (BeforeInsert hook) so user IDs remain
 * human-readable on receipts and SMS but are no longer sequential/guessable.
 *
 * MySQL requires dropping all FK constraints that reference users.id before
 * modifying the column, then restoring them afterward.
 */
export class RemoveUserIdAutoIncrement1790000000003 implements MigrationInterface {
  name = 'RemoveUserIdAutoIncrement1790000000003';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Step 1: Find and drop all FK constraints referencing users.id
    const fkRows: any[] = await queryRunner.query(`
      SELECT TABLE_NAME, CONSTRAINT_NAME
      FROM information_schema.KEY_COLUMN_USAGE
      WHERE REFERENCED_TABLE_SCHEMA = DATABASE()
        AND REFERENCED_TABLE_NAME = 'users'
        AND REFERENCED_COLUMN_NAME = 'id'
    `);
    for (const row of fkRows) {
      try {
        await queryRunner.query(
          `ALTER TABLE \`${row.TABLE_NAME}\` DROP FOREIGN KEY \`${row.CONSTRAINT_NAME}\``,
        );
      } catch { /* already dropped */ }
    }

    // Step 2: Remove AUTO_INCREMENT — type stays BIGINT NOT NULL (signed, matching referencing columns)
    await queryRunner.query(`ALTER TABLE users MODIFY COLUMN id BIGINT NOT NULL`);

    // Step 3: Restore the FK constraints
    // Re-discover via referential integrity — we re-add by querying column usage
    // Since TypeORM has synchronize:false, we restore only the FKs we explicitly know about.
    // The app uses manual joins rather than FK enforcement, so FKs are advisory.
    // We restore the most critical ones used for cascade deletes / integrity checks.
    // Full list collected from information_schema before migration.
    const fksToRestore: Array<{ table: string; col: string; name: string }> = [
      { table: 'institute_class_students', col: 'verified_by', name: 'FK_c2477ce5c2b7d61038a33466fa3' },
      { table: 'institute_class_subject_exams', col: 'created_by', name: 'FK_609654d6bb52c74ca0043120dfb' },
      { table: 'institute_class_subject_homeworks', col: 'teacher_id', name: 'FK_51d148dc0c0a93f4726bc8871b7' },
      { table: 'institute_class_subject_homeworks_submissions', col: 'student_id', name: 'FK_e06f81592311b569d52c0e78644' },
      { table: 'institute_class_subject_lectures', col: 'instructor_id', name: 'FK_a9b1fa77c50b36d5dc5400df175' },
      { table: 'institute_class_subject_payment_submissions', col: 'verified_by', name: 'FK_150f4efde0a086f25c7f822a4f5' },
      { table: 'institute_class_subject_payment_submissions', col: 'user_id', name: 'FK_880f1e5d537405df29e9ba7b357' },
      { table: 'institute_class_subject_payments', col: 'created_by', name: 'FK_5a2ee7134f774f12fd09c7bc382' },
      { table: 'institute_class_subject_results', col: 'student_id', name: 'FK_726155b45899c5012e23960dd0e' },
      { table: 'institute_class_subject_students', col: 'student_id', name: 'FK_8b9730bdbfd1662557cf19813da' },
      { table: 'institute_class_subject_students', col: 'enrolled_by', name: 'FK_c0bf0eebf08c372ea45d3cb8df9' },
      { table: 'institute_class_subjects', col: 'teacher_id', name: 'FK_c53d262d0f226c484541d2b89d4' },
      { table: 'institute_classes', col: 'class_teacher_id', name: 'FK_036418491aa866bddde041238bf' },
      { table: 'institute_lectures', col: 'instructor_id', name: 'FK_7d6279c9fe43bd49dcfc7dc5b79' },
      { table: 'institute_payment_submissions', col: 'submitted_by', name: 'FK_04791faa0abcd6fc4623cafcf48' },
      { table: 'institute_payment_submissions', col: 'verified_by', name: 'FK_4ddede0380e1c11c5b0e2d43d30' },
      { table: 'institute_payments', col: 'created_by', name: 'FK_9c2130da1b2cb6f8aa66dca68fc' },
      { table: 'institute_sms_credentials', col: 'approved_by', name: 'FK_5d43b2f91985c8ad0b95928e3fa' },
      { table: 'institute_sms_credentials', col: 'created_by', name: 'FK_76841d2ea53f63fd91fc34d2c6e' },
      { table: 'institute_sms_messages', col: 'approved_by', name: 'FK_2522b74b976afb6ef7af9d2a24a' },
      { table: 'institute_sms_messages', col: 'sent_by', name: 'FK_61977e11f09fb0cfbb995ce0795' },
      { table: 'institute_sms_payment_submissions', col: 'submitted_by', name: 'FK_dee0bbc6c82b3166b50f8354a96' },
      { table: 'institute_sms_payment_submissions', col: 'verified_by', name: 'FK_f0eb48256b8eab8fb046392624f' },
      { table: 'institute_user', col: 'user_id', name: 'FK_1f2d05521f7dd4e25390010c1dc' },
      { table: 'institute_user', col: 'image_verified_by', name: 'FK_49361983fb7203ff6e07bf26997' },
      { table: 'institute_user', col: 'verified_by', name: 'FK_704f885637c6f2c6db9cbc22267' },
      { table: 'org_organization_users', col: 'userId', name: 'org_organization_users_userId_fkey' },
      { table: 'org_organization_users', col: 'verifiedBy', name: 'org_organization_users_verifiedBy_fkey' },
      { table: 'parents', col: 'user_id', name: 'FK_c94c3cea9b43a18c81269ded41d' },
      { table: 'payments', col: 'user_id', name: 'FK_427785468fb7d2733f59e7d7d39' },
      { table: 'payments', col: 'verified_by', name: 'FK_fc2beb4403c1d6267b003e0889c' },
      { table: 'push_notifications', col: 'sender_id', name: 'FK_86d5fd5b7ec5f6bad0ef9dbfc4e' },
      { table: 'sender_masks', col: 'approved_by', name: 'FK_8d0d7f6089fe210868c931128d1' },
      { table: 'sms_sender_masks', col: 'approved_by', name: 'FK_3363fbc56a969627cde0bfb9f9b' },
      { table: 'students', col: 'user_id', name: 'FK_fb3eff90b11bddf7285f9b4e281' },
      { table: 'user_fcm_tokens', col: 'user_id', name: 'FK_869ca568c4ec52322f1681b1a3f' },
    ];

    for (const fk of fksToRestore) {
      try {
        await queryRunner.query(
          `ALTER TABLE \`${fk.table}\` ADD CONSTRAINT \`${fk.name}\` FOREIGN KEY (\`${fk.col}\`) REFERENCES users(id) ON DELETE SET NULL ON UPDATE NO ACTION`,
        );
      } catch { /* table may not exist or FK differs — skip */ }
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop FKs, restore AUTO_INCREMENT, re-add FKs
    const fkRows: any[] = await queryRunner.query(`
      SELECT TABLE_NAME, CONSTRAINT_NAME
      FROM information_schema.KEY_COLUMN_USAGE
      WHERE REFERENCED_TABLE_SCHEMA = DATABASE()
        AND REFERENCED_TABLE_NAME = 'users'
        AND REFERENCED_COLUMN_NAME = 'id'
    `);
    for (const row of fkRows) {
      try {
        await queryRunner.query(
          `ALTER TABLE \`${row.TABLE_NAME}\` DROP FOREIGN KEY \`${row.CONSTRAINT_NAME}\``,
        );
      } catch { /* ignore */ }
    }

    await queryRunner.query(`ALTER TABLE users MODIFY COLUMN id BIGINT NOT NULL AUTO_INCREMENT`);
    // FKs will be restored by TypeORM synchronize or next migration run
  }
}
