# Structured Lectures - Admin Frontend Guide

For institute admins, teachers, and superadmins managing lecture content.

---

## Lecture scopes — The key concept

Every lecture belongs to either:

| Scope | How to create | Who can see it |
|---|---|---|
| **Institute-wide** | Omit `classId` (or send `null`) | All students in the institute with that subject+grade |
| **Class-restricted** | Include `classId` | Only students in that specific class |

This lets admins create a shared library for all classes **and** override with class-specific content.

---

## Authentication

All endpoints require:
```
Authorization: Bearer <admin-jwt-token>
```

Roles allowed for write operations: `SUPERADMIN`, `instituteAdmin`, `teacher`

---

## Step 1 — Upload files first (if needed)

Before creating a lecture with a video, cover image, or documents, upload files to GCS.

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

Use the `publicUrl` from the response as `lectureLink`, `coverImageUrl`, or inside `documents[].documentUrl` when creating/updating the lecture.

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
| `classId` | number | No | Omit or null → institute-wide |
| `subjectId` | string | **Yes** | Subject UUID |
| `grade` | number | **Yes** | 1–13 |
| `title` | string | **Yes** | Lecture title |
| `description` | string | No | Full description |
| `lessonNumber` | number | No | Grouping number (e.g. 1, 2, 3) |
| `lectureNumber` | number | No | Order within lesson |
| `provider` | string | No | e.g. "YouTube", "Vimeo", "GCS" |
| `lectureLink` | string | No | Video URL (YouTube link, GCS `publicUrl`) |
| `coverImageUrl` | string | No | Thumbnail URL from signed upload |
| `documents` | array | No | See documents format below |
| `isActive` | boolean | No | Default: true |

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

### Example — institute-wide lecture

```json
{
  "instituteId": "109",
  "subjectId": "SUBJ_TAMIL_001",
  "grade": 10,
  "title": "Tamil Grammar — Nouns",
  "description": "Introduction to Tamil noun forms",
  "lessonNumber": 1,
  "lectureNumber": 1,
  "provider": "YouTube",
  "lectureLink": "https://youtube.com/watch?v=abc123",
  "coverImageUrl": "https://storage.googleapis.com/bucket/covers/tamil-nouns.jpg",
  "documents": [
    {
      "documentUrl": "https://storage.googleapis.com/bucket/docs/nouns.pdf",
      "documentName": "Noun Reference Sheet"
    }
  ]
}
```

### Example — class-restricted lecture

```json
{
  "instituteId": "109",
  "classId": 450,
  "subjectId": "SUBJ_TAMIL_001",
  "grade": 10,
  "title": "Tamil Grammar — Class 10A Extra Practice",
  "lessonNumber": 1,
  "lectureNumber": 2
}
```

### Response

```json
{
  "_id": "550e8400-e29b-41d4-a716-446655440000",
  "instituteId": "109",
  "classId": null,
  "subjectId": "SUBJ_TAMIL_001",
  "grade": 10,
  "title": "Tamil Grammar — Nouns",
  "description": "Introduction to Tamil noun forms",
  "lessonNumber": 1,
  "lectureNumber": 1,
  "provider": "YouTube",
  "lectureLink": "https://youtube.com/watch?v=abc123",
  "coverImageUrl": "https://storage.googleapis.com/...",
  "documents": [...],
  "isActive": true,
  "createdAt": "2026-07-01T08:00:00.000Z",
  "updatedAt": "2026-07-01T08:00:00.000Z",
  "createdBy": 42
}
```

---

## 3. List / search lectures

```
GET /api/structured-lectures
Authorization: Bearer <token>
```

### Query parameters

| Param | Type | Notes |
|---|---|---|
| `instituteId` | string | Filter by institute |
| `classId` | number | Filter by class |
| `subjectId` | string | Filter by subject |
| `grade` | number | Filter by grade |
| `isActive` | boolean | `true` / `false` (non-superadmin always forced to `true`) |
| `search` | string | Full-text search on title |
| `page` | number | Default: 1 |
| `limit` | number | Default: 20 |
| `sortBy` | string | Field to sort by (e.g. `lessonNumber`, `createdAt`) |
| `sortOrder` | `ASC` \| `DESC` | Default: DESC |

### Example

```
GET /api/structured-lectures?instituteId=109&subjectId=SUBJ_TAMIL_001&grade=10&page=1&limit=20&sortBy=lessonNumber&sortOrder=ASC
```

### Response

```json
{
  "lectures": [ ...LectureResponseDto array... ],
  "total": 45,
  "totalPages": 3,
  "currentPage": 1,
  "limit": 20
}
```

---

## 4. Get a single lecture

```
GET /api/structured-lectures/:id
Authorization: Bearer <token>
```

Response: single `LectureResponseDto`

---

## 5. Update a lecture

Only provided fields are updated (partial update).

```
PUT /api/structured-lectures/:id
Authorization: Bearer <token>
Content-Type: application/json
```

All fields are optional. Send only what changes:

```json
{
  "title": "Updated Title",
  "lectureLink": "https://youtube.com/watch?v=newvideo",
  "isActive": true
}
```

To add/replace documents, send the full new documents array:

```json
{
  "documents": [
    { "documentUrl": "https://...", "documentName": "Revised Notes" }
  ]
}
```

Response: updated `LectureResponseDto`

---

## 6. Soft-delete a lecture (hide from students)

Sets `isActive = false`. Lecture is preserved in the database but hidden.

```
DELETE /api/structured-lectures/:id
Authorization: Bearer <token>
```

Response: `{ "message": "Lecture deleted successfully" }`

To restore it: `PUT /api/structured-lectures/:id` with `{ "isActive": true }`

---

## 7. Permanently delete a lecture — SUPERADMIN only

Removes the record entirely. Irreversible.

```
DELETE /api/structured-lectures/:id/permanent
Authorization: Bearer <superadmin-token>
```

Response: `{ "message": "Lecture permanently deleted" }`

---

## 8. Statistics

```
GET /api/structured-lectures/statistics/:subjectId
Authorization: Bearer <token>
```

Query params:
  `grade` — number, optional

Example:
  `GET /api/structured-lectures/statistics/SUBJ_TAMIL_001?grade=10`

Response:
```json
{
  "totalLectures": 12,
  "activeLectures": 10,
  "inactiveLectures": 2,
  "lecturesByGrade": {
    "10": 12
  }
}
```

---

## TypeScript service examples

```typescript
const BASE = '/api/structured-lectures';

interface CreateLecturePayload {
  instituteId: string;
  classId?: number;
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

async function restoreLecture(id: string, token: string) {
  return updateLecture(id, { isActive: true }, token);
}

// Upload helper — get signed URL then PUT file
async function uploadLectureFile(file: File, token: string): Promise<string> {
  const signedRes = await fetch('/api/signed-urls/lecture', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ fileName: file.name, fileType: file.type }),
  });
  const { signedUrl, publicUrl } = await signedRes.json();
  await fetch(signedUrl, { method: 'PUT', body: file, headers: { 'Content-Type': file.type } });
  return publicUrl; // use this in createLecture payload
}
```

---

## Admin UI workflow

### Create lecture flow

1. Admin fills form — institute, subject, grade, title, etc.
2. If uploading a video file or PDF: call `uploadLectureFile()` for each file and collect the returned `publicUrl` values
3. Call `createLecture()` with the collected URLs
4. Show the lecture in the list

### Edit flow

1. Fetch lecture with `GET /api/structured-lectures/:id`
2. Pre-fill form fields
3. On file change: upload new file → replace URL in form state
4. On save: call `updateLecture()` with only changed fields

### Toggle visibility

- "Hide" button → `softDeleteLecture(id)` → refresh list (lecture disappears from student view)
- "Restore" button → `restoreLecture(id)` → refresh list

### Manage class vs institute-wide

When the admin selects "All classes" in the class picker → send `classId: null` (omit the field)  
When the admin selects a specific class → send `classId: <classId>`

---

## Pending database migrations

These migrations must run before the endpoints work in production:

| Migration file | Purpose |
|---|---|
| `1751200000000-AddBankTransferPaymentType` | Adds `BANK_TRANSFER` to `card_payments.payment_type` ENUM |
| `1751300000000-SafeAddClassIdToStructuredLectures` | Adds `class_id` column + indexes to `structured_lectures` table |

Run with:
```bash
npm run migration:run
```
