# Attendance Device Management API — Complete Documentation

> **Version:** 1.0.0 — February 2026  
> **Base URL:** `https://<host>`  
> **Auth:** All endpoints require a JWT Bearer token.  
> **Prefix:** System Admin → `/api/admin/attendance-devices`, Institute Admin → `/api/institute/:instituteId/devices`

---

## Table of Contents

1. [Overview](#1-overview)
2. [Enums & Constants](#2-enums--constants)
3. [Database Schema (5 Tables)](#3-database-schema-5-tables)
4. [System Admin — Device CRUD](#4-system-admin--device-crud)
   - 4.1 [Register Device](#41-register-device)
   - 4.2 [Update Device](#42-update-device)
   - 4.3 [Delete Device](#43-delete-device)
5. [System Admin — Assign / Unassign / Change Institute](#5-system-admin--assign--unassign--change-institute)
   - 5.1 [Assign to Institute](#51-assign-to-institute)
   - 5.2 [Unassign from Institute](#52-unassign-from-institute)
   - 5.3 [Change Institute](#53-change-institute)
6. [System Admin — Enable / Disable / Block](#6-system-admin--enable--disable--block)
   - 6.1 [Enable Device](#61-enable-device)
   - 6.2 [Disable Device](#62-disable-device)
   - 6.3 [Block Device](#63-block-device)
   - 6.4 [Unblock Device](#64-unblock-device)
7. [System Admin — Device Config](#7-system-admin--device-config)
   - 7.1 [Get Config](#71-get-config)
   - 7.2 [Update Config (All Fields)](#72-update-config-all-fields)
8. [System Admin — Event Binding](#8-system-admin--event-binding)
   - 8.1 [Bind Event](#81-bind-event)
   - 8.2 [Unbind Event](#82-unbind-event)
   - 8.3 [Get Binding History](#83-get-binding-history)
9. [System Admin — Queries & Stats](#9-system-admin--queries--stats)
   - 9.1 [List All Devices](#91-list-all-devices)
   - 9.2 [Get Device Detail](#92-get-device-detail)
   - 9.3 [Get System Stats](#93-get-system-stats)
   - 9.4 [Get Audit Log](#94-get-audit-log)
   - 9.5 [Get Active Sessions](#95-get-active-sessions)
10. [Institute Admin — Device Management](#10-institute-admin--device-management)
    - 10.1 [List Own Devices](#101-list-own-devices)
    - 10.2 [Get Device Detail](#102-get-device-detail)
    - 10.3 [Update Device (Limited)](#103-update-device-limited)
    - 10.4 [Enable / Disable](#104-enable--disable)
11. [Institute Admin — Config (Limited)](#11-institute-admin--config-limited)
    - 11.1 [Get Config](#111-get-config)
    - 11.2 [Update Config (Status Mode & Hours Only)](#112-update-config-status-mode--hours-only)
12. [Institute Admin — Event Binding](#12-institute-admin--event-binding)
    - 12.1 [Bind Event](#121-bind-event)
    - 12.2 [Unbind Event](#122-unbind-event)
    - 12.3 [Get Active Binding](#123-get-active-binding)
    - 12.4 [Get Binding History](#124-get-binding-history)
13. [Institute Admin — Sessions](#13-institute-admin--sessions)
    - 13.1 [Start Session](#131-start-session)
    - 13.2 [End Session](#132-end-session)
    - 13.3 [List Active Sessions](#133-list-active-sessions)
14. [Institute Admin — Heartbeat & Audit](#14-institute-admin--heartbeat--audit)
    - 14.1 [Device Heartbeat](#141-device-heartbeat)
    - 14.2 [Get Audit Log](#142-get-audit-log)
15. [Attendance Integration — deviceUid Flow](#15-attendance-integration--deviceuid-flow)
16. [Permission Matrix](#16-permission-matrix)
17. [Migration SQL Reference](#17-migration-sql-reference)

---

## 1. Overview

The Device Management System allows system administrators to register, configure, and assign physical attendance-marking devices (tablets, RFID readers, kiosks, etc.) to institutes. Institute administrators can then manage their assigned devices — bind them to events, control which statuses they can mark, and monitor sessions.

**Key Concepts:**

- **Device ↔ Institute**: A device is assigned to exactly one institute (or unassigned).
- **Device ↔ Event Binding**: A device can be "locked" to a specific calendar event. While bound, ALL attendance marks from that device automatically inherit the event ID and optional status override.
- **AllowedStatusMode**: Controls what attendance statuses the device can mark — `ANY` (everything), `BLOCKED` (nothing), or `ONLY` (specific list).
- **Sessions**: Each device login creates a session with a UUID token. The `maxSessions` config limits concurrent sessions.
- **Audit Trail**: Every action (create, enable, block, config change, event bind/unbind) is logged immutably.

---

## 2. Enums & Constants

### DeviceType
| Value | Description |
|-------|-------------|
| `TABLET` | Android/iOS tablet (default) |
| `PHONE` | Mobile phone |
| `RFID_READER` | RFID card reader |
| `BIOMETRIC` | Biometric scanner |
| `KIOSK` | Fixed kiosk terminal |
| `NFC_TERMINAL` | NFC tap terminal |
| `QR_SCANNER` | QR code scanner |
| `OTHER` | Other/custom device |

### DeviceStatus
| Value | Description |
|-------|-------------|
| `ACTIVE` | Operational and enabled |
| `INACTIVE` | Disabled by admin |
| `MAINTENANCE` | Under maintenance |
| `BLOCKED` | Blocked — cannot mark attendance |

### AllowedStatusMode
| Value | Description |
|-------|-------------|
| `ANY` | Device can mark any attendance status |
| `BLOCKED` | Device cannot mark attendance at all |
| `ONLY` | Device can only mark statuses listed in `allowedStatusList` |

### EventBindingStatus
| Value | Description |
|-------|-------------|
| `ACTIVE` | Binding is currently active |
| `INACTIVE` | Binding has been deactivated |

### DeviceAuditAction
| Value | Description |
|-------|-------------|
| `CREATED` | Device registered |
| `ASSIGNED` | Assigned to institute |
| `UNASSIGNED` | Unassigned from institute |
| `ENABLED` | Enabled |
| `DISABLED` | Disabled |
| `CONFIG_CHANGED` | Configuration updated |
| `EVENT_BOUND` | Bound to an event |
| `EVENT_UNBOUND` | Unbound from event |
| `SESSION_STARTED` | New session started |
| `SESSION_ENDED` | Session ended |
| `BLOCKED` | Blocked |
| `UNBLOCKED` | Unblocked |
| `INSTITUTE_CHANGED` | Institute reassigned |
| `DELETED` | Device deleted |
| `STATUS_MODE_CHANGED` | AllowedStatusMode changed |
| `RATE_LIMIT_CHANGED` | Rate limit changed |

---

## 3. Database Schema (5 Tables)

### 3.1 `attendance_devices`
| Column | Type | Description |
|--------|------|-------------|
| `id` | BIGINT PK | Auto-increment |
| `device_uid` | VARCHAR(128) UNIQUE | Hardware/serial identifier |
| `device_name` | VARCHAR(255) | Human-readable label |
| `device_type` | ENUM | See DeviceType |
| `institute_id` | VARCHAR(64) NULL | Assigned institute |
| `institute_name` | VARCHAR(255) NULL | Denormalized name |
| `is_enabled` | TINYINT | 1 = enabled, 0 = disabled |
| `status` | ENUM | See DeviceStatus |
| `assigned_by` | VARCHAR(64) NULL | Who assigned it |
| `assigned_at` | TIMESTAMP NULL | When assigned |
| `last_heartbeat_at` | TIMESTAMP NULL | Last ping |
| `last_activity_at` | TIMESTAMP NULL | Last mark |
| `ip_address` | VARCHAR(45) NULL | Last known IP |
| `firmware_version` | VARCHAR(64) NULL | Software version |
| `metadata` | JSON NULL | Extensible metadata |
| `description` | TEXT NULL | Notes |
| `created_at` | TIMESTAMP | Auto |
| `updated_at` | TIMESTAMP | Auto |

### 3.2 `attendance_device_config`
| Column | Type | Default | Description |
|--------|------|---------|-------------|
| `id` | BIGINT PK | — | Auto-increment |
| `device_id` | BIGINT UNIQUE FK | — | References `attendance_devices.id` |
| `max_sessions` | INT | 1 | Max concurrent sessions |
| `rate_limit_per_minute` | INT | 30 | Max marks per minute |
| `rate_limit_per_hour` | INT | 500 | Max marks per hour |
| `allowed_status_mode` | ENUM | `ANY` | ANY / BLOCKED / ONLY |
| `allowed_status_list` | JSON NULL | — | Array of statuses when mode=ONLY |
| `auto_status` | VARCHAR(32) NULL | — | Auto-apply this status |
| `require_location` | TINYINT | 0 | Force GPS |
| `require_photo` | TINYINT | 0 | Force photo |
| `allowed_ip_ranges` | JSON NULL | — | CIDR whitelist |
| `operating_start_time` | VARCHAR(5) NULL | — | HH:MM |
| `operating_end_time` | VARCHAR(5) NULL | — | HH:MM |

### 3.3 `attendance_device_event_bindings`
| Column | Type | Description |
|--------|------|-------------|
| `id` | BIGINT PK | Auto-increment |
| `device_id` | BIGINT FK | References `attendance_devices.id` |
| `event_id` | INT | Calendar event ID |
| `event_name` | VARCHAR(255) NULL | Denormalized |
| `calendar_day_id` | INT NULL | Optional day reference |
| `bound_by` | VARCHAR(64) | Who created binding |
| `is_active` | TINYINT | Only ONE active per device |
| `status` | ENUM | ACTIVE / INACTIVE |
| `status_override` | VARCHAR(32) NULL | Force this status on marks |
| `notes` | TEXT NULL | Notes |
| `bound_at` | TIMESTAMP | When bound |
| `unbound_at` | TIMESTAMP NULL | When unbound |

### 3.4 `attendance_device_sessions`
| Column | Type | Description |
|--------|------|-------------|
| `id` | BIGINT PK | Auto-increment |
| `device_id` | BIGINT FK | References `attendance_devices.id` |
| `session_token` | VARCHAR(128) UNIQUE | UUID v4 token |
| `user_id` | VARCHAR(64) NULL | Operator who logged in |
| `is_active` | TINYINT | 1 = active |
| `ip_address` | VARCHAR(45) NULL | Session IP |
| `user_agent` | VARCHAR(512) NULL | Browser/app agent |
| `marks_count` | INT | Number of marks in session |
| `started_at` | TIMESTAMP | Session start |
| `expires_at` | TIMESTAMP NULL | Expiry (24h default) |
| `ended_at` | TIMESTAMP NULL | When ended |

### 3.5 `attendance_device_audit_log`
| Column | Type | Description |
|--------|------|-------------|
| `id` | BIGINT PK | Auto-increment |
| `device_id` | BIGINT FK | References `attendance_devices.id` |
| `action` | ENUM | See DeviceAuditAction |
| `performed_by` | VARCHAR(64) | Who performed the action |
| `details` | JSON NULL | Before/after state |
| `ip_address` | VARCHAR(45) NULL | Source IP |
| `created_at` | TIMESTAMP | Immutable |

---

## 4. System Admin — Device CRUD

> **Guard:** `SUPERADMIN` only  
> **Base:** `POST /api/admin/attendance-devices`

### 4.1 Register Device

```
POST /api/admin/attendance-devices
```

**Body:**

```json
{
  "deviceUid": "DEVICE-SN-00129",
  "deviceName": "Front Gate Tablet",
  "deviceType": "TABLET",
  "instituteId": "109",
  "instituteName": "Suraksha Academy",
  "description": "Samsung Galaxy Tab A8 at main entrance"
}
```

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `deviceUid` | string | ✅ | Max 128 chars, unique |
| `deviceName` | string | ✅ | Max 255 chars |
| `deviceType` | DeviceType | ❌ | Default: `TABLET` |
| `instituteId` | string | ❌ | Assign immediately |
| `instituteName` | string | ❌ | For denormalization |
| `description` | string | ❌ | Max 500 chars |
| `metadata` | JSON | ❌ | Any extra info |

**Response `201`:**

```json
{
  "id": "1",
  "deviceUid": "DEVICE-SN-00129",
  "deviceName": "Front Gate Tablet",
  "deviceType": "TABLET",
  "instituteId": "109",
  "instituteName": "Suraksha Academy",
  "isEnabled": 1,
  "status": "ACTIVE",
  "assignedBy": "admin-user-id",
  "assignedAt": "2026-02-27T10:30:00.000Z",
  "createdAt": "2026-02-27T10:30:00.000Z",
  "updatedAt": "2026-02-27T10:30:00.000Z"
}
```

> A default `attendance_device_config` row is auto-created with default values.

---

### 4.2 Update Device

```
PATCH /api/admin/attendance-devices/:deviceId
```

**Body (all optional):**

```json
{
  "deviceName": "Main Hall Kiosk",
  "deviceType": "KIOSK",
  "description": "Updated to kiosk mode",
  "firmwareVersion": "2.3.1",
  "metadata": { "model": "Samsung Kiosk Pro" }
}
```

---

### 4.3 Delete Device

```
DELETE /api/admin/attendance-devices/:deviceId
```

**Response:** `204 No Content`

> Cascades: deletes config, bindings, sessions, then the device. Audit log entry is written before deletion.

---

## 5. System Admin — Assign / Unassign / Change Institute

### 5.1 Assign to Institute

```
POST /api/admin/attendance-devices/:deviceId/assign
```

```json
{
  "instituteId": "109",
  "instituteName": "Suraksha Academy"
}
```

### 5.2 Unassign from Institute

```
POST /api/admin/attendance-devices/:deviceId/unassign
```

No body. Nulls out `instituteId`, `instituteName`, `assignedBy`, `assignedAt`. Also deactivates any active event binding.

### 5.3 Change Institute

```
POST /api/admin/attendance-devices/:deviceId/change-institute
```

```json
{
  "instituteId": "210",
  "instituteName": "New Institute Name"
}
```

Shortcut that reassigns in one call.

---

## 6. System Admin — Enable / Disable / Block

### 6.1 Enable Device

```
POST /api/admin/attendance-devices/:deviceId/enable
```

Sets `isEnabled = 1`, `status = ACTIVE`.

### 6.2 Disable Device

```
POST /api/admin/attendance-devices/:deviceId/disable
```

Sets `isEnabled = 0`, `status = INACTIVE`.

### 6.3 Block Device

```
POST /api/admin/attendance-devices/:deviceId/block
```

```json
{
  "reason": "Suspected tampering"
}
```

Sets `isEnabled = 0`, `status = BLOCKED`. Blocked devices are rejected during attendance marking.

### 6.4 Unblock Device

```
POST /api/admin/attendance-devices/:deviceId/unblock
```

Sets `isEnabled = 1`, `status = ACTIVE`.

---

## 7. System Admin — Device Config

### 7.1 Get Config

```
GET /api/admin/attendance-devices/:deviceId/config
```

**Response:**

```json
{
  "id": "1",
  "deviceId": "1",
  "maxSessions": 1,
  "rateLimitPerMinute": 30,
  "rateLimitPerHour": 500,
  "allowedStatusMode": "ANY",
  "allowedStatusList": null,
  "autoStatus": null,
  "requireLocation": 0,
  "requirePhoto": 0,
  "allowedIpRanges": null,
  "operatingStartTime": null,
  "operatingEndTime": null
}
```

### 7.2 Update Config (All Fields)

```
PATCH /api/admin/attendance-devices/:deviceId/config
```

**System admin can update ALL fields:**

```json
{
  "maxSessions": 3,
  "rateLimitPerMinute": 60,
  "rateLimitPerHour": 1000,
  "allowedStatusMode": "ONLY",
  "allowedStatusList": ["present", "late"],
  "autoStatus": "present",
  "requireLocation": true,
  "requirePhoto": false,
  "allowedIpRanges": ["192.168.1.0/24"],
  "operatingStartTime": "07:30",
  "operatingEndTime": "18:00"
}
```

| Field | Type | System Admin | Institute Admin |
|-------|------|:---:|:---:|
| `maxSessions` | int (1-10) | ✅ | ❌ |
| `rateLimitPerMinute` | int (1-200) | ✅ | ❌ |
| `rateLimitPerHour` | int (1-5000) | ✅ | ❌ |
| `allowedStatusMode` | ENUM | ✅ | ✅ |
| `allowedStatusList` | string[] | ✅ | ✅ |
| `autoStatus` | string | ✅ | ✅ |
| `requireLocation` | boolean | ✅ | ✅ |
| `requirePhoto` | boolean | ✅ | ✅ |
| `allowedIpRanges` | string[] | ✅ | ❌ |
| `operatingStartTime` | HH:MM | ✅ | ✅ |
| `operatingEndTime` | HH:MM | ✅ | ✅ |

> When `allowedStatusMode = ONLY`, `allowedStatusList` must have at least one entry.

---

## 8. System Admin — Event Binding

### 8.1 Bind Event

```
POST /api/admin/attendance-devices/:deviceId/bind-event
```

```json
{
  "eventId": 42,
  "eventName": "Parents Meeting",
  "calendarDayId": 15,
  "statusOverride": "present",
  "notes": "Bind for Parents Meeting Feb 27"
}
```

| Field | Type | Required |
|-------|------|----------|
| `eventId` | int | ✅ |
| `eventName` | string | ❌ |
| `calendarDayId` | int | ❌ |
| `statusOverride` | string | ❌ |
| `notes` | string | ❌ |

> **Auto-deactivates** any existing active binding for this device before creating the new one.

### 8.2 Unbind Event

```
POST /api/admin/attendance-devices/:deviceId/unbind-event
```

Deactivates the current active binding.

### 8.3 Get Binding History

```
GET /api/admin/attendance-devices/:deviceId/bindings
```

Returns last 50 bindings (active and historical), newest first.

---

## 9. System Admin — Queries & Stats

### 9.1 List All Devices

```
GET /api/admin/attendance-devices
```

**Query params:**

| Param | Type | Description |
|-------|------|-------------|
| `instituteId` | string | Filter by institute |
| `status` | DeviceStatus | Filter by status |
| `deviceType` | DeviceType | Filter by type |
| `isEnabled` | boolean | Filter enabled/disabled |
| `search` | string | Search in device name |
| `page` | int | Default 1 |
| `limit` | int | Default 20 (max 100) |

**Response:**

```json
{
  "data": [ { "id": "1", "deviceUid": "...", ... } ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 42,
    "totalPages": 3
  }
}
```

### 9.2 Get Device Detail

```
GET /api/admin/attendance-devices/:deviceId
```

Returns device + config + active binding + active session count:

```json
{
  "device": { ... },
  "config": { ... },
  "activeBinding": { "eventId": 42, "eventName": "Parents Meeting", ... } | null,
  "activeSessions": 1
}
```

### 9.3 Get System Stats

```
GET /api/admin/attendance-devices/stats
```

```json
{
  "totalDevices": 42,
  "activeDevices": 35,
  "blockedDevices": 2,
  "unassignedDevices": 5,
  "totalActiveSessions": 12,
  "devicesByType": {
    "TABLET": 25,
    "KIOSK": 10,
    "NFC_TERMINAL": 5,
    "RFID_READER": 2
  }
}
```

### 9.4 Get Audit Log

```
GET /api/admin/attendance-devices/:deviceId/audit?limit=50
```

Returns newest-first audit entries:

```json
[
  {
    "id": "100",
    "deviceId": "1",
    "action": "EVENT_BOUND",
    "performedBy": "admin-user-id",
    "details": { "eventId": 42, "eventName": "Parents Meeting" },
    "ipAddress": null,
    "createdAt": "2026-02-27T10:30:00.000Z"
  }
]
```

### 9.5 Get Active Sessions

```
GET /api/admin/attendance-devices/:deviceId/sessions
```

Returns all active sessions (where `isActive = 1`).

---

## 10. Institute Admin — Device Management

> **Guard:** `SUPERADMIN` or `instituteAdmin` for the same institute  
> **Base:** `/api/institute/:instituteId/devices`  
> **Scope:** Only sees/manages devices assigned to their own institute

### 10.1 List Own Devices

```
GET /api/institute/:instituteId/devices
```

Same query params as system admin listing, but `instituteId` is forced from the URL path.

### 10.2 Get Device Detail

```
GET /api/institute/:instituteId/devices/:deviceId
```

Returns same shape as system admin detail. Rejects with `403` if device doesn't belong to this institute.

### 10.3 Update Device (Limited)

```
PATCH /api/institute/:instituteId/devices/:deviceId
```

Institute admin can only update:
- `deviceName`
- `description`

Other fields (deviceType, firmware, metadata) are ignored.

### 10.4 Enable / Disable

```
POST /api/institute/:instituteId/devices/:deviceId/enable
POST /api/institute/:instituteId/devices/:deviceId/disable
```

---

## 11. Institute Admin — Config (Limited)

### 11.1 Get Config

```
GET /api/institute/:instituteId/devices/:deviceId/config
```

### 11.2 Update Config (Status Mode & Hours Only)

```
PATCH /api/institute/:instituteId/devices/:deviceId/config
```

**Institute admin CAN change:**

```json
{
  "allowedStatusMode": "ONLY",
  "allowedStatusList": ["present", "late"],
  "autoStatus": "present",
  "requireLocation": true,
  "requirePhoto": false,
  "operatingStartTime": "07:30",
  "operatingEndTime": "18:00"
}
```

**Institute admin CANNOT change:** `maxSessions`, `rateLimitPerMinute`, `rateLimitPerHour`, `allowedIpRanges` — these are system-admin-only.

---

## 12. Institute Admin — Event Binding

### 12.1 Bind Event

```
POST /api/institute/:instituteId/devices/:deviceId/bind-event
```

```json
{
  "eventId": 42,
  "eventName": "Parents Meeting",
  "statusOverride": "present",
  "notes": "For Feb 27 parents meeting"
}
```

This is the **core feature** — bind a device to an event so that ALL attendance marks through that device are automatically tagged with this event ID. Device stays bound until explicitly unbound or re-bound.

### 12.2 Unbind Event

```
POST /api/institute/:instituteId/devices/:deviceId/unbind-event
```

### 12.3 Get Active Binding

```
GET /api/institute/:instituteId/devices/:deviceId/active-binding
```

Returns the current active binding or `null`.

### 12.4 Get Binding History

```
GET /api/institute/:instituteId/devices/:deviceId/bindings
```

---

## 13. Institute Admin — Sessions

### 13.1 Start Session

```
POST /api/institute/:instituteId/devices/:deviceId/sessions/start
```

**Rate limited:** 10 per minute.

```json
{
  "deviceUid": "DEVICE-SN-00129",
  "userId": "teacher-123",
  "ipAddress": "192.168.1.50",
  "userAgent": "SurakshApp/2.1.0 Android/12"
}
```

**Response:**

```json
{
  "id": "10",
  "deviceId": "1",
  "sessionToken": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "userId": "teacher-123",
  "isActive": 1,
  "startedAt": "2026-02-27T10:30:00.000Z",
  "expiresAt": "2026-02-28T10:30:00.000Z"
}
```

Returns `400` if `maxSessions` limit reached.

### 13.2 End Session

```
POST /api/institute/:instituteId/devices/:deviceId/sessions/:sessionToken/end
```

### 13.3 List Active Sessions

```
GET /api/institute/:instituteId/devices/:deviceId/sessions
```

---

## 14. Institute Admin — Heartbeat & Audit

### 14.1 Device Heartbeat

```
POST /api/institute/:instituteId/devices/heartbeat
```

**Rate limited:** 60 per minute.

```json
{
  "deviceUid": "DEVICE-SN-00129",
  "ipAddress": "192.168.1.50",
  "firmwareVersion": "2.3.1"
}
```

**Response:**

```json
{
  "status": "ACTIVE",
  "isEnabled": true
}
```

Device uses this to check if it's still allowed to operate. If `isEnabled: false` or `status: BLOCKED`, the device app should stop marking.

### 14.2 Get Audit Log

```
GET /api/institute/:instituteId/devices/:deviceId/audit?limit=50
```

---

## 15. Attendance Integration — deviceUid Flow

When a `deviceUid` is provided in the `POST /api/attendance/mark` body, the system performs extra validation before marking:

### Flow

```
1. Frontend sends:  POST /api/attendance/mark
   {
     "studentId": "123",
     "instituteId": "109",
     "instituteName": "Suraksha Academy",
     "date": "2026-02-27",
     "status": "present",
     "deviceUid": "DEVICE-SN-00129"   ← NEW FIELD
   }

2. Backend Step 3.6 (Device Validation):
   a. Look up device by deviceUid
   b. Check isEnabled = true AND status ≠ BLOCKED/INACTIVE
   c. Check allowedStatusMode ≠ BLOCKED
   d. Check operating hours (if configured)
   e. Get active event binding → auto-populate eventId
   f. Apply statusOverride from binding/config
   g. Validate status against allowedStatusList (if mode = ONLY)

3. If validation fails → 403 Forbidden with error message
4. If passes → proceed to mark attendance in DynamoDB with enriched data
```

### Example: Device Bound to Parents Meeting

```
Device "Front Gate Tablet" is bound to Event #42 "Parents Meeting"
with statusOverride = "present"

→ Mark comes in without eventId
→ Device validation adds eventId = 42
→ Status override applies: status = "present"
→ Attendance recorded for student at Parents Meeting event
```

### Example: Device in ONLY Mode

```
Device config: allowedStatusMode = "ONLY", allowedStatusList = ["present", "late"]

→ Mark comes in with status = "absent"
→ Device validation rejects: "Status 'absent' is not allowed on this device"
→ 403 Forbidden
```

---

## 16. Permission Matrix

| Action | System Admin | Institute Admin |
|--------|:---:|:---:|
| Register device | ✅ | ❌ |
| Delete device | ✅ | ❌ |
| Assign to institute | ✅ | ❌ |
| Unassign from institute | ✅ | ❌ |
| Change institute | ✅ | ❌ |
| Enable / Disable | ✅ | ✅ (own) |
| Block / Unblock | ✅ | ❌ |
| Update device name/desc | ✅ | ✅ (own) |
| Update device type | ✅ | ❌ |
| Set maxSessions | ✅ | ❌ |
| Set rate limits | ✅ | ❌ |
| Set IP whitelist | ✅ | ❌ |
| Set status mode | ✅ | ✅ (own) |
| Set operating hours | ✅ | ✅ (own) |
| Set autoStatus | ✅ | ✅ (own) |
| Bind event | ✅ | ✅ (own) |
| Unbind event | ✅ | ✅ (own) |
| Start/End session | ✅ | ✅ (own) |
| View audit log | ✅ | ✅ (own) |
| View system stats | ✅ | ❌ |
| List all devices | ✅ | ❌ (own only) |

---

## 17. Migration SQL Reference

Run the migration at: `migrations/20250130_attendance_device_management.sql`

Creates 5 tables:
1. `attendance_devices` — core device registry
2. `attendance_device_config` — per-device configuration
3. `attendance_device_event_bindings` — device ↔ event mappings
4. `attendance_device_sessions` — active session tracking
5. `attendance_device_audit_log` — immutable audit trail

All tables use `InnoDB`, `utf8mb4_unicode_ci`, and have proper indexes and foreign keys with `ON DELETE CASCADE`.

**Rollback:**

```sql
DROP TABLE IF EXISTS attendance_device_audit_log;
DROP TABLE IF EXISTS attendance_device_sessions;
DROP TABLE IF EXISTS attendance_device_event_bindings;
DROP TABLE IF EXISTS attendance_device_config;
DROP TABLE IF EXISTS attendance_devices;
```
