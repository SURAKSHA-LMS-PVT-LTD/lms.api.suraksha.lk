-- Fix institute_lectures table schema
-- This script handles the migration from timestamp to datetime for start_time and end_time columns
-- and adds missing column name for status field

-- Step 1: Check current structure
SELECT 
    COLUMN_NAME, 
    DATA_TYPE, 
    COLUMN_TYPE,
    IS_NULLABLE,
    COLUMN_DEFAULT
FROM INFORMATION_SCHEMA.COLUMNS 
WHERE TABLE_SCHEMA = DATABASE() 
  AND TABLE_NAME = 'institute_lectures'
  AND COLUMN_NAME IN ('start_time', 'end_time', 'status')
ORDER BY ORDINAL_POSITION;

-- Step 2: Modify columns if they are timestamp (change to datetime)
-- Note: This will preserve existing data
ALTER TABLE institute_lectures 
MODIFY COLUMN start_time DATETIME NOT NULL;

ALTER TABLE institute_lectures 
MODIFY COLUMN end_time DATETIME NOT NULL;

-- Step 3: Verify the changes
SELECT 
    COLUMN_NAME, 
    DATA_TYPE, 
    COLUMN_TYPE,
    IS_NULLABLE,
    COLUMN_DEFAULT
FROM INFORMATION_SCHEMA.COLUMNS 
WHERE TABLE_SCHEMA = DATABASE() 
  AND TABLE_NAME = 'institute_lectures'
  AND COLUMN_NAME IN ('start_time', 'end_time', 'status')
ORDER BY ORDINAL_POSITION;

-- Step 4: Check indexes
SELECT 
    INDEX_NAME,
    COLUMN_NAME,
    NON_UNIQUE,
    SEQ_IN_INDEX
FROM INFORMATION_SCHEMA.STATISTICS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'institute_lectures'
ORDER BY INDEX_NAME, SEQ_IN_INDEX;
