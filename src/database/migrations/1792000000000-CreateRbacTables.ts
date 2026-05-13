import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateRbacTables1792000000000 implements MigrationInterface {
  name = 'CreateRbacTables1792000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── 1. institute_user_types ──────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS institute_user_types (
        id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        institute_id  BIGINT NOT NULL,
        name          VARCHAR(100) NOT NULL,
        name_plural   VARCHAR(100) NULL,
        slug          VARCHAR(80)  NOT NULL,
        description   TEXT NULL,
        color         VARCHAR(20)  NULL,
        is_system_type TINYINT(1) NOT NULL DEFAULT 0,
        is_public     TINYINT(1) NOT NULL DEFAULT 1,
        is_active     TINYINT(1) NOT NULL DEFAULT 1,
        sort_order    INT NOT NULL DEFAULT 100,
        created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE KEY idx_iut_slug (institute_id, slug),
        KEY idx_iut_institute_active (institute_id, is_active)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // ── 2. institute_feature_permissions ────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS institute_feature_permissions (
        id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        institute_id  BIGINT NOT NULL,
        user_type_id  BIGINT UNSIGNED NOT NULL,
        feature_key   VARCHAR(120) NOT NULL,
        can_view      TINYINT(1) NOT NULL DEFAULT 0,
        can_create    TINYINT(1) NOT NULL DEFAULT 0,
        can_update    TINYINT(1) NOT NULL DEFAULT 0,
        can_delete    TINYINT(1) NOT NULL DEFAULT 0,
        can_report    TINYINT(1) NOT NULL DEFAULT 0,
        created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE KEY idx_ifp_user_type (user_type_id, feature_key),
        KEY idx_ifp_institute (institute_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // ── 3. Add primary_user_type_id to institute_user (idempotent) ───────────
    const [cols] = await queryRunner.query(`
      SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'institute_user'
        AND COLUMN_NAME = 'primary_user_type_id'
    `);
    if (!cols) {
      await queryRunner.query(`
        ALTER TABLE institute_user
        ADD COLUMN primary_user_type_id BIGINT UNSIGNED NULL DEFAULT NULL
        AFTER institute_user_type,
        ADD KEY idx_iu_primary_user_type (institute_id, primary_user_type_id)
      `);
    }

    // ── 4. Seed default user types for every existing institute ─────────────
    await queryRunner.query(`
      INSERT IGNORE INTO institute_user_types
        (institute_id, name, name_plural, slug, color, is_system_type, is_public, sort_order)
      SELECT DISTINCT
        i.id,
        'Student',   'Students',   'student',   '#3b82f6', 1, 1, 10
      FROM institutes i

      UNION ALL

      SELECT DISTINCT
        i.id,
        'Teacher',   'Teachers',   'teacher',   '#10b981', 1, 1, 20
      FROM institutes i

      UNION ALL

      SELECT DISTINCT
        i.id,
        'Admin',     'Admins',     'institute_admin', '#ef4444', 1, 0, 30
      FROM institutes i

      UNION ALL

      SELECT DISTINCT
        i.id,
        'Attendance Marker', 'Attendance Markers', 'attendance_marker', '#f59e0b', 1, 0, 40
      FROM institutes i

      UNION ALL

      SELECT DISTINCT
        i.id,
        'Parent',    'Parents',    'parent',    '#8b5cf6', 1, 0, 50
      FROM institutes i
    `);

    // ── 5. Back-fill primary_user_type_id from existing institute_user_type enum ──
    // COLLATE added to resolve utf8mb4_0900_ai_ci vs utf8mb4_unicode_ci mismatch
    await queryRunner.query(`
      UPDATE institute_user iu
      JOIN institute_user_types iut
        ON iut.institute_id = iu.institute_id
       AND iut.slug = LOWER(iu.institute_user_type) COLLATE utf8mb4_unicode_ci
      SET iu.primary_user_type_id = iut.id
      WHERE iu.primary_user_type_id IS NULL
    `);

    // ── 6. Seed default permissions for each user type ───────────────────────
    // Admin gets full access; student/teacher/others get view-only on basic features
    await queryRunner.query(`
      INSERT IGNORE INTO institute_feature_permissions
        (institute_id, user_type_id, feature_key, can_view, can_create, can_update, can_delete, can_report)
      SELECT
        iut.institute_id,
        iut.id,
        fc.key,
        1,
        CASE WHEN iut.slug = 'institute_admin' THEN 1 ELSE 0 END,
        CASE WHEN iut.slug = 'institute_admin' THEN 1 ELSE 0 END,
        CASE WHEN iut.slug = 'institute_admin' THEN 1 ELSE 0 END,
        CASE WHEN iut.slug IN ('institute_admin','teacher') THEN 1 ELSE 0 END
      FROM institute_user_types iut
      CROSS JOIN feature_catalog fc
      WHERE iut.is_active = 1
        AND fc.is_active = 1
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS institute_feature_permissions`);
    await queryRunner.query(`DROP TABLE IF EXISTS institute_user_types`);

    const [cols] = await queryRunner.query(`
      SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'institute_user'
        AND COLUMN_NAME = 'primary_user_type_id'
    `);
    if (cols) {
      await queryRunner.query(`ALTER TABLE institute_user DROP COLUMN primary_user_type_id`);
    }
  }
}
