# Attendance Marking — Complete API Guide

> **Base URL:** `https://<host>`  
> **Auth:** All endpoints require `Authorization: Bearer <JWT>` header.  
> **Content-Type:** `application/json`

---

## Table of Contents

1. [Prerequisite APIs (Get IDs First)](#1-prerequisite-apis-get-ids-first)
   - 1.1 [Get Today's Calendar Day + Default Event ID](#11-get-todays-calendar-day--default-event-id)
   - 1.2 [Get Today's Calendar Day for a Class](#12-get-todays-calendar-day-for-a-class)
   - 1.3 [List Calendar Events (Get Event IDs)](#13-list-calendar-events-get-event-ids)
   - 1.4 [Get Events for a Specific Calendar Day](#14-get-events-for-a-specific-calendar-day)
   - 1.5 [Get Default Event for a Calendar Day](#15-get-default-event-for-a-calendar-day)
   - 1.6 [List Calendar Days](#16-list-calendar-days)
   - 1.7 [Get Class-Scoped Calendar Events](#17-get-class-scoped-calendar-events)
2. [Mark Attendance APIs](#2-mark-attendance-apis)
   - 2.1 [Mark Single Student Attendance](#21-mark-single-student-attendance)
   - 2.2 [Mark Bulk Student Attendance](#22-mark-bulk-student-attendance)
   - 2.3 [Mark Attendance by Student Card (RFID)](#23-mark-attendance-by-student-card-rfid)
   - 2.4 [Mark Bulk Attendance by Student Cards](#24-mark-bulk-attendance-by-student-cards)
   - 2.5 [Mark Attendance by Institute Card](#25-mark-attendance-by-institute-card)
3. [Query Attendance APIs](#3-query-attendance-apis)
   - 3.1 [Get Student Attendance Records](#31-get-student-attendance-records)
   - 3.2 [Get Student Attendance by Card ID](#32-get-student-attendance-by-card-id)
   - 3.3 [Get Institute Attendance](#33-get-institute-attendance)
   - 3.4 [Get Class Attendance](#34-get-class-attendance)
   - 3.5 [Get Subject Attendance](#35-get-subject-attendance)
   - 3.6 [Get Class-Scoped Student Attendance](#36-get-class-scoped-student-attendance)
   - 3.7 [Get Subject-Scoped Student Attendance](#37-get-subject-scoped-student-attendance)
4. [Calendar-Linked Attendance Queries](#4-calendar-linked-attendance-queries)
   - 4.1 [Get Attendance by Event](#41-get-attendance-by-event)
   - 4.2 [Get Attendance by Calendar Day](#42-get-attendance-by-calendar-day)
   - 4.3 [Get Attendance by User Type (Institute-Wide)](#43-get-attendance-by-user-type-institute-wide)
   - 4.4 [Get Attendance by User Type (Class-Scoped)](#44-get-attendance-by-user-type-class-scoped)
   - 4.5 [Get Attendance by User Type (Subject-Scoped)](#45-get-attendance-by-user-type-subject-scoped)
   - 4.6 [Get Student Attendance at Specific Event](#46-get-student-attendance-at-specific-event)
5. [Card User Lookup APIs](#5-card-user-lookup-apis)
   - 5.1 [Get Institute User by Card ID](#51-get-institute-user-by-card-id)
   - 5.2 [Get Card User (Class Context)](#52-get-card-user-class-context)
   - 5.3 [Get Card User (Subject Context)](#53-get-card-user-subject-context)
6. [Enums & Constants](#6-enums--constants)
7. [Complete Flow Examples](#7-complete-flow-examples)

---

## 1. Prerequisite APIs (Get IDs First)

Before marking attendance, the frontend needs to obtain **eventId** and **calendarDayId** values. These come from the institute calendar system.

### 1.1 Get Today's Calendar Day + Default Event ID

Returns today's calendar day info including the **`defaultEventId`** (the auto-created `REGULAR_CLASS` event). This is the most important prerequisite call — if you don't send `eventId` when marking attendance, the backend auto-links to this default event.

```
GET /institutes/:instituteId/calendar/today
```

**Access:** Any authenticated user with institute access

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "42",
    "instituteId": "1",
    "date": "2026-03-03",
    "dayOfWeek": 2,
    "dayType": "REGULAR",
    "title": "Tuesday",
    "isAttendanceExpected": true,
    "academicYear": "2026",
    "startTime": "08:00",
    "endTime": "15:00",
    "source": "AUTO_GENERATED",
    "createdAt": "2026-01-01T00:00:00.000Z",
    "updatedAt": "2026-01-01T00:00:00.000Z",
    "events": [
      {
        "id": "101",
        "eventType": "REGULAR_CLASS",
        "title": "Regular Classes",
        "eventDate": "2026-03-03",
        "isDefault": true,
        "isAttendanceTracked": true,
        "status": "SCHEDULED"
      },
      {
        "id": "205",
        "eventType": "PARENTS_MEETING",
        "title": "Grade 10 Parents Meeting",
        "eventDate": "2026-03-03",
        "startTime": "14:00",
        "endTime": "16:00",
        "isDefault": false,
        "isAttendanceTracked": true,
        "status": "SCHEDULED"
      }
    ],
    "defaultEventId": "101"
  }
}
```

**Key fields to extract:**
| Field | Use |
|---|---|
| `data.id` | This is the `calendarDayId` |
| `data.defaultEventId` | The default `REGULAR_CLASS` event ID — use this for normal daily attendance |
| `data.events[].id` | Event IDs for special events (exams, meetings, etc.) |
| `data.isAttendanceExpected` | Whether attendance should be taken today |

---

### 1.2 Get Today's Calendar Day for a Class

Same as above but scoped to a specific class (merges class-level overrides).

```
GET /institutes/:instituteId/class/:classId/calendar/today
```

**Access:** Any authenticated user with institute access

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "42",
    "instituteId": "1",
    "date": "2026-03-03",
    "dayOfWeek": 2,
    "dayType": "REGULAR",
    "isAttendanceExpected": true,
    "events": [ ... ],
    "classOverride": {
      "classDayType": "REGULAR",
      "isAttendanceExpected": true
    },
    "effectiveDayType": "REGULAR",
    "effectiveIsAttendanceExpected": true,
    "defaultEventId": "101"
  }
}
```

> Use `effectiveIsAttendanceExpected` to decide whether to show the "Mark Attendance" button for a class.

---

### 1.3 List Calendar Events (Get Event IDs)

Get all events for the institute within a date range. Use this to populate a dropdown when marking attendance for special events.

```
GET /institutes/:instituteId/calendar/events
```

**Query Parameters:**
| Param | Type | Required | Description |
|---|---|---|---|
| `startDate` | `string` | No | Start date `YYYY-MM-DD` |
| `endDate` | `string` | No | End date `YYYY-MM-DD` |
| `eventType` | `string` | No | Filter by event type (see [Enums](#6-enums--constants)) |
| `page` | `number` | No | Page number (default: 1) |
| `limit` | `number` | No | Results per page (default: 100) |

**Example:**
```
GET /institutes/1/calendar/events?startDate=2026-03-01&endDate=2026-03-31&eventType=EXAM
```

**Response:**
```json
{
  "success": true,
  "count": 2,
  "total": 2,
  "data": [
    {
      "id": "301",
      "calendarDayId": "45",
      "eventType": "EXAM",
      "title": "Mid-Term Mathematics Exam",
      "description": "Grade 10 mid-term exam",
      "eventDate": "2026-03-10",
      "startTime": "09:00",
      "endTime": "11:00",
      "isAllDay": false,
      "isAttendanceTracked": true,
      "isDefault": false,
      "targetUserTypes": ["STUDENT"],
      "targetScope": "CLASS",
      "targetClassIds": ["5"],
      "status": "SCHEDULED",
      "venue": "Exam Hall A",
      "isMandatory": true
    },
    {
      "id": "302",
      "calendarDayId": "50",
      "eventType": "EXAM",
      "title": "Mid-Term Science Exam",
      "eventDate": "2026-03-15",
      "startTime": "09:00",
      "endTime": "11:00",
      "isAttendanceTracked": true,
      "isDefault": false,
      "status": "SCHEDULED"
    }
  ]
}
```

---

### 1.4 Get Events for a Specific Calendar Day

```
GET /institutes/:instituteId/calendar/days/:calendarDayId/events
```

**Response:**
```json
{
  "success": true,
  "count": 2,
  "data": [
    {
      "id": "101",
      "eventType": "REGULAR_CLASS",
      "title": "Regular Classes",
      "isDefault": true,
      "isAttendanceTracked": true,
      "status": "SCHEDULED"
    },
    {
      "id": "205",
      "eventType": "PARENTS_MEETING",
      "title": "Parent-Teacher Conference",
      "startTime": "14:00",
      "endTime": "16:00",
      "isDefault": false,
      "isAttendanceTracked": true,
      "status": "SCHEDULED"
    }
  ]
}
```

---

### 1.5 Get Default Event for a Calendar Day

Returns the single default event (where `isDefault = true`). This is the event that the backend auto-links to when you mark attendance without an explicit `eventId`.

```
GET /institutes/:instituteId/calendar/days/:calendarDayId/default-event
```

**Response (found):**
```json
{
  "success": true,
  "data": {
    "id": "101",
    "eventType": "REGULAR_CLASS",
    "title": "Regular Classes",
    "eventDate": "2026-03-03",
    "isDefault": true,
    "isAttendanceTracked": true,
    "status": "SCHEDULED"
  }
}
```

**Response (not found):**
```json
{
  "success": false,
  "message": "No default event found for this calendar day",
  "data": null
}
```

---

### 1.6 List Calendar Days

Get calendar days with extensive filters. Useful for building a calendar view.

```
GET /institutes/:instituteId/calendar/days
```

**Query Parameters:**
| Param | Type | Required | Description |
|---|---|---|---|
| `startDate` | `string` | No | Start date `YYYY-MM-DD` |
| `endDate` | `string` | No | End date `YYYY-MM-DD` |
| `academicYear` | `string` | No | e.g. `"2026"` |
| `dayType` | `string` | No | `REGULAR`, `WEEKEND`, `PUBLIC_HOLIDAY`, etc. |
| `isAttendanceExpected` | `string` | No | `"true"` or `"false"` |
| `page` | `number` | No | Page number (default: 1) |
| `limit` | `number` | No | Results per page (default: 400) |

**Example:**
```
GET /institutes/1/calendar/days?startDate=2026-03-01&endDate=2026-03-07&dayType=REGULAR
```

**Response:**
```json
{
  "success": true,
  "count": 5,
  "total": 5,
  "data": [
    {
      "id": "40",
      "date": "2026-03-02",
      "dayOfWeek": 1,
      "dayType": "REGULAR",
      "title": "Monday",
      "isAttendanceExpected": true,
      "academicYear": "2026",
      "startTime": "08:00",
      "endTime": "15:00",
      "events": [
        { "id": "100", "eventType": "REGULAR_CLASS", "title": "Regular Classes", "isDefault": true }
      ]
    }
  ]
}
```

---

### 1.7 Get Class-Scoped Calendar Events

Events targeting the entire institute OR specifically this class.

```
GET /institutes/:instituteId/class/:classId/calendar/events
```

Same query params and response shape as [1.3](#13-list-calendar-events-get-event-ids).

---

## 2. Mark Attendance APIs

### 2.1 Mark Single Student Attendance

```
POST /api/attendance/mark
```

**Access:** `SUPERADMIN`, `INSTITUTE_ADMIN`, `TEACHER`, `ATTENDANCE_MARKER`  
**Rate Limit:** 30 requests/minute

**Request Body:**
```json
{
  "studentId": "123",
  "studentName": "Kasun Perera",
  "instituteId": "1",
  "instituteName": "Suraksha Learning Academy",
  "classId": "5",
  "className": "Grade 10A",
  "subjectId": "12",
  "subjectName": "Mathematics",
  "date": "2026-03-03",
  "status": "present",
  "location": "Main Hall",
  "remarks": "On time",
  "markingMethod": "manual",
  "eventId": "101",
  "deviceUid": "DEV-001"
}
```

**Field Reference:**
| Field | Type | Required | Description |
|---|---|---|---|
| `studentId` | `string` | **Yes** | User ID of the student |
| `studentName` | `string` | No | Auto-fetched from DB if not provided |
| `instituteId` | `string` | **Yes** | Institute ID |
| `instituteName` | `string` | **Yes** | Institute name |
| `classId` | `string` | No | Class ID (for class-specific attendance) |
| `className` | `string` | No | Class name |
| `subjectId` | `string` | No | Subject ID (for subject-specific attendance) |
| `subjectName` | `string` | No | Subject name |
| `date` | `string` | **Yes** | Date in `YYYY-MM-DD` format |
| `status` | `enum` | **Yes** | `present` \| `absent` \| `late` \| `left` \| `left_early` \| `left_lately` |
| `location` | `string` | No | Location/address |
| `remarks` | `string` | No | Any notes |
| `address` | `string` | No | Legacy location field |
| `markingMethod` | `enum` | No | `qr` \| `barcode` \| `rfid/nfc` \| `manual` \| `system` |
| `eventId` | `string` | No | Calendar event ID. **If omitted**, backend auto-links to today's default `REGULAR_CLASS` event. **Send only for special events** (exam, parents meeting, etc.) |
| `deviceUid` | `string` | No | If marking from registered device, triggers device validation |
| `userType` | `enum` | No | **Do NOT send** — backend auto-detects from `institute_user` table (`STUDENT`, `TEACHER`, `INSTITUTE_ADMIN`, `ATTENDANCE_MARKER`, `PARENT`, `NOT_ENROLLED`) |

**Success Response (`201`):**
```json
{
  "success": true,
  "message": "Attendance marked successfully",
  "attendanceId": "att_abc123def456"
}
```

**Error Responses:**
| Status | Description |
|---|---|
| `400` | Validation error (missing required fields, invalid enum value) |
| `401` | Invalid/expired JWT |
| `403` | Insufficient permissions |
| `404` | Student not found |
| `500` | Internal server error |

---

### 2.2 Mark Bulk Student Attendance

Mark attendance for multiple students in one request.

```
POST /api/attendance/mark-bulk
```

**Access:** `SUPERADMIN`, `INSTITUTE_ADMIN`, `TEACHER`, `ATTENDANCE_MARKER`  
**Max bulk size:** 100 students (configurable via `MAX_BULK_ATTENDANCE_SIZE` env var)

**Request Body:**
```json
{
  "instituteId": "1",
  "instituteName": "Suraksha Learning Academy",
  "classId": "5",
  "className": "Grade 10A",
  "subjectId": "12",
  "subjectName": "Mathematics",
  "location": "Classroom 10A",
  "markingMethod": "manual",
  "students": [
    {
      "studentId": "123",
      "studentName": "Kasun Perera",
      "status": "present",
      "remarks": "On time"
    },
    {
      "studentId": "124",
      "studentName": "Nimali Silva",
      "status": "absent",
      "remarks": "Sick leave"
    },
    {
      "studentId": "125",
      "status": "late",
      "remarks": "Arrived at 8:15"
    }
  ]
}
```

**Field Reference (wrapper):**
| Field | Type | Required | Description |
|---|---|---|---|
| `instituteId` | `string` | **Yes** | Institute ID |
| `instituteName` | `string` | **Yes** | Institute name |
| `classId` | `string` | No | Class ID |
| `className` | `string` | No | Class name |
| `subjectId` | `string` | No | Subject ID |
| `subjectName` | `string` | No | Subject name |
| `location` | `string` | No | Location |
| `markingMethod` | `enum` | No | `qr` \| `barcode` \| `rfid/nfc` \| `manual` \| `system` |
| `students` | `array` | **Yes** | Array of student records (see below) |

**Field Reference (each student):**
| Field | Type | Required | Description |
|---|---|---|---|
| `studentId` | `string` | **Yes** | User ID |
| `studentName` | `string` | No | Auto-fetched if not provided |
| `status` | `enum` | **Yes** | `present` \| `absent` \| `late` \| `left` \| `left_early` \| `left_lately` |
| `remarks` | `string` | No | Notes |

**Success Response (`201`):**
```json
{
  "success": true,
  "message": "Bulk attendance processed",
  "summary": {
    "successful": 2,
    "failed": 1,
    "total": 3
  },
  "results": [
    {
      "studentId": "123",
      "success": true,
      "attendanceId": "att_abc123"
    },
    {
      "studentId": "124",
      "success": true,
      "attendanceId": "att_abc124"
    },
    {
      "studentId": "125",
      "success": false,
      "error": "Student not found"
    }
  ]
}
```

---

### 2.3 Mark Attendance by Student Card (RFID)

Mark attendance using the student's personal RFID card from the `users.studentCardId` field.

```
POST /api/attendance/mark-by-card
```

**Access:** `SUPERADMIN`, `INSTITUTE_ADMIN`, `TEACHER`, `ATTENDANCE_MARKER`

**Request Body:**
```json
{
  "studentCardId": "CARD001",
  "instituteId": "1",
  "instituteName": "Suraksha Learning Academy",
  "classId": "5",
  "className": "Grade 10A",
  "subjectId": "12",
  "subjectName": "Mathematics",
  "address": "Suraksha Learning Academy - Grade 10A - Mathematics",
  "markingMethod": "rfid/nfc",
  "status": "present"
}
```

**Field Reference:**
| Field | Type | Required | Description |
|---|---|---|---|
| `studentCardId` | `string` | **Yes** | Student's RFID card ID (from `users.studentCardId`) |
| `instituteId` | `string` | **Yes** | Institute ID |
| `instituteName` | `string` | **Yes** | Institute name |
| `classId` | `string` | No | Class ID |
| `className` | `string` | No | Class name |
| `subjectId` | `string` | No | Subject ID |
| `subjectName` | `string` | No | Subject name |
| `address` | `string` | **Yes** | Location string |
| `markingMethod` | `enum` | **Yes** | Typically `rfid/nfc` |
| `status` | `enum` | **Yes** | `present` \| `absent` \| `late` \| `left` \| `left_early` \| `left_lately` |

**Success Response (`201`):**
```json
{
  "success": true,
  "message": "Attendance marked successfully using card",
  "attendanceId": "att_abc123",
  "studentId": "123",
  "studentCardId": "CARD001",
  "studentName": "Kasun Perera"
}
```

---

### 2.4 Mark Bulk Attendance by Student Cards

```
POST /api/attendance/mark-bulk-by-card
```

**Access:** `SUPERADMIN`, `INSTITUTE_ADMIN`, `TEACHER`, `ATTENDANCE_MARKER`  
**Max bulk size:** 100

**Request Body:**
```json
{
  "instituteId": "1",
  "instituteName": "Suraksha Learning Academy",
  "classId": "5",
  "className": "Grade 10A",
  "subjectId": "12",
  "subjectName": "Mathematics",
  "address": "Suraksha Learning Academy - Grade 10A - Mathematics",
  "markingMethod": "rfid/nfc",
  "students": [
    { "studentCardId": "CARD001", "status": "present" },
    { "studentCardId": "CARD002", "status": "absent" },
    { "studentCardId": "CARD003", "status": "late" }
  ]
}
```

**Field Reference (each student):**
| Field | Type | Required | Description |
|---|---|---|---|
| `studentCardId` | `string` | **Yes** | RFID card ID |
| `status` | `enum` | **Yes** | Attendance status |

**Success Response (`201`):**
```json
{
  "success": true,
  "message": "Bulk card attendance processed",
  "summary": {
    "successful": 2,
    "failed": 1,
    "total": 3
  },
  "results": [
    {
      "studentCardId": "CARD001",
      "studentId": "123",
      "studentName": "Kasun Perera",
      "success": true,
      "attendanceId": "att_abc123"
    },
    {
      "studentCardId": "CARD002",
      "studentId": "124",
      "studentName": "Nimali Silva",
      "success": true,
      "attendanceId": "att_abc124"
    },
    {
      "studentCardId": "CARD003",
      "success": false,
      "error": "Student with card ID not found"
    }
  ]
}
```

---

### 2.5 Mark Attendance by Institute Card

Mark attendance using institute-specific card ID (from `institute_user.instituteCardId`). This is separate from the global student card — it's the card assigned by the institute.

```
POST /api/attendance/mark-by-institute-card
```

**Access:** `SUPERADMIN`, `INSTITUTE_ADMIN`, `TEACHER`, `ATTENDANCE_MARKER`

**Request Body:**
```json
{
  "instituteCardId": "INST-CARD-001",
  "instituteId": "1",
  "instituteName": "Suraksha Learning Academy",
  "classId": "5",
  "className": "Grade 10A",
  "subjectId": "12",
  "subjectName": "Mathematics",
  "address": "Suraksha Learning Academy - Grade 10A",
  "markingMethod": "rfid/nfc",
  "status": "present",
  "date": "2026-03-03",
  "location": "Main Gate"
}
```

**Field Reference:**
| Field | Type | Required | Description |
|---|---|---|---|
| `instituteCardId` | `string` | **Yes** | Institute-assigned card ID |
| `instituteId` | `string` | **Yes** | Institute ID |
| `instituteName` | `string` | **Yes** | Institute name |
| `classId` | `string` | No | Class ID |
| `className` | `string` | No | Class name |
| `subjectId` | `string` | No | Subject ID |
| `subjectName` | `string` | No | Subject name |
| `address` | `string` | **Yes** | Location string |
| `markingMethod` | `enum` | **Yes** | Marking method |
| `status` | `enum` | **Yes** | Attendance status |
| `date` | `string` | No | `YYYY-MM-DD` (defaults to today) |
| `location` | `string` | No | Auto-generated if not provided |

**Success Response (`201`):**
```json
{
  "success": true,
  "message": "Attendance marked successfully using institute card",
  "data": {
    "studentId": "123",
    "studentName": "Kasun Perera",
    "instituteCardId": "INST-CARD-001",
    "userIdByInstitute": "STU2024001",
    "imageUrl": "https://storage.googleapis.com/image.jpg",
    "isInstituteImage": true,
    "imageVerificationStatus": "VERIFIED",
    "status": "PRESENT",
    "markedAt": "2026-03-03T10:30:00.000Z",
    "location": "Main Gate"
  }
}
```

---

## 3. Query Attendance APIs

### 3.1 Get Student Attendance Records

```
GET /api/attendance/student/:studentId
```

**Access:** `SUPERADMIN`, `INSTITUTE_ADMIN`, `TEACHER`, `STUDENT` (own data), `PARENT` (child data), `ATTENDANCE_MARKER`

**Query Parameters:**
| Param | Type | Required | Description |
|---|---|---|---|
| `instituteId` | `string` | **Yes** | Institute ID |
| `startDate` | `string` | **Yes** | `YYYY-MM-DD` |
| `endDate` | `string` | **Yes** | `YYYY-MM-DD` (max 365 days range) |
| `page` | `number` | No | Default: 1 |
| `limit` | `number` | No | Default: 20, max: 100 |
| `status` | `enum` | No | Filter by status |

**Example:**
```
GET /api/attendance/student/123?instituteId=1&startDate=2026-03-01&endDate=2026-03-31&page=1&limit=20
```

**Response:**
```json
{
  "success": true,
  "message": "Attendance records retrieved successfully",
  "pagination": {
    "currentPage": 1,
    "totalPages": 2,
    "totalRecords": 22,
    "recordsPerPage": 20,
    "hasNextPage": true,
    "hasPrevPage": false
  },
  "data": [
    {
      "attendanceId": "att_abc123",
      "studentId": "123",
      "studentName": "Kasun Perera",
      "instituteName": "Suraksha Learning Academy",
      "className": "Grade 10A",
      "subjectName": "Mathematics",
      "address": "Classroom 10A",
      "markedBy": "456",
      "markedAt": "2026-03-03T08:05:00.000Z",
      "markingMethod": "manual",
      "status": "present",
      "userType": "STUDENT"
    }
  ],
  "summary": {
    "totalPresent": 18,
    "totalAbsent": 2,
    "totalLate": 2,
    "totalLeft": 0,
    "totalLeftEarly": 0,
    "totalLeftLately": 0,
    "attendanceRate": 81.82
  }
}
```

---

### 3.2 Get Student Attendance by Card ID

```
GET /api/attendance/by-cardId/:cardId
```

**Access:** `SUPERADMIN`, `INSTITUTE_ADMIN`, `TEACHER`, `STUDENT`, `PARENT`, `ATTENDANCE_MARKER`

**Query Parameters:**
| Param | Type | Required | Description |
|---|---|---|---|
| `startDate` | `string` | No | `YYYY-MM-DD` |
| `endDate` | `string` | No | `YYYY-MM-DD` (max 365 days range) |
| `page` | `number` | No | Default: 1 |
| `limit` | `number` | No | Default: 10 |

**Response:**
```json
{
  "success": true,
  "message": "Attendance records retrieved by card",
  "studentInfo": {
    "studentId": "123",
    "studentCardId": "CARD001",
    "studentName": "Kasun Perera",
    "instituteName": "Suraksha Learning Academy",
    "className": "Grade 10A"
  },
  "pagination": {
    "currentPage": 1,
    "totalPages": 1,
    "totalRecords": 5,
    "recordsPerPage": 10,
    "hasNextPage": false,
    "hasPrevPage": false
  },
  "data": [
    {
      "attendanceId": "att_abc123",
      "studentId": "123",
      "studentCardId": "CARD001",
      "studentName": "Kasun Perera",
      "instituteId": "1",
      "instituteName": "Suraksha Learning Academy",
      "classId": "5",
      "className": "Grade 10A",
      "subjectId": "12",
      "subjectName": "Mathematics",
      "address": "Classroom 10A",
      "markedBy": "456",
      "markedAt": "2026-03-03T08:05:00.000Z",
      "markingMethod": "rfid/nfc",
      "status": "present",
      "createdAt": "2026-03-03T08:05:00.000Z",
      "updatedAt": "2026-03-03T08:05:00.000Z"
    }
  ],
  "summary": {
    "totalPresent": 4,
    "totalAbsent": 1,
    "totalLate": 0,
    "totalLeft": 0,
    "totalLeftEarly": 0,
    "totalLeftLately": 0,
    "attendanceRate": 80.0
  }
}
```

---

### 3.3 Get Institute Attendance

```
GET /api/attendance/institute/:instituteId
```

**Access:** `SUPERADMIN`, `INSTITUTE_ADMIN`, `TEACHER`, `ATTENDANCE_MARKER`, `STUDENT` (own data with studentId filter), `PARENT` (child data with studentId filter)

**Query Parameters:**
| Param | Type | Required | Description |
|---|---|---|---|
| `startDate` | `string` | **Yes** | `YYYY-MM-DD` |
| `endDate` | `string` | **Yes** | `YYYY-MM-DD` |
| `page` | `number` | No | Default: 1 |
| `limit` | `number` | No | Default: 50 |
| `status` | `string` | No | Filter by attendance status |
| `studentId` | `string` | No | Filter by student ID |

> **Date range limits:** 5 days max for all students, 30 days max when filtering by `studentId`.

**Alias Route (same behavior):**
```
GET /institute/:instituteId?startDate=...&endDate=...
```

**Response:**
```json
{
  "success": true,
  "message": "Institute attendance records retrieved",
  "instituteInfo": {
    "instituteId": "1",
    "instituteName": "Suraksha Learning Academy"
  },
  "pagination": {
    "currentPage": 1,
    "totalPages": 3,
    "totalRecords": 125,
    "recordsPerPage": 50,
    "hasNextPage": true,
    "hasPrevPage": false
  },
  "dateRange": {
    "startDate": "2026-03-01",
    "endDate": "2026-03-03",
    "totalDays": 3
  },
  "data": [
    {
      "attendanceId": "att_abc123",
      "studentId": "123",
      "studentName": "Kasun Perera",
      "classId": "5",
      "className": "Grade 10A",
      "subjectId": "12",
      "subjectName": "Mathematics",
      "markedAt": "2026-03-03T08:05:00.000Z",
      "status": "present",
      "markingMethod": "manual",
      "markedBy": "456"
    }
  ],
  "summary": {
    "totalPresent": 100,
    "totalAbsent": 15,
    "totalLate": 10,
    "totalLeft": 0,
    "totalLeftEarly": 0,
    "totalLeftLately": 0,
    "uniqueStudents": 45,
    "totalClasses": 5,
    "totalSubjects": 12
  }
}
```

---

### 3.4 Get Class Attendance

```
GET /api/attendance/institute/:instituteId/class/:classId
```

Same query params and response structure as institute attendance. Filtered to a specific class.

> **Date range limits:** 5 days (all students), 30 days (with studentId filter).

**Response includes:**
```json
{
  "classInfo": {
    "instituteId": "1",
    "instituteName": "Suraksha Learning Academy",
    "classId": "5",
    "className": "Grade 10A"
  }
}
```

---

### 3.5 Get Subject Attendance

```
GET /api/attendance/institute/:instituteId/class/:classId/subject/:subjectId
```

Same query params and response structure. Filtered to class + subject.

**Response includes:**
```json
{
  "subjectInfo": {
    "instituteId": "1",
    "instituteName": "Suraksha Learning Academy",
    "classId": "5",
    "className": "Grade 10A",
    "subjectId": "12",
    "subjectName": "Mathematics"
  }
}
```

---

### 3.6 Get Class-Scoped Student Attendance

```
GET /api/attendance/institute/:instituteId/class/:classId/student/:studentId
```

**Query Parameters:**
| Param | Type | Required | Description |
|---|---|---|---|
| `startDate` | `string` | **Yes** | `YYYY-MM-DD` |
| `endDate` | `string` | **Yes** | `YYYY-MM-DD` (max 365 days) |
| `page` | `number` | No | Default: 1 |
| `limit` | `number` | No | Default: 50 |
| `status` | `string` | No | Filter by status |

**Access:** `SUPERADMIN`, `INSTITUTE_ADMIN`, `TEACHER`, `ATTENDANCE_MARKER`, `STUDENT` (own data), `PARENT` (child data)

---

### 3.7 Get Subject-Scoped Student Attendance

```
GET /api/attendance/institute/:instituteId/class/:classId/subject/:subjectId/student/:studentId
```

Same parameters as class-scoped. Narrowed to a specific subject.

---

## 4. Calendar-Linked Attendance Queries

These endpoints query attendance linked to specific calendar events, calendar days, and user types.

### 4.1 Get Attendance by Event

Who attended a specific calendar event (exam, parents meeting, sports day, etc.)?

```
GET /api/attendance/calendar/institute/:instituteId/event/:eventId
```

**Access:** `SUPERADMIN`, `INSTITUTE_ADMIN`, `TEACHER`, `ATTENDANCE_MARKER`

**Query Parameters:**
| Param | Type | Required | Description |
|---|---|---|---|
| `date` | `string` | No | Filter to specific date `YYYY-MM-DD` |
| `classId` | `string` | No | For JWT guard class-level auth |
| `subjectId` | `string` | No | For JWT guard subject-level auth |

**Example:**
```
GET /api/attendance/calendar/institute/1/event/301?date=2026-03-10
```

---

### 4.2 Get Attendance by Calendar Day

All attendance records for a given calendar day (all user types combined or filtered).

```
GET /api/attendance/calendar/institute/:instituteId/calendar-day/:calendarDayId
```

**Query Parameters:**
| Param | Type | Required | Description |
|---|---|---|---|
| `userType` | `string` | No | `STUDENT` \| `TEACHER` \| `PARENT` \| `INSTITUTE_ADMIN` \| `ATTENDANCE_MARKER` |
| `classId` | `string` | No | JWT guard class-level auth |
| `subjectId` | `string` | No | JWT guard subject-level auth |

---

### 4.3 Get Attendance by User Type (Institute-Wide)

```
GET /api/attendance/calendar/institute/:instituteId/user-type/:userType
```

**URL Parameters:**
| Param | Description |
|---|---|
| `instituteId` | Institute ID |
| `userType` | `STUDENT` \| `TEACHER` \| `PARENT` \| `INSTITUTE_ADMIN` \| `ATTENDANCE_MARKER` |

**Query Parameters:**
| Param | Type | Required | Description |
|---|---|---|---|
| `date` | `string` | No | `YYYY-MM-DD` |
| `eventId` | `string` | No | Filter to specific event |
| `classId` | `string` | No | JWT guard |
| `subjectId` | `string` | No | JWT guard |

---

### 4.4 Get Attendance by User Type (Class-Scoped)

```
GET /api/attendance/calendar/institute/:instituteId/class/:classId/user-type/:userType
```

Same query params as institute-wide, but scoped to a class.

---

### 4.5 Get Attendance by User Type (Subject-Scoped)

```
GET /api/attendance/calendar/institute/:instituteId/class/:classId/subject/:subjectId/user-type/:userType
```

Same query params, scoped to class + subject.

---

### 4.6 Get Student Attendance at Specific Event

Did this student attend the exam? Did they attend the field trip?

```
GET /api/attendance/calendar/institute/:instituteId/student/:studentId/event/:eventId
```

**Access:** `SUPERADMIN`, `INSTITUTE_ADMIN`, `TEACHER`, `ATTENDANCE_MARKER`, `STUDENT` (own data only), `PARENT` (child data only)

**Query Parameters:**
| Param | Type | Required | Description |
|---|---|---|---|
| `startDate` | `string` | No | Date range start `YYYY-MM-DD` |
| `endDate` | `string` | No | Date range end `YYYY-MM-DD` |
| `classId` | `string` | No | JWT guard |
| `subjectId` | `string` | No | JWT guard |

---

## 5. Card User Lookup APIs

Look up user information by card ID before marking attendance.

### 5.1 Get Institute User by Card ID

```
GET /api/attendance/institute-card-user?instituteCardId=INST-CARD-001&instituteId=1
```

**Access:** `SUPERADMIN`, `INSTITUTE_ADMIN`, `TEACHER`, `ATTENDANCE_MARKER`

**Query Parameters:**
| Param | Type | Required | Description |
|---|---|---|---|
| `instituteCardId` | `string` | **Yes** | Institute-assigned card ID |
| `instituteId` | `string` | **Yes** | Institute ID |

**Response:**
```json
{
  "success": true,
  "message": "Institute user retrieved successfully",
  "data": {
    "userId": "123",
    "userName": "Kasun Perera",
    "userIdByInstitute": "STU2024001",
    "instituteCardId": "INST-CARD-001",
    "imageUrl": "https://storage.googleapis.com/image.jpg",
    "imageVerificationStatus": "VERIFIED",
    "isInstituteImage": true,
    "userType": "STUDENT",
    "status": "ACTIVE"
  }
}
```

---

### 5.2 Get Card User (Class Context)

```
GET /api/attendance/institute/:instituteId/class/:classId/card-user?instituteCardId=INST-CARD-001
```

Same response, with `classId` added for context.

---

### 5.3 Get Card User (Subject Context)

```
GET /api/attendance/institute/:instituteId/class/:classId/subject/:subjectId/card-user?instituteCardId=INST-CARD-001
```

Same response, with `classId` and `subjectId` added for context.

---

## 6. Enums & Constants

### AttendanceStatus
| Value | Description |
|---|---|
| `present` | Student is present |
| `absent` | Student is absent |
| `late` | Student arrived late |
| `left` | Student left |
| `left_early` | Student left early |
| `left_lately` | Student left lately |

### MarkingMethod
| Value | Description |
|---|---|
| `qr` | QR code scan |
| `barcode` | Barcode scan |
| `rfid/nfc` | RFID/NFC card tap |
| `manual` | Manual marking by teacher/admin |
| `system` | System-generated (auto-mark) |

### AttendanceUserType (auto-detected by backend)
| Value | Description |
|---|---|
| `STUDENT` | Student |
| `TEACHER` | Teacher |
| `INSTITUTE_ADMIN` | Institute administrator |
| `ATTENDANCE_MARKER` | Dedicated attendance marker |
| `PARENT` | Parent |
| `NOT_ENROLLED` | User exists but not enrolled in institute |

### CalendarEventType
| Value | Description |
|---|---|
| `REGULAR_CLASS` | Normal daily classes (auto-created) |
| `EXAM` | Examination |
| `PARENTS_MEETING` | Parent-teacher meeting |
| `PRIZE_GIVING` | Prize-giving ceremony |
| `SPORTS_DAY` | Sports day |
| `CULTURAL_EVENT` | Cultural event |
| `FIELD_TRIP` | Field trip |
| `WORKSHOP` | Workshop |
| `ORIENTATION` | Orientation |
| `OPEN_DAY` | Open day |
| `RELIGIOUS_EVENT` | Religious event |
| `EXTRACURRICULAR` | Extracurricular activity |
| `STAFF_MEETING` | Staff meeting |
| `TRAINING` | Training session |
| `GRADUATION` | Graduation ceremony |
| `ADMISSION` | Admission event |
| `MAINTENANCE` | Maintenance day |
| `CUSTOM` | Custom event |

### CalendarDayType
| Value | Description |
|---|---|
| `REGULAR` | Normal working day |
| `WEEKEND` | Weekend |
| `PUBLIC_HOLIDAY` | Public holiday |
| `INSTITUTE_HOLIDAY` | Institute-specific holiday |
| `HALF_DAY` | Half day |
| `EXAM_DAY` | Examination day |
| `STAFF_ONLY` | Staff-only day |
| `SPECIAL_EVENT` | Special event day |
| `CANCELLED` | Cancelled day |

### CalendarEventStatus
| Value | Description |
|---|---|
| `SCHEDULED` | Event is scheduled |
| `ONGOING` | Event is currently happening |
| `COMPLETED` | Event has finished |
| `CANCELLED` | Event was cancelled |
| `POSTPONED` | Event was postponed |

### CalendarEventScope
| Value | Description |
|---|---|
| `INSTITUTE` | Institute-wide event |
| `CLASS` | Class-specific event |
| `SUBJECT` | Subject-specific event |

### AttendanceOpenTo
| Value | Description |
|---|---|
| `TARGET_ONLY` | Only target users can be marked |
| `ALL_ENROLLED` | All enrolled users can be marked |
| `ANYONE` | Anyone can be marked |

---

## 7. Complete Flow Examples

### Flow 1: Daily Classroom Attendance (Manual)

```
Step 1 → GET today's calendar + default event ID
         GET /institutes/1/class/5/calendar/today
         Extract: defaultEventId = "101", isAttendanceExpected = true

Step 2 → Mark bulk attendance for the class
         POST /api/attendance/mark-bulk
         {
           "instituteId": "1",
           "instituteName": "Suraksha Learning Academy",
           "classId": "5",
           "className": "Grade 10A",
           "markingMethod": "manual",
           "students": [
             { "studentId": "123", "status": "present" },
             { "studentId": "124", "status": "present" },
             { "studentId": "125", "status": "absent", "remarks": "Sick leave" },
             { "studentId": "126", "status": "late", "remarks": "Arrived 8:15" }
           ]
         }
```

> **Note:** `eventId` is NOT sent — backend automatically links to the default `REGULAR_CLASS` event for today.

---

### Flow 2: Special Event Attendance (Exam)

```
Step 1 → Get events for today to find exam event ID
         GET /institutes/1/calendar/events?startDate=2026-03-10&endDate=2026-03-10&eventType=EXAM
         Extract: event.id = "301" (Mid-Term Mathematics Exam)

Step 2 → Mark single student with explicit eventId
         POST /api/attendance/mark
         {
           "studentId": "123",
           "instituteId": "1",
           "instituteName": "Suraksha Learning Academy",
           "classId": "5",
           "className": "Grade 10A",
           "date": "2026-03-10",
           "status": "present",
           "markingMethod": "manual",
           "eventId": "301"
         }

Step 3 → Query who attended the exam
         GET /api/attendance/calendar/institute/1/event/301?date=2026-03-10
```

---

### Flow 3: RFID Card Attendance at Gate

```
Step 1 → Card tapped → Look up user first (optional, for display)
         GET /api/attendance/institute-card-user?instituteCardId=INST-CARD-001&instituteId=1
         → Shows photo, name, verification status on screen

Step 2 → Mark attendance
         POST /api/attendance/mark-by-institute-card
         {
           "instituteCardId": "INST-CARD-001",
           "instituteId": "1",
           "instituteName": "Suraksha Learning Academy",
           "address": "Main Gate",
           "markingMethod": "rfid/nfc",
           "status": "present"
         }
         → Response includes image URL and verification info
```

---

### Flow 4: View Attendance Report

```
Step 1 → Get student's attendance for March 2026
         GET /api/attendance/student/123?instituteId=1&startDate=2026-03-01&endDate=2026-03-31

Step 2 → Get class-wide attendance for today
         GET /api/attendance/institute/1/class/5?startDate=2026-03-03&endDate=2026-03-03

Step 3 → Get attendance for a specific exam event
         GET /api/attendance/calendar/institute/1/event/301

Step 4 → Get all teacher attendance today
         GET /api/attendance/calendar/institute/1/user-type/TEACHER?date=2026-03-03
```

---

### Flow 5: Device-Based Attendance

```
Step 1 → Register device (separate device management API)

Step 2 → Mark attendance with deviceUid
         POST /api/attendance/mark
         {
           "studentId": "123",
           "instituteId": "1",
           "instituteName": "Suraksha Learning Academy",
           "date": "2026-03-03",
           "status": "present",
           "markingMethod": "rfid/nfc",
           "deviceUid": "DEV-001"
         }
         → Backend validates device is registered and authorized
```

---

### Quick Reference: Which Event ID to Use?

| Scenario | `eventId` Field | What Happens |
|---|---|---|
| Normal daily attendance | **Don't send** | Backend auto-links to default `REGULAR_CLASS` event |
| Exam attendance | Send exam event ID (`"301"`) | Links to that specific exam event |
| Parents meeting | Send meeting event ID | Links to parents meeting event |
| Sports day | Send sports day event ID | Links to sports day event |
| Unknown / fallback | **Don't send** | Safely defaults to regular class event |

**How to get the event ID:**
1. `GET /institutes/:id/calendar/today` → `data.defaultEventId` (regular class) or `data.events[].id` (special events)
2. `GET /institutes/:id/calendar/events?eventType=EXAM` → browse events by type
3. `GET /institutes/:id/calendar/days/:dayId/events` → all events on a specific day
