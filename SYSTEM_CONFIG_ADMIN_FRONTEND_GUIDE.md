# ⚙️ System Config — Admin Frontend Implementation Guide

> **Last Updated:** 2026-03-03  
> **Backend Version:** NestJS + TypeORM + MySQL  
> **Status:** ✅ **FULLY IMPLEMENTED** — 11 admin endpoints live, 79 config entries across 11 groups  
> **Authentication:** JWT + SystemAdminGuard (SUPER_ADMIN / ORG_MANAGER only)

---

## Table of Contents

1. [Overview](#overview)
2. [Database Schema](#database-schema)
3. [All Config Entries (79 Total)](#all-config-entries-79-total)
4. [Admin API Endpoints (Live)](#admin-api-endpoints-live)
5. [Authentication & Authorization](#authentication--authorization)
6. [API Request/Response Examples](#api-requestresponse-examples)
7. [Frontend Pages & Components](#frontend-pages--components)
8. [Config Group Reference](#config-group-reference)
9. [Value Types & Validation](#value-types--validation)
10. [Cache Behavior](#cache-behavior)
11. [Priority Resolution (ENV → DB → Default)](#priority-resolution-env--db--default)
12. [Error Handling](#error-handling)
13. [Frontend Service Layer (TypeScript)](#frontend-service-layer-typescript)
14. [Quick Start Checklist](#quick-start-checklist)

---

## Overview

The `system_config` table is a **generic key-value store** for all system-wide settings. It replaces hardcoded constants and environment-variable-only configuration by providing:

- **Runtime changes** — No redeployment needed to update settings
- **Audit trail** — Every change records who made it and when
- **Grouped organization** — 11 logical groups (ATTENDANCE, RATE_LIMIT, AUTH, FEATURE, SMS, CACHE, UPLOAD, PAGINATION, SECURITY, ADVERTISEMENT, NOTIFICATION)
- **Type hints** — Each value has a `valueType` hint (`STRING`, `NUMBER`, `BOOLEAN`, `JSON`, `ENUM`)
- **Soft-delete** — Deactivated settings are preserved for audit but ignored at runtime
- **5-minute cache** — DB reads are cached in-memory with automatic refresh
- **Full CRUD admin API** — 11 endpoints for complete management

### Architecture

```
┌──────────────┐     REST API      ┌─────────────────────────────┐     Cache      ┌──────────────┐
│ Admin Panel  │ ◀──────────────▶  │ SystemConfigAdminController │ ◀───────────▶ │  In-Memory   │
│  (Frontend)  │                   │ + SystemConfigService       │               │  Cache Map   │
└──────────────┘                   └──────────┬──────────────────┘               └──────────────┘
                                              │
                                              ▼
                                    ┌──────────────────┐
                                    │  system_config   │
                                    │   (MySQL Table)  │
                                    │   79 entries     │
                                    │   11 groups      │
                                    └──────────────────┘
```

### Key Files

| File | Purpose |
|------|---------|
| `src/common/controllers/system-config-admin.controller.ts` | Admin CRUD controller (11 endpoints) |
| `src/common/dto/system-config-admin.dto.ts` | Request/Response DTOs with validation |
| `src/common/services/system-config.service.ts` | Core service with caching + admin methods |
| `src/common/entities/system-config.entity.ts` | TypeORM entity |
| `migrations/20250708_system_config_attendance_records.sql` | Table creation + 4 ATTENDANCE seeds |
| `migrations/20260303_system_config_expand_all_groups.sql` | Full expansion: 75 entries across 10 new groups |

---

## Database Schema

### Table: `system_config`

| Column         | Type          | Nullable | Default             | Description                                        |
|----------------|---------------|----------|---------------------|----------------------------------------------------|
| `id`           | BIGINT (PK)   | No       | AUTO_INCREMENT      | Primary key                                        |
| `config_group` | VARCHAR(64)   | No       | —                   | Logical group: `ATTENDANCE`, `RATE_LIMIT`, etc.    |
| `config_key`   | VARCHAR(128)  | No       | —                   | Setting key within the group                       |
| `config_value` | TEXT          | No       | —                   | Setting value (string, parsed by consumer)         |
| `description`  | VARCHAR(512)  | Yes      | NULL                | Human-readable description                         |
| `value_type`   | VARCHAR(32)   | No       | `'STRING'`          | Type hint: `STRING`, `NUMBER`, `BOOLEAN`, `JSON`, `ENUM` |
| `is_active`    | BOOLEAN       | No       | `true`              | Inactive = treated as if not set                   |
| `updated_by`   | VARCHAR(64)   | Yes      | NULL                | User ID who last changed this                      |
| `created_at`   | TIMESTAMP     | No       | `CURRENT_TIMESTAMP` | Row creation time                                  |
| `updated_at`   | TIMESTAMP     | No       | `CURRENT_TIMESTAMP ON UPDATE` | Last modification time                |

### Constraints & Indexes

| Type   | Name              | Columns                        |
|--------|-------------------|--------------------------------|
| UNIQUE | `UQ_group_key`    | `(config_group, config_key)`   |
| INDEX  | `IDX_config_group`| `(config_group)`               |

### TypeORM Entity

```typescript
// src/common/entities/system-config.entity.ts
@Entity('system_config')
@Unique(['configGroup', 'configKey'])
@Index(['configGroup'])
export class SystemConfigEntity {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string;

  @Column({ name: 'config_group', type: 'varchar', length: 64 })
  configGroup: string;

  @Column({ name: 'config_key', type: 'varchar', length: 128 })
  configKey: string;

  @Column({ name: 'config_value', type: 'text' })
  configValue: string;

  @Column({ name: 'description', type: 'varchar', length: 512, nullable: true })
  description: string | null;

  @Column({ name: 'value_type', type: 'varchar', length: 32, default: 'STRING' })
  valueType: string;  // STRING | NUMBER | BOOLEAN | JSON | ENUM

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @Column({ name: 'updated_by', type: 'varchar', length: 64, nullable: true })
  updatedBy: string | null;

  @Column({ name: 'created_at', type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date;

  @Column({ name: 'updated_at', type: 'timestamp', default: () => 'CURRENT_TIMESTAMP', onUpdate: 'CURRENT_TIMESTAMP' })
  updatedAt: Date;
}
```

---

## All Config Entries (79 Total)

### ATTENDANCE (4 entries)

| Key | Default Value | Type | Description |
|-----|--------------|------|-------------|
| `SYNC_MODE` | `DYNAMO_FIRST` | ENUM | DynamoDB→MySQL sync mode: `IMMEDIATE`, `DYNAMO_FIRST`, `BACKEND_SCHEDULE` |
| `SYNC_CRON` | `0 */15 * * * *` | STRING | Cron expression for `BACKEND_SCHEDULE` sync |
| `SYNC_BATCH_SIZE` | `500` | NUMBER | Records per sync batch |
| `SYNC_ENABLED` | `true` | BOOLEAN | Master switch for DynamoDB→MySQL sync |

### RATE_LIMIT (15 entries)

| Key | Default Value | Type | Description |
|-----|--------------|------|-------------|
| `AUTH_LOGIN_LIMIT` | `5` | NUMBER | Max login attempts per window |
| `AUTH_LOGIN_TTL_MS` | `900000` | NUMBER | Login rate limit window in ms (15 min) |
| `AUTH_REFRESH_LIMIT` | `10` | NUMBER | Max token refreshes per window |
| `AUTH_REFRESH_TTL_MS` | `60000` | NUMBER | Token refresh rate limit window in ms (1 min) |
| `OTP_REQUEST_LIMIT` | `3` | NUMBER | Max OTP requests per 15 min |
| `OTP_VERIFY_LIMIT` | `5` | NUMBER | Max OTP verifications per 15 min |
| `OTP_RESEND_LIMIT` | `2` | NUMBER | Max OTP resends per 10 min |
| `SMS_SEND_LIMIT` | `10` | NUMBER | Max SMS sends per 1 min |
| `SMS_BULK_LIMIT` | `3` | NUMBER | Max bulk SMS per 1 min |
| `PAYMENT_SUBMIT_LIMIT` | `5` | NUMBER | Max payment submissions per 15 min |
| `ATTENDANCE_MARK_LIMIT` | `30` | NUMBER | Max attendance marks per 1 min |
| `DEVICE_HEARTBEAT_LIMIT` | `10` | NUMBER | Device heartbeats per 1 min |
| `DEVICE_ATTENDANCE_LIMIT` | `60` | NUMBER | Device attendance marks per 1 min |
| `IMAGE_UPLOAD_LIMIT` | `5` | NUMBER | Profile image uploads per 15 min |
| `PUBLIC_UPLOAD_LIMIT` | `10` | NUMBER | Public uploads per 1 min |

### AUTH (11 entries)

| Key | Default Value | Type | Description |
|-----|--------------|------|-------------|
| `OTP_EXPIRY_MINUTES` | `30` | NUMBER | OTP code expiry in minutes |
| `OTP_MAX_REQUESTS_PER_DAY` | `5` | NUMBER | Max OTP requests per user per day |
| `OTP_MAX_REREQUESTS_PER_DAY` | `3` | NUMBER | Max OTP re-requests per user per day |
| `OTP_MAX_RESEND_PER_HOUR` | `3` | NUMBER | Max OTP resend requests per hour |
| `OTP_MAX_VERIFY_ATTEMPTS` | `5` | NUMBER | Max OTP verification attempts before lockout |
| `PASSWORD_RESET_MAX_REQUESTS` | `3` | NUMBER | Max password reset requests per 15 min |
| `JWT_ACCESS_EXPIRY` | `15m` | STRING | JWT access token lifetime (e.g. 15m, 1h) |
| `JWT_REFRESH_EXPIRY` | `7d` | STRING | JWT refresh token lifetime (e.g. 7d, 30d) |
| `JWT_REFRESH_REMEMBER_ME` | `30d` | STRING | Refresh token lifetime with remember-me |
| `INSTITUTE_TOKEN_EXPIRY` | `8h` | STRING | Institute-specific token expiry |
| `BCRYPT_SALT_ROUNDS` | `12` | NUMBER | Bcrypt password hashing rounds (10-14 recommended) |

### FEATURE (12 entries) — Feature Flags

| Key | Default Value | Type | Description |
|-----|--------------|------|-------------|
| `ADS_FROM_DB` | `false` | BOOLEAN | Load ads from DB (true) or ENV defaults (false) |
| `ATTENDANCE_NOTIFICATIONS` | `true` | BOOLEAN | Send notifications on attendance marking |
| `WHATSAPP_TEMPLATES` | `false` | BOOLEAN | Use WhatsApp template messages for notifications |
| `EMAIL_MASKING` | `false` | BOOLEAN | Mask email addresses in API responses |
| `PHONE_MASKING` | `false` | BOOLEAN | Mask phone numbers in API responses |
| `ENHANCED_IP_VALIDATION` | `false` | BOOLEAN | Enable IP-based admin access restrictions |
| `CACHE_ENABLED` | `false` | BOOLEAN | Master switch for Redis caching |
| `CACHE_USER_ENABLED` | `true` | BOOLEAN | Enable user data caching in Redis |
| `CACHE_ADVERTISEMENT_ENABLED` | `true` | BOOLEAN | Enable advertisement caching in Redis |
| `MAINTENANCE_MODE` | `false` | BOOLEAN | System-wide maintenance mode — blocks all non-admin requests |
| `ENROLLMENT_CHECK_ATTENDANCE` | `false` | BOOLEAN | Only enrolled students can mark attendance |
| `ENROLLMENT_CHECK_VEHICLE` | `false` | BOOLEAN | Only enrolled vehicle students can mark attendance |

### SMS (7 entries)

| Key | Default Value | Type | Description |
|-----|--------------|------|-------------|
| `BATCH_SIZE` | `50` | NUMBER | SMS sending batch size |
| `MAX_CONCURRENT_BATCHES` | `5` | NUMBER | Max concurrent SMS batch sends |
| `MAX_RECIPIENTS_PER_BATCH` | `500` | NUMBER | SMSlenz API max recipients per batch |
| `MAX_MESSAGE_LENGTH` | `1500` | NUMBER | Max SMS character length |
| `HTTP_TIMEOUT_MS` | `30000` | NUMBER | SMS API call timeout in ms |
| `MAX_BULK_COUNT` | `1000` | NUMBER | Max recipients per bulk SMS request |
| `CREDIT_PER_SMS` | `1.0` | STRING | Cost per SMS in credits |

### CACHE (5 entries)

| Key | Default Value | Type | Description |
|-----|--------------|------|-------------|
| `DEFAULT_TTL_SECONDS` | `604800` | NUMBER | Default cache TTL in seconds (7 days) |
| `USER_TTL_DAYS` | `30` | NUMBER | User cache TTL in days |
| `AD_TTL_SECONDS` | `3600` | NUMBER | Advertisement cache TTL in seconds (1 hour) |
| `AD_METRICS_SYNC_MINUTES` | `10` | NUMBER | Ad metrics sync interval in minutes |
| `SYSTEM_CONFIG_TTL_MS` | `300000` | NUMBER | System config in-memory cache TTL in ms (5 min) |

### UPLOAD (10 entries)

| Key | Default Value | Type | Description |
|-----|--------------|------|-------------|
| `MAX_FILE_SIZE_MB` | `100` | NUMBER | Absolute maximum file upload size in MB |
| `PROFILE_IMAGE_MAX_MB` | `5` | NUMBER | Profile image max size in MB |
| `STUDENT_IMAGE_MAX_MB` | `5` | NUMBER | Student image max size in MB |
| `INSTITUTE_IMAGE_MAX_MB` | `10` | NUMBER | Institute image max size in MB |
| `HOMEWORK_FILE_MAX_MB` | `20` | NUMBER | Homework file max size in MB |
| `CORRECTION_FILE_MAX_MB` | `20` | NUMBER | Correction file max size in MB |
| `PAYMENT_RECEIPT_MAX_MB` | `10` | NUMBER | Payment receipt max size in MB |
| `ID_DOCUMENT_MAX_MB` | `10` | NUMBER | ID document max size in MB |
| `UPLOAD_URL_EXPIRY_SECONDS` | `600` | NUMBER | Signed upload URL expiry in seconds (10 min) |
| `VIEW_URL_EXPIRY_SECONDS` | `3600` | NUMBER | Signed view URL expiry in seconds (1 hour) |

### PAGINATION (3 entries)

| Key | Default Value | Type | Description |
|-----|--------------|------|-------------|
| `DEFAULT_LIMIT` | `10` | NUMBER | Default page size for list endpoints |
| `MAX_LIMIT` | `100` | NUMBER | Maximum allowed page size |
| `MAX_BULK_ATTENDANCE_SIZE` | `100` | NUMBER | Max attendance records per bulk request |

### SECURITY (6 entries)

| Key | Default Value | Type | Description |
|-----|--------------|------|-------------|
| `COMPRESSION_THRESHOLD` | `1024` | NUMBER | Response compression threshold in bytes |
| `COMPRESSION_LEVEL` | `6` | NUMBER | gzip compression level (1-9) |
| `DB_CONNECTION_LIMIT` | `25` | NUMBER | MySQL connection pool size |
| `DDB_BATCH_WRITE_SIZE` | `25` | NUMBER | DynamoDB batch write limit |
| `ATTENDANCE_TTL_YEARS` | `7` | NUMBER | DynamoDB attendance record TTL in years |
| `HSTS_MAX_AGE` | `31536000` | NUMBER | HSTS header max-age in seconds (1 year) |

### ADVERTISEMENT (4 entries)

| Key | Default Value | Type | Description |
|-----|--------------|------|-------------|
| `DEFAULT_TITLE` | `LaaS Platform` | STRING | Default ad title when ADS_FROM_DB=false |
| `DEFAULT_CONTENT` | `Quality Education for Everyone` | STRING | Default ad content text |
| `DEFAULT_MEDIA_URL` | `https://example.com/ad.jpg` | STRING | Default ad image URL |
| `DEFAULT_TYPE` | `text` | ENUM | Default ad type: text, image, video |

### NOTIFICATION (2 entries)

| Key | Default Value | Type | Description |
|-----|--------------|------|-------------|
| `MAX_DEVICES_PER_USER` | `10` | NUMBER | Max FCM-registered devices per user |
| `MAX_RETRY` | `3` | NUMBER | Max notification delivery retry attempts |

---

## Admin API Endpoints (Live)

> **Base URL:** `/api/admin/system-config`  
> **Guard:** `JwtAuthGuard` + `SystemAdminGuard` (SUPER_ADMIN / ORG_MANAGER)  
> **Controller:** `SystemConfigAdminController`

### Endpoint Summary

| # | Method | Route | Action | Rate Limit |
|---|--------|-------|--------|------------|
| 1 | `GET` | `/api/admin/system-config` | List all configs (filterable) | — |
| 2 | `GET` | `/api/admin/system-config/groups` | List group summaries with counts | — |
| 3 | `GET` | `/api/admin/system-config/cache/stats` | Cache statistics | — |
| 4 | `POST` | `/api/admin/system-config/cache/refresh` | Force full cache refresh | 5/min |
| 5 | `GET` | `/api/admin/system-config/:group` | Get all configs in a group | — |
| 6 | `GET` | `/api/admin/system-config/:group/:key` | Get single config entry | — |
| 7 | `POST` | `/api/admin/system-config` | Create a new config entry | — |
| 8 | `PUT` | `/api/admin/system-config/:group/:key` | Update config value | — |
| 9 | `PATCH` | `/api/admin/system-config/:group/:key/deactivate` | Soft-delete (preserve row) | — |
| 10 | `PATCH` | `/api/admin/system-config/:group/:key/reactivate` | Re-enable deactivated entry | — |
| 11 | `DELETE` | `/api/admin/system-config/:group/:key` | Hard-delete (permanent) | — |

---

## Authentication & Authorization

### Required Headers

```
Authorization: Bearer <jwt_access_token>
Content-Type: application/json
```

### Getting a Token

```http
POST /v2/auth/login
Content-Type: application/json

{
  "identifier": "admin@example.com",
  "password": "YourPassword"
}
```

Response:
```json
{
  "access_token": "eyJhbGciOi...",
  "refresh_token": "eyJhbGciOi...",
  "expires_in": 3600,
  "refresh_expires_in": 604800,
  "payload": {
    "s": "12345",
    "u": "SUPER_ADMIN",
    "i": []
  }
}
```

### Guard Requirements

The `SystemAdminGuard` at `src/modules/user-card-management/guards/system-admin.guard.ts` only allows:
- **`SUPER_ADMIN`** — Full access to all config operations
- **`ORG_MANAGER`** — Full access to all config operations

All other user types receive `403 Forbidden`.

---

## API Request/Response Examples

### 1. List All Configs

```http
GET /api/admin/system-config
GET /api/admin/system-config?group=ATTENDANCE
GET /api/admin/system-config?isActive=true
GET /api/admin/system-config?group=FEATURE&isActive=true
```

**Response:**
```json
{
  "success": true,
  "count": 79,
  "data": [
    {
      "id": "1",
      "configGroup": "ATTENDANCE",
      "configKey": "SYNC_MODE",
      "configValue": "DYNAMO_FIRST",
      "description": "DynamoDB sync strategy: IMMEDIATE, DYNAMO_FIRST, BACKEND_SCHEDULE",
      "valueType": "ENUM",
      "isActive": true,
      "updatedBy": "MIGRATION",
      "createdAt": "2026-03-03T00:00:00.000Z",
      "updatedAt": "2026-03-03T00:00:00.000Z"
    }
  ]
}
```

### 2. List Group Summaries

```http
GET /api/admin/system-config/groups
```

**Response:**
```json
{
  "success": true,
  "data": [
    { "group": "ATTENDANCE", "count": 4, "activeCount": 4 },
    { "group": "RATE_LIMIT", "count": 15, "activeCount": 15 },
    { "group": "AUTH", "count": 11, "activeCount": 11 },
    { "group": "FEATURE", "count": 12, "activeCount": 12 },
    { "group": "SMS", "count": 7, "activeCount": 7 },
    { "group": "CACHE", "count": 5, "activeCount": 5 },
    { "group": "UPLOAD", "count": 10, "activeCount": 10 },
    { "group": "PAGINATION", "count": 3, "activeCount": 3 },
    { "group": "SECURITY", "count": 6, "activeCount": 6 },
    { "group": "ADVERTISEMENT", "count": 4, "activeCount": 4 },
    { "group": "NOTIFICATION", "count": 2, "activeCount": 2 }
  ]
}
```

### 3. Get Configs by Group

```http
GET /api/admin/system-config/ATTENDANCE
```

**Response:**
```json
{
  "success": true,
  "group": "ATTENDANCE",
  "count": 4,
  "data": [
    {
      "id": "1",
      "configGroup": "ATTENDANCE",
      "configKey": "SYNC_MODE",
      "configValue": "DYNAMO_FIRST",
      "description": "DynamoDB sync strategy: IMMEDIATE, DYNAMO_FIRST, BACKEND_SCHEDULE",
      "valueType": "ENUM",
      "isActive": true,
      "updatedBy": "MIGRATION",
      "createdAt": "2026-03-03T00:00:00.000Z",
      "updatedAt": "2026-03-03T00:00:00.000Z"
    }
  ]
}
```

### 4. Get Single Config

```http
GET /api/admin/system-config/ATTENDANCE/SYNC_MODE
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "1",
    "configGroup": "ATTENDANCE",
    "configKey": "SYNC_MODE",
    "configValue": "DYNAMO_FIRST",
    "description": "DynamoDB sync strategy: IMMEDIATE, DYNAMO_FIRST, BACKEND_SCHEDULE",
    "valueType": "ENUM",
    "isActive": true,
    "updatedBy": "MIGRATION",
    "createdAt": "2026-03-03T00:00:00.000Z",
    "updatedAt": "2026-03-03T00:00:00.000Z"
  }
}
```

### 5. Create New Config

```http
POST /api/admin/system-config
Content-Type: application/json

{
  "group": "FEATURE",
  "key": "DARK_MODE",
  "value": "false",
  "description": "Enable dark mode for all users",
  "valueType": "BOOLEAN"
}
```

**Response (201):**
```json
{
  "success": true,
  "message": "Config [FEATURE:DARK_MODE] created",
  "data": {
    "id": "80",
    "configGroup": "FEATURE",
    "configKey": "DARK_MODE",
    "configValue": "false",
    "description": "Enable dark mode for all users",
    "valueType": "BOOLEAN",
    "isActive": true,
    "updatedBy": "1",
    "createdAt": "2026-03-03T14:00:00.000Z",
    "updatedAt": "2026-03-03T14:00:00.000Z"
  }
}
```

### 6. Update Config Value

```http
PUT /api/admin/system-config/ATTENDANCE/SYNC_MODE
Content-Type: application/json

{
  "value": "IMMEDIATE",
  "description": "Changed to immediate mode for real-time sync"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Config [ATTENDANCE:SYNC_MODE] updated to \"IMMEDIATE\"",
  "data": {
    "id": "1",
    "configGroup": "ATTENDANCE",
    "configKey": "SYNC_MODE",
    "configValue": "IMMEDIATE",
    "description": "Changed to immediate mode for real-time sync",
    "valueType": "ENUM",
    "isActive": true,
    "updatedBy": "1",
    "createdAt": "2026-03-03T00:00:00.000Z",
    "updatedAt": "2026-03-03T14:05:00.000Z"
  }
}
```

### 7. Deactivate (Soft-Delete)

```http
PATCH /api/admin/system-config/FEATURE/MAINTENANCE_MODE/deactivate
```

**Response:**
```json
{
  "success": true,
  "message": "Config [FEATURE:MAINTENANCE_MODE] deactivated"
}
```

### 8. Reactivate

```http
PATCH /api/admin/system-config/FEATURE/MAINTENANCE_MODE/reactivate
```

**Response:**
```json
{
  "success": true,
  "message": "Config [FEATURE:MAINTENANCE_MODE] reactivated"
}
```

### 9. Hard Delete

```http
DELETE /api/admin/system-config/TEMP/TEST_KEY
```

**Response:**
```json
{
  "success": true,
  "message": "Config [TEMP:TEST_KEY] permanently deleted"
}
```

### 10. Refresh Cache

```http
POST /api/admin/system-config/cache/refresh
```

**Response:**
```json
{
  "success": true,
  "entriesCached": 79
}
```

### 11. Cache Stats

```http
GET /api/admin/system-config/cache/stats
```

**Response:**
```json
{
  "success": true,
  "data": {
    "message": "Cache stats retrieved",
    "hint": "Use POST /cache/refresh to reload"
  }
}
```

---

## Frontend Pages & Components

### 1. System Settings Dashboard

**Route:** `/admin/system-config`

```
┌──────────────────────────────────────────────────────────────────────┐
│  ⚙️ System Configuration                          [🔄 Refresh Cache] │
│                                                                      │
│  Filter: [All Groups ▼]  [Active Only ☑]            [+ New Config]  │
│                                                                      │
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │ 📊 ATTENDANCE (4 entries, 4 active)                      [▼]  │  │
│  │ ─────────────────────────────────────────────────────────────  │  │
│  │ SYNC_MODE       │ DYNAMO_FIRST ▼  │ ENUM    │ ✎  │ 🔴      │  │
│  │ SYNC_CRON       │ 0 */15 * * * * │ STRING  │ ✎  │ 🔴      │  │
│  │ SYNC_BATCH_SIZE │ 500            │ NUMBER  │ ✎  │ 🔴      │  │
│  │ SYNC_ENABLED    │ ✅ true        │ BOOLEAN │ ✎  │ 🔴      │  │
│  └────────────────────────────────────────────────────────────────┘  │
│                                                                      │
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │ 🔒 AUTH (11 entries, 11 active)                          [▼]  │  │
│  │ ─────────────────────────────────────────────────────────────  │  │
│  │ OTP_EXPIRY_MINUTES  │ 30           │ NUMBER  │ ✎  │ 🔴      │  │
│  │ JWT_ACCESS_EXPIRY   │ 15m          │ STRING  │ ✎  │ 🔴      │  │
│  │ ...                                                           │  │
│  └────────────────────────────────────────────────────────────────┘  │
│                                                                      │
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │ 🚦 RATE_LIMIT (15 entries, 15 active)                    [▼]  │  │
│  │ ─────────────────────────────────────────────────────────────  │  │
│  │ AUTH_LOGIN_LIMIT    │ 5            │ NUMBER  │ ✎  │ 🔴      │  │
│  │ AUTH_LOGIN_TTL_MS   │ 900000       │ NUMBER  │ ✎  │ 🔴      │  │
│  │ ...                                                           │  │
│  └────────────────────────────────────────────────────────────────┘  │
│                                                                      │
│  ... (FEATURE, SMS, CACHE, UPLOAD, PAGINATION, SECURITY,            │
│       ADVERTISEMENT, NOTIFICATION)                                   │
│                                                                      │
│  Cache: 79 entries loaded │ Last refresh: 2026-03-03 14:00          │
└──────────────────────────────────────────────────────────────────────┘
```

### 2. Component Structure (React/Next.js)

```
components/
  admin/
    system-config/
      SystemConfigPage.tsx          // Main page with group accordion
      ConfigGroupPanel.tsx          // Collapsible card per group
      ConfigEntryRow.tsx            // Single key-value row with actions
      ConfigEditModal.tsx           // Modal for editing a value
      ConfigCreateModal.tsx         // Modal for adding new config
      ConfigDeleteDialog.tsx        // Confirmation dialog for hard/soft delete
      ConfigValueInput.tsx          // Smart input based on valueType
      CacheStatusBar.tsx            // Cache info + refresh button
      GroupSummaryCards.tsx          // Dashboard cards showing group counts
```

### 3. Smart Input by `valueType`

| valueType | UI Component | Notes |
|-----------|-------------|-------|
| `STRING` | Text input | Free-form text, max 65535 chars |
| `NUMBER` | Number input | With min/max validation, step buttons |
| `BOOLEAN` | Toggle switch | Visual on/off switch |
| `ENUM` | Dropdown select | Options parsed from description or hardcoded |
| `JSON` | JSON editor | With syntax highlighting + validation |

### 4. Config Edit Modal

```
┌───────────────────────────────────────┐
│  Edit Configuration                   │
│                                       │
│  Group:  ATTENDANCE (readonly)        │
│  Key:    SYNC_MODE  (readonly)        │
│                                       │
│  Value:  [DYNAMO_FIRST      ▼]       │
│          Options:                     │
│          ○ IMMEDIATE                  │
│          ● DYNAMO_FIRST               │
│          ○ BACKEND_SCHEDULE           │
│                                       │
│  Type:   ENUM (readonly)             │
│                                       │
│  Description:                         │
│  [DynamoDB sync strategy: IMMEDIA... ]│
│                                       │
│  Last Updated: 2026-03-03 14:30      │
│  Updated By:   MIGRATION             │
│                                       │
│  [Cancel]              [💾 Save]      │
└───────────────────────────────────────┘
```

### 5. Create Config Modal

```
┌───────────────────────────────────────┐
│  Create New Configuration             │
│                                       │
│  Group:  [FEATURE          ▼]        │
│          (or type new group)          │
│                                       │
│  Key:    [NEW_FEATURE_KEY      ]     │
│                                       │
│  Value:  [false                ]      │
│                                       │
│  Type:   [BOOLEAN ▼]                 │
│                                       │
│  Description:                         │
│  [Optional description...       ]     │
│                                       │
│  [Cancel]              [➕ Create]    │
└───────────────────────────────────────┘
```

---

## Config Group Reference

### All 11 Groups (Production)

| Group | Entries | Icon | Description | Primary Consumers |
|-------|---------|------|-------------|-------------------|
| `ATTENDANCE` | 4 | 📊 | DynamoDB→MySQL sync configuration | `AttendanceSyncConfigService` |
| `RATE_LIMIT` | 15 | 🚦 | Per-endpoint rate limiting | `@Throttle()` decorators, guards |
| `AUTH` | 11 | 🔒 | Token expiry, OTP limits, bcrypt | `AuthService`, `OtpService` |
| `FEATURE` | 12 | 🏳️ | Feature flags & toggles | Various services |
| `SMS` | 7 | 📱 | SMS batch sizes, timeouts, limits | `SmsService` |
| `CACHE` | 5 | 💾 | Cache TTL values for Redis/memory | `CacheService`, `SystemConfigService` |
| `UPLOAD` | 10 | 📁 | File size limits per upload type | `UploadService`, `StorageService` |
| `PAGINATION` | 3 | 📄 | Default & max page sizes | All list endpoints |
| `SECURITY` | 6 | 🛡️ | Compression, pool size, HSTS | `main.ts`, infrastructure |
| `ADVERTISEMENT` | 4 | 📢 | Default ad content & type | `AdvertisementService` |
| `NOTIFICATION` | 2 | 🔔 | Push notification limits | `FirebaseNotificationService` |

### Group Icons (for frontend sidebar)

```typescript
const GROUP_ICONS: Record<string, string> = {
  ATTENDANCE: '📊',
  RATE_LIMIT: '🚦',
  AUTH: '🔒',
  FEATURE: '🏳️',
  SMS: '📱',
  CACHE: '💾',
  UPLOAD: '📁',
  PAGINATION: '📄',
  SECURITY: '🛡️',
  ADVERTISEMENT: '📢',
  NOTIFICATION: '🔔',
};
```

### Group Colors (for badges/cards)

```typescript
const GROUP_COLORS: Record<string, string> = {
  ATTENDANCE: '#3B82F6',   // blue
  RATE_LIMIT: '#EF4444',   // red
  AUTH: '#8B5CF6',         // purple
  FEATURE: '#10B981',     // green
  SMS: '#F59E0B',         // amber
  CACHE: '#6366F1',       // indigo
  UPLOAD: '#EC4899',      // pink
  PAGINATION: '#14B8A6',  // teal
  SECURITY: '#F97316',    // orange
  ADVERTISEMENT: '#06B6D4', // cyan
  NOTIFICATION: '#84CC16', // lime
};
```

---

## Value Types & Validation

### Frontend Validation Rules

| valueType | Validation | Backend Check | Example |
|-----------|-----------|---------------|---------|
| `STRING` | Non-empty, max 65535 chars | None | `0 */15 * * * *` |
| `NUMBER` | Valid integer or float | `isNaN(Number(value))` → 400 | `500` |
| `BOOLEAN` | Only `true`/`false`/`0`/`1` | Check against allowed values → 400 | `true` |
| `ENUM` | Must be valid option | None (frontend validates) | `DYNAMO_FIRST` |
| `JSON` | Must be valid JSON | `JSON.parse()` → 400 | `{"key": "value"}` |

### Backend Value Type Validation

The controller validates values before saving:

```typescript
// src/common/controllers/system-config-admin.controller.ts
private validateValueType(value: string, valueType: string): void {
  switch (valueType) {
    case 'NUMBER':
      if (isNaN(Number(value))) {
        throw new BadRequestException(`Value "${value}" is not a valid NUMBER`);
      }
      break;
    case 'BOOLEAN':
      if (!['true', 'false', '0', '1'].includes(value.toLowerCase())) {
        throw new BadRequestException(`Value "${value}" is not a valid BOOLEAN`);
      }
      break;
    case 'JSON':
      try { JSON.parse(value); } catch {
        throw new BadRequestException(`Value is not valid JSON`);
      }
      break;
  }
}
```

### Known ENUM Options

| Group.Key | Valid Options |
|-----------|-------------|
| `ATTENDANCE.SYNC_MODE` | `IMMEDIATE`, `DYNAMO_FIRST`, `BACKEND_SCHEDULE` |
| `ADVERTISEMENT.DEFAULT_TYPE` | `text`, `image`, `video` |

---

## Cache Behavior

### How It Works

1. **Pre-warm on startup** — All active settings are loaded into an in-memory `Map` (cache)
2. **5-minute TTL** — Each cache entry expires after 5 minutes
3. **Read-through** — On cache miss, reads from DB and re-caches
4. **Write-through** — `set()` writes to DB AND immediately updates cache
5. **Expiry cleanup** — Stale entries are removed every 10 minutes
6. **Manual refresh** — `POST /api/admin/system-config/cache/refresh` clears and reloads everything

### Cache Flow

```
Frontend calls GET /api/admin/system-config/ATTENDANCE/SYNC_MODE
    │
    ▼
SystemConfigService.get('ATTENDANCE', 'SYNC_MODE', 'DYNAMO_FIRST')
    │
    ├── Cache HIT & not expired? → Return cached value (< 1ms)
    │
    └── Cache MISS or expired?
            │
            ▼
        Query: SELECT * FROM system_config
               WHERE config_group = 'ATTENDANCE'
               AND config_key = 'SYNC_MODE'
               AND is_active = true
            │
            ▼
        Save to cache with 5-min TTL → Return value
```

### System Config Service — Developer API

```typescript
// READ methods
const mode = await systemConfigService.get('ATTENDANCE', 'SYNC_MODE', 'DYNAMO_FIRST');
const modeSync = systemConfigService.getSync('ATTENDANCE', 'SYNC_MODE', 'DYNAMO_FIRST'); // cache-only
const allAttendance = await systemConfigService.getGroup('ATTENDANCE');
const batchSize = await systemConfigService.getNumber('ATTENDANCE', 'SYNC_BATCH_SIZE', 500);
const enabled = await systemConfigService.getBoolean('ATTENDANCE', 'SYNC_ENABLED', true);

// ADMIN methods (used by controller)
const all = await systemConfigService.getAll({ group: 'FEATURE', isActive: true });
const entity = await systemConfigService.getEntity('ATTENDANCE', 'SYNC_MODE');
const groups = await systemConfigService.getGroupSummaries();

// WRITE methods
await systemConfigService.set('ATTENDANCE', 'SYNC_MODE', 'IMMEDIATE', userId, {
  description: 'Changed to immediate mode', valueType: 'ENUM',
});
await systemConfigService.deactivate('ATTENDANCE', 'SYNC_CRON', userId);
await systemConfigService.reactivate('ATTENDANCE', 'SYNC_CRON', userId);
await systemConfigService.remove('FEATURE', 'TEMP_FLAG');

// CACHE methods
systemConfigService.invalidate('ATTENDANCE', 'SYNC_MODE');
systemConfigService.invalidateGroup('ATTENDANCE');
const count = await systemConfigService.refreshCache();
```

### Important Notes for Frontend

- After updating via `PUT`, the backend cache is updated immediately
- Other server instances (if load-balanced) will pick up the change within 5 minutes
- The **"Refresh Cache"** admin button calls `POST /cache/refresh` to force all nodes to reload
- `getSync()` is cache-only — never hits the DB (used in hot paths)

---

## Priority Resolution (ENV → DB → Default)

For settings with ENV variable overrides, the resolution order is:

```
┌─────────────────────────────────────────────┐
│ 1. ENV Variable (highest — deploy-time)     │  ← Set via .env or container
│    e.g., ATTENDANCE_SYNC_MODE=IMMEDIATE     │     CANNOT be changed at runtime
│                                             │
│ 2. DB (system_config table)                 │  ← Changed via admin panel
│    e.g., ATTENDANCE.SYNC_MODE = DYNAMO_FIRST│     Changes take effect immediately
│                                             │
│ 3. Code Default (lowest)                    │  ← Fallback if neither set
│    e.g., DYNAMO_FIRST                       │     Hardcoded in service
└─────────────────────────────────────────────┘
```

### Frontend Implications

- If an ENV override is active, the admin panel should show a **warning badge**: "⚠️ Overridden by ENV variable"
- The value in the admin panel is still editable (writes to DB), but won't take effect until the ENV var is removed

---

## Error Handling

### Backend Error Responses

| Scenario | HTTP Status | Error Message |
|----------|-------------|---------------|
| Config not found | 404 | `Config [GROUP:KEY] not found` |
| Duplicate key on create | 409 | `Config [GROUP:KEY] already exists (id=X). Use PUT to update.` |
| Invalid NUMBER value | 400 | `Value "abc" is not a valid NUMBER` |
| Invalid BOOLEAN value | 400 | `Value "maybe" is not a valid BOOLEAN (use true/false/0/1)` |
| Invalid JSON value | 400 | `Value is not valid JSON` |
| Unauthorized | 401 | `Unauthorized` (no/invalid token) |
| Forbidden | 403 | `Forbidden resource` (not SUPER_ADMIN/ORG_MANAGER) |
| Rate limited | 429 | `ThrottlerException: Too Many Requests` |

### Frontend Error Handling

```typescript
async function handleConfigUpdate(group: string, key: string, value: string) {
  try {
    const response = await fetch(`/api/admin/system-config/${group}/${key}`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ value }),
    });

    const data = await response.json();

    if (!response.ok) {
      switch (response.status) {
        case 400: showToast(data.message || 'Invalid value', 'error'); break;
        case 404: showToast('Configuration entry not found', 'error'); break;
        case 409: showToast('This key already exists', 'error'); break;
        case 429: showToast('Too many requests. Please wait.', 'warning'); break;
        default:  showToast('Failed to update configuration', 'error');
      }
      return;
    }

    showToast(`${group}.${key} updated successfully`);
    refreshConfigs(); // Reload the config list
  } catch (error) {
    showToast('Network error', 'error');
  }
}
```

---

## Frontend Service Layer (TypeScript)

### Complete API Service

```typescript
// services/systemConfigApi.ts

const BASE_URL = '/api/admin/system-config';

interface SystemConfigEntry {
  id: string;
  configGroup: string;
  configKey: string;
  configValue: string;
  description: string | null;
  valueType: string;
  isActive: boolean;
  updatedBy: string | null;
  createdAt: string;
  updatedAt: string;
}

interface GroupSummary {
  group: string;
  count: number;
  activeCount: number;
}

interface ListResponse {
  success: boolean;
  count: number;
  data: SystemConfigEntry[];
}

interface SingleResponse {
  success: boolean;
  data: SystemConfigEntry;
  message?: string;
}

interface GroupsResponse {
  success: boolean;
  data: GroupSummary[];
}

// Helper
async function apiCall<T>(url: string, options?: RequestInit): Promise<T> {
  const token = getAuthToken(); // Get from your auth store
  const response = await fetch(url, {
    ...options,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });
  if (!response.ok) {
    const error = await response.json();
    throw { status: response.status, ...error };
  }
  return response.json();
}

// ═══════════════════ READ ═══════════════════

export async function getAllConfigs(
  group?: string,
  isActive?: boolean,
): Promise<ListResponse> {
  const params = new URLSearchParams();
  if (group) params.set('group', group);
  if (isActive !== undefined) params.set('isActive', String(isActive));
  const qs = params.toString();
  return apiCall(`${BASE_URL}${qs ? '?' + qs : ''}`);
}

export async function getGroupSummaries(): Promise<GroupsResponse> {
  return apiCall(`${BASE_URL}/groups`);
}

export async function getGroupConfigs(group: string): Promise<ListResponse> {
  return apiCall(`${BASE_URL}/${group}`);
}

export async function getConfig(
  group: string,
  key: string,
): Promise<SingleResponse> {
  return apiCall(`${BASE_URL}/${group}/${key}`);
}

// ═══════════════════ WRITE ═══════════════════

export async function createConfig(data: {
  group: string;
  key: string;
  value: string;
  description?: string;
  valueType?: string;
}): Promise<SingleResponse> {
  return apiCall(BASE_URL, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateConfig(
  group: string,
  key: string,
  data: { value: string; description?: string; valueType?: string },
): Promise<SingleResponse> {
  return apiCall(`${BASE_URL}/${group}/${key}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

// ═══════════════════ DELETE ═══════════════════

export async function deactivateConfig(
  group: string,
  key: string,
): Promise<{ success: boolean; message: string }> {
  return apiCall(`${BASE_URL}/${group}/${key}/deactivate`, {
    method: 'PATCH',
  });
}

export async function reactivateConfig(
  group: string,
  key: string,
): Promise<{ success: boolean; message: string }> {
  return apiCall(`${BASE_URL}/${group}/${key}/reactivate`, {
    method: 'PATCH',
  });
}

export async function deleteConfig(
  group: string,
  key: string,
): Promise<{ success: boolean; message: string }> {
  return apiCall(`${BASE_URL}/${group}/${key}`, {
    method: 'DELETE',
  });
}

// ═══════════════════ CACHE ═══════════════════

export async function refreshCache(): Promise<{
  success: boolean;
  entriesCached: number;
}> {
  return apiCall(`${BASE_URL}/cache/refresh`, { method: 'POST' });
}
```

### React Hook Example

```typescript
// hooks/useSystemConfig.ts
import { useState, useEffect, useCallback } from 'react';
import * as configApi from '../services/systemConfigApi';

export function useSystemConfig(group?: string) {
  const [configs, setConfigs] = useState<SystemConfigEntry[]>([]);
  const [groups, setGroups] = useState<GroupSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchConfigs = useCallback(async () => {
    setLoading(true);
    try {
      const [configRes, groupRes] = await Promise.all([
        configApi.getAllConfigs(group),
        configApi.getGroupSummaries(),
      ]);
      setConfigs(configRes.data);
      setGroups(groupRes.data);
      setError(null);
    } catch (err: any) {
      setError(err.message || 'Failed to load configs');
    } finally {
      setLoading(false);
    }
  }, [group]);

  useEffect(() => { fetchConfigs(); }, [fetchConfigs]);

  const updateConfig = async (
    group: string, key: string, value: string,
  ) => {
    await configApi.updateConfig(group, key, { value });
    await fetchConfigs();
  };

  const handleRefreshCache = async () => {
    const result = await configApi.refreshCache();
    return result.entriesCached;
  };

  return {
    configs, groups, loading, error,
    refresh: fetchConfigs,
    updateConfig,
    refreshCache: handleRefreshCache,
  };
}
```

---

## Quick Start Checklist

### Backend (All Complete ✅)

- [x] `SystemConfigAdminController` with 11 CRUD endpoints
- [x] `JwtAuthGuard` + `SystemAdminGuard` protection
- [x] Request/Response DTOs with class-validator decorators (6 classes)
- [x] `SystemConfigService` extended with admin methods (`getAll`, `getEntity`, `getGroupSummaries`, `remove`, `reactivate`)
- [x] Value type validation (NUMBER, BOOLEAN, JSON) in controller
- [x] Rate limiting on cache refresh (5/min)
- [x] Expansion migration (79 entries, 11 groups) deployed to remote DB
- [x] Swagger/OpenAPI documentation on all endpoints
- [x] `CommonModule` wired with new controller

### Frontend (To Build)

- [ ] Create admin frontend page at `/admin/system-config`
- [ ] Implement group accordion with collapsible panels
- [ ] Build smart input components based on `valueType`
- [ ] Add "Refresh Cache" button calling POST `/api/admin/system-config/cache/refresh`
- [ ] Show `updatedBy` and `updatedAt` for audit visibility
- [ ] Add ENV override warning badges
- [ ] Add confirmation dialog for delete/deactivate actions
- [ ] Add search/filter within config entries

---

## Migration Files

### Migration 1: Table Creation + Initial Seeds

**File:** `migrations/20250708_system_config_attendance_records.sql`
- Creates `system_config` table with unique constraint + index
- Creates `attendance_records` table
- Seeds 4 ATTENDANCE config entries

### Migration 2: Full Expansion

**File:** `migrations/20260303_system_config_expand_all_groups.sql`
- Seeds 75 new entries across 10 additional groups
- Uses `ON DUPLICATE KEY UPDATE` for idempotent re-runs
- Groups: RATE_LIMIT (15), AUTH (11), FEATURE (12), SMS (7), CACHE (5), UPLOAD (10), PAGINATION (3), SECURITY (6), ADVERTISEMENT (4), NOTIFICATION (2)

### Running Migrations

```bash
# Using the helper script (configured for remote DB)
node run-migration.js
```

---

## Swagger / OpenAPI

All admin endpoints are documented with Swagger decorators:
- `@ApiTags('System Admin - Configuration')`
- `@ApiBearerAuth()`
- `@ApiOperation()` on every endpoint
- `@ApiResponse()` with status codes
- `@ApiParam()` for path parameters
- DTOs decorated with `@ApiProperty()` / `@ApiPropertyOptional()`

Access Swagger UI at: `http://localhost:8080/api/docs` (when the server is running)
