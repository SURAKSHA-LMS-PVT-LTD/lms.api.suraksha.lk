import { MigrationInterface, QueryRunner } from 'typeorm';

// Video/lecture attendance features are core functionality — not a paid add-on.
// Mark them as is_core=true and pricing='FREE' so they are always available
// to every institute without requiring an explicit feature toggle row.
const CORE_VIDEO_ATTENDANCE_KEYS = [
  'lecture-live-attendance',
  'lecture-recording-attendance',
  'class-live-attendance',
  'class-recording-attendance',
  'subject-live-attendance',
  'subject-recording-attendance',
];

export class MarkVideoAttendanceFeaturesAsCore1823000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    const placeholders = CORE_VIDEO_ATTENDANCE_KEYS.map(() => '?').join(', ');
    await queryRunner.query(
      `UPDATE feature_catalog
          SET is_core = 1, pricing = 'FREE'
        WHERE \`key\` IN (${placeholders})`,
      CORE_VIDEO_ATTENDANCE_KEYS,
    );
    console.log(`✅ Marked ${CORE_VIDEO_ATTENDANCE_KEYS.length} video attendance features as core (FREE)`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const placeholders = CORE_VIDEO_ATTENDANCE_KEYS.map(() => '?').join(', ');
    await queryRunner.query(
      `UPDATE feature_catalog
          SET is_core = 0, pricing = 'PAID'
        WHERE \`key\` IN (${placeholders})`,
      CORE_VIDEO_ATTENDANCE_KEYS,
    );
  }
}
