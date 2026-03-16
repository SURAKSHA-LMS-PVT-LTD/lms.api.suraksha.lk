-- ═══════════════════════════════════════════════════════════════════
-- MIGRATION: attendance_records — add latitude / longitude columns
-- Date: 2026-03-17
-- ═══════════════════════════════════════════════════════════════════

-- Guard procedure: adds a column only if it does not exist
DROP PROCEDURE IF EXISTS `safe_add_column`;

CREATE PROCEDURE `safe_add_column`(
  IN p_table  VARCHAR(64),
  IN p_column VARCHAR(64),
  IN p_ddl    TEXT
)
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME   = p_table
      AND COLUMN_NAME  = p_column
  ) THEN
    SET @sql = CONCAT('ALTER TABLE `', p_table, '` ADD COLUMN ', p_ddl);
    PREPARE stmt FROM @sql;
    EXECUTE stmt;
    DEALLOCATE PREPARE stmt;
  END IF;
END;

-- Add latitude column
CALL `safe_add_column`(
  'attendance_records',
  'latitude',
  '`latitude` DECIMAL(10,8) NULL COMMENT ''Latitude coordinate (decimal degrees)'' AFTER `location`'
);

-- Add longitude column
CALL `safe_add_column`(
  'attendance_records',
  'longitude',
  '`longitude` DECIMAL(11,8) NULL COMMENT ''Longitude coordinate (decimal degrees)'' AFTER `latitude`'
);

DROP PROCEDURE IF EXISTS `safe_add_column`;


-- Guard procedure: adds an index only if it does not exist
DROP PROCEDURE IF EXISTS `safe_add_index`;

CREATE PROCEDURE `safe_add_index`(
  IN p_table VARCHAR(64),
  IN p_index VARCHAR(64),
  IN p_cols  TEXT
)
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME   = p_table
      AND INDEX_NAME   = p_index
  ) THEN
    SET @sql = CONCAT('ALTER TABLE `', p_table, '` ADD INDEX `', p_index, '` (', p_cols, ')');
    PREPARE stmt FROM @sql;
    EXECUTE stmt;
    DEALLOCATE PREPARE stmt;
  END IF;
END;

-- Add missing composite index
CALL `safe_add_index`(
  'attendance_records',
  'IDX_student_institute_date',
  '`student_id`, `institute_id`, `date`'
);

DROP PROCEDURE IF EXISTS `safe_add_index`;
