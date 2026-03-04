# System Audit: Issues, Bugs & Limitations

> **Generated:** 2025 | **Scope:** Calendar + Attendance System  
> **Files Audited:** 10+ source files across services, controllers, DTOs, entities  
> **Severity Scale:** 🔴 CRITICAL | 🟠 HIGH | 🟡 MEDIUM | 🔵 LOW | ⚪ INFO

---

## Table of Contents

1. [Bugs (Functional Defects)](#1-bugs-functional-defects)
2. [Performance Limitations](#2-performance-limitations)
3. [Security Considerations](#3-security-considerations)
4. [Missing Features / Incomplete Implementation](#4-missing-features--incomplete-implementation)
5. [Architecture & Design Limitations](#5-architecture--design-limitations)
6. [Data Integrity Risks](#6-data-integrity-risks)
7. [Error Handling Gaps](#7-error-handling-gaps)
8. [Recommendations & Roadmap](#8-recommendations--roadmap)

---

## 1. Bugs (Functional Defects)

### ✅ FIXED — BUG-001: Bulk Attendance Missing Calendar Linkage

**Fixed in:** `attendance.service.ts` Step 8.5 | `dynamodb-attendance.service.ts` `markBulkAttendance()`  
**Status:** Resolved — `calendarDayId` + `eventId` are injected into every bulk record.

**Original Problem:**  
Single `markAttendance()` correctly performed calendar lookup via `CalendarDayCacheService`, but `markBulkAttendance()` skipped this step, leaving all bulk records without `calendarDayId` / `eventId`, making them invisible to calendar-linked attendance queries.

**What was implemented:**
- `attendance.service.ts → markBulkAttendance()` **Step 8.5**: calls `calendarDayCacheService.getCalendarDayForDate(instituteId, date)`, writes `calendarDayId` + `defaultEventId` (or special `eventId` if frontend sent one) onto the DTO. Includes retry logic after cache invalidation on failure.
- `dynamodb-attendance.service.ts → markBulkAttendance()`: reads `(bulkData as any).calendarDayId` and `(bulkData as any).defaultEventId` and propagates them into every per-student DynamoDB attendance record.

**Result:** Bulk-marked records are now fully calendar-linked and appear correctly in `getAttendanceByEvent`, `getAttendanceByCalendarDay`, and all event-based reporting views.

---

### 🟠 BUG-002: `generateCalendar` Uses UTC Date Conversion

**File:** `institute-calendar.service.ts` → `generateCalendar()`

**Description:**  
Calendar generation iterates dates using `new Date(startDate)` and converts to string with `date.toISOString().split('T')[0]`. Since `toISOString()` always returns UTC, dates near midnight Sri Lanka time (UTC+5:30) could produce the wrong calendar date string.

**Impact:**  
If an admin generates a calendar between 00:00-05:30 Sri Lanka time, the date iteration could be off by one day. This is partially mitigated because calendar generation is an admin action that processes sequential dates, and JavaScript's `Date` constructor for "YYYY-MM-DD" strings returns UTC midnight anyway. However, it's still semantically wrong.

**Fix:**  
Use `getCurrentSriLankaDate()` utility or manual string formatting instead of `toISOString()`:
```typescript
const dateStr = `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
```

---

### 🟡 BUG-003: `getStudentAttendance` Passes Empty String for `instituteId`

**File:** `attendance.service.ts` → `getStudentAttendance()` (line ~430)

**Description:**  
```typescript
const allRecords = await this.dynamoAttendanceService.getStudentAttendance(
  studentId,
  '', // We'll need to get instituteId from somewhere or modify the method
  startDate,
  endDate
);
```
The `instituteId` is passed as an empty string `''`. The DynamoDB service uses this to build `gsi_pk = STUDENT#<instituteId>#<studentId>`, so it becomes `STUDENT##<studentId>` — which will never match any records because all stored GSI keys include a real institute ID.

**Impact:**  
`getStudentAttendance()` in the service layer **always returns zero records**. The individual DynamoDB method works correctly when called with a proper ID, but the service wrapper breaks it.

**Fix:**  
Accept `instituteId` from the DTO or request params and pass it through:
```typescript
const allRecords = await this.dynamoAttendanceService.getStudentAttendance(
  studentId,
  getStudentAttendanceDto.instituteId, // Must add instituteId to the DTO
  startDate,
  endDate
);
```

---

### 🟡 BUG-004: `getCalendarDays` Ignores Filter Parameters

**File:** `institute-calendar.controller.ts` → `getCalendarDays()`

**Description:**  
The controller accepts `academicYear`, `dayType`, and `isAttendanceExpected` query parameters but never passes them to the service:
```typescript
const days = await this.calendarService.getCalendarDays(
  instituteId,
  start,
  end,
  // academicYear, dayType, attendanceExpected are NOT passed
);
```

**Impact:**  
Filtering by day type, academic year, or attendance-expected flag is broken — all queries return all days in the date range regardless of filters.

**Fix:**  
Update `getCalendarDays()` service method signature and add `where` conditions.

---

### 🟡 BUG-005: Unprocessed Batch Items Mapped Incorrectly

**File:** `dynamodb-attendance.service.ts` → `batchMarkAttendance()`

**Description:**  
When DynamoDB returns `UnprocessedItems`, the code assumes they are the **last N items** in the batch:
```typescript
const processedCount = batch.length - unprocessedCount;
successful.push(...batch.slice(0, processedCount));
```
DynamoDB doesn't guarantee which items fail — any items in the batch could be unprocessed. The code marks the first N as successful and the last N as failed, which is incorrect.

**Impact:**  
Some attendance records may be incorrectly reported as successful or failed. The retry mechanism (individual PutItem for failed items) partially mitigates this, but the success/failure reporting is unreliable.

**Fix:**  
Compare the unprocessed items' PK/SK against the batch to identify exactly which ones failed, or simply retry all unprocessed items without assumption of ordering.

---

### 🔵 BUG-006: `getCalendarDays` — `new Date()` Conversion Without Timezone

**File:** `institute-calendar.controller.ts`

**Description:**  
```typescript
const start = startDate ? new Date(startDate) : undefined;
const end = endDate ? new Date(endDate) : undefined;
```
`new Date('2025-01-15')` creates a UTC midnight date. The TypeORM query then compares this UTC date against MySQL's `DATE` column which is stored in `+05:30`. Depending on MySQL's connection timezone config, this could return unexpected results around date boundaries.

**Impact:**  
Low — the TypeORM connection already sets `timezone: '+05:30'`, which should handle the conversion. But it's fragile and depends on the MySQL driver's behavior.

---

## 2. Performance Limitations

### 🔴 PERF-001: Event/CalendarDay Queries Use `FilterExpression` — Full Partition Scans

**File:** `dynamodb-attendance.service.ts` — `getAttendanceByEvent()`, `getAttendanceByCalendarDay()`, `getAttendanceByUserType()`

**Description:**  
All three methods query by `pk` (institute) and then use `FilterExpression` to filter by `eventId`, `calendarDayId`, or `userType`. DynamoDB reads ALL items matching the partition key, then discards non-matching ones client-side. You are billed for all read capacity consumed.

**Impact:**  
For a large institute with 100K+ attendance records:
- Every event query reads the **entire institute's attendance data**
- Cost scales with total records, not matching records
- Response time degrades linearly with data volume
- Could hit DynamoDB's 1MB per query page limit, requiring multiple pages

**Recommended Fix:**  
Create a GSI for event-based queries:
```
GSI: gsi-event-attendance
  PK: EVENT#<instituteId>#<eventId>
  SK: ATTENDANCE#<date>#<studentId>
```
Or denormalize by writing to multiple sort key patterns.

---

### 🟠 PERF-002: `getStudentAttendance` Uses `FilterExpression` for Date Range

**File:** `dynamodb-attendance.service.ts` → `getStudentAttendance()`

**Description:**  
The GSI sort key is `gsi_sk = ATTENDANCE#<date>#<classId>#<subjectId>#<timestamp>`, which **contains** the date. However, the date range filter uses `FilterExpression` (post-scan) instead of `KeyConditionExpression`. Since the sort key starts with `ATTENDANCE#<date>`, this could use `begins_with` or `BETWEEN` on the sort key.

**Fix:**  
```typescript
// Use KeyConditionExpression for date range:
KeyConditionExpression: 'gsi_pk = :gsi_pk AND gsi_sk BETWEEN :start AND :end',
ExpressionAttributeValues: {
  ':gsi_pk': gsiPk,
  ':start': `ATTENDANCE#${startDate}`,
  ':end': `ATTENDANCE#${endDate}~` // ~ sorts after all date-suffixed values
}
```

---

### 🟠 PERF-003: Event/CalendarDay Queries Have No Pagination

**File:** `dynamodb-attendance.service.ts` — `getAttendanceByEvent()`, `getAttendanceByCalendarDay()`, `getAttendanceByUserType()`, `getStudentAttendanceByEvent()`

**Description:**  
These methods execute a single `QueryCommand` without a `lastEvaluatedKey` loop. DynamoDB returns a maximum of **1MB per query call**. If matching records exceed 1MB, the response is silently truncated with a `LastEvaluatedKey` that is never read.

**Impact:**  
Queries for events with many attendees (e.g., sports day with 500+ students) will return **incomplete results** with no indication that data was truncated.

**Fix:**  
Add the same pagination pattern used in `getAttendanceSummary()`.

---

### 🟡 PERF-004: `getCalendarDays` Has No Pagination

**File:** `institute-calendar.service.ts` → `getCalendarDays()`

**Description:**  
Returns all calendar days in a date range without any `LIMIT` or `OFFSET`. A full academic year returns 365+ rows with all their columns.

**Impact:**  
Moderate — calendar day rows are small, but for multi-year queries the response size could be significant.

---

### 🟡 PERF-005: In-Memory Cache is Node-Instance-Scoped

**File:** `calendar-day-cache.service.ts`

**Description:**  
The `Map<string, CacheEntry>` cache is local to each Node.js process. In a multi-instance Cloud Run deployment, each instance maintains its own cache. Cache invalidation (`POST cache/invalidate`) only clears one instance's cache.

**Impact:**  
- After an admin creates a new default event, other instances may serve stale data until midnight
- No distributed cache coordination
- The more instances running, the higher the aggregate DB load for cache misses

**Mitigation:**  
For current scale this is acceptable. For larger deployments, consider Redis/Memorystore or pub/sub-based invalidation.

---

### 🔵 PERF-006: `getAttendanceSummary` Loads All Records Into Memory

**File:** `dynamodb-attendance.service.ts` → `getAttendanceSummary()`

**Description:**  
While the summary does paginate DynamoDB reads, it loads **all** matching records into a single array (up to 10K default), unmarshalls them, counts them in-memory, then serializes them all in the response `records` field.

**Impact:**  
For a large date range + large institute, this could consume 50-100MB+ of RAM per request. Server-side aggregation in DynamoDB isn't possible natively, but the response shouldn't include all raw records.

**Fix:**  
Remove `records` from summary response (or make it opt-in via query param). Only return aggregated counts.

---

## 3. Security Considerations

### 🟡 SEC-001: No `userType` Enum Validation on Query Endpoints

**File:** `calendar-attendance.controller.ts` — `getAttendanceByUserType()`, `getAttendanceByCalendarDay()`

**Description:**  
The `userType` parameter is accepted as a raw string without validation against the `AttendanceUserType` enum. A malicious request like `?userType=SUPERADMIN` or `?userType=../../inject` wouldn't cause SQL injection (it goes to DynamoDB), but could return unexpected results or bypass intended filtering logic.

**Fix:**  
Add enum validation:
```typescript
if (userType && !Object.values(AttendanceUserType).includes(userType as AttendanceUserType)) {
  throw new BadRequestException(`Invalid userType: ${userType}`);
}
```

---

### 🟡 SEC-002: Cache Stats Endpoint Lacks Admin-Only Guard

**File:** `institute-calendar.controller.ts` → `getCacheStats()`

**Description:**  
The `GET cache/stats` endpoint returns internal cache diagnostics (size, hit count, etc.) but has **no role guard**. Any authenticated user can view cache internals.

**Impact:**  
Low — cache stats don't expose sensitive data, but they do reveal infrastructure details (number of institutes, cache size, etc.).

**Fix:**  
Add `@UseGuards(JwtAuthGuard)` and restrict to SUPERADMIN or INSTITUTE_ADMIN.

---

### 🟡 SEC-003: Calendar Event Creation Lacks Authorization Check

**File:** `institute-calendar.controller.ts` → `createCalendarEvent()`

**Description:**  
The endpoint creates events for any institute without verifying whether the current user has write access to that specific institute. The route requires `instituteId` in the URL, but there's no guard checking that the user is an admin of that institute.

**Impact:**  
An authenticated user from Institute A could potentially create calendar events in Institute B.

**Fix:**  
Add `@UseGuards(JwtAuthGuard, FlexibleAccessGuard)` with `@RequireAnyOfRoles({ global: [UserType.SUPERADMIN], instituteAdmin: true })`.

---

### 🔵 SEC-004: `calendarDayId` and `eventId` Not Validated Against Institute

**File:** `calendar-attendance.controller.ts`

**Description:**  
When querying `getAttendanceByCalendarDay(instituteId, calendarDayId)`, there's no check that the `calendarDayId` actually belongs to the specified `instituteId`. A user could potentially query attendance using a calendar day ID from a different institute.

**Impact:**  
Low — the DynamoDB query uses `pk = INST#<instituteId>` so cross-institute data can't leak. The calendarDayId filter is applied via `FilterExpression`. The mismatch would simply return empty results.

---

## 4. Missing Features / Incomplete Implementation

### 🟠 FEAT-001: No Update/Delete Endpoints for Calendar Events

**Description:**  
Events can be created (`POST events`) but there are **no endpoints** to:
- Update an existing event (change time, status, title)
- Cancel/delete an event
- Mark an event as COMPLETED or POSTPONED

**Impact:**  
Admins cannot modify events after creation. They must delete and recreate, but there's no delete endpoint either. The `CalendarEventStatus` enum supports `SCHEDULED | ONGOING | COMPLETED | CANCELLED | POSTPONED` but there's no way to transition between these states via API.

---

### 🟠 FEAT-002: No Update/Delete Endpoints for Calendar Days

**Description:**  
Individual calendar days cannot be updated or deleted. The only options are:
- Full calendar regeneration (deletes all and recreates)
- Lazy creation of REGULAR days

**Impact:**  
If an admin needs to mark a specific date as a holiday after calendar generation, there's no API to do so. They would need direct database access.

---

### 🟠 FEAT-003: No `instituteId` in `GetStudentAttendanceDto`

**File:** `attendance.dto.ts`

**Description:**  
The `GetStudentAttendanceDto` used for querying a student's attendance history does not include `instituteId`. The service layer passes an empty string (see BUG-003), making the entire student attendance history query non-functional.

---

### 🟡 FEAT-004: `attendanceOpenTo` and `targetUserTypes` Are Never Enforced

**File:** `institute-calendar-event.entity.ts`, `attendance.service.ts`

**Description:**  
The event entity has `targetUserTypes` (JSON array) and `attendanceOpenTo` (enum: `TARGET_ONLY | ALL_ENROLLED | ANYONE`) fields, but **no service logic** checks these when marking attendance. A teacher could be marked for a "students-only" event without any validation.

**Impact:**  
These fields are purely informational/reporting. There's no enforcement at the attendance-marking layer.

---

### 🟡 FEAT-005: No Multi-Day Event Support

**Description:**  
Events with `calendarDayId = NULL` (designed for multi-day events like term breaks, exam periods) have no query mechanism. The `getEventsForDay()` method filters by `calendarDayId`, so null-day events are never returned.

---

### 🟡 FEAT-006: `setOperatingConfig` Requires One-by-One Day Configuration

**File:** `institute-calendar.service.ts`, `institute-calendar.controller.ts`

**Description:**  
The service's `setOperatingConfig()` method creates/updates one day-of-week config at a time. The controller endpoint accepts a single `CreateOperatingConfigDto`, so to configure all 7 days the frontend must make 7 separate API calls.

**Fix:**  
Accept an array of configs in a single endpoint:
```typescript
@Post('operating-config/bulk')
async setOperatingConfigBulk(@Body() configs: CreateOperatingConfigDto[]) { ... }
```

---

### 🔵 FEAT-007: No Attendance Analytics/Trends Endpoint

**Description:**  
While `getAttendanceSummary` provides aggregate counts, there's no endpoint for:
- Daily/weekly/monthly attendance trends
- Per-student attendance percentage
- Comparative analytics (class vs class, subject vs subject)
- Event-level attendance rates

---

### 🔵 FEAT-008: No Notification for Calendar Events

**Description:**  
When a new calendar event (exam, parents meeting, sports day) is created, there's no mechanism to notify affected users. Push notifications exist for attendance marking but not for event scheduling.

---

## 5. Architecture & Design Limitations

### 🟠 ARCH-001: DynamoDB Schema Not Optimized for Event Queries

**Description:**  
The primary table key is:
```
PK: INST#<instituteId>
SK: ATTENDANCE#<date>#<studentId>#<classId>#<subjectId>#<timestamp>
```

All event-based queries (`getAttendanceByEvent`, `getAttendanceByCalendarDay`) must **scan the entire institute partition** and filter post-read. There's no GSI for event-based access patterns.

**Recommendation:**  
Add a GSI specifically for calendar-linked queries:
```
GSI: gsi-calendar-attendance
  PK: CAL#<instituteId>#<calendarDayId>
  SK: EVT#<eventId>#<studentId>
```

---

### 🟡 ARCH-002: Dual Storage Without Sync Guarantee

**Description:**  
Calendar data lives in MySQL while attendance data lives in DynamoDB. The `calendarDayId` and `eventId` in DynamoDB are foreign references to MySQL IDs, but there's no referential integrity enforcement. If a calendar day or event is deleted from MySQL, orphaned references remain in DynamoDB.

---

### 🟡 ARCH-003: Cache Invalidation is Manual Only

**Description:**  
The `POST cache/invalidate` endpoint must be called manually. There's no automatic invalidation when:
- A new calendar event is created (partially addressed — `createCalendarEvent` in controller invalidates)
- The operating config is changed
- A calendar is regenerated (not invalidating)

**Partial Fix:**  
Add `this.cacheService.invalidate(instituteId)` to all write operations in the calendar controller.

---

### 🟡 ARCH-004: `recordToAttendance` Returns `MarkAttendanceDto` Type

**File:** `dynamodb-attendance.service.ts`

**Description:**  
The `recordToAttendance()` method returns `MarkAttendanceDto & { userType?: string }` but the actual return includes `calendarDayId` and `eventId` via `as any` casting. The DTO type doesn't declare these fields, so TypeScript won't check them and IDE autocomplete won't show them.

**Fix:**  
Create a proper `AttendanceRecordDto` that extends `MarkAttendanceDto` with calendar fields:
```typescript
export class AttendanceRecordDto extends MarkAttendanceDto {
  calendarDayId?: string;
  eventId?: string;
  userType?: string;
  timestamp?: number;
}
```

---

### 🔵 ARCH-005: No Separate Read/Write Models

**Description:**  
The same `MarkAttendanceDto` is used for creating, reading, and returning attendance records. This conflates input validation with output formatting. For example, `studentName` is required for display but should be auto-resolved on write.

---

## 6. Data Integrity Risks

### 🟠 DATA-001: `generateCalendar` Duplicate Handling

**File:** `institute-calendar.service.ts` → `generateCalendar()`

**Description:**  
If `generateCalendar` is called twice for the same academic year and date range, the second call will fail with a unique constraint violation on `(instituteId, calendarDate)` — or if `save()` performs an upsert, it will silently overwrite existing days, potentially losing custom day types or events that were manually configured.

**Fix:**  
Add a check before generation:
```typescript
const existingDays = await this.calendarDayRepo.count({
  where: { instituteId, academicYear: dto.academicYear }
});
if (existingDays > 0) {
  throw new ConflictException('Calendar already exists for this academic year. Delete first or use update.');
}
```

---

### 🟡 DATA-002: Legacy Attendance Records Without Calendar Fields

**Description:**  
Attendance records created before the calendar system was implemented have no `calendarDayId` or `eventId`. All calendar-linked queries will exclude these historical records.

**Mitigation:**  
Run a one-time migration script to backfill `calendarDayId` and `eventId` for existing records based on their `date` field.

---

### 🟡 DATA-003: Attendance Summary Counts Include All User Types

**File:** `dynamodb-attendance.service.ts` → `getAttendanceSummary()`

**Description:**  
The summary counts (present, absent, late, etc.) include ALL user types mixed together. If 5 teachers and 100 students attend, the total shows 105 present. There's no breakdown by user type in the summary.

**Fix:**  
Add user-type-aware aggregation:
```typescript
const byUserType = {};
for (const record of attendanceRecords) {
  const type = record.userType || 'STUDENT';
  if (!byUserType[type]) byUserType[type] = { present: 0, absent: 0, late: 0 };
  // ... count per type
}
```

---

### 🔵 DATA-004: `timestamp` Not Returned in Query Results

**File:** `dynamodb-attendance.service.ts` → `recordToAttendance()`

**Description:**  
The `timestamp` field (used in the DynamoDB sort key) is stored in each record but is **not included** in the `recordToAttendance()` output. Since `updateAttendance()` and `deleteAttendance()` require `timestamp` as a parameter, the frontend cannot obtain the timestamp from a query to perform updates or deletes.

**Fix:**  
Add `timestamp: record.timestamp` to `recordToAttendance()` return.

---

## 7. Error Handling Gaps

### 🟡 ERR-001: Generic Error Responses in Calendar Controller

**File:** `institute-calendar.controller.ts`

**Description:**  
All catch blocks return `HttpStatus.INTERNAL_SERVER_ERROR` regardless of the actual error type:
```typescript
throw new HttpException(error.message, HttpStatus.INTERNAL_SERVER_ERROR);
```

**Impact:**  
Client-side error handling can't distinguish between:
- 404 Not Found (calendar day doesn't exist)
- 409 Conflict (duplicate calendar)
- 400 Bad Request (invalid dates)
- 500 Internal Error (actual server failure)

**Fix:**  
Propagate the correct HTTP status from service exceptions (NestJS `NotFoundException`, `BadRequestException` etc. already set the correct status code — don't wrap them in `HttpException`).

---

### 🟡 ERR-002: `createCalendarEvent` — No Validation for `eventDate` Matching `calendarDayId`

**File:** `institute-calendar.service.ts` → `createCalendarEvent()`

**Description:**  
An event can be created where `eventDate` is "2025-03-15" but the `calendarDayId` points to March 20th. There's no validation that the event date matches the calendar day's date.

---

### 🔵 ERR-003: No Structured Error Codes

**Description:**  
Error responses use free-text messages without structured error codes. Frontend must parse strings to determine error type. Consider adding enum-based error codes:
```typescript
{ success: false, errorCode: 'CALENDAR_NOT_GENERATED', message: '...' }
```

---

## 8. Recommendations & Roadmap

### Priority 1 — Must Fix (Data Loss / Incorrect Results)

| # | Issue | Effort |
|---|-------|--------|
| ~~BUG-001~~ | ~~Add calendar lookup to bulk attendance flow~~ | ✅ DONE |
| BUG-003 | Fix empty `instituteId` in `getStudentAttendance` | 30 minutes |
| DATA-004 | Return `timestamp` in query results | 15 minutes |
| PERF-003 | Add pagination loops to event/calendarDay queries | 1-2 hours |

### Priority 2 — Should Fix (Functionality Gaps)

| # | Issue | Effort |
|---|-------|--------|
| BUG-004 | Pass all filter params in `getCalendarDays` | 1 hour |
| FEAT-001 | Add PUT/DELETE endpoints for calendar events | 2-3 hours |
| FEAT-002 | Add PATCH endpoint for calendar days | 1-2 hours |
| FEAT-003 | Add `instituteId` to `GetStudentAttendanceDto` | 30 minutes |
| SEC-003 | Add auth guards to calendar write endpoints | 1 hour |

### Priority 3 — Performance Optimization

| # | Issue | Effort |
|---|-------|--------|
| PERF-001 | Create GSI for event-based queries | 3-4 hours |
| PERF-002 | Use `KeyConditionExpression` for date range | 1 hour |
| PERF-006 | Remove raw records from summary response | 30 minutes |
| ARCH-001 | Design optimal DynamoDB access patterns | Design session |

### Priority 4 — Nice to Have

| # | Issue | Effort |
|---|-------|--------|
| FEAT-004 | Enforce `attendanceOpenTo` / `targetUserTypes` | 2-3 hours |
| FEAT-006 | Bulk operating config endpoint | 1 hour |
| FEAT-007 | Analytics/trends API | 4-6 hours |
| FEAT-008 | Event notification system | 4-6 hours |
| ARCH-004 | Create proper `AttendanceRecordDto` | 1 hour |
| ERR-001 | Fix generic error responses | 1-2 hours |

---

## Summary Statistics

| Category | 🔴 Critical | 🟠 High | 🟡 Medium | 🔵 Low | Total |
|----------|-------------|---------|-----------|--------|-------|
| Bugs | 1 | 1 | 3 | 1 | **6** |
| Performance | 1 | 2 | 2 | 1 | **6** |
| Security | — | — | 3 | 1 | **4** |
| Missing Features | — | 3 | 3 | 2 | **8** |
| Architecture | — | 1 | 3 | 1 | **5** |
| Data Integrity | — | 1 | 2 | 1 | **4** |
| Error Handling | — | — | 2 | 1 | **3** |
| **Total** | **2** | **8** | **18** | **8** | **36** |

---

## 9. Class-Level (Institute Class) Support Analysis

> **Scope:** Full-system analysis of whether calendar, attendance, and other systems properly support class-level operations  
> **Date:** 2026-02-26

### Overview — Current Architecture

The system follows a **hierarchical model**: `Institute → Class → Subject`. Most entity tables include `classId` as a column, but the **depth of class-level integration varies significantly** across subsystems.

### Status Per System

| System | Data Model | Service Layer | Controller Endpoints | Status |
|--------|-----------|---------------|---------------------|--------|
| **Calendar (Days)** | `institute_class_calendar` override table exists | `getClassCalendarToday`, `getClassCalendarDays` implemented | 4 endpoints at `/institutes/:id/class/:classId/calendar` | ✅ **Read-only functional** |
| **Calendar (Events)** | `targetScope` enum (INSTITUTE/CLASS/SUBJECT) + `targetClassIds` JSON | `getCalendarEventsForClass`, `getCalendarEventsForSubject` with `JSON_CONTAINS` | Events endpoint with class filtering | ✅ **Read functional** |
| **Attendance (DynamoDB)** | `classId` optional field in sort key (`C#{classId}`) | Class-level `getClassAttendance`, `getSubjectAttendance` via FilterExpression | Full class/subject REST endpoints | ✅ **Functional** (query-by-filter, not key-optimized) |
| **Homework** | `classId` required column | Full class+subject queries | Filter by class/subject | ✅ **Fully functional** |
| **Exams (class-level)** | `classId` required | CRUD functional, **marks entry stubbed** | Class endpoint | ⚠️ **Partial** |
| **Exams (class+subject)** | `classId` + `subjectId` required | Full CRUD + filtering | Full endpoints | ✅ **Fully functional** |
| **Payments** | `classId` + `subjectId` required | Full CRUD + pagination | Full routes | ✅ **Fully functional** |
| **Structured Lectures** | `classId` nullable | Class filtering in queries | Via query params | ✅ **Functional** |
| **Lectures** | `classId` nullable, `subjectId` required | Full CRUD | Full endpoints | ✅ **Functional** |
| **Results** | `classId` + `subjectId` + `studentId` required | Full CRUD | Full endpoints | ✅ **Fully functional** |

---

### 🔴 CLASS-001: Calendar Cache Is Institute-Only — Class Overrides Never Reach Attendance

**File:** `calendar-day-cache.service.ts`

**Description:**  
The `CalendarDayCacheService` cache key is `${instituteId}_${today}` — **there is no class dimension**. The method `getTodayCalendarDay(instituteId)` accepts only `instituteId`, never `classId`. It calls `calendarService.getOrCreateCalendarDay(instituteId, today)` for the institute-level day only. The cached `defaultEventId` is also institute-level.

**Impact:**  
Any consumer using the cache (i.e., `markAttendance()`, `markBulkAttendance()`) will **never see class overrides**. If a class has a holiday override (`isAttendanceExpected: false`) but the institute day is REGULAR, the attendance system treats it as a normal day for that class.

**Fix Required:**  
Add a `getTodayClassCalendarDay(instituteId, classId)` method to the cache service. This should wrap `calendarService.getClassCalendarToday(instituteId, classId)` with a cache key like `${instituteId}_${classId}_${today}`.

```typescript
async getTodayClassCalendarDay(instituteId: string, classId: string): Promise<ClassCalendarCacheEntry> {
  const key = `${instituteId}_${classId}_${today}`;
  // ... cache logic wrapping getClassCalendarToday(instituteId, classId)
}
```

---

### 🔴 CLASS-002: `markAttendance()` Ignores Class Calendar — Never Checks `isAttendanceExpected`

**File:** `attendance.service.ts` → `markAttendance()` (line ~197)

**Description:**  
When marking attendance, the service does:
```typescript
const { day: calendarDay, defaultEventId } = await this.calendarDayCacheService.getTodayCalendarDay(
  markAttendanceDto.instituteId
);
```
Even though the DTO contains `classId`, it is **never passed** to any calendar lookup. Furthermore, `isAttendanceExpected` is **never checked anywhere** in the attendance service (zero references across all files). Attendance can be freely marked on:
- Institute holidays
- Class-specific off days
- Any day where `isAttendanceExpected: false`

**Impact:**  
The calendar system's class override for `isAttendanceExpected` is **completely ignored**. A teacher could mark attendance on a class holiday and the system would accept it without any warning.

**Fix Required:**  
1. When `classId` is present in the DTO, call `calendarService.getClassCalendarToday(instituteId, classId)` instead of the institute-only cache
2. Check `effectiveIsAttendanceExpected` before allowing attendance marking
3. Optionally allow override with a flag (`force: true`) for admin usage

---

### 🔴 CLASS-003: `markBulkAttendance()` Has Same Institute-Only Calendar Lookup

**File:** `attendance.service.ts` → `markBulkAttendance()` (line ~375)

**Description:**  
Same problem as CLASS-002 but for the bulk flow. The calendar lookup is institute-only and class overrides are never consulted. Combined with BUG-001 (bulk attendance missing calendar linkage entirely), bulk attendance has two compounding issues.

---

### 🔴 CLASS-004: No CRUD Endpoints for Class Calendar Overrides

**File:** `institute-class-calendar.controller.ts`

**Description:**  
The class calendar controller has **only GET (read) endpoints**:
- `GET /today` — read today's class day
- `POST /generate` — delegates to institute-level generation
- `GET /events` — read class events
- `GET /days` — read class days with overrides

**Completely missing endpoints:**
| Missing Endpoint | Purpose |
|-----|---------|
| `POST /override` | Create a class calendar override (e.g., mark a specific date as CLASS_HOLIDAY for a class) |
| `PATCH /override/:overrideId` | Update an existing override |
| `DELETE /override/:overrideId` | Remove an override |

**Service layer also missing:** The `InstituteCalendarService` has **no** `.save()`, `.create()`, `.update()`, `.delete()` calls for `classCalendarRepo`. The only usage is `.findOne()` and `.find()` — **read-only**.

**Impact:**  
Class overrides can only be created via **direct database manipulation**. Admins have no API to:
- Set a class holiday on a specific date
- Mark a class as merged with another class
- Assign a substitute teacher for a day
- Cancel classes for a specific class

The `InstituteClassCalendarEntity` supports `classDayType` (REGULAR, CLASS_HOLIDAY, FIELD_TRIP, EXAM_DAY, EXTRA_CLASS, CANCELLED, MERGED, CUSTOM), `mergedWithClassId`, `substituteTeacherId` — all designed for class-level scheduling — but **none of it is accessible via API**.

---

### 🟠 CLASS-005: Attendance DynamoDB Key Design — Class Queries Use FilterExpression (Inefficient)

**File:** `dynamodb-attendance.service.ts`

**Description:**  
The DynamoDB primary key structure is:
```
PK: INST#<instituteId>
SK: ATTENDANCE#<date>#<studentId>#C#<classId>#S#<subjectId>#<timestamp>
```
Class-level queries work by scanning the full institute partition and applying `FilterExpression` (post-read filter) on `classId`. This means DynamoDB reads **all institute records** first, then discards non-matching ones.

For the GSI:
```
GSI PK: STUDENT#<instituteId>#<studentId>
GSI SK: ATTENDANCE#<date>#C#<classId>#S#<subjectId>#<timestamp>
```
The GSI sort key **includes** classId after the date, so `begins_with` or `BETWEEN` cannot efficiently filter by class only.

**Impact:**  
For a large institute (300+ students × 365 days), class-level attendance queries read the **entire institute's data** and filter in-memory. This gets progressively slower as data grows. A dedicated GSI for class queries would be much more efficient.

**Recommended Fix:**  
Add a new GSI:
```
GSI: gsi-class-attendance
  PK: CLASS#<instituteId>#<classId>
  SK: ATTENDANCE#<date>#<studentId>#<timestamp>
```

---

### 🟠 CLASS-006: Calendar-Attendance Responses Don't Include Class Override Context

**File:** `calendar-attendance.controller.ts`

**Description:**  
When querying `getAttendanceByCalendarDay(instituteId, calendarDayId, ...)` or the class-scoped variant with `classId`, the response contains raw attendance records from DynamoDB but **no calendar context**:
- No `effectiveDayType` (was it a regular day or class holiday for this class?)
- No `effectiveIsAttendanceExpected` (should this class have had attendance?)
- No `classOverride` data

**Impact:**  
Frontend cannot determine whether attendance was expected for a class on a given day without making a separate calendar API call. Reporting dashboards cannot accurately show "days with unexpected attendance" or "missing attendance on expected days."

**Fix Required:**  
Enrich calendar-attendance responses with class override data when `classId` is provided:
```typescript
if (classId) {
  const override = await this.calendarService.getClassOverrideForDay(instituteId, classId, calendarDayId);
  response.classOverride = override;
  response.effectiveIsAttendanceExpected = override?.isAttendanceExpected ?? day.isAttendanceExpected;
}
```

---

### 🟡 CLASS-007: `getCalendarDays` Filter Parameters Not Passed (Affects Class Views Too)

**File:** `institute-calendar.controller.ts` → `getCalendarDays()`

**Description:**  
The institute-level controller accepts `academicYear`, `dayType`, and `isAttendanceExpected` query parameters but never passes them to the service (see BUG-004). The class-level controller (`institute-class-calendar.controller.ts`) also does **not** accept `dayType` or `academicYear` filter params at all — only `startDate`, `endDate`, `page`, `limit`.

**Impact:**  
Neither institute-level nor class-level calendar day queries can be filtered by `dayType`, `academicYear`, or `isAttendanceExpected`. This forces the frontend to load all days and filter client-side.

---

### 🟡 CLASS-008: Exam Mark Entry is Stubbed

**File:** `institute-class-exam.service.ts` → `enterMarks()`

**Description:**  
The class-level exam system (`institute_class_exams`) has full CRUD for exams, but the `enterMarks()` method contains a comment: *"In a real implementation, you would store marks in a separate entity"*. The mark storage is not implemented.

**Impact:**  
While exams can be created and scheduled at the class level, actual student marks cannot be recorded through the class exam system. The separate `institute_class_subject_results` module handles results at the subject level, but there's no bridging between the class exam and subject results systems.

---

### Priorities — Class-Level Issues

#### Priority 1 — Must Fix (Core Functionality Broken)

| # | Issue | Effort |
|---|-------|--------|
| CLASS-004 | Create CRUD endpoints for class calendar overrides | 3-4 hours |
| CLASS-001 | Add class-level cache to CalendarDayCacheService | 2-3 hours |
| CLASS-002 | Use class calendar in `markAttendance()` + check `isAttendanceExpected` | 2-3 hours |
| CLASS-003 | Use class calendar in `markBulkAttendance()` | 1-2 hours |

#### Priority 2 — Should Fix (Gap in Functionality)

| # | Issue | Effort |
|---|-------|--------|
| CLASS-006 | Enrich calendar-attendance responses with class override context | 2-3 hours |
| CLASS-007 | Pass filter params in both institute and class calendar day queries | 1-2 hours |

#### Priority 3 — Performance

| # | Issue | Effort |
|---|-------|--------|
| CLASS-005 | Add class-scoped GSI for DynamoDB attendance queries | 3-4 hours |

#### Priority 4 — Enhancement

| # | Issue | Effort |
|---|-------|--------|
| CLASS-008 | Implement exam mark entry or bridge to subject-results | 4-6 hours |

---

## Updated Summary Statistics

| Category | 🔴 Critical | 🟠 High | 🟡 Medium | 🔵 Low | Total |
|----------|-------------|---------|-----------|--------|-------|
| Bugs | 1 | 1 | 3 | 1 | **6** |
| Performance | 1 | 2 | 2 | 1 | **6** |
| Security | — | — | 3 | 1 | **4** |
| Missing Features | — | 3 | 3 | 2 | **8** |
| Architecture | — | 1 | 3 | 1 | **5** |
| Data Integrity | — | 1 | 2 | 1 | **4** |
| Error Handling | — | — | 2 | 1 | **3** |
| **Class-Level Gaps** | **4** | **2** | **2** | — | **8** |
| **Grand Total** | **6** | **10** | **20** | **8** | **44** |

---

> **Note:** This audit covers the Calendar + Attendance subsystem plus a full class-level analysis across all systems. The pre-existing auth module build error (dev server exits with code 1) is separate and not covered here. TypeScript compilation (`tsc --noEmit`) passes successfully — all issues above are runtime/logic concerns, not type errors.
