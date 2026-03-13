# Structured Lectures — Admin Frontend Guide

For institute admins, teachers, and superadmins managing structured lecture content.

---

## How lectures are organised

Lectures exist at the **institute level**, scoped to a **subject** and optionally a **grade**. There is no per-class segmentation — every student in the institute who studies a subject sees the same lectures for that subject.

```
Institute 109
  └── Subject: Mathematics (SUBJ_MATH_001)
        ├── Grade 9  → Lectures 1-8
        └── Grade 10 → Lectures 1-12
```

---

## Authentication

```
Authorization: Bearer <admin-jwt-token>
```

Write operations require role: `SUPERADMIN`, `instituteAdmin`, or `teacher`.

---

## Step 1 — Upload files first (when needed)

Before attaching videos, cover images, or documents, upload them to GCS.

### Get a signed upload URL

```
POST /api/signed-urls/lecture
Authorization: Bearer <token>
Content-Type: application/json

{
  "fileName": "chapter1-notes.pdf",
  "fileType": "application/pdf"
}
```

Response:
```json
{
  "signedUrl": "https://storage.googleapis.com/...",
  "publicUrl": "https://storage.googleapis.com/bucket/lectures/chapter1-notes.pdf"
}
```

### Upload the file

```http
PUT <signedUrl>
Content-Type: application/pdf

<binary file data>
```

Use the returned `publicUrl` as `lectureLink`, `coverImageUrl`, or inside `documents[].documentUrl`.

---

## 2. Create a lecture

```
POST /api/structured-lectures
Authorization: Bearer <token>
Content-Type: application/json
```

### Body fields

| Field | Type | Required | Notes |
|---|---|---|---|
| `instituteId` | string | **Yes** | Institute the lecture belongs to |
| `subjectId` | string | **Yes** | Subject UUID |
| `grade` | number | **Yes** | Grade level 1–13 |
| `title` | string | **Yes** | Lecture title |
| `description` | string | No | Full description |
| `lessonNumber` | number | No | Lesson grouping (e.g. 1, 2, 3) |
| `lectureNumber` | number | No | Order within the lesson |
| `provider` | string | No | Instructor or platform name |
| `lectureLink` | string | No | Video URL (YouTube link, GCS publicUrl, etc.) |
| `coverImageUrl` | string | No | Thumbnail URL from signed upload |
| `documents` | array | No | See documents format below |
| `isActive` | boolean | No | Default: `true` |

### Documents format

```json
"documents": [
  {
    "documentUrl": "https://storage.googleapis.com/...",
    "documentName": "Chapter 1 Notes",
    "documentDescription": "Summary of chapter 1"
  }
]
```

### Example request

```json
{
  "instituteId": "109",
  "subjectId": "SUBJ_MATH_001",
  "grade": 10,
  "title": "Introduction to Algebra",
  "description": "Covers variables, equations, and expressions",
  "lessonNumber": 1,
  "lectureNumber": 1,
  "provider": "Dr. Smith",
  "lectureLink": "https://youtube.com/watch?v=abc123",
  "coverImageUrl": "https://storage.googleapis.com/bucket/covers/algebra.jpg",
  "documents": [
    {
      "documentUrl": "https://storage.googleapis.com/bucket/docs/algebra-notes.pdf",
      "documentName": "Algebra Notes"
    }
  ]
}
```

### Response

```json
{
  "success": true,
  "message": "Structured lecture created successfully",
  "data": {
    "_id": "550e8400-e29b-41d4-a716-446655440000",
    "instituteId": "109",
    "subjectId": "SUBJ_MATH_001",
    "grade": 10,
    "title": "Introduction to Algebra",
    "lessonNumber": 1,
    "lectureNumber": 1,
    "provider": "Dr. Smith",
    "lectureLink": "https://youtube.com/watch?v=abc123",
    "coverImageUrl": "https://storage.googleapis.com/...",
    "documents": [...],
    "isActive": true,
    "createdAt": "2026-07-01T08:00:00.000Z",
    "updatedAt": "2026-07-01T08:00:00.000Z",
    "createdBy": "user-uuid"
  }
}
```

---

## 3. List / search / filter lectures

```
GET /api/structured-lectures
Authorization: Bearer <token>
```

### Query parameters

| Param | Type | Notes |
|---|---|---|
| `instituteId` | string | **Recommended** — filter by institute |
| `subjectId` | string | Filter by subject |
| `grade` | number | Filter by grade |
| `isActive` | boolean | `true` / `false` (non-SUPERADMIN always gets `true`) |
| `search` | string | Full-text search on title |
| `page` | number | Default: 1 |
| `limit` | number | Default: 20 |
| `sortBy` | string | `createdAt` \| `updatedAt` \| `title` |
| `sortOrder` | `ASC` \| `DESC` | Default: DESC |

### Example

```
GET /api/structured-lectures?instituteId=109&subjectId=SUBJ_MATH_001&grade=10&page=1&limit=20&sortBy=createdAt&sortOrder=ASC
```

### Response

```json
{
  "lectures": [ ...LectureResponseDto array... ],
  "total": 12,
  "totalPages": 1,
  "currentPage": 1,
  "limit": 20
}
```

---

## 4. Get lectures by institute + subject (student-facing endpoint)

Also available to admins — this is what students call:

```
GET /api/structured-lectures/institute/:instituteId/subject/:subjectId?grade=10
Authorization: Bearer <token>
```

---

## 5. Get a single lecture

```
GET /api/structured-lectures/:id
Authorization: Bearer <token>
```

---

## 6. Update a lecture

Send only the fields that changed:

```
PUT /api/structured-lectures/:id
Authorization: Bearer <token>
Content-Type: application/json
```

```json
{
  "title": "Updated Title",
  "lectureLink": "https://youtube.com/watch?v=newvideo",
  "isActive": true
}
```

To replace documents, send the full new array:

```json
{ "documents": [{ "documentUrl": "https://...", "documentName": "Revised Notes" }] }
```

Response: `{ "success": true, "message": "Lecture updated successfully", "data": LectureResponseDto }`

---

## 7. Soft-delete a lecture (hide from students)

Sets `isActive = false`. Preserved in DB, invisible to students.

```
DELETE /api/structured-lectures/:id
Authorization: Bearer <token>
```

Response: `{ "success": true }`

**To restore:** `PUT /api/structured-lectures/:id` with `{ "isActive": true }`

---

## 8. Permanently delete — SUPERADMIN only

Irreversible. Use with caution.

```
DELETE /api/structured-lectures/:id/permanent
Authorization: Bearer <superadmin-token>
```

---

## 9. Statistics

```
GET /api/structured-lectures/statistics/:subjectId?grade=10
Authorization: Bearer <token>
```

Response:
```json
{
  "total": 12
}
```

---

## TypeScript service examples

```typescript
const BASE = '/api/structured-lectures';

interface CreateLecturePayload {
  instituteId: string;
  subjectId: string;
  grade: number;
  title: string;
  description?: string;
  lessonNumber?: number;
  lectureNumber?: number;
  provider?: string;
  lectureLink?: string;
  coverImageUrl?: string;
  documents?: { documentUrl: string; documentName?: string; documentDescription?: string }[];
  isActive?: boolean;
}

async function createLecture(payload: CreateLecturePayload, token: string) {
  const res = await fetch(BASE, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error((await res.json()).message);
  return res.json();
}

async function updateLecture(id: string, patch: Partial<CreateLecturePayload>, token: string) {
  const res = await fetch(`${BASE}/${id}`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });
  if (!res.ok) throw new Error((await res.json()).message);
  return res.json();
}

async function softDeleteLecture(id: string, token: string) {
  const res = await fetch(`${BASE}/${id}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error((await res.json()).message);
  return res.json();
}

const restoreLecture = (id: string, token: string) =>
  updateLecture(id, { isActive: true }, token);

// Upload helper — get signed URL then PUT file to GCS
async function uploadLectureFile(file: File, token: string): Promise<string> {
  const signedRes = await fetch('/api/signed-urls/lecture', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ fileName: file.name, fileType: file.type }),
  });
  const { signedUrl, publicUrl } = await signedRes.json();
  await fetch(signedUrl, { method: 'PUT', body: file, headers: { 'Content-Type': file.type } });
  return publicUrl; // use in createLecture / updateLecture payload
}
```

---

## Admin UI workflow

### Create lecture

1. Admin selects institute, subject, grade
2. Fills title, description, lesson/lecture numbers
3. If uploading files: call `uploadLectureFile()` per file → collect `publicUrl` values
4. Call `createLecture()` — lecture is immediately visible to all students in that institute for that subject+grade

### Edit lecture

1. Fetch with `GET /api/structured-lectures/:id`
2. Pre-fill form
3. On file change: upload new file → replace URL in form state
4. On save: call `updateLecture()` with only changed fields

### Hide / restore

- Hide: `softDeleteLecture(id)` → students can no longer see it
- Restore: `restoreLecture(id)` → students see it again

### Key design point

> There is **no class selection** when creating a lecture. One lecture created for `institute 109 / Mathematics / Grade 10` is seen by **all Grade 10 Maths students** across every class in that institute.

---

## Database schema (for reference)

```
structured_lectures
  id              UUID PK
  institute_id    BIGINT (FK → institutes)
  subjectId       VARCHAR(36)
  grade           INT
  title           VARCHAR(255)
  description     TEXT
  videoUrl        VARCHAR(500)   ← maps to lectureLink in responses
  thumbnailUrl    VARCHAR(500)   ← maps to coverImageUrl in responses
  attachments     JSON           ← maps to documents[] in responses
  lessonNumber    INT
  lectureNumber   INT
  provider        VARCHAR(255)
  isActive        BOOLEAN
  createdBy       VARCHAR(36)
  updatedBy       VARCHAR(36)
  createdAt       DATETIME
  updatedAt       DATETIME

Indexes:
  idx_lecture_institute_subject        (institute_id, subjectId)
  idx_lecture_institute_subject_grade  (institute_id, subjectId, grade)
  idx_lecture_subject_grade            (subjectId, grade)
  idx_lecture_active                   (isActive)
```
