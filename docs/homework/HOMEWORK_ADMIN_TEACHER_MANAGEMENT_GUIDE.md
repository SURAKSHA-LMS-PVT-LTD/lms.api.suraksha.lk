# Homework Management — Institute Admin & Teacher Guide

This guide covers every API an **institute admin** or **teacher** needs to create, update, delete, and manage homework assignments and their reference materials.

> **Auth**: All endpoints require `Authorization: Bearer <jwt>`. Access is restricted to `instituteAdmin`, `teacher`, and `SUPERADMIN` roles unless noted.

---

## Endpoint Overview

### Homework CRUD

| Method | Route | Who can use |
|--------|-------|-------------|
| `POST` | `/api/institute-class-subject-homeworks` | Admin, Teacher |
| `PATCH` | `/api/institute-class-subject-homeworks/:id` | Admin, Teacher |
| `DELETE` | `/api/institute-class-subject-homeworks/:id` | Admin, Teacher |
| `GET` | `/api/institute-class-subject-homeworks` | Admin, Teacher |
| `GET` | `/api/institute-class-subject-homeworks/:id` | Admin, Teacher |
| `GET` | `/api/institute-class-subject-homeworks/institute/:instituteId` | Admin, Teacher |
| `GET` | `/api/institute-class-subject-homeworks/teacher/:teacherId` | Admin, Teacher |
| `GET` | `/api/institute-class-subject-homeworks/class/:classId/subject/:subjectId` | Admin, Teacher |

### Reference Material CRUD

| Method | Route | Who can use |
|--------|-------|-------------|
| `POST` | `/api/homework-references/upload/generate-url` | Admin, Teacher |
| `POST` | `/api/homework-references/upload/confirm` | Admin, Teacher |
| `POST` | `/api/homework-references/google-drive` | Admin, Teacher |
| `POST` | `/api/homework-references/link` | Admin, Teacher |
| `GET` | `/api/homework-references/homework/:homeworkId` | Admin, Teacher |
| `PATCH` | `/api/homework-references/:id` | Admin, Teacher |
| `PATCH` | `/api/homework-references/homework/:homeworkId/reorder` | Admin, Teacher |
| `DELETE` | `/api/homework-references/:id` | Admin, Teacher (soft delete) |
| `DELETE` | `/api/homework-references/:id/permanent` | Admin only (hard delete) |
| `DELETE` | `/api/homework-references/bulk` | Admin, Teacher |
| `PATCH` | `/api/homework-references/:id/restore` | Admin, Teacher |

---

## Part 1 — Homework CRUD

### 1.1 — Create homework

```
POST /api/institute-class-subject-homeworks
Authorization: Bearer <jwt>
Content-Type: application/json
```

#### Request body

```json
{
  "instituteId": "1",
  "classId": "40",
  "subjectId": "5",
  "teacherId": "22",
  "title": "Chapter 3 — Trigonometry Problems",
  "description": "Solve exercises 3.1 to 3.5 from the textbook.",
  "startDate": "2026-03-15",
  "endDate": "2026-03-22",
  "referenceLink": "https://example.com/trig-notes",
  "isActive": true
}
```

#### Body fields

| Field | Required | Type | Notes |
|---|---|---|---|
| `instituteId` | ✅ | string (bigint) | Institute the homework belongs to |
| `classId` | ✅ | string (bigint) | Target class |
| `subjectId` | ✅ | string (bigint) | Target subject |
| `teacherId` | ✅ | string (bigint) | Teacher creating the homework |
| `title` | ✅ | string (max 255) | Title of the homework |
| `description` | ❌ | string | Detailed instructions |
| `startDate` | ✅ | ISO date string | When students can start submitting |
| `endDate` | ❌ | ISO date string | Submission deadline |
| `referenceLink` | ❌ | URL string (max 255) | Simple external link (alternative to full reference materials) |
| `isActive` | ❌ | boolean | Defaults to `true` |

#### Response — 201 Created

```json
{
  "id": "88",
  "instituteId": "1",
  "classId": "40",
  "subjectId": "5",
  "teacherId": "22",
  "title": "Chapter 3 — Trigonometry Problems",
  "description": "Solve exercises 3.1 to 3.5 from the textbook.",
  "startDate": "2026-03-15T00:00:00.000Z",
  "endDate": "2026-03-22T00:00:00.000Z",
  "referenceLink": "https://example.com/trig-notes",
  "isActive": true,
  "teacher": {
    "id": "22",
    "nameWithInitials": "K.P. Silva",
    "imageUrl": "https://storage.googleapis.com/suraksha-lms/profile-images/teacher-22.jpg",
    "email": "kpsilva@institute.edu"
  },
  "references": [],
  "createdAt": "2026-03-14T10:00:00.000Z",
  "updatedAt": "2026-03-14T10:00:00.000Z"
}
```

#### React example — create form

```tsx
import { useState } from 'react';
import api from '../services/api';

interface CreateHomeworkForm {
  instituteId: string;
  classId: string;
  subjectId: string;
  teacherId: string;
  title: string;
  description: string;
  startDate: string;
  endDate: string;
  referenceLink: string;
}

export function CreateHomeworkPage({ instituteId, classId, subjectId, teacherId }) {
  const [form, setForm] = useState<CreateHomeworkForm>({
    instituteId, classId, subjectId, teacherId,
    title: '', description: '', startDate: '', endDate: '', referenceLink: '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const { data } = await api.post('/api/institute-class-subject-homeworks', form);
      alert(`Homework "${data.title}" created (ID: ${data.id})`);
      // navigate to homework detail page or clear form
    } catch (err: any) {
      setError(err.response?.data?.message ?? 'Failed to create homework');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <input
        placeholder="Title *"
        value={form.title}
        onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
        required
      />
      <textarea
        placeholder="Description"
        value={form.description}
        onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
      />
      <label>Start Date *</label>
      <input type="date" value={form.startDate}
        onChange={e => setForm(f => ({ ...f, startDate: e.target.value }))} required />
      <label>End Date (deadline)</label>
      <input type="date" value={form.endDate}
        onChange={e => setForm(f => ({ ...f, endDate: e.target.value }))} />
      <input
        placeholder="Reference link (optional)"
        value={form.referenceLink}
        onChange={e => setForm(f => ({ ...f, referenceLink: e.target.value }))}
      />
      {error && <p className="error">{error}</p>}
      <button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Create Homework'}</button>
    </form>
  );
}
```

---

### 1.2 — Update homework

All fields are **optional** — only send what you want to change.

```
PATCH /api/institute-class-subject-homeworks/:id
Authorization: Bearer <jwt>
Content-Type: application/json
```

Example — extend the deadline:

```json
{
  "endDate": "2026-03-29"
}
```

Example — rename and add description:

```json
{
  "title": "Chapter 3 — Trigonometry (Extended)",
  "description": "Solve exercises 3.1 to 3.8. Include working for each step."
}
```

#### Response — 200 OK

Same shape as create response, with updated `updatedAt`.

#### React example — edit form

```tsx
async function updateHomework(id: string, changes: Partial<CreateHomeworkForm>) {
  const { data } = await api.patch(`/api/institute-class-subject-homeworks/${id}`, changes);
  return data;
}

// Usage: extend deadline
await updateHomework('88', { endDate: '2026-03-29' });

// Usage: deactivate (hide from students without deleting)
await updateHomework('88', { isActive: false });
```

---

### 1.3 — Delete homework (soft delete)

**Soft delete** — sets `isActive: false`. Data is preserved for audit. Does **not** physically remove the record.

```
DELETE /api/institute-class-subject-homeworks/:id
Authorization: Bearer <jwt>
```

#### Response — 204 No Content

No body returned.

> To hide the homework from students without deleting, use `PATCH` with `{ "isActive": false }` instead. Use `DELETE` when you want a permanent soft-removal.

```tsx
async function deleteHomework(id: string) {
  await api.delete(`/api/institute-class-subject-homeworks/${id}`);
  // Remove from local state
  setHomeworks(prev => prev.filter(hw => hw.id !== id));
}
```

---

### 1.4 — List homeworks

#### By institute (admin view — all subjects)

```
GET /api/institute-class-subject-homeworks/institute/:instituteId?page=1&limit=20
Authorization: Bearer <jwt>
```

#### By teacher (teacher's own homeworks)

```
GET /api/institute-class-subject-homeworks/teacher/:teacherId?page=1&limit=20
Authorization: Bearer <jwt>
```

#### By class + subject

```
GET /api/institute-class-subject-homeworks/class/:classId/subject/:subjectId?page=1&limit=20
Authorization: Bearer <jwt>
```

#### Common query parameters

| Param | Type | Default | Description |
|---|---|---|---|
| `page` | number | `1` | Page number |
| `limit` | number | `10` (max 100) | Items per page |
| `sortBy` | string | `startDate` | `title` \| `startDate` \| `endDate` \| `createdAt` |
| `sortOrder` | `ASC` \| `DESC` | `DESC` | Sort direction |
| `search` | string | — | Full-text search in title + description |
| `fromDate` | YYYY-MM-DD | — | Filter from date |
| `toDate` | YYYY-MM-DD | — | Filter to date |
| `isActive` | boolean | `true` | Pass `false` to show deleted homeworks |
| `includeReferences` | boolean | `false` | Include attached reference materials |
| `includeSubmissions` | boolean | `false` | Include student submissions (filtered by JWT user) |

#### Response — 200 OK

```json
{
  "data": [
    {
      "id": "88",
      "title": "Chapter 3 — Trigonometry Problems",
      "description": "Solve exercises 3.1 to 3.5",
      "instituteId": "1",
      "classId": "40",
      "subjectId": "5",
      "teacherId": "22",
      "startDate": "2026-03-15T00:00:00.000Z",
      "endDate": "2026-03-22T00:00:00.000Z",
      "referenceLink": null,
      "teacher": {
        "id": "22",
        "nameWithInitials": "K.P. Silva",
        "imageUrl": "https://storage.googleapis.com/…",
        "email": "kpsilva@institute.edu"
      }
    }
  ],
  "total": 1,
  "page": 1,
  "limit": 20,
  "totalPages": 1,
  "hasNext": false,
  "hasPrev": false
}
```

#### React hook — load teacher's homeworks

```tsx
import { useEffect, useState } from 'react';
import api from '../services/api';

function useTeacherHomeworks(teacherId: string, classId?: string, subjectId?: string) {
  const [homeworks, setHomeworks] = useState<any[]>([]);
  const [meta, setMeta] = useState({ total: 0, page: 1, limit: 10, totalPages: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const params = new URLSearchParams({ page: '1', limit: '20' });
    if (classId) params.set('classId', classId);
    if (subjectId) params.set('subjectId', subjectId);

    api.get(`/api/institute-class-subject-homeworks/teacher/${teacherId}?${params}`)
      .then(res => {
        setHomeworks(res.data.data ?? []);
        setMeta({ total: res.data.total, page: res.data.page, limit: res.data.limit, totalPages: res.data.totalPages });
      })
      .finally(() => setLoading(false));
  }, [teacherId, classId, subjectId]);

  return { homeworks, meta, loading };
}
```

---

## Part 2 — Reference Material Management

Reference materials are files, videos, or links teachers attach to a homework assignment. They appear in the `references[]` array when `includeReferences=true`.

### Reference types

| `referenceType` | Allowed sources | Max size |
|---|---|---|
| `VIDEO` | `S3_UPLOAD`, `GOOGLE_DRIVE` | 500 MB |
| `IMAGE` | `S3_UPLOAD`, `GOOGLE_DRIVE` | 10 MB |
| `PDF` | `S3_UPLOAD`, `GOOGLE_DRIVE` | 50 MB |
| `DOCUMENT` | `S3_UPLOAD`, `GOOGLE_DRIVE` | 50 MB |
| `AUDIO` | `S3_UPLOAD` | 100 MB |
| `LINK` | `MANUAL_LINK` | — |
| `OTHER` | `S3_UPLOAD`, `GOOGLE_DRIVE` | 100 MB |

---

### 2.1 — Add reference via file upload (S3)

Three-step process:

```
Step 1  →  POST /api/homework-references/upload/generate-url
Step 2  →  PUT <signedUrl>   (direct upload to cloud — no auth header)
Step 3  →  POST /api/homework-references/upload/confirm
```

#### Step 1 — get signed URL

```
POST /api/homework-references/upload/generate-url
Authorization: Bearer <jwt>
Content-Type: application/json

{
  "homeworkId": "88",
  "fileName": "trigonometry-notes.pdf",
  "contentType": "application/pdf",
  "referenceType": "PDF",
  "fileSize": 2097152
}
```

**Body fields:**

| Field | Required | Notes |
|---|---|---|
| `homeworkId` | ✅ | The homework this reference belongs to |
| `fileName` | ✅ | Original file name |
| `contentType` | ✅ | MIME type (e.g. `application/pdf`, `video/mp4`) |
| `referenceType` | ✅ | One of: `VIDEO`, `IMAGE`, `PDF`, `DOCUMENT`, `AUDIO`, `OTHER` |
| `fileSize` | ✅ | File size in bytes (validated against limits) |

**Response — 200 OK:**

```json
{
  "uploadUrl": "https://storage.googleapis.com/suraksha-lms/homework-references/88/trig-notes.pdf?X-Goog-Signature=...",
  "relativePath": "homework-references/88/trig-notes.pdf",
  "expiresIn": 900
}
```

#### Step 2 — upload file to cloud

```
PUT <uploadUrl>
Content-Type: application/pdf
body = raw file bytes
```

No `Authorization` header on this call — the signed URL handles authentication.

#### Step 3 — confirm upload & create reference

```
POST /api/homework-references/upload/confirm
Authorization: Bearer <jwt>
Content-Type: application/json

{
  "homeworkId": "88",
  "relativePath": "homework-references/88/trig-notes.pdf",
  "title": "Chapter 3 Lecture Notes",
  "description": "Covers all topics from Chapter 3",
  "referenceType": "PDF",
  "fileName": "trigonometry-notes.pdf",
  "fileSize": 2097152,
  "mimeType": "application/pdf",
  "displayOrder": 1
}
```

**Response — 201 Created:** `HomeworkReferenceResponseDto` (see Section 2.5)

#### Full React example — S3 upload flow

```tsx
async function uploadHomeworkReference(
  homeworkId: string,
  file: File,
  referenceType: string,
  title: string,
  description: string,
  displayOrder: number
) {
  // Step 1: generate signed URL
  const { data: urlData } = await api.post('/api/homework-references/upload/generate-url', {
    homeworkId,
    fileName: file.name,
    contentType: file.type,
    referenceType,
    fileSize: file.size,
  });

  // Step 2: upload file directly to cloud (no auth header)
  await fetch(urlData.uploadUrl, {
    method: 'PUT',
    body: file,
    headers: { 'Content-Type': file.type },
  });

  // Step 3: confirm and create reference
  const { data: reference } = await api.post('/api/homework-references/upload/confirm', {
    homeworkId,
    relativePath: urlData.relativePath,
    title,
    description,
    referenceType,
    fileName: file.name,
    fileSize: file.size,
    mimeType: file.type,
    displayOrder,
  });

  return reference;
}
```

---

### 2.2 — Add reference from Google Drive

```
POST /api/homework-references/google-drive
Authorization: Bearer <jwt>
Content-Type: application/json

{
  "homeworkId": "88",
  "driveFileId": "1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms",
  "accessToken": "<google-oauth-access-token>",
  "title": "Recorded Lesson — Trigonometry",
  "description": "30-minute video covering sin, cos, tan",
  "referenceType": "VIDEO",
  "displayOrder": 0
}
```

**Body fields:**

| Field | Required | Notes |
|---|---|---|
| `homeworkId` | ✅ | |
| `driveFileId` | ✅ | Google Drive file ID |
| `accessToken` | ✅ | OAuth access token from Google sign-in |
| `title` | ✅ | |
| `referenceType` | ✅ | |
| `description` | ❌ | |
| `displayOrder` | ❌ | Default `0` |
| `videoDuration` | ❌ | Duration in seconds (for video references) |

**Response — 201 Created:** `HomeworkReferenceResponseDto`

---

### 2.3 — Add reference from manual link

Use this for YouTube, external websites, or any URL.

```
POST /api/homework-references/link
Authorization: Bearer <jwt>
Content-Type: application/json

{
  "homeworkId": "88",
  "title": "Khan Academy — Trigonometry",
  "externalUrl": "https://www.khanacademy.org/math/trigonometry",
  "linkTitle": "Khan Academy",
  "referenceType": "LINK",
  "description": "Practice problems and explanations",
  "displayOrder": 2
}
```

**Body fields:**

| Field | Required |
|---|---|
| `homeworkId` | ✅ |
| `title` | ✅ |
| `externalUrl` | ✅ |
| `referenceType` | ✅ (should be `"LINK"`) |
| `linkTitle` | ❌ |
| `description` | ❌ |
| `displayOrder` | ❌ |

---

### 2.4 — Update a reference

```
PATCH /api/homework-references/:id
Authorization: Bearer <jwt>
Content-Type: application/json

{
  "title": "Chapter 3 Notes (Updated)",
  "displayOrder": 0
}
```

All fields are optional. Source type (`referenceSource`) cannot be changed after creation.

**Response — 200 OK:** `HomeworkReferenceResponseDto`

---

### 2.5 — Reference response shape

```json
{
  "id": "12",
  "homeworkId": "88",
  "uploadedById": "22",
  "title": "Chapter 3 Lecture Notes",
  "description": "Covers all topics from Chapter 3",
  "referenceType": "PDF",
  "referenceSource": "S3_UPLOAD",
  "displayOrder": 1,

  "fileUrl": "https://storage.googleapis.com/suraksha-lms/homework-references/88/trig-notes.pdf",
  "fileName": "trigonometry-notes.pdf",
  "fileSize": 2097152,
  "mimeType": "application/pdf",

  "driveFileId": null,
  "driveFileName": null,
  "driveMimeType": null,
  "driveFileSize": null,

  "externalUrl": null,
  "linkTitle": null,

  "videoDuration": null,
  "thumbnailUrl": null,

  "viewUrl": "https://storage.googleapis.com/suraksha-lms/homework-references/88/trig-notes.pdf",

  "isActive": true,
  "createdAt": "2026-03-14T10:30:00.000Z",
  "updatedAt": "2026-03-14T10:30:00.000Z"
}
```

| Field | Notes |
|---|---|
| `viewUrl` | Primary URL to open/display the file. For S3 files = full cloud URL. For Drive files = Drive view URL. For links = `externalUrl`. |
| `fileUrl` | Non-null only for `S3_UPLOAD` references. Full cloud storage URL. |
| `driveFileId` | Non-null only for `GOOGLE_DRIVE` references. |
| `externalUrl` | Non-null only for `MANUAL_LINK` references. |
| `displayOrder` | Lower numbers appear first. |

---

### 2.6 — Reorder references

Send an array of reference IDs in the desired display order.

```
PATCH /api/homework-references/homework/:homeworkId/reorder
Authorization: Bearer <jwt>
Content-Type: application/json

{
  "referenceIds": ["12", "15", "8", "20"]
}
```

**Response — 200 OK:** Array of all `HomeworkReferenceResponseDto` in the new order.

---

### 2.7 — Delete a reference

#### Soft delete (recommended)

Sets `isActive: false`. Reference still exists in DB. Can be restored.

```
DELETE /api/homework-references/:id
Authorization: Bearer <jwt>
```

Response — 204 No Content.

#### Hard delete (admin only)

Permanently removes the DB record **and** the S3 file. Cannot be undone.

```
DELETE /api/homework-references/:id/permanent
Authorization: Bearer <jwt>
```

Response — 204 No Content.

#### Bulk soft delete

```
DELETE /api/homework-references/bulk
Authorization: Bearer <jwt>
Content-Type: application/json

{ "ids": ["8", "12", "15"] }
```

Response — 204 No Content.

#### Restore a soft-deleted reference

```
PATCH /api/homework-references/:id/restore
Authorization: Bearer <jwt>
```

Response — 200 OK: `HomeworkReferenceResponseDto`

---

## Part 3 — Admin View: Submissions

Teachers and admins can view all student submissions for any homework.

### List submissions for a homework

```
GET /api/institute-class-subject-homeworks-submissions?homeworkId=88&page=1&limit=20
Authorization: Bearer <jwt>
```

Alternatively, filter by institute:

```
GET /api/institute-class-subject-homeworks-submissions/institute/:instituteId/submissions?classId=40&subjectId=5
Authorization: Bearer <jwt>
```

### Add correction / remarks to a submission

```
PATCH /api/institute-class-subject-homeworks-submissions/:submissionId
Authorization: Bearer <jwt>
Content-Type: application/json

{
  "teacherCorrectionFileUrl": "homework-files/correction-uuid.pdf",
  "remarks": "Well done, but review question 4. See the corrected PDF."
}
```

> Use `POST /api/upload/generate-signed-url` first to upload the correction PDF, then use the returned relative path as `teacherCorrectionFileUrl`.

**Response — 200 OK:** Full `InstituteClassSubjectHomeworksSubmissionResponseDto`

---

## Part 4 — Complete homework creation workflow

```
1. Teacher creates homework
        │
        ▼
2. POST /api/institute-class-subject-homeworks
   { instituteId, classId, subjectId, teacherId, title, startDate, endDate }
   ◄── 201 { id: "88", ... }
        │
        ▼
3. Attach reference materials (optional — repeat for each material)
        │
   Option A — S3 file:
        ├── POST /api/homework-references/upload/generate-url
        ├── PUT <signedUrl>   (raw bytes, no auth)
        └── POST /api/homework-references/upload/confirm
        │
   Option B — Google Drive:
        └── POST /api/homework-references/google-drive
        │
   Option C — External link:
        └── POST /api/homework-references/link
        │
        ▼
4. Reorder references if needed
   PATCH /api/homework-references/homework/88/reorder
   { "referenceIds": ["12", "15", "8"] }
        │
        ▼
5. Students can now submit from startDate to endDate
   (frontend polls GET /api/institute-class-subject-homeworks/88?includeSubmissions=true)
        │
        ▼
6. Teacher reviews submissions
   GET /api/institute-class-subject-homeworks-submissions?homeworkId=88
        │
        ▼
7. Teacher uploads corrections
   PATCH /api/institute-class-subject-homeworks-submissions/:submissionId
   { "teacherCorrectionFileUrl": "...", "remarks": "..." }
```

---

## Part 5 — Error reference

| Status | Message | What to do |
|---|---|---|
| `400` | `startDate is required` | Provide a valid ISO date string for startDate |
| `400` | `File size exceeds limit` | Check file size against limits in Section 2.1 |
| `400` | `Invalid content type` | Verify MIME type matches the `referenceType` |
| `401` | Unauthorized | JWT expired — redirect to login |
| `403` | Forbidden | Teacher does not have access to this institute/class/subject |
| `404` | Homework not found | Check the ID |
| `404` | Subject not found or self-enrollment disabled | Only relevant for enrollment endpoints |

---

## Part 6 — React component reference

### HomeworkListPage (admin/teacher)

```tsx
import { useState, useEffect } from 'react';
import api from '../services/api';

export function HomeworkListPage({ instituteId, teacherId }) {
  const [homeworks, setHomeworks] = useState<any[]>([]);
  const [page, setPage] = useState(1);
  const [meta, setMeta] = useState<any>({});

  useEffect(() => {
    api.get(`/api/institute-class-subject-homeworks/teacher/${teacherId}`, {
      params: { page, limit: 10, includeReferences: true, sortBy: 'startDate', sortOrder: 'DESC' }
    }).then(res => {
      setHomeworks(res.data.data ?? []);
      setMeta(res.data);
    });
  }, [teacherId, page]);

  async function handleDelete(id: string) {
    if (!confirm('Delete this homework?')) return;
    await api.delete(`/api/institute-class-subject-homeworks/${id}`);
    setHomeworks(prev => prev.filter(hw => hw.id !== id));
  }

  return (
    <div>
      <h1>My Homeworks</h1>
      {homeworks.map(hw => (
        <div key={hw.id} className="homework-card">
          <h2>{hw.title}</h2>
          <p>{hw.description}</p>
          <p>Due: {hw.endDate ? new Date(hw.endDate).toLocaleDateString('en-LK') : 'No deadline'}</p>
          {hw.references?.length > 0 && (
            <p>{hw.references.length} reference material(s) attached</p>
          )}
          <button onClick={() => navigate(`/homeworks/${hw.id}/edit`)}>Edit</button>
          <button className="btn-danger" onClick={() => handleDelete(hw.id)}>Delete</button>
        </div>
      ))}

      {/* Pagination */}
      <div className="pagination">
        <button onClick={() => setPage(p => p - 1)} disabled={!meta.hasPrev}>Prev</button>
        <span>Page {meta.page} of {meta.totalPages}</span>
        <button onClick={() => setPage(p => p + 1)} disabled={!meta.hasNext}>Next</button>
      </div>
    </div>
  );
}
```

### ReferenceUploadWidget

```tsx
import { useState } from 'react';
import api from '../services/api';

export function ReferenceUploadWidget({ homeworkId, onUploaded }) {
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  const [type, setType] = useState('PDF');
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleUpload() {
    if (!file || !title) return;
    setUploading(true);
    setError(null);
    try {
      // Step 1: get signed URL
      const { data: urlData } = await api.post('/api/homework-references/upload/generate-url', {
        homeworkId,
        fileName: file.name,
        contentType: file.type,
        referenceType: type,
        fileSize: file.size,
      });

      // Step 2: upload to cloud
      await fetch(urlData.uploadUrl, {
        method: 'PUT',
        body: file,
        headers: { 'Content-Type': file.type },
      });

      // Step 3: confirm
      const { data: reference } = await api.post('/api/homework-references/upload/confirm', {
        homeworkId,
        relativePath: urlData.relativePath,
        title,
        referenceType: type,
        fileName: file.name,
        fileSize: file.size,
        mimeType: file.type,
      });

      onUploaded(reference);
      setFile(null);
      setTitle('');
    } catch (err: any) {
      setError(err.response?.data?.message ?? 'Upload failed');
    } finally {
      setUploading(false);
    }
  }

  return (
    <div>
      <select value={type} onChange={e => setType(e.target.value)}>
        {['PDF', 'VIDEO', 'IMAGE', 'DOCUMENT', 'AUDIO', 'OTHER'].map(t => (
          <option key={t} value={t}>{t}</option>
        ))}
      </select>
      <input placeholder="Title *" value={title} onChange={e => setTitle(e.target.value)} />
      <input type="file" onChange={e => setFile(e.target.files?.[0] ?? null)} />
      {error && <p className="error">{error}</p>}
      <button onClick={handleUpload} disabled={!file || !title || uploading}>
        {uploading ? 'Uploading…' : 'Upload'}
      </button>
    </div>
  );
}
```

---

*Last updated: March 2026*
