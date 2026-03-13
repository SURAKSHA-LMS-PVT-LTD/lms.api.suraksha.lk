# Subject Enrollment Status — Frontend Guide

This guide covers every API endpoint that returns a student's subject enrollments, and exactly how to use the `verificationStatus` field that is now included in every response.

---

## Why verificationStatus matters

Students can **self-enroll** in a subject by supplying an enrollment key. When they do, the enrollment is created with `verificationStatus: "pending"`. A teacher or institute admin must then verify or reject it.

Enrollments created by a teacher/admin directly start as `verificationStatus: "verified"`.

| `verificationStatus` | Meaning | What to show |
|---|---|---|
| `"verified"` | Active, approved enrollment | Normal subject card |
| `"pending"` | Awaiting teacher / admin approval | Subject card + "Awaiting Approval" amber banner |
| `"rejected"` | Rejected — student must re-enroll | Subject card (greyed) + rejection reason + re-enroll prompt |

---

## Endpoint Overview

| Method | Route | Auth | Returns verificationStatus? |
|---|---|---|---|
| `GET` | `/api/institute-class-subject-students/:instituteId/student-subjects/class/:classId/student/:studentId` | JWT | ✅ Yes |
| `GET` | `/api/institute-class-subject-students/student/:studentId` | JWT | ✅ Yes |
| `POST` | `/api/institute-class-subject-students/self-enroll` | JWT (student) | ✅ Yes (always `"pending"`) |
| `GET` | `/api/institute-class-subject-students/unverified-students/:instituteId/:classId/:subjectId` | JWT (admin/teacher) | ✅ Yes (always `"pending"`) |
| `POST` | `/api/institute-class-subject-students/verify-student/:instituteId/:classId/:subjectId` | JWT (admin/teacher) | ✅ Yes |
| `POST` | `/api/institute-class-subject-students/reject-student/:instituteId/:classId/:subjectId` | JWT (admin/teacher) | ✅ Yes |

---

## 1 — Load subjects for a student in a specific class

### Request

```
GET /api/institute-class-subject-students/:instituteId/student-subjects/class/:classId/student/:studentId
Authorization: Bearer <jwt>
```

Example:
```
GET /api/institute-class-subject-students/1/student-subjects/class/40/student/456
```

### Response — 200 OK

```json
{
  "data": [
    {
      "instituteId": "1",
      "classId": "40",
      "subjectId": "5",
      "enrollmentMethod": "self_enrolled",
      "verificationStatus": "pending",
      "verifiedAt": null,
      "rejectionReason": null,
      "enrolledAt": "2026-03-14T08:00:00.000Z",
      "teacherId": "22",
      "classSubjectActive": true,
      "subject": {
        "id": "5",
        "code": "MATH10",
        "name": "Mathematics",
        "description": "Advanced Mathematics for Grade 10",
        "category": "CORE",
        "creditHours": 4,
        "isActive": true,
        "subjectType": "MAIN",
        "basketCategory": null,
        "imgUrl": null
      }
    },
    {
      "instituteId": "1",
      "classId": "40",
      "subjectId": "7",
      "enrollmentMethod": "teacher_assigned",
      "verificationStatus": "verified",
      "verifiedAt": "2026-02-01T10:00:00.000Z",
      "rejectionReason": null,
      "enrolledAt": "2026-02-01T09:00:00.000Z",
      "teacherId": "22",
      "classSubjectActive": true,
      "subject": {
        "id": "7",
        "code": "SCI10",
        "name": "Science",
        "description": "General Science for Grade 10",
        "category": "CORE",
        "creditHours": 4,
        "isActive": true,
        "subjectType": "MAIN",
        "basketCategory": null,
        "imgUrl": null
      }
    }
  ],
  "total": 2,
  "page": 1,
  "limit": 10
}
```

### Enrollment item fields

| Field | Type | Notes |
|---|---|---|
| `verificationStatus` | `"verified"` \| `"pending"` \| `"rejected"` | **New field** — always present |
| `verifiedAt` | ISO string or `null` | Set when verified or rejected |
| `rejectionReason` | string or `null` | Non-null only when `verificationStatus === "rejected"` |
| `enrollmentMethod` | `"teacher_assigned"` \| `"self_enrolled"` | How the student got in |
| `enrolledAt` | ISO string or `null` | When the enrollment row was created |
| `subject` | object | Full subject details |

---

## 2 — Load all subjects for a student (across all classes)

### Request

```
GET /api/institute-class-subject-students/student/:studentId
Authorization: Bearer <jwt>
```

### Response shape

Same `InstituteClassSubjectStudentResponseDto` structure — now includes `verificationStatus`, `verifiedAt`, `rejectionReason`, `enrollmentMethod`, `createdAt`, `updatedAt`.

---

## 3 — Self-enroll in a subject

### Request

```
POST /api/institute-class-subject-students/self-enroll
Authorization: Bearer <jwt>
Content-Type: application/json

{
  "instituteId": "1",
  "classId": "40",
  "subjectId": "5",
  "enrollmentKey": "MATH-ABC123"
}
```

### Response — 201 Created

```json
{
  "message": "Successfully enrolled in Mathematics for Class 10A. Awaiting verification by teacher or admin.",
  "instituteId": "1",
  "classId": "40",
  "subjectId": "5",
  "subjectName": "Mathematics",
  "className": "Grade 10A",
  "enrollmentMethod": "self_enrolled",
  "verificationStatus": "pending",
  "enrolledAt": "2026-03-14T09:00:00.000Z"
}
```

> After self-enrollment `verificationStatus` is always `"pending"` until a teacher or admin acts on it. Show an immediate "Awaiting approval" banner.

### Error responses

| Status | Meaning |
|---|---|
| `400` | Invalid enrollment key |
| `403` | Not enrolled in the class |
| `409` | Already enrolled (pending/rejected/verified) |
| `404` | Subject not found or self-enrollment disabled |

---

## 4 — Admin/Teacher: get pending (unverified) students

```
GET /api/institute-class-subject-students/unverified-students/:instituteId/:classId/:subjectId
Authorization: Bearer <jwt>
```

Returns only students with `verificationStatus === "pending"`. Used to build the admin approval list.

---

## 5 — Admin/Teacher: verify or reject an enrollment

### Verify

```
POST /api/institute-class-subject-students/verify-student/:instituteId/:classId/:subjectId
Authorization: Bearer <jwt>
Content-Type: application/json

{ "studentId": "456" }
```

### Reject

```
POST /api/institute-class-subject-students/reject-student/:instituteId/:classId/:subjectId
Authorization: Bearer <jwt>
Content-Type: application/json

{
  "studentId": "456",
  "rejectionReason": "Prerequisites not met"
}
```

Both return a `VerificationActionResponseDto`:

```json
{
  "message": "Student enrollment verified successfully",
  "instituteId": "1",
  "classId": "40",
  "subjectId": "5",
  "studentId": "456",
  "verificationStatus": "verified",
  "actionBy": "22",
  "actionAt": "2026-03-14T10:00:00.000Z"
}
```

---

## Frontend implementation

### React hook — load subjects with status

```tsx
import { useEffect, useState } from 'react';
import api from '../services/api';

type EnrollmentStatus = 'verified' | 'pending' | 'rejected';

interface SubjectEnrollment {
  subjectId: string;
  enrollmentMethod: 'teacher_assigned' | 'self_enrolled';
  verificationStatus: EnrollmentStatus;
  verifiedAt: string | null;
  rejectionReason: string | null;
  enrolledAt: string | null;
  subject: {
    id: string;
    name: string;
    code: string;
    description: string | null;
    category: string;
    imgUrl: string | null;
  };
}

function useStudentSubjects(instituteId: string, classId: string, studentId: string) {
  const [subjects, setSubjects] = useState<SubjectEnrollment[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get(`/api/institute-class-subject-students/${instituteId}/student-subjects/class/${classId}/student/${studentId}`)
      .then(res => setSubjects(res.data.data ?? []))
      .finally(() => setLoading(false));
  }, [instituteId, classId, studentId]);

  return { subjects, loading };
}
```

### Subject card with status banner

```tsx
function SubjectCard({ enrollment }: { enrollment: SubjectEnrollment }) {
  const { subject, verificationStatus, rejectionReason } = enrollment;

  return (
    <div className={`subject-card ${verificationStatus === 'rejected' ? 'card-rejected' : ''}`}>
      {subject.imgUrl && <img src={subject.imgUrl} alt={subject.name} />}
      <h3>{subject.name}</h3>
      <p className="code">{subject.code}</p>
      {subject.description && <p>{subject.description}</p>}

      <EnrollmentStatusBadge status={verificationStatus} />

      {verificationStatus === 'pending' && (
        <div className="banner banner-amber">
          Your enrollment is awaiting approval by the teacher or admin.
        </div>
      )}

      {verificationStatus === 'rejected' && (
        <div className="banner banner-red">
          Enrollment rejected.
          {rejectionReason && <p className="rejection-reason">Reason: {rejectionReason}</p>}
          <button onClick={() => {/* open re-enroll dialog */}}>Re-enroll</button>
        </div>
      )}
    </div>
  );
}

function EnrollmentStatusBadge({ status }: { status: EnrollmentStatus }) {
  const config: Record<EnrollmentStatus, { label: string; className: string }> = {
    verified: { label: 'Enrolled',        className: 'badge-green' },
    pending:  { label: 'Awaiting Approval', className: 'badge-amber' },
    rejected: { label: 'Rejected',         className: 'badge-red'  },
  };
  const { label, className } = config[status];
  return <span className={`badge ${className}`}>{label}</span>;
}
```

### Subject list page

```tsx
export default function SubjectListPage({ instituteId, classId, studentId }) {
  const { subjects, loading } = useStudentSubjects(instituteId, classId, studentId);

  if (loading) return <p>Loading subjects…</p>;
  if (subjects.length === 0) return <p>No subjects found.</p>;

  const verified  = subjects.filter(s => s.verificationStatus === 'verified');
  const pending   = subjects.filter(s => s.verificationStatus === 'pending');
  const rejected  = subjects.filter(s => s.verificationStatus === 'rejected');

  return (
    <div>
      {pending.length > 0 && (
        <section>
          <h2>Pending Approval ({pending.length})</h2>
          {pending.map(s => <SubjectCard key={s.subjectId} enrollment={s} />)}
        </section>
      )}

      {rejected.length > 0 && (
        <section>
          <h2>Rejected ({rejected.length})</h2>
          {rejected.map(s => <SubjectCard key={s.subjectId} enrollment={s} />)}
        </section>
      )}

      <section>
        <h2>My Subjects ({verified.length})</h2>
        {verified.length === 0
          ? <p>No approved subjects yet.</p>
          : verified.map(s => <SubjectCard key={s.subjectId} enrollment={s} />)}
      </section>
    </div>
  );
}
```

---

## Self-enroll flow (step by step)

```
1. Student taps "Join Subject"
        │
        ▼
2. Show dialog: enter enrollment key
        │
        ▼
3. POST /api/institute-class-subject-students/self-enroll
   { instituteId, classId, subjectId, enrollmentKey }
   ◄── 201 { verificationStatus: "pending", ... }
        │
        ▼
4. Insert the subject card immediately (optimistic UI)
   with status badge "Awaiting Approval"
        │
        ▼
5. Teacher/admin approves → student's next load shows "Enrolled"
   Teacher/admin rejects  → student sees rejection reason + "Re-enroll" button
```

---

## Decision tree — what to show per subject

```
verificationStatus?
  ├─ "verified"  → show normal subject card (green badge "Enrolled")
  │               full access to subject content
  │
  ├─ "pending"   → show subject card with amber badge "Awaiting Approval"
  │               grey out subject content links
  │               show "Awaiting teacher approval" notice
  │
  └─ "rejected"  → show subject card with red badge "Rejected"
                  show rejectionReason if present
                  show "Re-enroll" button
                  grey out / hide subject content links
```

---

## Status badge CSS reference

```css
.badge { padding: 2px 8px; border-radius: 12px; font-size: 0.75rem; font-weight: 600; }
.badge-green { background: #d1fae5; color: #065f46; }
.badge-amber { background: #fef3c7; color: #92400e; }
.badge-red   { background: #fee2e2; color: #991b1b; }

.banner { padding: 10px 14px; border-radius: 6px; margin-top: 8px; font-size: 0.85rem; }
.banner-amber { background: #fffbeb; border: 1px solid #fbbf24; color: #78350f; }
.banner-red   { background: #fff1f2; border: 1px solid #fca5a5; color: #7f1d1d; }

.card-rejected { opacity: 0.7; }
```

---

## Error reference

| Status | Message | Action |
|---|---|---|
| `400` | Invalid enrollment key | Show "Incorrect enrollment key" under the input |
| `403` | Not enrolled in required class | Show "You must join the class first" |
| `409` | Already enrolled in this subject | Refresh subjects list |
| `404` | Subject not found or enrollment disabled | Show "Self-enrollment is not available for this subject" |
| `401` | Unauthorized | Redirect to login |

---

*Last updated: March 2026*
