-- ============================================================================
-- Update MySQL Timezone Configuration to Sri Lanka Time (UTC+5:30)
-- Date: January 15, 2026
-- Purpose: Ensure all timestamps use Asia/Colombo timezone
-- ============================================================================

-- Step 1: Check current timezone settings
SELECT @@global.time_zone AS global_timezone, 
       @@session.time_zone AS session_timezone,
       NOW() AS current_server_time,
       UTC_TIMESTAMP() AS current_utc_time;

-- Step 2: Set global timezone to Sri Lanka (if you have SUPER privilege)
-- Uncomment the following line if you have permissions:
-- SET GLOBAL time_zone = '+05:30';

-- Step 3: Set session timezone (this will affect current connection)
SET time_zone = '+05:30';

-- Step 4: Verify the change
SELECT @@session.time_zone AS session_timezone,
       NOW() AS sri_lanka_time,
       UTC_TIMESTAMP() AS utc_time,
       CONVERT_TZ(NOW(), '+05:30', '+00:00') AS now_as_utc;

-- ============================================================================
-- Optional: Update existing timestamp columns (if needed)
-- WARNING: This will modify existing data - use with caution!
-- ============================================================================

-- Example: Update user creation timestamps (UNCOMMENT ONLY IF NEEDED)
-- UPDATE users 
-- SET createdAt = CONVERT_TZ(createdAt, '+00:00', '+05:30'),
--     updatedAt = CONVERT_TZ(updatedAt, '+00:00', '+05:30')
-- WHERE createdAt IS NOT NULL;

-- ============================================================================
-- Verification Queries
-- ============================================================================

-- Check timestamp consistency across tables
SELECT 
    'users' AS table_name,
    COUNT(*) AS total_records,
    MIN(createdAt) AS earliest_date,
    MAX(createdAt) AS latest_date
FROM users
UNION ALL
SELECT 
    'user_id_card_orders' AS table_name,
    COUNT(*) AS total_records,
    MIN(createdAt) AS earliest_date,
    MAX(createdAt) AS latest_date
FROM user_id_card_orders
UNION ALL
SELECT 
    'card_payments' AS table_name,
    COUNT(*) AS total_records,
    MIN(createdAt) AS earliest_date,
    MAX(createdAt) AS latest_date
FROM card_payments;

-- ============================================================================
-- Additional Information
-- ============================================================================

/*
Sri Lanka Timezone: Asia/Colombo (UTC+5:30)

To permanently set timezone in MySQL configuration file (my.cnf or my.ini):
[mysqld]
default-time-zone='+05:30'

For Docker/Cloud deployments, set environment variable:
TZ=Asia/Colombo

Application-level timezone is already configured in:
- src/main.ts: process.env.TZ = 'Asia/Colombo'
- src/app.module.ts: timezone: '+05:30'
- src/data-source.ts: timezone: '+05:30'

All new date/time operations in code now use:
- src/common/utils/timezone.util.ts functions
*/
