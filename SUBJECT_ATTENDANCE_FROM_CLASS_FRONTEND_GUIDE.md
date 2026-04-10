# Subject Attendance from Class Attendance — Frontend Guide

## Overview

This feature allows **Institute Admins, Teachers, and Attendance Markers** to:

1. **View** all students enrolled in a subject (under a class) along with their class-level attendance status for a given day.
2. **Bulk-mark** subject-level attendance automatically derived from class attendance:
   - Students **present at class level** → marked **PRESENT** in subject
   - Students with **no class attendance** → marked **ABSENT** in subject
   - Students **already marked in subject** → **skipped** (idempotent)

### Attendance Hierarchy

```
Institute Attendance  →  Class Attendance  →  Subject Attendance
     (gate)               (classroom)          (per-subject/month)
```

This guide covers the **Class → Subject** layer. For the **Institute → Class** layer, see `CLASS_ATTENDANCE_FROM_INSTITUTE_FRONTEND_GUIDE.md`.

---

## Base URL

```
https://<your-api-domain>/api/attendance
```

---

## Endpoint 1 — Get Subject Students with Class Attendance Status

### `GET /api/attendance/institute/:instituteId/class/:classId/subject/:subjectId/students-with-class-status`

Returns every active+verified student enrolled in the subject with two attendance snapshots:
- `classAttendance` — their class-level attendance record (null if not marked yet)
- `subjectAttendance` — any existing subject-level attendance record (null if not marked yet)

### Path Parameters

| Parameter     | Type   | Required | Description  |
|--------------|--------|----------|--------------|
| `instituteId` | string | ✅       | Institute ID |
| `classId`     | string | ✅       | Class ID     |
| `subjectId`   | string | ✅       | Subject ID   |

### Query Parameters

| Parameter | Type   | Required | Default    | Description                                 |
|-----------|--------|----------|------------|---------------------------------------------|
| `date`    | string | ❌       | Today (SL) | Date to query in `YYYY-MM-DD` format         |

### Headers

```http
Authorization: Bearer <JWT_TOKEN>
```

### Example Request

```http
GET /api/attendance/institute/101/class/5/subject/12/students-with-class-status?date=2026-04-10
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

### Success Response `200 OK`

```json
{
  "success": true,
  "date": "2026-04-10",
  "summary": {
    "total": 25,
    "presentInClass": 20,
    "absentInClass": 1,
    "notMarkedInClass": 4,
    "alreadyMarkedInSubject": 0
  },
  "data": [
    {
      "studentId": "1001",
      "studentName": "K.A. Perera",
      "studentImageUrl": "https://storage.example.com/users/1001.jpg",
      "classAttendance": {
        "statusCode": 1,
        "status": "present",
        "date": "2026-04-10",
        "time": "9:00 AM",
        "timestamp": "1744252200000",
        "remarks": null
      },
      "subjectAttendance": null
    },
    {
      "studentId": "1002",
      "studentName": "S.M. Silva",
      "studentImageUrl": null,
      "classAttendance": null,
      "subjectAttendance": null
    },
    {
      "studentId": "1003",
      "studentName": "R.P. Fernando",
      "studentImageUrl": "https://storage.example.com/users/1003.jpg",
      "classAttendance": {
        "statusCode": 1,
        "status": "present",
        "date": "2026-04-10",
        "time": "9:00 AM",
        "timestamp": "1744252200000",
        "remarks": null
      },
      "subjectAttendance": {
        "statusCode": 1,
        "status": "present",
        "date": "2026-04-10",
        "time": "10:15 AM",
        "timestamp": "1744256700000"
      }
    }
  ]
}
```

### `classAttendance` Status Codes

| `statusCode` | `status`      | Meaning                        |
|-------------|---------------|--------------------------------|
| 0           | `absent`      | Marked absent in class         |
| 1           | `present`     | Marked present in class        |
| 2           | `late`        | Arrived late to class          |
| 3           | `left`        | Left class                     |
| 4           | `left_early`  | Left class early               |
| 5           | `left_lately` | Left class later than usual    |
| null        | —             | Not marked at class level      |

> **Frontend logic tip**: A student is considered "present in class" when `classAttendance` is not null AND `statusCode !== 0`.

---

## Endpoint 2 — Bulk Mark Subject Attendance from Class Attendance

### `POST /api/attendance/institute/:instituteId/class/:classId/subject/:subjectId/bulk-mark-from-class`

Bulk-marks subject-level attendance for all enrolled students based on their class attendance status on a given day.

**Default behaviour (both flags true):**
- Students with class attendance status ≠ absent → subject: **PRESENT**
- Students with no class attendance → subject: **ABSENT**
- Students already marked in subject → **skipped**

### Path Parameters

| Parameter     | Type   | Required | Description  |
|--------------|--------|----------|--------------|
| `instituteId` | string | ✅       | Institute ID |
| `classId`     | string | ✅       | Class ID     |
| `subjectId`   | string | ✅       | Subject ID   |

### Headers

```http
Authorization: Bearer <JWT_TOKEN>
Content-Type: application/json
```

### Request Body

```json
{
  "instituteName": "Suraksha Institute",
  "className": "Grade 10 – Science",
  "subjectName": "Mathematics",
  "date": "2026-04-10",
  "markPresentFromClass": true,
  "markAbsentForUnmarked": true,
  "markingMethod": "system",
  "eventId": null
}
```

### Request Body Fields

| Field                   | Type    | Required | Default   | Description                                                                |
|-------------------------|---------|----------|-----------|----------------------------------------------------------------------------|
| `instituteName`         | string  | ✅       | —         | Display name of the institute                                              |
| `className`             | string  | ✅       | —         | Display name of the class                                                  |
| `subjectName`           | string  | ✅       | —         | Display name of the subject                                                |
| `date`                  | string  | ❌       | Today (SL) | Date to mark for (`YYYY-MM-DD`)                                            |
| `markPresentFromClass`  | boolean | ❌       | `true`    | If `true`, marks students with class presence as PRESENT in subject        |
| `markAbsentForUnmarked` | boolean | ❌       | `true`    | If `true`, marks students without class attendance as ABSENT in subject    |
| `markingMethod`         | string  | ❌       | `system`  | One of: `qr`, `barcode`, `rfid/nfc`, `manual`, `system`                   |
| `eventId`               | string  | ❌       | auto      | Special calendar event ID (leave null for the default Regular Classes event) |

### Example Request

```http
POST /api/attendance/institute/101/class/5/subject/12/bulk-mark-from-class
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
Content-Type: application/json

{
  "instituteName": "Suraksha Institute",
  "className": "Grade 10 Science",
  "subjectName": "Mathematics"
}
```

### Success Response `201 Created`

```json
{
  "success": true,
  "message": "Subject attendance bulk-marked: 20 present, 4 absent, 1 skipped",
  "date": "2026-04-10",
  "summary": {
    "total": 25,
    "markedPresent": 20,
    "markedAbsent": 4,
    "skipped": 1,
    "failed": 0
  },
  "results": [
    {
      "studentId": "1001",
      "studentName": "K.A. Perera",
      "action": "marked_present",
      "subjectStatus": "present",
      "success": true
    },
    {
      "studentId": "1002",
      "studentName": "S.M. Silva",
      "action": "marked_absent",
      "subjectStatus": "absent",
      "success": true
    },
    {
      "studentId": "1003",
      "studentName": "R.P. Fernando",
      "action": "skipped_already_marked",
      "subjectStatus": null,
      "success": true
    }
  ]
}
```

### `action` Values

| Value                   | Meaning                                                        |
|-------------------------|----------------------------------------------------------------|
| `marked_present`        | Student was present at class → marked PRESENT in subject       |
| `marked_absent`         | Student had no class attendance → marked ABSENT in subject     |
| `skipped_already_marked` | Student already had subject attendance → skipped              |
| `skipped_no_action`     | Skipped because both flags were false / logic didn't match     |

---

## Recommended Frontend Workflow

```
┌─────────────────────────────────────────────────────────┐
│  Teacher selects "Subject Attendance" screen             │
│  (selects institute, class, subject, date)               │
└───────────────────────┬─────────────────────────────────┘
                        │
                        ▼
         GET students-with-class-status
                        │
                 Renders table:
        ┌───────────────┬────────────────┬────────────────┐
        │  Student Name │ Class          │ Subject        │
        │               │ Attendance     │ Attendance     │
        ├───────────────┼────────────────┼────────────────┤
        │ K.A. Perera   │ ✅ Present     │ ─ (not yet)    │
        │ S.M. Silva    │ ─ (no record)  │ ─ (not yet)    │
        │ R.P. Fernando │ ✅ Present     │ ✅ Present      │
        └───────────────┴────────────────┴────────────────┘
                        │
          [Bulk Mark from Class] button
                        │
                        ▼
          POST bulk-mark-from-class
                        │
              Shows result summary toast
              "20 marked present, 4 marked absent"
                        │
             Refresh student list (re-call GET)
```

---

## Full Attendance Hierarchy Flow

For a complete attendance marking workflow across all levels:

```
 Step 1: Institute Gate (check-in)
    GET  .../class/:classId/students-with-institute-status
    POST .../class/:classId/bulk-mark-from-institute
                        │
 Step 2: Classroom
    GET  .../class/:classId/subject/:subjectId/students-with-class-status
    POST .../class/:classId/subject/:subjectId/bulk-mark-from-class
                        │
 Step 3: Subject level (per-month/period)
    → Already marked by Step 2 above
```

---

## Selective Bulk Actions

Use the two boolean flags to control what gets marked:

| Use Case | `markPresentFromClass` | `markAbsentForUnmarked` |
|----------|------------------------|------------------------|
| Mark only present students | `true` | `false` |
| Mark only absent students  | `false` | `true` |
| Mark both (default)        | `true` | `true` |
| Dry information only       | — (use GET endpoint, don't POST) | — |

---

## Error Responses

All endpoints follow the same error shape:

```json
{
  "success": false,
  "message": "Error description"
}
```

| HTTP Status | Cause                                                        |
|-------------|--------------------------------------------------------------|
| 400         | Missing required fields (`instituteName`, `className`, `subjectName`) |
| 401         | Invalid or missing JWT token                                 |
| 403         | User does not have required institute role                    |
| 500         | Unexpected server error                                      |

---

## Access Control

Both endpoints require the user to be **authenticated** (JWT) and have one of the following roles in the institute:

- `instituteAdmin`
- `teacher`
- `attendanceMarker`
- `SUPERADMIN` (global)

Students and parents **cannot** call these endpoints.

---

## Notes for Frontend Developers

1. **Class attendance first**: Students must have class-level attendance before subject-level bulk marking is useful. The typical flow is: Institute gate → Class → Subject.

2. **Enrolled students only**: The GET endpoint only returns students who are **active + verified** in the `institute_class_subject_students` table. Students who are pending verification won't appear.

3. **Idempotent**: Calling the bulk-mark endpoint multiple times for the same date is safe — already-marked students are always skipped.

4. **Partial success**: If `failed > 0` in the summary, show a warning. Each `results` entry has a `success` flag and optional `error` message for details.

5. **Date defaults to today**: Both endpoints default to the current Sri Lanka date if `date` is not provided. Always pass `date` explicitly in production to avoid timezone edge-cases near midnight.

6. **Image URLs**: `studentImageUrl` in the GET response is a fully resolved URL. Use it directly in `<img>` tags.

7. **Subject names must be passed**: The POST body requires `subjectName` (along with `instituteName` and `className`) as these are stored with each attendance record for faster reads.

8. **Status colours suggestion**:
   - `present` / `late` / `left` / `left_early` / `left_lately` → green variants (student showed up)
   - `absent` → red
   - `null` (no record) → grey (not marked)

---

## Related APIs

| Feature | Guide |
|---------|-------|
| Institute → Class attendance | `CLASS_ATTENDANCE_FROM_INSTITUTE_FRONTEND_GUIDE.md` |
| General attendance marking | `ATTENDANCE_MARKING_COMPLETE_API_GUIDE.md` |
| Attendance calendar | `ATTENDANCE_CALENDAR_API_DOCUMENTATION.md` |
