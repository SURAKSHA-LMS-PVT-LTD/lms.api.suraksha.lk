# Structured Lectures — Complete API Guide

> **Base URL:** `https://lmsapi.suraksha.lk`  
> **Auth:** `Authorization: Bearer <jwt_token>` on all endpoints  
> **All endpoints are protected** — valid JWT required

---

## Table of Contents

1. [Overview & Data Model](#1-overview--data-model)
2. [Role Access Matrix](#2-role-access-matrix)
3. [File Upload Flow (Cover Image & Documents)](#3-file-upload-flow-cover-image--documents)
4. [Create a Lecture (Admin / Teacher)](#4-create-a-lecture-admin--teacher)
5. [Get All Lectures (paginated)](#5-get-all-lectures-paginated)
6. [Get Lectures by Subject + Grade (Students)](#6-get-lectures-by-subject--grade-students)
7. [Get Lectures by Class + Subject (Institute Context)](#7-get-lectures-by-class--subject-institute-context)
8. [Get a Single Lecture by ID](#8-get-a-single-lecture-by-id)
9. [Get Lecture Statistics (Admin / Teacher)](#9-get-lecture-statistics-admin--teacher)
10. [Update a Lecture](#10-update-a-lecture)
11. [Soft Delete a Lecture](#11-soft-delete-a-lecture)
12. [Permanently Delete a Lecture (SUPERADMIN)](#12-permanently-delete-a-lecture-superadmin)
13. [Lecture Response Object Reference](#13-lecture-response-object-reference)
14. [Complete React Implementation for Students](#14-complete-react-implementation-for-students)
15. [Error Reference](#15-error-reference)

---

## 1. Overview & Data Model

### What is a Structured Lecture?

A **Structured Lecture** is a learning unit tied to:
- **A specific institute** (`instituteId`)
- **A specific class** within that institute (`classId`)
- **A subject** (`subjectId`)
- **A grade** (1–13)
- Ordered by **lesson number** and **lecture number** within that lesson

Each lecture may contain:
- A **lecture link** (external URL: Zoom, YouTube, Google Meet, etc.)
- A **cover image** (uploaded to S3 via the upload flow)
- One or more **reference documents** (PDFs, DOCx, etc.)

### Lecture Fields Summary

| Field | Type | Description |
|-------|------|-------------|
| `_id` | string (UUID) | Unique lecture ID |
| `instituteId` | string | Institute this lecture belongs to |
| `classId` | string | Class within the institute |
| `subjectId` | string | Subject this lecture covers |
| `grade` | number (1–13) | Grade level |
| `title` | string | Lecture title |
| `description` | string | Optional description |
| `lessonNumber` | number | Lesson number (≥ 1) |
| `lectureNumber` | number | Lecture number within the lesson (≥ 1) |
| `provider` | string | Instructor / provider name |
| `lectureLink` | string | External video/stream URL |
| `coverImageUrl` | string \| null | Full S3 URL of cover image |
| `documents` | array | Reference documents (see below) |
| `isActive` | boolean | Visible to students when `true` |
| `createdBy` | string | User ID who created the lecture |
| `updatedBy` | string | User ID who last updated it |
| `createdAt` | ISO 8601 | Creation timestamp |
| `updatedAt` | ISO 8601 | Last update timestamp |

### Document Object

```json
{
  "documentName": "Chapter 1 Notes.pdf",
  "documentUrl": "https://suraksha-lms-main-bucket.s3.us-east-1.amazonaws.com/lectures/docs/file.pdf",
  "documentDescription": "Summary of Chapter 1"
}
```

---

## 2. Role Access Matrix

| Endpoint | SUPERADMIN | Institute Admin | Teacher | Student | Parent |
|----------|:---:|:---:|:---:|:---:|:---:|
| Create lecture | ✅ | ✅ | ✅ | ❌ | ❌ |
| Get all lectures (paginated) | ✅ | ✅ | ✅ | ❌ | ❌ |
| Get by class + subject | ✅ | ✅ | ✅ | ✅ | ✅ |
| Get by subject + grade | ✅ | ✅ | ✅ | ✅ | ✅ |
| Get single lecture | ✅ | ✅ | ✅ | ✅ | ✅ |
| Get statistics | ✅ | ✅ | ✅ | ❌ | ❌ |
| Update lecture | ✅ | ✅ | ✅ | ❌ | ❌ |
| Soft delete | ✅ | ✅ | ✅ | ❌ | ❌ |
| Permanent delete | ✅ | ❌ | ❌ | ❌ | ❌ |

> **Student visibility note:** Students automatically see only **active** lectures (`isActive: true`). Admins and teachers can see both active and inactive unless they explicitly pass `?isActive=false`.

---

## 3. File Upload Flow (Cover Image & Documents)

Lectures support two types of file uploads:

| Type | `folder` param | Accepted Extensions |
|------|---------------|---------------------|
| Cover image | `lecture-covers` or `profile-images` | `.jpg`, `.jpeg`, `.png`, `.webp` |
| Reference documents | `homework-files` or `correction-files` | `.pdf`, `.doc`, `.docx`, `.jpg`, `.jpeg`, `.png` |

> Use the general signed-URL upload flow. See [PROFILE_IMAGE_IMPLEMENTATION_GUIDE.md](PROFILE_IMAGE_IMPLEMENTATION_GUIDE.md) Section 2 for the full 3-step upload process.

### Quick Summary for Lectures

```
1. POST /upload/generate-signed-url   { folder, fileName, contentType, fileSize }
2. POST <uploadUrl>                   FormData with fields first, file last
3. POST /upload/verify-and-publish   { relativePath }
   → returns { publicUrl }

4. Use publicUrl in:
   - coverImageUrl    (create/update lecture)
   - documentUrls[]   (create/update lecture)
```

---

## 4. Create a Lecture (Admin / Teacher)

Two equivalent URL paths exist for compatibility:

| Path | Notes |
|------|-------|
| `POST /api/structured-lectures` | Canonical path |
| `POST /structured-lectures` | Alias (no `/api` prefix) — both work identically |

```
POST /api/structured-lectures
Authorization: Bearer <token>
Content-Type: application/json
```

### Request Body

```json
{
  "instituteId": "101",
  "classId": "1000",
  "subjectId": "SUBJ_MATH_001",
  "grade": 10,
  "title": "Introduction to Algebra",
  "description": "Covers variables, expressions, and basic equations.",
  "lessonNumber": 1,
  "lectureNumber": 1,
  "provider": "Dr. John Smith",
  "lectureLink": "https://zoom.us/j/123456789",
  "coverImageUrl": "https://suraksha-lms-main-bucket.s3.us-east-1.amazonaws.com/profile-images/cover-uuid.jpg",
  "documentUrls": [
    "https://suraksha-lms-main-bucket.s3.us-east-1.amazonaws.com/homework-files/notes-uuid.pdf",
    "https://suraksha-lms-main-bucket.s3.us-east-1.amazonaws.com/homework-files/exercises-uuid.pdf"
  ],
  "isActive": true
}
```

### Required vs Optional Fields

| Field | Required | Validation |
|-------|----------|-----------|
| `instituteId` | ✅ | Non-empty string |
| `classId` | ✅ | Non-empty string |
| `subjectId` | ✅ | Non-empty string |
| `grade` | ✅ | Integer 1–13 |
| `title` | ✅ | Non-empty string (must be unique per subject+grade) |
| `description` | ❌ | String |
| `lessonNumber` | ❌ | Integer ≥ 1 |
| `lectureNumber` | ❌ | Integer ≥ 1 |
| `provider` | ❌ | String |
| `lectureLink` / `lectureVideoUrl` | ❌ | Either field name is accepted |
| `coverImageUrl` | ❌ | Full HTTPS URL from `/upload/verify-and-publish` |
| `documentUrls` | ❌ | Array of full HTTPS URLs |
| `isActive` | ❌ | Boolean (default: `true`) |

> **Duplicate check:** If a lecture with the same `title`, `subjectId`, and `grade` already exists, the API returns **409 Conflict**.

### Response (201)

```json
{
  "success": true,
  "message": "Structured lecture created successfully",
  "data": {
    "_id": "a3f2c1d4-e5b6-7890-abcd-ef1234567890",
    "instituteId": "101",
    "classId": "1000",
    "subjectId": "SUBJ_MATH_001",
    "grade": 10,
    "title": "Introduction to Algebra",
    "description": "Covers variables, expressions, and basic equations.",
    "lessonNumber": 1,
    "lectureNumber": 1,
    "provider": "Dr. John Smith",
    "lectureLink": "https://zoom.us/j/123456789",
    "coverImageUrl": "https://suraksha-lms-main-bucket.s3.us-east-1.amazonaws.com/profile-images/cover-uuid.jpg",
    "documents": [
      {
        "documentName": "Document 1",
        "documentUrl": "https://suraksha-lms-main-bucket.s3.us-east-1.amazonaws.com/homework-files/notes-uuid.pdf",
        "documentDescription": "Lecture document 1",
        "name": "Document 1",
        "url": "https://suraksha-lms-main-bucket.s3.us-east-1.amazonaws.com/homework-files/notes-uuid.pdf"
      }
    ],
    "isActive": true,
    "createdBy": "user-uuid-here",
    "updatedBy": "user-uuid-here",
    "createdAt": "2026-03-13T08:30:00.000Z",
    "updatedAt": "2026-03-13T08:30:00.000Z"
  }
}
```

---

## 5. Get All Lectures (paginated)

**Admin/Teacher only.** Returns all lectures for the institute with pagination, search, and filters.

```
GET /api/structured-lectures
Authorization: Bearer <token>
```

### Query Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `page` | number | `1` | Page number |
| `limit` | number | `50` | Items per page (max 100) |
| `grade` | number | — | Filter by grade (1–13) |
| `isActive` | boolean | — | `true` / `false` — defaults to all |
| `search` | string | — | Search in `title` or `description` |
| `sortBy` | string | `createdAt` | Sort field: `createdAt`, `updatedAt`, `title`, `grade` |
| `sortOrder` | `ASC`/`DESC` | `DESC` | Sort direction |

### Example Request

```
GET /api/structured-lectures?page=1&limit=20&grade=10&isActive=true&search=algebra
Authorization: Bearer <token>
```

### Response (200)

```json
{
  "lectures": [
    {
      "_id": "a3f2c1d4-...",
      "subjectId": "SUBJ_MATH_001",
      "grade": 10,
      "title": "Introduction to Algebra",
      "lessonNumber": 1,
      "lectureNumber": 1,
      "lectureLink": "https://zoom.us/j/123456789",
      "coverImageUrl": "https://...",
      "documents": [],
      "isActive": true,
      "createdAt": "2026-03-13T08:30:00.000Z",
      "updatedAt": "2026-03-13T08:30:00.000Z"
    }
  ],
  "total": 45,
  "totalPages": 3,
  "currentPage": 1,
  "limit": 20
}
```

---

## 6. Get Lectures by Subject + Grade (Students)

**Primary endpoint for students.** Returns all lectures for a subject at a given grade, grouped by lesson, ordered by lecture number. Active-only filter applied automatically for students.

Two equivalent path patterns:

### Method A — Grade as URL path param (recommended)

```
GET /api/structured-lectures/subject/:subjectId/grade/:grade
Authorization: Bearer <token>
```

**Example:**
```
GET /api/structured-lectures/subject/SUBJ_MATH_001/grade/10
Authorization: Bearer <token>
```

### Method B — Grade as query string param

```
GET /api/structured-lectures/subject/:subjectId?grade=10
Authorization: Bearer <token>
```

**Example:**
```
GET /api/structured-lectures/subject/SUBJ_MATH_001?grade=10
Authorization: Bearer <token>
```

> Both methods call the same service function and return identical data.

### Query Parameters (both methods)

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `grade` | number (1–13) | — | Grade level (required in Method B) |
| `isActive` | boolean | `true` (for students), all (for admins) | Filter by active status |

### Response (200)

Lectures are grouped by lesson, ordered by lecture number within each lesson:

```json
{
  "success": true,
  "subjectId": "SUBJ_MATH_001",
  "grade": 10,
  "lessons": [
    {
      "lessonNumber": 1,
      "lectures": [
        {
          "_id": "a3f2c1d4-e5b6-7890-abcd-ef1234567890",
          "instituteId": "101",
          "classId": "1000",
          "subjectId": "SUBJ_MATH_001",
          "grade": 10,
          "title": "Introduction to Algebra",
          "description": "Covers variables, expressions, and basic equations.",
          "lessonNumber": 1,
          "lectureNumber": 1,
          "provider": "Dr. John Smith",
          "lectureLink": "https://zoom.us/j/123456789",
          "coverImageUrl": "https://suraksha-lms-main-bucket.s3.us-east-1.amazonaws.com/profile-images/cover-uuid.jpg",
          "documents": [
            {
              "documentName": "Chapter 1 Notes",
              "documentUrl": "https://suraksha-lms-main-bucket.s3.us-east-1.amazonaws.com/homework-files/notes-uuid.pdf",
              "documentDescription": "Lecture notes for Chapter 1",
              "name": "Chapter 1 Notes",
              "url": "https://suraksha-lms-main-bucket.s3.us-east-1.amazonaws.com/homework-files/notes-uuid.pdf"
            }
          ],
          "isActive": true,
          "createdAt": "2026-03-13T08:30:00.000Z",
          "updatedAt": "2026-03-13T08:30:00.000Z"
        },
        {
          "_id": "b4f3d2e5-...",
          "lessonNumber": 1,
          "lectureNumber": 2,
          "title": "Solving Linear Equations",
          "lectureLink": "https://zoom.us/j/987654321",
          "documents": [],
          "isActive": true
        }
      ]
    },
    {
      "lessonNumber": 2,
      "lectures": [
        {
          "_id": "c5a4b3f6-...",
          "lessonNumber": 2,
          "lectureNumber": 1,
          "title": "Quadratic Equations",
          "lectureLink": "https://meet.google.com/abc-defg-hij",
          "documents": [],
          "isActive": true
        }
      ]
    }
  ]
}
```

---

## 7. Get Lectures by Class + Subject (Institute Context)

Use this when you need lectures scoped to a **specific class within an institute**. This is the correct endpoint for institute-based student access (e.g., a student enrolled in a specific class).

```
GET /api/structured-lectures/class/:classId/subject/:subjectId
Authorization: Bearer <token>
```

### URL Parameters

| Parameter | Description |
|-----------|-------------|
| `:classId` | The class ID to filter by |
| `:subjectId` | The subject ID to filter by |

### Query Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `grade` | number | — | Optional grade filter |
| `isActive` | boolean | `true` (non-admins) | Filter active status |

### Example Request

```
GET /api/structured-lectures/class/1000/subject/SUBJ_MATH_001
Authorization: Bearer <token>
```

### Response (200)

```json
{
  "lectures": [
    {
      "_id": "a3f2c1d4-...",
      "classId": "1000",
      "subjectId": "SUBJ_MATH_001",
      "grade": 10,
      "title": "Introduction to Algebra",
      "lessonNumber": 1,
      "lectureNumber": 1,
      "lectureLink": "https://zoom.us/j/123456789",
      "coverImageUrl": "https://...",
      "documents": [],
      "isActive": true
    }
  ],
  "total": 12,
  "totalPages": 1,
  "currentPage": 1,
  "limit": 50
}
```

---

## 8. Get a Single Lecture by ID

Retrieves full details for one lecture including all documents.

```
GET /api/structured-lectures/:id
Authorization: Bearer <token>
```

### Example

```
GET /api/structured-lectures/a3f2c1d4-e5b6-7890-abcd-ef1234567890
Authorization: Bearer <token>
```

### Response (200)

```json
{
  "_id": "a3f2c1d4-e5b6-7890-abcd-ef1234567890",
  "instituteId": "101",
  "classId": "1000",
  "subjectId": "SUBJ_MATH_001",
  "grade": 10,
  "title": "Introduction to Algebra",
  "description": "Covers variables, expressions, and basic equations.",
  "lessonNumber": 1,
  "lectureNumber": 1,
  "provider": "Dr. John Smith",
  "lectureLink": "https://zoom.us/j/123456789",
  "coverImageUrl": "https://suraksha-lms-main-bucket.s3.us-east-1.amazonaws.com/profile-images/cover-uuid.jpg",
  "documents": [
    {
      "documentName": "Chapter 1 Notes",
      "documentUrl": "https://suraksha-lms-main-bucket.s3.us-east-1.amazonaws.com/homework-files/notes-uuid.pdf",
      "documentDescription": "Lecture notes for Chapter 1",
      "name": "Chapter 1 Notes",
      "url": "https://suraksha-lms-main-bucket.s3.us-east-1.amazonaws.com/homework-files/notes-uuid.pdf"
    }
  ],
  "isActive": true,
  "createdBy": "user-uuid-here",
  "updatedBy": "user-uuid-here",
  "createdAt": "2026-03-13T08:30:00.000Z",
  "updatedAt": "2026-03-13T08:30:00.000Z"
}
```

---

## 9. Get Lecture Statistics (Admin / Teacher)

Returns aggregate statistics for a subject, optionally filtered by grade.

```
GET /api/structured-lectures/statistics/:subjectId
Authorization: Bearer <token>
```

### Query Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `grade` | number (1–13) | ❌ | Filter statistics to one grade |

### Example Request

```
GET /api/structured-lectures/statistics/SUBJ_MATH_001?grade=10
Authorization: Bearer <token>
```

### Response (200)

```json
{
  "subjectId": "SUBJ_MATH_001",
  "grade": "10",
  "totalLectures": 24,
  "activeLectures": 22,
  "inactiveLectures": 2,
  "totalLessons": 8,
  "totalGrades": 1,
  "totalDocuments": 47,
  "lecturesWithLinks": 22
}
```

When called without `?grade=`, `grade` field in the response is `"all"` and `totalGrades` reflects the number of distinct grades.

---

## 10. Update a Lecture

Updates an existing lecture. All fields are optional — only include fields you want to change.

```
PUT /api/structured-lectures/:id
Authorization: Bearer <token>
Content-Type: application/json
```

### Example — Update title and add a new document

```json
{
  "title": "Introduction to Algebra (Updated)",
  "documentUrls": [
    "https://suraksha-lms-main-bucket.s3.us-east-1.amazonaws.com/homework-files/updated-notes-uuid.pdf"
  ]
}
```

### Example — Deactivate a lecture

```json
{
  "isActive": false
}
```

### Example — Update cover image

```json
{
  "coverImageUrl": "https://suraksha-lms-main-bucket.s3.us-east-1.amazonaws.com/profile-images/new-cover-uuid.jpg"
}
```

### Updatable Fields

| Field | Type | Description |
|-------|------|-------------|
| `instituteId` | string | Move lecture to different institute |
| `classId` | string | Move lecture to different class |
| `subjectId` | string | Change subject |
| `grade` | number | Change grade (1–13) |
| `title` | string | Must still be unique per subject+grade |
| `description` | string | Update description |
| `lessonNumber` | number | Change lesson ordering |
| `lectureNumber` | number | Change lecture ordering |
| `provider` | string | Update instructor name |
| `lectureLink` / `lectureVideoUrl` | string | Change external link |
| `coverImageUrl` | string | Upload new cover (Steps 1–3 from Section 3) |
| `documentUrls` | string[] | Replace document list with new URLs |
| `isActive` | boolean | Show/hide from students |

### Response (200)

```json
{
  "success": true,
  "message": "Lecture updated successfully",
  "data": { /* full LectureResponseDto — same shape as create response */ }
}
```

---

## 11. Soft Delete a Lecture

Sets `isActive = false`. The lecture remains in the database but is **hidden from students**. Admins and teachers can still retrieve it with `?isActive=false`.

```
DELETE /api/structured-lectures/:id
Authorization: Bearer <token>
```

### Response (200)

```json
{
  "success": true,
  "message": "Lecture deactivated successfully"
}
```

---

## 12. Permanently Delete a Lecture (SUPERADMIN)

Completely removes the lecture and all its documents from the database. **Irreversible.**

```
DELETE /api/structured-lectures/:id/permanent
Authorization: Bearer <SUPERADMIN token>
```

### Response (200)

```json
{
  "success": true,
  "message": "Lecture permanently deleted successfully"
}
```

---

## 13. Lecture Response Object Reference

All read endpoints return lectures in this shape:

```typescript
interface LectureResponseDto {
  _id: string;                   // UUID
  instituteId?: string;          // Institute ID
  classId?: string;              // Class ID
  subjectId: string;             // Subject ID
  grade: number;                 // 1–13
  title: string;                 // Lecture title
  description: string;           // "" if not set
  lessonNumber: number;          // defaults to 1
  lectureNumber: number;         // defaults to 1
  provider?: string;             // Instructor name
  lectureLink?: string;          // External video/stream URL (also: videoUrl)
  coverImageUrl?: string;        // Full S3 URL or external URL
  documents: Array<{
    documentName: string;        // Display name
    documentUrl: string;         // Full S3 URL
    documentDescription?: string;
    name: string;                // Same as documentName (alias)
    url: string;                 // Same as documentUrl (alias)
  }>;
  isActive: boolean;
  createdBy?: string;
  updatedBy?: string;
  createdAt: Date;
  updatedAt: Date;
}
```

> Both `documentName`/`name` and `documentUrl`/`url` are present in every document object for backwards compatibility. They contain identical values — use either.

---

## 14. Complete React Implementation for Students

### 14.1 — Hook: Fetch Lectures for a Subject

```tsx
// useLectures.ts
import { useState, useEffect } from 'react';

const API_URL = 'https://lmsapi.suraksha.lk';

export interface LectureDocument {
  documentName: string;
  documentUrl: string;
  documentDescription?: string;
}

export interface Lecture {
  _id: string;
  instituteId?: string;
  classId?: string;
  subjectId: string;
  grade: number;
  title: string;
  description: string;
  lessonNumber: number;
  lectureNumber: number;
  provider?: string;
  lectureLink?: string;
  coverImageUrl?: string;
  documents: LectureDocument[];
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface LessonGroup {
  lessonNumber: number;
  lectures: Lecture[];
}

interface UseLecturesResult {
  lessons: LessonGroup[];
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useLectures(
  subjectId: string,
  grade: number,
  token: string
): UseLecturesResult {
  const [lessons, setLessons] = useState<LessonGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [trigger, setTrigger] = useState(0);

  useEffect(() => {
    if (!subjectId || !grade || !token) return;
    setLoading(true);
    setError(null);

    fetch(
      `${API_URL}/api/structured-lectures/subject/${encodeURIComponent(subjectId)}/grade/${grade}`,
      { headers: { Authorization: `Bearer ${token}` } }
    )
      .then(async res => {
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.message || `HTTP ${res.status}`);
        }
        return res.json();
      })
      .then(data => {
        // Response may be grouped by lessons or flat array
        if (data.lessons) {
          setLessons(data.lessons);
        } else if (Array.isArray(data)) {
          // Flat array — group by lessonNumber
          const grouped = groupByLesson(data);
          setLessons(grouped);
        } else if (data.lectures) {
          const grouped = groupByLesson(data.lectures);
          setLessons(grouped);
        } else {
          setLessons([]);
        }
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [subjectId, grade, token, trigger]);

  return {
    lessons,
    loading,
    error,
    refetch: () => setTrigger(t => t + 1),
  };
}

function groupByLesson(lectures: Lecture[]): LessonGroup[] {
  const map = new Map<number, Lecture[]>();
  for (const lec of lectures) {
    const key = lec.lessonNumber ?? 1;
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(lec);
  }
  return Array.from(map.entries())
    .sort(([a], [b]) => a - b)
    .map(([lessonNumber, lecs]) => ({
      lessonNumber,
      lectures: lecs.sort((a, b) => (a.lectureNumber ?? 1) - (b.lectureNumber ?? 1)),
    }));
}
```

---

### 14.2 — Student Lecture List Page

```tsx
// StudentLecturePage.tsx
import React, { useState } from 'react';
import { useLectures, LessonGroup, Lecture } from './useLectures';

interface Props {
  subjectId: string;
  grade: number;
  token: string;
  subjectName?: string;
}

export const StudentLecturePage: React.FC<Props> = ({
  subjectId,
  grade,
  token,
  subjectName = 'Subject',
}) => {
  const { lessons, loading, error, refetch } = useLectures(subjectId, grade, token);
  const [openLesson, setOpenLesson] = useState<number | null>(1); // First lesson open by default
  const [selectedLecture, setSelectedLecture] = useState<Lecture | null>(null);

  if (loading) {
    return (
      <div style={{ padding: 24, textAlign: 'center', color: '#666' }}>
        Loading lectures...
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: 24 }}>
        <div style={{ background: '#f8d7da', color: '#842029', padding: '12px 16px', borderRadius: 8, fontSize: 14 }}>
          ⚠️ {error}
        </div>
        <button
          onClick={refetch}
          style={{ marginTop: 12, padding: '6px 14px', cursor: 'pointer', borderRadius: 6, border: '1px solid #ccc' }}
        >
          Retry
        </button>
      </div>
    );
  }

  if (lessons.length === 0) {
    return (
      <div style={{ padding: 24, textAlign: 'center', color: '#666' }}>
        No lectures available for Grade {grade} {subjectName} yet.
      </div>
    );
  }

  if (selectedLecture) {
    return (
      <LectureDetailView
        lecture={selectedLecture}
        onBack={() => setSelectedLecture(null)}
      />
    );
  }

  return (
    <div style={{ maxWidth: 720, padding: 16 }}>
      <h2 style={{ marginBottom: 4 }}>
        {subjectName} — Grade {grade}
      </h2>
      <p style={{ color: '#666', fontSize: 13, marginBottom: 20 }}>
        {lessons.reduce((acc, l) => acc + l.lectures.length, 0)} lectures across {lessons.length} lessons
      </p>

      {lessons.map(lesson => (
        <LessonAccordion
          key={lesson.lessonNumber}
          lesson={lesson}
          isOpen={openLesson === lesson.lessonNumber}
          onToggle={() =>
            setOpenLesson(prev => (prev === lesson.lessonNumber ? null : lesson.lessonNumber))
          }
          onSelectLecture={setSelectedLecture}
        />
      ))}
    </div>
  );
};

// ─── Lesson Accordion ────────────────────────────────────────────────────────
interface LessonAccordionProps {
  lesson: LessonGroup;
  isOpen: boolean;
  onToggle: () => void;
  onSelectLecture: (lec: Lecture) => void;
}

const LessonAccordion: React.FC<LessonAccordionProps> = ({
  lesson,
  isOpen,
  onToggle,
  onSelectLecture,
}) => {
  return (
    <div style={{ marginBottom: 12, border: '1px solid #e0e0e0', borderRadius: 8, overflow: 'hidden' }}>
      <button
        onClick={onToggle}
        style={{
          width: '100%',
          textAlign: 'left',
          padding: '14px 16px',
          background: isOpen ? '#f0f4ff' : '#fafafa',
          border: 'none',
          cursor: 'pointer',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          fontWeight: 600,
          fontSize: 15,
        }}
      >
        <span>Lesson {lesson.lessonNumber}</span>
        <span style={{ fontSize: 12, color: '#666', fontWeight: 400 }}>
          {lesson.lectures.length} lecture{lesson.lectures.length !== 1 ? 's' : ''}
          {'  '}
          {isOpen ? '▲' : '▼'}
        </span>
      </button>

      {isOpen && (
        <div style={{ padding: '8px 0' }}>
          {lesson.lectures.map(lecture => (
            <LectureCard
              key={lecture._id}
              lecture={lecture}
              onSelect={() => onSelectLecture(lecture)}
            />
          ))}
        </div>
      )}
    </div>
  );
};

// ─── Lecture Card ─────────────────────────────────────────────────────────────
interface LectureCardProps {
  lecture: Lecture;
  onSelect: () => void;
}

const LectureCard: React.FC<LectureCardProps> = ({ lecture, onSelect }) => {
  return (
    <div
      onClick={onSelect}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '10px 16px',
        cursor: 'pointer',
        transition: 'background 0.15s',
        borderBottom: '1px solid #f5f5f5',
      }}
      onMouseEnter={e => (e.currentTarget.style.background = '#f5f5f5')}
      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
    >
      {/* Cover image or placeholder */}
      <div
        style={{
          width: 56,
          height: 40,
          borderRadius: 6,
          overflow: 'hidden',
          flexShrink: 0,
          background: '#e9ecef',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 20,
        }}
      >
        {lecture.coverImageUrl ? (
          <img
            src={lecture.coverImageUrl}
            alt=""
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        ) : (
          '🎓'
        )}
      </div>

      {/* Info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 500, fontSize: 14, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {lecture.lectureNumber}. {lecture.title}
        </div>
        {lecture.provider && (
          <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>{lecture.provider}</div>
        )}
      </div>

      {/* Badges */}
      <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
        {lecture.lectureLink && (
          <span style={{ fontSize: 11, padding: '2px 8px', background: '#d1e7dd', color: '#0f5132', borderRadius: 10 }}>
            🔗 Link
          </span>
        )}
        {lecture.documents.length > 0 && (
          <span style={{ fontSize: 11, padding: '2px 8px', background: '#cfe2ff', color: '#084298', borderRadius: 10 }}>
            📄 {lecture.documents.length}
          </span>
        )}
      </div>
    </div>
  );
};
```

---

### 14.3 — Lecture Detail View (with Reference Documents)

```tsx
// LectureDetailView.tsx
import React from 'react';
import { Lecture } from './useLectures';

interface Props {
  lecture: Lecture;
  onBack: () => void;
}

export const LectureDetailView: React.FC<Props> = ({ lecture, onBack }) => {
  const handleOpenLink = () => {
    if (lecture.lectureLink) {
      window.open(lecture.lectureLink, '_blank', 'noopener,noreferrer');
    }
  };

  const handleOpenDocument = (url: string) => {
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  return (
    <div style={{ maxWidth: 700, padding: 16 }}>
      {/* Back button */}
      <button
        onClick={onBack}
        style={{ marginBottom: 16, padding: '6px 12px', cursor: 'pointer', borderRadius: 6, border: '1px solid #ccc', background: '#fff' }}
      >
        ← Back
      </button>

      {/* Cover image */}
      {lecture.coverImageUrl && (
        <div style={{ marginBottom: 16, borderRadius: 10, overflow: 'hidden', maxHeight: 220 }}>
          <img
            src={lecture.coverImageUrl}
            alt={lecture.title}
            style={{ width: '100%', objectFit: 'cover', maxHeight: 220 }}
          />
        </div>
      )}

      {/* Title & meta */}
      <h2 style={{ margin: '0 0 4px' }}>{lecture.title}</h2>
      <div style={{ color: '#666', fontSize: 13, marginBottom: 12 }}>
        Lesson {lecture.lessonNumber} · Lecture {lecture.lectureNumber}
        {lecture.provider && ` · ${lecture.provider}`}
      </div>

      {/* Description */}
      {lecture.description && (
        <p style={{ fontSize: 14, color: '#444', lineHeight: 1.6, marginBottom: 16 }}>
          {lecture.description}
        </p>
      )}

      {/* Lecture link */}
      {lecture.lectureLink ? (
        <div style={{ marginBottom: 20 }}>
          <button
            onClick={handleOpenLink}
            style={{
              padding: '10px 20px',
              background: '#0d6efd',
              color: '#fff',
              border: 'none',
              borderRadius: 8,
              cursor: 'pointer',
              fontSize: 14,
              fontWeight: 600,
            }}
          >
            ▶ Open Lecture
          </button>
          <div style={{ fontSize: 11, color: '#888', marginTop: 4 }}>
            Opens in a new tab
          </div>
        </div>
      ) : (
        <div
          style={{
            padding: '10px 16px',
            background: '#fff3cd',
            color: '#856404',
            borderRadius: 8,
            fontSize: 13,
            marginBottom: 20,
          }}
        >
          📅 Lecture link not available yet. Check back later.
        </div>
      )}

      {/* Reference documents */}
      {lecture.documents.length > 0 && (
        <div>
          <h4 style={{ marginBottom: 10, fontSize: 15 }}>Reference Documents ({lecture.documents.length})</h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {lecture.documents.map((doc, index) => {
              const url = doc.documentUrl || doc.url;
              const name = doc.documentName || doc.name || `Document ${index + 1}`;
              const isPdf = url?.toLowerCase().endsWith('.pdf');
              const isDoc = url?.toLowerCase().match(/\.(doc|docx)$/);

              return (
                <div
                  key={index}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    padding: '10px 14px',
                    border: '1px solid #e0e0e0',
                    borderRadius: 8,
                    background: '#fafafa',
                  }}
                >
                  <span style={{ fontSize: 24 }}>
                    {isPdf ? '📑' : isDoc ? '📝' : '📎'}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 500, fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {name}
                    </div>
                    {doc.documentDescription && (
                      <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>
                        {doc.documentDescription}
                      </div>
                    )}
                  </div>
                  <button
                    onClick={() => handleOpenDocument(url)}
                    style={{
                      padding: '5px 12px',
                      background: '#fff',
                      border: '1px solid #0d6efd',
                      color: '#0d6efd',
                      borderRadius: 6,
                      cursor: 'pointer',
                      fontSize: 12,
                      flexShrink: 0,
                    }}
                  >
                    Open
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {lecture.documents.length === 0 && (
        <p style={{ color: '#888', fontSize: 13 }}>No reference documents attached to this lecture.</p>
      )}
    </div>
  );
};
```

---

### 14.4 — Admin: Create Lecture Form

```tsx
// CreateLectureForm.tsx — for Teacher/Admin
import React, { useState } from 'react';

const API_URL = 'https://lmsapi.suraksha.lk';

interface Props {
  token: string;
  defaultInstituteId: string;
  defaultClassId: string;
  onSuccess?: (id: string) => void;
}

export const CreateLectureForm: React.FC<Props> = ({
  token,
  defaultInstituteId,
  defaultClassId,
  onSuccess,
}) => {
  const [form, setForm] = useState({
    subjectId: '',
    grade: '',
    title: '',
    description: '',
    lessonNumber: '',
    lectureNumber: '',
    provider: '',
    lectureLink: '',
    isActive: true,
  });

  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [docFiles, setDocFiles] = useState<File[]>([]);
  const [state, setState] = useState<'idle' | 'uploading' | 'saving' | 'done' | 'error'>('idle');
  const [error, setError] = useState('');

  const authHeaders = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };

  // Generic 3-step upload helper
  async function uploadFile(file: File, folder: string): Promise<string> {
    // Step 1 — Get URL
    const genRes = await fetch(`${API_URL}/upload/generate-signed-url`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        folder,
        fileName: file.name,
        contentType: file.type,
        fileSize: file.size,
      }),
    });
    if (!genRes.ok) {
      const e = await genRes.json();
      throw new Error(e.message || 'Failed to get upload URL');
    }
    const { data: { uploadUrl, relativePath, fields } } = await genRes.json();

    // Step 2 — Upload to S3
    const formData = new FormData();
    Object.entries(fields || {}).forEach(([k, v]) => formData.append(k, v as string));
    formData.append('file', file);
    const s3Res = await fetch(uploadUrl, { method: 'POST', body: formData });
    if (!s3Res.ok && s3Res.status !== 204) throw new Error(`Upload failed: ${s3Res.status}`);

    // Step 3 — Publish
    const pubRes = await fetch(`${API_URL}/upload/verify-and-publish`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ relativePath }),
    });
    if (!pubRes.ok) throw new Error('Failed to publish file');
    const { publicUrl } = await pubRes.json();
    return publicUrl;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.subjectId || !form.grade || !form.title) {
      setError('Subject ID, Grade, and Title are required.');
      return;
    }
    setError('');
    setState('uploading');

    try {
      // Upload cover image if provided
      let coverImageUrl: string | undefined;
      if (coverFile) {
        coverImageUrl = await uploadFile(coverFile, 'profile-images');
      }

      // Upload reference documents if provided
      const documentUrls: string[] = [];
      for (const docFile of docFiles) {
        const url = await uploadFile(docFile, 'homework-files');
        documentUrls.push(url);
      }

      // Create lecture
      setState('saving');
      const body: any = {
        instituteId: defaultInstituteId,
        classId: defaultClassId,
        subjectId: form.subjectId,
        grade: Number(form.grade),
        title: form.title,
        description: form.description || undefined,
        lessonNumber: form.lessonNumber ? Number(form.lessonNumber) : undefined,
        lectureNumber: form.lectureNumber ? Number(form.lectureNumber) : undefined,
        provider: form.provider || undefined,
        lectureLink: form.lectureLink || undefined,
        isActive: form.isActive,
      };
      if (coverImageUrl) body.coverImageUrl = coverImageUrl;
      if (documentUrls.length) body.documentUrls = documentUrls;

      const createRes = await fetch(`${API_URL}/api/structured-lectures`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify(body),
      });
      if (!createRes.ok) {
        const e = await createRes.json();
        throw new Error(e.message || 'Failed to create lecture');
      }
      const result = await createRes.json();
      setState('done');
      onSuccess?.(result.data._id);
    } catch (e: any) {
      setState('error');
      setError(e.message);
    }
  }

  const fields = (label: string, key: keyof typeof form, type = 'text', required = false) => (
    <div style={{ marginBottom: 12 }}>
      <label style={{ display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 4 }}>
        {label} {required && <span style={{ color: '#dc3545' }}>*</span>}
      </label>
      <input
        type={type}
        value={String(form[key])}
        onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
        required={required}
        style={{ width: '100%', padding: '7px 10px', border: '1px solid #ccc', borderRadius: 6, fontSize: 13, boxSizing: 'border-box' }}
      />
    </div>
  );

  if (state === 'done') {
    return (
      <div style={{ padding: 24, textAlign: 'center' }}>
        <h3>✅ Lecture created successfully!</h3>
        <button onClick={() => setState('idle')} style={{ padding: '8px 16px', cursor: 'pointer', borderRadius: 6, border: '1px solid #ccc' }}>
          Create Another
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} style={{ maxWidth: 500 }}>
      <h3 style={{ marginBottom: 16 }}>Create New Lecture</h3>

      {fields('Subject ID', 'subjectId', 'text', true)}
      {fields('Grade (1–13)', 'grade', 'number', true)}
      {fields('Title', 'title', 'text', true)}
      {fields('Description', 'description')}
      {fields('Lesson Number', 'lessonNumber', 'number')}
      {fields('Lecture Number', 'lectureNumber', 'number')}
      {fields('Provider / Instructor', 'provider')}
      {fields('Lecture Link (Zoom, YouTube, etc.)', 'lectureLink')}

      <div style={{ marginBottom: 12 }}>
        <label style={{ display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 4 }}>
          Cover Image (JPG/PNG/WebP — optional)
        </label>
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={e => setCoverFile(e.target.files?.[0] || null)}
        />
      </div>

      <div style={{ marginBottom: 16 }}>
        <label style={{ display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 4 }}>
          Reference Documents (PDF/DOC — optional, multiple allowed)
        </label>
        <input
          type="file"
          accept=".pdf,.doc,.docx,image/jpeg,image/png"
          multiple
          onChange={e => setDocFiles(Array.from(e.target.files || []))}
        />
        {docFiles.length > 0 && (
          <p style={{ fontSize: 12, color: '#666', marginTop: 4 }}>{docFiles.length} file(s) selected</p>
        )}
      </div>

      <div style={{ marginBottom: 16 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13 }}>
          <input
            type="checkbox"
            checked={form.isActive}
            onChange={e => setForm(f => ({ ...f, isActive: e.target.checked }))}
          />
          Publish immediately (visible to students)
        </label>
      </div>

      {error && (
        <div style={{ background: '#f8d7da', color: '#842029', padding: '8px 12px', borderRadius: 6, fontSize: 13, marginBottom: 12 }}>
          ⚠️ {error}
        </div>
      )}

      <button
        type="submit"
        disabled={state === 'uploading' || state === 'saving'}
        style={{ padding: '10px 24px', background: '#0d6efd', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600 }}
      >
        {state === 'uploading' ? 'Uploading files...' : state === 'saving' ? 'Creating lecture...' : 'Create Lecture'}
      </button>
    </form>
  );
};
```

---

## 15. Error Reference

### Create / Update Lecture

| Status | Message | Fix |
|--------|---------|-----|
| `400` | `instituteId should not be empty` | Include `instituteId` in request body |
| `400` | `classId should not be empty` | Include `classId` in request body |
| `400` | `subjectId should not be empty` | Include `subjectId` in request body |
| `400` | `grade must not be less than 1` | Grade must be between 1 and 13 |
| `400` | `grade must not be greater than 13` | Grade must be between 1 and 13 |
| `400` | `title should not be empty` | Title is required |
| `400` | `Grade must be between 1 and 13` | Integer outside valid range |
| `401` | `Unauthorized` | JWT missing, expired, or invalid |
| `403` | `Forbidden` | Role does not have permission (e.g., student trying to create) |
| `409` | `A lecture with this title already exists for this subject and grade` | Choose a different title, or use a different subject/grade combination |

### Query Lectures

| Status | Message | Fix |
|--------|---------|-----|
| `400` | `Grade must be between 1 and 13` | Pass a valid integer 1–13 |
| `401` | `Unauthorized` | JWT missing or expired |
| `403` | `Forbidden` | Student calling admin-only endpoint (e.g., statistics) |
| `404` | `No lectures found for the subject and grade` | No active lectures exist for this subject+grade |
| `404` | `No lectures found for the class and subject` | No lectures for this class+subject combination |

### Get Single Lecture

| Status | Message | Fix |
|--------|---------|-----|
| `404` | `Lecture not found` | Lecture ID does not exist or was permanently deleted |
| `401` | `Unauthorized` | JWT missing or expired |

### Delete Lecture

| Status | Message | Fix |
|--------|---------|-----|
| `404` | `Lecture not found` | Lecture ID does not exist |
| `403` | `Forbidden` | Permanent delete requires SUPERADMIN role |

---

## Quick Reference — All Endpoints

| Method | URL | Auth | Roles | Purpose |
|--------|-----|------|-------|---------|
| `POST` | `/api/structured-lectures` | JWT | Admin, Teacher | Create lecture |
| `POST` | `/structured-lectures` | JWT | Admin, Teacher | Create lecture (alias — no `/api` prefix) |
| `GET` | `/api/structured-lectures` | JWT | Admin, Teacher | List all (paginated + search) |
| `GET` | `/api/structured-lectures/class/:classId/subject/:subjectId` | JWT | All roles | Lectures for a class+subject |
| `GET` | `/api/structured-lectures/subject/:subjectId/grade/:grade` | JWT | All roles | Lectures grouped by lesson (path param grade) |
| `GET` | `/api/structured-lectures/subject/:subjectId?grade=N` | JWT | All roles | Lectures grouped by lesson (query param grade) |
| `GET` | `/api/structured-lectures/statistics/:subjectId` | JWT | Admin, Teacher | Subject statistics |
| `GET` | `/api/structured-lectures/:id` | JWT | All roles | Single lecture detail |
| `PUT` | `/api/structured-lectures/:id` | JWT | Admin, Teacher | Update lecture |
| `DELETE` | `/api/structured-lectures/:id` | JWT | Admin, Teacher | Soft delete (hides from students) |
| `DELETE` | `/api/structured-lectures/:id/permanent` | JWT | SUPERADMIN only | Hard delete (permanent) |
