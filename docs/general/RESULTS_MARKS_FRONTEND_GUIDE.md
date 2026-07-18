# Results & Marks API — Frontend Implementation Guide

Base URL prefix: `/institute-class-subject-resaults`
All requests require a valid JWT (`Authorization: Bearer <token>`).

---

## 1. Bulk Submit / Update Marks

**`POST /institute-class-subject-resaults/bulk`**

Use this endpoint to submit or update marks for an entire class-subject in one call.
The backend performs an **upsert** — if a student already has a result for the same exam it is updated; otherwise a new record is inserted. Calling this endpoint multiple times is safe and idempotent.

### Who can call it
- SuperAdmin (global)
- Institute Admin
- Teacher (must have access to the class and subject)

### Request body

```json
{
  "instituteId": "1",
  "classId": "2",
  "subjectId": "3",
  "examId": "5",
  "results": [
    {
      "studentId": "10",
      "score": "92.50",
      "grade": "A+",
      "remarks": "Outstanding performance"
    },
    {
      "studentId": "11",
      "score": "78.25",
      "grade": "B+",
      "remarks": "Good work"
    },
    {
      "studentId": "12",
      "score": "45.00",
      "grade": "C",
      "remarks": null
    }
  ]
}
```

| Field | Type | Required | Notes |
|---|---|---|---|
| `instituteId` | string (bigint) | ✅ | |
| `classId` | string (bigint) | ✅ | |
| `subjectId` | string (bigint) | ✅ | |
| `examId` | string (bigint) | ❌ | Omit for non-exam-linked results |
| `results` | array | ✅ | At least one item required |
| `results[].studentId` | string (bigint) | ✅ | |
| `results[].score` | string (decimal) | ❌ | e.g. `"87.50"` |
| `results[].grade` | string (enum) | ❌ | See grade values below |
| `results[].remarks` | string | ❌ | Free text |

**Grade enum values:** `"A+"` · `"A"` · `"B+"` · `"B"` · `"C+"` · `"C"` · `"S"` · `"F"`

### Response — `201 Created`

Array of saved result objects:

```json
[
  {
    "id": "101",
    "instituteId": "1",
    "classId": "2",
    "subjectId": "3",
    "studentId": "10",
    "examId": "5",
    "score": "92.50",
    "grade": "A+",
    "remarks": "Outstanding performance",
    "isActive": true,
    "createdAt": "2026-03-15T08:00:00.000Z",
    "updatedAt": "2026-03-15T08:00:00.000Z",
    "student": {
      "id": "10",
      "firstName": "Kasun",
      "lastName": "Perera",
      "email": "kasun@example.com",
      "isActive": true
    },
    "exam": {
      "id": "5",
      "title": "Mid Term 2026",
      "examType": "PHYSICAL"
    }
  }
]
```

### TypeScript example

```typescript
interface StudentResultInput {
  studentId: string;
  score?: string;
  grade?: 'A+' | 'A' | 'B+' | 'B' | 'C+' | 'C' | 'S' | 'F';
  remarks?: string;
}

interface BulkResultsPayload {
  instituteId: string;
  classId: string;
  subjectId: string;
  examId?: string;
  results: StudentResultInput[];
}

async function submitBulkMarks(payload: BulkResultsPayload) {
  const res = await fetch('/institute-class-subject-resaults/bulk', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}
```

### Error responses

| Status | Cause |
|---|---|
| 400 | Missing required fields, empty `results` array, invalid IDs |
| 401 | Missing or expired JWT |
| 403 | Insufficient role / not teacher of this class-subject |

---

## 2. Get All Students With Their Exam Marks

**`GET /institute-class-subject-resaults/students-with-marks`**

Returns **every student enrolled in the class-subject**, paired with their marks for the specified exam.  
Students who have not been graded yet are still returned with `score: "0"` and `grade: null`.

### Who can call it
- SuperAdmin (global)
- Institute Admin
- Teacher (must have access to the class and subject)

### Query parameters

| Param | Type | Required | Description |
|---|---|---|---|
| `instituteId` | string | ✅ | |
| `classId` | string | ✅ | |
| `subjectId` | string | ✅ | |
| `examId` | string | ✅ | |

### Request example

```
GET /institute-class-subject-resaults/students-with-marks?instituteId=1&classId=2&subjectId=3&examId=5
Authorization: Bearer <token>
```

### Response — `200 OK`

Array of `StudentExamMarkDto`:

```json
[
  {
    "userId": "10",
    "firstName": "Kasun",
    "lastName": "Perera",
    "imageUrl": "https://storage.googleapis.com/bucket/uploads/users/kasun.jpg",
    "instituteId": "1",
    "examId": "5",
    "score": "92.50",
    "grade": "A+"
  },
  {
    "userId": "11",
    "firstName": "Nimal",
    "lastName": "Silva",
    "imageUrl": null,
    "instituteId": "1",
    "examId": "5",
    "score": "0",
    "grade": null
  }
]
```

| Field | Type | Notes |
|---|---|---|
| `userId` | string | Student's user ID |
| `firstName` | string \| null | |
| `lastName` | string \| null | |
| `imageUrl` | string \| null | Full CDN URL, ready to use in `<img src>`. `null` if no photo |
| `instituteId` | string | Echo of the query param |
| `examId` | string | Echo of the query param |
| `score` | string | Decimal string e.g. `"87.50"`. `"0"` if not yet graded |
| `grade` | string \| null | Grade enum value. `null` if not yet graded |

> **Note on `score: "0"`** — A score of `"0"` with `grade: null` means the student has not been graded yet (no result row exists). A score of `"0"` with a grade present means they genuinely scored zero.

### TypeScript types

```typescript
type Grade = 'A+' | 'A' | 'B+' | 'B' | 'C+' | 'C' | 'S' | 'F';

interface StudentExamMark {
  userId: string;
  firstName: string | null;
  lastName: string | null;
  imageUrl: string | null;
  instituteId: string;
  examId: string;
  score: string;       // "0" means not yet graded
  grade: Grade | null; // null means not yet graded
}

async function getStudentsWithMarks(params: {
  instituteId: string;
  classId: string;
  subjectId: string;
  examId: string;
}): Promise<StudentExamMark[]> {
  const query = new URLSearchParams(params).toString();
  const res = await fetch(
    `/institute-class-subject-resaults/students-with-marks?${query}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}
```

### React Query example

```typescript
import { useQuery } from '@tanstack/react-query';

function useStudentsWithMarks(
  instituteId: string,
  classId: string,
  subjectId: string,
  examId: string,
) {
  return useQuery({
    queryKey: ['students-with-marks', instituteId, classId, subjectId, examId],
    queryFn: () =>
      getStudentsWithMarks({ instituteId, classId, subjectId, examId }),
    enabled: Boolean(instituteId && classId && subjectId && examId),
  });
}
```

### Displaying the mark entry table

```tsx
function MarksTable({ students, onChange }: {
  students: StudentExamMark[];
  onChange: (studentId: string, field: 'score' | 'grade', value: string) => void;
}) {
  return (
    <table>
      <thead>
        <tr>
          <th>Photo</th>
          <th>Name</th>
          <th>Score</th>
          <th>Grade</th>
        </tr>
      </thead>
      <tbody>
        {students.map((s) => (
          <tr key={s.userId}>
            <td>
              {s.imageUrl
                ? <img src={s.imageUrl} alt={s.firstName ?? ''} width={40} height={40} />
                : <div className="avatar-placeholder" />}
            </td>
            <td>{s.firstName} {s.lastName}</td>
            <td>
              <input
                type="number"
                defaultValue={s.score === '0' && s.grade === null ? '' : s.score}
                placeholder="0"
                onChange={(e) => onChange(s.userId, 'score', e.target.value)}
              />
            </td>
            <td>
              <select
                defaultValue={s.grade ?? ''}
                onChange={(e) => onChange(s.userId, 'grade', e.target.value)}
              >
                <option value="">— select —</option>
                {['A+','A','B+','B','C+','C','S','F'].map(g => (
                  <option key={g} value={g}>{g}</option>
                ))}
              </select>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
```

### Error responses

| Status | Cause |
|---|---|
| 400 | Any of the four query params is missing |
| 401 | Missing or expired JWT |
| 403 | Insufficient role |

---

## 3. Existing Endpoints (unchanged)

| Method | Path | Description |
|---|---|---|
| `POST` | `/institute-class-subject-resaults` | Create single result |
| `GET` | `/institute-class-subject-resaults` | List results (paginated, filterable) |
| `GET` | `/institute-class-subject-resaults/exam/:examId` | All results for an exam (paginated) |
| `GET` | `/institute-class-subject-resaults/with-details/:id` | Single result with full relations |
| `GET` | `/institute-class-subject-resaults/:id` | Single result by ID |
| `PATCH` | `/institute-class-subject-resaults/:id` | Update single result |
| `DELETE` | `/institute-class-subject-resaults/:id` | Delete single result |

---

## 4. Common Patterns & Notes

### IDs are strings, not numbers
All ID fields (`userId`, `instituteId`, `classId`, etc.) are **bigint stored as strings**. Always send them as JSON strings, never numbers.

```json
// ✅ correct
{ "studentId": "42" }

// ❌ wrong — will be rejected
{ "studentId": 42 }
```

### Score is a decimal string
```json
"score": "87.50"   // ✅
"score": 87.50     // ❌
```

### Detecting "not yet graded" vs "genuinely zero"
```typescript
const isUngraded = (s: StudentExamMark) => s.score === '0' && s.grade === null;
const displayScore = (s: StudentExamMark) =>
  isUngraded(s) ? '—' : `${s.score} (${s.grade ?? 'no grade'})`;
```

### Submitting only changed rows
For performance, you can filter the students array before calling the bulk endpoint — only include students whose score/grade actually changed:

```typescript
const changed = students.filter(
  (s) => edits[s.userId] !== undefined
);

await submitBulkMarks({
  instituteId,
  classId,
  subjectId,
  examId,
  results: changed.map((s) => ({
    studentId: s.userId,
    score: edits[s.userId].score,
    grade: edits[s.userId].grade,
  })),
});
```
