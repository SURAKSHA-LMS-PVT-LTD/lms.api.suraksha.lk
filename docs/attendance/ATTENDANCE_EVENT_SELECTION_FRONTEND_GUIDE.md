# Attendance Event Selection — Frontend Implementation Guide

## Overview

When marking attendance, the backend now returns **all available calendar events** for the selected date. This allows the frontend to display an **event picker** so users can choose the correct event (e.g., Regular Classes, Exam, Parents Meeting) instead of always defaulting to `REGULAR_CLASS`.

---

## What Changed

### 1. New Calendar Endpoint: `GET /institutes/:instituteId/calendar/date/:date`

Returns the calendar day + **all events** for any date. Call this **before** showing the attendance marking screen so the user can pick an event.

**URL:** `GET /institutes/{instituteId}/calendar/date/{date}`
**Auth:** JWT required (any authenticated user — no admin role needed)
**Param:** `date` in `YYYY-MM-DD` format

#### Response

```json
{
  "success": true,
  "data": {
    "id": "4521",
    "instituteId": "109",
    "calendarDate": "2026-03-04",
    "dayType": "REGULAR",
    "isAttendanceExpected": true,
    "defaultEventId": "8801",
    "events": [
      {
        "id": "8801",
        "eventType": "REGULAR_CLASS",
        "title": "Regular Classes",
        "isDefault": true,
        "isAllDay": true,
        "isAttendanceTracked": true,
        "startTime": null,
        "endTime": null
      },
      {
        "id": "8802",
        "eventType": "PARENTS_MEETING",
        "title": "Term 1 Parents Meeting",
        "isDefault": false,
        "isAllDay": false,
        "isAttendanceTracked": true,
        "startTime": "14:00:00",
        "endTime": "16:00:00"
      }
    ]
  }
}
```

### 2. Updated Attendance Marking Responses

Both single and bulk attendance responses now include:

| New Field | Type | Description |
|-----------|------|-------------|
| `date` | `string` | The date attendance was marked for (YYYY-MM-DD) |
| `eventId` | `string\|null` | The event ID used for this attendance record |
| `calendarDayId` | `string\|null` | The calendar day ID |
| `availableEvents` | `array` | All events for this date — use for event picker |

#### Single Mark Response (`POST /api/attendance/mark`)

```json
{
  "success": true,
  "imageUrl": "https://...",
  "status": "PRESENT",
  "name": "John Smith",
  "userType": "STUDENT",
  "date": "2026-03-04",
  "eventId": "8801",
  "calendarDayId": "4521",
  "availableEvents": [
    {
      "id": "8801",
      "eventType": "REGULAR_CLASS",
      "title": "Regular Classes",
      "isDefault": true,
      "isAttendanceTracked": true,
      "startTime": null,
      "endTime": null
    },
    {
      "id": "8802",
      "eventType": "EXAM",
      "title": "Term Test",
      "isDefault": false,
      "isAttendanceTracked": true,
      "startTime": "09:00:00",
      "endTime": "12:00:00"
    }
  ]
}
```

#### Bulk Mark Response (`POST /api/attendance/mark-bulk`)

```json
{
  "success": true,
  "message": "Bulk attendance marked successfully for 25 users",
  "totalProcessed": 25,
  "action": "bulk_created",
  "date": "2026-03-04",
  "eventId": "8801",
  "calendarDayId": "4521",
  "availableEvents": [
    { "id": "8801", "eventType": "REGULAR_CLASS", "title": "Regular Classes", "isDefault": true, "isAttendanceTracked": true, "startTime": null, "endTime": null }
  ],
  "records": [ ... ]
}
```

### 3. Updated Request DTOs

#### Single Mark (`POST /api/attendance/mark`)

The `eventId` field was always available. **Send it to mark attendance for a specific event:**

```json
{
  "studentId": "12345",
  "instituteId": "109",
  "instituteName": "ABC Institute",
  "date": "2026-03-04",
  "status": "PRESENT",
  "eventId": "8802"
}
```

- If `eventId` is **omitted** → backend auto-links to the default `REGULAR_CLASS` event
- If `eventId` is **provided** → backend uses that specific event
- `date` defaults to today (Sri Lanka time) if omitted

#### Bulk Mark (`POST /api/attendance/mark-bulk`)

Now supports `date` and `eventId`:

```json
{
  "instituteId": "109",
  "instituteName": "ABC Institute",
  "date": "2026-03-04",
  "eventId": "8802",
  "students": [
    { "studentId": "12345", "status": "PRESENT" },
    { "studentId": "12346", "status": "ABSENT" }
  ]
}
```

---

## Frontend Implementation Flow

### Step 1: Date Selection

When the user opens the attendance marking screen or changes the date:

```typescript
// Fetch calendar day + events for the selected date
const response = await fetch(
  `${API_BASE}/institutes/${instituteId}/calendar/date/${selectedDate}`,
  { headers: { Authorization: `Bearer ${token}` } }
);
const { data } = await response.json();

// data.events = all events for that date
// data.defaultEventId = the default event (REGULAR_CLASS)
// data.dayType = "REGULAR" | "WEEKEND" | "PUBLIC_HOLIDAY" | etc.
// data.isAttendanceExpected = whether attendance should be marked
```

### Step 2: Show Event Picker (if multiple events exist)

```typescript
const events = data.events; // Array of events
const defaultEventId = data.defaultEventId;

if (events.length > 1) {
  // Show dropdown/radio buttons for event selection
  // Pre-select the default event (isDefault: true)
  showEventPicker(events, defaultEventId);
} else if (events.length === 1) {
  // Only one event — auto-select it, no picker needed
  selectedEventId = events[0].id;
} else {
  // No events — attendance marking may not be applicable
  showWarning("No events scheduled for this date");
}
```

### Step 3: Mark Attendance with Selected Event

```typescript
// Single mark
const markResponse = await fetch(`${API_BASE}/api/attendance/mark`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  },
  body: JSON.stringify({
    studentId: '12345',
    instituteId: '109',
    instituteName: 'ABC Institute',
    date: selectedDate,        // "2026-03-04"
    status: 'PRESENT',
    eventId: selectedEventId,  // "8802" (from event picker) — omit for default
  }),
});
```

### Step 4: Use Response Events for Re-marking

After marking, the response includes `availableEvents`. Use it to update the event picker without an extra API call:

```typescript
const result = await markResponse.json();

// Update event picker with fresh data
if (result.availableEvents) {
  updateEventPicker(result.availableEvents, result.eventId);
}
```

---

## Available Event Types

| EventType | Description |
|-----------|-------------|
| `REGULAR_CLASS` | Normal daily classes (default) |
| `EXAM` | Examinations |
| `PARENTS_MEETING` | Parent-teacher meetings |
| `PRIZE_GIVING` | Awards ceremonies |
| `SPORTS_DAY` | Sports events |
| `CULTURAL_EVENT` | Cultural activities |
| `FIELD_TRIP` | Field trips/excursions |
| `WORKSHOP` | Workshops |
| `ORIENTATION` | New student orientations |
| `OPEN_DAY` | Open day events |
| `RELIGIOUS_EVENT` | Religious ceremonies |
| `EXTRACURRICULAR` | Extra-curricular activities |
| `STAFF_MEETING` | Staff meetings |
| `TRAINING` | Teacher training |
| `GRADUATION` | Graduation ceremonies |
| `ADMISSION` | Admission events |
| `MAINTENANCE` | Maintenance days |
| `CUSTOM` | Custom events |

---

## API Endpoints Summary

| Method | Endpoint | Purpose | Auth |
|--------|----------|---------|------|
| `GET` | `/institutes/:id/calendar/date/:date` | **NEW** — Get day + events for any date | JWT (any user) |
| `GET` | `/institutes/:id/calendar/today` | Get today's day + events (cached) | JWT (any user) |
| `GET` | `/institutes/:id/calendar/days/:dayId/events` | Get events by calendar day ID | JWT (any user) |
| `GET` | `/institutes/:id/calendar/events` | List all events (paginated, filterable) | JWT (any user) |
| `POST` | `/api/attendance/mark` | Mark single attendance (now returns events) | JWT + role |
| `POST` | `/api/attendance/mark-bulk` | Mark bulk attendance (now returns events) | JWT + role |

---

## Calendar Day Types & Attendance

The `dayType` field tells you if attendance should be marked:

| dayType | isAttendanceExpected | Frontend Action |
|---------|---------------------|-----------------|
| `REGULAR` | `true` | Normal attendance marking |
| `HALF_DAY` | `true` | Normal + maybe show "half day" badge |
| `EXAM_DAY` | `true` | Show exam event prominently |
| `SPECIAL_EVENT` | `true` | Show special event info |
| `STAFF_ONLY` | `true` | Only staff attendance |
| `WEEKEND` | `false` | Show warning: "Weekend — no attendance expected" |
| `PUBLIC_HOLIDAY` | `false` | Show warning: "Holiday — no attendance expected" |
| `INSTITUTE_HOLIDAY` | `false` | Show warning: "Institute holiday" |
| `CANCELLED` | `false` | Show warning: "Day cancelled" |

> **Note:** The backend allows marking attendance even on `isAttendanceExpected: false` days. The frontend should show a warning but not block the action — an admin may legitimately mark a special event attendance on a holiday.

---

## Backward Compatibility

- All changes are **non-breaking**. Existing frontend code that doesn't send `eventId` or `date` will continue to work (defaults to today's REGULAR_CLASS event).
- The new fields (`date`, `eventId`, `calendarDayId`, `availableEvents`) are **additions** to existing responses — no fields were removed or renamed.
