# 📊 System Config Expansion Analysis — Performance & Runtime Configurability

> **Last Updated:** 2025-07-09  
> **Objective:** Identify all hardcoded values, ENV-only settings, and performance-critical parameters that should be migrated to the `system_config` table for runtime configurability.

---

## Executive Summary

The codebase audit identified **100+ hardcoded values** and **50+ environment variables** across the system. Currently, only **4 config entries** (ATTENDANCE group) use the `system_config` table. This analysis proposes migrating **65+ settings** into `system_config`, organized by priority and impact.

### Impact on Performance

Moving settings to `system_config` enables:
- **Zero-downtime tuning** — Adjust rate limits, batch sizes, cache TTLs without redeployment
- **A/B testing** — Toggle features on/off for testing
- **Emergency response** — Disable features, increase limits, or enable maintenance mode instantly
- **Cost optimization** — Tune SMS batch sizes, cache durations to reduce API/infrastructure costs

---

## Priority 1: HIGH IMPACT — Immediate Migration

> Settings that admins frequently need to change for performance tuning or incident response.

### 1.1 Rate Limits (40+ endpoints)

**Current:** All rate limits are hardcoded via `@Throttle()` decorators — requires code changes and redeployment.

**Proposed Group:** `RATE_LIMIT`

| Key | Current Value | Value Type | Description |
|-----|--------------|------------|-------------|
| `AUTH_LOGIN_LIMIT` | `5` | NUMBER | Login attempts per 15 min |
| `AUTH_LOGIN_TTL_MS` | `900000` | NUMBER | Login rate limit window (ms) |
| `AUTH_REFRESH_LIMIT` | `10` | NUMBER | Token refresh per 1 min |
| `AUTH_REFRESH_TTL_MS` | `60000` | NUMBER | Refresh rate limit window (ms) |
| `OTP_REQUEST_LIMIT` | `3` | NUMBER | OTP requests per 15 min |
| `OTP_VERIFY_LIMIT` | `5` | NUMBER | OTP verifications per 15 min |
| `OTP_RESEND_LIMIT` | `2` | NUMBER | OTP resends per 10 min |
| `SMS_SEND_LIMIT` | `10` | NUMBER | SMS sends per 1 min |
| `SMS_BULK_LIMIT` | `3` | NUMBER | Bulk SMS per 1 min |
| `PAYMENT_SUBMIT_LIMIT` | `5` | NUMBER | Payment submissions per 15 min |
| `ATTENDANCE_MARK_LIMIT` | `30` | NUMBER | Attendance marks per 1 min |
| `DEVICE_HEARTBEAT_LIMIT` | `10` | NUMBER | Device heartbeats per 1 min |
| `DEVICE_ATTENDANCE_LIMIT` | `60` | NUMBER | Device attendance per 1 min |
| `IMAGE_UPLOAD_LIMIT` | `5` | NUMBER | Profile image uploads per 15 min |
| `PUBLIC_UPLOAD_LIMIT` | `10` | NUMBER | Public uploads per 1 min |

**Performance Gain:** When under DDoS or unusual load, rate limits can be tightened instantly without deployment. During legitimate bulk operations, limits can be temporarily raised.

**Migration SQL:**
```sql
INSERT INTO system_config (config_group, config_key, config_value, description, value_type, updated_by) VALUES
('RATE_LIMIT', 'AUTH_LOGIN_LIMIT', '5', 'Max login attempts per window', 'NUMBER', 'MIGRATION'),
('RATE_LIMIT', 'AUTH_LOGIN_TTL_MS', '900000', 'Login rate limit window in ms (15 min)', 'NUMBER', 'MIGRATION'),
('RATE_LIMIT', 'AUTH_REFRESH_LIMIT', '10', 'Max token refreshes per window', 'NUMBER', 'MIGRATION'),
('RATE_LIMIT', 'AUTH_REFRESH_TTL_MS', '60000', 'Token refresh window in ms (1 min)', 'NUMBER', 'MIGRATION'),
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
ON DUPLICATE KEY UPDATE updated_at = CURRENT_TIMESTAMP;
```

**Backend Implementation Pattern:**
```typescript
// Create a RateLimitConfigService similar to AttendanceSyncConfigService
@Injectable()
export class RateLimitConfigService {
  constructor(private readonly systemConfigService: SystemConfigService) {}

  async getLimit(endpoint: string): Promise<{ limit: number; ttl: number }> {
    const limit = await this.systemConfigService.getNumber('RATE_LIMIT', `${endpoint}_LIMIT`, 10);
    const ttl = await this.systemConfigService.getNumber('RATE_LIMIT', `${endpoint}_TTL_MS`, 60000);
    return { limit, ttl };
  }
}
```

---

### 1.2 OTP & Authentication Config

**Current:** Hardcoded in `user-otp.service.ts`, `first-login.service.ts`, `password-reset.service.ts`

**Proposed Group:** `AUTH`

| Key | Current Value | Value Type | Source File | Description |
|-----|--------------|------------|-------------|-------------|
| `OTP_EXPIRY_MINUTES` | `30` | NUMBER | user-otp.service.ts:14 | OTP expiry duration |
| `OTP_MAX_REQUESTS_PER_DAY` | `5` | NUMBER | user-otp.service.ts:15 | Max OTP requests per day |
| `OTP_MAX_REREQUESTS_PER_DAY` | `3` | NUMBER | user-otp.service.ts:16 | Max OTP re-requests per day |
| `OTP_MAX_RESEND_PER_HOUR` | `3` | NUMBER | first-login.service.ts:363 | Max OTP resends per hour |
| `OTP_MAX_VERIFY_ATTEMPTS` | `5` | NUMBER | first-login.service.ts:189 | Max verification attempts |
| `PASSWORD_RESET_MAX_REQUESTS` | `3` | NUMBER | password-reset.service.ts:134 | Max reset requests per 15 min |
| `JWT_ACCESS_EXPIRY` | `15m` | STRING | auth.config.ts:5 | JWT access token lifetime |
| `JWT_REFRESH_EXPIRY` | `7d` | STRING | auth.config.ts:7 | Refresh token lifetime |
| `JWT_REFRESH_REMEMBER_ME` | `30d` | STRING | auth.service.ts:1296 | Refresh token with remember-me |
| `INSTITUTE_TOKEN_EXPIRY` | `8h` | STRING | institute-token.service.ts:82 | Institute-specific token expiry |
| `FIRST_LOGIN_TOKEN_EXPIRY` | `15m` | STRING | first-login.service.ts:200 | First login verification token |
| `PROFILE_COMPLETION_TOKEN_EXPIRY` | `30d` | STRING | first-login.service.ts:428 | Profile completion token |
| `BCRYPT_SALT_ROUNDS` | `12` | NUMBER | auth.service.ts:65 | Bcrypt hashing rounds |

**Performance Gain:**
- Reduce OTP expiry during active abuse → immediate protection
- Increase token expiry during stable periods → fewer refresh requests → less DB load
- Adjust bcrypt rounds for CPU/security trade-off (NOTE: affects login speed)

**Migration SQL:**
```sql
INSERT INTO system_config (config_group, config_key, config_value, description, value_type, updated_by) VALUES
('AUTH', 'OTP_EXPIRY_MINUTES', '30', 'OTP code expiry duration in minutes', 'NUMBER', 'MIGRATION'),
('AUTH', 'OTP_MAX_REQUESTS_PER_DAY', '5', 'Maximum OTP generation requests per user per day', 'NUMBER', 'MIGRATION'),
('AUTH', 'OTP_MAX_REREQUESTS_PER_DAY', '3', 'Maximum OTP re-requests per user per day', 'NUMBER', 'MIGRATION'),
('AUTH', 'OTP_MAX_RESEND_PER_HOUR', '3', 'Maximum OTP resend requests per hour', 'NUMBER', 'MIGRATION'),
('AUTH', 'OTP_MAX_VERIFY_ATTEMPTS', '5', 'Maximum OTP verification attempts before lockout', 'NUMBER', 'MIGRATION'),
('AUTH', 'PASSWORD_RESET_MAX_REQUESTS', '3', 'Maximum password reset requests per 15 min', 'NUMBER', 'MIGRATION'),
('AUTH', 'JWT_ACCESS_EXPIRY', '15m', 'JWT access token lifetime (e.g., 15m, 1h)', 'STRING', 'MIGRATION'),
('AUTH', 'JWT_REFRESH_EXPIRY', '7d', 'JWT refresh token lifetime (e.g., 7d, 30d)', 'STRING', 'MIGRATION'),
('AUTH', 'JWT_REFRESH_REMEMBER_ME', '30d', 'Refresh token lifetime with remember-me', 'STRING', 'MIGRATION'),
('AUTH', 'INSTITUTE_TOKEN_EXPIRY', '8h', 'Institute-specific token expiry', 'STRING', 'MIGRATION'),
('AUTH', 'BCRYPT_SALT_ROUNDS', '12', 'Bcrypt password hashing rounds (10-14)', 'NUMBER', 'MIGRATION')
ON DUPLICATE KEY UPDATE updated_at = CURRENT_TIMESTAMP;
```

---

### 1.3 Feature Flags

**Current:** ENV-only boolean toggles scattered across services — require container restart.

**Proposed Group:** `FEATURE`

| Key | Current Value | Value Type | Description |
|-----|--------------|------------|-------------|
| `ADS_FROM_DB` | `false` | BOOLEAN | Load advertisements from DB vs ENV defaults |
| `ATTENDANCE_NOTIFICATIONS` | `true` | BOOLEAN | Master switch for attendance notifications |
| `WHATSAPP_TEMPLATES` | `false` | BOOLEAN | Use WhatsApp template messages |
| `EMAIL_MASKING` | `false` | BOOLEAN | Mask email addresses in API responses |
| `PHONE_MASKING` | `false` | BOOLEAN | Mask phone numbers in API responses |
| `ENHANCED_IP_VALIDATION` | `false` | BOOLEAN | IP-based admin access restrictions |
| `CACHE_ENABLED` | `false` | BOOLEAN | Master Redis cache switch |
| `CACHE_USER_ENABLED` | `true` | BOOLEAN | User data caching |
| `CACHE_ADVERTISEMENT_ENABLED` | `true` | BOOLEAN | Advertisement caching |
| `MAINTENANCE_MODE` | `false` | BOOLEAN | System-wide maintenance mode (NEW) |
| `ENROLLMENT_CHECK_ATTENDANCE` | `false` | BOOLEAN | Only enrolled students can mark attendance |
| `ENROLLMENT_CHECK_VEHICLE` | `false` | BOOLEAN | Only enrolled vehicle students attend |

**Performance Gain:**
- Toggle caching on/off without restart during Redis issues
- Disable notifications instantly during notification service outages
- Enable maintenance mode during deployments
- Data masking toggle for GDPR compliance

**Migration SQL:**
```sql
INSERT INTO system_config (config_group, config_key, config_value, description, value_type, updated_by) VALUES
('FEATURE', 'ADS_FROM_DB', 'false', 'Load advertisements from database (true) or ENV defaults (false)', 'BOOLEAN', 'MIGRATION'),
('FEATURE', 'ATTENDANCE_NOTIFICATIONS', 'true', 'Send notifications on attendance marking', 'BOOLEAN', 'MIGRATION'),
('FEATURE', 'WHATSAPP_TEMPLATES', 'false', 'Use WhatsApp template messages for notifications', 'BOOLEAN', 'MIGRATION'),
('FEATURE', 'EMAIL_MASKING', 'false', 'Mask email addresses in API responses', 'BOOLEAN', 'MIGRATION'),
('FEATURE', 'PHONE_MASKING', 'false', 'Mask phone numbers in API responses', 'BOOLEAN', 'MIGRATION'),
('FEATURE', 'ENHANCED_IP_VALIDATION', 'false', 'Enable IP-based admin access restrictions', 'BOOLEAN', 'MIGRATION'),
('FEATURE', 'CACHE_ENABLED', 'false', 'Master switch for Redis caching', 'BOOLEAN', 'MIGRATION'),
('FEATURE', 'CACHE_USER_ENABLED', 'true', 'Enable user data caching', 'BOOLEAN', 'MIGRATION'),
('FEATURE', 'CACHE_ADVERTISEMENT_ENABLED', 'true', 'Enable advertisement caching', 'BOOLEAN', 'MIGRATION'),
('FEATURE', 'MAINTENANCE_MODE', 'false', 'System-wide maintenance mode — blocks all non-admin requests', 'BOOLEAN', 'MIGRATION'),
('FEATURE', 'ENROLLMENT_CHECK_ATTENDANCE', 'false', 'Only enrolled institute students can mark attendance', 'BOOLEAN', 'MIGRATION'),
('FEATURE', 'ENROLLMENT_CHECK_VEHICLE', 'false', 'Only enrolled vehicle students can mark attendance', 'BOOLEAN', 'MIGRATION')
ON DUPLICATE KEY UPDATE updated_at = CURRENT_TIMESTAMP;
```

---

## Priority 2: MEDIUM IMPACT — Short-term Migration

> Settings that affect performance tuning and operational efficiency.

### 2.1 SMS & Messaging Config

**Proposed Group:** `SMS`

| Key | Current Value | Value Type | Source | Description |
|-----|--------------|------------|--------|-------------|
| `BATCH_SIZE` | `50` | NUMBER | sms.service.ts:85 | SMS sending batch size |
| `MAX_CONCURRENT_BATCHES` | `5` | NUMBER | sms.service.ts:86 | Max concurrent batch sends |
| `MAX_RECIPIENTS_PER_BATCH` | `500` | NUMBER | sms-provider.service.ts:68 | SMSlenz API limit |
| `MAX_MESSAGE_LENGTH` | `1500` | NUMBER | sms-provider.service.ts:69 | Max SMS character length |
| `HTTP_TIMEOUT_MS` | `30000` | NUMBER | sms-provider.service.ts:70 | SMS API call timeout |
| `MAX_BULK_COUNT` | `1000` | NUMBER | sms-enhanced.service.ts:123 | Max recipients per bulk request |
| `CREDIT_PER_SMS` | `1.0` | STRING | sms-enhanced.service.ts:102 | Cost per message in credits |
| `CREDENTIALS_CACHE_TTL_MS` | `1800000` | NUMBER | sms.service.ts:80 | SMS credentials cache: 30 min |
| `RECIPIENTS_CACHE_TTL_MS` | `900000` | NUMBER | sms.service.ts:81 | SMS recipients cache: 15 min |
| `COUNT_CACHE_TTL_MS` | `600000` | NUMBER | sms.service.ts:82 | SMS count cache: 10 min |

**Performance Gain:**
- Increase batch size during high-volume notifications → faster delivery
- Adjust timeout when SMS provider is slow → prevent request queue buildup
- Tune credit cost when provider pricing changes

---

### 2.2 Cache TTL Configuration

**Proposed Group:** `CACHE`

| Key | Current Value | Value Type | Source | Description |
|-----|--------------|------------|--------|-------------|
| `DEFAULT_TTL_SECONDS` | `604800` | NUMBER | cache.config.ts:39 | Default cache TTL (7 days) |
| `USER_TTL_DAYS` | `30` | NUMBER | cache.config.ts:41 | User cache TTL (30 days) |
| `AD_TTL_SECONDS` | `3600` | NUMBER | advertisement-cache.service.ts:35 | Ad cache TTL (1 hour) |
| `AD_METRICS_SYNC_MINUTES` | `10` | NUMBER | advertisement-cache.service.ts:36 | Ad metrics sync interval |
| `SYSTEM_CONFIG_TTL_MS` | `300000` | NUMBER | system-config.service.ts:31 | System config cache TTL (5 min) |
| `SYSTEM_CONFIG_CLEANUP_MS` | `600000` | NUMBER | Internal | Cache cleanup interval (10 min) |

**Performance Gain:**
- Shorter TTLs during active content updates → fresher data, more DB reads
- Longer TTLs during stable periods → fewer DB queries, better response times
- Tune system_config cache TTL itself for faster vs. more consistent config changes

---

### 2.3 File Upload Limits

**Proposed Group:** `UPLOAD`

| Key | Current Value | Value Type | Source | Description |
|-----|--------------|------------|--------|-------------|
| `MAX_FILE_SIZE_MB` | `100` | NUMBER | upload.controller.ts:742 | Absolute max file size |
| `PROFILE_IMAGE_MAX_MB` | `5` | NUMBER | upload.controller.ts:716 | Profile image max size |
| `STUDENT_IMAGE_MAX_MB` | `5` | NUMBER | upload.controller.ts:717 | Student image max size |
| `INSTITUTE_IMAGE_MAX_MB` | `10` | NUMBER | upload.controller.ts:718 | Institute image max size |
| `HOMEWORK_FILE_MAX_MB` | `20` | NUMBER | upload.controller.ts:721 | Homework file max size |
| `CORRECTION_FILE_MAX_MB` | `20` | NUMBER | upload.controller.ts:722 | Correction file max size |
| `PAYMENT_RECEIPT_MAX_MB` | `10` | NUMBER | upload.controller.ts:723 | Payment receipt max size |
| `ID_DOCUMENT_MAX_MB` | `10` | NUMBER | upload.controller.ts:725 | ID document max size |
| `UPLOAD_URL_EXPIRY_SECONDS` | `600` | NUMBER | upload.controller.ts:143 | Signed upload URL expiry (10 min) |
| `VIEW_URL_EXPIRY_SECONDS` | `3600` | NUMBER | payment-slip:92 | Signed view URL expiry (1 hour) |

**Performance Gain:**
- Dynamic size limits → adjust when storage costs change or during quotas
- URL expiry tuning → shorter for security, longer for slow connections

---

### 2.4 Pagination Defaults

**Proposed Group:** `PAGINATION`

| Key | Current Value | Value Type | Source | Description |
|-----|--------------|------------|--------|-------------|
| `DEFAULT_PAGE` | `1` | NUMBER | user.constants.ts:22 | Default page number |
| `DEFAULT_LIMIT` | `10` | NUMBER | user.constants.ts:23 | Default page size |
| `MAX_LIMIT` | `100` | NUMBER | user.constants.ts:24 | Maximum page size |
| `EXAM_DEFAULT_LIMIT` | `20` | NUMBER | exam.constants.ts:117 | Exam list page size |
| `EXAM_MAX_LIMIT` | `100` | NUMBER | exam.constants.ts:118 | Exam list max page size |
| `MAX_BULK_ATTENDANCE_SIZE` | `100` | NUMBER | attendance.controller.ts:129 | Max attendance records per bulk request |

**Performance Gain:**
- Reduce default page size during high DB load → faster responses
- Increase max limit for admin bulk operations → fewer round trips

---

## Priority 3: LOWER IMPACT — Long-term Migration

> Settings that change infrequently but benefit from centralized management.

### 3.1 Advertisement Defaults

**Proposed Group:** `ADVERTISEMENT`

| Key | Current Value | Value Type | Description |
|-----|--------------|------------|-------------|
| `DEFAULT_TITLE` | `LaaS Platform` | STRING | Default ad title when `ADS_FROM_DB=false` |
| `DEFAULT_CONTENT` | `Quality Education...` | STRING | Default ad content |
| `DEFAULT_MEDIA_URL` | `https://example.com/ad.jpg` | STRING | Default ad image URL |
| `DEFAULT_URL` | (empty) | STRING | Default ad click-through URL |
| `DEFAULT_TYPE` | `text` | ENUM | Default ad type: `text`, `image`, `video` |

### 3.2 Notification Config

**Proposed Group:** `NOTIFICATION`

| Key | Current Value | Value Type | Description |
|-----|--------------|------------|-------------|
| `MAX_DEVICES_PER_USER` | `10` | NUMBER | Max FCM-registered devices per user |
| `WHATSAPP_PHONE_NUMBER_ID` | (env) | STRING | WhatsApp Business phone number ID |
| `FIREBASE_PROJECT_ID` | (env) | STRING | Firebase project for push notifications |

### 3.3 Security & Network

**Proposed Group:** `SECURITY`

| Key | Current Value | Value Type | Description |
|-----|--------------|------------|-------------|
| `COMPRESSION_THRESHOLD` | `1024` | NUMBER | Response compression threshold (bytes) |
| `COMPRESSION_LEVEL` | `6` | NUMBER | gzip compression level (1-9) |
| `HSTS_MAX_AGE` | `31536000` | NUMBER | HSTS header max-age (1 year) |
| `DB_CONNECTION_LIMIT` | `25` | NUMBER | MySQL connection pool size |
| `REDIS_CONNECTION_TIMEOUT_MS` | `120000` | NUMBER | Redis connection timeout (2 min) |
| `DDB_BATCH_WRITE_SIZE` | `25` | NUMBER | DynamoDB batch write limit |
| `ATTENDANCE_TTL_YEARS` | `7` | NUMBER | DynamoDB attendance record TTL |

---

## Complete Migration SQL (All Groups)

Below is the full migration SQL to seed all proposed config groups:

```sql
-- ═══════════════════════════════════════════════════════════════════
-- MIGRATION: Expand system_config with all proposed groups
-- Date: 2025-07-XX
-- ═══════════════════════════════════════════════════════════════════

-- ── RATE LIMITS ──
INSERT INTO system_config (config_group, config_key, config_value, description, value_type, updated_by) VALUES
('RATE_LIMIT', 'AUTH_LOGIN_LIMIT', '5', 'Max login attempts per window (15 min)', 'NUMBER', 'MIGRATION'),
('RATE_LIMIT', 'AUTH_LOGIN_TTL_MS', '900000', 'Login rate limit window in ms', 'NUMBER', 'MIGRATION'),
('RATE_LIMIT', 'AUTH_REFRESH_LIMIT', '10', 'Max token refreshes per window (1 min)', 'NUMBER', 'MIGRATION'),
('RATE_LIMIT', 'AUTH_REFRESH_TTL_MS', '60000', 'Token refresh rate limit window in ms', 'NUMBER', 'MIGRATION'),
('RATE_LIMIT', 'OTP_REQUEST_LIMIT', '3', 'Max OTP requests per 15 min', 'NUMBER', 'MIGRATION'),
('RATE_LIMIT', 'OTP_VERIFY_LIMIT', '5', 'Max OTP verifications per 15 min', 'NUMBER', 'MIGRATION'),
('RATE_LIMIT', 'SMS_SEND_LIMIT', '10', 'Max SMS sends per 1 min', 'NUMBER', 'MIGRATION'),
('RATE_LIMIT', 'SMS_BULK_LIMIT', '3', 'Max bulk SMS per 1 min', 'NUMBER', 'MIGRATION'),
('RATE_LIMIT', 'ATTENDANCE_MARK_LIMIT', '30', 'Max attendance marks per 1 min', 'NUMBER', 'MIGRATION'),
('RATE_LIMIT', 'DEVICE_ATTENDANCE_LIMIT', '60', 'Device attendance marks per 1 min', 'NUMBER', 'MIGRATION'),
('RATE_LIMIT', 'IMAGE_UPLOAD_LIMIT', '5', 'Profile image uploads per 15 min', 'NUMBER', 'MIGRATION'),
('RATE_LIMIT', 'PUBLIC_UPLOAD_LIMIT', '10', 'Public uploads per 1 min', 'NUMBER', 'MIGRATION')
ON DUPLICATE KEY UPDATE updated_at = CURRENT_TIMESTAMP;

-- ── AUTH ──
INSERT INTO system_config (config_group, config_key, config_value, description, value_type, updated_by) VALUES
('AUTH', 'OTP_EXPIRY_MINUTES', '30', 'OTP code expiry in minutes', 'NUMBER', 'MIGRATION'),
('AUTH', 'OTP_MAX_REQUESTS_PER_DAY', '5', 'Max OTP requests per user per day', 'NUMBER', 'MIGRATION'),
('AUTH', 'OTP_MAX_VERIFY_ATTEMPTS', '5', 'Max OTP verification attempts before lockout', 'NUMBER', 'MIGRATION'),
('AUTH', 'PASSWORD_RESET_MAX_REQUESTS', '3', 'Max password reset requests per 15 min', 'NUMBER', 'MIGRATION'),
('AUTH', 'JWT_ACCESS_EXPIRY', '15m', 'JWT access token lifetime', 'STRING', 'MIGRATION'),
('AUTH', 'JWT_REFRESH_EXPIRY', '7d', 'JWT refresh token lifetime', 'STRING', 'MIGRATION'),
('AUTH', 'JWT_REFRESH_REMEMBER_ME', '30d', 'Refresh token with remember-me', 'STRING', 'MIGRATION'),
('AUTH', 'INSTITUTE_TOKEN_EXPIRY', '8h', 'Institute-specific token expiry', 'STRING', 'MIGRATION'),
('AUTH', 'BCRYPT_SALT_ROUNDS', '12', 'Bcrypt hashing rounds (10-14 recommended)', 'NUMBER', 'MIGRATION')
ON DUPLICATE KEY UPDATE updated_at = CURRENT_TIMESTAMP;

-- ── FEATURE FLAGS ──
INSERT INTO system_config (config_group, config_key, config_value, description, value_type, updated_by) VALUES
('FEATURE', 'ADS_FROM_DB', 'false', 'Load ads from DB (true) or ENV defaults (false)', 'BOOLEAN', 'MIGRATION'),
('FEATURE', 'ATTENDANCE_NOTIFICATIONS', 'true', 'Send notifications on attendance marking', 'BOOLEAN', 'MIGRATION'),
('FEATURE', 'WHATSAPP_TEMPLATES', 'false', 'Use WhatsApp template messages', 'BOOLEAN', 'MIGRATION'),
('FEATURE', 'EMAIL_MASKING', 'false', 'Mask email addresses in API responses', 'BOOLEAN', 'MIGRATION'),
('FEATURE', 'PHONE_MASKING', 'false', 'Mask phone numbers in API responses', 'BOOLEAN', 'MIGRATION'),
('FEATURE', 'ENHANCED_IP_VALIDATION', 'false', 'Enable IP-based admin access restrictions', 'BOOLEAN', 'MIGRATION'),
('FEATURE', 'CACHE_ENABLED', 'false', 'Master switch for Redis caching', 'BOOLEAN', 'MIGRATION'),
('FEATURE', 'MAINTENANCE_MODE', 'false', 'System-wide maintenance mode', 'BOOLEAN', 'MIGRATION'),
('FEATURE', 'ENROLLMENT_CHECK_ATTENDANCE', 'false', 'Only enrolled students can mark attendance', 'BOOLEAN', 'MIGRATION'),
('FEATURE', 'ENROLLMENT_CHECK_VEHICLE', 'false', 'Only enrolled vehicle students can attend', 'BOOLEAN', 'MIGRATION')
ON DUPLICATE KEY UPDATE updated_at = CURRENT_TIMESTAMP;

-- ── SMS ──
INSERT INTO system_config (config_group, config_key, config_value, description, value_type, updated_by) VALUES
('SMS', 'BATCH_SIZE', '50', 'SMS sending batch size', 'NUMBER', 'MIGRATION'),
('SMS', 'MAX_CONCURRENT_BATCHES', '5', 'Max concurrent batch sends', 'NUMBER', 'MIGRATION'),
('SMS', 'MAX_RECIPIENTS_PER_BATCH', '500', 'SMSlenz API max recipients per batch', 'NUMBER', 'MIGRATION'),
('SMS', 'MAX_MESSAGE_LENGTH', '1500', 'Max SMS character length', 'NUMBER', 'MIGRATION'),
('SMS', 'HTTP_TIMEOUT_MS', '30000', 'SMS API call timeout in ms', 'NUMBER', 'MIGRATION'),
('SMS', 'MAX_BULK_COUNT', '1000', 'Max recipients per bulk request', 'NUMBER', 'MIGRATION'),
('SMS', 'CREDIT_PER_SMS', '1.0', 'Cost per SMS in credits', 'STRING', 'MIGRATION')
ON DUPLICATE KEY UPDATE updated_at = CURRENT_TIMESTAMP;

-- ── CACHE ──
INSERT INTO system_config (config_group, config_key, config_value, description, value_type, updated_by) VALUES
('CACHE', 'DEFAULT_TTL_SECONDS', '604800', 'Default cache TTL (7 days)', 'NUMBER', 'MIGRATION'),
('CACHE', 'USER_TTL_DAYS', '30', 'User cache TTL in days', 'NUMBER', 'MIGRATION'),
('CACHE', 'AD_TTL_SECONDS', '3600', 'Advertisement cache TTL (1 hour)', 'NUMBER', 'MIGRATION'),
('CACHE', 'AD_METRICS_SYNC_MINUTES', '10', 'Ad metrics sync interval in minutes', 'NUMBER', 'MIGRATION'),
('CACHE', 'SYSTEM_CONFIG_TTL_MS', '300000', 'System config cache TTL (5 min)', 'NUMBER', 'MIGRATION')
ON DUPLICATE KEY UPDATE updated_at = CURRENT_TIMESTAMP;

-- ── UPLOAD ──
INSERT INTO system_config (config_group, config_key, config_value, description, value_type, updated_by) VALUES
('UPLOAD', 'MAX_FILE_SIZE_MB', '100', 'Absolute max file upload size in MB', 'NUMBER', 'MIGRATION'),
('UPLOAD', 'PROFILE_IMAGE_MAX_MB', '5', 'Profile image max size in MB', 'NUMBER', 'MIGRATION'),
('UPLOAD', 'HOMEWORK_FILE_MAX_MB', '20', 'Homework file max size in MB', 'NUMBER', 'MIGRATION'),
('UPLOAD', 'PAYMENT_RECEIPT_MAX_MB', '10', 'Payment receipt max size in MB', 'NUMBER', 'MIGRATION'),
('UPLOAD', 'ID_DOCUMENT_MAX_MB', '10', 'ID document max size in MB', 'NUMBER', 'MIGRATION'),
('UPLOAD', 'UPLOAD_URL_EXPIRY_SECONDS', '600', 'Signed upload URL expiry (10 min)', 'NUMBER', 'MIGRATION'),
('UPLOAD', 'VIEW_URL_EXPIRY_SECONDS', '3600', 'Signed view URL expiry (1 hour)', 'NUMBER', 'MIGRATION')
ON DUPLICATE KEY UPDATE updated_at = CURRENT_TIMESTAMP;

-- ── PAGINATION ──
INSERT INTO system_config (config_group, config_key, config_value, description, value_type, updated_by) VALUES
('PAGINATION', 'DEFAULT_LIMIT', '10', 'Default page size', 'NUMBER', 'MIGRATION'),
('PAGINATION', 'MAX_LIMIT', '100', 'Maximum page size', 'NUMBER', 'MIGRATION'),
('PAGINATION', 'MAX_BULK_ATTENDANCE_SIZE', '100', 'Max attendance records per bulk request', 'NUMBER', 'MIGRATION')
ON DUPLICATE KEY UPDATE updated_at = CURRENT_TIMESTAMP;

-- ── SECURITY ──
INSERT INTO system_config (config_group, config_key, config_value, description, value_type, updated_by) VALUES
('SECURITY', 'COMPRESSION_THRESHOLD', '1024', 'Response compression threshold in bytes', 'NUMBER', 'MIGRATION'),
('SECURITY', 'COMPRESSION_LEVEL', '6', 'gzip compression level (1-9)', 'NUMBER', 'MIGRATION'),
('SECURITY', 'DB_CONNECTION_LIMIT', '25', 'MySQL connection pool size', 'NUMBER', 'MIGRATION'),
('SECURITY', 'DDB_BATCH_WRITE_SIZE', '25', 'DynamoDB batch write limit', 'NUMBER', 'MIGRATION'),
('SECURITY', 'ATTENDANCE_TTL_YEARS', '7', 'DynamoDB attendance record TTL in years', 'NUMBER', 'MIGRATION')
ON DUPLICATE KEY UPDATE updated_at = CURRENT_TIMESTAMP;

-- ── ADVERTISEMENT ──
INSERT INTO system_config (config_group, config_key, config_value, description, value_type, updated_by) VALUES
('ADVERTISEMENT', 'DEFAULT_TITLE', 'LaaS Platform', 'Default ad title when ADS_FROM_DB=false', 'STRING', 'MIGRATION'),
('ADVERTISEMENT', 'DEFAULT_CONTENT', 'Quality Education for Everyone', 'Default ad content text', 'STRING', 'MIGRATION'),
('ADVERTISEMENT', 'DEFAULT_MEDIA_URL', 'https://example.com/ad.jpg', 'Default ad image URL', 'STRING', 'MIGRATION'),
('ADVERTISEMENT', 'DEFAULT_TYPE', 'text', 'Default ad type: text, image, video', 'ENUM', 'MIGRATION')
ON DUPLICATE KEY UPDATE updated_at = CURRENT_TIMESTAMP;

-- ── NOTIFICATION ──
INSERT INTO system_config (config_group, config_key, config_value, description, value_type, updated_by) VALUES
('NOTIFICATION', 'MAX_DEVICES_PER_USER', '10', 'Max FCM-registered devices per user', 'NUMBER', 'MIGRATION')
ON DUPLICATE KEY UPDATE updated_at = CURRENT_TIMESTAMP;
```

---

## Summary Table

| Group | # Keys | Priority | Impact Area | Backend Change Complexity |
|-------|--------|----------|-------------|---------------------------|
| **RATE_LIMIT** | 12+ | 🔴 HIGH | Security, DDoS protection | Medium — custom throttle guard |
| **AUTH** | 11 | 🔴 HIGH | Authentication, security | Medium — update service reads |
| **FEATURE** | 10+ | 🔴 HIGH | Feature toggles, incident response | Low — replace `process.env` checks |
| **SMS** | 7 | 🟡 MEDIUM | Messaging cost & performance | Low — replace constants |
| **CACHE** | 5 | 🟡 MEDIUM | Response speed, DB load | Low — read from config |
| **UPLOAD** | 7 | 🟡 MEDIUM | Storage, UX | Low — replace env reads |
| **PAGINATION** | 3 | 🟡 MEDIUM | API performance | Low — replace constants |
| **ADVERTISEMENT** | 4 | 🟢 LOW | Ad delivery | Low — replace env defaults |
| **NOTIFICATION** | 1 | 🟢 LOW | Push notifications | Low — replace constant |
| **SECURITY** | 5 | 🟢 LOW | Infrastructure tuning | Medium — some require restart |
| **ATTENDANCE** | 4 | ✅ DONE | DynamoDB sync | Already implemented |
| **Total** | **~69** | — | — | — |

---

## Implementation Roadmap

### Phase 1 (Immediate — 1-2 days)
1. Build `SystemConfigAdminController` with CRUD endpoints
2. Migrate **FEATURE** flags (simplest — just replace `process.env` reads)
3. Run FEATURE + AUTH seed SQL

### Phase 2 (Short-term — 3-5 days)
4. Implement dynamic rate limiting via custom `DynamicThrottleGuard`
5. Migrate **AUTH** config (OTP, token expiry)
6. Migrate **SMS** constants
7. Run remaining seed SQL

### Phase 3 (Medium-term — 1-2 weeks)
8. Migrate **CACHE** TTLs
9. Migrate **UPLOAD** limits
10. Build admin frontend with full CRUD UI
11. Add audit log view (who changed what, when)

### Phase 4 (Long-term)
12. Migrate **ADVERTISEMENT**, **NOTIFICATION**, **SECURITY**
13. Add config versioning/rollback
14. Add config export/import for deployment sync

---

## Notes

### What Should NOT Be in `system_config`

| Setting | Reason |
|---------|--------|
| `JWT_SECRET` | Sensitive secret — must stay in ENV/secrets manager |
| `DB_PASSWORD` | Sensitive credential — keep in ENV |
| `AWS_SECRET_ACCESS_KEY` | Cloud credential |
| `REDIS_PASSWORD` | Infrastructure credential |
| `BCRYPT_PEPPER` | Cryptographic secret |
| `FIREBASE_PRIVATE_KEY` | Service account credential |
| `SMSLENZ_API_KEY` | Third-party API credential |

**Rule:** Secrets and credentials should **never** be in `system_config`. Only operational parameters, limits, flags, and tuning values belong there.

### Cache Considerations

- All values are cached for 5 minutes — changes take up to 5 min to propagate unless manually refreshed
- For rate limits, use `getSync()` (cache-only) in the throttle guard to avoid async overhead on every request
- Pre-warm on startup ensures no cold-start delay
- Consider reducing cache TTL to 1 minute for high-frequency change scenarios
