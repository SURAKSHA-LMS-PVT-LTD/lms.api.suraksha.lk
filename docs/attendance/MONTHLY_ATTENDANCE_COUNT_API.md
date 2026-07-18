# Monthly Attendance Count API Documentation

## Overview

Three GET endpoints that return aggregated monthly attendance counts at different scopes:

1. **Institute level** — full institute for a month
2. **Class level** — specific class within an institute for a month
3. **Subject level** — specific class + subject within an institute for a month

All endpoints require **JWT authentication** and one of: `SUPERADMIN`, `instituteAdmin`, `teacher`, or `attendanceMarker` roles.

---

## 1. Institute Monthly Attendance Count

### `GET /api/attendance/institute/:instituteId/monthly-count`

Returns attendance counts for the entire institute for a given month.

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
GET /api/attendance/institute/123/monthly-count?year=2026&month=3
Authorization: Bearer <jwt-token>
```

**Example Response:**

```json
{
  "success": true,
  "message": "Institute monthly attendance count retrieved successfully",
  "instituteId": "123",
  "year": 2026,
  "month": 3,
  "totalRecords": 450,
  "presentCount": 320,
  "absentCount": 50,
  "lateCount": 40,
  "leftCount": 15,
  "leftEarlyCount": 10,
  "leftLatelyCount": 15,
  "attendanceRate": 71.11
}
```

---

## 2. Class Monthly Attendance Count

### `GET /api/attendance/institute/:instituteId/class/:classId/monthly-count`

Returns attendance counts for a specific class within an institute for a given month.

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
GET /api/attendance/institute/123/class/456/monthly-count?year=2026&month=3
Authorization: Bearer <jwt-token>
```

**Example Response:**

```json
{
  "success": true,
  "message": "Class monthly attendance count retrieved successfully",
  "instituteId": "123",
  "classId": "456",
  "year": 2026,
  "month": 3,
  "totalRecords": 120,
  "presentCount": 90,
  "absentCount": 10,
  "lateCount": 8,
  "leftCount": 5,
  "leftEarlyCount": 4,
  "leftLatelyCount": 3,
  "attendanceRate": 75.0
}
```

---

## 3. Subject Monthly Attendance Count

### `GET /api/attendance/institute/:instituteId/class/:classId/subject/:subjectId/monthly-count`

Returns attendance counts for a specific class + subject within an institute for a given month.

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
GET /api/attendance/institute/123/class/456/subject/789/monthly-count?year=2026&month=3
Authorization: Bearer <jwt-token>
```

**Example Response:**

```json
{
  "success": true,
  "message": "Subject monthly attendance count retrieved successfully",
  "instituteId": "123",
  "classId": "456",
  "subjectId": "789",
  "year": 2026,
  "month": 3,
  "totalRecords": 60,
  "presentCount": 48,
  "absentCount": 5,
  "lateCount": 3,
  "leftCount": 2,
  "leftEarlyCount": 1,
  "leftLatelyCount": 1,
  "attendanceRate": 80.0
}
```

---

## Response Fields

| Field             | Type    | Description                                              |
|-------------------|---------|----------------------------------------------------------|
| `success`         | boolean | Whether the request succeeded                            |
| `message`         | string  | Human-readable result message                            |
| `instituteId`     | string  | Institute ID                                             |
| `classId`         | string  | Class ID (class & subject endpoints only)                |
| `subjectId`       | string  | Subject ID (subject endpoint only)                       |
| `year`            | number  | Queried year                                             |
| `month`           | number  | Queried month                                            |
| `totalRecords`    | number  | Total attendance records for the month                   |
| `presentCount`    | number  | Number of **Present** records                            |
| `absentCount`     | number  | Number of **Absent** records                             |
| `lateCount`       | number  | Number of **Late** records                               |
| `leftCount`       | number  | Number of **Left** records                               |
| `leftEarlyCount`  | number  | Number of **Left Early** records                         |
| `leftLatelyCount` | number  | Number of **Left Late** records                          |
| `attendanceRate`  | number  | Percentage of present records out of total (0–100, 2dp)  |

## Status Mapping

| Code | Status      |
|------|-------------|
| 0    | Absent      |
| 1    | Present     |
| 2    | Late        |
| 3    | Left        |
| 4    | Left Early  |
| 5    | Left Late   |

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

## Authorization

| Role              | Access |
|-------------------|--------|
| SUPERADMIN        | ✅     |
| Institute Admin   | ✅     |
| Teacher           | ✅     |
| Attendance Marker | ✅     |
| Student           | ❌     |
| Parent            | ❌     |
