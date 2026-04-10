# Attendance Bulk Mark Enhancements — Frontend Guide

## What's New

Three features added to the **Class** and **Subject** bulk-mark attendance flow:

| # | Feature | Applies To |
|---|---|---|
| 1 | Per-student status change (student-wise) | Class bulk mark + Subject bulk mark |
| 2 | Past & future date blocking | Class bulk mark + Subject bulk mark |
| 3 | Frontend Override dropdown per student | ManualClassAttendance page |
| 4 | **Instant per-student status update (no Bulk Mark needed)** | ManualClassAttendance page |

---

## Feature 1 — Per-Student Status Change (Class)

### Endpoint

```
POST /api/attendance/institute/:instituteId/class/:classId/bulk-mark-from-institute
```

### New Field in Request Body

```json
{
  "instituteName": "Suraksha Institute",
  "className": "Grade 10 – Science",
  "markPresentFromInstitute": true,
  "markAbsentForUnmarked": true,
  "studentOverrides": [
    { "studentId": "student-001", "status": "late" },
    { "studentId": "student-002", "status": "left_early" },
    { "studentId": "student-003", "status": "absent" }
  ]
}
```

### `studentOverrides` — Field Details

| Field | Type | Required | Description |
|---|---|---|---|
| `studentOverrides` | array | No | Optional. Per-student status overrides |
| `studentOverrides[].studentId` | string | Yes | The student's user ID |
| `studentOverrides[].status` | string | Yes | One of: `present`, `absent`, `late`, `left`, `left_early`, `left_lately` |

### How It Works

- If a student is in `studentOverrides` and **not yet marked** → mark with the **specified status** (ignores auto rules)
- If a student is in `studentOverrides` and **already marked** → **UPDATE the existing record's status** directly (no delete, no re-create — just changes the status field)
- If a student is NOT in `studentOverrides` → normal auto logic applies (present from institute / absent for unmarked)
- If a student is **already marked** with no override → skipped

> **Key point:** Overrides on already-marked students do NOT create new attendance records. They update the `status` and `timestamp` fields on the existing record.

### Response

```json
{
  "success": true,
  "message": "Class attendance bulk-marked: 15 present, 3 absent, 2 overridden, 1 status changed, 1 skipped",
  "date": "2026-04-10",
  "summary": {
    "total": 21,
    "markedPresent": 15,
    "markedAbsent": 3,
    "markedOverride": 2,
    "skipped": 1,
    "failed": 0
  },
  "results": [
    { "studentId": "student-001", "action": "marked_late", "classStatus": "late", "success": true },
    { "studentId": "student-002", "action": "marked_left_early", "classStatus": "left_early", "success": true },
    { "studentId": "student-005", "action": "marked_present", "classStatus": "present", "success": true },
    { "studentId": "student-010", "action": "skipped_already_marked", "classStatus": null, "success": true }
  ]
}
```

---

## Feature 1 — Per-Student Status Change (Subject)

### Endpoint

```
POST /api/attendance/institute/:instituteId/class/:classId/subject/:subjectId/bulk-mark-from-class
```

### New Field in Request Body

```json
{
  "instituteName": "Suraksha Institute",
  "className": "Grade 10 – Science",
  "subjectName": "Mathematics",
  "markPresentFromClass": true,
  "markAbsentForUnmarked": true,
  "studentOverrides": [
    { "studentId": "student-003", "status": "absent" },
    { "studentId": "student-004", "status": "late" }
  ]
}
```

### Same Logic as Class

- Override takes priority over auto rules
- Already-marked students with an override get their **status updated** directly on the existing record (no re-create)
- Already-marked students without an override are skipped
- Response includes `markedOverride` count in summary

### Response

```json
{
  "success": true,
  "message": "Subject attendance bulk-marked: 10 present, 2 absent, 2 overridden, 1 status changed, 0 skipped",
  "date": "2026-04-10",
  "summary": {
    "total": 14,
    "markedPresent": 10,
    "markedAbsent": 2,
    "markedOverride": 2,
    "skipped": 0,
    "failed": 0
  },
  "results": [
    { "studentId": "student-003", "action": "marked_absent", "subjectStatus": "absent", "success": true },
    { "studentId": "student-004", "action": "marked_late", "subjectStatus": "late", "success": true }
  ]
}
```

---

## Feature 2 — Past & Future Date Blocking

### Rule

**Only today's date is allowed for marking attendance.** If a past or future date is sent, the API returns `400 Bad Request`.

### Affected Endpoints

| Endpoint | Block Past | Block Future |
|---|---|---|
| `POST .../bulk-mark-from-institute` | Yes | Yes |
| `POST .../bulk-mark-from-class` | Yes | Yes |

### Error Response

```json
{
  "statusCode": 400,
  "message": "Attendance can only be marked for today (2026-04-10). Received date: 2026-04-09"
}
```

### Important Notes

- `date` field is optional — if not sent, it defaults to today (valid)
- Today is determined by **Sri Lanka timezone** (`Asia/Colombo`, UTC+5:30)
- **GET endpoints still accept any date** — you can still VIEW past/future attendance data:
  - `GET .../students-with-institute-status?date=2026-04-05` → works fine
  - `GET .../students-with-class-status?date=2026-04-05` → works fine
- The single mark (`POST /api/attendance/mark`) and bulk mark (`POST /api/attendance/mark-bulk`) already force today on the server side

---

## Feature 3 — Frontend Changes

### ManualClassAttendance Page

#### Date Restriction

- Date input has `max` set to today — future dates cannot be selected
- When a past date is selected:
  - An amber warning appears: *"Only today's date is allowed for marking. You can view past data but not mark."*
  - The **Bulk Mark** button is disabled
  - Override dropdowns are disabled
- Data can still be viewed for any date (GET endpoints have no date restriction)

#### Per-Student Override Dropdown

A new **Override** column is added to the student table (desktop and mobile):

| Override Value | Description |
|---|---|
| Auto | Use the normal auto rule (default) |
| Present | Force mark as present |
| Absent | Force mark as absent |
| Late | Force mark as late |
| Left | Force mark as left |
| Left Early | Force mark as left early |
| Left Lately | Force mark as left lately |

- Dropdown appears for **all students** — both already-marked and not-yet-marked
- For **already-marked students**: override **changes the existing record's status** (UPDATE, not re-mark). Preview shows `Change → Late`, `Change → Absent`, etc.
- For **not-yet-marked students**: override **sets the initial status** instead of auto rules. Preview shows `Override → Late`, `Override → Present`, etc.
- Overrides are cleared when date changes or after successful bulk mark
- The preview summary shows **Overrides** and **Status Changed** count badges
- Bulk mark button works with overrides only (mark rules can be off if overrides are set)

---

## Feature 4 — Instant Per-Student Status Update

### Overview

When a student **already has attendance marked**, changing their override dropdown triggers an **immediate PATCH API call** — no need to click the Bulk Mark button. The status is updated in real time on a per-student basis.

For students **not yet marked**, the dropdown still sets an override that gets applied when Bulk Mark is clicked.

### Endpoint

```
PATCH /api/attendance/institute/:instituteId/class/:classId/student/:studentId/status
```

### Request Body

```json
{
  "status": "late",
  "subjectId": "subject-001"   // optional — omit for class-level attendance
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `status` | string | Yes | One of: `present`, `absent`, `late`, `left`, `left_early`, `left_lately` |
| `subjectId` | string | No | If provided, updates the subject-level attendance record. If omitted, updates the class-level record. |

### Response

```json
{
  "success": true,
  "message": "Status updated to late for student student-001",
  "studentId": "student-001",
  "newStatus": "late"
}
```

### Error Responses

| Status | Scenario | Message |
|---|---|---|
| 400 | Invalid status value | `"Invalid status: xyz. Valid values: present, absent, late, left, left_early, left_lately"` |
| 404 | No existing record found | `"No attendance record found for this student on today's date"` |

### Frontend Behavior

1. Teacher selects a status from the dropdown for an **already-marked** student
2. Dropdown is **disabled** (loading state) while API call is in flight
3. On success: toast shows `"Status updated"`, data refreshes automatically, override is cleared
4. On error: toast shows the error message, dropdown re-enables
5. For **not-yet-marked** students: dropdown only sets the override (old behavior, requires Bulk Mark)

### How It Differs from Bulk Mark Overrides

| Aspect | Instant Update (Feature 4) | Bulk Mark Override (Feature 1) |
|---|---|---|
| Trigger | Dropdown selection | Bulk Mark button click |
| Applies to | Already-marked students only | All students |
| API call | `PATCH .../student/:studentId/status` | `POST .../bulk-mark-from-institute` or `.../bulk-mark-from-class` |
| When it fires | Immediately on selection | On Bulk Mark button click |
| Records affected | Single student | All students in the class/subject |

### Frontend API Payloads

**`BulkMarkFromInstitutePayload`** — send with class bulk mark:

```typescript
{
  instituteName: string;
  className: string;
  date?: string;
  markPresentFromInstitute?: boolean;
  markAbsentForUnmarked?: boolean;
  markingMethod?: string;
  eventId?: string | null;
  studentOverrides?: { studentId: string; status: string }[];  // NEW
}
```

**`BulkMarkFromClassPayload`** — send with subject bulk mark:

```typescript
{
  instituteName: string;
  className: string;
  subjectName: string;
  date?: string;
  markPresentFromClass?: boolean;
  markAbsentForUnmarked?: boolean;
  markingMethod?: string;
  eventId?: string | null;
  studentOverrides?: { studentId: string; status: string }[];  // NEW
}
```

### Response Summary — New Field

Both `BulkMarkFromInstituteResponse` and `BulkMarkFromClassResponse` summaries now include:

```typescript
summary: {
  total: number;
  markedPresent: number;
  markedAbsent: number;
  markedOverride?: number;  // NEW — count of students marked via overrides
  skipped: number;
  failed: number;
}
```

---

## Status Values Reference

| Value | Display Name | Status Code |
|---|---|---|
| `present` | Present | 1 |
| `absent` | Absent | 0 |
| `late` | Late | 2 |
| `left` | Left | 3 |
| `left_early` | Left Early | 4 |
| `left_lately` | Left Lately | 5 |

---

## Backend Files Changed

| File | What Changed |
|---|---|
| `src/modules/attendance/dto/class-attendance-from-institute.dto.ts` | Added `StudentStatusOverrideItem` class + `studentOverrides` field |
| `src/modules/attendance/dto/subject-attendance-from-class.dto.ts` | Added `SubjectStudentStatusOverrideItem` class + `studentOverrides` field |
| `src/modules/attendance/attendance.service.ts` | Date validation (today-only) + override map logic + status UPDATE for already-marked students in both bulk mark methods + new `updateStudentAttendanceStatus` method for instant single-student updates |
| `src/modules/attendance/attendance.controller.ts` | Added `PATCH institute/:instituteId/class/:classId/student/:studentId/status` endpoint for instant per-student status update |

## Frontend Files Changed

| File | What Changed |
|---|---|
| `src/api/attendance.api.ts` | Added `studentOverrides` to payloads + `markedOverride` to response summaries + `patchAttendance` helper + `updateStudentStatus` method |
| `src/pages/ManualClassAttendance.tsx` | Date warning + Override dropdown for all students + preview badges (Change/Override) + status changed count + override-only bulk mark support + **instant per-student status change** via `handleStatusChange` (calls PATCH API immediately for already-marked students, disables dropdown during update) |
