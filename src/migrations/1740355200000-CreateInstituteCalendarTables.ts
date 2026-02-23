import { MigrationInterface, QueryRunner, Table, TableIndex, TableForeignKey } from 'typeorm';

export class CreateInstituteCalendarTables1740355200000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Create institute_operating_config table
    await queryRunner.createTable(
      new Table({
        name: 'institute_operating_config',
        columns: [
          {
            name: 'id',
            type: 'bigint',
            isPrimary: true,
            isGenerated: true,
            generationStrategy: 'increment',
          },
          {
            name: 'institute_id',
            type: 'bigint',
            isNullable: false,
          },
          {
            name: 'day_of_week',
            type: 'tinyint',
            isNullable: false,
            comment: '1=Monday, 2=Tuesday, ..., 7=Sunday (ISO 8601)',
          },
          {
            name: 'is_operating',
            type: 'boolean',
            default: true,
            isNullable: false,
          },
          {
            name: 'start_time',
            type: 'time',
            isNullable: true,
            comment: 'Default operating start, e.g. 08:00:00',
          },
          {
            name: 'end_time',
            type: 'time',
            isNullable: true,
            comment: 'Default operating end, e.g. 15:00:00',
          },
          {
            name: 'academic_year',
            type: 'varchar',
            length: '20',
            isNullable: false,
            comment: 'e.g. 2025 or 2025/2026',
          },
          {
            name: 'created_at',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
            isNullable: false,
          },
          {
            name: 'updated_at',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
            onUpdate: 'CURRENT_TIMESTAMP',
            isNullable: false,
          },
          {
            name: 'created_by',
            type: 'bigint',
            isNullable: true,
          },
        ],
      }),
      true,
    );

    // Create unique index
    await queryRunner.createIndex(
      'institute_operating_config',
      new TableIndex({
        name: 'uq_inst_dow_year',
        columnNames: ['institute_id', 'day_of_week', 'academic_year'],
        isUnique: true,
      }),
    );

    // Create regular index
    await queryRunner.createIndex(
      'institute_operating_config',
      new TableIndex({
        name: 'idx_inst_year',
        columnNames: ['institute_id', 'academic_year'],
      }),
    );

    // Add foreign key
    await queryRunner.createForeignKey(
      'institute_operating_config',
      new TableForeignKey({
        columnNames: ['institute_id'],
        referencedTableName: 'institutes',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
    );

    // 2. Create institute_calendar_days table
    await queryRunner.createTable(
      new Table({
        name: 'institute_calendar_days',
        columns: [
          {
            name: 'id',
            type: 'bigint',
            isPrimary: true,
            isGenerated: true,
            generationStrategy: 'increment',
          },
          {
            name: 'institute_id',
            type: 'bigint',
            isNullable: false,
          },
          {
            name: 'calendar_date',
            type: 'date',
            isNullable: false,
          },
          {
            name: 'academic_year',
            type: 'varchar',
            length: '20',
            isNullable: false,
          },
          {
            name: 'day_type',
            type: 'enum',
            enum: [
              'REGULAR',
              'WEEKEND',
              'PUBLIC_HOLIDAY',
              'INSTITUTE_HOLIDAY',
              'HALF_DAY',
              'EXAM_DAY',
              'STAFF_ONLY',
              'SPECIAL_EVENT',
              'CANCELLED',
            ],
            default: "'REGULAR'",
            isNullable: false,
          },
          {
            name: 'title',
            type: 'varchar',
            length: '255',
            isNullable: true,
          },
          {
            name: 'description',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'start_time',
            type: 'time',
            isNullable: true,
            comment: 'Override start time for this specific day',
          },
          {
            name: 'end_time',
            type: 'time',
            isNullable: true,
            comment: 'Override end time for this specific day',
          },
          {
            name: 'is_attendance_expected',
            type: 'boolean',
            default: true,
            isNullable: false,
            comment:
              'FALSE for holidays/weekends. TRUE for working days. Controls reporting.',
          },
          {
            name: 'source',
            type: 'enum',
            enum: ['AUTO_GENERATED', 'MANUAL', 'BULK_IMPORT'],
            default: "'AUTO_GENERATED'",
            isNullable: false,
            comment: 'How this row was created',
          },
          {
            name: 'created_at',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
            isNullable: false,
          },
          {
            name: 'updated_at',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
            onUpdate: 'CURRENT_TIMESTAMP',
            isNullable: false,
          },
          {
            name: 'created_by',
            type: 'bigint',
            isNullable: true,
          },
        ],
      }),
      true,
    );

    // Create indexes
    await queryRunner.createIndex(
      'institute_calendar_days',
      new TableIndex({
        name: 'uq_inst_date',
        columnNames: ['institute_id', 'calendar_date'],
        isUnique: true,
      }),
    );

    await queryRunner.createIndex(
      'institute_calendar_days',
      new TableIndex({
        name: 'idx_inst_year_type',
        columnNames: ['institute_id', 'academic_year', 'day_type'],
      }),
    );

    await queryRunner.createIndex(
      'institute_calendar_days',
      new TableIndex({
        name: 'idx_inst_date_range',
        columnNames: ['institute_id', 'calendar_date'],
      }),
    );

    await queryRunner.createIndex(
      'institute_calendar_days',
      new TableIndex({
        name: 'idx_inst_attendance_expected',
        columnNames: ['institute_id', 'is_attendance_expected', 'calendar_date'],
      }),
    );

    // Add foreign key
    await queryRunner.createForeignKey(
      'institute_calendar_days',
      new TableForeignKey({
        columnNames: ['institute_id'],
        referencedTableName: 'institutes',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
    );

    // 3. Create institute_calendar_events table
    await queryRunner.createTable(
      new Table({
        name: 'institute_calendar_events',
        columns: [
          {
            name: 'id',
            type: 'bigint',
            isPrimary: true,
            isGenerated: true,
            generationStrategy: 'increment',
          },
          {
            name: 'institute_id',
            type: 'bigint',
            isNullable: false,
          },
          {
            name: 'calendar_day_id',
            type: 'bigint',
            isNullable: true,
            comment:
              'FK to institute_calendar_days. NULL if event spans concepts beyond a single day',
          },
          {
            name: 'event_type',
            type: 'enum',
            enum: [
              'REGULAR_CLASS',
              'EXAM',
              'PARENTS_MEETING',
              'PRIZE_GIVING',
              'SPORTS_DAY',
              'CULTURAL_EVENT',
              'FIELD_TRIP',
              'WORKSHOP',
              'ORIENTATION',
              'OPEN_DAY',
              'RELIGIOUS_EVENT',
              'EXTRACURRICULAR',
              'STAFF_MEETING',
              'TRAINING',
              'GRADUATION',
              'ADMISSION',
              'MAINTENANCE',
              'CUSTOM',
            ],
            isNullable: false,
          },
          {
            name: 'title',
            type: 'varchar',
            length: '255',
            isNullable: false,
          },
          {
            name: 'description',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'event_date',
            type: 'date',
            isNullable: false,
          },
          {
            name: 'start_time',
            type: 'time',
            isNullable: true,
            comment: 'NULL = all day event',
          },
          {
            name: 'end_time',
            type: 'time',
            isNullable: true,
          },
          {
            name: 'is_all_day',
            type: 'boolean',
            default: false,
            isNullable: false,
          },
          {
            name: 'is_attendance_tracked',
            type: 'boolean',
            default: false,
            isNullable: false,
            comment: 'TRUE = system should track who attended this event',
          },
          {
            name: 'is_default',
            type: 'boolean',
            default: false,
            isNullable: false,
            comment:
              'When TRUE, attendance marked without explicit event_id goes to this event. Only ONE per day.',
          },
          {
            name: 'target_user_types',
            type: 'json',
            isNullable: true,
            comment:
              '["STUDENT","TEACHER","PARENT","INSTITUTE_ADMIN"] — NULL means all. Reporting only, never enforced.',
          },
          {
            name: 'attendance_open_to',
            type: 'enum',
            enum: ['TARGET_ONLY', 'ALL_ENROLLED', 'ANYONE'],
            default: "'ANYONE'",
            isNullable: false,
            comment:
              'ANYONE = any user can mark. TARGET_ONLY/ALL_ENROLLED are soft labels for reporting, NOT enforced.',
          },
          {
            name: 'target_scope',
            type: 'enum',
            enum: ['INSTITUTE', 'CLASS', 'SUBJECT'],
            default: "'INSTITUTE'",
            isNullable: false,
            comment:
              'INSTITUTE = whole institute, CLASS = specific classes, SUBJECT = specific subjects',
          },
          {
            name: 'target_class_ids',
            type: 'json',
            isNullable: true,
            comment:
              '[1, 5, 12] — specific class IDs. NULL = all classes (when scope is INSTITUTE)',
          },
          {
            name: 'target_subject_ids',
            type: 'json',
            isNullable: true,
            comment: '[3, 7] — specific subject IDs. NULL = all subjects',
          },
          {
            name: 'venue',
            type: 'varchar',
            length: '255',
            isNullable: true,
          },
          {
            name: 'meeting_link',
            type: 'text',
            isNullable: true,
            comment: 'For virtual events',
          },
          {
            name: 'status',
            type: 'enum',
            enum: ['SCHEDULED', 'ONGOING', 'COMPLETED', 'CANCELLED', 'POSTPONED'],
            default: "'SCHEDULED'",
            isNullable: false,
          },
          {
            name: 'max_participants',
            type: 'int',
            isNullable: true,
          },
          {
            name: 'is_mandatory',
            type: 'boolean',
            default: false,
            isNullable: false,
            comment: 'If TRUE, absence counts against attendance record',
          },
          {
            name: 'notes',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'created_at',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
            isNullable: false,
          },
          {
            name: 'updated_at',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
            onUpdate: 'CURRENT_TIMESTAMP',
            isNullable: false,
          },
          {
            name: 'created_by',
            type: 'bigint',
            isNullable: true,
          },
        ],
      }),
      true,
    );

    // Create indexes
    await queryRunner.createIndex(
      'institute_calendar_events',
      new TableIndex({
        name: 'idx_inst_date',
        columnNames: ['institute_id', 'event_date'],
      }),
    );

    await queryRunner.createIndex(
      'institute_calendar_events',
      new TableIndex({
        name: 'idx_inst_type',
        columnNames: ['institute_id', 'event_type'],
      }),
    );

    await queryRunner.createIndex(
      'institute_calendar_events',
      new TableIndex({
        name: 'idx_inst_date_type',
        columnNames: ['institute_id', 'event_date', 'event_type'],
      }),
    );

    await queryRunner.createIndex(
      'institute_calendar_events',
      new TableIndex({
        name: 'idx_calendar_day',
        columnNames: ['calendar_day_id'],
      }),
    );

    await queryRunner.createIndex(
      'institute_calendar_events',
      new TableIndex({
        name: 'idx_inst_tracked',
        columnNames: ['institute_id', 'is_attendance_tracked', 'event_date'],
      }),
    );

    // Add foreign keys
    await queryRunner.createForeignKey(
      'institute_calendar_events',
      new TableForeignKey({
        columnNames: ['institute_id'],
        referencedTableName: 'institutes',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
    );

    await queryRunner.createForeignKey(
      'institute_calendar_events',
      new TableForeignKey({
        columnNames: ['calendar_day_id'],
        referencedTableName: 'institute_calendar_days',
        referencedColumnNames: ['id'],
        onDelete: 'SET NULL',
      }),
    );

    // 4. Create institute_class_calendar table
    await queryRunner.createTable(
      new Table({
        name: 'institute_class_calendar',
        columns: [
          {
            name: 'id',
            type: 'bigint',
            isPrimary: true,
            isGenerated: true,
            generationStrategy: 'increment',
          },
          {
            name: 'institute_id',
            type: 'bigint',
            isNullable: false,
          },
          {
            name: 'class_id',
            type: 'bigint',
            isNullable: false,
          },
          {
            name: 'calendar_day_id',
            type: 'bigint',
            isNullable: false,
            comment: 'FK to institute_calendar_days',
          },
          {
            name: 'calendar_date',
            type: 'date',
            isNullable: false,
            comment: 'Denormalized for query performance',
          },
          {
            name: 'class_day_type',
            type: 'enum',
            enum: [
              'REGULAR',
              'CLASS_HOLIDAY',
              'FIELD_TRIP',
              'EXAM_DAY',
              'EXTRA_CLASS',
              'CANCELLED',
              'MERGED',
              'CUSTOM',
            ],
            isNullable: false,
          },
          {
            name: 'title',
            type: 'varchar',
            length: '255',
            isNullable: true,
          },
          {
            name: 'description',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'is_attendance_expected',
            type: 'boolean',
            default: true,
            isNullable: false,
          },
          {
            name: 'merged_with_class_id',
            type: 'bigint',
            isNullable: true,
          },
          {
            name: 'substitute_teacher_id',
            type: 'bigint',
            isNullable: true,
          },
          {
            name: 'created_at',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
            isNullable: false,
          },
          {
            name: 'updated_at',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
            onUpdate: 'CURRENT_TIMESTAMP',
            isNullable: false,
          },
          {
            name: 'created_by',
            type: 'bigint',
            isNullable: true,
          },
        ],
      }),
      true,
    );

    // Create indexes
    await queryRunner.createIndex(
      'institute_class_calendar',
      new TableIndex({
        name: 'uq_inst_class_date',
        columnNames: ['institute_id', 'class_id', 'calendar_date'],
        isUnique: true,
      }),
    );

    await queryRunner.createIndex(
      'institute_class_calendar',
      new TableIndex({
        name: 'idx_class_date_range',
        columnNames: ['institute_id', 'class_id', 'calendar_date'],
      }),
    );

    await queryRunner.createIndex(
      'institute_class_calendar',
      new TableIndex({
        name: 'idx_calendar_day',
        columnNames: ['calendar_day_id'],
      }),
    );

    // Add foreign keys
    await queryRunner.createForeignKey(
      'institute_class_calendar',
      new TableForeignKey({
        columnNames: ['institute_id'],
        referencedTableName: 'institutes',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
    );

    await queryRunner.createForeignKey(
      'institute_class_calendar',
      new TableForeignKey({
        columnNames: ['class_id'],
        referencedTableName: 'institute_classes',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
    );

    await queryRunner.createForeignKey(
      'institute_class_calendar',
      new TableForeignKey({
        columnNames: ['calendar_day_id'],
        referencedTableName: 'institute_calendar_days',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop tables in reverse order (to respect foreign keys)
    await queryRunner.dropTable('institute_class_calendar', true);
    await queryRunner.dropTable('institute_calendar_events', true);
    await queryRunner.dropTable('institute_calendar_days', true);
    await queryRunner.dropTable('institute_operating_config', true);
  }
}
