# Daily Attendance Count API Documentation

## Overview

Three GET endpoints that return **day-by-day** attendance counts for a given month at different scopes:

1. **Institute level** — full institute, broken down per day
2. **Class level** — specific class within an institute, broken down per day
3. **Subject level** — specific class + subject within an institute, broken down per day

All endpoints require **JWT authentication** and one of: `SUPERADMIN`, `instituteAdmin`, `teacher`, or `attendanceMarker` roles.

---

## 1. Institute Daily Attendance Count

### `GET /api/attendance/institute/:instituteId/daily-count`

Returns day-by-day attendance counts for the entire institute for a given month.

**Path Parameters:**

| Parameter     | Type   | Required | Description  |
|---------------|--------|----------|--------------|
| `instituteId` | string | ✅       | Institute ID |

**Query Parameters:**

| Parameter | Type   | Required | Description           |
|-----------|--------|----------|-----------------------|
| `year`    | number | ✅       | Year (e.g. `2026`)    |
| `month`   | number | ✅       | Month (`1` – `12`)    |

**Example Request:**

```
GET /api/attendance/institute/123/daily-count?year=2026&month=3
Authorization: Bearer <jwt-token>
```

**Example Response:**

```json
{
  "success": true,
  "message": "Institute daily attendance count retrieved successfully",
  "instituteId": "123",
  "year": 2026,
  "month": 3,
  "days": [
    {
      "date": "2026-03-01",
      "day": 1,
      "presentCount": 45,
      "absentCount": 5,
      "lateCount": 3,
      "leftCount": 1,
      "leftEarlyCount": 2,
      "leftLatelyCount": 0,
      "totalRecords": 56
    },
    {
      "date": "2026-03-02",
      "day": 2,
      "presentCount": 50,
      "absentCount": 2,
      "lateCount": 1,
      "leftCount": 0,
      "leftEarlyCount": 1,
      "leftLatelyCount": 1,
      "totalRecords": 55
    }
  ]
}
```

> **Note:** Only days that have at least one attendance record are returned. Days with no records are omitted.

---

## 2. Class Daily Attendance Count

### `GET /api/attendance/institute/:instituteId/class/:classId/daily-count`

Returns day-by-day attendance counts for a specific class within an institute for a given month.

**Path Parameters:**

| Parameter     | Type   | Required | Description  |
|---------------|--------|----------|--------------|
| `instituteId` | string | ✅       | Institute ID |
| `classId`     | string | ✅       | Class ID     |

**Query Parameters:**

| Parameter | Type   | Required | Description           |
|-----------|--------|----------|-----------------------|
| `year`    | number | ✅       | Year (e.g. `2026`)    |
| `month`   | number | ✅       | Month (`1` – `12`)    |

**Example Request:**

```
GET /api/attendance/institute/123/class/456/daily-count?year=2026&month=3
Authorization: Bearer <jwt-token>
```

**Example Response:**

```json
{
  "success": true,
  "message": "Class daily attendance count retrieved successfully",
  "instituteId": "123",
  "classId": "456",
  "year": 2026,
  "month": 3,
  "days": [
    {
      "date": "2026-03-01",
      "day": 1,
      "presentCount": 28,
      "absentCount": 2,
      "lateCount": 1,
      "leftCount": 0,
      "leftEarlyCount": 1,
      "leftLatelyCount": 0,
      "totalRecords": 32
    },
    {
      "date": "2026-03-03",
      "day": 3,
      "presentCount": 30,
      "absentCount": 1,
      "lateCount": 0,
      "leftCount": 1,
      "leftEarlyCount": 0,
      "leftLatelyCount": 0,
      "totalRecords": 32
    }
  ]
}
```

---

## 3. Subject Daily Attendance Count

### `GET /api/attendance/institute/:instituteId/class/:classId/subject/:subjectId/daily-count`

Returns day-by-day attendance counts for a specific class + subject within an institute for a given month.

**Path Parameters:**

| Parameter     | Type   | Required | Description  |
|---------------|--------|----------|--------------|
| `instituteId` | string | ✅       | Institute ID |
| `classId`     | string | ✅       | Class ID     |
| `subjectId`   | string | ✅       | Subject ID   |

**Query Parameters:**

| Parameter | Type   | Required | Description           |
|-----------|--------|----------|-----------------------|
| `year`    | number | ✅       | Year (e.g. `2026`)    |
| `month`   | number | ✅       | Month (`1` – `12`)    |

**Example Request:**

```
GET /api/attendance/institute/123/class/456/subject/789/daily-count?year=2026&month=3
Authorization: Bearer <jwt-token>
```

**Example Response:**

```json
{
  "success": true,
  "message": "Subject daily attendance count retrieved successfully",
  "instituteId": "123",
  "classId": "456",
  "subjectId": "789",
  "year": 2026,
  "month": 3,
  "days": [
    {
      "date": "2026-03-01",
      "day": 1,
      "presentCount": 18,
      "absentCount": 1,
      "lateCount": 1,
      "leftCount": 0,
      "leftEarlyCount": 0,
      "leftLatelyCount": 0,
      "totalRecords": 20
    },
    {
      "date": "2026-03-04",
      "day": 4,
      "presentCount": 19,
      "absentCount": 0,
      "lateCount": 0,
      "leftCount": 1,
      "leftEarlyCount": 0,
      "leftLatelyCount": 0,
      "totalRecords": 20
    }
  ]
}
```

---

## Response Fields

### Top-level

| Field         | Type    | Description                                   |
|---------------|---------|-----------------------------------------------|
| `success`     | boolean | Whether the request succeeded                 |
| `message`     | string  | Human-readable result message                 |
| `instituteId` | string  | Institute ID                                  |
| `classId`     | string  | Class ID (class & subject endpoints only)     |
| `subjectId`   | string  | Subject ID (subject endpoint only)            |
| `year`        | number  | Queried year                                  |
| `month`       | number  | Queried month                                 |
| `days`        | array   | Array of daily count objects (see below)      |

### Per-day object (`days[]`)

| Field             | Type   | Description                              |
|-------------------|--------|------------------------------------------|
| `date`            | string | Date in `YYYY-MM-DD` format              |
| `day`             | number | Day of month (1–31)                      |
| `presentCount`    | number | Number of **Present** records            |
| `absentCount`     | number | Number of **Absent** records             |
| `lateCount`       | number | Number of **Late** records               |
| `leftCount`       | number | Number of **Left** records               |
| `leftEarlyCount`  | number | Number of **Left Early** records         |
| `leftLatelyCount` | number | Number of **Left Late** records          |
| `totalRecords`    | number | Total attendance records for that day    |

---

## Status Mapping

| Code | Status      |
|------|-------------|
| 0    | Absent      |
| 1    | Present     |
| 2    | Late        |
| 3    | Left        |
| 4    | Left Early  |
| 5    | Left Late   |

---

## Error Responses

**400 — Invalid Parameters:**

```json
{
  "success": false,
  "message": "Valid year and month (1-12) query parameters are required"
}
```

**401 — Unauthorized:**

```json
{
  "success": false,
  "message": "Unauthorized"
}
```

**403 — Forbidden (insufficient role):**

```json
{
  "success": false,
  "message": "Forbidden resource"
}
```

---

## Authorization

| Role              | Access |
|-------------------|--------|
| SUPERADMIN        | ✅     |
| Institute Admin   | ✅     |
| Teacher           | ✅     |
| Attendance Marker | ✅     |
| Student           | ❌     |
| Parent            | ❌     |

---

## Related APIs

| API                        | Endpoint suffix      | Description                        |
|----------------------------|----------------------|------------------------------------|
| Institute Monthly Count    | `/monthly-count`     | Aggregated totals for full month   |
| Class Monthly Count        | `/monthly-count`     | Aggregated totals for full month   |
| Subject Monthly Count      | `/monthly-count`     | Aggregated totals for full month   |
| **Institute Daily Count**  | **`/daily-count`**   | **Day-by-day breakdown per month** |
| **Class Daily Count**      | **`/daily-count`**   | **Day-by-day breakdown per month** |
| **Subject Daily Count**    | **`/daily-count`**   | **Day-by-day breakdown per month** |
