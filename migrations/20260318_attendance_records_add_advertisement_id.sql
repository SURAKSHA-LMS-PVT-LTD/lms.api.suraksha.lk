-- MIGRATION: attendance_records - add advertisement_id for ad delivery traceability
-- Date: 2026-03-18
-- Purpose:
--   1) Persist matched advertisement ID with each attendance mirror record
--   2) Enable admin audit/reporting for ad delivery by attendance event

ALTER TABLE `attendance_records`
  ADD COLUMN IF NOT EXISTS `advertisement_id` VARCHAR(128) NULL
  COMMENT 'Advertisement ID associated with this attendance record (for delivery capability tracking)'
  AFTER `device_uid`;

CREATE INDEX IF NOT EXISTS `IDX_advertisement_id`
  ON `attendance_records` (`advertisement_id`);
  