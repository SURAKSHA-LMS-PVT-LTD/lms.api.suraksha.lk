# Class Resources API Documentation

Nested REST API endpoints for managing lectures, exams, homeworks, homework submissions, and exam results scoped to an institute class.

**Base path:** `/institutes/:instituteId/classes/:classId`

**Authentication:** All endpoints require a valid JWT Bearer token (`Authorization: Bearer <token>`).

---

## Table of Contents

- [Lectures](#lectures)
- [Exams](#exams)
- [Homeworks](#homeworks)
- [Homework Submissions](#homework-submissions)
- [Exam Results](#exam-results)
- [Access Control Summary](#access-control-summary)

---

## Lectures

**Base URL:** `/institutes/:instituteId/classes/:classId/lectures`

### Create a Lecture

```
POST /institutes/:instituteId/classes/:classId/lectures
```

**Access:** Super Admin, Institute Admin, Teacher

**Path Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `instituteId` | bigint | Institute ID |
| `classId` | bigint | Class ID |

**Request Body:** `CreateInstituteClassSubjectLectureDto`

**Response:** `201 Created` — Created lecture object

---

### Get All Lectures

```
GET /institutes/:instituteId/classes/:classId/lectures
```

**Access:** Any institute role (admin, teacher, student, parent)

**Path Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `instituteId` | bigint | Institute ID |
| `classId` | bigint | Class ID |

**Query Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `subjectId` | string | No | Filter by subject |
| `lectureType` | string | No | Filter by lecture type |
| `status` | string | No | Filter by status |
| `dateFrom` | string | No | Filter from date (`YYYY-MM-DD`) |
| `dateTo` | string | No | Filter to date (`YYYY-MM-DD`) |
| `search` | string | No | Search in title |
| `page` | number | No | Page number |
| `limit` | number | No | Items per page |

**Response:** `200 OK` — Paginated list of lectures

---

### Get Lecture Schedule for a Date

```
GET /institutes/:instituteId/classes/:classId/lectures/schedule/:date
```

**Access:** Any institute role

**Path Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `instituteId` | bigint | Institute ID |
| `classId` | bigint | Class ID |
| `date` | string | Date in `YYYY-MM-DD` format |

**Response:** `200 OK` — Array of lectures scheduled on that date

---

### Get a Lecture by ID

```
GET /institutes/:instituteId/classes/:classId/lectures/:id
```

**Access:** Any institute role

**Path Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `instituteId` | bigint | Institute ID |
| `classId` | bigint | Class ID |
| `id` | bigint | Lecture ID |

**Response:** `200 OK` — Lecture object  
**Error:** `404 Not Found`

---

### Update a Lecture

```
PATCH /institutes/:instituteId/classes/:classId/lectures/:id
```

**Access:** Super Admin, Institute Admin, Teacher

**Path Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `instituteId` | bigint | Institute ID |
| `classId` | bigint | Class ID |
| `id` | bigint | Lecture ID |

**Request Body:** `UpdateInstituteClassSubjectLectureDto`

**Response:** `200 OK` — Updated lecture object  
**Error:** `404 Not Found`

---

### Delete a Lecture

```
DELETE /institutes/:instituteId/classes/:classId/lectures/:id
```

**Access:** Super Admin, Institute Admin

**Path Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `instituteId` | bigint | Institute ID |
| `classId` | bigint | Class ID |
| `id` | bigint | Lecture ID |

**Response:** `204 No Content`  
**Error:** `404 Not Found`

---

## Exams

**Base URL:** `/institutes/:instituteId/classes/:classId/exams`

### Create an Exam

```
POST /institutes/:instituteId/classes/:classId/exams
```

**Access:** Super Admin, Institute Admin, Teacher

**Path Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `instituteId` | bigint | Institute ID |
| `classId` | bigint | Class ID |

**Request Body:** `CreateInstituteClassSubjectExamDto`

**Response:** `201 Created` — Created exam object

---

### Get All Exams

```
GET /institutes/:instituteId/classes/:classId/exams
```

**Access:** Any institute role

**Path Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `instituteId` | bigint | Institute ID |
| `classId` | bigint | Class ID |

**Query Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `subjectId` | string | No | Filter by subject ID |
| `examType` | `online` \| `physical` | No | Filter by exam type |
| `status` | `draft` \| `scheduled` \| `active` \| `completed` \| `cancelled` | No | Filter by status |
| `fromDate` | string | No | Filter from date (`YYYY-MM-DD`) |
| `toDate` | string | No | Filter to date (`YYYY-MM-DD`) |
| `search` | string | No | Search in title or description |
| `page` | number | No | Page number (default: `1`) |
| `limit` | number | No | Items per page (default: `10`) |
| `sortBy` | string | No | Sort field |
| `sortOrder` | `ASC` \| `DESC` | No | Sort order |

**Response:** `200 OK` — Paginated list of exams

---

### Get Upcoming Exams

```
GET /institutes/:instituteId/classes/:classId/exams/upcoming
```

**Access:** Any institute role

**Path Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `instituteId` | bigint | Institute ID |
| `classId` | bigint | Class ID |

**Response:** `200 OK` — Array of upcoming exam objects

---

### Get an Exam by ID

```
GET /institutes/:instituteId/classes/:classId/exams/:id
```

**Access:** Any institute role

**Path Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `instituteId` | bigint | Institute ID |
| `classId` | bigint | Class ID |
| `id` | bigint | Exam ID |

**Response:** `200 OK` — Exam object  
**Error:** `404 Not Found`

---

### Update an Exam

```
PATCH /institutes/:instituteId/classes/:classId/exams/:id
```

**Access:** Super Admin, Institute Admin, Teacher

**Path Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `instituteId` | bigint | Institute ID |
| `classId` | bigint | Class ID |
| `id` | bigint | Exam ID |

**Request Body:** `UpdateInstituteClassSubjectExamDto`

**Response:** `200 OK` — Updated exam object  
**Error:** `404 Not Found`

---

### Update Exam Status

```
PATCH /institutes/:instituteId/classes/:classId/exams/:id/status
```

**Access:** Super Admin, Institute Admin, Teacher

**Path Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `instituteId` | bigint | Institute ID |
| `classId` | bigint | Class ID |
| `id` | bigint | Exam ID |

**Request Body:**

```json
{
  "status": "draft" | "scheduled" | "active" | "completed" | "cancelled"
}
```

**Response:** `200 OK` — Updated exam object

---

### Delete an Exam

```
DELETE /institutes/:instituteId/classes/:classId/exams/:id
```

**Access:** Super Admin, Institute Admin, Teacher

**Path Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `instituteId` | bigint | Institute ID |
| `classId` | bigint | Class ID |
| `id` | bigint | Exam ID |

**Response:** `204 No Content`  
**Error:** `404 Not Found`

---

## Homeworks

**Base URL:** `/institutes/:instituteId/classes/:classId/homeworks`

### Create a Homework

```
POST /institutes/:instituteId/classes/:classId/homeworks
```

**Access:** Super Admin, Institute Admin, Teacher

**Path Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `instituteId` | bigint | Institute ID |
| `classId` | bigint | Class ID |

**Request Body:** `CreateInstituteClassSubjectHomeworkDto`

**Response:** `201 Created` — Created homework object

---

### Get All Homeworks

```
GET /institutes/:instituteId/classes/:classId/homeworks
```

**Access:** Any institute role

**Path Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `instituteId` | bigint | Institute ID |
| `classId` | bigint | Class ID |

**Query Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `subjectId` | string | No | Filter by subject ID |
| `teacherId` | string | No | Filter by teacher ID |
| `search` | string | No | Search in title or description |
| `fromDate` | string | No | Filter from start date (`YYYY-MM-DD`) |
| `toDate` | string | No | Filter to end date (`YYYY-MM-DD`) |
| `page` | number | No | Page number (default: `1`) |
| `limit` | number | No | Items per page (default: `10`) |
| `sortBy` | `title` \| `startDate` \| `endDate` \| `createdAt` | No | Sort field |
| `sortOrder` | `ASC` \| `DESC` | No | Sort order |
| `includeReferences` | boolean | No | Include reference materials |
| `includeSubmissions` | boolean | No | Include student submissions (JWT-filtered) |

**Response:** `200 OK` — Paginated list of homeworks

---

### Get a Homework by ID

```
GET /institutes/:instituteId/classes/:classId/homeworks/:id
```

**Access:** Any institute role

**Path Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `instituteId` | bigint | Institute ID |
| `classId` | bigint | Class ID |
| `id` | bigint | Homework ID |

**Response:** `200 OK` — Homework object  
**Error:** `404 Not Found`

---

### Update a Homework

```
PATCH /institutes/:instituteId/classes/:classId/homeworks/:id
```

**Access:** Super Admin, Institute Admin, Teacher

**Path Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `instituteId` | bigint | Institute ID |
| `classId` | bigint | Class ID |
| `id` | bigint | Homework ID |

**Request Body:** `UpdateInstituteClassSubjectHomeworkDto`

**Response:** `200 OK` — Updated homework object  
**Error:** `404 Not Found`

---

### Delete a Homework

```
DELETE /institutes/:instituteId/classes/:classId/homeworks/:id
```

**Access:** Super Admin, Institute Admin, Teacher

**Path Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `instituteId` | bigint | Institute ID |
| `classId` | bigint | Class ID |
| `id` | bigint | Homework ID |

**Response:** `204 No Content`  
**Error:** `404 Not Found`

---

## Homework Submissions

**Base URL:** `/institutes/:instituteId/classes/:classId/homeworks/:homeworkId/submissions`

### Submit a Homework

```
POST /institutes/:instituteId/classes/:classId/homeworks/:homeworkId/submissions
```

**Access:** Any institute role (students, teachers, admins)

**Path Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `instituteId` | bigint | Institute ID |
| `classId` | bigint | Class ID |
| `homeworkId` | bigint | Homework ID |

**Request Body:** `CreateInstituteClassSubjectHomeworksSubmissionDto`

**Response:** `201 Created` — Created submission object

---

### Get All Submissions for a Homework

```
GET /institutes/:instituteId/classes/:classId/homeworks/:homeworkId/submissions
```

**Access:** Any institute role

**Path Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `instituteId` | bigint | Institute ID |
| `classId` | bigint | Class ID |
| `homeworkId` | bigint | Homework ID |

**Query Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `studentId` | string | No | Filter by student ID |
| `subjectId` | string | No | Filter by subject ID |
| `page` | number | No | Page number |
| `limit` | number | No | Items per page |

**Response:** `200 OK` — Paginated list of submissions

---

### Get a Submission by ID

```
GET /institutes/:instituteId/classes/:classId/homeworks/:homeworkId/submissions/:id
```

**Access:** Any institute role

**Path Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `instituteId` | bigint | Institute ID |
| `classId` | bigint | Class ID |
| `homeworkId` | bigint | Homework ID |
| `id` | bigint | Submission ID |

**Response:** `200 OK` — Submission object  
**Error:** `404 Not Found`

---

### Update a Submission (Grade / Remarks)

```
PATCH /institutes/:instituteId/classes/:classId/homeworks/:homeworkId/submissions/:id
```

**Access:** Super Admin, Institute Admin, Teacher

**Path Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `instituteId` | bigint | Institute ID |
| `classId` | bigint | Class ID |
| `homeworkId` | bigint | Homework ID |
| `id` | bigint | Submission ID |

**Request Body:** `UpdateInstituteClassSubjectHomeworksSubmissionDto`

**Response:** `200 OK` — Updated submission object  
**Error:** `404 Not Found`

---

### Delete a Submission

```
DELETE /institutes/:instituteId/classes/:classId/homeworks/:homeworkId/submissions/:id
```

**Access:** Super Admin, Institute Admin, Teacher

**Path Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `instituteId` | bigint | Institute ID |
| `classId` | bigint | Class ID |
| `homeworkId` | bigint | Homework ID |
| `id` | bigint | Submission ID |

**Response:** `204 No Content`  
**Error:** `404 Not Found`

---

## Exam Results

**Base URL:** `/institutes/:instituteId/classes/:classId/results`

### Create a Result

```
POST /institutes/:instituteId/classes/:classId/results
```

**Access:** Super Admin, Institute Admin, Teacher (with class + subject requirement)

**Path Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `instituteId` | bigint | Institute ID |
| `classId` | bigint | Class ID |

**Request Body:** `CreateInstituteClassSubjectResaultDto`

**Response:** `201 Created` — Created result object

---

### Bulk Create Results

```
POST /institutes/:instituteId/classes/:classId/results/bulk
```

**Access:** Super Admin, Institute Admin, Teacher (with class + subject requirement)

**Path Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `instituteId` | bigint | Institute ID |
| `classId` | bigint | Class ID |

**Request Body:** `CreateBulkResultsDto`

**Response:** `201 Created` — Array of created result objects

---

### Get All Results

```
GET /institutes/:instituteId/classes/:classId/results
```

**Access:** Any institute role

**Path Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `instituteId` | bigint | Institute ID |
| `classId` | bigint | Class ID |

**Query Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `subjectId` | string | No | Filter by subject ID |
| `studentId` | string | No | Filter by student ID |
| `examId` | string | No | Filter by exam ID |
| `grade` | string | No | Filter by grade |
| `page` | number | No | Page number (default: `1`) |
| `limit` | number | No | Items per page (default: `10`) |

**Response:** `200 OK` — Paginated list of results

---

### Get Students with Exam Marks

```
GET /institutes/:instituteId/classes/:classId/results/students-with-marks
```

**Access:** Super Admin, Institute Admin, Teacher (with class + subject requirement)

**Path Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `instituteId` | bigint | Institute ID |
| `classId` | bigint | Class ID |

**Query Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `subjectId` | string | **Yes** | Subject ID |
| `examId` | string | **Yes** | Exam ID |

**Response:** `200 OK` — Array of `StudentExamMarkDto`  
**Error:** `400 Bad Request` if `subjectId` or `examId` is missing

---

### Get a Result by ID

```
GET /institutes/:instituteId/classes/:classId/results/:id
```

**Access:** Any institute role

**Path Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `instituteId` | bigint | Institute ID |
| `classId` | bigint | Class ID |
| `id` | bigint | Result ID |

**Response:** `200 OK` — Result object  
**Error:** `404 Not Found`

---

### Update a Result

```
PATCH /institutes/:instituteId/classes/:classId/results/:id
```

**Access:** Super Admin, Institute Admin, Teacher (with class + subject requirement)

**Path Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `instituteId` | bigint | Institute ID |
| `classId` | bigint | Class ID |
| `id` | bigint | Result ID |

**Request Body:** `UpdateInstituteClassSubjectResaultDto`

**Response:** `200 OK` — Updated result object  
**Error:** `404 Not Found`

---

### Delete a Result

```
DELETE /institutes/:instituteId/classes/:classId/results/:id
```

**Access:** Super Admin, Institute Admin

**Path Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `instituteId` | bigint | Institute ID |
| `classId` | bigint | Class ID |
| `id` | bigint | Result ID |

**Response:** `204 No Content`  
**Error:** `404 Not Found`

---

## Access Control Summary

| Role | Read | Write | Delete |
|------|------|-------|--------|
| Super Admin | ✅ | ✅ | ✅ |
| Institute Admin | ✅ | ✅ | ✅ |
| Teacher | ✅ | ✅ | ✅ (most resources) |
| Student | ✅ | ✅ (submissions only) | ❌ |
| Parent | ✅ | ❌ | ❌ |

> **Notes:**
> - For results and `students-with-marks`, teachers additionally require class and subject membership (`requireClass: true, requireSubject: true`).
> - Lecture deletion is restricted to Super Admin and Institute Admin only.
> - Result deletion is restricted to Super Admin and Institute Admin only.

---

## Complete Endpoint Reference

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/institutes/:instituteId/classes/:classId/lectures` | Create lecture |
| GET | `/institutes/:instituteId/classes/:classId/lectures` | List lectures |
| GET | `/institutes/:instituteId/classes/:classId/lectures/schedule/:date` | Get schedule for date |
| GET | `/institutes/:instituteId/classes/:classId/lectures/:id` | Get lecture |
| PATCH | `/institutes/:instituteId/classes/:classId/lectures/:id` | Update lecture |
| DELETE | `/institutes/:instituteId/classes/:classId/lectures/:id` | Delete lecture |
| POST | `/institutes/:instituteId/classes/:classId/exams` | Create exam |
| GET | `/institutes/:instituteId/classes/:classId/exams` | List exams |
| GET | `/institutes/:instituteId/classes/:classId/exams/upcoming` | Get upcoming exams |
| GET | `/institutes/:instituteId/classes/:classId/exams/:id` | Get exam |
| PATCH | `/institutes/:instituteId/classes/:classId/exams/:id` | Update exam |
| PATCH | `/institutes/:instituteId/classes/:classId/exams/:id/status` | Update exam status |
| DELETE | `/institutes/:instituteId/classes/:classId/exams/:id` | Delete exam |
| POST | `/institutes/:instituteId/classes/:classId/homeworks` | Create homework |
| GET | `/institutes/:instituteId/classes/:classId/homeworks` | List homeworks |
| GET | `/institutes/:instituteId/classes/:classId/homeworks/:id` | Get homework |
| PATCH | `/institutes/:instituteId/classes/:classId/homeworks/:id` | Update homework |
| DELETE | `/institutes/:instituteId/classes/:classId/homeworks/:id` | Delete homework |
| POST | `/institutes/:instituteId/classes/:classId/homeworks/:homeworkId/submissions` | Submit homework |
| GET | `/institutes/:instituteId/classes/:classId/homeworks/:homeworkId/submissions` | List submissions |
| GET | `/institutes/:instituteId/classes/:classId/homeworks/:homeworkId/submissions/:id` | Get submission |
| PATCH | `/institutes/:instituteId/classes/:classId/homeworks/:homeworkId/submissions/:id` | Update submission |
| DELETE | `/institutes/:instituteId/classes/:classId/homeworks/:homeworkId/submissions/:id` | Delete submission |
| POST | `/institutes/:instituteId/classes/:classId/results` | Create result |
| POST | `/institutes/:instituteId/classes/:classId/results/bulk` | Bulk create results |
| GET | `/institutes/:instituteId/classes/:classId/results` | List results |
| GET | `/institutes/:instituteId/classes/:classId/results/students-with-marks` | Get students with marks |
| GET | `/institutes/:instituteId/classes/:classId/results/:id` | Get result |
| PATCH | `/institutes/:instituteId/classes/:classId/results/:id` | Update result |
| DELETE | `/institutes/:instituteId/classes/:classId/results/:id` | Delete result |
