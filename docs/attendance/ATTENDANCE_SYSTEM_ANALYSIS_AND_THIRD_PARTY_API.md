# Attendance System Complete Analysis & Third-Party API Management Assessment

> **Generated**: January 2025  
> **Scope**: Full codebase analysis of `src/modules/attendance/`, `src/modules/attendance-device/`, related entities, and notification infrastructure  
> **Purpose**: Determine if a third-party API management system is needed for external integrations

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Current Architecture Overview](#2-current-architecture-overview)
3. [All Endpoints (Complete Inventory)](#3-all-endpoints-complete-inventory)
4. [Student Identification Mechanisms](#4-student-identification-mechanisms)
5. [Notification System Capabilities](#5-notification-system-capabilities)
6. [Device Management System](#6-device-management-system)
7. [Data Storage Architecture](#7-data-storage-architecture)
8. [Calendar Integration](#8-calendar-integration)
9. [Advertising Integration](#9-advertising-integration)
10. [Gap Analysis: Third-Party API Requirements](#10-gap-analysis-third-party-api-requirements)
11. [Recommendation: Third-Party API Management](#11-recommendation-third-party-api-management)
12. [Proposed External API Design](#12-proposed-external-api-design)
13. [Implementation Roadmap](#13-implementation-roadmap)
14. [Security Considerations](#14-security-considerations)

---

## 1. Executive Summary

### What the System Currently Does

The Suraksha LMS attendance system is a **production-grade, multi-tenant attendance platform** with:

- **Dual-storage**: DynamoDB (source of truth for real-time writes) + MySQL (read-optimized replica for reporting)
- **5 marking methods**: QR, barcode, RFID/NFC, manual, system
- **3 card-based lookup systems**: Global card (users.cardId), RFID (users.rfid), Institute card (institute_user.instituteCardId)
- **Multi-channel notifications**: WhatsApp, Email, Telegram, SMS, FCM Push — with subscription-tier filtering
- **Hardware device management**: Full CRUD for tablets/RFID readers with session tracking, event binding, audit logs
- **Calendar integration**: Every attendance record links to a calendar day and event
- **Advertisement delivery**: Personalized ads attached to attendance notifications based on multi-factor profile matching

### What's Missing for Third-Party Integration

| Capability | Current Status | Gap |
|---|---|---|
| Lookup by birth certificate number | `users.birth_certificate_no` column EXISTS (varchar 50, unique, indexed) | **No attendance API endpoint uses it** |
| Lookup by NIC/ID number | `users.nic` column EXISTS (varchar 12, unique, indexed) | **No attendance API endpoint uses it** |
| Lookup by parent phone number | `users.phone_number` on parent entities EXISTS | **No attendance API endpoint uses it** |
| External API authentication | JWT only (user login) | **No API key / service account auth** |
| Webhook notifications | N/A | **No outbound webhook system** |
| Rate limiting per API consumer | Global 30/min throttle only | **No per-consumer quotas** |
| API versioning | No version prefix | **No versioned API** |
| External device registration | JWT-authenticated only | **No device-token auth for hardware** |

### Verdict

**You do NOT need a separate third-party API management product** (like Kong, Apigee, AWS API Gateway). Your NestJS backend already has the architectural foundation. What you need is an **internal API layer extension** — a new controller module with:
1. API key authentication for external systems
2. Student lookup by alternative identifiers (birth cert, NIC, parent phone)
3. Webhook outbound notifications
4. Per-consumer rate limiting

This is a ~2-3 day implementation within your existing codebase.

---

## 2. Current Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         ATTENDANCE SYSTEM                               │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  Controllers (3):                                                       │
│  ├── AttendanceController (/api/attendance/*)        [1391 lines]      │
│  ├── AttendanceAliasController (/institute/*)        [255 lines]       │
│  └── CalendarAttendanceController (/api/attendance/calendar/*)         │
│                                                      [347 lines]       │
│                                                                         │
│  Core Service:                                                          │
│  └── AttendanceService                               [2410 lines]      │
│      ├── markAttendance()           — single student by userId          │
│      ├── markBulkAttendance()       — bulk by userId array              │
│      ├── markAttendanceByCard()     — by cardId/rfid (global)          │
│      ├── markBulkAttendanceByCard() — bulk by cardId/rfid              │
│      ├── markAttendanceByInstituteCard() — by instituteCardId          │
│      ├── getStudentAttendance()     — query by studentId               │
│      ├── getAttendanceByCard()      — query by cardId                  │
│      ├── getInstituteAttendance()   — institute-wide query             │
│      ├── getClassAttendance()       — class-level query                │
│      ├── getSubjectAttendance()     — subject-level query              │
│      ├── getAttendanceSummary()     — summary statistics               │
│      ├── getAttendanceByDate()      — daily view                       │
│      ├── getAttendanceByEvent()     — event-specific query             │
│      ├── getAttendanceByCalendarDay() — calendar day view              │
│      ├── getAttendanceByUserType()  — filter by STUDENT/TEACHER/etc.   │
│      └── getStudentAttendanceByEvent() — student + event query         │
│                                                                         │
│  Storage Services:                                                      │
│  ├── DynamoDBAttendanceService      — primary write storage            │
│  ├── DynamoDBAttendanceServiceV2    — v2 operations                    │
│  ├── AttendanceSyncConfigService    — sync mode config (ENV→DB→default)│
│  └── AttendanceSyncSchedulerService — DynamoDB→MySQL sync cron         │
│                                                                         │
│  Notification Service:                                                  │
│  └── AttendanceNotificationService  [1446 lines]                       │
│      ├── WhatsApp (session + template messages)                        │
│      ├── Email (fire-and-forget via EnhancedEmailService)              │
│      ├── Telegram (bot API)                                            │
│      ├── SMS (via SmsProviderService)                                  │
│      └── FCM Push (via FcmNotificationService)                         │
│                                                                         │
│  Device Management (separate module):                                   │
│  └── AttendanceDeviceModule                                            │
│      ├── Device CRUD (create, update, delete, assign to institute)     │
│      ├── Device Config (allowed statuses, default status, modes)       │
│      ├── Device Event Binding (bind device to calendar events)         │
│      ├── Device Sessions (heartbeat, start/end session tracking)       │
│      └── Audit Logs (all device actions logged)                        │
│                                                                         │
│  Entities:                                                              │
│  ├── AttendanceRecordEntity (MySQL mirror of DynamoDB)                 │
│  ├── AttendanceDeviceEntity                                            │
│  ├── AttendanceDeviceConfigEntity                                      │
│  ├── AttendanceDeviceEventBindingEntity                                │
│  ├── AttendanceDeviceSessionEntity                                     │
│  └── AttendanceDeviceAuditLogEntity                                    │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### Authentication & Authorization

All current endpoints use:
- **JWT Bearer Token** (`JwtAuthGuard`)
- **Role-based access** (`FlexibleAccessGuard` + `RequireAnyOfRoles`)
- Roles: `SUPERADMIN`, `Institute Admin`, `Teacher`, `Attendance Marker`, `Student` (self-only), `Parent` (children only)

### Rate Limiting

- Global: `@Throttle({ default: { ttl: 60000, limit: 30 } })` — 30 requests/minute on mark endpoints
- Bulk size limit: configurable via `MAX_BULK_ATTENDANCE_SIZE` env var (default: 100)

---

## 3. All Endpoints (Complete Inventory)

### 3.1 Attendance Marking Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/api/attendance/mark` | JWT + Role | Mark single attendance by userId |
| `POST` | `/api/attendance/mark-bulk` | JWT + Role | Mark bulk attendance by userId array |
| `POST` | `/api/attendance/mark-by-card` | JWT + Role | Mark by cardId or rfid (global card) |
| `POST` | `/api/attendance/mark-bulk-by-card` | JWT + Role | Bulk mark by cardId/rfid array |
| `POST` | `/api/attendance/mark-by-institute-card` | JWT + Role | Mark by institute-assigned card ID |

### 3.2 Attendance Query Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api/attendance/student/:studentId` | JWT + Role | Student attendance with date range + pagination |
| `GET` | `/api/attendance/by-cardId/:cardId` | JWT + Role | Attendance by global card ID |
| `GET` | `/api/attendance/institute/:instituteId` | JWT + Role | Institute-wide attendance (max 5 days, 30 with studentId) |
| `GET` | `/api/attendance/institute/:instituteId/class/:classId` | JWT + Role | Class-level attendance |
| `GET` | `/api/attendance/institute/:instituteId/class/:classId/subject/:subjectId` | JWT + Role | Subject-level attendance |
| `GET` | `/api/attendance/institute/:instituteId/class/:classId/student/:studentId` | JWT + Role | Student in class |
| `GET` | `/api/attendance/institute/:instituteId/class/:classId/subject/:subjectId/student/:studentId` | JWT + Role | Student in subject |

### 3.3 Card User Lookup Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api/attendance/institute-card-user` | JWT + Role | Lookup user by instituteCardId + instituteId |
| `GET` | `/api/attendance/institute/:instituteId/class/:classId/card-user` | JWT + Role | Same with class context |
| `GET` | `/api/attendance/institute/:instituteId/class/:classId/subject/:subjectId/card-user` | JWT + Role | Same with subject context |

### 3.4 Calendar-Linked Query Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api/attendance/calendar/institute/:instituteId/event/:eventId` | JWT + Role | Attendance by calendar event |
| `GET` | `/api/attendance/calendar/institute/:instituteId/calendar-day/:calendarDayId` | JWT + Role | Attendance by calendar day |
| `GET` | `/api/attendance/calendar/institute/:instituteId/user-type/:userType` | JWT + Role | Attendance by user type |
| `GET` | `/api/attendance/calendar/institute/:instituteId/student/:studentId/event/:eventId` | JWT + Role | Student attendance at event |

### 3.5 Alias Routes (Shorthand)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/institute/:instituteId` | JWT + Role | Alias → institute attendance |
| `GET` | `/institute/:instituteId/class/:classId` | JWT + Role | Alias → class attendance |
| `GET` | `/institute/:instituteId/class/:classId/subject/:subjectId` | JWT + Role | Alias → subject attendance |

---

## 4. Student Identification Mechanisms

### 4.1 Currently Supported for Attendance Marking

| Identifier | Where Stored | How Used | Endpoint |
|---|---|---|---|
| **userId** (internal system ID) | `users.id` (PK, bigint) | Direct lookup | `POST /mark`, `/mark-bulk` |
| **cardId** (global QR/barcode card) | `users.card_id` (varchar 50, unique) | `findOne({ where: { cardId } })` | `POST /mark-by-card` |
| **rfid** (global RFID/NFC card) | `users.rfid` (varchar 20, unique) | `findOne({ where: { rfid } })` → fallback from cardId | `POST /mark-by-card` |
| **instituteCardId** (institute-assigned card) | `institute_user.instituteCardId` | `findOne({ where: { instituteCardId, instituteId } })` | `POST /mark-by-institute-card` |

### 4.2 Available in Database But NOT Used for Attendance

| Identifier | Column | Type | Indexed | Unique |
|---|---|---|---|---|
| **Birth Certificate Number** | `users.birth_certificate_no` | varchar(50) | No (unique constraint) | ✅ Yes |
| **NIC (National ID)** | `users.nic` | varchar(12) | ✅ `idx_users_nic` | ✅ Yes |
| **Phone Number** | `users.phone_number` | varchar(15) | ✅ `idx_users_phone_number` | No |
| **Email** | `users.email` | varchar(60) | ✅ `idx_users_email_login` (unique) | ✅ Yes |
| **Student ID** (custom) | `students.student_id` | varchar(20) | No (unique constraint) | ✅ Yes |
| **User ID by Institute** | `institute_user.userIdByInstitute` | varchar | — | — |

### 4.3 Card Status Validation

The system validates card status before allowing attendance marking:
- **Card Status Check**: ACTIVE/INACTIVE/DEACTIVATED/EXPIRED/LOST/DAMAGED/REPLACED
- **Expiry Date Check**: Rejects expired cards
- Both RFID (`rfidCardStatus`, `rfidExpiryDate`) and normal cards (`cardStatus`, `cardExpiryDate`) are validated

---

## 5. Notification System Capabilities

### 5.1 Notification Channels (5 channels)

| Channel | Provider | Config | How It Works |
|---|---|---|---|
| **WhatsApp** | Meta Business API | `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID` | Session messages (free) + template messages (PREMIUM) |
| **Email** | Custom `EnhancedEmailService` | `EMAIL_SERVER_URL` / `EMAIL_API_URL` | Fire-and-forget with template-based rendering |
| **Telegram** | Bot API | `TELEGRAM_BOT_TOKEN` | Direct bot message to `user.telegramId` |
| **SMS** | `SmsProviderService` | Always available | Direct SMS to parent phone |
| **FCM Push** | Firebase Cloud Messaging | `FIREBASE_PROJECT_ID` | Push notification to mobile/web |

### 5.2 Subscription-Based Channel Selection

Channels are configured per subscription plan via `NOTIFICATION_PACKAGES_CONFIG`:
- **FREE**: Email only
- **PREMIUM**: WhatsApp (template messages)
- **PLATINUM**: WhatsApp + Email + Telegram + Push

### 5.3 Notification Flow

```
Attendance Marked
    ↓
Is Student? (only students get parent notifications)
    ↓ Yes
Fetch Student → Father → Mother → Guardian (priority order)
    ↓
Extract: parentContact, parentEmail, parentTelegramId
    ↓
Get subscription plan → determine channels
    ↓
Is Ads Enabled? → Fetch matching advertisement from DB
    ↓
Send to all channels in PARALLEL (with retry per channel)
    ↓
If ad.cascadeToParents → send SAME ad to ALL parents
    ↓
Increment ad's currentSendings counter (on success only)
```

### 5.4 Notification Data Sent

Each notification includes:
- Student name, attendance status (PRESENT/ABSENT), date, time
- Institute name, class name, subject name
- Location/address
- Vehicle/bookhire info (for transport attendance)
- Advertisement (media URL, title, content, link) — based on subscription

---

## 6. Device Management System

### 6.1 Entity Structure

```
AttendanceDeviceEntity
├── deviceUid (unique hardware ID)
├── deviceName ("Front Gate Tablet")
├── deviceType (TABLET | RFID_READER | NFC_READER | KIOSK | CAMERA | OTHER)
├── instituteId (assigned institute, nullable)
├── status (ACTIVE | INACTIVE | MAINTENANCE | DECOMMISSIONED)
├── isEnabled (boolean)
├── lastHeartbeatAt, lastActivityAt
├── ipAddress, firmwareVersion
└── metadata (JSON)

AttendanceDeviceConfigEntity
├── deviceId (FK to device)
├── defaultAttendanceStatus
├── allowedStatuses (WHITELIST | BLACKLIST | ALL)
├── allowedStatusList (JSON array)
├── autoMarkOnScan (boolean)
└── scanCooldownSeconds

AttendanceDeviceEventBindingEntity
├── deviceId + eventId (unique binding)
├── status (ACTIVE | INACTIVE)
├── statusOverride (override attendance status for this event)
└── validFrom / validUntil

AttendanceDeviceSessionEntity
├── deviceId
├── operatorUserId (who is operating the device)
├── startedAt / endedAt
└── attendanceCount (marks during session)

AttendanceDeviceAuditLogEntity
├── deviceId
├── action (CREATED | ASSIGNED | UNASSIGNED | ENABLED | DISABLED | CONFIG_CHANGED | DELETED | ...)
├── performedBy
└── details (JSON)
```

### 6.2 Device Validation During Attendance

When `deviceUid` is provided in attendance marking:
1. Device is validated (enabled, active, assigned to correct institute)
2. If device has an event binding → overrides default event assignment
3. If device has a status override → applies to attendance status
4. If device has allowed statuses config → validates the status is permitted

---

## 7. Data Storage Architecture

### 7.1 DynamoDB (Primary — Source of Truth)

**Table**: `attendance_events` (configurable via `DYNAMODB_ATTENDANCE_TABLE`)

**Key Pattern**:
- **PK**: `I#<instituteId>` (institute-based partitioning)
- **SK**: `ATTENDANCE#<date>#TS#<timestamp>#S#<studentId>#C#<classId|NONE>#SUB#<subjectId|NONE>`

**GSI** (Global Secondary Index for student-centric queries):
- **GSI PK**: `STUDENT#<studentId>`
- **GSI SK**: `I#<instituteId>#D#<date>#TS#<timestamp>#C#<classId|NONE>#SUB#<subjectId|NONE>`

**Stored Attributes**: studentId, studentName, instituteId, instituteName, classId, className, subjectId, subjectName, date, status (0-5), location, remarks, markingMethod, userType, calendarDayId, eventId, timestamp, ttl

### 7.2 MySQL (Read Replica — Reporting & Analytics)

**Table**: `attendance_records`

Mirrors DynamoDB with:
- Composite unique: `dynamoPk` + `dynamoSk`
- Indexes: institute+date, student+date, calendarDay, event, syncStatus
- Sync tracking: `syncStatus` (PENDING/SYNCED/FAILED/SKIPPED), `syncError`, `syncedAt`

### 7.3 Sync Modes (Configurable)

| Mode | Behavior | Latency | Best For |
|---|---|---|---|
| **IMMEDIATE** | Write to both DynamoDB AND MySQL in same request | +50-100ms | Small institutes, critical reporting |
| **DYNAMO_FIRST** (default) | DynamoDB first, async fire-and-forget to MySQL | ~0ms added | Most institutes |
| **BACKEND_SCHEDULE** | DynamoDB only; cron job bulk-syncs to MySQL | Minutes | High-volume, analytics can tolerate delay |

Priority: ENV `ATTENDANCE_SYNC_MODE` → DB `system_config` table → Default `DYNAMO_FIRST`

---

## 8. Calendar Integration

Every attendance record is linked to:
- **calendarDayId**: Auto-resolved from the attendance date → institute's calendar day record
- **eventId**: Either frontend-specified (special events) or auto-linked to default `REGULAR_CLASS` event

This enables:
- Calendar view of attendance (who attended on a specific day/event)
- Event-based queries (who attended Parents Meeting, Sports Day, etc.)
- Per-event attendance tracking and reporting

---

## 9. Advertising Integration

The attendance system has a sophisticated ad delivery pipeline:

1. **On attendance mark** → If student's subscription plan has `isAds: true`
2. **Profile-based matching** → `AdvertisementMatchingService.findMostMatchingAdvertisements()` with factors: userType, subscriptionPlan, age, gender, city, province, district, occupation, instituteId
3. **Best match** → Attached to notification (media URL, title, content, sendingUrl)
4. **Platform filtering** → Ad's `modeOfSending` / `supportivePlatforms` filters which channels receive it
5. **Cascade to parents** → If `cascadeToParents: true`, same ad sent to ALL parents (father, mother, guardian)
6. **Delivery tracking** → `currentSendings` incremented only after successful delivery

---

## 10. Gap Analysis: Third-Party API Requirements

### 10.1 Your Stated Requirements

You need external systems (third-party devices, government systems, school management software) to:

1. ✅ **Mark attendance** using student birth certificate number
2. ✅ **Mark attendance** using student NIC/ID number
3. ✅ **Mark attendance** using parent phone number (identify student via parent)
4. ✅ **Deliver notifications** when attendance is marked
5. ✅ **Hardware devices** should be able to call APIs without user login

### 10.2 Gap Details

#### GAP 1: No Alternative Identifier Lookup for Attendance

**Current**: All attendance marking requires `studentId` (internal userId), `cardId`, `rfid`, or `instituteCardId`.

**Database Reality**: The identifiers you need are already in the database:
- `users.birth_certificate_no` — varchar(50), **unique**, exists
- `users.nic` — varchar(12), **unique**, **indexed** (`idx_users_nic`)
- `users.phone_number` — varchar(15), **indexed** (`idx_users_phone_number`)

**What's Missing**: A lookup layer that resolves these identifiers to `userId` before calling `markAttendance()`.

#### GAP 2: No External Authentication (API Keys)

**Current**: All endpoints require JWT Bearer token from user login. No external system can authenticate without a user account.

**What's Missing**: 
- API key / service token authentication guard
- Key generation, rotation, and revocation management
- Per-key rate limiting and access control

#### GAP 3: No Webhook/Callback System

**Current**: Notifications go to parents via WhatsApp/Email/Telegram/SMS/Push. No way for external systems to receive attendance events.

**What's Missing**:
- Webhook registration endpoints
- Outbound HTTP POST notifications on attendance events
- Retry logic for webhook delivery
- Webhook signature verification (HMAC)

#### GAP 4: No API Versioning

**Current**: All endpoints are unversioned (`/api/attendance/...`).

**What's Missing**: Version prefix for stability guarantee to external consumers (`/api/v1/...`).

---

## 11. Recommendation: Third-Party API Management

### Do You Need Kong / Apigee / AWS API Gateway?

**No.** Here's why:

| Feature | Kong/Apigee/AWSAPIGW | Your NestJS Backend |
|---|---|---|
| API Key Auth | ✅ Built-in | ✅ Easy to add (10-line guard) |
| Rate Limiting | ✅ Built-in | ✅ Already using `@nestjs/throttler` |
| Routing | ✅ Built-in | ✅ NestJS controllers |
| Request Transformation | ✅ Built-in | ✅ NestJS pipes + interceptors |
| Monitoring/Analytics | ✅ Built-in | ⚠️ Need logging (but you have Logger already) |
| Cost | 💰 $50-500/mo | ✅ Free (already running) |
| Complexity | ❌ New infrastructure | ✅ Same codebase |
| Latency | ❌ +10-50ms proxy hop | ✅ Direct |

**A third-party API gateway makes sense when:**
- You have 50+ microservices needing unified routing
- You need protocol translation (gRPC ↔ REST ↔ GraphQL)
- You're multi-cloud and need vendor-neutral gateway
- You have dedicated DevOps team to manage it

**You should build it internally when:**
- You have 1 API backend (your case)
- You need 3-5 external API endpoints (your case)
- You already have rate limiting, auth guards, interceptors (your case)
- You want to ship in days, not weeks (your case)

### Recommended Approach: Internal API Extension Module

Create a new `ExternalApiModule` within your NestJS backend with:

```
src/modules/external-api/
├── external-api.module.ts
├── guards/
│   └── api-key.guard.ts              ← new API key auth guard
├── controllers/
│   └── external-attendance.controller.ts  ← new endpoints
├── services/
│   ├── api-key.service.ts            ← key management (CRUD, validate, rotate)
│   └── webhook.service.ts            ← outbound webhook delivery
├── entities/
│   ├── api-key.entity.ts             ← MySQL table for API keys
│   └── webhook-subscription.entity.ts ← webhook registrations
├── dto/
│   ├── external-mark-attendance.dto.ts ← accepts birth cert, NIC, phone
│   └── webhook.dto.ts
└── interceptors/
    └── external-api-logging.interceptor.ts ← audit all external calls
```

---

## 12. Proposed External API Design

### 12.1 Authentication: API Key

```
Authorization: Bearer ext_sk_live_abc123def456...
```

API keys stored in MySQL:
```sql
CREATE TABLE api_keys (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  key_hash VARCHAR(128) NOT NULL,     -- SHA-256 hash (never store plaintext)
  key_prefix VARCHAR(12) NOT NULL,    -- "ext_sk_live_" for display
  name VARCHAR(255) NOT NULL,         -- "School Management System"
  institute_id VARCHAR(36),           -- scoped to institute (nullable = global)
  permissions JSON,                   -- ["attendance:mark", "attendance:read", "webhook:manage"]
  rate_limit_per_minute INT DEFAULT 60,
  is_active BOOLEAN DEFAULT TRUE,
  expires_at TIMESTAMP NULL,
  created_by VARCHAR(36),
  created_at TIMESTAMP,
  last_used_at TIMESTAMP
);
```

### 12.2 New Endpoints

#### Mark Attendance by Alternative Identifier

```
POST /api/external/v1/attendance/mark
Authorization: Bearer ext_sk_live_...
Content-Type: application/json

{
  "identifier": {
    "type": "BIRTH_CERTIFICATE",     // or "NIC", "PARENT_PHONE", "STUDENT_ID"
    "value": "BC-123456789"
  },
  "instituteId": "1",
  "instituteName": "Suraksha Academy",
  "status": "present",
  "markingMethod": "system",
  "classId": "CLASS001",             // optional
  "subjectId": "SUBJ001",            // optional
  "deviceUid": "FRONT-GATE-001"      // optional
}
```

**Lookup Logic**:
```typescript
switch (identifier.type) {
  case 'BIRTH_CERTIFICATE':
    user = await userRepo.findOne({ where: { birthCertificateNo: identifier.value } });
    break;
  case 'NIC':
    user = await userRepo.findOne({ where: { nic: identifier.value } });
    break;
  case 'PARENT_PHONE':
    // Find parent by phone → find student(s) linked to parent
    const parent = await userRepo.findOne({ where: { phoneNumber: identifier.value } });
    const parentEntity = await parentRepo.findOne({ where: { userId: parent.id } });
    const students = await studentRepo.find({ 
      where: [
        { fatherId: parentEntity.userId },
        { motherId: parentEntity.userId },
        { guardianId: parentEntity.userId }
      ]
    });
    // If multiple students → require studentIndex or return error
    break;
  case 'STUDENT_ID':
    const student = await studentRepo.findOne({ where: { studentId: identifier.value } });
    user = student?.user;
    break;
}
```

#### Bulk Mark by Alternative Identifiers

```
POST /api/external/v1/attendance/mark-bulk
Authorization: Bearer ext_sk_live_...

{
  "instituteId": "1",
  "instituteName": "Suraksha Academy",
  "students": [
    { "identifier": { "type": "NIC", "value": "200012345678" }, "status": "present" },
    { "identifier": { "type": "BIRTH_CERTIFICATE", "value": "BC-987654321" }, "status": "absent" }
  ]
}
```

#### Student Lookup (Resolve Identifier)

```
GET /api/external/v1/student/resolve?type=BIRTH_CERTIFICATE&value=BC-123456789&instituteId=1
Authorization: Bearer ext_sk_live_...

Response:
{
  "success": true,
  "student": {
    "userId": "123",
    "name": "John Doe",
    "instituteCardId": "CARD001",
    "classId": "CLASS001",
    "className": "Grade 10A",
    "imageUrl": "https://..."
  }
}
```

#### Webhook Management

```
POST /api/external/v1/webhooks
Authorization: Bearer ext_sk_live_...

{
  "url": "https://school-system.example.com/attendance-webhook",
  "events": ["attendance.marked", "attendance.bulk_marked"],
  "instituteId": "1",
  "secret": "whsec_..."      // For HMAC signature verification
}
```

**Webhook Payload** (sent to registered URL):
```json
{
  "event": "attendance.marked",
  "timestamp": "2025-01-15T10:30:00.000Z",
  "data": {
    "studentId": "123",
    "studentName": "John Doe",
    "birthCertificateNo": "BC-123456789",
    "nic": "200012345678",
    "instituteId": "1",
    "instituteName": "Suraksha Academy",
    "status": "present",
    "date": "2025-01-15",
    "markingMethod": "rfid/nfc",
    "classId": "CLASS001",
    "className": "Grade 10A"
  },
  "signature": "sha256=abc123..."     // HMAC of payload with webhook secret
}
```

---

## 13. Implementation Roadmap

### Phase 1: API Key Infrastructure (Day 1)

| Task | Effort | Files |
|---|---|---|
| Create `api_keys` table + entity | 1hr | `api-key.entity.ts`, migration |
| Create `ApiKeyService` (generate, validate, rotate, revoke) | 2hr | `api-key.service.ts` |
| Create `ApiKeyGuard` (reads `Authorization: Bearer ext_sk_...`) | 1hr | `api-key.guard.ts` |
| Admin endpoints: Create/list/revoke API keys | 2hr | `api-key-admin.controller.ts` |

### Phase 2: External Attendance Endpoints (Day 2)

| Task | Effort | Files |
|---|---|---|
| Create `ExternalMarkAttendanceDto` with `identifier.type` + `identifier.value` | 1hr | `external-mark-attendance.dto.ts` |
| Create student resolver service (birth cert → userId, NIC → userId, phone → userId) | 2hr | `student-resolver.service.ts` |
| Create external attendance controller with new endpoints | 2hr | `external-attendance.controller.ts` |
| Per-API-key rate limiting decorator | 1hr | Custom `@Throttle` integration |
| Logging interceptor for all external API calls | 1hr | `external-api-logging.interceptor.ts` |

### Phase 3: Webhooks (Day 3)

| Task | Effort | Files |
|---|---|---|
| Create `webhook_subscriptions` table + entity | 1hr | `webhook-subscription.entity.ts`, migration |
| Create `WebhookService` (register, deliver, retry, verify) | 3hr | `webhook.service.ts` |
| Hook into `AttendanceService.markAttendance()` to emit webhook events | 1hr | Modify `attendance.service.ts` |
| Webhook management endpoints (CRUD) | 1hr | `webhook.controller.ts` |

### Phase 4: Documentation & Testing (Day 4, optional)

| Task | Effort |
|---|---|
| Swagger/OpenAPI docs for external API | 2hr |
| Integration tests for all external endpoints | 3hr |
| Rate limiting load test | 1hr |
| External API guide markdown | 2hr |

---

## 14. Security Considerations

### 14.1 API Key Security

- **Never store plaintext keys** — SHA-256 hash in DB, display prefix only
- **Key scoping** — Each key scoped to a specific `instituteId` (prevent cross-institute access)
- **Permission granularity** — `attendance:mark`, `attendance:read`, `webhook:manage`
- **Expiry dates** — Keys can have expiration dates for temporary integrations
- **Rotation** — Generate new key, grace period overlap, revoke old key

### 14.2 Rate Limiting

- **Per-key limits** — Each API key has its own `rate_limit_per_minute` (stored in DB)
- **Global limit** — Overall system limit prevents any single consumer from overloading
- **Burst protection** — Token bucket or sliding window algorithm
- **429 responses** — Standard HTTP 429 with `Retry-After` header

### 14.3 Data Access Control

- **Institute scoping** — API key scoped to institute can only access that institute's data
- **PII minimization** — External API returns only necessary fields (no parent emails/phones)
- **Audit logging** — Every external API call logged with: key ID, IP, endpoint, identifier used, result

### 14.4 Webhook Security

- **HMAC signatures** — Every webhook payload signed with subscriber's secret key
- **TLS only** — Only HTTPS webhook URLs accepted
- **Retry with backoff** — 3 retries with exponential backoff (1s, 5s, 30s)
- **Timeout** — 10s timeout per delivery attempt
- **Circuit breaker** — Disable webhook after 100 consecutive failures

### 14.5 Input Validation

- **Birth certificate format** — Validate format before DB lookup
- **NIC format** — Sri Lankan NIC: 9 digits + V/X or 12 digits
- **Phone format** — International format validation (+94...)
- **Sanitization** — All identifier values sanitized to prevent SQL injection (TypeORM parameterized anyway)

---

## Summary

| Question | Answer |
|---|---|
| **Do you need a third-party API management system?** | **No** — build internally in your NestJS backend |
| **Do you need new endpoints?** | **Yes** — 3-5 new endpoints for external marking by alternative identifiers |
| **Do you need new auth?** | **Yes** — API key guard for machine-to-machine auth |
| **Do you need webhooks?** | **Yes** — for notifying external systems of attendance events |
| **Are the identifiers already in the DB?** | **Yes** — birth cert, NIC, phone are all stored and indexed |
| **Estimated effort?** | **2-3 days** for the full implementation |
| **Risk level?** | **Low** — extends existing system, no architectural changes needed |

The existing attendance system is architecturally sound and feature-rich. The gap is purely at the **API surface layer** — adding new entry points that resolve alternative identifiers to internal userIds, protected by API keys instead of JWT user sessions.
