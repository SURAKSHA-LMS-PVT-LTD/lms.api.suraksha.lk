import { MigrationInterface, QueryRunner } from 'typeorm';

const TABLES = [
  'account_deletion_requests',
  'advertisements',
  'attendance_device_audit_log',
  'attendance_device_config',
  'attendance_device_event_bindings',
  'attendance_device_sessions',
  'attendance_devices',
  'attendance_records',
  'finance_accounts',
  'finance_categories',
  'finance_ledger',
  'institute_billing_config',
  'institute_class_lectures',
  'institute_drive_files',
  'institute_drive_tokens',
  'institute_feature_permissions',
  'institute_house',
  'institute_house_member',
  'institute_user_types',
  'login_events',
  'monthly_billing_summary',
  'org_assignments',
  'org_causes',
  'org_documentation',
  'org_lectures',
  'org_organization_users',
  'org_organizations',
  'reason_of_parent_skip',
  'system_config',
  'teacher_wallets',
  'user_drive_files',
  'user_drive_tokens',
  'user_otps',
];

export class FixCollations1800000000004 implements MigrationInterface {
  name = 'FixCollations1800000000004';

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const table of TABLES) {
      await queryRunner.query(
        `ALTER TABLE \`${table}\` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci`
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const table of TABLES) {
      await queryRunner.query(
        `ALTER TABLE \`${table}\` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
      );
    }
  }
}
