# Class Attendance from Institute Attendance — Frontend Guide

## Overview

This feature allows **Institute Admins, Teachers, and Attendance Markers** to:

1. **View** all students in a class along with their institute-level (check-in) attendance status for a given day.
2. **Bulk-mark** class-level attendance automatically derived from institute attendance:
   - Students **present at the institute** → marked **PRESENT** in class
   - Students with **no institute attendance** → marked **ABSENT** in class
   - Students **already marked in class** → **skipped** (idempotent)

---

## Base URL

```
https://<your-api-domain>/api/attendance
```

---

## Endpoint 1 — Get Students with Institute Attendance Status

### `GET /api/attendance/institute/:instituteId/class/:classId/students-with-institute-status`

Returns every active+verified student enrolled in the class with two attendance snapshots:
- `instituteAttendance` — their institute check-in record (null if not marked yet)
- `classAttendance` — any existing class-level attendance record (null if not marked yet)

### Path Parameters

| Parameter    | Type   | Required | Description       |
|-------------|--------|----------|-------------------|
| `instituteId` | string | ✅       | Institute ID      |
| `classId`    | string | ✅       | Class ID          |

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
GET /api/attendance/institute/101/class/5/students-with-institute-status?date=2026-04-10
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

### Success Response `200 OK`

```json
{
  "success": true,
  "date": "2026-04-10",
  "summary": {
    "total": 30,
    "presentInInstitute": 22,
    "absentInInstitute": 2,
    "notMarkedInInstitute": 6,
    "alreadyMarkedInClass": 0
  },
  "data": [
    {
      "studentId": "1001",
      "studentName": "K.A. Perera",
      "studentImageUrl": "https://storage.example.com/users/1001.jpg",
      "instituteAttendance": {
        "statusCode": 1,
        "status": "present",
        "date": "2026-04-10",
        "time": "8:15 AM",
        "timestamp": "1744249500000",
        "remarks": null
      },
      "classAttendance": null
    },
    {
      "studentId": "1002",
      "studentName": "S.M. Silva",
      "studentImageUrl": null,
      "instituteAttendance": null,
      "classAttendance": null
    },
    {
      "studentId": "1003",
      "studentName": "R.P. Fernando",
      "studentImageUrl": "https://storage.example.com/users/1003.jpg",
      "instituteAttendance": {
        "statusCode": 2,
        "status": "late",
        "date": "2026-04-10",
        "time": "9:42 AM",
        "timestamp": "1744255320000",
        "remarks": "Traffic delay"
      },
      "classAttendance": {
        "statusCode": 1,
        "status": "present",
        "date": "2026-04-10",
        "time": "9:50 AM",
        "timestamp": "1744255800000"
      }
    }
  ]
}
```

### `instituteAttendance` Status Codes

| `statusCode` | `status`      | Meaning                         |
|-------------|---------------|---------------------------------|
| 0           | `absent`      | Marked absent at institute      |
| 1           | `present`     | Marked present at institute     |
| 2           | `late`        | Arrived late                    |
| 3           | `left`        | Left institute                  |
| 4           | `left_early`  | Left early                      |
| 5           | `left_lately` | Left later than usual           |
| null        | —             | Not marked at institute         |

> **Frontend logic tip**: A student is considered "present at the institute" when `instituteAttendance` is not null AND `statusCode !== 0`.

---

## Endpoint 2 — Bulk Mark Class Attendance from Institute Attendance

### `POST /api/attendance/institute/:instituteId/class/:classId/bulk-mark-from-institute`

Bulk-marks class-level attendance for all enrolled students based on their institute attendance status on a given day.

**Default behaviour (both flags true):**
- Students with institute attendance status ≠ absent → class: **PRESENT**
- Students with no institute attendance → class: **ABSENT**
- Students already marked in class → **skipped**

### Path Parameters

| Parameter    | Type   | Required | Description  |
|-------------|--------|----------|--------------|
| `instituteId` | string | ✅       | Institute ID |
| `classId`    | string | ✅       | Class ID     |

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
  "date": "2026-04-10",
  "markPresentFromInstitute": true,
  "markAbsentForUnmarked": true,
  "markingMethod": "system",
  "eventId": null
}
```

### Request Body Fields

| Field                    | Type    | Required | Default   | Description                                                              |
|--------------------------|---------|----------|-----------|--------------------------------------------------------------------------|
| `instituteName`          | string  | ✅       | —         | Display name of the institute (stored with the attendance record)        |
| `className`              | string  | ✅       | —         | Display name of the class (stored with the attendance record)            |
| `date`                   | string  | ❌       | Today (SL) | Date to mark for (`YYYY-MM-DD`)                                          |
| `markPresentFromInstitute` | boolean | ❌     | `true`    | If `true`, marks students with institute presence as PRESENT in class    |
| `markAbsentForUnmarked`  | boolean | ❌       | `true`    | If `true`, marks students without institute attendance as ABSENT in class |
| `markingMethod`          | string  | ❌       | `system`  | One of: `qr`, `barcode`, `rfid/nfc`, `manual`, `system`                 |
| `eventId`                | string  | ❌       | auto      | Special calendar event ID (leave null for the default Regular Classes event) |

### Example Request

```http
POST /api/attendance/institute/101/class/5/bulk-mark-from-institute
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
Content-Type: application/json

{
  "instituteName": "Suraksha Institute",
  "className": "Grade 10 Science"
}
```

### Success Response `201 Created`

```json
{
  "success": true,
  "message": "Class attendance bulk-marked: 22 present, 6 absent, 2 skipped",
  "date": "2026-04-10",
  "summary": {
    "total": 30,
    "markedPresent": 22,
    "markedAbsent": 6,
    "skipped": 2,
    "failed": 0
  },
  "results": [
    {
      "studentId": "1001",
      "studentName": "K.A. Perera",
      "action": "marked_present",
      "classStatus": "present",
      "success": true
    },
    {
      "studentId": "1002",
      "studentName": "S.M. Silva",
      "action": "marked_absent",
      "classStatus": "absent",
      "success": true
    },
    {
      "studentId": "1003",
      "studentName": "R.P. Fernando",
      "action": "skipped_already_marked",
      "classStatus": null,
      "success": true
    }
  ]
}
```

### `action` Values

| Value                   | Meaning                                                    |
|-------------------------|------------------------------------------------------------|
| `marked_present`        | Student was present at institute → marked PRESENT in class |
| `marked_absent`         | Student had no institute attendance → marked ABSENT in class |
| `skipped_already_marked` | Student already had class attendance → skipped             |
| `skipped_no_action`     | Skipped because both flags were false / logic didn't match |

---

## Recommended Frontend Workflow

```
┌─────────────────────────────────────────────────────────┐
│  Teacher / Admin opens "Class Attendance" screen         │
│  (selects institute, class, date)                        │
└───────────────────────┬─────────────────────────────────┘
                        │
                        ▼
           GET students-with-institute-status
                        │
                 Renders table:
        ┌───────────────┬────────────────┬───────────────┐
        │  Student Name │ Institute      │ Class         │
        │               │ Attendance     │ Attendance    │
        ├───────────────┼────────────────┼───────────────┤
        │ K.A. Perera   │ ✅ Present     │ ─ (not yet)   │
        │ S.M. Silva    │ ─ (no record)  │ ─ (not yet)   │
        │ R.P. Fernando │ ⏰ Late        │ ✅ Present     │
        └───────────────┴────────────────┴───────────────┘
                        │
            [Bulk Mark from Institute] button
                        │
                        ▼
          POST bulk-mark-from-institute
                        │
              Shows result summary toast
              "22 marked present, 6 marked absent"
                        │
             Refresh student list (re-call GET)
```

---

## Selective Bulk Actions

Use the two boolean flags to control what gets marked:

| Use Case | `markPresentFromInstitute` | `markAbsentForUnmarked` |
|----------|---------------------------|------------------------|
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

| HTTP Status | Cause                                            |
|-------------|--------------------------------------------------|
| 400         | Missing required fields (`instituteName`, `className`) |
| 401         | Invalid or missing JWT token                     |
| 403         | User does not have required institute role        |
| 500         | Unexpected server error                          |

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

1. **Institute attendance first**: Students must be checked-in at the institute level before class-level bulk marking is useful. Typically, institute attendance is marked at the gate; class attendance is marked inside the classroom.

2. **Idempotent**: Calling the bulk-mark endpoint multiple times for the same date is safe — already-marked students are always skipped.

3. **Partial success**: If `failed > 0` in the summary, show a warning. Each `results` entry has a `success` flag and optional `error` message for details.

4. **Date defaults to today**: Both endpoints default to the current Sri Lanka date if `date` is not provided. Always pass `date` explicitly in production to avoid timezone edge-cases near midnight.

5. **Image URLs**: `studentImageUrl` in the GET response is already a fully resolved URL (with the cloud storage prefix applied by the backend). You can use it directly in `<img>` tags.

6. **Status colours suggestion**:
   - `present` / `late` / `left` / `left_early` / `left_lately` → green variants (student showed up)
   - `absent` → red
   - `null` (no record) → grey (not marked)
