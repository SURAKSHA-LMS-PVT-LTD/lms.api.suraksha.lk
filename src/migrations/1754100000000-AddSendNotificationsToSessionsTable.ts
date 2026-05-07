import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSendNotificationsToSessionsTable1754100000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    const hasCol = await this.columnExists(queryRunner, 'institute_class_attendance_sessions', 'send_notifications');
    if (!hasCol) {
      await queryRunner.query(
        `ALTER TABLE \`institute_class_attendance_sessions\`
         ADD COLUMN \`send_notifications\` TINYINT(1) NOT NULL DEFAULT 1
         COMMENT 'Whether to send parent notifications when attendance is marked in this session'`,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const hasCol = await this.columnExists(queryRunner, 'institute_class_attendance_sessions', 'send_notifications');
    if (hasCol) {
      await queryRunner.query(
        `ALTER TABLE \`institute_class_attendance_sessions\` DROP COLUMN \`send_notifications\``,
      );
    }
  }

  private async columnExists(queryRunner: QueryRunner, table: string, column: string): Promise<boolean> {
    const result = await queryRunner.query(
      `SELECT COUNT(*) as cnt FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
      [table, column],
    );
    return result[0]?.cnt > 0;
  }
}
