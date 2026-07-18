# Attendance & Calendar API — Complete Documentation

> **Version:** 3.0 — February 2026  
> **Base URL:** `https://<host>`  
> **Auth:** All endpoints require a JWT Bearer token unless noted.  
> **Timezone:** Sri Lanka (UTC+05:30) — all dates are processed in this timezone.  
> **Related:** [Device Management API](ATTENDANCE_DEVICE_MANAGEMENT_API_DOCUMENTATION.md) for dedicated attendance devices.
use env creditains and update db also crete tableetc

---

## Table of Contents

1. [Enums & Constants](#1-enums--constants)
2. [Attendance — Mark APIs](#2-attendance--mark-apis)
   - 2.1 [Mark Single Attendance](#21-mark-single-attendance)
   - 2.2 [Mark Bulk Attendance](#22-mark-bulk-attendance)
   - 2.3 [Mark by RFID Card](#23-mark-by-rfid-card)
   - 2.4 [Mark Bulk by RFID Cards](#24-mark-bulk-by-rfid-cards)
   - 2.5 [Mark by Institute Card](#25-mark-by-institute-card)
3. [Attendance — Query APIs](#3-attendance--query-apis)
   - 3.1 [Get Student Attendance](#31-get-student-attendance)
   - 3.2 [Get Student Attendance by Card](#32-get-student-attendance-by-card)
   - 3.3 [Get Institute Attendance](#33-get-institute-attendance)
   - 3.4 [Get Class Attendance](#34-get-class-attendance)
   - 3.5 [Get Subject Attendance](#35-get-subject-attendance)
   - 3.6 [Get Class Student Attendance](#36-get-class-student-attendance)
   - 3.7 [Get Subject Student Attendance](#37-get-subject-student-attendance)
4. [Attendance — Card User Lookup](#4-attendance--card-user-lookup)
   - 4.1 [Get Institute User by Card ID](#41-get-institute-user-by-card-id)
   - 4.2 [Class-Scoped Card User Lookup](#42-class-scoped-card-user-lookup)
   - 4.3 [Subject-Scoped Card User Lookup](#43-subject-scoped-card-user-lookup)
5. [Attendance — Calendar-Linked Queries](#5-attendance--calendar-linked-queries)
   - 5.1 [Get Attendance by Event](#51-get-attendance-by-event)
   - 5.2 [Get Attendance by Calendar Day](#52-get-attendance-by-calendar-day)
   - 5.3 [Get Attendance by User Type (Institute)](#53-get-attendance-by-user-type-institute)
   - 5.4 [Get Attendance by User Type (Class)](#54-get-attendance-by-user-type-class)
   - 5.5 [Get Attendance by User Type (Subject)](#55-get-attendance-by-user-type-subject)
   - 5.6 [Get Student Attendance at Event](#56-get-student-attendance-at-event)
6. [Attendance — Alias Routes](#6-attendance--alias-routes)
7. [Institute Calendar — Operating Config](#7-institute-calendar--operating-config)
   - 7.1 [Set Operating Config (Single)](#71-set-operating-config-single)
   - 7.2 [Set Operating Config (Bulk)](#72-set-operating-config-bulk)
   - 7.3 [Get Operating Config](#73-get-operating-config)
8. [Institute Calendar — Generation & Deletion](#8-institute-calendar--generation--deletion)
   - 8.1 [Generate Calendar](#81-generate-calendar)
   - 8.2 [Delete Calendar](#82-delete-calendar)
9. [Institute Calendar — Days](#9-institute-calendar--days)
   - 9.1 [List Calendar Days (Paginated)](#91-list-calendar-days-paginated)
   - 9.2 [Get Today's Calendar Day (Cached)](#92-get-todays-calendar-day-cached)
   - 9.3 [Update Calendar Day](#93-update-calendar-day)
   - 9.4 [Delete Calendar Day](#94-delete-calendar-day)
10. [Institute Calendar — Events](#10-institute-calendar--events)
    - 10.1 [Create Calendar Event](#101-create-calendar-event)
    - 10.2 [Update Calendar Event](#102-update-calendar-event)
    - 10.3 [Delete Calendar Event](#103-delete-calendar-event)
    - 10.4 [List All Events (Paginated)](#104-list-all-events-paginated)
    - 10.5 [Get Events for a Day](#105-get-events-for-a-day)
    - 10.6 [Get Default Event for a Day](#106-get-default-event-for-a-day)
11. [Institute Calendar — Cache Management](#11-institute-calendar--cache-management)
12. [Class Calendar Endpoints](#12-class-calendar-endpoints)
    - 12.1 [Get Today (Class-Scoped)](#121-get-today-class-scoped)
    - 12.2 [Generate Calendar (Class Context)](#122-generate-calendar-class-context)
    - 12.3 [Get Events (Class-Scoped)](#123-get-events-class-scoped)
    - 12.4 [Get Days (Class-Scoped)](#124-get-days-class-scoped)
13. [DynamoDB Schema Reference](#13-dynamodb-schema-reference)
14. [Architecture Notes](#14-architecture-notes)

---

## 1. Enums & Constants

### AttendanceStatus
| Value | Description |
|-------|-------------|
| `present` | Student was present |
| `absent` | Student was absent |
| `late` | Student arrived late |
| `left` | Student left (normal) |
| `left_early` | Student left earlier than scheduled |
| `left_lately` | Student left later than scheduled |

### AttendanceUserType (auto-detected by backend)
| Value | Description |
|-------|-------------|
| `STUDENT` | Enrolled student |
| `TEACHER` | Teacher at institute |
| `INSTITUTE_ADMIN` | Institute administrator |
| `ATTENDANCE_MARKER` | Has attendance marking rights |
| `PARENT` | Parent of enrolled student |
| `NOT_ENROLLED` | User exists but not enrolled in this institute |

### MarkingMethod
| Value | Description |
|-------|-------------|
| `qr` | QR code scan |
| `barcode` | Barcode scan |
| `rfid/nfc` | RFID or NFC card tap |
| `manual` | Manually entered |
| `system` | Auto-marked by system |

### CalendarDayType
| Value | Description |
|-------|-------------|
| `REGULAR` | Normal operating day |
| `WEEKEND` | Weekend (non-operating) |
| `PUBLIC_HOLIDAY` | National holiday |
| `INSTITUTE_HOLIDAY` | Institute-specific holiday |
| `HALF_DAY` | Half-day session |
| `EXAM_DAY` | Examination day |
| `STAFF_ONLY` | Staff-only (no students) |
| `SPECIAL_EVENT` | Special event day |
| `CANCELLED` | Cancelled day |

### CalendarEventType
| Value | Description |
|-------|-------------|
| `REGULAR_CLASS` | Normal class session |
| `EXAM` | Examination |
| `PARENTS_MEETING` | Parents meeting |
| `PRIZE_GIVING` | Prize-giving ceremony |
| `SPORTS_DAY` | Sports day |
| `CULTURAL_EVENT` | Cultural event |
| `FIELD_TRIP` | Field trip |
| `WORKSHOP` | Workshop |
| `ORIENTATION` | Orientation day |
| `OPEN_DAY` | Open day |
| `RELIGIOUS_EVENT` | Religious event |
| `EXTRACURRICULAR` | Extracurricular activity |
| `STAFF_MEETING` | Staff meeting |
| `TRAINING` | Training session |
| `GRADUATION` | Graduation ceremony |
| `ADMISSION` | Admission event |
| `MAINTENANCE` | Maintenance/closure |
| `CUSTOM` | Custom event |

### CalendarEventStatus
| Value | Description |
|-------|-------------|
| `SCHEDULED` | Upcoming |
| `ONGOING` | In progress |
| `COMPLETED` | Finished |
| `CANCELLED` | Cancelled |
| `POSTPONED` | Postponed |

### CalendarEventScope
| Value | Description |
|-------|-------------|
| `INSTITUTE` | Institute-wide event |
| `CLASS` | Class-specific event |
| `SUBJECT` | Subject-specific event |

### AttendanceOpenTo
| Value | Description |
|-------|-------------|
| `TARGET_ONLY` | Only targeted user types |
| `ALL_ENROLLED` | All enrolled users |
| `ANYONE` | Anyone |

---

## 2. Attendance — Mark APIs

### 2.1 Mark Single Attendance

```
POST /api/attendance/mark
```

**Auth:** SUPERADMIN, Institute Admin, Teacher, Attendance Marker  
**Rate Limit:** 30 requests/minute

#### Request Body (`MarkAttendanceDto`)

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `studentId` | string | ✅ | Student user ID |
| `studentName` | string | ❌ | Optional — auto-fetched from DB if omitted |
| `instituteId` | string | ✅ | Institute ID |
| `instituteName` | string | ✅ | Institute name |
| `classId` | string | ❌ | Class ID (for class-specific attendance) |
| `className` | string | ❌ | Class name |
| `subjectId` | string | ❌ | Subject ID (for subject-specific attendance) |
| `subjectName` | string | ❌ | Subject name |
| `date` | string | ✅ | Date in `YYYY-MM-DD` format |
| `location` | string | ❌ | Location/address string |
| `status` | AttendanceStatus | ✅ | `present`, `absent`, `late`, `left`, `left_early`, `left_lately` |
| `remarks` | string | ❌ | Additional remarks |
| `address` | string | ❌ | Legacy location field |
| `markingMethod` | MarkingMethod | ❌ | `qr`, `barcode`, `rfid/nfc`, `manual`, `system` |
| `eventId` | string | ❌ | Calendar event ID (uses day's default event if omitted) |
| `deviceUid` | string | ❌ | Registered device UID — triggers device validation, auto-populates `eventId` from device binding |
| `userType` | AttendanceUserType | ❌ | **Do NOT send** — auto-detected by backend |

#### Example Request (standard)
```json
{
  "studentId": "123",
  "instituteId": "109",
  "instituteName": "Suraksha Learning Academy",
  "classId": "C001",
  "className": "Grade 10A",
  "subjectId": "S001",
  "subjectName": "Mathematics",
  "date": "2025-01-30",
  "status": "present",
  "markingMethod": "qr",
  "location": "Suraksha Learning Academy - Grade 10A - Mathematics"
}
```

#### Example Request (from a registered device)
```json
{
  "studentId": "123",
  "instituteId": "109",
  "instituteName": "Suraksha Learning Academy",
  "date": "2026-02-27",
  "status": "present",
  "markingMethod": "rfid/nfc",
  "deviceUid": "DEVICE-SN-00129"
}
```
> When `deviceUid` is provided, the backend validates the device, checks operating hours, applies the active event binding (auto-populating `eventId`), and enforces `allowedStatusMode`. See [Device Management API → Attendance Integration](ATTENDANCE_DEVICE_MANAGEMENT_API_DOCUMENTATION.md#15-attendance-integration--deviceuid-flow) for full details.

#### Response (201)
```json
{
  "success": true,
  "message": "Attendance marked successfully",
  "attendanceId": "ATT-1706612345-ABC123"
}
```

**Backend Behavior:**
1. Auto-detects `userType` from `institute_user` table
2. Validates user enrollment in the institute
3. Fetches user name from DB (students vs non-students use different tables)
4. Looks up today's calendar day (cached) → auto-links `calendarDayId` and default `eventId`
5. **Device validation (if `deviceUid` provided):**
   - Verifies device is enabled and not blocked
   - Checks operating hours (if configured)
   - Auto-populates `eventId` from active device-event binding
   - Applies `statusOverride` from binding/config (if no status sent)
   - Validates status against device `allowedStatusMode` (`ANY` / `BLOCKED` / `ONLY`)
   - Returns `403 Forbidden` if any device check fails
6. Marks attendance in DynamoDB with composite key
7. Sends push notification to student/parent (students only)
8. Returns image URL (institute-specific if verified, else global)

---

### 2.2 Mark Bulk Attendance

```
POST /api/attendance/mark-bulk
```

**Auth:** SUPERADMIN, Institute Admin, Teacher, Attendance Marker  
**Max Batch Size:** 100 records (configurable via `MAX_BULK_ATTENDANCE_SIZE` env var)

#### Request Body (`BulkAttendanceDto`)

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `instituteId` | string | ✅ | Institute ID |
| `instituteName` | string | ✅ | Institute name |
| `classId` | string | ❌ | Class ID |
| `className` | string | ❌ | Class name |
| `subjectId` | string | ❌ | Subject ID |
| `subjectName` | string | ❌ | Subject name |
| `location` | string | ❌ | Location string |
| `markingMethod` | MarkingMethod | ❌ | Marking method |
| `students` | StudentAttendanceItem[] | ✅ | Array of student records |

**`StudentAttendanceItem` shape:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `studentId` | string | ✅ | Student user ID |
| `studentName` | string | ❌ | Optional — auto-fetched |
| `status` | AttendanceStatus | ✅ | Attendance status |
| `remarks` | string | ❌ | Remarks |

#### Example Request
```json
{
  "instituteId": "109",
  "instituteName": "Suraksha Learning Academy",
  "classId": "C001",
  "className": "Grade 10A",
  "markingMethod": "manual",
  "students": [
    { "studentId": "S01", "status": "present" },
    { "studentId": "S02", "status": "absent", "remarks": "Sick leave" },
    { "studentId": "S03", "status": "late" }
  ]
}
```

#### Response (201)
```json
{
  "success": true,
  "message": "Bulk attendance processed",
  "summary": {
    "successful": 3,
    "failed": 0,
    "total": 3
  },
  "results": [
    { "studentId": "S01", "success": true, "attendanceId": "ATT-..." },
    { "studentId": "S02", "success": true, "attendanceId": "ATT-..." },
    { "studentId": "S03", "success": true, "attendanceId": "ATT-..." }
  ]
}
```

---

### 2.3 Mark by RFID Card

```
POST /api/attendance/mark-by-card
```

**Auth:** SUPERADMIN, Institute Admin, Teacher, Attendance Marker

#### Request Body (`MarkAttendanceByCardDto`)

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `studentCardId` | string | ✅ | RFID card ID |
| `instituteId` | string | ✅ | Institute ID |
| `instituteName` | string | ✅ | Institute name |
| `classId` | string | ❌ | Class ID |
| `className` | string | ❌ | Class name |
| `subjectId` | string | ❌ | Subject ID |
| `subjectName` | string | ❌ | Subject name |
| `address` | string | ✅ | Location string |
| `markingMethod` | MarkingMethod | ✅ | Usually `rfid/nfc` |
| `status` | AttendanceStatus | ✅ | Attendance status |

#### Example Request
```json
{
  "studentCardId": "CARD001",
  "instituteId": "109",
  "instituteName": "Suraksha Learning Academy",
  "address": "Suraksha Learning Academy - Grade 10A - Mathematics",
  "markingMethod": "rfid/nfc",
  "status": "present"
}
```

#### Response (201)
```json
{
  "success": true,
  "message": "Attendance marked successfully using card",
  "attendanceId": "ATT-...",
  "studentId": "123",
  "studentCardId": "CARD001",
  "studentName": "John Doe"
}
```

---

### 2.4 Mark Bulk by RFID Cards

```
POST /api/attendance/mark-bulk-by-card
```

**Auth:** SUPERADMIN, Institute Admin, Teacher, Attendance Marker  
**Max Batch Size:** 100 records

#### Request Body (`BulkCardAttendanceDto`)

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `instituteId` | string | ✅ | Institute ID |
| `instituteName` | string | ✅ | Institute name |
| `classId` | string | ❌ | Class ID |
| `className` | string | ❌ | Class name |
| `subjectId` | string | ❌ | Subject ID |
| `subjectName` | string | ❌ | Subject name |
| `address` | string | ✅ | Location string |
| `markingMethod` | MarkingMethod | ✅ | Usually `rfid/nfc` |
| `students` | StudentCardAttendanceDto[] | ✅ | Array of card-based attendance |

**`StudentCardAttendanceDto` shape:**

| Field | Type | Required |
|-------|------|----------|
| `studentCardId` | string | ✅ |
| `status` | AttendanceStatus | ✅ |

#### Example Request
```json
{
  "instituteId": "109",
  "instituteName": "Suraksha Learning Academy",
  "address": "Main Gate",
  "markingMethod": "rfid/nfc",
  "students": [
    { "studentCardId": "CARD001", "status": "present" },
    { "studentCardId": "CARD002", "status": "present" }
  ]
}
```

#### Response (201)
```json
{
  "success": true,
  "message": "Bulk card attendance processed",
  "summary": { "successful": 2, "failed": 0, "total": 2 },
  "results": [
    { "studentCardId": "CARD001", "studentId": "123", "studentName": "John Doe", "success": true, "attendanceId": "ATT-..." },
    { "studentCardId": "CARD002", "studentId": "456", "studentName": "Jane Doe", "success": true, "attendanceId": "ATT-..." }
  ]
}
```

---

### 2.5 Mark by Institute Card

```
POST /api/attendance/mark-by-institute-card
```

**Auth:** SUPERADMIN, Institute Admin, Teacher, Attendance Marker

Uses the `institute_user` table to look up users by `instituteCardId`. Returns image verification info.

#### Request Body (`MarkAttendanceByInstituteCardDto`)

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `instituteCardId` | string | ✅ | Institute card ID (from `institute_user` table) |
| `instituteId` | string | ✅ | Institute ID |
| `instituteName` | string | ✅ | Institute name |
| `classId` | string | ❌ | Class ID |
| `className` | string | ❌ | Class name |
| `subjectId` | string | ❌ | Subject ID |
| `subjectName` | string | ❌ | Subject name |
| `address` | string | ✅ | Location string |
| `markingMethod` | MarkingMethod | ✅ | Payment method |
| `status` | AttendanceStatus | ✅ | Attendance status |
| `date` | string | ❌ | Date (YYYY-MM-DD), defaults to today |
| `location` | string | ❌ | Auto-generated if not provided |

#### Example Request
```json
{
  "instituteCardId": "CARD001",
  "instituteId": "1",
  "instituteName": "Suraksha Learning Academy",
  "address": "Suraksha Learning Academy - Grade 10A - Mathematics",
  "markingMethod": "rfid/nfc",
  "status": "present"
}
```

#### Response (201)
```json
{
  "success": true,
  "message": "Attendance marked successfully using institute card",
  "data": {
    "studentId": "123",
    "studentName": "John Doe",
    "instituteCardId": "CARD001",
    "userIdByInstitute": "STU2024001",
    "imageUrl": "https://storage.googleapis.com/image.jpg",
    "isInstituteImage": true,
    "imageVerificationStatus": "VERIFIED",
    "status": "present",
    "markedAt": "2025-01-30T10:30:00.000Z",
    "location": "Suraksha Learning Academy - Grade 10A - Mathematics"
  }
}
```

**Image URL Logic:**  
- If `imageVerificationStatus === 'VERIFIED'` → uses `instituteUserImageUrl`  
- Otherwise → falls back to global `user.imageUrl`

---

## 3. Attendance — Query APIs

### 3.1 Get Student Attendance

```
GET /api/attendance/student/:studentId
```

**Auth:** SUPERADMIN, Institute Admin, Teacher, Student (own data), Parent (child data), Attendance Marker

#### Query Parameters

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `instituteId` | string | ✅ | Institute ID (DynamoDB GSI query) |
| `startDate` | string | ✅ | Start date `YYYY-MM-DD` |
| `endDate` | string | ✅ | End date `YYYY-MM-DD` |
| `page` | number | ❌ | Page number (default: 1) |
| `limit` | number | ❌ | Records per page (default: 20, max: 100) |
| `status` | AttendanceStatus | ❌ | Filter by status |

**Date range limit:** max 365 days

#### Example Request
```
GET /api/attendance/student/123?instituteId=109&startDate=2025-01-01&endDate=2025-01-31&page=1&limit=20
```

#### Response (200)
```json
{
  "success": true,
  "message": "Attendance records retrieved",
  "pagination": {
    "currentPage": 1,
    "totalPages": 2,
    "totalRecords": 25,
    "recordsPerPage": 20,
    "hasNextPage": true,
    "hasPrevPage": false
  },
  "data": [
    {
      "attendanceId": "ATT-...",
      "studentId": "123",
      "studentName": "John Doe",
      "instituteName": "Suraksha Learning Academy",
      "className": "Grade 10A",
      "subjectName": "Mathematics",
      "address": "...",
      "markedBy": "456",
      "markedAt": "2025-01-15T08:00:00+05:30",
      "markingMethod": "qr",
      "status": "present",
      "userType": "STUDENT"
    }
  ],
  "summary": {
    "totalPresent": 18,
    "totalAbsent": 3,
    "totalLate": 2,
    "totalLeft": 1,
    "totalLeftEarly": 1,
    "totalLeftLately": 0,
    "attendanceRate": 85.7
  }
}
```

---

### 3.2 Get Student Attendance by Card

```
GET /api/attendance/by-cardId/:cardId
```

**Auth:** SUPERADMIN, Institute Admin, Teacher, Student, Parent, Attendance Marker

#### Query Parameters

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `startDate` | string | ❌ | Start date `YYYY-MM-DD` |
| `endDate` | string | ❌ | End date `YYYY-MM-DD` |
| `page` | number | ❌ | Page (default: 1) |
| `limit` | number | ❌ | Limit (default: 20) |

**Date range limit:** max 365 days

#### Response (200)
```json
{
  "success": true,
  "message": "Attendance records retrieved",
  "studentInfo": {
    "studentId": "123",
    "studentCardId": "CARD001",
    "studentName": "John Doe",
    "instituteName": "Suraksha Learning Academy",
    "className": "Grade 10A"
  },
  "pagination": { "..." },
  "data": [ "..." ],
  "summary": {
    "totalPresent": 18,
    "totalAbsent": 3,
    "totalLate": 2,
    "totalLeft": 0,
    "totalLeftEarly": 1,
    "totalLeftLately": 0,
    "attendanceRate": 85.7
  }
}
```

---

### 3.3 Get Institute Attendance

```
GET /api/attendance/institute/:instituteId
```

**Auth:** SUPERADMIN, Institute Admin, Teacher, Attendance Marker, Student (own data), Parent (child data)

#### Query Parameters

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `startDate` | string | ✅ | Start date `YYYY-MM-DD` |
| `endDate` | string | ✅ | End date `YYYY-MM-DD` |
| `page` | number | ❌ | Page (default: 1) |
| `limit` | number | ❌ | Limit (default: 50) |
| `status` | string | ❌ | Filter by attendance status |
| `studentId` | string | ❌ | Filter by specific student |

**Date range limits:**
- Without `studentId`: max **5 days**
- With `studentId`: max **30 days**

#### Response (200)
```json
{
  "success": true,
  "message": "Institute attendance retrieved",
  "instituteInfo": {
    "instituteId": "109",
    "instituteName": "Suraksha Learning Academy"
  },
  "pagination": { "..." },
  "dateRange": {
    "startDate": "2025-01-28",
    "endDate": "2025-01-30",
    "totalDays": 3
  },
  "data": [
    {
      "attendanceId": "ATT-...",
      "studentId": "123",
      "studentName": "John Doe",
      "classId": "C001",
      "className": "Grade 10A",
      "subjectId": "S001",
      "subjectName": "Mathematics",
      "markedAt": "2025-01-30T08:00:00+05:30",
      "status": "present",
      "markingMethod": "qr",
      "markedBy": "456"
    }
  ],
  "summary": {
    "totalPresent": 120,
    "totalAbsent": 15,
    "totalLate": 8,
    "totalLeft": 2,
    "totalLeftEarly": 1,
    "totalLeftLately": 0,
    "uniqueStudents": 45,
    "totalClasses": 3,
    "totalSubjects": 8
  }
}
```

---

### 3.4 Get Class Attendance

```
GET /api/attendance/institute/:instituteId/class/:classId
```

**Auth:** Same as institute attendance  
**Date range limits:** Same as institute (5 days / 30 days with `studentId`)

#### Query Parameters

Same as [Get Institute Attendance](#33-get-institute-attendance) — `startDate`, `endDate`, `page`, `limit`, `status`, `studentId`.

#### Response shape

Same structure as institute attendance, with `classInfo` instead of `instituteInfo`:
```json
{
  "classInfo": {
    "instituteId": "109",
    "instituteName": "...",
    "classId": "C001",
    "className": "Grade 10A"
  }
}
```

---

### 3.5 Get Subject Attendance

```
GET /api/attendance/institute/:instituteId/class/:classId/subject/:subjectId
```

**Auth:** Same as institute attendance  
**Date range limits:** Same as institute (5 days / 30 days with `studentId`)

#### Query Parameters

Same as institute attendance — `startDate`, `endDate`, `page`, `limit`, `status`, `studentId`.

#### Response shape

Same structure with `subjectInfo`:
```json
{
  "subjectInfo": {
    "instituteId": "109",
    "instituteName": "...",
    "classId": "C001",
    "className": "Grade 10A",
    "subjectId": "S001",
    "subjectName": "Mathematics"
  }
}
```

---

### 3.6 Get Class Student Attendance

```
GET /api/attendance/institute/:instituteId/class/:classId/student/:studentId
```

**Auth:** SUPERADMIN, Institute Admin, Teacher, Attendance Marker, Student (own data), Parent (child data)

#### Query Parameters

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `startDate` | string | ✅ | Start date `YYYY-MM-DD` |
| `endDate` | string | ✅ | End date `YYYY-MM-DD` |
| `page` | number | ❌ | Page (default: 1) |
| `limit` | number | ❌ | Limit (default: 50) |
| `status` | string | ❌ | Filter by status |

**Date range limit:** max 365 days

---

### 3.7 Get Subject Student Attendance

```
GET /api/attendance/institute/:instituteId/class/:classId/subject/:subjectId/student/:studentId
```

**Auth:** Same as class student attendance  
**Date range limit:** max 365 days

#### Query Parameters

Same as [Get Class Student Attendance](#36-get-class-student-attendance).

---

## 4. Attendance — Card User Lookup

### 4.1 Get Institute User by Card ID

```
GET /api/attendance/institute-card-user?instituteCardId=CARD001&instituteId=1
```

**Auth:** SUPERADMIN, Institute Admin, Teacher, Attendance Marker

#### Query Parameters

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `instituteCardId` | string | ✅ | Institute card ID |
| `instituteId` | string | ✅ | Institute ID |

#### Response (200)
```json
{
  "success": true,
  "message": "Institute user retrieved successfully",
  "data": {
    "userId": "123",
    "userName": "John Doe",
    "instituteCardId": "CARD001",
    "userIdByInstitute": "STU2024001",
    "imageUrl": "https://...",
    "isInstituteImage": true,
    "imageVerificationStatus": "VERIFIED",
    "userType": "STUDENT",
    "className": "Grade 10A"
  }
}
```

---

### 4.2 Class-Scoped Card User Lookup

```
GET /api/attendance/institute/:instituteId/class/:classId/card-user?instituteCardId=CARD001
```

**Auth:** SUPERADMIN, Institute Admin, Teacher, Attendance Marker

Same response shape as 4.1, with additional `classId` in the response.

---

### 4.3 Subject-Scoped Card User Lookup

```
GET /api/attendance/institute/:instituteId/class/:classId/subject/:subjectId/card-user?instituteCardId=CARD001
```

**Auth:** SUPERADMIN, Institute Admin, Teacher, Attendance Marker

Same response shape as 4.1, with additional `classId` and `subjectId` in the response.

---

## 5. Attendance — Calendar-Linked Queries

These endpoints query attendance records linked to calendar days and events stored in MySQL.

### 5.1 Get Attendance by Event

```
GET /api/attendance/calendar/institute/:instituteId/event/:eventId
```

**Auth:** SUPERADMIN, Institute Admin, Teacher, Attendance Marker

#### Query Parameters

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `date` | string | ❌ | Filter to `YYYY-MM-DD` date |
| `classId` | string | ❌ | Class ID (for JWT guard auth) |
| `subjectId` | string | ❌ | Subject ID (for JWT guard auth) |

#### Response
Returns all attendance records linked to the specified event. Includes summary by user type.

---

### 5.2 Get Attendance by Calendar Day

```
GET /api/attendance/calendar/institute/:instituteId/calendar-day/:calendarDayId
```

**Auth:** SUPERADMIN, Institute Admin, Teacher, Attendance Marker

#### Query Parameters

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `userType` | string | ❌ | Filter: `STUDENT`, `TEACHER`, `PARENT`, `INSTITUTE_ADMIN`, `ATTENDANCE_MARKER` |
| `classId` | string | ❌ | Class ID (for JWT guard auth) |
| `subjectId` | string | ❌ | Subject ID (for JWT guard auth) |

**Validation:** Invalid `userType` returns 400 with list of valid values.

---

### 5.3 Get Attendance by User Type (Institute)

```
GET /api/attendance/calendar/institute/:instituteId/user-type/:userType
```

**Auth:** SUPERADMIN, Institute Admin, Teacher, Attendance Marker

#### Path Parameters

| Param | Type | Description |
|-------|------|-------------|
| `instituteId` | string | Institute ID |
| `userType` | string | `STUDENT`, `TEACHER`, `PARENT`, `INSTITUTE_ADMIN`, `ATTENDANCE_MARKER` |

#### Query Parameters

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `date` | string | ❌ | Filter to specific date |
| `eventId` | string | ❌ | Filter to specific event |

---

### 5.4 Get Attendance by User Type (Class)

```
GET /api/attendance/calendar/institute/:instituteId/class/:classId/user-type/:userType
```

Same as 5.3 but scoped to a specific class.

---

### 5.5 Get Attendance by User Type (Subject)

```
GET /api/attendance/calendar/institute/:instituteId/class/:classId/subject/:subjectId/user-type/:userType
```

Same as 5.3 but scoped to a specific class and subject.

---

### 5.6 Get Student Attendance at Event

```
GET /api/attendance/calendar/institute/:instituteId/student/:studentId/event/:eventId
```

**Auth:** SUPERADMIN, Institute Admin, Teacher, Attendance Marker, Student (own data only), Parent (child data)

#### Query Parameters

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `startDate` | string | ❌ | Date range start `YYYY-MM-DD` |
| `endDate` | string | ❌ | Date range end `YYYY-MM-DD` |
| `classId` | string | ❌ | Class ID (for JWT guard auth) |
| `subjectId` | string | ❌ | Subject ID (for JWT guard auth) |

Returns student's attendance records linked to a specific event (e.g., "Did this student attend the exam?").

---

## 6. Attendance — Alias Routes

The frontend `AttendanceApiClient` can also use these shorthand routes:

| Alias Route | Equivalent Full Route |
|---|---|
| `GET /institute/:instituteId` | `GET /api/attendance/institute/:instituteId` |
| `GET /institute/:instituteId/class/:classId` | `GET /api/attendance/institute/:instituteId/class/:classId` |
| `GET /institute/:instituteId/class/:classId/subject/:subjectId` | `GET /api/attendance/institute/:instituteId/class/:classId/subject/:subjectId` |

All alias routes accept the same query parameters and return identical responses as their full counterparts.

---

## 7. Institute Calendar — Operating Config

Base path: `PUT/GET /institutes/:instituteId/calendar/operating-config`

### 7.1 Set Operating Config (Single)

```
POST /institutes/:instituteId/calendar/operating-config
```

**Auth:** SUPERADMIN, Institute Admin

#### Request Body (`CreateOperatingConfigDto`)

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `dayOfWeek` | number | ✅ | 1=Monday ... 7=Sunday |
| `isOperating` | boolean | ✅ | Does the institute operate? |
| `startTime` | string | ❌ | Start time `HH:MM` |
| `endTime` | string | ❌ | End time `HH:MM` |
| `academicYear` | string | ✅ | e.g. `"2025"` |

#### Example
```json
{
  "dayOfWeek": 1,
  "isOperating": true,
  "startTime": "08:00",
  "endTime": "15:00",
  "academicYear": "2025"
}
```

---

### 7.2 Set Operating Config (Bulk)

```
POST /institutes/:instituteId/calendar/operating-config/bulk
```

**Auth:** SUPERADMIN, Institute Admin

#### Request Body (`BulkOperatingConfigDto`)

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `academicYear` | string | ✅ | Academic year |
| `configs` | BulkOperatingConfigItemDto[] | ✅ | Array of 1-7 day configs |

**`BulkOperatingConfigItemDto` shape:**

| Field | Type | Required |
|-------|------|----------|
| `dayOfWeek` | number | ✅ |
| `isOperating` | boolean | ✅ |
| `startTime` | string | ❌ |
| `endTime` | string | ❌ |

#### Example
```json
{
  "academicYear": "2025",
  "configs": [
    { "dayOfWeek": 1, "isOperating": true, "startTime": "08:00", "endTime": "15:00" },
    { "dayOfWeek": 2, "isOperating": true, "startTime": "08:00", "endTime": "15:00" },
    { "dayOfWeek": 3, "isOperating": true, "startTime": "08:00", "endTime": "15:00" },
    { "dayOfWeek": 4, "isOperating": true, "startTime": "08:00", "endTime": "15:00" },
    { "dayOfWeek": 5, "isOperating": true, "startTime": "08:00", "endTime": "13:00" },
    { "dayOfWeek": 6, "isOperating": false },
    { "dayOfWeek": 7, "isOperating": false }
  ]
}
```

---

### 7.3 Get Operating Config

```
GET /institutes/:instituteId/calendar/operating-config
```

**Auth:** JWT required (any authenticated user)

#### Query Parameters

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `academicYear` | string | ❌ | Defaults to current year |

#### Response (200)
```json
{
  "success": true,
  "data": [
    { "dayOfWeek": 1, "isOperating": true, "startTime": "08:00", "endTime": "15:00" },
    { "dayOfWeek": 2, "isOperating": true, "startTime": "08:00", "endTime": "15:00" },
    "..."
  ]
}
```

---

## 8. Institute Calendar — Generation & Deletion

### 8.1 Generate Calendar

```
POST /institutes/:instituteId/calendar/generate
```

**Auth:** SUPERADMIN, Institute Admin  
**Pre-requisite:** Operating config must be set first.  
**Conflict:** Returns 409 if calendar already exists for the academic year. Delete first (see 8.2).

#### Request Body (`GenerateCalendarDto`)

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `academicYear` | string | ✅ | e.g. `"2025"` |
| `startDate` | string | ✅ | First day `YYYY-MM-DD` |
| `endDate` | string | ✅ | Last day `YYYY-MM-DD` |
| `publicHolidays` | PublicHolidayDto[] | ❌ | Known public holidays |
| `termBreaks` | TermBreakDto[] | ❌ | Known term breaks |

**`PublicHolidayDto` shape:**
| Field | Type | Required |
|-------|------|----------|
| `date` | string | ✅ |
| `title` | string | ✅ |

**`TermBreakDto` shape:**
| Field | Type | Required |
|-------|------|----------|
| `startDate` | string | ✅ |
| `endDate` | string | ✅ |
| `title` | string | ✅ |

#### Example Request
```json
{
  "academicYear": "2025",
  "startDate": "2025-01-06",
  "endDate": "2025-12-19",
  "publicHolidays": [
    { "date": "2025-01-14", "title": "Thai Pongal" },
    { "date": "2025-02-04", "title": "Independence Day" },
    { "date": "2025-05-12", "title": "Vesak Poya Day" }
  ],
  "termBreaks": [
    { "startDate": "2025-04-07", "endDate": "2025-04-18", "title": "Term 1 Break" },
    { "startDate": "2025-08-04", "endDate": "2025-08-15", "title": "Term 2 Break" }
  ]
}
```

#### Response (201)
```json
{
  "success": true,
  "message": "Generated calendar for 2025",
  "data": {
    "totalDays": 348,
    "regularDays": 195,
    "weekends": 104,
    "publicHolidays": 3,
    "termBreaks": 20,
    "totalEvents": 195
  }
}
```

**Generated artifacts:**
- Creates one `institute_calendar_days` row per date in the range
- Auto-creates a `REGULAR_CLASS` event (with `isDefault = true`) for each operating day
- Marks weekends, holidays, and term breaks with appropriate `dayType`

---

### 8.2 Delete Calendar

```
DELETE /institutes/:instituteId/calendar/:academicYear
```

**Auth:** SUPERADMIN, Institute Admin

Deletes **all** calendar days and events for the specified academic year. Required before regenerating.

#### Response (200)
```json
{
  "success": true,
  "message": "Deleted calendar for academic year 2025",
  "data": {
    "deletedDays": 348,
    "deletedEvents": 195
  }
}
```

---

## 9. Institute Calendar — Days

### 9.1 List Calendar Days (Paginated)

```
GET /institutes/:instituteId/calendar/days
```

**Auth:** JWT required

#### Query Parameters

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `startDate` | string | ❌ | Start date `YYYY-MM-DD` |
| `endDate` | string | ❌ | End date `YYYY-MM-DD` |
| `academicYear` | string | ❌ | Filter by academic year |
| `dayType` | CalendarDayType | ❌ | Filter by type |
| `isAttendanceExpected` | boolean | ❌ | `true`/`false` |
| `page` | number | ❌ | Page (default: 1) |
| `limit` | number | ❌ | Limit (default: 400) |

**Date validation:** `YYYY-MM-DD` format enforced. Dates are processed with `+05:30` offset to avoid UTC date shifts.

#### Response (200)
```json
{
  "success": true,
  "count": 31,
  "total": 365,
  "data": [
    {
      "id": 1,
      "instituteId": "109",
      "calendarDate": "2025-01-06",
      "dayOfWeek": 1,
      "dayType": "REGULAR",
      "title": "Monday",
      "isAttendanceExpected": true,
      "startTime": "08:00",
      "endTime": "15:00",
      "academicYear": "2025",
      "events": [
        {
          "id": 1,
          "eventType": "REGULAR_CLASS",
          "title": "Regular Class",
          "isDefault": true,
          "isAttendanceTracked": true
        }
      ]
    }
  ]
}
```

---

### 9.2 Get Today's Calendar Day (Cached)

```
GET /institutes/:instituteId/calendar/today
```

**Auth:** JWT required  
**Performance:** ~0.01ms cache hit, ~3ms cache miss. Cache auto-expires at midnight Sri Lanka time.

#### Response (200)
```json
{
  "success": true,
  "data": {
    "id": 25,
    "calendarDate": "2025-01-30",
    "dayType": "REGULAR",
    "isAttendanceExpected": true,
    "startTime": "08:00",
    "endTime": "15:00",
    "defaultEventId": 25,
    "events": [ "..." ]
  }
}
```

**When no calendar exists:**
```json
{
  "success": false,
  "message": "No calendar day found for today. Calendar may need to be generated.",
  "data": null
}
```

---

### 9.3 Update Calendar Day

```
PATCH /institutes/:instituteId/calendar/days/:calendarDayId
```

**Auth:** SUPERADMIN, Institute Admin

#### Request Body

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `dayType` | CalendarDayType | ❌ | New day type |
| `title` | string | ❌ | Day title |
| `isAttendanceExpected` | boolean | ❌ | Update attendance expectation |
| `startTime` | string | ❌ | New start time `HH:MM` |
| `endTime` | string | ❌ | New end time `HH:MM` |

#### Example — Mark a regular day as holiday
```json
{
  "dayType": "INSTITUTE_HOLIDAY",
  "title": "Principal's Birthday",
  "isAttendanceExpected": false
}
```

---

### 9.4 Delete Calendar Day

```
DELETE /institutes/:instituteId/calendar/days/:calendarDayId
```

**Auth:** SUPERADMIN, Institute Admin

Deletes the calendar day and all its events.

---

## 10. Institute Calendar — Events

### 10.1 Create Calendar Event

```
POST /institutes/:instituteId/calendar/events
```

**Auth:** SUPERADMIN, Institute Admin

#### Request Body (`CreateCalendarEventDto`)

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `calendarDayId` | string | ❌ | Day to attach event (or use `calendarDate`) |
| `calendarDate` | string | ❌ | `YYYY-MM-DD` — looks up day ID automatically |
| `eventType` | CalendarEventType | ✅ | Event type (see enum) |
| `title` | string | ✅ | Event title |
| `description` | string | ❌ | Description |
| `eventDate` | string | ✅ | Event date `YYYY-MM-DD` |
| `startTime` | string | ❌ | `HH:MM` |
| `endTime` | string | ❌ | `HH:MM` |
| `isAllDay` | boolean | ❌ | Is all-day? |
| `isAttendanceTracked` | boolean | ❌ | Track attendance for this event? |
| `isDefault` | boolean | ❌ | Is default event for the day? |
| `targetUserTypes` | string[] | ❌ | `["STUDENT", "TEACHER"]` |
| `attendanceOpenTo` | AttendanceOpenTo | ❌ | `TARGET_ONLY`, `ALL_ENROLLED`, `ANYONE` |
| `targetScope` | CalendarEventScope | ❌ | `INSTITUTE`, `CLASS`, `SUBJECT` |
| `targetClassIds` | string[] | ❌ | Target class IDs |
| `targetSubjectIds` | string[] | ❌ | Target subject IDs |
| `venue` | string | ❌ | Event venue |
| `meetingLink` | string | ❌ | Virtual meeting URL |
| `status` | CalendarEventStatus | ❌ | Default: `SCHEDULED` |
| `maxParticipants` | number | ❌ | Max participants |
| `isMandatory` | boolean | ❌ | Is attendance mandatory? |
| `notes` | string | ❌ | Additional notes |

#### Example — Parents Meeting
```json
{
  "calendarDate": "2025-02-15",
  "eventType": "PARENTS_MEETING",
  "title": "Grade 10 Parents Meeting",
  "eventDate": "2025-02-15",
  "startTime": "14:00",
  "endTime": "16:00",
  "isAttendanceTracked": true,
  "targetUserTypes": ["PARENT"],
  "attendanceOpenTo": "TARGET_ONLY",
  "targetScope": "CLASS",
  "targetClassIds": ["C001"],
  "venue": "Main Hall",
  "isMandatory": true
}
```

---

### 10.2 Update Calendar Event

```
PATCH /institutes/:instituteId/calendar/events/:eventId
```

**Auth:** SUPERADMIN, Institute Admin

Accepts any subset of `CreateCalendarEventDto` fields. Only provided fields are updated.

---

### 10.3 Delete Calendar Event

```
DELETE /institutes/:instituteId/calendar/events/:eventId
```

**Auth:** SUPERADMIN, Institute Admin

---

### 10.4 List All Events (Paginated)

```
GET /institutes/:instituteId/calendar/events
```

**Auth:** JWT required

#### Query Parameters

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `startDate` | string | ❌ | Start date `YYYY-MM-DD` |
| `endDate` | string | ❌ | End date `YYYY-MM-DD` |
| `eventType` | CalendarEventType | ❌ | Filter by type |
| `page` | number | ❌ | Page (default: 1) |
| `limit` | number | ❌ | Limit (default: 100) |

#### Response (200)
```json
{
  "success": true,
  "count": 10,
  "total": 195,
  "data": [
    {
      "id": 1,
      "calendarDayId": 1,
      "eventType": "REGULAR_CLASS",
      "title": "Regular Class",
      "eventDate": "2025-01-06",
      "startTime": "08:00",
      "endTime": "15:00",
      "isDefault": true,
      "isAttendanceTracked": true,
      "status": "SCHEDULED"
    }
  ]
}
```

---

### 10.5 Get Events for a Day

```
GET /institutes/:instituteId/calendar/days/:calendarDayId/events
```

**Auth:** JWT required

#### Response (200)
```json
{
  "success": true,
  "count": 2,
  "data": [
    { "id": 1, "eventType": "REGULAR_CLASS", "isDefault": true, "..." },
    { "id": 2, "eventType": "PARENTS_MEETING", "isDefault": false, "..." }
  ]
}
```

---

### 10.6 Get Default Event for a Day

```
GET /institutes/:instituteId/calendar/days/:calendarDayId/default-event
```

**Auth:** JWT required

Returns the event with `isDefault = true` for the given day. Used when marking attendance without an explicit `eventId`.

#### Response (200)
```json
{
  "success": true,
  "data": {
    "id": 1,
    "eventType": "REGULAR_CLASS",
    "title": "Regular Class",
    "isDefault": true,
    "isAttendanceTracked": true
  }
}
```

---

## 11. Institute Calendar — Cache Management

### Invalidate Cache

```
POST /institutes/:instituteId/calendar/cache/invalidate
```

**Auth:** SUPERADMIN, Institute Admin

Forces cache refresh. The cache auto-invalidates on all write operations (create/update/delete days, events, configs).

### Get Cache Stats (Admin Only)

```
GET /institutes/:instituteId/calendar/cache/stats
```

**Auth:** SUPERADMIN, Institute Admin

Returns diagnostic info: hit count, miss count, cache size, last invalidation time.

---

## 12. Class Calendar Endpoints

These endpoints provide class-scoped calendar views with institute-level data + class-level overrides.

Base path: `/institutes/:instituteId/class/:classId/calendar/...`

### 12.1 Get Today (Class-Scoped)

```
GET /institutes/:instituteId/class/:classId/calendar/today
```

**Auth:** JWT required

#### Response (200)
```json
{
  "success": true,
  "data": {
    "id": 25,
    "calendarDate": "2025-01-30",
    "dayType": "REGULAR",
    "isAttendanceExpected": true,
    "classOverride": {
      "classDayType": "EXAM_DAY",
      "isAttendanceExpected": true
    },
    "effectiveDayType": "EXAM_DAY",
    "effectiveIsAttendanceExpected": true,
    "defaultEventId": 25
  }
}
```

The `effectiveDayType` and `effectiveIsAttendanceExpected` fields apply class overrides on top of the institute calendar.

---

### 12.2 Generate Calendar (Class Context)

```
POST /institutes/:instituteId/class/:classId/calendar/generate
```

**Auth:** SUPERADMIN, Institute Admin

Generates the base institute-level calendar (delegates to the institute calendar generator). Class overrides are added separately.

Request & response identical to [Generate Calendar (8.1)](#81-generate-calendar).

---

### 12.3 Get Events (Class-Scoped)

```
GET /institutes/:instituteId/class/:classId/calendar/events
```

**Auth:** JWT required

Returns events where `targetScope = 'INSTITUTE'` OR events specifically targeting this class.

#### Query Parameters

Same as [List All Events (10.4)](#104-list-all-events-paginated).

---

### 12.4 Get Days (Class-Scoped)

```
GET /institutes/:instituteId/class/:classId/calendar/days
```

**Auth:** JWT required

Returns institute calendar days with class-level override data merged.

#### Query Parameters

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `startDate` | string | ❌ | Start date `YYYY-MM-DD` |
| `endDate` | string | ❌ | End date `YYYY-MM-DD` |
| `page` | number | ❌ | Page (default: 1) |
| `limit` | number | ❌ | Limit (default: 400) |

---

## 13. DynamoDB Schema Reference

### Table: `AttendanceRecords`

**Primary Key:**

| Key | Pattern | Example |
|-----|---------|---------|
| PK (Partition Key) | `I#<instituteId>` | `I#109` |
| SK (Sort Key) | `ATTENDANCE#<date>#TS#<timestamp>#S#<studentId>#C#<classId>#SUB#<subjectId>` | `ATTENDANCE#2025-01-30#TS#1706612345000#S#123#C#C001#SUB#S001` |

**GSI (Student Index):**

| Key | Pattern | Example |
|-----|---------|---------|
| GSI PK | `STUDENT#<studentId>` | `STUDENT#123` |
| GSI SK | `I#<instituteId>#D#<date>#TS#<timestamp>#C#<classId>#SUB#<subjectId>` | `I#109#D#2025-01-30#TS#1706612345000#C#C001#SUB#S001` |

### Stored Attributes

| Attribute | Type | Description |
|-----------|------|-------------|
| `PK` | string | Institute partition key |
| `SK` | string | Composite sort key |
| `studentId` | string | Student user ID |
| `studentName` | string | Student name (from DB) |
| `instituteId` | string | Institute ID |
| `instituteName` | string | Institute name |
| `classId` | string | Class ID |
| `className` | string | Class name |
| `subjectId` | string | Subject ID |
| `subjectName` | string | Subject name |
| `date` | string | `YYYY-MM-DD` |
| `timestamp` | number | Unix timestamp (ms) |
| `status` | string | Attendance status |
| `markedBy` | string | User ID who marked |
| `markingMethod` | string | How it was marked |
| `address` | string | Location/address |
| `userType` | string | Auto-detected user type |
| `calendarDayId` | string | Linked calendar day ID |
| `eventId` | string | Linked calendar event ID |
| `GSI_PK` | string | Student index PK |
| `GSI_SK` | string | Student index SK |
| `createdAt` | string | ISO 8601 timestamp |
| `updatedAt` | string | ISO 8601 timestamp |

---

## 14. Architecture Notes

### Calendar → Attendance Integration Flow

```
1. Admin sets Operating Config (POST /operating-config/bulk)
   → WeeklyTemplate stored in MySQL (institute_operating_config)

2. Admin generates Calendar (POST /generate)
   → 365 calendar_days + REGULAR_CLASS events created in MySQL

3. Attendance marking (POST /mark or /mark-bulk)
   → Backend auto-calls cacheService.getTodayCalendarDay(instituteId)
   → Links attendance to calendarDayId + eventId (default or provided)
   → IF deviceUid provided: validates device → applies event binding override
   → Stores in DynamoDB with calendar linkage

4. Calendar-linked queries (GET /calendar/institute/:id/event/:eventId)
   → Joins DynamoDB attendance with MySQL calendar data
```

### Device → Event Binding Flow

```
1. System admin registers device (POST /api/admin/attendance-devices)
   → Assigns to institute, auto-creates default config

2. Institute admin binds device to event
   (POST /api/institute/:id/devices/:deviceId/bind-event)
   → Sets eventId, optional statusOverride
   → Only ONE active binding per device

3. Device marks attendance (POST /api/attendance/mark with deviceUid)
   → Step 3.6: Backend resolves device → gets active binding
   → eventId auto-populated from binding
   → statusOverride applied if configured
   → allowedStatusMode enforced (ANY/BLOCKED/ONLY)

4. Result: Attendance stored with correct eventId without
   operator needing to select the event manually
```

See [ATTENDANCE_DEVICE_MANAGEMENT_API_DOCUMENTATION.md](ATTENDANCE_DEVICE_MANAGEMENT_API_DOCUMENTATION.md) for full device management API reference.

### Caching Strategy

- `CalendarDayCacheService` stores today's calendar day in-memory per institute
- Cache TTL: expires at midnight Sri Lanka time
- Auto-invalidated on ALL write operations (create/update/delete days, events, config, generate, delete)
- Performance: ~0.01ms cache hit vs ~3ms DB fetch

### Date Handling

All dates are processed in Sri Lanka timezone (UTC+05:30):
- Date inputs with `T00:00:00+05:30` suffix to prevent UTC date shift
- `getCurrentSriLankaDate()` utility for server-side date operations
- DynamoDB stores dates as `YYYY-MM-DD` strings

### Security Model

| Role | Mark | Query Own | Query Institute | Manage Calendar | Manage Devices |
|------|------|-----------|-----------------|-----------------|----------------|
| SUPERADMIN | ✅ | ✅ | ✅ | ✅ | ✅ (all) |
| INSTITUTE_ADMIN | ✅ | ✅ | ✅ | ✅ | ✅ (own institute) |
| TEACHER | ✅ | ✅ | ✅ | ❌ | ❌ |
| ATTENDANCE_MARKER | ✅ | ✅ | ✅ | ❌ | ❌ |
| STUDENT | ❌ | ✅ (self) | ✅ (filtered) | ❌ | ❌ |
| PARENT | ❌ | ✅ (child) | ✅ (filtered) | ❌ | ❌ |

### Error Response Format

All errors follow a consistent structure:
```json
{
  "success": false,
  "message": "Human-readable error description"
}
```

Common HTTP status codes:
- `400` — Bad request (validation, date range exceeded)
- `401` — Unauthorized (missing/invalid JWT)
- `403` — Forbidden (insufficient permissions, or device rejected: disabled/blocked/wrong status mode/outside operating hours)
- `404` — Not found (student, record, calendar, or device not found)
- `409` — Conflict (calendar already exists for academic year)
- `429` — Rate limited (too many marking requests)
- `500` — Internal server error
