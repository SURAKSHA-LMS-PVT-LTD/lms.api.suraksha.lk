-- Script to fix the index constraint issue for institute_lectures table
-- Error: Cannot drop index 'IDX_2c78a12592ac3cd64ab5cf1c5b': needed in a foreign key constraint

-- Step 1: Identify the problematic index
SELECT 
    CONSTRAINT_NAME,
    TABLE_NAME,
    COLUMN_NAME,
    REFERENCED_TABLE_NAME,
    REFERENCED_COLUMN_NAME
FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
WHERE TABLE_SCHEMA = DATABASE()
  AND CONSTRAINT_NAME LIKE '%2c78a12592ac3cd64ab5cf1c5b%';

-- Step 2: Find all foreign keys on institute_lectures table
SELECT 
    CONSTRAINT_NAME,
    TABLE_NAME,
    COLUMN_NAME,
    REFERENCED_TABLE_NAME,
    REFERENCED_COLUMN_NAME
FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
WHERE TABLE_SCHEMA = DATABASE()
  AND (TABLE_NAME = 'institute_lectures' OR REFERENCED_TABLE_NAME = 'institute_lectures')
  AND CONSTRAINT_NAME != 'PRIMARY';

-- Step 3: Check current indexes on institute_lectures
SELECT 
    INDEX_NAME,
    COLUMN_NAME,
    NON_UNIQUE,
    SEQ_IN_INDEX
FROM INFORMATION_SCHEMA.STATISTICS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'institute_lectures'
ORDER BY INDEX_NAME, SEQ_IN_INDEX;

-- Step 4: Temporarily disable foreign key checks
SET FOREIGN_KEY_CHECKS = 0;

-- Step 5: Drop the problematic index (if it exists and is not used by FK)
-- Note: This will fail if the index is still required by FK
-- In that case, we need to drop and recreate the FK first
DROP INDEX IF EXISTS IDX_2c78a12592ac3cd64ab5cf1c5b ON institute_lectures;

-- Step 6: Re-enable foreign key checks
SET FOREIGN_KEY_CHECKS = 1;

-- Step 7: Verify the fix
SELECT 
    INDEX_NAME,
    COLUMN_NAME,
    NON_UNIQUE,
    SEQ_IN_INDEX
FROM INFORMATION_SCHEMA.STATISTICS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'institute_lectures'
ORDER BY INDEX_NAME, SEQ_IN_INDEX;
