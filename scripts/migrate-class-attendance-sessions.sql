-- ============================================================
-- Migration: Class-level Session-based Attendance
-- ============================================================

-- 1. Session Groups (e.g. "Morning", "Afternoon") per class
CREATE TABLE IF NOT EXISTS institute_class_attendance_session_groups (
  id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  institute_id    VARCHAR(64)     NOT NULL,
  class_id        VARCHAR(64)     NOT NULL,
  name            VARCHAR(100)    NOT NULL,
  color           VARCHAR(20)     NULL COMMENT 'Hex color e.g. #3B82F6',
  display_order   INT             NOT NULL DEFAULT 0,
  is_active       TINYINT(1)      NOT NULL DEFAULT 1,
  created_by      BIGINT UNSIGNED NULL,
  created_at      TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_icasg_class (institute_id, class_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 2. Sessions — one per attendance event within a class on a given day
CREATE TABLE IF NOT EXISTS institute_class_attendance_sessions (
  id                        BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  institute_id              VARCHAR(64)     NOT NULL,
  class_id                  VARCHAR(64)     NOT NULL,
  session_group_id          BIGINT UNSIGNED NULL,
  name                      VARCHAR(100)    NOT NULL,
  date                      DATE            NOT NULL    COMMENT 'YYYY-MM-DD session date',
  start_time                TIME            NOT NULL    COMMENT 'HH:MM session start time',
  end_time                  TIME            NULL        COMMENT 'HH:MM session end time',
  late_after_minutes        INT             NULL        COMMENT 'Minutes after start_time after which marking is LATE',
  left_early_before_minutes INT             NULL        COMMENT 'Minutes before end_time before which mark-out is LEFT_EARLY',
  is_closed                 TINYINT(1)      NOT NULL DEFAULT 0,
  closed_at                 TIMESTAMP       NULL,
  close_unmark_action       ENUM('KEEP_NOT_MARKED','MARK_ABSENT') NOT NULL DEFAULT 'KEEP_NOT_MARKED',
  total_students            INT             NOT NULL DEFAULT 0 COMMENT 'Snapshot of student count when session was created',
  created_by                BIGINT UNSIGNED NULL,
  created_at                TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at                TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_icas_class_date (institute_id, class_id, date),
  INDEX idx_icas_group      (session_group_id),
  CONSTRAINT fk_icas_group FOREIGN KEY (session_group_id)
    REFERENCES institute_class_attendance_session_groups(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 3. Add class_session_id to attendance_records (nullable — existing records unaffected)
ALTER TABLE attendance_records
  ADD COLUMN IF NOT EXISTS class_session_id BIGINT UNSIGNED NULL
    COMMENT 'Links to institute_class_attendance_sessions.id',
  ADD INDEX IF NOT EXISTS idx_ar_class_session (class_session_id);
