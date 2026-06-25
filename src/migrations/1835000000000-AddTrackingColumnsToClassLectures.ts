import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddTrackingColumnsToClassLectures1835000000000 implements MigrationInterface {
  name = 'AddTrackingColumnsToClassLectures1835000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const table = 'institute_class_lectures';
    const db = (await queryRunner.query('SELECT DATABASE() as db'))[0].db;

    const cols: Array<{ name: string; def: string }> = [
      { name: 'live_attendance_enabled', def: 'tinyint(1) NOT NULL DEFAULT 0' },
      { name: 'live_access_level',       def: "varchar(50) NOT NULL DEFAULT 'ENROLLED_ONLY'" },
      { name: 'live_payment_id',         def: 'varchar(36) NULL' },
      { name: 'live_url_id',             def: 'varchar(36) NULL' },
      { name: 'rec_attendance_enabled',  def: 'tinyint(1) NOT NULL DEFAULT 0' },
      { name: 'rec_platform',            def: "varchar(50) NOT NULL DEFAULT 'SYSTEM'" },
      { name: 'rec_access_level',        def: "varchar(50) NOT NULL DEFAULT 'ENROLLED_ONLY'" },
      { name: 'rec_payment_id',          def: 'varchar(36) NULL' },
      { name: 'rec_url_id',              def: 'varchar(36) NULL' },
      { name: 'rec_tracking_days',       def: 'int NULL' },
      { name: 'rec_duration_seconds',    def: 'int NULL' },
      { name: 'welcome_message_enabled',       def: 'tinyint(1) NOT NULL DEFAULT 0' },
      { name: 'welcome_message_text',          def: 'text NULL' },
      { name: 'welcome_message_voice_enabled', def: 'tinyint(1) NOT NULL DEFAULT 0' },
    ];

    for (const col of cols) {
      const rows: any[] = await queryRunner.query(
        `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
         WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
        [db, table, col.name],
      );
      if (rows.length === 0) {
        await queryRunner.query(
          `ALTER TABLE \`${table}\` ADD COLUMN \`${col.name}\` ${col.def}`,
        );
      }
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const table = 'institute_class_lectures';
    const cols = [
      'live_attendance_enabled', 'live_access_level', 'live_payment_id', 'live_url_id',
      'rec_attendance_enabled', 'rec_platform', 'rec_access_level', 'rec_payment_id',
      'rec_url_id', 'rec_tracking_days', 'rec_duration_seconds',
      'welcome_message_enabled', 'welcome_message_text', 'welcome_message_voice_enabled',
    ];
    for (const col of cols) {
      await queryRunner.query(`ALTER TABLE \`${table}\` DROP COLUMN IF EXISTS \`${col}\``);
    }
  }
}
