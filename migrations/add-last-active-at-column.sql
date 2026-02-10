-- =========================================================
-- Session Management Security Fixes - Database Migration
-- Date: 2026-02-10
-- Purpose: Add last_active_at column for session tracking
-- Database: MySQL 8.x
-- =========================================================

-- Step 1: Check if column exists and add it
SET @column_exists = (
  SELECT COUNT(*) 
  FROM information_schema.COLUMNS 
  WHERE TABLE_SCHEMA = 'suraksha-lms-db' 
    AND TABLE_NAME = 'refresh_tokens' 
    AND COLUMN_NAME = 'last_active_at'
);

SET @sql = IF(@column_exists = 0, 
  'ALTER TABLE refresh_tokens ADD COLUMN last_active_at TIMESTAMP NULL',
  'SELECT "✅ Column last_active_at already exists" as message'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Step 2: Initialize existing records with createdAt value
-- (Only for non-revoked sessions where last_active_at is NULL)
UPDATE refresh_tokens 
SET last_active_at = createdAt 
WHERE last_active_at IS NULL 
  AND isRevoked = 0;

-- Step 3: Verify the migration
SELECT 
  COUNT(*) as total_records,
  COUNT(last_active_at) as records_with_last_active,
  COUNT(*) - COUNT(last_active_at) as records_without_last_active,
  SUM(CASE WHEN isRevoked = 0 THEN 1 ELSE 0 END) as active_sessions
FROM refresh_tokens;

-- Step 4: Create index for better query performance
SET @index_exists = (
  SELECT COUNT(*) 
  FROM information_schema.STATISTICS 
  WHERE TABLE_SCHEMA = 'suraksha-lms-db' 
    AND TABLE_NAME = 'refresh_tokens' 
    AND INDEX_NAME = 'idx_refresh_token_last_active'
);

SET @sql = IF(@index_exists = 0,
  'CREATE INDEX idx_refresh_token_last_active ON refresh_tokens(userId, last_active_at DESC)',
  'SELECT "✅ Index idx_refresh_token_last_active already exists" as message'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- =========================================================
-- Migration Complete
-- =========================================================
SELECT '✅ Migration completed successfully!' as status;
SELECT '✅ last_active_at column is ready' as info;
SELECT '✅ Index created for performance' as info2;

-- =========================================================
-- Rollback Script (if needed)
-- =========================================================
-- To rollback this migration, run:
--
-- DROP INDEX idx_refresh_token_last_active ON refresh_tokens;
-- ALTER TABLE refresh_tokens DROP COLUMN last_active_at;
-- =========================================================
