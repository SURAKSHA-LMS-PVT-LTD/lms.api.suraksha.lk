import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds ALL class-scope and subject-scope features to feature_catalog so every
 * sidebar item visible inside a class or subject context can be individually
 * toggled from Feature Management, independently of the institute-level toggle.
 *
 * Uses ON DUPLICATE KEY UPDATE — safe to re-run.
 */
export class AddClassSubjectScopeFeatures1791000000002 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    const upsert = (rows: Array<[string, string, string, string, string, string, string, number, string, string, number]>) =>
      Promise.all(rows.map(([key, label, description, scope, category, pricing, billing_cycle, is_core, dependencies, ui_targets, is_active]) =>
        queryRunner.query(
          `INSERT INTO feature_catalog
             (\`key\`, label, description, scope, category, pricing, billing_cycle, is_core, dependencies, ui_targets, is_active)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE
             label         = VALUES(label),
             description   = VALUES(description),
             scope         = VALUES(scope),
             category      = VALUES(category),
             pricing       = VALUES(pricing),
             billing_cycle = VALUES(billing_cycle),
             is_core       = VALUES(is_core),
             dependencies  = VALUES(dependencies),
             ui_targets    = VALUES(ui_targets),
             is_active     = VALUES(is_active)`,
          [key, label, description, scope, category, pricing, billing_cycle, is_core, dependencies, ui_targets, is_active],
        ),
      ));

    // ── Class scope — Academics ──────────────────────────────────────────────
    await upsert([
      ['class-mark-attendance',      'Mark Attendance',          'Mark class attendance via QR, RFID or manual',              'CLASS', 'ATTENDANCE', 'FREE', 'MONTHLY', 0, '[]',                   '["sidebar"]',             1],
      ['class-daily-attendance',     'Class Attendance',         'View daily attendance records for this class',              'CLASS', 'ATTENDANCE', 'FREE', 'MONTHLY', 0, '[]',                   '["sidebar","dashboard"]', 1],
      ['class-live-attendance',      'Live Lecture Attendance',  'Real-time attendance for class lectures',                   'CLASS', 'ATTENDANCE', 'PAID', 'MONTHLY', 0, '["class-lectures"]',   '["sidebar"]',             1],
      ['class-recording-attendance', 'Recording Attendance',     'Track views of recorded class lecture videos',              'CLASS', 'ATTENDANCE', 'PAID', 'MONTHLY', 0, '["class-lectures"]',   '["sidebar"]',             1],
      ['class-my-attendance',        'My Attendance',            'Personal attendance history within this class',             'CLASS', 'ATTENDANCE', 'FREE', 'MONTHLY', 0, '[]',                   '["sidebar","dashboard"]', 1],
      ['class-parents',              'Parents',                  'Parent accounts linked to students in this class',          'CLASS', 'SERVICES',   'FREE', 'MONTHLY', 0, '[]',                   '["sidebar"]',             1],
      ['class-collect-payment',      'Collect Payment',          'Record cash or physical payments inside a class',           'CLASS', 'PAYMENTS',   'FREE', 'MONTHLY', 0, '[]',                   '["sidebar"]',             1],
      ['class-notifications',        'Notifications',            'View push notifications while inside a class',              'CLASS', 'COMMUNICATION','FREE','MONTHLY', 0, '[]',                  '["sidebar"]',             1],
    ]);

    // ── Subject scope ────────────────────────────────────────────────────────
    await upsert([
      ['subject-mark-attendance',    'Mark Attendance',          'Mark attendance for this subject session',                  'SUBJECT', 'ATTENDANCE',    'FREE', 'MONTHLY', 0, '[]', '["sidebar"]',             1],
      ['subject-daily-attendance',   'Subject Attendance',       'View attendance records for this subject',                  'SUBJECT', 'ATTENDANCE',    'FREE', 'MONTHLY', 0, '[]', '["sidebar","dashboard"]', 1],
      ['subject-live-attendance',    'Live Lecture Attendance',  'Real-time attendance for subject lectures',                 'SUBJECT', 'ATTENDANCE',    'PAID', 'MONTHLY', 0, '["lectures"]', '["sidebar"]', 1],
      ['subject-recording-attendance','Recording Attendance',    'Track views of recorded subject lecture videos',            'SUBJECT', 'ATTENDANCE',    'PAID', 'MONTHLY', 0, '["lectures"]', '["sidebar"]', 1],
      ['subject-my-attendance',      'My Attendance',            'Personal attendance history within this subject',           'SUBJECT', 'ATTENDANCE',    'FREE', 'MONTHLY', 0, '[]', '["sidebar","dashboard"]', 1],
      ['subject-collect-payment',    'Collect Payment',          'Record cash or physical payments inside a subject',         'SUBJECT', 'PAYMENTS',      'FREE', 'MONTHLY', 0, '[]', '["sidebar"]',             1],
      ['subject-notifications',      'Notifications',            'View push notifications while inside a subject',            'SUBJECT', 'COMMUNICATION', 'FREE', 'MONTHLY', 0, '[]', '["sidebar"]',             1],
    ]);

    console.log('✅ Upserted class-scope and subject-scope features into feature_catalog');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const keys = [
      'class-mark-attendance', 'class-daily-attendance', 'class-live-attendance',
      'class-recording-attendance', 'class-my-attendance', 'class-parents',
      'class-collect-payment', 'class-notifications',
      'subject-mark-attendance', 'subject-daily-attendance', 'subject-live-attendance',
      'subject-recording-attendance', 'subject-my-attendance',
      'subject-collect-payment', 'subject-notifications',
    ];
    await queryRunner.query(
      `DELETE FROM feature_catalog WHERE \`key\` IN (${keys.map(() => '?').join(',')})`,
      keys,
    );
  }
}
