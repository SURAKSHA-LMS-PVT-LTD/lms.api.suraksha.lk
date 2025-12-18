    -- =====================================================
    -- FIX FOR: Cannot drop index 'IDX_2c78a12592ac3cd64ab5cf1c5b': needed in a foreign key constraint
    -- =====================================================
    -- 
    -- This script fixes the TypeORM synchronization issue with the institute_lectures table.
    -- Run these commands in your MySQL client (phpMyAdmin, MySQL Workbench, etc.)
    -- 
    -- =====================================================

    -- Step 1: Disable foreign key checks temporarily
    SET FOREIGN_KEY_CHECKS = 0;

    -- Step 2: Drop the problematic index (if it exists)
    DROP INDEX IF EXISTS IDX_2c78a12592ac3cd64ab5cf1c5b ON institute_lectures;

    -- Step 3: Re-enable foreign key checks
    SET FOREIGN_KEY_CHECKS = 1;

    -- Step 4: Verify the indexes
    SELECT 
        INDEX_NAME,
        COLUMN_NAME,
        NON_UNIQUE
    FROM INFORMATION_SCHEMA.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'institute_lectures'
    ORDER BY INDEX_NAME;

    -- =====================================================
    -- After running this script:
    -- 1. Restart your NestJS application (npm run start:dev)
    -- 2. The application should start successfully
    -- 3. TypeORM will create the correct indexes automatically
    -- =====================================================
