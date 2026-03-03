-- ═══════════════════════════════════════════════════════════════════
-- MIGRATION: Expand system_config with all configuration groups
-- Date: 2026-03-03
-- Description:
--   Seed all system-wide configuration groups for runtime management:
--   RATE_LIMIT, AUTH, FEATURE, SMS, CACHE, UPLOAD, PAGINATION,
--   SECURITY, ADVERTISEMENT, NOTIFICATION
-- ═══════════════════════════════════════════════════════════════════

-- ── RATE LIMITS ──────────────────────────────────────────────────
INSERT INTO `system_config` (`config_group`, `config_key`, `config_value`, `description`, `value_type`, `updated_by`) VALUES
('RATE_LIMIT', 'AUTH_LOGIN_LIMIT', '5', 'Max login attempts per window', 'NUMBER', 'MIGRATION'),
('RATE_LIMIT', 'AUTH_LOGIN_TTL_MS', '900000', 'Login rate limit window in ms (15 min)', 'NUMBER', 'MIGRATION'),
('RATE_LIMIT', 'AUTH_REFRESH_LIMIT', '10', 'Max token refreshes per window', 'NUMBER', 'MIGRATION'),
('RATE_LIMIT', 'AUTH_REFRESH_TTL_MS', '60000', 'Token refresh rate limit window in ms (1 min)', 'NUMBER', 'MIGRATION'),
('RATE_LIMIT', 'OTP_REQUEST_LIMIT', '3', 'Max OTP requests per 15 min', 'NUMBER', 'MIGRATION'),
('RATE_LIMIT', 'OTP_VERIFY_LIMIT', '5', 'Max OTP verifications per 15 min', 'NUMBER', 'MIGRATION'),
('RATE_LIMIT', 'OTP_RESEND_LIMIT', '2', 'Max OTP resends per 10 min', 'NUMBER', 'MIGRATION'),
('RATE_LIMIT', 'SMS_SEND_LIMIT', '10', 'Max SMS sends per 1 min', 'NUMBER', 'MIGRATION'),
('RATE_LIMIT', 'SMS_BULK_LIMIT', '3', 'Max bulk SMS per 1 min', 'NUMBER', 'MIGRATION'),
('RATE_LIMIT', 'PAYMENT_SUBMIT_LIMIT', '5', 'Max payment submissions per 15 min', 'NUMBER', 'MIGRATION'),
('RATE_LIMIT', 'ATTENDANCE_MARK_LIMIT', '30', 'Max attendance marks per 1 min', 'NUMBER', 'MIGRATION'),
('RATE_LIMIT', 'DEVICE_HEARTBEAT_LIMIT', '10', 'Device heartbeats per 1 min', 'NUMBER', 'MIGRATION'),
('RATE_LIMIT', 'DEVICE_ATTENDANCE_LIMIT', '60', 'Device attendance marks per 1 min', 'NUMBER', 'MIGRATION'),
('RATE_LIMIT', 'IMAGE_UPLOAD_LIMIT', '5', 'Profile image uploads per 15 min', 'NUMBER', 'MIGRATION'),
('RATE_LIMIT', 'PUBLIC_UPLOAD_LIMIT', '10', 'Public uploads per 1 min', 'NUMBER', 'MIGRATION')
ON DUPLICATE KEY UPDATE `updated_at` = CURRENT_TIMESTAMP;

-- ── AUTH ─────────────────────────────────────────────────────────
INSERT INTO `system_config` (`config_group`, `config_key`, `config_value`, `description`, `value_type`, `updated_by`) VALUES
('AUTH', 'OTP_EXPIRY_MINUTES', '30', 'OTP code expiry in minutes', 'NUMBER', 'MIGRATION'),
('AUTH', 'OTP_MAX_REQUESTS_PER_DAY', '5', 'Max OTP requests per user per day', 'NUMBER', 'MIGRATION'),
('AUTH', 'OTP_MAX_REREQUESTS_PER_DAY', '3', 'Max OTP re-requests per user per day', 'NUMBER', 'MIGRATION'),
('AUTH', 'OTP_MAX_RESEND_PER_HOUR', '3', 'Max OTP resend requests per hour', 'NUMBER', 'MIGRATION'),
('AUTH', 'OTP_MAX_VERIFY_ATTEMPTS', '5', 'Max OTP verification attempts before lockout', 'NUMBER', 'MIGRATION'),
('AUTH', 'PASSWORD_RESET_MAX_REQUESTS', '3', 'Max password reset requests per 15 min', 'NUMBER', 'MIGRATION'),
('AUTH', 'JWT_ACCESS_EXPIRY', '15m', 'JWT access token lifetime (e.g. 15m, 1h)', 'STRING', 'MIGRATION'),
('AUTH', 'JWT_REFRESH_EXPIRY', '7d', 'JWT refresh token lifetime (e.g. 7d, 30d)', 'STRING', 'MIGRATION'),
('AUTH', 'JWT_REFRESH_REMEMBER_ME', '30d', 'Refresh token lifetime with remember-me', 'STRING', 'MIGRATION'),
('AUTH', 'INSTITUTE_TOKEN_EXPIRY', '8h', 'Institute-specific token expiry', 'STRING', 'MIGRATION'),
('AUTH', 'BCRYPT_SALT_ROUNDS', '12', 'Bcrypt password hashing rounds (10-14 recommended)', 'NUMBER', 'MIGRATION')
ON DUPLICATE KEY UPDATE `updated_at` = CURRENT_TIMESTAMP;

-- ── FEATURE FLAGS ────────────────────────────────────────────────
INSERT INTO `system_config` (`config_group`, `config_key`, `config_value`, `description`, `value_type`, `updated_by`) VALUES
('FEATURE', 'ADS_FROM_DB', 'false', 'Load ads from DB (true) or ENV defaults (false)', 'BOOLEAN', 'MIGRATION'),
('FEATURE', 'ATTENDANCE_NOTIFICATIONS', 'true', 'Send notifications on attendance marking', 'BOOLEAN', 'MIGRATION'),
('FEATURE', 'WHATSAPP_TEMPLATES', 'false', 'Use WhatsApp template messages for notifications', 'BOOLEAN', 'MIGRATION'),
('FEATURE', 'EMAIL_MASKING', 'false', 'Mask email addresses in API responses', 'BOOLEAN', 'MIGRATION'),
('FEATURE', 'PHONE_MASKING', 'false', 'Mask phone numbers in API responses', 'BOOLEAN', 'MIGRATION'),
('FEATURE', 'ENHANCED_IP_VALIDATION', 'false', 'Enable IP-based admin access restrictions', 'BOOLEAN', 'MIGRATION'),
('FEATURE', 'CACHE_ENABLED', 'false', 'Master switch for Redis caching', 'BOOLEAN', 'MIGRATION'),
('FEATURE', 'CACHE_USER_ENABLED', 'true', 'Enable user data caching in Redis', 'BOOLEAN', 'MIGRATION'),
('FEATURE', 'CACHE_ADVERTISEMENT_ENABLED', 'true', 'Enable advertisement caching in Redis', 'BOOLEAN', 'MIGRATION'),
('FEATURE', 'MAINTENANCE_MODE', 'false', 'System-wide maintenance mode — blocks all non-admin requests', 'BOOLEAN', 'MIGRATION'),
('FEATURE', 'ENROLLMENT_CHECK_ATTENDANCE', 'false', 'Only enrolled students can mark attendance', 'BOOLEAN', 'MIGRATION'),
('FEATURE', 'ENROLLMENT_CHECK_VEHICLE', 'false', 'Only enrolled vehicle students can mark attendance', 'BOOLEAN', 'MIGRATION')
ON DUPLICATE KEY UPDATE `updated_at` = CURRENT_TIMESTAMP;

-- ── SMS ──────────────────────────────────────────────────────────
INSERT INTO `system_config` (`config_group`, `config_key`, `config_value`, `description`, `value_type`, `updated_by`) VALUES
('SMS', 'BATCH_SIZE', '50', 'SMS sending batch size', 'NUMBER', 'MIGRATION'),
('SMS', 'MAX_CONCURRENT_BATCHES', '5', 'Max concurrent SMS batch sends', 'NUMBER', 'MIGRATION'),
('SMS', 'MAX_RECIPIENTS_PER_BATCH', '500', 'SMSlenz API max recipients per batch', 'NUMBER', 'MIGRATION'),
('SMS', 'MAX_MESSAGE_LENGTH', '1500', 'Max SMS character length', 'NUMBER', 'MIGRATION'),
('SMS', 'HTTP_TIMEOUT_MS', '30000', 'SMS API call timeout in ms', 'NUMBER', 'MIGRATION'),
('SMS', 'MAX_BULK_COUNT', '1000', 'Max recipients per bulk SMS request', 'NUMBER', 'MIGRATION'),
('SMS', 'CREDIT_PER_SMS', '1.0', 'Cost per SMS in credits', 'STRING', 'MIGRATION')
ON DUPLICATE KEY UPDATE `updated_at` = CURRENT_TIMESTAMP;

-- ── CACHE ────────────────────────────────────────────────────────
INSERT INTO `system_config` (`config_group`, `config_key`, `config_value`, `description`, `value_type`, `updated_by`) VALUES
('CACHE', 'DEFAULT_TTL_SECONDS', '604800', 'Default cache TTL in seconds (7 days)', 'NUMBER', 'MIGRATION'),
('CACHE', 'USER_TTL_DAYS', '30', 'User cache TTL in days', 'NUMBER', 'MIGRATION'),
('CACHE', 'AD_TTL_SECONDS', '3600', 'Advertisement cache TTL in seconds (1 hour)', 'NUMBER', 'MIGRATION'),
('CACHE', 'AD_METRICS_SYNC_MINUTES', '10', 'Ad metrics sync interval in minutes', 'NUMBER', 'MIGRATION'),
('CACHE', 'SYSTEM_CONFIG_TTL_MS', '300000', 'System config in-memory cache TTL in ms (5 min)', 'NUMBER', 'MIGRATION')
ON DUPLICATE KEY UPDATE `updated_at` = CURRENT_TIMESTAMP;

-- ── UPLOAD ───────────────────────────────────────────────────────
INSERT INTO `system_config` (`config_group`, `config_key`, `config_value`, `description`, `value_type`, `updated_by`) VALUES
('UPLOAD', 'MAX_FILE_SIZE_MB', '100', 'Absolute maximum file upload size in MB', 'NUMBER', 'MIGRATION'),
('UPLOAD', 'PROFILE_IMAGE_MAX_MB', '5', 'Profile image max size in MB', 'NUMBER', 'MIGRATION'),
('UPLOAD', 'STUDENT_IMAGE_MAX_MB', '5', 'Student image max size in MB', 'NUMBER', 'MIGRATION'),
('UPLOAD', 'INSTITUTE_IMAGE_MAX_MB', '10', 'Institute image max size in MB', 'NUMBER', 'MIGRATION'),
('UPLOAD', 'HOMEWORK_FILE_MAX_MB', '20', 'Homework file max size in MB', 'NUMBER', 'MIGRATION'),
('UPLOAD', 'CORRECTION_FILE_MAX_MB', '20', 'Correction file max size in MB', 'NUMBER', 'MIGRATION'),
('UPLOAD', 'PAYMENT_RECEIPT_MAX_MB', '10', 'Payment receipt max size in MB', 'NUMBER', 'MIGRATION'),
('UPLOAD', 'ID_DOCUMENT_MAX_MB', '10', 'ID document max size in MB', 'NUMBER', 'MIGRATION'),
('UPLOAD', 'UPLOAD_URL_EXPIRY_SECONDS', '600', 'Signed upload URL expiry in seconds (10 min)', 'NUMBER', 'MIGRATION'),
('UPLOAD', 'VIEW_URL_EXPIRY_SECONDS', '3600', 'Signed view URL expiry in seconds (1 hour)', 'NUMBER', 'MIGRATION')
ON DUPLICATE KEY UPDATE `updated_at` = CURRENT_TIMESTAMP;

-- ── PAGINATION ───────────────────────────────────────────────────
INSERT INTO `system_config` (`config_group`, `config_key`, `config_value`, `description`, `value_type`, `updated_by`) VALUES
('PAGINATION', 'DEFAULT_LIMIT', '10', 'Default page size for list endpoints', 'NUMBER', 'MIGRATION'),
('PAGINATION', 'MAX_LIMIT', '100', 'Maximum allowed page size', 'NUMBER', 'MIGRATION'),
('PAGINATION', 'MAX_BULK_ATTENDANCE_SIZE', '100', 'Max attendance records per bulk request', 'NUMBER', 'MIGRATION')
ON DUPLICATE KEY UPDATE `updated_at` = CURRENT_TIMESTAMP;

-- ── SECURITY ─────────────────────────────────────────────────────
INSERT INTO `system_config` (`config_group`, `config_key`, `config_value`, `description`, `value_type`, `updated_by`) VALUES
('SECURITY', 'COMPRESSION_THRESHOLD', '1024', 'Response compression threshold in bytes', 'NUMBER', 'MIGRATION'),
('SECURITY', 'COMPRESSION_LEVEL', '6', 'gzip compression level (1-9)', 'NUMBER', 'MIGRATION'),
('SECURITY', 'DB_CONNECTION_LIMIT', '25', 'MySQL connection pool size', 'NUMBER', 'MIGRATION'),
('SECURITY', 'DDB_BATCH_WRITE_SIZE', '25', 'DynamoDB batch write limit', 'NUMBER', 'MIGRATION'),
('SECURITY', 'ATTENDANCE_TTL_YEARS', '7', 'DynamoDB attendance record TTL in years', 'NUMBER', 'MIGRATION'),
('SECURITY', 'HSTS_MAX_AGE', '31536000', 'HSTS header max-age in seconds (1 year)', 'NUMBER', 'MIGRATION')
ON DUPLICATE KEY UPDATE `updated_at` = CURRENT_TIMESTAMP;

-- ── ADVERTISEMENT ────────────────────────────────────────────────
INSERT INTO `system_config` (`config_group`, `config_key`, `config_value`, `description`, `value_type`, `updated_by`) VALUES
('ADVERTISEMENT', 'DEFAULT_TITLE', 'LaaS Platform', 'Default ad title when ADS_FROM_DB=false', 'STRING', 'MIGRATION'),
('ADVERTISEMENT', 'DEFAULT_CONTENT', 'Quality Education for Everyone', 'Default ad content text', 'STRING', 'MIGRATION'),
('ADVERTISEMENT', 'DEFAULT_MEDIA_URL', 'https://example.com/ad.jpg', 'Default ad image URL', 'STRING', 'MIGRATION'),
('ADVERTISEMENT', 'DEFAULT_TYPE', 'text', 'Default ad type: text, image, video', 'ENUM', 'MIGRATION')
ON DUPLICATE KEY UPDATE `updated_at` = CURRENT_TIMESTAMP;

-- ── NOTIFICATION ─────────────────────────────────────────────────
INSERT INTO `system_config` (`config_group`, `config_key`, `config_value`, `description`, `value_type`, `updated_by`) VALUES
('NOTIFICATION', 'MAX_DEVICES_PER_USER', '10', 'Max FCM-registered devices per user', 'NUMBER', 'MIGRATION'),
('NOTIFICATION', 'MAX_RETRY', '3', 'Max notification delivery retry attempts', 'NUMBER', 'MIGRATION')
ON DUPLICATE KEY UPDATE `updated_at` = CURRENT_TIMESTAMP;

