# Institute Class Lectures — API Documentation

## Base URL

```
/institute-class-lectures
```

All endpoints require **JWT authentication** (`Authorization: Bearer <token>`).

> **Note:** Unlike `institute-class-subject-lectures`, these lectures are visible to **all class members** regardless of subject enrollment. The `subject` field is free-text for display purposes only.

---

## Endpoints Overview

| Method | Endpoint | Description | Roles |
|--------|----------|-------------|-------|
| `POST` | `/` | Create a single lecture | Super Admin, Institute Admin, Teacher |
| `POST` | `/bulk` | Create multiple lectures | Super Admin, Institute Admin, Teacher |
| `GET` | `/` | List lectures (paginated, filtered) | Any institute role |
| `GET` | `/:id` | Get lecture by ID | Any institute role |
| `GET` | `/:id/details` | Get lecture with full relations | Any institute role |
| `GET` | `/class/:classId` | Get all lectures for a class | Any institute role |
| `GET` | `/institute/:instituteId` | Get all lectures for an institute | Any institute role |
| `GET` | `/upcoming/:classId` | Get upcoming lectures | Any institute role |
| `GET` | `/ongoing/:classId` | Get currently ongoing lectures | Any institute role |
| `GET` | `/completed/:classId` | Get completed lectures | Any institute role |
| `GET` | `/schedule/:date` | Get lectures for a specific date | Any institute role |
| `PATCH` | `/:id` | **Update lecture (all fields, thumbnail, materials)** | Super Admin, Institute Admin, Teacher |
| `DELETE` | `/:id` | Soft delete a lecture | Super Admin only |
| `DELETE` | `/:id/permanent` | Permanently delete a lecture | Super Admin, Institute Admin |

---

## 1. Create Lecture

### `POST /institute-class-lectures`

Creates a single class-level lecture visible to all class members.

### Request Body

```json
{
  "instituteId": "109",
  "classId": "1004",
  "instructorId": "42",
  "title": "Introduction to Class Orientation",
  "description": "Overview of the class syllabus and expectations",
  "lectureType": "physical",
  "venue": "Room 101",
  "subject": "Mathematics",
  "startTime": "2026-04-12T09:00:00.000Z",
  "endTime": "2026-04-12T10:30:00.000Z",
  "status": "scheduled",
  "meetingLink": null,
  "meetingId": null,
  "meetingPassword": null,
  "recordingUrl": null,
  "isRecorded": false,
  "maxParticipants": 50,
  "isActive": true,
  "thumbnailUrl": "lecture-thumbnails/abc123.jpg",
  "materials": [
    {
      "documentName": "Chapter 1 Notes",
      "documentUrl": "materials/chapter1.pdf",
      "source": "S3"
    }
  ]
}
```

### Request Body Fields

| Field | Type | Required | Validation | Description |
|-------|------|----------|------------|-------------|
| `instituteId` | string | Yes | Not empty | Institute ID |
| `classId` | string | Yes | Not empty | Class ID |
| `instructorId` | string | Yes | Not empty | Teacher/Instructor user ID |
| `title` | string | Yes | 3–255 chars | Lecture title |
| `description` | string | No | Max 5000 chars | Lecture description |
| `lectureType` | enum | Yes | `online`, `physical`, `hybrid` | Lecture delivery type |
| `venue` | string | No | Max 255 chars | Physical venue location |
| `subject` | string | No | Max 100 chars | Subject name (free-text, display only) |
| `startTime` | ISO string | Yes | Not empty | Lecture start time |
| `endTime` | ISO string | Yes | Not empty | Lecture end time |
| `status` | enum | No | `scheduled`, `ongoing`, `completed`, `cancelled` | Default: `scheduled` |
| `meetingLink` | string | No | Max 500 chars | Online meeting link |
| `meetingId` | string | No | Max 100 chars | Meeting ID |
| `meetingPassword` | string | No | Max 50 chars | Meeting password |
| `maxParticipants` | number | No | 1–10000 | Maximum participants allowed |
| `recordingUrl` | string | No | Max 500 chars | Recording URL |
| `isRecorded` | boolean | No | — | Whether the lecture is recorded (default: `false`) |
| `isActive` | boolean | No | — | Whether the lecture is active (default: `true`) |
| `thumbnailUrl` | string | No | Max 500 chars | Thumbnail image S3 relative path or full URL |
| `materials` | array | No | — | Attached materials (see Materials section) |

### Response — `201 Created`

```json
{
  "id": "123",
  "instituteId": "109",
  "classId": "1004",
  "instructorId": "42",
  "title": "Introduction to Class Orientation",
  "description": "Overview of the class syllabus and expectations",
  "lectureType": "physical",
  "venue": "Room 101",
  "subject": "Mathematics",
  "startTime": "2026-04-12T09:00:00.000Z",
  "endTime": "2026-04-12T10:30:00.000Z",
  "status": "scheduled",
  "meetingLink": null,
  "meetingId": null,
  "recordingUrl": null,
  "isRecorded": false,
  "maxParticipants": 50,
  "isActive": true,
  "thumbnailUrl": "https://storage.suraksha.lk/lecture-thumbnails/abc123.jpg",
  "materials": [],
  "createdAt": "2026-04-11T08:00:00.000Z",
  "updatedAt": "2026-04-11T08:00:00.000Z"
}
```

> **Note:** `meetingPassword` is excluded from all responses for security.

---

## 2. Bulk Create Lectures

### `POST /institute-class-lectures/bulk`

Creates multiple lectures at once.

### Request Body

```json
{
  "lectures": [
    {
      "instituteId": "109",
      "classId": "1004",
      "instructorId": "42",
      "title": "Lecture 1 - Basics",
      "lectureType": "physical",
      "venue": "Room 101",
      "startTime": "2026-04-12T09:00:00.000Z",
      "endTime": "2026-04-12T10:30:00.000Z"
    },
    {
      "instituteId": "109",
      "classId": "1004",
      "instructorId": "42",
      "title": "Lecture 2 - Advanced",
      "lectureType": "online",
      "meetingLink": "https://zoom.us/j/123456",
      "startTime": "2026-04-13T09:00:00.000Z",
      "endTime": "2026-04-13T10:30:00.000Z"
    }
  ]
}
```

### Response — `201 Created`

Array of created lecture objects.

---

## 3. List Lectures (Paginated)

### `GET /institute-class-lectures`

Returns a paginated list of lectures with filtering support.

### Query Parameters

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `page` | number | 1 | Page number |
| `limit` | number | 10 | Results per page |
| `instituteId` | string | — | Filter by institute |
| `classId` | string | — | Filter by class |
| `instructorId` | string | — | Filter by instructor/teacher |
| `lectureType` | string | — | Filter: `online`, `physical`, `hybrid` |
| `status` | string | — | Filter: `scheduled`, `ongoing`, `completed`, `cancelled` |
| `dateFrom` | string | — | Start date filter (YYYY-MM-DD) |
| `dateTo` | string | — | End date filter (YYYY-MM-DD) |
| `isActive` | boolean | — | Filter by active status |
| `search` | string | — | Search in title/description |

### Example

```
GET /institute-class-lectures?instituteId=109&classId=1004&page=1&limit=20
```

### Response — `200 OK`

```json
{
  "data": [
    {
      "id": "123",
      "instituteId": "109",
      "classId": "1004",
      "instructorId": "42",
      "title": "Introduction to Class Orientation",
      "lectureType": "physical",
      "venue": "Room 101",
      "subject": "Mathematics",
      "startTime": "2026-04-12T09:00:00.000Z",
      "endTime": "2026-04-12T10:30:00.000Z",
      "status": "scheduled",
      "isActive": true,
      "thumbnailUrl": "https://storage.suraksha.lk/lecture-thumbnails/abc123.jpg",
      "materials": [
        {
          "documentName": "Notes",
          "documentUrl": "https://storage.suraksha.lk/materials/chapter1.pdf",
          "source": "S3"
        }
      ],
      "recordingUrl": null,
      "isRecorded": false,
      "createdAt": "2026-04-11T08:00:00.000Z",
      "updatedAt": "2026-04-11T08:00:00.000Z"
    }
  ],
  "page": 1,
  "limit": 20,
  "total": 1
}
```

> **Note:** `thumbnailUrl` and `materials[].documentUrl` (S3 source) are automatically converted to full URLs in the response.

---

## 4. Get Lecture by ID

### `GET /institute-class-lectures/:id`

### Response — `200 OK`

Full lecture object (same shape as list items above).

### Error — `404 Not Found`

```json
{
  "statusCode": 404,
  "message": "Lecture with ID 999 not found"
}
```

---

## 5. Get Lecture with Full Details

### `GET /institute-class-lectures/:id/details`

Returns the lecture with fully hydrated relations (institute, class, instructor entities).

### Response — `200 OK`

```json
{
  "id": "123",
  "instituteId": "109",
  "classId": "1004",
  "instructorId": "42",
  "title": "Introduction to Class Orientation",
  "institute": { "id": "109", "name": "Sample Institute" },
  "class": { "id": "1004", "name": "Grade 10 A", "grade": 10 },
  "instructor": { "id": "42", "firstName": "John", "lastName": "Doe", "email": "john@example.com" },
  "lectureType": "physical",
  "venue": "Room 101",
  "subject": "Mathematics",
  "startTime": "2026-04-12T09:00:00.000Z",
  "endTime": "2026-04-12T10:30:00.000Z",
  "status": "scheduled",
  "isActive": true,
  "thumbnailUrl": "https://storage.suraksha.lk/lecture-thumbnails/abc123.jpg",
  "materials": [
    {
      "documentName": "Chapter 1 Notes",
      "documentUrl": "https://storage.suraksha.lk/materials/chapter1.pdf",
      "source": "S3"
    },
    {
      "documentName": "Reference Video",
      "documentUrl": "https://youtube.com/watch?v=abc",
      "source": "EXTERNAL_LINK"
    },
    {
      "documentName": "Shared Doc",
      "documentUrl": "https://docs.google.com/document/d/xyz",
      "driveFileId": "xyz123",
      "driveWebViewLink": "https://docs.google.com/document/d/xyz",
      "source": "GOOGLE_DRIVE"
    }
  ],
  "recordingUrl": "https://storage.suraksha.lk/recordings/lecture-123.mp4",
  "isRecorded": true,
  "maxParticipants": 50,
  "createdAt": "2026-04-11T08:00:00.000Z",
  "updatedAt": "2026-04-11T08:00:00.000Z"
}
```

### Hydrated Relations

| Relation | Fields Included |
|----------|----------------|
| `institute` | `id`, `name` |
| `class` | `id`, `name`, `grade` |
| `instructor` | `id`, `firstName`, `lastName`, `email` |

> Use this endpoint when you need to display institute name, class name, or instructor details alongside the lecture. All S3 paths (`thumbnailUrl`, `materials[].documentUrl`, `recordingUrl`) are auto-converted to full CDN URLs.

---

## 6. Get Lectures by Class

### `GET /institute-class-lectures/class/:classId`

Returns all lectures for a specific class.

### Parameters

| Param | Location | Description |
|-------|----------|-------------|
| `classId` | URL path | Class ID |
| `instituteId` | Query (optional) | Filter by institute |

### Example

```
GET /institute-class-lectures/class/1004?instituteId=109
```

### Response — `200 OK`

Array of lecture objects.

---

## 7. Get Lectures by Institute

### `GET /institute-class-lectures/institute/:instituteId`

Returns all class lectures for an institute.

### Example

```
GET /institute-class-lectures/institute/109
```

### Response — `200 OK`

Array of lecture objects.

---

## 8. Get Upcoming Lectures

### `GET /institute-class-lectures/upcoming/:classId`

Returns future scheduled lectures for a class, ordered by start time ascending.

### Parameters

| Param | Location | Description |
|-------|----------|-------------|
| `classId` | URL path | Class ID |
| `instituteId` | Query (optional) | Filter by institute |
| `limit` | Query (optional) | Max results to return |

### Example

```
GET /institute-class-lectures/upcoming/1004?instituteId=109&limit=5
```

### Response — `200 OK`

Array of upcoming lecture objects.

---

## 9. Get Ongoing Lectures

### `GET /institute-class-lectures/ongoing/:classId`

Returns currently active/ongoing lectures for a class.

### Parameters

| Param | Location | Description |
|-------|----------|-------------|
| `classId` | URL path | Class ID |
| `instituteId` | Query (optional) | Filter by institute |

### Response — `200 OK`

Array of ongoing lecture objects.

---

## 10. Get Completed Lectures

### `GET /institute-class-lectures/completed/:classId`

Returns completed lectures for a class, ordered by start time descending.

### Parameters

| Param | Location | Description |
|-------|----------|-------------|
| `classId` | URL path | Class ID |
| `instituteId` | Query (optional) | Filter by institute |
| `limit` | Query (optional) | Max results to return |

### Response — `200 OK`

Array of completed lecture objects.

---

## 11. Get Schedule by Date

### `GET /institute-class-lectures/schedule/:date`

Returns all lectures scheduled for a specific date, ordered by start time.

### Parameters

| Param | Location | Description |
|-------|----------|-------------|
| `date` | URL path | Date in `YYYY-MM-DD` format |
| `instituteId` | Query (optional) | Filter by institute |
| `classId` | Query (optional) | Filter by class |
| `instructorId` | Query (optional) | Filter by instructor |
| `status` | Query (optional) | Filter by status |
| `lectureType` | Query (optional) | Filter by lecture type |

### Example

```
GET /institute-class-lectures/schedule/2026-04-12?instituteId=109&classId=1004
```

### Response — `200 OK`

Array of lecture objects for that date.

---

## 12. Update Lecture (Single API — Full Details + Thumbnail + Materials)

### `PATCH /institute-class-lectures/:id`

**One API to update everything.** Send only the fields you want to change. This single endpoint handles:

- ✅ All lecture details (title, description, venue, times, etc.)
- ✅ Thumbnail update (set, change, or remove)
- ✅ Materials / references update (add, remove, or replace)
- ✅ Status change
- ✅ Reschedule (startTime + endTime)
- ✅ Toggle active/inactive

> **No need for separate status, reschedule, or thumbnail APIs — this one endpoint does it all.**

### Request Body (All Fields Optional)

| Field | Type | Description |
|-------|------|-------------|
| `title` | string | Lecture title (3–255 chars) |
| `description` | string \| null | Description (max 5000 chars). Send `null` to clear |
| `lectureType` | enum | `online`, `physical`, `hybrid` |
| `venue` | string \| null | Physical venue. Send `null` to clear |
| `subject` | string \| null | Subject name (free-text). Send `null` to clear |
| `startTime` | ISO string | Start time — use this to reschedule |
| `endTime` | ISO string | End time — use this to reschedule |
| `status` | enum | `scheduled`, `ongoing`, `completed`, `cancelled` |
| `meetingLink` | string \| null | Online meeting link. Send `null` to clear |
| `meetingId` | string \| null | Meeting ID. Send `null` to clear |
| `meetingPassword` | string \| null | Meeting password. Send `null` to clear |
| `recordingUrl` | string \| null | Recording URL. Send `null` to clear |
| `isRecorded` | boolean | Whether lecture is recorded |
| `maxParticipants` | number | Max participants (1–10000) |
| `isActive` | boolean | Active status |
| `thumbnailUrl` | string \| null | **Thumbnail S3 path. Send `null` to remove thumbnail** |
| `materials` | array | **Full materials array. Replaces all existing materials** |

### Example — Update Details + Thumbnail + Materials (All at Once)

```json
PATCH /institute-class-lectures/123

{
  "title": "Updated Lecture Title",
  "description": "New description for the lecture",
  "venue": "Room 202",
  "status": "ongoing",
  "startTime": "2026-04-15T14:00:00.000Z",
  "endTime": "2026-04-15T15:30:00.000Z",
  "thumbnailUrl": "lecture-thumbnails/new-thumb-456.jpg",
  "materials": [
    {
      "documentName": "Updated Chapter Notes",
      "documentUrl": "materials/updated-chapter.pdf",
      "source": "S3"
    },
    {
      "documentName": "Reference Video",
      "documentUrl": "https://youtube.com/watch?v=abc",
      "source": "EXTERNAL_LINK"
    }
  ]
}
```

### Example — Update Only Thumbnail

```json
PATCH /institute-class-lectures/123

{
  "thumbnailUrl": "lecture-thumbnails/new-thumbnail.jpg"
}
```

### Example — Remove Thumbnail

```json
PATCH /institute-class-lectures/123

{
  "thumbnailUrl": null
}
```

### Example — Update Only Status

```json
PATCH /institute-class-lectures/123

{
  "status": "completed"
}
```

### Example — Reschedule Only

```json
PATCH /institute-class-lectures/123

{
  "startTime": "2026-04-20T10:00:00.000Z",
  "endTime": "2026-04-20T11:30:00.000Z"
}
```

### Example — Update Only Materials / References

```json
PATCH /institute-class-lectures/123

{
  "materials": [
    {
      "documentName": "Lecture Slides",
      "documentUrl": "materials/slides.pdf",
      "source": "S3"
    },
    {
      "documentName": "Practice Sheet",
      "documentUrl": "https://docs.google.com/document/d/abc",
      "driveFileId": "abc123",
      "driveWebViewLink": "https://docs.google.com/document/d/abc",
      "source": "GOOGLE_DRIVE"
    },
    {
      "documentName": "YouTube Reference",
      "documentUrl": "https://youtube.com/watch?v=xyz",
      "source": "EXTERNAL_LINK"
    }
  ]
}
```

### Example — Add Recording URL

```json
PATCH /institute-class-lectures/123

{
  "recordingUrl": "https://storage.suraksha.lk/recordings/lecture-123.mp4",
  "isRecorded": true
}
```

### Response — `200 OK`

Returns the fully updated lecture object with resolved URLs:

```json
{
  "id": "123",
  "instituteId": "109",
  "classId": "1004",
  "instructorId": "42",
  "title": "Updated Lecture Title",
  "description": "New description for the lecture",
  "lectureType": "physical",
  "venue": "Room 202",
  "subject": "Mathematics",
  "startTime": "2026-04-15T14:00:00.000Z",
  "endTime": "2026-04-15T15:30:00.000Z",
  "status": "ongoing",
  "meetingLink": null,
  "meetingId": null,
  "recordingUrl": null,
  "isRecorded": false,
  "maxParticipants": 50,
  "isActive": true,
  "thumbnailUrl": "https://storage.suraksha.lk/lecture-thumbnails/new-thumb-456.jpg",
  "materials": [
    {
      "documentName": "Updated Chapter Notes",
      "documentUrl": "https://storage.suraksha.lk/materials/updated-chapter.pdf",
      "source": "S3"
    },
    {
      "documentName": "Reference Video",
      "documentUrl": "https://youtube.com/watch?v=abc",
      "source": "EXTERNAL_LINK"
    }
  ],
  "createdAt": "2026-04-11T08:00:00.000Z",
  "updatedAt": "2026-04-15T14:00:00.000Z"
}
```

### Important Rules

| Rule | Detail |
|------|--------|
| **Partial update** | Only send the fields you want to change — unchanged fields stay as-is |
| **Thumbnail set** | Send `thumbnailUrl: "lecture-thumbnails/xxx.jpg"` (S3 relative path from upload) |
| **Thumbnail remove** | Send `thumbnailUrl: null` to clear the thumbnail |
| **Materials replace** | Sending `materials` **replaces the entire array**. Include all materials you want to keep |
| **Materials clear** | Send `materials: []` to remove all materials |
| **Status change** | Just send `{ "status": "completed" }` — no separate API needed |
| **Reschedule** | Just send `{ "startTime": "...", "endTime": "..." }` — no separate API needed |
| **URL transform** | S3 paths in response are auto-converted to full `https://storage.suraksha.lk/...` URLs |

---

## 13. Delete Lecture (Soft)

### `DELETE /institute-class-lectures/:id`

**Super Admin only.** Removes the lecture record.

### Response — `204 No Content`

---

## 14. Permanently Delete Lecture

### `DELETE /institute-class-lectures/:id/permanent`

**Super Admin or Institute Admin.** Permanently deletes the lecture from the database. Cannot be undone.

### Response — `200 OK`

```json
{
  "success": true,
  "message": "Lecture permanently deleted successfully",
  "lectureId": "123",
  "instituteId": "109"
}
```

---

## Thumbnail Upload Flow

### Step 1 — Get Signed Upload URL

```
GET /upload/get-signed-url?folder=lecture-thumbnails&fileName=photo.jpg&contentType=image/jpeg&fileSize=102400
Authorization: Bearer <token>
```

**Response:**

```json
{
  "success": true,
  "uploadUrl": "https://s3-bucket-url...",
  "relativePath": "lecture-thumbnails/abc123.jpg",
  "fields": {
    "key": "lecture-thumbnails/abc123.jpg",
    "Content-Type": "image/jpeg",
    "X-Amz-Algorithm": "...",
    "X-Amz-Credential": "...",
    "Policy": "...",
    "X-Amz-Signature": "..."
  }
}
```

### Step 2 — Upload to S3

```
POST <uploadUrl>
Content-Type: multipart/form-data

// Add ALL fields from Step 1 response FIRST
// Then add the file as 'file' field LAST
```

### Step 3 — Verify and Publish

```
POST /upload/verify-and-publish
Authorization: Bearer <token>
Content-Type: application/json

{
  "relativePath": "lecture-thumbnails/abc123.jpg"
}
```

### Step 4 — Send Relative Path in Update

Use the same `PATCH /:id` endpoint:

```json
PATCH /institute-class-lectures/123

{
  "thumbnailUrl": "lecture-thumbnails/abc123.jpg"
}
```

### Thumbnail Display

The API returns full CDN URLs in responses:

```
Stored in DB:    lecture-thumbnails/abc123.jpg
Returned by API: https://storage.suraksha.lk/lecture-thumbnails/abc123.jpg
```

Frontend fallback with `getImageUrl()`:

```typescript
import { getImageUrl } from '@/utils/imageUrlHelper';

const thumbnailSrc = lecture.thumbnailUrl ? getImageUrl(lecture.thumbnailUrl) : '';
```

---

## Materials Object

Each item in the `materials` array:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `documentName` | string | Yes | Display name |
| `documentUrl` | string | Yes | URL or S3 relative path |
| `driveFileId` | string | No | Google Drive file ID |
| `driveWebViewLink` | string | No | Google Drive web view link |
| `source` | string | No | `S3`, `GOOGLE_DRIVE`, `GOOGLE_DRIVE_INSTITUTE`, `EXTERNAL_LINK` |

> S3-sourced materials are automatically converted to full URLs in responses.

---

## Status Values

| Status | Description |
|--------|-------------|
| `scheduled` | Lecture is planned for the future |
| `ongoing` | Lecture is currently in progress |
| `completed` | Lecture has finished |
| `cancelled` | Lecture was cancelled |

---

## Error Responses

| Status | Body | When |
|--------|------|------|
| `400` | `{ "statusCode": 400, "message": "Validation failed", "errors": [...] }` | Invalid request body |
| `401` | `{ "statusCode": 401, "message": "Unauthorized" }` | Missing or invalid JWT |
| `403` | `{ "statusCode": 403, "message": "Forbidden" }` | Insufficient role/permissions |
| `404` | `{ "statusCode": 404, "message": "Lecture with ID 999 not found" }` | Lecture not found |

---

## Key Differences from `institute-class-subject-lectures`

| Feature | `institute-class-lectures` | `institute-class-subject-lectures` |
|---------|---------------------------|-------------------------------------|
| **Scope** | Class-level (all members) | Subject-level (subject students only) |
| **Subject** | Free-text field (display only) | FK reference to Subject entity |
| **Update** | Single `PATCH /:id` for everything | Single `PATCH /:id` for everything |
| **Status values** | `scheduled`, `ongoing`, `completed`, `cancelled` | `scheduled`, `live`, `completed`, `cancelled` |
| **Details endpoint** | `/:id/details` with institute/class/instructor | N/A |
| **DB table** | `institute_class_lectures` | `institute_class_subject_lectures` |
