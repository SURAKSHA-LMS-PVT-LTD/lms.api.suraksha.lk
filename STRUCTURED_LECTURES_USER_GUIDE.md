# Structured Lectures - User Frontend Guide

For students, parents, and teachers viewing lectures.

---

## Two types of lectures

| Type | Who creates it | Who sees it |
|---|---|---|
| **Institute-wide** | Admin/teacher — no classId | All enrolled students via subject+grade endpoint |
| **Class-restricted** | Admin/teacher — with classId | Only that class via class+subject endpoint |

---

## 1. Get lectures by subject + grade (institute-wide)

Use this for a subject page where all students of the same grade see the same content.

```
GET /api/structured-lectures/subject/:subjectId/grade/:grade
Authorization: Bearer <token>
```

Query params (all optional):
  isActive: true (default for non-admin) | false

Example:
  GET /api/structured-lectures/subject/SUBJ_TAMIL_001/grade/10

Response:
```json
[
  {
    "_id": "uuid-here",
    "instituteId": "109",
    "classId": null,
    "subjectId": "SUBJ_TAMIL_001",
    "grade": 10,
    "title": "Tamil Grammar - Chapter 1",
    "description": "Introduction to Tamil nouns",
    "lessonNumber": 1,
    "lectureNumber": 1,
    "lectureLink": "https://youtube.com/watch?v=xxx",
    "coverImageUrl": "https://storage.googleapis.com/...",
    "documents": [
      { "documentUrl": "https://...", "documentName": "Chapter 1 Notes.pdf" }
    ],
    "isActive": true,
    "createdAt": "2026-03-10T10:00:00.000Z",
    "updatedAt": "2026-03-10T10:00:00.000Z"
  }
]
```

Alternative (grade as query param):
  GET /api/structured-lectures/subject/SUBJ_TAMIL_001?grade=10

---

## 2. Get lectures by class + subject (class-restricted)

Use this for class-specific content. Students in Class 10A only see 10A lectures.

```
GET /api/structured-lectures/class/:classId/subject/:subjectId
Authorization: Bearer <token>
```

Query params (all optional):
  grade:    number (optional grade filter)
  isActive: true (default for non-admin)

Example:
  GET /api/structured-lectures/class/450/subject/SUBJ_TAMIL_001

Response format is identical to the subject+grade endpoint.

---

## 3. Get a single lecture

```
GET /api/structured-lectures/:id
Authorization: Bearer <token>
```

Response: single LectureResponseDto (same shape as items in list above)

---

## Response field reference

| Field | Type | Notes |
|---|---|---|
| `_id` | string (UUID) | Lecture ID |
| `instituteId` | string | Institute this lecture belongs to |
| `classId` | string \| null | null = institute-wide; string = class-restricted |
| `subjectId` | string | Subject UUID |
| `grade` | number | 1–13 |
| `title` | string | Lecture title |
| `description` | string | Full description |
| `lessonNumber` | number | Lesson grouping number |
| `lectureNumber` | number | Lecture order within lesson |
| `lectureLink` | string \| null | Video URL (YouTube, Vimeo, GCS, etc.) |
| `coverImageUrl` | string \| null | Thumbnail/cover image URL |
| `documents` | array | Array of `{ documentUrl, documentName?, documentDescription? }` |
| `isActive` | boolean | Hidden from students when false |
| `createdAt` | ISO string | |
| `updatedAt` | ISO string | |

---

## TypeScript example

```typescript
interface Document {
  documentUrl: string;
  documentName?: string;
  documentDescription?: string;
}

interface Lecture {
  _id: string;
  instituteId: string;
  classId: string | null;
  subjectId: string;
  grade: number;
  title: string;
  description: string;
  lessonNumber: number;
  lectureNumber: number;
  lectureLink?: string;
  coverImageUrl?: string;
  documents: Document[];
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

interface LectureListResponse {
  lectures: Lecture[];
  total: number;
  totalPages: number;
  currentPage: number;
  limit: number;
}

// Fetch institute-wide lectures for a subject+grade
async function getSubjectLectures(
  subjectId: string,
  grade: number,
  token: string
): Promise<Lecture[]> {
  const res = await fetch(
    `/api/structured-lectures/subject/${subjectId}/grade/${grade}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!res.ok) throw new Error('Failed to fetch lectures');
  const data: LectureListResponse = await res.json();
  return data.lectures;
}

// Fetch class-restricted lectures
async function getClassLectures(
  classId: string,
  subjectId: string,
  token: string
): Promise<Lecture[]> {
  const res = await fetch(
    `/api/structured-lectures/class/${classId}/subject/${subjectId}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!res.ok) throw new Error('Failed to fetch lectures');
  const data: LectureListResponse = await res.json();
  return data.lectures;
}
```

---

## UI notes

- Group lectures by `lessonNumber` for a table-of-contents layout
- Sort by `lessonNumber` ASC, then `lectureNumber` ASC within each lesson  
- `lectureLink` can be a YouTube URL — embed with `<iframe>` or open in new tab
- `classId === null` means the lecture is shared across all classes — no badge needed
- `classId !== null` means it is exclusive to that class — optionally show a "Class Exclusive" badge
- Only show lectures where `isActive === true` (API defaults to this for non-admin users)
