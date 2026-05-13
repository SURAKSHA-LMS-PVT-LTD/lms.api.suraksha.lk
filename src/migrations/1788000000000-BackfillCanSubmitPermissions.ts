import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Backfills can_submit for all existing institute_feature_permissions rows.
 *
 * can_submit = 1 only for user types that make semantic sense:
 *   - student:  homework, exams, subject-payments, class-payments, institute-payments
 *   - teacher:  (same features — teachers can also submit/manage)
 *   - institute_admin: all submit-applicable features
 *
 * Also seeds can_submit into the RBAC defaults for any new institutes created
 * after CreateRbacTables but before this migration (i.e., rows that exist but
 * have can_submit = 0 because the column defaulted to 0 when added later).
 */

const SUBMIT_FEATURES = [
  'homework',
  'exams',
  'subject-payments',
  'class-payments',
  'institute-payments',
];

export class BackfillCanSubmitPermissions1788000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    const placeholders = SUBMIT_FEATURES.map(() => '?').join(', ');

    // Admin: can_submit = 1 for all submit-applicable features
    await queryRunner.query(
      `UPDATE institute_feature_permissions ifp
       JOIN institute_user_types iut ON iut.id = ifp.user_type_id
       SET ifp.can_submit = 1
       WHERE iut.slug = 'institute_admin'
         AND ifp.feature_key IN (${placeholders})`,
      SUBMIT_FEATURES,
    );

    // Teacher: can_submit = 1 for all submit-applicable features
    await queryRunner.query(
      `UPDATE institute_feature_permissions ifp
       JOIN institute_user_types iut ON iut.id = ifp.user_type_id
       SET ifp.can_submit = 1
       WHERE iut.slug = 'teacher'
         AND ifp.feature_key IN (${placeholders})`,
      SUBMIT_FEATURES,
    );

    // Student: can_submit = 1 for all submit-applicable features
    await queryRunner.query(
      `UPDATE institute_feature_permissions ifp
       JOIN institute_user_types iut ON iut.id = ifp.user_type_id
       SET ifp.can_submit = 1
       WHERE iut.slug = 'student'
         AND ifp.feature_key IN (${placeholders})`,
      SUBMIT_FEATURES,
    );

    // Also seed any missing permission rows for existing institutes that were
    // created after the RBAC tables migration but may be missing rows for
    // features added to the catalog since then.
    await queryRunner.query(
      `INSERT IGNORE INTO institute_feature_permissions
         (institute_id, user_type_id, feature_key,
          can_view, can_create, can_update, can_delete, can_report, can_submit)
       SELECT
         iut.institute_id,
         iut.id,
         fc.key,
         1,
         CASE WHEN iut.slug = 'institute_admin' THEN 1 ELSE 0 END,
         CASE WHEN iut.slug = 'institute_admin' THEN 1 ELSE 0 END,
         CASE WHEN iut.slug = 'institute_admin' THEN 1 ELSE 0 END,
         CASE WHEN iut.slug IN ('institute_admin', 'teacher') THEN 1 ELSE 0 END,
         CASE
           WHEN iut.slug IN ('institute_admin', 'teacher', 'student')
                AND fc.key IN (${placeholders})
           THEN 1
           ELSE 0
         END
       FROM institute_user_types iut
       CROSS JOIN feature_catalog fc
       WHERE iut.is_active = 1
         AND fc.is_active = 1`,
      [...SUBMIT_FEATURES, ...SUBMIT_FEATURES],
    );

    console.log('✅ Backfilled can_submit for all existing RBAC permission rows');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE institute_feature_permissions SET can_submit = 0`,
    );
  }
}
