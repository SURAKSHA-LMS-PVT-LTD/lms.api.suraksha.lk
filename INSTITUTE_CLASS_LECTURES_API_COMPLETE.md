# Institute, Class & Subject Lectures — Complete API Documentation

> **Base URL:** `http://localhost:8080` (dev) / your production domain  
> All endpoints require `Authorization: Bearer <jwt_token>` header.  
> Dates are ISO 8601 strings (e.g. `2026-04-11T09:00:00.000Z`).

---

## Three Lecture Systems

| System | Route Prefix | Table | Scope | Members Visible |
|---|---|---|---|---|
| **Institute Lectures** | `/institute-lectures` | `institute_lectures` | Institute-wide, optional class link | Admins & teachers |
| **Class Lectures** | `/institute-class-lectures` | `institute_class_lectures` | Scoped to institute → class | **All class members** (no subject filter) |
| **Class/Subject Lectures** | `/institute-class-subject-lectures` | `institute_class_subject_lectures` | Scoped to institute → class → subject | Only students enrolled in that subject |

> **When to use which:**  
> Use **Class Lectures** for general sessions or cross-subject content visible to all class members.  
> Use **Class/Subject Lectures** for subject-specific teaching (Maths, Science, etc.).  
> Use **Institute Lectures** for institute-wide events.

---

## Part 1 — Institute Lectures (`/institute-lectures`)

### Enums

```typescript
// LectureType (lowercase string values stored in DB)
'online' | 'physical' | 'hybrid'

// LectureStatus (lowercase string values stored in DB)
'scheduled' | 'ongoing' | 'completed' | 'cancelled' | 'postponed'
```

---

### POST `/institute-lectures`
Create a new institute-level lecture.

**Auth:** `SUPERADMIN` | `INSTITUTE_ADMIN` | `TEACHER`

**Request Body:**
```json
{
  "instituteId": "109",          // required
  "instructorId": "42",          // required
  "classId": "1004",             // optional
  "title": "Algebra Chapter 3",  // required, 3–255 chars
  "description": "Introduction to polynomials",  // optional, max 5000
  "lectureType": "physical",     // required: online | physical | hybrid
  "venue": "Room 12",            // optional
  "subject": "Mathematics",      // optional free-text (not a FK)
  "startTime": "2026-04-12T09:00:00.000Z",  // required ISO
  "endTime":   "2026-04-12T10:30:00.000Z",  // required ISO, must be > startTime
  "status": "scheduled",         // optional, default scheduled
  "meetingLink": "https://meet.google.com/abc",  // optional (ONLINE/HYBRID)
  "meetingId": "abc-defg-hij",   // optional
  "meetingPassword": "pass123",   // optional
  "maxParticipants": 40,         // optional, 1–10000
  "recordingUrl": "https://...", // optional
  "isRecorded": false,           // optional, default false
  "isActive": true,              // optional, default true
  "materials": [                 // optional
    {
      "documentName": "Chapter 3 Slides",
      "documentUrl": "lecture-materials/abc-123.pdf",  // S3 relative path OR full URL
      "source": "S3",            // S3 | GOOGLE_DRIVE | GOOGLE_DRIVE_INSTITUTE | EXTERNAL_LINK
      "driveFileId": null,
      "driveWebViewLink": null
    }
  ]
}
```

**Response `201`:**
```json
{
  "id": "55",
  "instituteId": "109",
  "instructorId": "42",
  "classId": "1004",
  "title": "Algebra Chapter 3",
  "lectureType": "physical",
  "status": "scheduled",
  "startTime": "2026-04-12T09:00:00.000Z",
  "endTime": "2026-04-12T10:30:00.000Z",
  "materials": [
    {
      "documentName": "Chapter 3 Slides",
      "documentUrl": "https://storage.suraksha.lk/lecture-materials/abc-123.pdf",
      "source": "S3"
    }
  ],
  "isActive": true,
  "isRecorded": false,
  "createdAt": "2026-04-11T...",
  "updatedAt": "2026-04-11T..."
}
```

---

### GET `/institute-lectures`
List all institute lectures with optional filters.

**Auth:** Any institute role

**Query Parameters:**
| Param | Type | Description |
|---|---|---|
| `instituteId` | string | Filter by institute |
| `classId` | string | Filter by class |
| `instructorId` | string | Filter by instructor |
| `status` | string | `scheduled` / `ongoing` / `completed` / `cancelled` / `postponed` |
| `lectureType` | string | `online` / `physical` / `hybrid` |
| `subject` | string | Free-text subject filter |

**Response `200`:** Array of lecture objects (same shape as create response).

---

### GET `/institute-lectures/schedule/:date`
All institute lectures on a specific date.

**Param:** `date` in `YYYY-MM-DD` format  
**Query:** Same filters as `GET /` (without pagination)

```
GET /institute-lectures/schedule/2026-04-12?instituteId=109
```

> Internally: `startTime >= 2026-04-12T00:00:00` AND `startTime <= 2026-04-12T23:59:59.999`

**Response `200`:** `Lecture[]` ordered by `startTime ASC`

---

### GET `/institute-lectures/institute/:instituteId`
All lectures for a specific institute.

**Auth:** Any institute role  
**Param:** `instituteId` (bigint)

**Response `200`:** `Lecture[]`

---

### GET `/institute-lectures/class/:classId`
All lectures assigned to a specific class.

**Auth:** Any institute role  
**Param:** `classId` (bigint)

**Response `200`:** `Lecture[]`

---

### GET `/institute-lectures/instructor/:instructorId`
All lectures by a specific instructor.

**Auth:** Any institute role  
**Param:** `instructorId` (bigint)

**Response `200`:** `Lecture[]`

---

### GET `/institute-lectures/upcoming/:instituteId`
Future-scheduled lectures for an institute.

**Auth:** Any institute role  
**Param:** `instituteId`  
**Query:** `limit` (number, optional)

**Response `200`:** `Lecture[]` ordered by `startTime ASC`

---

### GET `/institute-lectures/ongoing/:instituteId`
Lectures currently in progress (`status = ONGOING`).

**Auth:** Any institute role  
**Param:** `instituteId`

**Response `200`:** `Lecture[]`

---

### GET `/institute-lectures/completed/:instituteId`
Completed lectures for an institute.

**Auth:** Any institute role  
**Param:** `instituteId`  
**Query:** `limit` (number, optional)

**Response `200`:** `Lecture[]`

---

### GET `/institute-lectures/:id`
Get a single lecture by ID.

**Auth:** Any institute role  
**Pipe:** `LectureExistsPipe` — returns 404 if not found before hitting service.

**Response `200`:** Single `Lecture` object with full URL-transformed materials.

**Response `404`:**
```json
{ "statusCode": 404, "message": "Institute lecture not found" }
```

---

### PATCH `/institute-lectures/:id`
Update any field of a lecture.

**Auth:** `SUPERADMIN` | `INSTITUTE_ADMIN` | `TEACHER`  
**Pipe:** `LectureTimePipe` validates `endTime > startTime` if both provided.

**Request Body:** Any subset of the create body fields (all optional via `PartialType`).

**Response `200`:** Updated lecture object.

---

### PATCH `/institute-lectures/:id/status`
Update only the status.

**Auth:** `SUPERADMIN` | `INSTITUTE_ADMIN` | `TEACHER`

**Request Body:**
```json
{ "status": "ONGOING" }
```

**Response `200`:**
```json
{
  "lecture": { ...lectureObject },
  "message": "Lecture has started"
}
```

**Messages by status:**
| Status | Message |
|---|---|
| `cancelled` | `"Lecture has been cancelled"` |
| `completed` | `"Lecture has been completed"` |
| `ongoing` | `"Lecture has started"` |
| other | `"Lecture status updated successfully"` |

---

### PATCH `/institute-lectures/:id/reschedule`
Change start and end time.

**Auth:** `SUPERADMIN` | `INSTITUTE_ADMIN` | `TEACHER`

**Request Body:**
```json
{
  "startTime": "2026-04-14T09:00:00.000Z",
  "endTime":   "2026-04-14T10:30:00.000Z"
}
```

**Validation:** `endTime` must be after `startTime` (both required).

**Response `200`:**
```json
{
  "lecture": { ...lectureObject },
  "message": "Lecture has been rescheduled"
}
```

---

### DELETE `/institute-lectures/:id`
Soft-cancel a lecture (marks as cancelled, does NOT hard-delete).

**Auth:** `SUPERADMIN` only

**Response `200`:**
```json
{ "message": "Lecture has been cancelled" }
```

---

### DELETE `/institute-lectures/:id/permanent`
Hard-delete from database.

**Auth:** `SUPERADMIN` | `INSTITUTE_ADMIN`

**Response `200`:**
```json
{
  "success": true,
  "message": "Lecture permanently deleted successfully",
  "lectureId": "55",
  "instituteId": "109"
}
```

---

### POST `/institute-lectures/bulk`
Create multiple institute lectures at once.

**Auth:** `SUPERADMIN` | `INSTITUTE_ADMIN` | `TEACHER`

**Request Body:**
```json
{
  "lectures": [
    {
      "instituteId": "109",
      "instructorId": "42",
      "title": "Week 1 - Institute Seminar",
      "lectureType": "physical",
      "startTime": "2026-04-14T09:00:00.000Z",
      "endTime": "2026-04-14T10:30:00.000Z"
    },
    {
      "instituteId": "109",
      "instructorId": "42",
      "title": "Week 2 - Institute Seminar",
      "lectureType": "physical",
      "startTime": "2026-04-21T09:00:00.000Z",
      "endTime": "2026-04-21T10:30:00.000Z"
    }
  ]
}
```

**Response `201`:** `Lecture[]` — all created lectures.

---

## Part 2 — Class Lectures (`/institute-class-lectures`) ← NEW

> **Purpose:** Lectures scoped to a class and visible to **all class members** regardless of which subjects they are enrolled in. Use this for cross-subject sessions, class assemblies, or announcements.  
> **Table:** `institute_class_lectures` (migration `1749600000000`)

### Enums

```typescript
// LectureType (lowercase)
'online' | 'physical' | 'hybrid'

// LectureStatus (lowercase)
'scheduled' | 'ongoing' | 'completed' | 'cancelled'
```

---

### POST `/institute-class-lectures`
Create a class-level lecture visible to all class members.

**Auth:** `SUPERADMIN` | `INSTITUTE_ADMIN` | `TEACHER`

**Request Body:**
```json
{
  "instituteId": "109",                       // required
  "classId": "1004",                          // required — must be a valid class in the institute
  "instructorId": "42",                       // required
  "title": "Class Assembly - Term 2",         // required, 3–255 chars
  "description": "General class meeting",     // optional, max 5000 chars
  "lectureType": "physical",                  // required: online | physical | hybrid
  "venue": "Main Hall",                       // optional
  "subject": "General",                       // optional free-text (NOT a FK — display only)
  "startTime": "2026-04-12T09:00:00.000Z",   // required ISO
  "endTime":   "2026-04-12T10:00:00.000Z",   // required ISO, must be > startTime
  "status": "scheduled",                      // optional, default scheduled
  "meetingLink": null,                        // optional (online/hybrid)
  "meetingId": null,
  "meetingPassword": null,
  "recordingUrl": null,
  "isRecorded": false,
  "maxParticipants": 50,
  "isActive": true,
  "thumbnailUrl": null,                       // optional S3 relative path or full URL
  "materials": []
}
```

> **Note:** `recodingUrl` (typo) is also accepted and auto-corrected to `recordingUrl`.

**Response `201`:** Full lecture entity (see shape at bottom of this section).

---

### GET `/institute-class-lectures`
Paginated list with filters.

**Auth:** Any institute role  
**Access:** `instituteId` triggers class-level access validation

**Query Parameters:**
| Param | Type | Description |
|---|---|---|
| `page` | number | Default `1` |
| `limit` | number | Default `10` |
| `instituteId` | string | **Recommended** — triggers access validation |
| `classId` | string | Filter by class |
| `instructorId` | string | Filter by instructor |
| `lectureType` | string | `online` / `physical` / `hybrid` |
| `status` | string | `scheduled` / `ongoing` / `completed` / `cancelled` |
| `dateFrom` | string | ISO date — `startTime >= dateFrom` |
| `dateTo` | string | ISO date — `startTime <= dateTo` |
| `isActive` | boolean | Filter active/inactive |
| `search` | string | Search by title or description |

**Response `200`:**
```json
{
  "data": [ ...lectures ],
  "page": 1,
  "limit": 10,
  "total": 25,
  "totalPages": 3
}
```

---

### GET `/institute-class-lectures/class/:classId`
All lectures for a class (unpaginated). Pass `?instituteId=109` for scope.

**Response `200`:** `Lecture[]` ordered by `startTime ASC` with instructor details joined.

---

### GET `/institute-class-lectures/institute/:instituteId`
All class lectures across all classes in an institute. Includes class and instructor relation details.

**Response `200`:** `Lecture[]`

---

### GET `/institute-class-lectures/upcoming/:classId`
Future scheduled lectures for a class.

**Query:** `?instituteId=109&limit=5`

**Response `200`:** `Lecture[]` ordered by `startTime ASC`

---

### GET `/institute-class-lectures/ongoing/:classId`
Currently in-progress lectures for a class.

**Response `200`:** `Lecture[]`

---

### GET `/institute-class-lectures/completed/:classId`
Completed lectures ordered by most recent first.

**Query:** `?instituteId=109&limit=10`

**Response `200`:** `Lecture[]`

---

### GET `/institute-class-lectures/schedule/:date`
All class lectures on a specific date.

**Param:** `date` in `YYYY-MM-DD` format  
**Query:** Same filters as `GET /` (without `page`/`limit`)

```
GET /institute-class-lectures/schedule/2026-04-12?instituteId=109&classId=1004
```

> Internally: `startTime >= 2026-04-12T00:00:00` AND `startTime <= 2026-04-12T23:59:59.999`

**Response `200`:** `Lecture[]` ordered by `startTime ASC`

---

### GET `/institute-class-lectures/:id`
Get a single class lecture by ID.

**Response `200`:** Lecture entity with full URL-transformed materials and thumbnail.

**Response `404`:**
```json
{ "statusCode": 404, "message": "Class lecture with ID 99 not found" }
```

---

### GET `/institute-class-lectures/:id/details`
Get lecture with full relation details — institute name, class name/grade, instructor name/email.

**Response `200`:** Lecture entity with joined `institute`, `class`, and `instructor` objects.

---

### PATCH `/institute-class-lectures/:id`
Update lecture fields.

**Auth:** `SUPERADMIN` | `INSTITUTE_ADMIN` | `TEACHER`

**Updatable fields:**
```
title, description, venue, subject, lectureType, startTime, endTime, status,
meetingLink, meetingId, meetingPassword, recordingUrl,
isRecorded, maxParticipants, isActive, materials, thumbnailUrl
```

> `instituteId`, `classId`, `instructorId` cannot be changed via update.

**Response `200`:** Updated lecture entity.

---

### PATCH `/institute-class-lectures/:id/status`
Update only the status field.

**Auth:** `SUPERADMIN` | `INSTITUTE_ADMIN` | `TEACHER`

**Request Body:** `{ "status": "ongoing" }`

**Response `200`:**
```json
{
  "lecture": { ...lectureObject },
  "message": "Class lecture has started"
}
```

| Status | Message |
|---|---|
| `cancelled` | `"Class lecture has been cancelled"` |
| `completed` | `"Class lecture has been completed"` |
| `ongoing` | `"Class lecture has started"` |

---

### PATCH `/institute-class-lectures/:id/reschedule`
Change start and end time.

**Auth:** `SUPERADMIN` | `INSTITUTE_ADMIN` | `TEACHER`

**Request Body:**
```json
{
  "startTime": "2026-04-14T09:00:00.000Z",
  "endTime":   "2026-04-14T10:30:00.000Z"
}
```

**Validation:** `endTime` must be after `startTime` (both required).

**Response `200`:**
```json
{
  "lecture": { ...lectureObject },
  "message": "Class lecture has been rescheduled"
}
```

---

### DELETE `/institute-class-lectures/:id`
Hard-delete. **Auth:** `SUPERADMIN` only.  
**Response `204`:** No content.

---

### DELETE `/institute-class-lectures/:id/permanent`
Permanently delete with access validation.

**Auth:** `SUPERADMIN` | `INSTITUTE_ADMIN`

**Response `200`:**
```json
{
  "success": true,
  "message": "Class lecture permanently deleted successfully",
  "lectureId": "88",
  "instituteId": "109",
  "classId": "1004"
}
```

---

### POST `/institute-class-lectures/bulk`
Create multiple class lectures at once.

**Auth:** `SUPERADMIN` | `INSTITUTE_ADMIN` | `TEACHER`

**Request Body:**
```json
{
  "lectures": [
    {
      "instituteId": "109",
      "classId": "1004",
      "instructorId": "42",
      "title": "Week 1 - Class Session",
      "lectureType": "physical",
      "startTime": "2026-04-14T09:00:00.000Z",
      "endTime": "2026-04-14T10:00:00.000Z"
    },
    {
      "instituteId": "109",
      "classId": "1004",
      "instructorId": "42",
      "title": "Week 2 - Class Session",
      "lectureType": "physical",
      "startTime": "2026-04-21T09:00:00.000Z",
      "endTime": "2026-04-21T10:00:00.000Z"
    }
  ]
}
```

**Response `201`:** `Lecture[]` — all created lectures.

---

### Lecture Object Shape (Class Lectures)

```json
{
  "id": "88",
  "instituteId": "109",
  "classId": "1004",
  "instructorId": "42",
  "title": "Class Assembly - Term 2",
  "description": "General class meeting",
  "lectureType": "physical",
  "venue": "Main Hall",
  "subject": "General",
  "startTime": "2026-04-12T09:00:00.000Z",
  "endTime": "2026-04-12T10:00:00.000Z",
  "status": "scheduled",
  "meetingLink": null,
  "meetingId": null,
  "meetingPassword": null,
  "recordingUrl": null,
  "isRecorded": false,
  "maxParticipants": 50,
  "isActive": true,
  "thumbnailUrl": null,
  "materials": [],
  "createdAt": "2026-04-11T05:00:00.000Z",
  "updatedAt": "2026-04-11T05:00:00.000Z"
}
```

---

## Part 3 — Class/Subject Lectures (`/institute-class-subject-lectures`)

### Enums

```typescript
// LectureType (lowercase)
'online' | 'physical' | 'hybrid'

// LectureStatus (lowercase)
'scheduled' | 'live' | 'completed' | 'cancelled'
```

> ⚠️ **Important:** These use **lowercase** strings, unlike Part 1's uppercase TypeORM enums.

---

### POST `/institute-class-subject-lectures`
Create a class/subject-scoped lecture.

**Auth:** `SUPERADMIN` | `INSTITUTE_ADMIN` | `TEACHER`

**Request Body (flat form — preferred):**
```json
{
  "instituteId": "109",          // required
  "classId": "1004",             // required
  "subjectId": "8",              // required (key difference from Part 1)
  "instructorId": "42",          // required
  "title": "Trigonometry Basics",
  "description": "Intro to sin/cos/tan",
  "lectureType": "physical",     // lowercase: online | physical | hybrid
  "venue": "Room 5",
  "startTime": "2026-04-12T09:00:00.000Z",
  "endTime": "2026-04-12T10:00:00.000Z",
  "status": "scheduled",         // optional, default scheduled
  "meetingLink": null,
  "meetingId": null,
  "meetingPassword": null,
  "recordingUrl": null,
  "isRecorded": false,
  "maxParticipants": 30,
  "isActive": true,
  "materials": []
}
```

**Request Body (nested form — also accepted):**
```json
{
  "instituteId": "109",
  "classId": "1004",
  "subjectId": "8",
  "instructorId": "42",
  "lectures": {
    "title": "Trigonometry Basics",
    "lectureType": "physical",
    "startTime": "2026-04-12T09:00:00.000Z",
    "endTime": "2026-04-12T10:00:00.000Z"
  }
}
```

> **Note:** The backend auto-fixes the typo `recodingUrl` → `recordingUrl` in both flat and nested forms.

**Response `201`:** Full lecture entity.

---

### GET `/institute-class-subject-lectures`
Paginated list with filters.

**Auth:** Any institute role (subject-level bitmask enforced for non-admins)

**Query Parameters:**
| Param | Type | Description |
|---|---|---|
| `page` | number | Default `1` |
| `limit` | number | Default `10` |
| `instituteId` | string | **Recommended** — triggers access validation |
| `classId` | string | Filter by class (access validated) |
| `subjectId` | string | Filter by subject (bitmask validated) |
| `instructorId` | string | Filter by instructor |
| `lectureType` | string | `online` / `physical` / `hybrid` |
| `status` | string | `scheduled` / `live` / `completed` / `cancelled` |
| `dateFrom` | string | ISO date, `startTime >= dateFrom` |
| `dateTo` | string | ISO date, `startTime <= dateTo` |
| `isActive` | boolean | Filter active/inactive |
| `search` | string | Search by title |
| `userId` | string | For parent access validation (pass child's userId) |

**Response `200`:**
```json
{
  "data": [ ...lectures ],
  "page": 1,
  "limit": 10,
  "total": 45,
  "totalPages": 5
}
```

**Access Control Logic:**
- `SUPERADMIN`: unrestricted
- `INSTITUTE_ADMIN`: full access within their institute
- `TEACHER`: filtered by class/subject bitmask in JWT
- `PARENT`: read-only access — pass `userId` query param with child's userId
- Subject access uses bitmask: `subjectBitmask & (1 << (subjectId - 1)) !== 0`

---

### GET `/institute-class-subject-lectures/schedule/:date`
All lectures on a specific date.

**Auth:** Any institute role  
**Param:** `date` in `YYYY-MM-DD` format  
**Query:** Same filters as `GET /` (without `page`/`limit`)

```
GET /institute-class-subject-lectures/schedule/2026-04-12?instituteId=109&classId=1004&subjectId=8
```

**Response `200`:** `Lecture[]` ordered by `startTime ASC`

> Internally: `startTime >= 2026-04-12T00:00:00` AND `startTime <= 2026-04-12T23:59:59.999`

---

### GET `/institute-class-subject-lectures/:id`
Get a single lecture by ID.

**Auth:** Any institute role (class + subject bitmask validated)

**Response `200`:** Full lecture entity with transformed URLs.

**Response `403`:** If user lacks class or subject access.

**Response `404`:** If lecture does not exist.

---

### PATCH `/institute-class-subject-lectures/:id`
Update lecture fields.

**Auth:** `SUPERADMIN` | `INSTITUTE_ADMIN` | `TEACHER` (must have TEACHER or INSTITUTE_ADMIN role for that institute)

**Request Body:** Any subset of create body fields (all optional).

**Updatable fields:**
```
title, description, venue, startTime, endTime, status,
meetingLink, meetingId, meetingPassword, recordingUrl,
isRecorded, maxParticipants, isActive, materials
```

> Note: `instituteId`, `classId`, `subjectId`, `instructorId` **cannot be changed** via update.

**Response `200`:** Updated lecture entity.

---

### DELETE `/institute-class-subject-lectures/:id`
Hard-delete from database.

**Auth:** `SUPERADMIN` only  
**Response `204`:** No content.

---

### DELETE `/institute-class-subject-lectures/:id/permanent`
Permanently delete with institute-level access validation.

**Auth:** `SUPERADMIN` | `INSTITUTE_ADMIN`

**Response `200`:**
```json
{
  "success": true,
  "message": "Lecture permanently deleted successfully",
  "lectureId": "72",
  "instituteId": "109"
}
```

---

### POST `/institute-class-subject-lectures/bulk`
Create multiple lectures at once.

**Auth:** `SUPERADMIN` | `INSTITUTE_ADMIN` | `TEACHER`

**Request Body:**
```json
{
  "instituteId": "109",
  "classId": "1004",
  "subjectId": "8",
  "instructorId": "42",
  "lectures": [
    {
      "title": "Week 1 - Algebra",
      "lectureType": "physical",
      "startTime": "2026-04-14T09:00:00.000Z",
      "endTime": "2026-04-14T10:00:00.000Z",
      "status": "scheduled"
    },
    {
      "title": "Week 2 - Algebra",
      "lectureType": "physical",
      "startTime": "2026-04-21T09:00:00.000Z",
      "endTime": "2026-04-21T10:00:00.000Z",
      "status": "scheduled"
    }
  ]
}
```

> `instituteId`, `classId`, `subjectId`, `instructorId` are shared from the wrapper — no need to repeat per lecture.

**Response `201`:** `Lecture[]` — all created lectures.

---

## Part 4 — Materials & File Uploads

### Upload Flow (3 steps)

#### Step 1 — Get Signed URL
```http
GET /upload/get-signed-url?folder=lecture-materials&fileName=slides.pdf&contentType=application/pdf&fileSize=2097152
```

**Response:**
```json
{
  "uploadUrl": "https://storage.googleapis.com/...?X-Goog-Signature=...",
  "relativePath": "lecture-materials/a1b2c3-slides.pdf",
  "expiresAt": "2026-04-11T09:10:00.000Z",
  "maxFileSize": 52428800,
  "contentType": "application/pdf"
}
```

#### Step 2 — Upload to Cloud
```http
PUT <uploadUrl>
Content-Type: application/pdf
[binary file body]
```

#### Step 3 — Verify & Publish
```http
POST /upload/verify-and-publish
Content-Type: application/json

{ "relativePath": "lecture-materials/a1b2c3-slides.pdf" }
```

**Response:** Full public URL string.

---

### Material Object Shape

```typescript
{
  "documentName": "Chapter 3 Slides",       // display name
  "documentUrl": "lecture-materials/abc.pdf", // S3: relative path; others: full URL
  "source": "S3",                            // S3 | GOOGLE_DRIVE | GOOGLE_DRIVE_INSTITUTE | EXTERNAL_LINK
  "driveFileId": null,                       // Google Drive file ID (Drive sources only)
  "driveWebViewLink": null                   // Google Drive web view URL (Drive sources only)
}
```

**Source rules:**
| Source | `documentUrl` | `driveFileId` |
|---|---|---|
| `S3` | relative path e.g. `lecture-materials/abc.pdf` | null |
| `GOOGLE_DRIVE` | user's personal Drive URL | drive file ID |
| `GOOGLE_DRIVE_INSTITUTE` | institute Drive URL | drive file ID |
| `EXTERNAL_LINK` | any full HTTPS URL | null |

**File size limit:** 50 MB per file for `lecture-materials` folder  
**Allowed types:** PDF, Word, PowerPoint, Excel, TXT, CSV, JPG, PNG, WebP, GIF, MP4, WebM, OGG, MP3, WAV, ZIP

---

### URL Transformation (automatic)

The backend automatically transforms S3 relative paths to full URLs in all GET responses.  
Frontend should **store relative paths** in `documentUrl` for S3 materials.  
**Never** store signed URLs — they expire.

```
"lecture-materials/abc-123.pdf"  →  "https://storage.suraksha.lk/lecture-materials/abc-123.pdf"
```

---

## Common Response Shapes

### Lecture Object (Class/Subject)

```json
{
  "id": "72",
  "instituteId": "109",
  "classId": "1004",
  "subjectId": "8",
  "instructorId": "42",
  "title": "Trigonometry Basics",
  "description": "Intro to sin/cos/tan",
  "lectureType": "physical",
  "venue": "Room 5",
  "startTime": "2026-04-12T09:00:00.000Z",
  "endTime": "2026-04-12T10:00:00.000Z",
  "status": "scheduled",
  "meetingLink": null,
  "meetingId": null,
  "meetingPassword": null,
  "recordingUrl": null,
  "isRecorded": false,
  "maxParticipants": 30,
  "isActive": true,
  "materials": [],
  "createdAt": "2026-04-11T05:00:00.000Z",
  "updatedAt": "2026-04-11T05:00:00.000Z"
}
```

### Error Responses

```json
// 400 Bad Request
{ "statusCode": 400, "message": "End time must be after start time" }

// 401 Unauthorized
{ "statusCode": 401, "message": "Unauthorized" }

// 403 Forbidden
{ "statusCode": 403, "message": "You do not have access to subject 8 in class 1004" }

// 404 Not Found
{ "statusCode": 404, "message": "Lecture with ID 99 not found" }
```

---

## Frontend API Client Methods (`lecture.api.ts`)

```typescript
// Institute lectures (Part 1)
lectureApi.getInstituteLectures(params?, forceRefresh?)      // GET /institute-lectures
lectureApi.getLectureById(id, forceRefresh?, context?)        // GET /institute-lectures/:id
lectureApi.createInstituteLecture(data)                       // POST /institute-lectures
lectureApi.updateInstituteLecture(id, data, context?)         // PATCH /institute-lectures/:id
lectureApi.deleteInstituteLecturePermanent(id, context?)      // DELETE /institute-lectures/:id/permanent

// Class lectures (Part 2) ← NEW
lectureApi.getClassLectures(params?, forceRefresh?)           // GET /institute-class-lectures
lectureApi.getClassLecturesByClass(classId, instituteId?)     // GET /institute-class-lectures/class/:classId
lectureApi.createClassLecture(data)                           // POST /institute-class-lectures
lectureApi.updateClassLecture(id, data, context?)             // PATCH /institute-class-lectures/:id
lectureApi.deleteClassLecture(id, context?)                   // PATCH /:id {isActive:false} (soft)
lectureApi.deleteClassLecturePermanent(id, context?)          // DELETE /institute-class-lectures/:id/permanent

// Class/subject lectures (Part 3)
lectureApi.getLectures(params?, forceRefresh?)                // GET /institute-class-subject-lectures
lectureApi.createLecture(data, isInstituteLecture?: false)    // POST /institute-class-subject-lectures
lectureApi.updateLecture(id, data, context?)                  // PATCH /institute-class-subject-lectures/:id
lectureApi.deleteLecture(id, context?)                        // DELETE /institute-class-subject-lectures/:id
```

**Caching:** 10-minute TTL with `staleWhileRevalidate`. Cache keys are context-aware (userId + instituteId + classId + subjectId).  
Use `forceRefresh: true` after a create/update to bust the cache.

### Frontend Routing Logic (`Lectures.tsx`)

| Context available | Endpoint used | Form shown |
|---|---|---|
| Institute + class + subject | `/institute-class-subject-lectures` | `CreateLectureForm` |
| Institute + class (no subject) | `/institute-class-lectures` | `CreateClassLectureForm` ← NEW |
| Fallback | `/lectures` (institute-lectures) | `CreateLectureForm` |

> **ClassDashboardView** fetches from `/institute-class-lectures` to show all class-level lectures. Students and teachers see all lectures without subject filtering.

---

## Key Differences Between the Three Systems

| Feature | Institute Lectures | Class Lectures ← NEW | Class/Subject Lectures |
|---|---|---|---|
| Route | `/institute-lectures` | `/institute-class-lectures` | `/institute-class-subject-lectures` |
| Table | `institute_lectures` | `institute_class_lectures` | `institute_class_subject_lectures` |
| `classId` | optional | **required** | optional (but typical) |
| `subjectId` | ❌ free-text `subject` | ❌ free-text `subject` | ✅ required FK |
| Visible to | Admins & teachers | **ALL class members** | Only subject-enrolled students |
| Enum case | UPPERCASE | lowercase | lowercase |
| Active status word | `ONGOING` | `ongoing` | `live` |
| Soft delete | marks `CANCELLED` | PATCH `isActive=false` | PATCH `isActive=false` |
| Pagination | ❌ returns array | ✅ `{data, page, limit, total}` | ✅ `{data, page, limit, total}` |
| Schedule endpoint | ✅ `/schedule/:date` | ✅ `/schedule/:date` | ✅ `/schedule/:date` |
| Bulk create | ✅ `/bulk` | ✅ `/bulk` | ✅ `/bulk` |
| Details endpoint | ❌ | ✅ `/:id/details` | ❌ |
| Status sub-route | ✅ `/status` + `/reschedule` | ✅ `/status` + `/reschedule` | ❌ (update via PATCH) |
| Access bitmask | ❌ | class-level check | ✅ JWT bitmask per subject |
| Migration | pre-existing | `1749600000000` | pre-existing |

---

*Last updated: April 11, 2026*
