# Structured Lectures — User Frontend Guide

For students, parents, and teachers viewing lecture content.

---

## How structured lectures work

Lectures are created at the **institute level** and scoped to a **subject**. Every student in the institute who studies that subject automatically sees the same lectures — there is no per-class filtering. Lectures can additionally be filtered by `grade`.

```
Institute
  └── Subject (e.g. Mathematics)
        └── Grade 10
              └── Lecture 1, Lecture 2, ...
```

---

## 1. Get lectures by institute + subject (primary endpoint)

Use this on any subject page. Pass the student's institute and the subject being viewed.

```
GET /api/structured-lectures/institute/:instituteId/subject/:subjectId
Authorization: Bearer <token>
```

| Query param | Type | Required | Notes |
|---|---|---|---|
| `grade` | number | No | Filter to one grade (1–13). Omit for all grades in the subject. |
| `isActive` | boolean | No | Defaults to `true` for non-admin users — hidden lectures never appear. |

**Examples:**
```
# All lectures for Maths in institute 109
GET /api/structured-lectures/institute/109/subject/SUBJ_MATH_001

# Grade 10 only
GET /api/structured-lectures/institute/109/subject/SUBJ_MATH_001?grade=10
```

**Response:**
```json
{
  "lectures": [
    {
      "_id": "550e8400-e29b-41d4-a716-446655440000",
      "instituteId": "109",
      "subjectId": "SUBJ_MATH_001",
      "grade": 10,
      "title": "Introduction to Algebra",
      "description": "Basic algebra concepts",
      "lessonNumber": 1,
      "lectureNumber": 1,
      "provider": "Dr. Smith",
      "lectureLink": "https://youtube.com/watch?v=abc123",
      "coverImageUrl": "https://storage.googleapis.com/bucket/covers/algebra.jpg",
      "documents": [
        { "documentUrl": "https://storage.googleapis.com/.../notes.pdf", "documentName": "Chapter 1 Notes" }
      ],
      "isActive": true,
      "createdAt": "2026-07-01T08:00:00.000Z",
      "updatedAt": "2026-07-01T08:00:00.000Z"
    }
  ],
  "total": 12,
  "totalPages": 1,
  "currentPage": 1,
  "limit": 12
}
```

---

## 2. Get lectures by subject + grade (path param variant)

Alternative when you have subject and grade but no instituteId in the URL. Pass `instituteId` as a query param to scope results correctly.

```
GET /api/structured-lectures/subject/:subjectId/grade/:grade?instituteId=109
Authorization: Bearer <token>
```

---

## 3. Get lectures by subject (grade as query param)

```
GET /api/structured-lectures/subject/:subjectId?grade=10&instituteId=109
Authorization: Bearer <token>
```

---

## 4. Get a single lecture

```
GET /api/structured-lectures/:id
Authorization: Bearer <token>
```

Returns a single `LectureResponseDto`.

---

## Response field reference

| Field | Type | Notes |
|---|---|---|
| `_id` | string (UUID) | Lecture ID |
| `instituteId` | string | Institute this lecture belongs to |
| `subjectId` | string | Subject UUID |
| `grade` | number | Grade level 1–13 |
| `title` | string | Lecture title |
| `description` | string | Full description |
| `lessonNumber` | number | Lesson grouping number |
| `lectureNumber` | number | Order within the lesson |
| `provider` | string \| null | Instructor or platform name |
| `lectureLink` | string \| null | Video URL (YouTube, Vimeo, GCS, etc.) |
| `coverImageUrl` | string \| null | Thumbnail/cover image URL |
| `documents` | array | `{ documentUrl, documentName?, documentDescription? }` |
| `isActive` | boolean | `false` = hidden from students |
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
  subjectId: string;
  grade: number;
  title: string;
  description: string;
  lessonNumber: number;
  lectureNumber: number;
  provider?: string;
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

// Primary: fetch all lectures for a subject in an institute
async function getSubjectLectures(
  instituteId: string,
  subjectId: string,
  grade: number | undefined,
  token: string
): Promise<LectureListResponse> {
  const params = new URLSearchParams();
  if (grade !== undefined) params.set('grade', String(grade));
  const url = `/api/structured-lectures/institute/${instituteId}/subject/${subjectId}?${params}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error('Failed to fetch lectures');
  return res.json();
}

// Fetch single lecture
async function getLectureById(id: string, token: string): Promise<Lecture> {
  const res = await fetch(`/api/structured-lectures/${id}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error('Lecture not found');
  return res.json();
}
```

---

## UI notes

- Group lectures by `lessonNumber` for a table-of-contents layout
- Sort by `lessonNumber` ASC, then `lectureNumber` ASC within each lesson
- `lectureLink` is often a YouTube URL — embed with `<iframe>` or open in a new tab
- Only show lectures where `isActive === true` (the API enforces this automatically for non-admin users)
- No class selection needed — all students in the same institute see the same lectures for a given subject
