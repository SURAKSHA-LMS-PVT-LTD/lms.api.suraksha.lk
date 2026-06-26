import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Removes event_type and event_title from both summary tables.
 * Those columns duplicated data already in institute_calendar_events.
 * event_date is kept because it is used as the range-query index key
 * (avoids a join just to filter by month/date range).
 *
 * The query methods now JOIN institute_calendar_events to get title/type/time.
 */
export class DropRedundantColumnsFromEventSummaries1842000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Drop event_type and event_title from institute_event_summaries
    await queryRunner.query(`
      ALTER TABLE institute_event_summaries
        DROP INDEX idx_ies_institute_type,
        DROP COLUMN event_type,
        DROP COLUMN event_title
    `);

    // Drop event_type and event_title from institute_event_class_summaries
    await queryRunner.query(`
      ALTER TABLE institute_event_class_summaries
        DROP INDEX idx_iecs_institute_type,
        DROP COLUMN event_type,
        DROP COLUMN event_title
    `);

    console.log('✅ Dropped event_type and event_title from summary tables');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE institute_event_summaries
        ADD COLUMN event_type  VARCHAR(50)  NOT NULL DEFAULT '' AFTER event_date,
        ADD COLUMN event_title VARCHAR(255) NOT NULL DEFAULT '' AFTER event_type,
        ADD INDEX idx_ies_institute_type (institute_id, event_type)
    `);
    await queryRunner.query(`
      ALTER TABLE institute_event_class_summaries
        ADD COLUMN event_type  VARCHAR(50)  NOT NULL DEFAULT '' AFTER event_date,
        ADD COLUMN event_title VARCHAR(255) NOT NULL DEFAULT '' AFTER event_type,
        ADD INDEX idx_iecs_institute_type (institute_id, class_id, event_type)
    `);
  }
}
