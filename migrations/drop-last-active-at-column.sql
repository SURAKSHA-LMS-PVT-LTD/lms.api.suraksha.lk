-- =========================================================================
-- 🗑️ DROP last_active_at COLUMN FROM refresh_tokens TABLE
-- =========================================================================
-- Database: suraksha-lms-db
-- Description: Removes the last_active_at column as it's logically incorrect
-- Date: 2026-02-10
-- Status: Ready for Production
-- =========================================================================

-- Check current table structure
SELECT 
    COLUMN_NAME, 
    DATA_TYPE, 
    IS_NULLABLE, 
    COLUMN_DEFAULT
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = 'suraksha-lms-db' 
  AND TABLE_NAME = 'refresh_tokens'
  AND COLUMN_NAME = 'last_active_at';

-- Drop the index first (if exists)
SET @drop_index_sql = NULL;
SELECT 
    CONCAT('DROP INDEX idx_refresh_token_last_active ON refresh_tokens;')
INTO @drop_index_sql
FROM INFORMATION_SCHEMA.STATISTICS
WHERE TABLE_SCHEMA = 'suraksha-lms-db'
  AND TABLE_NAME = 'refresh_tokens'
  AND INDEX_NAME = 'idx_refresh_token_last_active'
LIMIT 1;

-- Execute drop index if exists
PREPARE stmt FROM COALESCE(@drop_index_sql, 'SELECT "Index does not exist, skipping drop" AS Result');
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Drop the column (MySQL 8.x compatible)
SET @drop_column_sql = NULL;
SELECT 
    CONCAT('ALTER TABLE refresh_tokens DROP COLUMN last_active_at;')
INTO @drop_column_sql
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = 'suraksha-lms-db'
  AND TABLE_NAME = 'refresh_tokens'
  AND COLUMN_NAME = 'last_active_at';

-- Execute drop column if exists
PREPARE stmt FROM COALESCE(@drop_column_sql, 'SELECT "Column does not exist, nothing to drop" AS Result');
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Verify the column was dropped
SELECT 
    CASE 
        WHEN COUNT(*) = 0 THEN '✅ Column last_active_at successfully removed'
        ELSE '❌ Column last_active_at still exists'
    END AS Status
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = 'suraksha-lms-db' 
  AND TABLE_NAME = 'refresh_tokens'
  AND COLUMN_NAME = 'last_active_at';

-- Verify index was dropped
SELECT 
    CASE 
        WHEN COUNT(*) = 0 THEN '✅ Index idx_refresh_token_last_active successfully removed'
        ELSE '❌ Index idx_refresh_token_last_active still exists'
    END AS IndexStatus
FROM INFORMATION_SCHEMA.STATISTICS
WHERE TABLE_SCHEMA = 'suraksha-lms-db'
  AND TABLE_NAME = 'refresh_tokens'
  AND INDEX_NAME = 'idx_refresh_token_last_active';

-- Show final table structure
DESCRIBE refresh_tokens;

-- =========================================================================
-- ✅ MIGRATION COMPLETE
-- =========================================================================
