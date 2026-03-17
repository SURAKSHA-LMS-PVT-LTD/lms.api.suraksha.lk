-- ═══════════════════════════════════════════════════════════════════
-- MIGRATION: attendance_records — add indexes for class_id & subject_id
-- Date: 2026-03-17
-- Reason:
--   class_id and subject_id have no index.
--   All JOIN/WHERE queries that filter by class or subject scan every row.
--   Adding these indexes makes them O(log n) like student_id/institute_id.
-- ═══════════════════════════════════════════════════════════════════

DROP PROCEDURE IF EXISTS `safe_add_index`;

CREATE PROCEDURE `safe_add_index`(
  IN p_table  VARCHAR(64),
  IN p_index  VARCHAR(64),
  IN p_col    VARCHAR(128)
)
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME   = p_table
      AND INDEX_NAME   = p_index
  ) THEN
    SET @sql = CONCAT('ALTER TABLE `', p_table, '` ADD INDEX `', p_index, '` (', p_col, ')');
    PREPARE stmt FROM @sql;
    EXECUTE stmt;
    DEALLOCATE PREPARE stmt;
  END IF;
END;

CALL `safe_add_index`('attendance_records', 'IDX_class',   '`class_id`');
CALL `safe_add_index`('attendance_records', 'IDX_subject', '`subject_id`');

DROP PROCEDURE IF EXISTS `safe_add_index`;
