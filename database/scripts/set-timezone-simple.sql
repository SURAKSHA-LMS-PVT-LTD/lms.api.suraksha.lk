-- Set session timezone to Sri Lanka
SET time_zone = '+05:30';

-- Verify the change
SELECT @@session.time_zone AS session_timezone, NOW() AS sri_lanka_time, UTC_TIMESTAMP() AS utc_time;

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
