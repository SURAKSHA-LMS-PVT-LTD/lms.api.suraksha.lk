# Payment Admin Verify — Frontend Implementation Guide

This guide covers 5 APIs added to support admin/teacher/attendance-marker payment verification workflows.

---

## Table of Contents

1. [Role Access Matrix](#role-access-matrix)
2. [Institute Payment APIs](#institute-payment-apis)
   - [Search Student in Institute](#1-search-student-in-institute)
   - [Admin Verify Student Payment](#2-admin-verify-student-payment)
3. [Class-Subject Payment APIs](#class-subject-payment-apis)
   - [List Students for Payment (by paymentId)](#3-list-students-for-payment-by-paymentid)
   - [List Students Scoped by Institute/Class/Subject](#4-list-students-scoped-by-instituteclasssubject)
   - [Admin Verify Student CSP Payment](#5-admin-verify-student-csp-payment)
   - [Verify/Reject a Submission (existing)](#6-verifyreject-a-submission-existing-endpoint-updated)
4. [UI Flow Recommendations](#ui-flow-recommendations)
5. [Error Handling Reference](#error-handling-reference)

---

## Role Access Matrix

| Endpoint | Superadmin | Institute Admin | Teacher | Attendance Marker |
|---|---|---|---|---|
| Search student in institute | ✅ | ✅ | ✅ | ✅ |
| Admin verify institute payment | ✅ | ✅ | ❌ | ✅ |
| List students for CSP payment (by paymentId) | ✅ | ✅ | ✅ (subject-scoped) | ✅ |
| List students scoped by institute/class/subject | ✅ | ✅ | ✅ (subject-scoped) | ✅ |
| Admin verify student CSP payment | ✅ | ✅ | ✅ (subject-scoped) | ✅ |
| Verify/reject a submission | ✅ | ✅ | ✅ (subject-scoped) | ✅ |

> **Note**: "Teacher (subject-scoped)" means the teacher must be assigned to the subject linked to the payment.

---

## Institute Payment APIs

### 1. Search Student in Institute

Search for a student within an institute and view their payment history for a specific payment.

**Endpoint**
```
GET /institute-payments/institute/:instituteId/search-student
```

**Query Parameters**

| Parameter | Type | Required | Description |
|---|---|---|---|
| `studentId` | string (BigInt) | ✅ | The student's user ID to search for |
| `paymentId` | string (BigInt) | ❌ | If provided, filters payment history for this specific payment |

**Headers**
```
Authorization: Bearer <jwt_token>
```

**Example Request**
```
GET /institute-payments/institute/123/search-student?studentId=456&paymentId=789
```

**Success Response (200)**
```json
{
  "student": {
    "id": "456",
    "name": "Ashan Perera",
    "nameWithInitials": "A. Perera",
    "email": "ashan@example.com",
    "phone": "+94771234567",
    "profileImage": "https://..."
  },
  "instituteInfo": {
    "membershipId": "101",
    "joinedAt": "2024-01-15T00:00:00.000Z",
    "isActive": true
  },
  "paymentHistory": [
    {
      "submissionId": "501",
      "paymentId": "789",
      "paymentTitle": "January Monthly Fee",
      "amount": 5000,
      "status": "VERIFIED",
      "submittedAt": "2024-01-10T08:30:00.000Z",
      "verifiedAt": "2024-01-11T09:00:00.000Z",
      "method": "CASH_DEPOSIT",
      "receiptUrl": null,
      "notes": "Paid in person"
    }
  ]
}
```

**Error Responses**

| Status | Reason |
|---|---|
| 400 | `studentId` query parameter missing |
| 403 | Caller does not have access to this institute |
| 404 | Student not found or not enrolled in this institute |

---

### 2. Admin Verify Student Payment

Record/verify a payment for a student directly — bypasses the normal student-submission flow. Creates a `VERIFIED` record immediately.

**Endpoint**
```
POST /institute-payments/institute/:instituteId/payment/:paymentId/admin-verify-student/:studentId
```

**Path Parameters**

| Parameter | Description |
|---|---|
| `instituteId` | The institute's ID |
| `paymentId` | The payment (fee) ID |
| `studentId` | The student user ID to verify payment for |

**Headers**
```
Authorization: Bearer <jwt_token>
Content-Type: application/json
```

**Request Body**
```json
{
  "amount": 5000,
  "date": "2024-01-10",
  "notes": "Paid in cash at front desk"
}
```

**Request Body Schema**

| Field | Type | Required | Description |
|---|---|---|---|
| `amount` | number | ✅ | Amount paid (in LKR) |
| `date` | string (YYYY-MM-DD) | ✅ | Date the payment was received |
| `notes` | string | ❌ | Optional notes about the payment |

**Success Response (201)**
```json
{
  "submissionId": "602",
  "paymentId": "789",
  "studentId": "456",
  "amount": 5000,
  "status": "VERIFIED",
  "method": "CASH_DEPOSIT",
  "date": "2024-01-10",
  "notes": "Paid in cash at front desk",
  "verifiedAt": "2024-01-11T09:00:00.000Z",
  "verifiedBy": "101"
}
```

**Error Responses**

| Status | Reason |
|---|---|
| 400 | Missing required fields / Invalid date format |
| 403 | Caller does not have access to this institute |
| 404 | Payment or student not found |
| 409 | Student already has a verified payment for this payment ID |

---

## Class-Subject Payment APIs

### 3. List Students for Payment (by paymentId)

Get all students enrolled in a class-subject payment with their submission status.

**Endpoint**
```
GET /institute-class-subject-payment-submissions/payment/:paymentId/students
```

**Path Parameters**

| Parameter | Description |
|---|---|
| `paymentId` | The class-subject payment ID |

**Query Parameters**

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `page` | number | ❌ | `1` | Page number |
| `limit` | number | ❌ | `20` | Results per page (max 100) |

**Headers**
```
Authorization: Bearer <jwt_token>
```

**Example Request**
```
GET /institute-class-subject-payment-submissions/payment/789/students?page=1&limit=20
```

**Success Response (200)**
```json
{
  "data": [
    {
      "studentId": "456",
      "name": "Ashan Perera",
      "nameWithInitials": "A. Perera",
      "profileImage": "https://...",
      "status": "VERIFIED",
      "submissionId": "501",
      "amount": 3000,
      "submittedAt": "2024-01-10T08:30:00.000Z"
    },
    {
      "studentId": "457",
      "name": "Nimal Silva",
      "nameWithInitials": "N. Silva",
      "profileImage": null,
      "status": "NOT_SUBMITTED",
      "submissionId": null,
      "amount": null,
      "submittedAt": null
    },
    {
      "studentId": "458",
      "name": "Kamal Bandara",
      "nameWithInitials": "K. Bandara",
      "profileImage": null,
      "status": "PENDING",
      "submissionId": "503",
      "amount": 3000,
      "submittedAt": "2024-01-09T14:20:00.000Z"
    }
  ],
  "total": 45,
  "page": 1,
  "limit": 20
}
```

**Student Status Values**

| Status | Display Label | Suggested Color |
|---|---|---|
| `NOT_SUBMITTED` | Not Submitted | Grey |
| `PENDING` | Pending Review | Orange/Yellow |
| `VERIFIED` | Verified | Green |
| `REJECTED` | Rejected | Red |

**Error Responses**

| Status | Reason |
|---|---|
| 403 | Caller does not have access to this payment's subject |
| 404 | Payment not found |

---

---

### 4. List Students Scoped by Institute/Class/Subject

Get all **STUDENT** members for a specific institute/class/subject with their payment submission status. Returns richer details than endpoint #3: `nameWithInitials`, `userId`, `instituteStudentId`, `instituteUserImage`, and post-verification details (`status`, `verifiedAt`, `amount`). Also validates that the payment belongs to the given scope.

**Endpoint**
```
GET /institute-class-subject-payment-submissions/institute/:instituteId/class/:classId/subject/:subjectId/payment-submissions/payment/:paymentId/users/STUDENT
```

**Path Parameters**

| Parameter | Description |
|---|---|
| `instituteId` | Institute ID |
| `classId` | Class ID |
| `subjectId` | Subject ID |
| `paymentId` | Payment ID — must belong to the given institute/class/subject |

**Query Parameters**

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `page` | number | ❌ | `1` | Page number |
| `limit` | number | ❌ | `20` | Items per page |

**Headers**
```
Authorization: Bearer <jwt_token>
```

**Example Request**
```
GET /institute-class-subject-payment-submissions/institute/109/class/5/subject/12/payment-submissions/payment/1/users/STUDENT?page=1&limit=20
```

**Success Response (200)**
```json
{
  "success": true,
  "data": {
    "paymentId": "1",
    "paymentTitle": "March Monthly Fee",
    "paymentAmount": 3000,
    "students": [
      {
        "userId": "500362",
        "nameWithInitials": "A. Perera",
        "instituteStudentId": "S-2024-001",
        "cardId": "CARD-123",
        "instituteUserImage": "https://storage.example.com/images/abc.jpg",
        "paymentStatus": "VERIFIED",
        "submissionId": "42",
        "verifiedAt": "2026-03-10T08:00:00.000Z",
        "amount": 3000
      },
      {
        "userId": "500363",
        "nameWithInitials": "N. Silva",
        "instituteStudentId": "S-2024-002",
        "cardId": null,
        "instituteUserImage": null,
        "paymentStatus": "PENDING",
        "submissionId": "55",
        "verifiedAt": null,
        "amount": 3000
      },
      {
        "userId": "500364",
        "nameWithInitials": "K. Bandara",
        "instituteStudentId": null,
        "cardId": null,
        "instituteUserImage": "https://storage.example.com/images/def.jpg",
        "paymentStatus": "NOT_SUBMITTED",
        "submissionId": null,
        "verifiedAt": null,
        "amount": null
      }
    ],
    "summary": {
      "total": 45,
      "verified": 30,
      "pending": 5,
      "rejected": 2,
      "notSubmitted": 8
    },
    "pagination": {
      "currentPage": 1,
      "totalPages": 3,
      "totalItems": 45,
      "itemsPerPage": 20,
      "hasNextPage": true,
      "hasPreviousPage": false
    }
  }
}
```

**Student Object Fields**

| Field | Type | Description |
|---|---|---|
| `userId` | string | User's UUID (BigInt as string) |
| `nameWithInitials` | string \| null | e.g. `"A. Perera"` |
| `instituteStudentId` | string \| null | Institute-assigned student ID / entrance number |
| `cardId` | string \| null | Institute card ID / QR code |
| `instituteUserImage` | string \| null | Full URL — prefers institute-specific image, falls back to global profile image |
| `paymentStatus` | string | `NOT_SUBMITTED` \| `PENDING` \| `VERIFIED` \| `REJECTED` |
| `submissionId` | string \| null | Submission ID if one exists |
| `verifiedAt` | ISO 8601 \| null | Timestamp when payment was verified (`VERIFIED` only) |
| `amount` | number \| null | Submitted amount (`null` when `NOT_SUBMITTED`) |

**Error Responses**

| Status | Reason |
|---|---|
| 403 | Caller has no access to this institute |
| 404 | Payment not found for the given institute/class/subject combination |

---

### 5. Admin Verify Student CSP Payment

Record/verify a class-subject payment for a student directly. Creates a `VERIFIED` record immediately without requiring student submission.

**Endpoint**
```
POST /institute-class-subject-payment-submissions/payment/:paymentId/student/:studentId/admin-verify
```

**Path Parameters**

| Parameter | Description |
|---|---|
| `paymentId` | The class-subject payment ID |
| `studentId` | The student user ID to verify payment for |

**Headers**
```
Authorization: Bearer <jwt_token>
Content-Type: application/json
```

**Request Body**
```json
{
  "amount": 3000,
  "date": "2024-01-10",
  "notes": "Collected at class"
}
```

**Request Body Schema**

| Field | Type | Required | Description |
|---|---|---|---|
| `amount` | number | ✅ | Amount paid (in LKR) |
| `date` | string (YYYY-MM-DD) | ✅ | Date the payment was received |
| `notes` | string | ❌ | Optional notes about the payment |

**Success Response (201)**
```json
{
  "submissionId": "604",
  "paymentId": "789",
  "studentId": "457",
  "amount": 3000,
  "status": "VERIFIED",
  "method": "CASH_DEPOSIT",
  "date": "2024-01-10",
  "notes": "Collected at class",
  "verifiedAt": "2024-01-11T09:00:00.000Z",
  "verifiedBy": "201"
}
```

**Error Responses**

| Status | Reason |
|---|---|
| 400 | Missing required fields / Invalid date format |
| 403 | Caller does not have access to this payment's subject |
| 404 | Payment or student not found |
| 409 | Student already has a verified payment for this payment ID |

---

### 6. Verify/Reject a Submission (existing endpoint, updated)

This endpoint existed before. Access control has been updated to also allow `AttendanceMarker` role.

**Endpoint**
```
PATCH /institute-class-subject-payment-submissions/submission/:submissionId/verify
```

**Path Parameters**

| Parameter | Description |
|---|---|
| `submissionId` | The payment submission ID to verify or reject |

**Request Body**
```json
{
  "status": "VERIFIED",
  "notes": "Payment confirmed"
}
```

| Field | Values | Description |
|---|---|---|
| `status` | `"VERIFIED"` / `"REJECTED"` | New status to set |
| `notes` | string (optional) | Reviewer notes |

---

## UI Flow Recommendations

### Institute Payment — Admin Collect Flow

```
[Admin/AttendanceMarker UI]
         │
         ▼
  Search Student (by ID or name)
  → GET /institute-payments/institute/:id/search-student?studentId=xxx
         │
         ▼
  Show student card:
  - Name, profile photo
  - Membership status
  - Recent payment history (paid / not paid for current payment)
         │
    ┌────┴────┐
    │ Not paid│
    └────┬────┘
         ▼
  Show "Record Payment" form:
  - Amount (pre-fill from payment default)
  - Date (default today)
  - Notes (optional)
         │
         ▼
  Submit → POST /institute-payments/institute/:id/payment/:paymentId/admin-verify-student/:studentId
         │
         ▼
  Show success toast / refresh student card
```

### Class-Subject Payment — Bulk Verify Flow

```
[Admin/Teacher/AttendanceMarker UI]
         │
         ▼
  Open payment detail page
  → GET /institute-class-subject-payment-submissions/payment/:paymentId/students
         │
         ▼
  Show paginated student list with status badges:
  - NOT_SUBMITTED → [Record Payment] button
  - PENDING       → [Verify] / [Reject] buttons
  - VERIFIED      → Green checkmark (no action)
  - REJECTED      → Red X + option to re-verify
         │
   ┌─────┴──────┐
   │[Record Pmt]│  (for NOT_SUBMITTED)
   └─────┬──────┘
         ▼
  Quick modal with amount/date/notes
  → POST /payment/:paymentId/student/:studentId/admin-verify
         │
   ┌─────┴──────┐
   │  [Verify]  │  (for PENDING)
   └─────┬──────┘
         ▼
  Confirm dialog → PATCH /submission/:submissionId/verify { status: "VERIFIED" }
         │
         ▼
  Reload student list row OR optimistic UI update
```

### Attendance Marker — Simplified Flow

Since Attendance Markers have the same access as Admins for payment collection, they can use the same flows above. Typically an Attendance Marker would:

1. Be at the class/gate with a phone or tablet
2. Search for a student by ID/QR
3. See if payment is up to date
4. If not, record the cash payment on the spot

---

## Error Handling Reference

### Common Patterns

```typescript
// Generic API call wrapper
async function callApi<T>(fn: () => Promise<T>): Promise<T | null> {
  try {
    return await fn();
  } catch (error) {
    if (error.status === 409) {
      showToast('This student already has a verified payment recorded.');
    } else if (error.status === 404) {
      showToast('Student or payment not found.');
    } else if (error.status === 403) {
      showToast('You do not have permission to perform this action.');
    } else {
      showToast('An unexpected error occurred. Please try again.');
    }
    return null;
  }
}
```

### 409 Conflict — Already Verified

When `admin-verify` returns `409`, it means a `VERIFIED` submission already exists for this student+payment combination. In the UI:

- Prevent re-submission by checking submission status before showing the action button
- If 409 is received unexpectedly (race condition), refresh the student list to show the current verified state

### Date Format

All `date` fields in request bodies must be `YYYY-MM-DD` format:
```
✅ "2024-01-10"
❌ "10/01/2024"
❌ "January 10, 2024"
❌ 1704844800000  (timestamp)
```

---

## Quick Reference — Base URLs

| Module | Base Path |
|---|---|
| Institute Payments | `/institute-payments` |
| Class-Subject Payment Submissions | `/institute-class-subject-payment-submissions` |

## Quick Reference — All New Endpoints

| Method | Path | Purpose | Roles |
|---|---|---|---|
| `GET` | `/institute-payments/institute/:instituteId/search-student` | Search student + payment history | Admin, Teacher, AttendanceMarker |
| `POST` | `/institute-payments/institute/:instituteId/payment/:paymentId/admin-verify-student/:studentId` | Record institute payment for student | Admin, AttendanceMarker |
| `GET` | `/institute-class-subject-payment-submissions/payment/:paymentId/students` | List students with payment status | Admin, Teacher*, AttendanceMarker |
| `GET` | `/institute-class-subject-payment-submissions/institute/:instituteId/class/:classId/subject/:subjectId/payment-submissions/payment/:paymentId/users/STUDENT` | List STUDENT members with rich details + payment status (scoped) | Admin, Teacher*, AttendanceMarker |
| `POST` | `/institute-class-subject-payment-submissions/payment/:paymentId/student/:studentId/admin-verify` | Record CSP payment for student | Admin, Teacher*, AttendanceMarker |
| `PATCH` | `/institute-class-subject-payment-submissions/submission/:submissionId/verify` | Verify/reject a submission | Admin, Teacher*, AttendanceMarker |

\* Teacher access is subject-scoped — teacher must be assigned to the subject linked to the payment.
