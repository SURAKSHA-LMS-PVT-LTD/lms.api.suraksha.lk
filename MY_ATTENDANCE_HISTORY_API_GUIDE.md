# My Attendance History API — Implementation Guide

## Endpoint

```
GET /api/attendance/my-history
```

### Authentication
JWT bearer token **required**. The endpoint reads the logged-in user's own ID from the token — no role restriction needed.

---

## Query Parameters

| Param        | Type   | Required | Default       | Description                                                                 |
|--------------|--------|----------|---------------|-----------------------------------------------------------------------------|
| `startDate`  | string | No       | 30 days ago   | ISO date `YYYY-MM-DD` — start of date range                                 |
| `endDate`    | string | No       | Today         | ISO date `YYYY-MM-DD` — end of date range (inclusive)                       |
| `instituteId`| number | No       | —             | Filter to a single institute                                                |
| `status`     | string | No       | —             | Filter by status: `PRESENT`, `ABSENT`, `LATE`, `LEFT`, `LEFT_EARLY`, `LEFT_LATELY` |
| `page`       | number | No       | `1`           | 1-based page number                                                         |
| `limit`      | number | No       | `50`          | Records per page (max `100`)                                                |

---

## Example Request

```http
GET /api/attendance/my-history?startDate=2025-06-01&endDate=2025-06-30&page=1&limit=20
Authorization: Bearer <JWT>
```

---

## Response Schema

```json
{
  "success": true,
  "data": [
    {
      "id": "abc123",
      "date": "2025-06-15",
      "status": "PRESENT",
      "statusLabel": "Present",
      "instituteId": "42",
      "instituteName": "Suraksha Academy",
      "instituteShortName": "SA",
      "instituteLogoUrl": "https://storage.googleapis.com/bucket/logo.png",
      "classId": "7",
      "className": "Grade 10 - Science",
      "subjectId": "3",
      "markedAt": "2025-06-15T06:30:00.000Z",
      "markedBy": "device",
      "timestamp": 1749958200000
    }
  ],
  "total": 22,
  "page": 1,
  "limit": 20,
  "totalPages": 2,
  "summary": {
    "totalPresent": 18,
    "totalAbsent": 2,
    "totalLate": 1,
    "totalLeft": 0,
    "totalLeftEarly": 1,
    "totalLeftLately": 0,
    "attendanceRate": 81.82
  },
  "byInstitute": {
    "42": {
      "instituteName": "Suraksha Academy",
      "instituteLogoUrl": "https://storage.googleapis.com/bucket/logo.png",
      "totalPresent": 18,
      "totalAbsent": 2,
      "totalLate": 1,
      "totalLeft": 0,
      "totalLeftEarly": 1,
      "totalLeftLately": 0,
      "attendanceRate": 81.82
    }
  }
}
```

### `attendanceRate` calculation
```
attendanceRate = (totalPresent / (totalPresent + totalAbsent)) × 100
```
Returns `null` when both `totalPresent` and `totalAbsent` are zero.

---

## Data Sources

### 1. DynamoDB — attendance records
- **Table**: configured via `DYNAMODB_TABLE_NAME` env
- **GSI**: `gsi-student-attendance`
  - `gsi_pk` = `STUDENT#{userId}`
  - `gsi_sk` starts with `I#{instituteId}#D#{date}#TS#{timestamp}#C#{classId}#SUB#{subjectId}`
- **TTL**: 7 years — records are kept long-term
- **Method**: `DynamoDBAttendanceService.getStudentAttendanceAllInstitutes(userId, startDate?, endDate?)`
  - Queries the GSI **without** an institute filter → returns attendance from **all** institutes
  - Automatically paginates through all DynamoDB pages

### 2. MySQL/TypeORM — enrichment data
- **`InstituteEntity`** (`institutes` table): provides `name`, `shortName`, `logoUrl`
- **`InstituteClassEntity`** (`institute_classes` table): provides class `name`
- Both are fetched in a **single parallel `Promise.all`** using TypeORM `In()` operator — no N+1 queries

### Cache strategy
- Institute and class data is fetched once per API call (bulk `IN` query), stored in a local `Map` for the duration of record enrichment — no Redis required.

---

## Business Logic Flow

```
1. Extract userId from JWT (fields: s / subject / sub / id)
2. Call DynamoDB GSI with gsi_pk = STUDENT#{userId}
   └─ Optional: add date range filter (FilterExpression on `date`)
3. Apply optional filters in memory:
   └─ status filter
   └─ instituteId filter
4. Sort records newest-first (by timestamp desc)
5. Extract unique instituteIds and classIds from records
6. Bulk-fetch InstituteEntity[] and InstituteClassEntity[] in parallel
7. Build Map<id, entity> for O(1) lookup per record
8. Enrich each record:
   └─ instituteName    ← DB map (fallback: dynamo stored name)
   └─ instituteLogoUrl ← CloudStorageService.getFullUrl(logoUrl)
   └─ className        ← DB map (fallback: dynamo stored name)
   └─ statusLabel      ← human-readable label from status enum
9. Compute summary stats (present/absent/late/etc counts, attendanceRate)
10. Build byInstitute breakdown
11. Paginate and return MyAttendanceResponseDto
```

---

## Status Label Mapping

| DynamoDB value  | Label          |
|-----------------|----------------|
| `PRESENT`       | Present        |
| `ABSENT`        | Absent         |
| `LATE`          | Late           |
| `LEFT`          | Left           |
| `LEFT_EARLY`    | Left Early     |
| `LEFT_LATELY`   | Left Lately    |

---

## Files Changed / Added

| File | Change |
|------|--------|
| `src/modules/attendance/services/dynamodb-attendance.service.ts` | New method `getStudentAttendanceAllInstitutes()` |
| `src/modules/attendance/dto/attendance.dto.ts` | New DTOs: `MyAttendanceQueryDto`, `MyAttendanceRecordDto`, `MyAttendanceResponseDto` |
| `src/modules/attendance/attendance.service.ts` | New method `getMyAttendance()` + `InstituteEntity` / `InstituteClassEntity` repository injections |
| `src/modules/attendance/attendance.controller.ts` | New `GET my-history` endpoint |
| `src/modules/attendance/attendance.module.ts` | `InstituteClassEntity` added to `TypeOrmModule.forFeature([...])` |

---

## Frontend Integration Example

```typescript
// Get current month's attendance
const response = await fetch(
  `/api/attendance/my-history?startDate=2025-06-01&endDate=2025-06-30`,
  { headers: { Authorization: `Bearer ${token}` } }
);
const data = await response.json();

// data.summary.attendanceRate  → overall rate %
// data.byInstitute[id]         → per-institute breakdown
// data.data[]                  → enriched record array
```

---

## Error Responses

| Code | Condition |
|------|-----------|
| `401` | Missing or invalid JWT, or user ID not found in token |
| `500` | DynamoDB query failure or unexpected server error |

---

## Environment Variables Required

| Variable | Purpose |
|----------|---------|
| `DYNAMODB_TABLE_NAME` | DynamoDB table name |
| `AWS_REGION` | AWS region for DynamoDB |
| `AWS_ACCESS_KEY_ID` | AWS credentials |
| `AWS_SECRET_ACCESS_KEY` | AWS credentials |
| `GCS_BUCKET_NAME` | Google Cloud Storage bucket for logo URLs |
