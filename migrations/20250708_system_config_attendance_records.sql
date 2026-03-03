-- ═══════════════════════════════════════════════════════════════════
-- MIGRATION: system_config + attendance_records
-- Date: 2025-07-08
-- Description:
--   1. Create generic system_config key-value table for all system settings
--   2. Create attendance_records MySQL mirror for DynamoDB sync
--   3. Seed default attendance sync config rows
-- ═══════════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────────────
-- 1. SYSTEM CONFIG — Generic key-value settings store
-- ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `system_config` (
  `id` BIGINT AUTO_INCREMENT,
  `config_group` VARCHAR(64) NOT NULL COMMENT 'Logical group: ATTENDANCE, SYSTEM, NOTIFICATIONS, etc.',
  `config_key` VARCHAR(128) NOT NULL COMMENT 'Setting key within the group',
  `config_value` TEXT NOT NULL COMMENT 'Setting value (string, parsed by consumer)',
  `description` VARCHAR(512) NULL COMMENT 'Human-readable description',
  `value_type` VARCHAR(32) NOT NULL DEFAULT 'STRING' COMMENT 'Type hint: STRING, NUMBER, BOOLEAN, JSON, ENUM',
  `is_active` BOOLEAN NOT NULL DEFAULT TRUE COMMENT 'Inactive = treated as not set',
  `updated_by` VARCHAR(64) NULL COMMENT 'User ID who last changed this',
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `UQ_group_key` (`config_group`, `config_key`),
  INDEX `IDX_config_group` (`config_group`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Generic system-wide key-value configuration store';


-- ───────────────────────────────────────────────────────────────────
-- 2. ATTENDANCE RECORDS — MySQL mirror of DynamoDB attendance
-- ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `attendance_records` (
  `id` BIGINT AUTO_INCREMENT,
  `dynamo_pk` VARCHAR(128) NOT NULL COMMENT 'DynamoDB partition key: I#<instituteId>',
  `dynamo_sk` VARCHAR(512) NOT NULL COMMENT 'DynamoDB sort key',
  `institute_id` VARCHAR(64) NOT NULL,
  `institute_name` VARCHAR(255) NULL,
  `student_id` VARCHAR(64) NOT NULL,
  `student_name` VARCHAR(255) NULL,
  `date` DATE NOT NULL COMMENT 'Attendance date (YYYY-MM-DD)',
  `status` TINYINT NOT NULL COMMENT '0=Absent, 1=Present, 2=Late, 3=Left, 4=LeftEarly, 5=LeftLately',
  `timestamp` BIGINT NOT NULL COMMENT 'DynamoDB write timestamp (epoch ms)',
  `class_id` VARCHAR(64) NULL,
  `class_name` VARCHAR(255) NULL,
  `subject_id` VARCHAR(64) NULL,
  `subject_name` VARCHAR(255) NULL,
  `calendar_day_id` BIGINT NULL COMMENT 'FK → institute_calendar_days.id',
  `event_id` BIGINT NULL COMMENT 'FK → institute_calendar_events.id',
  `location` VARCHAR(255) NULL,
  `remarks` TEXT NULL,
  `marking_method` VARCHAR(64) NULL COMMENT 'MANUAL, NFC, QR, DEVICE, FACE, etc.',
  `user_type` VARCHAR(32) NULL COMMENT 'STUDENT, TEACHER, INSTITUTE_ADMIN, etc.',
  `device_uid` VARCHAR(128) NULL COMMENT 'Attendance device UID',
  `sync_status` VARCHAR(16) NOT NULL DEFAULT 'SYNCED' COMMENT 'PENDING, SYNCED, FAILED, SKIPPED',
  `sync_error` TEXT NULL COMMENT 'Error message if sync_status=FAILED',
  `synced_at` TIMESTAMP NULL COMMENT 'When this record was synced to MySQL',
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `UQ_dynamo_pk_sk` (`dynamo_pk`, `dynamo_sk`),
  INDEX `IDX_institute_date` (`institute_id`, `date`),
  INDEX `IDX_student_date` (`student_id`, `date`),
  INDEX `IDX_calendar_day` (`calendar_day_id`),
  INDEX `IDX_event` (`event_id`),
  INDEX `IDX_sync_status` (`sync_status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='MySQL mirror of DynamoDB attendance records for reporting/sync';


-- ───────────────────────────────────────────────────────────────────
-- 3. SEED DEFAULT ATTENDANCE CONFIG
-- ───────────────────────────────────────────────────────────────────
INSERT INTO `system_config` (`config_group`, `config_key`, `config_value`, `description`, `value_type`, `updated_by`)
VALUES
  ('ATTENDANCE', 'SYNC_MODE', 'DYNAMO_FIRST',
   'Attendance DynamoDB→MySQL sync mode: IMMEDIATE | DYNAMO_FIRST | BACKEND_SCHEDULE',
   'ENUM', 'MIGRATION'),
  ('ATTENDANCE', 'SYNC_CRON', '0 */15 * * * *',
   'Cron expression for BACKEND_SCHEDULE sync (every 15 minutes)',
   'STRING', 'MIGRATION'),
  ('ATTENDANCE', 'SYNC_BATCH_SIZE', '500',
   'Records per sync batch for BACKEND_SCHEDULE mode',
   'NUMBER', 'MIGRATION'),
  ('ATTENDANCE', 'SYNC_ENABLED', 'true',
   'Master switch for attendance DynamoDB→MySQL sync',
   'BOOLEAN', 'MIGRATION')
ON DUPLICATE KEY UPDATE
  `updated_at` = CURRENT_TIMESTAMP;


-- ───────────────────────────────────────────────────────────────────
-- 4. DROP OLD TABLE (if the per-institute one was created)
-- ───────────────────────────────────────────────────────────────────
DROP TABLE IF EXISTS `attendance_sync_config`;
