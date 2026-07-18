# Attendance API Documentation

> **Base URL**: `https://lmsapi.suraksha.lk`
> **Authentication**: All endpoints require JWT Bearer token in `Authorization` header.

---

## Table of Contents

- [Enums & Constants](#enums--constants)
- [Mark Attendance](#1-mark-attendance)
- [Mark Bulk Attendance](#2-mark-bulk-attendance)
- [Mark by Card (Student Card)](#3-mark-by-card)
- [Mark Bulk by Card](#4-mark-bulk-by-card)
- [Mark by Institute Card](#5-mark-by-institute-card)
- [Get My Attendance History](#6-get-my-attendance-history)
- [View Single Attendance Record](#7-view-single-attendance-record)
- [Get Student Attendance](#8-get-student-attendance)
- [Get Attendance by Card](#9-get-attendance-by-card)
- [Get Institute Attendance](#10-get-institute-attendance)
- [Get Class Attendance](#11-get-class-attendance)
- [Get Subject Attendance](#12-get-subject-attendance)
- [Get Class → Student Attendance](#13-get-class--student-attendance)
- [Get Subject → Student Attendance](#14-get-subject--student-attendance)
- [Get Institute Card User](#15-get-institute-card-user)
- [Get Class Card User](#16-get-class-card-user)
- [Get Subject Card User](#17-get-subject-card-user)
- [Calendar: Event Attendance](#18-calendar-event-attendance)
- [Calendar: Calendar Day Attendance](#19-calendar-calendar-day-attendance)
- [Calendar: User Type Attendance](#20-calendar-user-type-attendance)
- [Calendar: Class + User Type Attendance](#21-calendar-class--user-type-attendance)
- [Calendar: Subject + User Type Attendance](#22-calendar-subject--user-type-attendance)
- [Calendar: Student Event Attendance](#23-calendar-student-event-attendance)
- [Alias Routes (Shorthand)](#alias-routes)

---

## Enums & Constants

### AttendanceStatus

| Value | Description |
|-------|-------------|
| `present` | Student was present |
| `absent` | Student was absent |
| `late` | Student was late |
| `left` | Student left |
| `left_early` | Student left early |
| `left_lately` | Student left lately |

### MarkingMethod

| Value | Description |
|-------|-------------|
| `qr` | QR code scan |
| `barcode` | Barcode scan |
| `rfid/nfc` | RFID / NFC card tap |
| `manual` | Manual entry by admin/teacher |
| `system` | System auto-mark |

### AttendanceUserType

| Value | Description |
|-------|-------------|
| `STUDENT` | Student user |
| `TEACHER` | Teacher user |
| `INSTITUTE_ADMIN` | Institute administrator |
| `ATTENDANCE_MARKER` | Designated attendance marker |
| `PARENT` | Parent user |
| `NOT_ENROLLED` | User not enrolled in institute |

---

## 1. Mark Attendance

Mark attendance for a single student.

```
POST /api/attendance/mark
```

**Auth**: JWT + Role (SUPERADMIN, instituteAdmin, teacher, attendanceMarker)
**Rate Limit**: 30 requests/minute

### Request Body

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `studentId` | string | ✅ | User ID of the student |
| `instituteId` | string | ✅ | Institute ID |
| `instituteName` | string | ✅ | Institute name |
| `date` | string | ✅ | Date in `YYYY-MM-DD` format |
| `status` | AttendanceStatus | ✅ | Attendance status |
| `classId` | string | ❌ | Class ID |
| `className` | string | ❌ | Class name |
| `subjectId` | string | ❌ | Subject ID |
| `subjectName` | string | ❌ | Subject name |
| `location` | string | ❌ | Location text (auto-generated if omitted) |
| `address` | object | ❌ | `{ latitude?: number, longitude?: number }` |
| `remarks` | string | ❌ | Additional remarks |
| `markingMethod` | MarkingMethod | ❌ | How attendance was marked |
| `eventId` | string | ❌ | Calendar event ID (auto-links to REGULAR_CLASS if omitted) |
| `deviceUid` | string | ❌ | Registered attendance device UID |
| `studentName` | string | ❌ | Auto-fetched from DB if omitted |
| `studentImageUrl` | string | ❌ | Auto-resolved from DB if omitted |

> **Note**: `userType` is **auto-detected** by the backend from the `institute_user` table. Do not send it.

### Response

```json
{
  "success": true,
  "imageUrl": "https://storage.suraksha.lk/...",
  "status": "present",
  "name": "K.A. Perera",
  "nameWithInitials": "K.A. Perera",
  "userType": "STUDENT",
  "date": "2026-03-15",
  "eventId": "202",
  "calendarDayId": "101",
  "availableEvents": [
    {
      "id": "202",
      "eventType": "REGULAR_CLASS",
      "title": "Regular Class",
      "isDefault": true,
      "isAttendanceTracked": true,
      "startTime": "08:00",
      "endTime": "14:00"
    }
  ]
}
```

### Backend Behavior

1. Auto-detects `userType` from `institute_user` table
2. Validates student enrollment
3. Fetches user data (name, image) from DB if not provided
4. Resolves calendar day + event linkage (`calendarDayId`, `eventId`)
5. Validates device if `deviceUid` provided
6. Resolves image (institute-verified image → global profile image fallback)
7. Sends push notification for students

---

## 2. Mark Bulk Attendance

Mark attendance for multiple students at once.

```
POST /api/attendance/mark-bulk
```

**Auth**: JWT + Role (SUPERADMIN, instituteAdmin, teacher, attendanceMarker)

### Request Body

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `instituteId` | string | ✅ | Institute ID |
| `instituteName` | string | ✅ | Institute name |
| `students` | StudentAttendanceItem[] | ✅ | Array of students (max 100) |
| `classId` | string | ❌ | Class ID |
| `className` | string | ❌ | Class name |
| `subjectId` | string | ❌ | Subject ID |
| `subjectName` | string | ❌ | Subject name |
| `location` | string | ❌ | Location text |
| `address` | object | ❌ | `{ latitude?: number, longitude?: number }` |
| `date` | string | ❌ | `YYYY-MM-DD` (defaults to today Sri Lanka time) |
| `markingMethod` | MarkingMethod | ❌ | Marking method |
| `eventId` | string | ❌ | Calendar event ID |

**StudentAttendanceItem**:

| Field | Type | Required |
|-------|------|----------|
| `studentId` | string | ✅ |
| `status` | AttendanceStatus | ✅ |
| `studentName` | string | ❌ |
| `remarks` | string | ❌ |

### Response

```json
{
  "success": true,
  "message": "Bulk attendance processed",
  "summary": {
    "successful": 25,
    "failed": 0,
    "total": 25
  },
  "results": [
    { "studentId": "123", "success": true, "attendanceId": "..." },
    { "studentId": "456", "success": false, "error": "Student not found" }
  ]
}
```

---

## 3. Mark by Card

Mark attendance using a student's personal card (NFC/QR/Barcode).

```
POST /api/attendance/mark-by-card
```

**Auth**: JWT + Role (SUPERADMIN, instituteAdmin, teacher, attendanceMarker)

### Request Body

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `studentCardId` | string | ✅ | Student's card identifier |
| `instituteId` | string | ✅ | Institute ID |
| `instituteName` | string | ✅ | Institute name |
| `address` | string | ✅ | Location/address |
| `markingMethod` | MarkingMethod | ✅ | `qr`, `barcode`, or `rfid/nfc` |
| `status` | AttendanceStatus | ✅ | Attendance status |
| `classId` | string | ❌ | Class ID |
| `className` | string | ❌ | Class name |
| `subjectId` | string | ❌ | Subject ID |
| `subjectName` | string | ❌ | Subject name |

### Response

```json
{
  "success": true,
  "message": "Attendance marked successfully",
  "attendanceId": "...",
  "studentId": "123",
  "studentCardId": "CARD001",
  "studentName": "K.A. Perera"
}
```

> **Note**: NFC cards use the `rfid` column in the students table. QR/Barcode uses the `cardId` column. Card status and expiry are validated.

---

## 4. Mark Bulk by Card

Mark attendance for multiple students using their cards.

```
POST /api/attendance/mark-bulk-by-card
```

**Auth**: JWT + Role (SUPERADMIN, instituteAdmin, teacher, attendanceMarker)

### Request Body

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `instituteId` | string | ✅ | Institute ID |
| `instituteName` | string | ✅ | Institute name |
| `address` | string | ✅ | Location/address |
| `markingMethod` | MarkingMethod | ✅ | Marking method |
| `students` | StudentCardAttendanceDto[] | ✅ | Array of card entries |
| `classId` | string | ❌ | Class ID |
| `className` | string | ❌ | Class name |
| `subjectId` | string | ❌ | Subject ID |
| `subjectName` | string | ❌ | Subject name |

**StudentCardAttendanceDto**:

| Field | Type | Required |
|-------|------|----------|
| `studentCardId` | string | ✅ |
| `status` | AttendanceStatus | ✅ |

### Response

Same format as [Mark Bulk Attendance](#2-mark-bulk-attendance) with per-card results.

---

## 5. Mark by Institute Card

Mark attendance using an institute-issued card.

```
POST /api/attendance/mark-by-institute-card
```

**Auth**: JWT + Role (SUPERADMIN, instituteAdmin, teacher, attendanceMarker)

### Request Body

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `instituteCardId` | string | ✅ | Institute-issued card identifier |
| `instituteId` | string | ✅ | Institute ID |
| `instituteName` | string | ✅ | Institute name |
| `address` | string | ✅ | Location/address |
| `markingMethod` | MarkingMethod | ✅ | Marking method |
| `status` | AttendanceStatus | ✅ | Attendance status |
| `classId` | string | ❌ | Class ID |
| `className` | string | ❌ | Class name |
| `subjectId` | string | ❌ | Subject ID |
| `subjectName` | string | ❌ | Subject name |
| `date` | string | ❌ | `YYYY-MM-DD` |
| `location` | string | ❌ | Location text |

### Response

```json
{
  "success": true,
  "message": "Attendance marked successfully using institute card",
  "data": {
    "studentId": "123",
    "studentName": "John Doe",
    "instituteCardId": "CARD001",
    "userIdByInstitute": "STU2024001",
    "imageUrl": "https://storage.suraksha.lk/...",
    "isInstituteImage": true,
    "imageVerificationStatus": "VERIFIED",
    "status": "PRESENT",
    "markedAt": "2026-03-15T10:30:00.000Z",
    "location": "Suraksha - Grade 10A - Mathematics"
  }
}
```

---

## 6. Get My Attendance History

Get the authenticated user's own attendance history across all institutes. Optionally includes children's attendance.

```
GET /api/attendance/my-history
```

**Auth**: JWT only (any authenticated user)

### Query Parameters

| Param | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `startDate` | string | ❌ | 30 days ago | Start date `YYYY-MM-DD` |
| `endDate` | string | ❌ | Today (Sri Lanka) | End date `YYYY-MM-DD` |
| `instituteId` | string | ❌ | — | Filter by specific institute |
| `page` | number | ❌ | 1 | Page number |
| `limit` | number | ❌ | 30 | Records per page (max 100) |
| `status` | AttendanceStatus | ❌ | — | Filter by status |
| `child` | boolean | ❌ | false | Include children's attendance |

### Example Request

```
GET /api/attendance/my-history?startDate=2026-02-16&endDate=2026-03-17&child=true&page=1&limit=50
```

### Response

```json
{
  "success": true,
  "message": "Attendance history retrieved successfully",
  "pagination": {
    "currentPage": 1,
    "totalPages": 2,
    "totalRecords": 55,
    "recordsPerPage": 50,
    "hasNextPage": true,
    "hasPrevPage": false
  },
  "data": [
    {
      "date": "2026-03-15",
      "status": "present",
      "statusLabel": "Present",
      "studentId": "456",
      "studentName": "K.A. Perera",
      "studentImageUrl": "https://storage.suraksha.lk/user-images/...",
      "instituteId": "123",
      "instituteName": "Cambridge International School",
      "instituteLogoUrl": "https://storage.suraksha.lk/institute-images/...",
      "classId": "789",
      "className": "Grade 10 - A",
      "subjectId": null,
      "subjectName": null,
      "markingMethod": "qr",
      "remarks": null,
      "userType": "STUDENT",
      "location": "Cambridge International School",
      "address": {
        "latitude": 6.9271,
        "longitude": 79.8612
      },
      "latitude": 6.9271,
      "longitude": 79.8612,
      "timestamp": 1773686400000,
      "markedAt": "2026-03-15T10:30:00.000Z"
    }
  ],
  "summary": {
    "totalPresent": 20,
    "totalAbsent": 3,
    "totalLate": 2,
    "totalLeft": 0,
    "totalLeftEarly": 0,
    "totalLeftLately": 0,
    "attendanceRate": 86.96
  },
  "byInstitute": {
    "123": {
      "instituteName": "Cambridge International School",
      "instituteLogoUrl": "https://storage.suraksha.lk/institute-images/...",
      "totalPresent": 15,
      "totalAbsent": 2,
      "totalLate": 1,
      "totalLeft": 0,
      "totalLeftEarly": 0,
      "totalLeftLately": 0,
      "attendanceRate": 88.24
    }
  },
  "byStudent": {
    "456": {
      "studentName": "K.A. Perera",
      "studentImageUrl": "https://storage.suraksha.lk/user-images/...",
      "totalRecords": 10,
      "totalPresent": 8,
      "totalAbsent": 1,
      "totalLate": 1,
      "totalLeft": 0,
      "totalLeftEarly": 0,
      "totalLeftLately": 0,
      "attendanceRate": 88.89
    }
  }
}
```

> **Note**: `byStudent` is only included when `child=true` and children exist in the JWT token's `c` claim.

### Data Fields

| Field | Type | Description |
|-------|------|-------------|
| `date` | string | Attendance date (`YYYY-MM-DD`) |
| `status` | string | `present`, `absent`, `late`, `left`, `left_early`, `left_lately` |
| `statusLabel` | string | Human-readable label: "Present", "Absent", "Late", etc. |
| `studentId` | string | Student user ID |
| `studentName` | string | Student's full name |
| `studentImageUrl` | string \| null | Student's profile image URL (full URL) |
| `instituteId` | string | Institute ID |
| `instituteName` | string | Institute name |
| `instituteLogoUrl` | string \| null | Institute logo URL (full URL) |
| `classId` | string \| null | Class ID |
| `className` | string \| null | Class name |
| `subjectId` | string \| null | Subject ID |
| `subjectName` | string \| null | Subject name |
| `markingMethod` | string \| null | `qr`, `barcode`, `rfid/nfc`, `manual`, `system` |
| `remarks` | string \| null | Additional remarks |
| `userType` | string | User's role: `STUDENT`, `TEACHER`, `INSTITUTE_ADMIN`, etc. |
| `location` | string \| null | Location text |
| `address` | object \| null | `{ latitude?: number, longitude?: number }` |
| `latitude` | number \| null | Latitude (backward compat) |
| `longitude` | number \| null | Longitude (backward compat) |
| `timestamp` | number | Epoch milliseconds when attendance was marked |
| `markedAt` | string | ISO 8601 timestamp |

---

## 7. View Single Attendance Record

View a single attendance record by its encoded ID (used for notification deep-links).

```
GET /api/attendance/view
```

**Auth**: JWT only

### Query Parameters

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string | ✅ | Base64-encoded attendance record ID |

### Response

```json
{
  "id": "SXsxMjN...",
  "studentId": "456",
  "studentName": "K.A. Perera",
  "studentImageUrl": "https://storage.suraksha.lk/...",
  "instituteId": "123",
  "instituteName": "Suraksha Academy",
  "classId": "789",
  "className": "Grade 10 - A",
  "subjectId": null,
  "subjectName": null,
  "date": "2026-03-15",
  "status": 1,
  "timestamp": 1773686400000,
  "location": "Suraksha Academy, Grade 10 - A",
  "remarks": null,
  "markingMethod": "QR_CODE",
  "userType": "STUDENT",
  "calendarDayId": "101",
  "eventId": "202"
}
```

> **Note**: `status` is returned as a number here: `0`=Absent, `1`=Present, `2`=Late, `3`=Left, `4`=LeftEarly, `5`=LeftLately.

---

## 8. Get Student Attendance

Get attendance records for a specific student at a specific institute.

```
GET /api/attendance/student/:studentId
```

**Auth**: JWT + Role (SUPERADMIN, instituteAdmin, teacher, student (own), parent (children), attendanceMarker)

### Path Parameters

| Param | Type | Description |
|-------|------|-------------|
| `studentId` | string | Student user ID |

### Query Parameters

| Param | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `instituteId` | string | ✅ | — | Institute ID |
| `startDate` | string | ✅ | — | Start date `YYYY-MM-DD` |
| `endDate` | string | ✅ | — | End date `YYYY-MM-DD` |
| `page` | number | ❌ | 1 | Page number |
| `limit` | number | ❌ | 20 | Records per page (max 100) |
| `status` | AttendanceStatus | ❌ | — | Filter by status |

> **Validation**: Date range must be ≤ 365 days. `startDate` must be ≤ `endDate`.

### Response

```json
{
  "success": true,
  "message": "Student attendance retrieved successfully",
  "pagination": {
    "currentPage": 1,
    "totalPages": 3,
    "totalRecords": 45,
    "recordsPerPage": 20,
    "hasNextPage": true,
    "hasPrevPage": false
  },
  "data": [
    {
      "attendanceId": "...",
      "studentId": "456",
      "studentName": "K.A. Perera",
      "studentImageUrl": "https://storage.suraksha.lk/...",
      "instituteName": "Suraksha",
      "className": "Grade 10",
      "subjectName": "Math",
      "address": { "latitude": 6.9, "longitude": 79.8 },
      "location": "Suraksha - Grade 10 - Math",
      "latitude": 6.9,
      "longitude": 79.8,
      "markedBy": "system",
      "markedAt": "2026-03-15T10:30:00.000Z",
      "markingMethod": "qr",
      "status": "present",
      "userType": "STUDENT"
    }
  ],
  "summary": {
    "totalPresent": 20,
    "totalAbsent": 3,
    "totalLate": 2,
    "totalLeft": 0,
    "totalLeftEarly": 0,
    "totalLeftLately": 0,
    "attendanceRate": 86.96
  }
}
```

---

## 9. Get Attendance by Card

Get attendance history for a student identified by their card ID.

```
GET /api/attendance/by-cardId/:cardId
```

**Auth**: JWT + Role (SUPERADMIN, instituteAdmin, teacher, student, parent, attendanceMarker)

### Path Parameters

| Param | Type | Description |
|-------|------|-------------|
| `cardId` | string | Student card identifier |

### Query Parameters

| Param | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `startDate` | string | ❌ | — | Start date `YYYY-MM-DD` |
| `endDate` | string | ❌ | — | End date `YYYY-MM-DD` |
| `page` | number | ❌ | 1 | Page number |
| `limit` | number | ❌ | 20 | Records per page |

> **Validation**: Date range ≤ 365 days.

### Response

```json
{
  "success": true,
  "message": "Student attendance retrieved successfully",
  "studentInfo": {
    "studentId": "456",
    "studentCardId": "CARD001",
    "studentName": "K.A. Perera",
    "instituteName": "Suraksha",
    "className": "Grade 10"
  },
  "pagination": { "..." },
  "data": [
    {
      "attendanceId": "...",
      "studentId": "456",
      "studentCardId": "CARD001",
      "studentName": "K.A. Perera",
      "instituteId": "123",
      "instituteName": "Suraksha",
      "classId": "789",
      "className": "Grade 10",
      "address": { "latitude": 6.9, "longitude": 79.8 },
      "markedAt": "2026-03-15T10:30:00.000Z",
      "markingMethod": "qr",
      "status": "present"
    }
  ],
  "summary": {
    "totalPresent": 20,
    "totalAbsent": 3,
    "totalLate": 0,
    "totalLeft": 0,
    "totalLeftEarly": 0,
    "totalLeftLately": 0,
    "attendanceRate": 86.96
  }
}
```

---

## 10. Get Institute Attendance

Get attendance records for an entire institute.

```
GET /api/attendance/institute/:instituteId
```

**Auth**: JWT + Role (SUPERADMIN, instituteAdmin, teacher, attendanceMarker, student (own via studentId), parent (child via studentId))

### Path Parameters

| Param | Type | Description |
|-------|------|-------------|
| `instituteId` | string | Institute ID |

### Query Parameters

| Param | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `startDate` | string | ✅ | — | Start date `YYYY-MM-DD` |
| `endDate` | string | ✅ | — | End date `YYYY-MM-DD` |
| `page` | number | ❌ | 1 | Page number |
| `limit` | number | ❌ | 50 | Records per page |
| `status` | AttendanceStatus | ❌ | — | Filter by status |
| `studentId` | string | ❌ | — | Filter by student |

> **Validation**: Without `studentId`: max 7-day range. With `studentId`: max 30-day range.

### Response

```json
{
  "success": true,
  "message": "Institute attendance retrieved successfully",
  "pagination": { "..." },
  "data": [
    {
      "attendanceId": "...",
      "studentId": "456",
      "studentName": "K.A. Perera",
      "classId": "789",
      "className": "Grade 10",
      "subjectId": null,
      "subjectName": null,
      "markedAt": "2026-03-15T10:30:00.000Z",
      "status": "present",
      "markingMethod": "qr",
      "markedBy": "system",
      "imageUrl": "https://storage.suraksha.lk/...",
      "studentImageUrl": "https://storage.suraksha.lk/..."
    }
  ],
  "summary": {
    "totalPresent": 150,
    "totalAbsent": 20,
    "totalLate": 5,
    "totalLeft": 0,
    "totalLeftEarly": 0,
    "totalLeftLately": 0,
    "attendanceRate": 88.24
  }
}
```

---

## 11. Get Class Attendance

Get attendance records for a specific class within an institute.

```
GET /api/attendance/institute/:instituteId/class/:classId
```

**Auth**: JWT + Role (same as Institute Attendance)

### Path Parameters

| Param | Type | Description |
|-------|------|-------------|
| `instituteId` | string | Institute ID |
| `classId` | string | Class ID |

### Query Parameters

Same as [Get Institute Attendance](#10-get-institute-attendance).

> **Validation**: Without `studentId`: max 5-day range. With `studentId`: max 30-day range.

### Response

Same shape as [Get Institute Attendance](#10-get-institute-attendance).

---

## 12. Get Subject Attendance

Get attendance records for a specific subject within a class.

```
GET /api/attendance/institute/:instituteId/class/:classId/subject/:subjectId
```

**Auth**: JWT + Role (same as Institute Attendance)

### Path Parameters

| Param | Type | Description |
|-------|------|-------------|
| `instituteId` | string | Institute ID |
| `classId` | string | Class ID |
| `subjectId` | string | Subject ID |

### Query Parameters

Same as [Get Institute Attendance](#10-get-institute-attendance).

> **Validation**: Without `studentId`: max 5-day range. With `studentId`: max 30-day range.

### Response

Same shape as [Get Institute Attendance](#10-get-institute-attendance).

---

## 13. Get Class → Student Attendance

Get attendance for a specific student within a class.

```
GET /api/attendance/institute/:instituteId/class/:classId/student/:studentId
```

**Auth**: JWT + Role (SUPERADMIN, instituteAdmin, teacher, attendanceMarker, student (self only), parent (child))

### Path Parameters

| Param | Type | Description |
|-------|------|-------------|
| `instituteId` | string | Institute ID |
| `classId` | string | Class ID |
| `studentId` | string | Student ID |

### Query Parameters

| Param | Type | Required | Default |
|-------|------|----------|---------|
| `startDate` | string | ✅ | — |
| `endDate` | string | ✅ | — |
| `page` | number | ❌ | 1 |
| `limit` | number | ❌ | 50 |
| `status` | AttendanceStatus | ❌ | — |

> **Validation**: Date range max 365 days.

### Response

Same shape as [Get Institute Attendance](#10-get-institute-attendance).

---

## 14. Get Subject → Student Attendance

Get attendance for a specific student within a subject.

```
GET /api/attendance/institute/:instituteId/class/:classId/subject/:subjectId/student/:studentId
```

**Auth**: JWT + Role (same as #13)

### Path Parameters

| Param | Type | Description |
|-------|------|-------------|
| `instituteId` | string | Institute ID |
| `classId` | string | Class ID |
| `subjectId` | string | Subject ID |
| `studentId` | string | Student ID |

### Query Parameters

Same as [Get Class → Student Attendance](#13-get-class--student-attendance).

### Response

Same shape as [Get Institute Attendance](#10-get-institute-attendance).

---

## 15. Get Institute Card User

Look up a user by their institute-issued card.

```
GET /api/attendance/institute-card-user
```

**Auth**: JWT + Role (SUPERADMIN, instituteAdmin, teacher, attendanceMarker)

### Query Parameters

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `instituteCardId` | string | ✅ | Institute card identifier |
| `instituteId` | string | ✅ | Institute ID |

### Response

```json
{
  "success": true,
  "message": "Institute card user found",
  "data": {
    "userId": "123",
    "userName": "John Doe",
    "nameWithInitials": "J.D. Doe",
    "userIdByInstitute": "STU2024001",
    "instituteCardId": "CARD001",
    "imageUrl": "https://storage.suraksha.lk/...",
    "imageVerificationStatus": "VERIFIED",
    "isInstituteImage": true,
    "userType": "STUDENT",
    "status": "ACTIVE"
  }
}
```

---

## 16. Get Class Card User

Look up a user by their institute card within a class context.

```
GET /api/attendance/institute/:instituteId/class/:classId/card-user
```

**Auth**: JWT + Role (SUPERADMIN, instituteAdmin, teacher, attendanceMarker)

### Query Parameters

| Param | Type | Required |
|-------|------|----------|
| `instituteCardId` | string | ✅ |

### Response

```json
{
  "success": true,
  "message": "Institute card user found",
  "classId": "789",
  "data": { "..." }
}
```

---

## 17. Get Subject Card User

Look up a user by their institute card within a subject context.

```
GET /api/attendance/institute/:instituteId/class/:classId/subject/:subjectId/card-user
```

**Auth**: JWT + Role (SUPERADMIN, instituteAdmin, teacher, attendanceMarker)

### Query Parameters

| Param | Type | Required |
|-------|------|----------|
| `instituteCardId` | string | ✅ |

### Response

```json
{
  "success": true,
  "message": "Institute card user found",
  "classId": "789",
  "subjectId": "101",
  "data": { "..." }
}
```

---

## 18. Calendar: Event Attendance

Get attendance records for a specific calendar event.

```
GET /api/attendance/calendar/institute/:instituteId/event/:eventId
```

**Auth**: JWT + Role (SUPERADMIN, instituteAdmin, teacher, attendanceMarker)

### Path Parameters

| Param | Type | Description |
|-------|------|-------------|
| `instituteId` | string | Institute ID |
| `eventId` | string | Calendar event ID |

### Query Parameters

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `date` | string | ❌ | Filter by date `YYYY-MM-DD` |

### Response

```json
{
  "success": true,
  "message": "Event attendance retrieved successfully",
  "eventId": "202",
  "date": "2026-03-15",
  "totalRecords": 25,
  "data": [
    {
      "studentId": "456",
      "studentName": "K.A. Perera",
      "studentImageUrl": "https://storage.suraksha.lk/...",
      "status": "present",
      "date": "2026-03-15",
      "timestamp": 1773686400000,
      "markingMethod": "qr",
      "userType": "STUDENT"
    }
  ]
}
```

---

## 19. Calendar: Calendar Day Attendance

Get attendance records for a specific calendar day.

```
GET /api/attendance/calendar/institute/:instituteId/calendar-day/:calendarDayId
```

**Auth**: JWT + Role (SUPERADMIN, instituteAdmin, teacher, attendanceMarker)

### Path Parameters

| Param | Type | Description |
|-------|------|-------------|
| `instituteId` | string | Institute ID |
| `calendarDayId` | string | Calendar day ID (from `institute_calendar_days`) |

### Query Parameters

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `userType` | AttendanceUserType | ❌ | Filter by user type |

### Response

```json
{
  "success": true,
  "message": "Calendar day attendance retrieved successfully",
  "calendarDayId": "101",
  "userType": "STUDENT",
  "totalRecords": 30,
  "data": [ "..." ]
}
```

---

## 20. Calendar: User Type Attendance

Get attendance records filtered by user type for an institute.

```
GET /api/attendance/calendar/institute/:instituteId/user-type/:userType
```

**Auth**: JWT + Role (SUPERADMIN, instituteAdmin, teacher, attendanceMarker)

### Path Parameters

| Param | Type | Description |
|-------|------|-------------|
| `instituteId` | string | Institute ID |
| `userType` | AttendanceUserType | `STUDENT`, `TEACHER`, etc. |

### Query Parameters

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `date` | string | ❌ | Filter by date `YYYY-MM-DD` |
| `eventId` | string | ❌ | Filter by event ID |

### Response

```json
{
  "success": true,
  "message": "User type attendance retrieved successfully",
  "userType": "TEACHER",
  "date": "2026-03-15",
  "eventId": null,
  "classId": null,
  "subjectId": null,
  "totalRecords": 12,
  "data": [ "..." ]
}
```

---

## 21. Calendar: Class + User Type Attendance

```
GET /api/attendance/calendar/institute/:instituteId/class/:classId/user-type/:userType
```

**Auth**: JWT + Role (SUPERADMIN, instituteAdmin, teacher, attendanceMarker)

### Query Parameters

| Param | Type | Required |
|-------|------|----------|
| `date` | string | ❌ |
| `eventId` | string | ❌ |

### Response

Same shape as [User Type Attendance](#20-calendar-user-type-attendance), scoped to the class.

---

## 22. Calendar: Subject + User Type Attendance

```
GET /api/attendance/calendar/institute/:instituteId/class/:classId/subject/:subjectId/user-type/:userType
```

**Auth**: JWT + Role (SUPERADMIN, instituteAdmin, teacher, attendanceMarker)

### Query Parameters

| Param | Type | Required |
|-------|------|----------|
| `date` | string | ❌ |
| `eventId` | string | ❌ |

### Response

Same shape as [User Type Attendance](#20-calendar-user-type-attendance), scoped to class + subject.

---

## 23. Calendar: Student Event Attendance

Get a specific student's attendance for a specific event.

```
GET /api/attendance/calendar/institute/:instituteId/student/:studentId/event/:eventId
```

**Auth**: JWT + Role (SUPERADMIN, instituteAdmin, teacher, attendanceMarker, student (self only), parent (child))

### Path Parameters

| Param | Type | Description |
|-------|------|-------------|
| `instituteId` | string | Institute ID |
| `studentId` | string | Student ID |
| `eventId` | string | Event ID |

### Query Parameters

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `startDate` | string | ❌ | Start date filter |
| `endDate` | string | ❌ | End date filter |

### Response

```json
{
  "success": true,
  "message": "Student event attendance retrieved successfully",
  "studentId": "456",
  "eventId": "202",
  "totalRecords": 3,
  "data": [
    {
      "studentId": "456",
      "studentName": "K.A. Perera",
      "studentImageUrl": "https://storage.suraksha.lk/...",
      "status": "present",
      "date": "2026-03-15",
      "timestamp": 1773686400000,
      "markingMethod": "manual",
      "userType": "STUDENT"
    }
  ]
}
```

---

## Alias Routes

Shorthand routes that map to the same service methods:

| Alias Route | Maps To |
|-------------|---------|
| `GET /institute/:instituteId` | Same as [#10 Get Institute Attendance](#10-get-institute-attendance) |
| `GET /institute/:instituteId/class/:classId` | Same as [#11 Get Class Attendance](#11-get-class-attendance) |
| `GET /institute/:instituteId/class/:classId/subject/:subjectId` | Same as [#12 Get Subject Attendance](#12-get-subject-attendance) |

---

## Image Resolution Logic

### Student Images

When marking attendance, the backend resolves the student's image using this priority:

1. **Institute-verified image**: If the institute requires custom images (`INSTITUTE_IDS_WITH_CUSTOM_IMAGES` env), uses the verified `instituteUserImageUrl` from `institute_user` table
2. **Global profile image**: Falls back to `imageUrl` from the `users` table

When reading attendance (my-history, view, etc.), images are resolved:

1. **Stored snapshot**: Image URL stored in the attendance record at marking time
2. **Live profile fallback**: Current `imageUrl` from `users` table (for my-history)

### Institute Logos

Institute logos (`instituteLogoUrl`) are fetched from the `institutes` table `logo_url` column and converted to full URLs via `CloudStorageService`.

---

## Error Responses

All endpoints return standard error format:

```json
{
  "statusCode": 400,
  "message": "Validation error message",
  "error": "Bad Request"
}
```

Common HTTP status codes:

| Code | Description |
|------|-------------|
| 400 | Bad Request — validation error, date range too large |
| 401 | Unauthorized — missing or invalid JWT token |
| 403 | Forbidden — insufficient role/permissions |
| 404 | Not Found — student, card, or record not found |
| 429 | Too Many Requests — rate limit exceeded |
| 500 | Internal Server Error |
