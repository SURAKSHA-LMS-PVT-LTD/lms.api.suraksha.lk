# Attendance Marking — Scoped API Guide

**Base URL:** `https://your-api.domain/api/attendance`  
**Auth:** All endpoints require `Authorization: Bearer <JWT>` except where noted.  
**Roles allowed:** SUPERADMIN · Institute Admin · Teacher · Attendance Marker

---

## 1. Core Concept — Three Scopes

Every attendance record belongs to exactly one scope. The scope is determined by **which URL pattern you POST to** — the URL path params always override the body:

| Scope | URL pattern | `eventId` in DB | `classId` in DB | `subjectId` in DB |
|-------|-------------|-----------------|-----------------|-------------------|
| **Institute** | `.../institute/:instituteId/...` | Auto-linked to default REGULAR\_CLASS event (or special event if sent) | `null` | `null` |
| **Class** | `.../institute/:instituteId/class/:classId/...` | **Always `null`** — events belong to institute, not class | `:classId` | `null` |
| **Subject** | `.../institute/:instituteId/class/:classId/subject/:subjectId/...` | **Always `null`** — events belong to institute, not subject | `:classId` | `:subjectId` |

> **Why no eventId for class/subject?**  
> Calendar events (`institute_calendar_events`) are linked to an institute, not to a class or subject.  
> Mixing an event ID into a class/subject attendance record would create an incorrect association.  
> The backend enforces this at two layers: the controller strips `eventId` from the body before the service call, and the service sets `eventId = null` whenever `classId` or `subjectId` is present.

---

## 2. Marking Methods

Five marking methods are available at **each** of the three scopes:

| Suffix | DTO used | Who scans |
|--------|----------|-----------|
| `/mark` | `MarkAttendanceDto` | Teacher/admin marks manually or from QR result |
| `/mark-bulk` | `BulkAttendanceDto` | Teacher marks a whole class at once |
| `/mark-by-card` | `MarkAttendanceByCardDto` | Device scans user's **global** QR/NFC card |
| `/mark-bulk-by-card` | `BulkCardAttendanceDto` | Device batch-scans multiple global cards |
| `/mark-by-institute-card` | `MarkAttendanceByInstituteCardDto` | Device scans user's **institute-specific** card |

---

## 3. Complete Endpoint Reference

### 3.1 Institute-Level Mark

> Records at institute level. `eventId` auto-resolved from the institute's calendar (default REGULAR\_CLASS event or explicit special event passed in body).

#### `POST /institute/:instituteId/mark`

**Body — `MarkAttendanceDto`**
```json
{
  "studentId": "456",
  "instituteName": "Suraksha Learning Academy",
  "date": "2026-03-17",
  "status": "present",
  "markingMethod": "manual",
  "eventId": "optional — only for special events like Parents Meeting, Exam, etc."
}
```

| Field | Required | Notes |
|-------|----------|-------|
| `studentId` | ✅ | User ID |
| `instituteName` | ✅ | Stored in record |
| `date` | ✅ | `YYYY-MM-DD` |
| `status` | ✅ | `present` · `absent` · `late` · `left` · `left_early` · `left_lately` |
| `studentName` | ❌ | Backend fetches from DB if omitted |
| `classId` | ❌ | **Ignored** — URL scope takes precedence |
| `subjectId` | ❌ | **Ignored** — URL scope takes precedence |
| `eventId` | ❌ | Only for special calendar events; backend auto-links default if omitted |
| `markingMethod` | ❌ | `qr` · `barcode` · `rfid/nfc` · `manual` · `system` |
| `remarks` | ❌ | Free text |
| `location` | ❌ | Auto-generated if omitted |
| `address` | ❌ | `{ latitude, longitude }` |
| `deviceUid` | ❌ | Triggers device validation if provided |
| `userType` | ❌ | **Do not send** — auto-detected from `institute_user` table |

**Response**
```json
{
  "success": true,
  "status": "present",
  "name": "K.A. Perera",
  "nameWithInitials": "K.A. Perera",
  "userType": "STUDENT",
  "date": "2026-03-17",
  "eventId": "101",
  "calendarDayId": "55",
  "availableEvents": [
    { "id": "101", "eventType": "REGULAR_CLASS", "title": "Regular Classes", "isDefault": true }
  ],
  "imageUrl": "https://storage.googleapis.com/..."
}
```

---

#### `POST /institute/:instituteId/mark-bulk`

**Body — `BulkAttendanceDto`**
```json
{
  "instituteName": "Suraksha Learning Academy",
  "date": "2026-03-17",
  "markingMethod": "manual",
  "eventId": "optional — special event only",
  "students": [
    { "studentId": "456", "status": "present" },
    { "studentId": "789", "status": "absent", "remarks": "sick leave" }
  ]
}
```

| Field | Required | Notes |
|-------|----------|-------|
| `instituteName` | ✅ | |
| `students` | ✅ | Array, max size from `MAX_BULK_ATTENDANCE_SIZE` env (default 100) |
| `students[].studentId` | ✅ | |
| `students[].status` | ✅ | |
| `date` | ❌ | Defaults to today (Sri Lanka time) |
| `eventId` | ❌ | Special event only; auto-linked if omitted |

---

#### `POST /institute/:instituteId/mark-by-card`

**Body — `MarkAttendanceByCardDto`**
```json
{
  "studentCardId": "CARD001",
  "instituteName": "Suraksha Learning Academy",
  "address": "Suraksha Learning Academy",
  "markingMethod": "rfid/nfc",
  "status": "present"
}
```

| Field | Required | Notes |
|-------|----------|-------|
| `studentCardId` | ✅ | Scanned global card / NFC value |
| `instituteName` | ✅ | |
| `address` | ✅ | Location label |
| `markingMethod` | ✅ | `qr` · `barcode` · `rfid/nfc` |
| `status` | ✅ | |
| `classId` / `subjectId` | ❌ | **Ignored** — URL scope enforces no class/subject |

**Response** — Same as `/mark` + `cardInfo` block:
```json
{
  "success": true,
  "...": "...",
  "cardInfo": {
    "cardId": "CARD001",
    "cardType": "rfid",
    "cardStatus": "ACTIVE",
    "cardExpiryDate": "2027-01-01",
    "isExpired": false
  }
}
```

---

#### `POST /institute/:instituteId/mark-bulk-by-card`

**Body — `BulkCardAttendanceDto`**
```json
{
  "instituteName": "Suraksha Learning Academy",
  "address": "Suraksha Learning Academy",
  "markingMethod": "rfid/nfc",
  "students": [
    { "studentCardId": "CARD001", "status": "present" },
    { "studentCardId": "CARD002", "status": "absent" }
  ]
}
```

---

#### `POST /institute/:instituteId/mark-by-institute-card`

**Body — `MarkAttendanceByInstituteCardDto`**
```json
{
  "instituteCardId": "ICARD001",
  "instituteName": "Suraksha Learning Academy",
  "address": "Suraksha Learning Academy",
  "markingMethod": "rfid/nfc",
  "status": "present",
  "date": "2026-03-17"
}
```

| Field | Required | Notes |
|-------|----------|-------|
| `instituteCardId` | ✅ | From `institute_user.instituteCardId` |
| `instituteName` | ✅ | |
| `address` | ✅ | |
| `markingMethod` | ✅ | |
| `status` | ✅ | |
| `date` | ❌ | Defaults to today |
| `classId` / `subjectId` | ❌ | **Ignored** — URL scope |

---

### 3.2 Class-Level Mark

> All 5 methods, same bodies as institute-level.  
> `classId` comes from URL — do not send in body (ignored).  
> **`eventId` is always `null` in DB regardless of body.**

#### `POST /institute/:instituteId/class/:classId/mark`
#### `POST /institute/:instituteId/class/:classId/mark-bulk`
#### `POST /institute/:instituteId/class/:classId/mark-by-card`
#### `POST /institute/:instituteId/class/:classId/mark-bulk-by-card`
#### `POST /institute/:instituteId/class/:classId/mark-by-institute-card`

Same request/response bodies as the institute-level equivalents.  
The response will always have `"eventId": null`.

**Example — single class mark:**
```json
// POST /api/attendance/institute/1/class/5/mark
{
  "studentId": "456",
  "instituteName": "Suraksha Learning Academy",
  "className": "Grade 10A",
  "date": "2026-03-17",
  "status": "present"
}
// → eventId will be null in DB and response
```

---

### 3.3 Subject-Level Mark

> All 5 methods. Both `classId` and `subjectId` come from URL.  
> **`eventId` is always `null` in DB regardless of body.**

#### `POST /institute/:instituteId/class/:classId/subject/:subjectId/mark`
#### `POST /institute/:instituteId/class/:classId/subject/:subjectId/mark-bulk`
#### `POST /institute/:instituteId/class/:classId/subject/:subjectId/mark-by-card`
#### `POST /institute/:instituteId/class/:classId/subject/:subjectId/mark-bulk-by-card`
#### `POST /institute/:instituteId/class/:classId/subject/:subjectId/mark-by-institute-card`

**Example — bulk subject mark:**
```json
// POST /api/attendance/institute/1/class/5/subject/9/mark-bulk
{
  "instituteName": "Suraksha Learning Academy",
  "className": "Grade 10A",
  "subjectName": "Mathematics",
  "date": "2026-03-17",
  "markingMethod": "manual",
  "students": [
    { "studentId": "456", "status": "present" },
    { "studentId": "789", "status": "late" }
  ]
}
// → eventId = null, classId = "5", subjectId = "9"
```

---

## 4. Legacy Generic Endpoints (Backward Compat)

These still exist for existing integrations — scope is determined by body fields:

| Route | Notes |
|-------|-------|
| `POST /api/attendance/mark` | Generic single mark — scope set by `classId`/`subjectId` in body |
| `POST /api/attendance/mark-bulk` | Generic bulk mark |
| `POST /api/attendance/mark-by-card` | Generic card mark |
| `POST /api/attendance/mark-bulk-by-card` | Generic bulk card mark |
| `POST /api/attendance/mark-by-institute-card` | Generic institute card mark |

> **Recommendation:** Use the scoped endpoints above for new integrations. They are explicit, enforce correct `eventId` behaviour, and are simpler to use (fewer fields needed in body).

---

## 5. Enums Reference

### AttendanceStatus
| Value | Description |
|-------|-------------|
| `present` | Present |
| `absent` | Absent |
| `late` | Late arrival |
| `left` | Left |
| `left_early` | Left early |
| `left_lately` | Left lately |

### MarkingMethod
| Value | Description |
|-------|-------------|
| `qr` | QR code scan |
| `barcode` | Barcode scan |
| `rfid/nfc` | RFID / NFC tap |
| `manual` | Manual entry by admin/teacher |
| `system` | System-generated |

### AttendanceUserType (auto-detected — do NOT send from frontend)
| Value | Description |
|-------|-------------|
| `STUDENT` | Student |
| `TEACHER` | Teacher |
| `INSTITUTE_ADMIN` | Institute admin |
| `ATTENDANCE_MARKER` | Dedicated attendance marker |
| `PARENT` | Parent |
| `NOT_ENROLLED` | User exists but not enrolled in this institute |

---

## 6. EventId Behaviour — Decision Tree

```
Request arrives at controller
│
├── URL has classId or subjectId?
│   ├── YES → eventId stripped from body immediately
│   │         service forces eventId = null
│   │         DB stores eventId = null ✅
│   │
│   └── NO (institute-level)
│       ├── Body has explicit eventId? (special event like Exam, Parents Day)
│       │   └── YES → use that eventId ✅
│       │
│       └── NO → CalendarDayCacheService resolves today's calendar day
│               ├── defaultEventId found? → use it (REGULAR_CLASS) ✅
│               └── No default event → calendarDayId set, eventId = null ⚠️
│                   (Attendance saved but won't appear in calendar event view)
│
└── Device bound to event? (deviceUid provided)
    ├── class/subject scope → device event override BLOCKED
    └── institute scope (no explicit frontend eventId) → device event override allowed
```

---

## 7. Calendar Linkage (Institute-Level Only)

Every institute-level attendance record gets two calendar fields:

| Field | DB column | Set by | Frontend can set? |
|-------|-----------|--------|-------------------|
| `calendarDayId` | `calendar_day_id` | Backend always (from today's date) | No |
| `eventId` | `event_id` | Backend default (REGULAR\_CLASS) or frontend special event | Only optional special event |

These link to:
- `institute_calendar_days.id` → the day record  
- `institute_calendar_events.id` → the event within that day

Class/subject attendance records have both fields as `null`.

---

## 8. Frontend Integration Quick Reference

### Mark a whole class at once (most common use case)
```
POST /api/attendance/institute/{instituteId}/class/{classId}/mark-bulk
```
```json
{
  "instituteName": "Suraksha Academy",
  "className": "Grade 10A",
  "date": "2026-03-17",
  "markingMethod": "manual",
  "students": [
    { "studentId": "1", "status": "present" },
    { "studentId": "2", "status": "absent" },
    { "studentId": "3", "status": "late" }
  ]
}
```

### Mark subject attendance for one student
```
POST /api/attendance/institute/{instituteId}/class/{classId}/subject/{subjectId}/mark
```
```json
{
  "studentId": "1",
  "instituteName": "Suraksha Academy",
  "className": "Grade 10A",
  "subjectName": "Mathematics",
  "date": "2026-03-17",
  "status": "present",
  "markingMethod": "manual"
}
```

### Mark institute-level attendance for a special event (e.g. Parents Meeting)
```
POST /api/attendance/institute/{instituteId}/mark-bulk
```
```json
{
  "instituteName": "Suraksha Academy",
  "date": "2026-03-17",
  "eventId": "202",
  "markingMethod": "manual",
  "students": [
    { "studentId": "1", "status": "present" },
    { "studentId": "2", "status": "absent" }
  ]
}
```

### NFC card tap at class entrance device
```
POST /api/attendance/institute/{instituteId}/class/{classId}/mark-by-card
```
```json
{
  "studentCardId": "NFC_HEX_VALUE",
  "instituteName": "Suraksha Academy",
  "address": "Suraksha Academy - Grade 10A entrance",
  "markingMethod": "rfid/nfc",
  "status": "present"
}
```

### Institute card tap for subject attendance
```
POST /api/attendance/institute/{instituteId}/class/{classId}/subject/{subjectId}/mark-by-institute-card
```
```json
{
  "instituteCardId": "ICARD_001",
  "instituteName": "Suraksha Academy",
  "address": "Suraksha Academy - Grade 10A - Mathematics",
  "markingMethod": "rfid/nfc",
  "status": "present"
}
```

---

## 9. What the Response Always Includes

```json
{
  "success": true,
  "status": "present",
  "name": "K.A. Perera",
  "nameWithInitials": "K.A. Perera",
  "userType": "STUDENT",
  "date": "2026-03-17",
  "imageUrl": "https://storage.googleapis.com/...",

  // Institute-level only:
  "eventId": "101",               // null for class/subject scope
  "calendarDayId": "55",          // null for class/subject scope
  "availableEvents": [            // null/empty for class/subject scope
    {
      "id": "101",
      "eventType": "REGULAR_CLASS",
      "title": "Regular Classes",
      "isDefault": true,
      "isAttendanceTracked": true,
      "startTime": "08:00",
      "endTime": "14:00"
    }
  ]
}
```

`availableEvents` is returned so the frontend can show an **event picker** — if the teacher wants to re-mark with a different event (Exam, Sports Day, etc.), they choose from this list and re-POST with that `eventId`.

---

*Generated: 2026-03-17 | Backend: NestJS + TypeORM + MySQL*
