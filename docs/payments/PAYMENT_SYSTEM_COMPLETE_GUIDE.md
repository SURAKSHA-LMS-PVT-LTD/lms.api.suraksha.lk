# Payment System — Complete Implementation Guide

> **Last Updated:** Auto-generated after bug-fix audit  
> **Module:** `src/modules/payment/`  
> **Auth:** JWT Bearer Token (all endpoints require authentication)

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Role Matrix](#2-role-matrix)
3. [Institute-Level Payments](#3-institute-level-payments)
   - [Endpoints for Institute Admin / Teacher](#31-admin--teacher-endpoints)
   - [Endpoints for Student / Parent](#32-student--parent-endpoints)
4. [Class-Subject-Level Payments](#4-class-subject-level-payments)
   - [Endpoints for Institute Admin / Teacher](#41-admin--teacher-endpoints)
   - [Endpoints for Student / Parent](#42-student--parent-endpoints)
5. [Payment Submission Workflow](#5-payment-submission-workflow)
6. [Data Types & Enums](#6-data-types--enums)
7. [Request / Response Examples](#7-request--response-examples)
8. [Error Codes Reference](#8-error-codes-reference)
9. [Frontend Integration Notes](#9-frontend-integration-notes)

---

## 1. Architecture Overview

The system has **two parallel payment sub-systems**:

| Sub-system | Scope | Entity Table | Submission Table |
|---|---|---|---|
| **Institute Payments** | Whole-institute fees (registration, annual, etc.) | `institute_payments` | `institute_payment_submissions` |
| **Class-Subject Payments** | Per-class/subject fees (tuition, lab, materials) | `institute_class_subject_payments` | `institute_class_subject_payment_submissions` |

Both systems share the identical workflow:
1. Admin/Teacher **creates** a payment request with a target audience
2. Students/Parents **see** applicable payments and **submit** proof of payment
3. Admin/Teacher **reviews**, then **verifies** or **rejects** each submission

### Key Design Decisions
- **Submissions are ALWAYS created with `PENDING` status** — no auto-verification
- **Receipt uploads** go through `/upload/verify-and-publish` first; the resulting URL/path is passed in the DTO
- **`targetType`** controls who sees the payment (STUDENTS, PARENTS, or BOTH for institute-level; STUDENTS or PARENTS for class-subject-level)
- **Access control** is enforced at two levels:
  - Controller guards (`@RequireAnyOfRoles`) — coarse role check
  - Service-level institute role lookup (`getUserFromJWT` / `getUserInstituteRole`) — fine-grained data scoping

---

## 2. Role Matrix

### Who Can Do What

| Action | SUPERADMIN | INSTITUTE_ADMIN | TEACHER | STUDENT | PARENT |
|---|:---:|:---:|:---:|:---:|:---:|
| **Create payment** | ✅ | ✅ | ✅ (own subject) | ❌ | ❌ |
| **Update payment** | ✅ | ✅ | ✅ (own subject) | ❌ | ❌ |
| **List all payments** | ✅ | ✅ | ✅ | ✅ (filtered) | ✅ (filtered) |
| **View payment details** | ✅ | ✅ | ✅ | ✅ (own) | ✅ (own) |
| **View statistics** | ✅ | ✅ | ✅ | ❌ | ❌ |
| **Submit payment proof** | ❌ | ❌ | ❌ | ✅ | ✅ |
| **View own submissions** | — | — | — | ✅ | ✅ |
| **View all submissions** | ✅ | ✅ | ✅ | ❌ | ❌ |
| **View pending submissions** | ✅ | ✅ | ✅ | ❌ | ❌ |
| **Verify/Reject submission** | ✅ | ✅ | ✅ | ❌ | ❌ |
| **Delete own submission** | — | — | — | ✅ (pending only) | ✅ (pending only) |
| **View student submissions** | ✅ | ✅ | ✅ | ❌ | ✅ (own child) |

### targetType Visibility

| targetType | Student sees? | Parent sees? |
|---|:---:|:---:|
| `STUDENTS` | ✅ | ❌ |
| `PARENTS` | ❌ | ✅ |
| `BOTH` (institute-level only) | ✅ | ✅ |

---

## 3. Institute-Level Payments

**Base URL:** `/institute-payments` (payment CRUD) and `/institute-payment-submissions` (submission workflows)

### 3.1 Admin / Teacher Endpoints

#### Create Payment Request
```
POST /institute-payments/institute/:instituteId/payments
```
**Access:** SUPERADMIN, INSTITUTE_ADMIN, TEACHER  
**Body:**
```json
{
  "paymentType": "Monthly Tuition Fee",
  "description": "Tuition fee for January 2025 — all students must pay before the deadline.",
  "amount": 5000.00,
  "dueDate": "2025-01-31T23:59:59Z",
  "targetType": "BOTH",
  "priority": "MANDATORY",
  "paymentInstructions": "Transfer to BOC account and upload receipt",
  "bankDetails": {
    "bankName": "Bank of Ceylon",
    "accountNumber": "12345678901234",
    "accountHolderName": "ABC Institute"
  },
  "lateFeeAmount": 500.00,
  "lateFeeAfterDays": 7,
  "autoReminderEnabled": true,
  "reminderDaysBefore": 3,
  "notes": "Contact office for payment plan options"
}
```
**Response:** `{ success: true, data: { paymentId, status } }`

---

#### List All Payments (Admin View)
```
GET /institute-payments/institute/:instituteId/payments
```
**Access:** SUPERADMIN, INSTITUTE_ADMIN, TEACHER, STUDENT, PARENT  
**Query Params:** `page`, `limit`, `status`, `priority`, `targetType`, `search`, `sortBy`, `sortOrder`

> **Note:** Students and Parents see payments filtered by their `targetType` automatically. Admins/Teachers see all payments.

---

#### Get Payment Statistics
```
GET /institute-payments/institute/:instituteId/stats
```
**Access:** SUPERADMIN, INSTITUTE_ADMIN, TEACHER  
**Response:**
```json
{
  "success": true,
  "data": {
    "totalPayments": 15,
    "activePayments": 12,
    "completedPayments": 2,
    "expiredPayments": 1,
    "totalExpectedAmount": 750000.00,
    "totalCollectedAmount": 485000.00,
    "collectionPercentage": "64.67",
    "submissionStats": {
      "totalSubmissions": 120,
      "pendingSubmissions": 25,
      "verifiedSubmissions": 85,
      "rejectedSubmissions": 10
    }
  }
}
```

---

#### Update Payment
```
PATCH /institute-payments/institute/:instituteId/payment/:paymentId
```
**Access:** SUPERADMIN, INSTITUTE_ADMIN, TEACHER (creator)  
**Body:** Any fields from `CreateInstitutePaymentDto` (partial update)

---

#### Get Payment Submissions (for a specific payment)
```
GET /institute-payment-submissions/institute/:instituteId/payment/:paymentId/submissions
```
**Access:** SUPERADMIN, INSTITUTE_ADMIN, TEACHER  
**Query Params:** `page`, `limit`, `status`, `paymentMethod`, `search`, `paymentDateFrom`, `paymentDateTo`, `submissionDateFrom`, `submissionDateTo`, `amountFrom`, `amountTo`, `studentName`, `sortBy`, `sortOrder`, `hasLateFee`, `hasAttachment`

---

#### Get Pending Submissions (all payments in institute)
```
GET /institute-payment-submissions/institute/:instituteId/pending-submissions
```
**Access:** SUPERADMIN, INSTITUTE_ADMIN, TEACHER  
**Query Params:** `page`, `limit`, `search`  
**Response:** List of pending submissions across all payments, ordered oldest-first for efficient backlog processing.

---

#### Verify / Reject a Submission
```
PATCH /institute-payment-submissions/institute/:instituteId/submission/:submissionId/verify
```
**Access:** SUPERADMIN, INSTITUTE_ADMIN, TEACHER  
**Body:**
```json
{
  "status": "VERIFIED",
  "notes": "Verified with bank statement"
}
```
Or for rejection:
```json
{
  "status": "REJECTED",
  "rejectionReason": "Receipt image is blurry — please re-upload a clear photo",
  "notes": "Contacted student via phone"
}
```

---

#### Get Student Submissions (Admin/Parent View)
```
GET /institute-payment-submissions/institute/:instituteId/student/:studentId/submissions
```
**Access:** SUPERADMIN, INSTITUTE_ADMIN, TEACHER, PARENT (own child only)

---

#### Get Submission Details
```
GET /institute-payment-submissions/institute/:instituteId/submission/:submissionId
```
**Access:** Any institute member (own submission or admin)

---

### 3.2 Student / Parent Endpoints

#### View My Applicable Payments
```
GET /institute-payments/institute/:instituteId/my-payments
```
**Access:** STUDENT, PARENT  
Shows only payments matching the user's `targetType`:
- **Students** see `STUDENTS` and `BOTH` payments
- **Parents** see `PARENTS` and `BOTH` payments
- **Admins/Teachers** get an empty list (they are not payers)

---

#### Get My Payment Summary
```
GET /institute-payments/institute/:instituteId/my-summary
```
**Access:** STUDENT, PARENT  
**Response:**
```json
{
  "success": true,
  "data": {
    "totalApplicable": 5,
    "totalPaid": 3,
    "totalPending": 1,
    "totalRejected": 1,
    "totalAmountDue": 25000.00,
    "totalAmountPaid": 15000.00,
    "outstandingBalance": 10000.00
  }
}
```

---

#### Submit Payment Proof
```
POST /institute-payment-submissions/institute/:instituteId/payment/:paymentId/submit
```
**Access:** STUDENT, PARENT only  
**Rate Limit:** 5 submissions per 15 minutes  
**Body:**
```json
{
  "paymentAmount": 5000.00,
  "paymentMethod": "BANK_TRANSFER",
  "transactionReference": "TXN123456789",
  "paymentDate": "2025-01-15T10:30:00Z",
  "receiptUrl": "payment-receipts/receipt-uuid.jpg",
  "paymentRemarks": "Paid for January month",
  "lateFeeApplied": 0
}
```

> **Important:** Upload the receipt image first via `POST /upload/verify-and-publish`, then pass the returned path as `receiptUrl`.

**Guards:**
- Must be a **payer role** (STUDENT or PARENT)
- Payment must be **ACTIVE** and not past the **due date**
- Must match the payment's **targetType** (students can't submit for parent-only payments)
- Cannot submit **duplicate** for the same payment

---

#### View My Submissions
```
GET /institute-payment-submissions/institute/:instituteId/my-submissions
```
**Access:** STUDENT, PARENT  
**Query Params:** `page`, `limit`, `status`

---

## 4. Class-Subject-Level Payments

**Base URL:** `/institute-class-subject-payments` (payment CRUD) and `/institute-class-subject-payment-submissions` (submission workflows)

All endpoints include `/:instituteId/class/:classId/subject/:subjectId` in the path.

### 4.1 Admin / Teacher Endpoints

#### Create Payment Request
```
POST /institute-class-subject-payments/institute/:instituteId/class/:classId/subject/:subjectId
```
**Access:** SUPERADMIN, INSTITUTE_ADMIN, TEACHER (with subject access)  
**Rate Limit:** 10 per minute  
**Body:**
```json
{
  "title": "Lab Material Fee — Chemistry",
  "description": "Chemistry lab materials for the semester",
  "targetType": "STUDENTS",
  "priority": "MANDATORY",
  "amount": 2500.00,
  "documentUrl": "payment-docs/lab-fee-notice.pdf",
  "lastDate": "2025-02-15T23:59:59Z",
  "notes": "Pay at the office or transfer online"
}
```

---

#### List Payments (by Subject)
```
GET /institute-class-subject-payments/institute/:instituteId/class/:classId/subject/:subjectId
```
**Access:** Any institute member  
**Query Params:** `page`, `limit`

---

#### Get Payment Details
```
GET /institute-class-subject-payments/institute/:instituteId/class/:classId/subject/:subjectId/payment/:paymentId
```
**Access:** Any institute member

---

#### Update Payment
```
PATCH /institute-class-subject-payments/institute/:instituteId/class/:classId/subject/:subjectId/payment/:paymentId
```
**Access:** SUPERADMIN, INSTITUTE_ADMIN, TEACHER (with subject access)

---

#### List Payments by Class (all subjects)
```
GET /institute-class-subject-payments/institute/:instituteId/class/:classId/payments
```
**Access:** Any institute member  
**Query Params:** `page`, `limit`

---

#### List Payments by Institute (all classes)
```
GET /institute-class-subject-payments/institute/:instituteId/payments
```
**Access:** SUPERADMIN, INSTITUTE_ADMIN  
**Query Params:** `page`, `limit`

---

#### Get Enrolled Users (for a class/subject)
```
GET /institute-class-subject-payments/institute/:instituteId/class/:classId/subject/:subjectId/enrolled-users
```
**Access:** SUPERADMIN, INSTITUTE_ADMIN, TEACHER (with subject access)  

> **Note:** This endpoint returns enrollment data from the student enrollment service.

---

#### Get All Submissions (Admin/Teacher)
```
GET /institute-class-subject-payment-submissions/institute/:instituteId/class/:classId/subject/:subjectId/all-submissions
```
**Access:** SUPERADMIN, INSTITUTE_ADMIN, TEACHER (with subject access)  
**Query Params:** `page`, `limit`, `status` (PENDING | VERIFIED | REJECTED)

---

#### Get Submission Statistics
```
GET /institute-class-subject-payment-submissions/institute/:instituteId/class/:classId/subject/:subjectId/stats
```
**Access:** SUPERADMIN, INSTITUTE_ADMIN, TEACHER (with subject access)  
**Response:**
```json
{
  "totalSubmissions": 45,
  "verifiedSubmissions": 32,
  "pendingSubmissions": 8,
  "rejectedSubmissions": 5,
  "verificationRate": "71.11"
}
```

---

#### Verify / Reject Submission
```
PATCH /institute-class-subject-payment-submissions/submission/:submissionId/verify
```
**Access:** SUPERADMIN, INSTITUTE_ADMIN, TEACHER (with subject access)  
**Body:** Same as institute-level verification (see [Section 3.1](#verify--reject-a-submission))

---

### 4.2 Student / Parent Endpoints

#### View My Applicable Payments
```
GET /institute-class-subject-payments/institute/:instituteId/class/:classId/subject/:subjectId/my-payments
```
**Access:** STUDENT, PARENT  
Shows only payments matching the user's institute role:
- **Students** see `STUDENTS`-targeted payments
- **Parents** see `PARENTS`-targeted payments
- Non-payers get an empty list

---

#### Submit Payment Proof
```
POST /institute-class-subject-payment-submissions/payment/:paymentId/submit
```
**Access:** STUDENT, PARENT only  
**Rate Limit:** 5 submissions per 15 minutes  
**Body:**
```json
{
  "paymentDate": "2025-01-15T10:30:00Z",
  "submittedAmount": 2500.00,
  "transactionId": "TXN987654321",
  "receiptUrl": "payment-receipts/receipt-uuid.jpg",
  "notes": "Transferred via BOC internet banking"
}
```

**Guards (same as institute-level):**
- Must be a payer role (STUDENT or PARENT)
- Payment must be ACTIVE and before deadline
- Must match targetType
- No duplicate submissions

---

#### Check My Submission Status
```
GET /institute-class-subject-payment-submissions/payment/:paymentId/my-status
```
**Access:** STUDENT, PARENT  
**Response:**
```json
{
  "hasSubmission": true,
  "submission": { "id": "123", "status": "PENDING", ... },
  "payment": { "id": "456", "title": "Lab Fee", "amount": 2500, ... }
}
```

---

#### View My Submissions (by subject)
```
GET /institute-class-subject-payment-submissions/institute/:instituteId/class/:classId/subject/:subjectId/my-submissions
```
**Access:** STUDENT, PARENT  
**Query Params:** `page`, `limit`

Returns comprehensive preview data including:
- Submission details with receipt URL
- Payment preview (title, amount, status)
- Verification timeline
- Available actions (canResubmit, canDelete, etc.)

---

#### Get Submission Details
```
GET /institute-class-subject-payment-submissions/submission/:submissionId
```
**Access:** Any institute member (own submission or admin)

Returns detailed data including:
- Full payment information
- Receipt download URL
- Verification timeline with status history
- Available actions

---

#### Delete Submission (before verification)
```
PATCH /institute-class-subject-payment-submissions/submission/:submissionId/delete
```
**Access:** STUDENT, PARENT (own pending submission only)  
**Constraints:**
- Only the submission creator can delete
- Cannot delete VERIFIED submissions
- REJECTED submissions can be deleted

---

## 5. Payment Submission Workflow

```
┌──────────────┐     ┌──────────────┐     ┌──────────────────┐
│  Admin/Teacher│────>│ Create       │────>│ Payment Request  │
│  creates      │     │ Payment      │     │ status: ACTIVE   │
└──────────────┘     └──────────────┘     └──────────────────┘
                                                  │
                                                  ▼
┌──────────────┐     ┌──────────────┐     ┌──────────────────┐
│  Student/     │────>│ Upload       │────>│ Submission       │
│  Parent       │     │ Receipt &    │     │ status: PENDING  │
│  submits      │     │ Submit       │     │                  │
└──────────────┘     └──────────────┘     └──────────────────┘
                                                  │
                                          ┌───────┴───────┐
                                          ▼               ▼
                                   ┌──────────┐   ┌───────────┐
                                   │ VERIFIED  │   │ REJECTED  │
                                   │           │   │           │
                                   └──────────┘   └───────────┘
                                                        │
                                                        ▼
                                                  ┌───────────┐
                                                  │ Student   │
                                                  │ can re-   │
                                                  │ submit    │
                                                  └───────────┘
```

### Step-by-Step

1. **Upload receipt** via `POST /upload/verify-and-publish` — returns a relative path
2. **Submit payment** passing the `receiptUrl` in the request body
3. Submission enters **PENDING** status
4. Admin/Teacher reviews via **pending-submissions** endpoint or per-payment submission list
5. Admin verifies (`VERIFIED`) or rejects (`REJECTED` with mandatory `rejectionReason`)
6. If rejected, student can **delete** the old submission and **re-submit** a new one (if payment is still active and before deadline)

### Verified Submission Side Effects
- User cache is refreshed (`userManagementService.refreshUserCache`)
- This ensures downstream services reflect the current payment status

---

## 6. Data Types & Enums

### PaymentTargetType (Institute-Level)
| Value | Description |
|---|---|
| `STUDENTS` | Only students see this payment |
| `PARENTS` | Only parents see this payment |
| `BOTH` | Both students and parents see this payment |

### PaymentTargetType (Class-Subject-Level)
| Value | Description |
|---|---|
| `STUDENTS` | Only students see this payment |
| `PARENTS` | Only parents see this payment |

> **Note:** Class-subject payments do NOT have a `BOTH` option.

### PaymentPriority
| Value | Description |
|---|---|
| `MANDATORY` | Must be paid |
| `OPTIONAL` | Optional payment |
| `DONATION` | Voluntary donation |

### PaymentStatus / PaymentRequestStatus
| Value | Description |
|---|---|
| `ACTIVE` | Currently accepting submissions |
| `INACTIVE` | Paused — not accepting submissions |
| `COMPLETED` | All expected payments received (institute-level only) |
| `EXPIRED` | Past the deadline |

### SubmissionStatus
| Value | Description |
|---|---|
| `PENDING` | Awaiting admin review |
| `VERIFIED` | Payment confirmed |
| `REJECTED` | Payment rejected (reason required) |

### PaymentMethodType (Institute-Level Only)
| Value | Description |
|---|---|
| `BANK_TRANSFER` | Bank transfer |
| `ONLINE_PAYMENT` | Online payment gateway |
| `CASH_DEPOSIT` | Cash deposit at bank |
| `UPI` | UPI/mobile payment |
| `CHEQUE` | Cheque payment |

---

## 7. Request / Response Examples

### Create Institute Payment — Full Example

**Request:**
```http
POST /institute-payments/institute/101/payments
Authorization: Bearer <admin-jwt-token>
Content-Type: application/json

{
  "paymentType": "Annual Sports Fee",
  "description": "Annual sports equipment and facility maintenance fee for all students.",
  "amount": 3000.00,
  "dueDate": "2025-03-01T23:59:59Z",
  "targetType": "STUDENTS",
  "priority": "MANDATORY",
  "paymentInstructions": "Transfer to BOC account 12345678. Include your student ID in the reference.",
  "bankDetails": {
    "bankName": "Bank of Ceylon",
    "accountNumber": "1234567890",
    "accountHolderName": "ABC Sports Academy"
  },
  "lateFeeAmount": 300.00,
  "lateFeeAfterDays": 7
}
```

**Response (201):**
```json
{
  "success": true,
  "message": "Payment created successfully",
  "data": {
    "paymentId": "42",
    "status": "ACTIVE"
  }
}
```

### Submit Payment — Full Example

**Request:**
```http
POST /institute-payment-submissions/institute/101/payment/42/submit
Authorization: Bearer <student-jwt-token>
Content-Type: application/json

{
  "paymentAmount": 3000.00,
  "paymentMethod": "BANK_TRANSFER",
  "transactionReference": "BOC-2025-01-TXN456",
  "paymentDate": "2025-01-20T14:30:00Z",
  "receiptUrl": "payment-receipts/abc123-receipt.jpg",
  "paymentRemarks": "Paid annual sports fee"
}
```

**Response (201):**
```json
{
  "success": true,
  "message": "Payment submitted successfully",
  "data": {
    "submissionId": "789",
    "status": "PENDING"
  }
}
```

### Verify Submission — Full Example

**Request:**
```http
PATCH /institute-payment-submissions/institute/101/submission/789/verify
Authorization: Bearer <admin-jwt-token>
Content-Type: application/json

{
  "status": "VERIFIED",
  "notes": "Matched with bank statement entry dated 20-Jan-2025"
}
```

**Response (200):**
```json
{
  "success": true,
  "message": "Payment submission verified successfully"
}
```

---

## 8. Error Codes Reference

| Error Code | HTTP Status | Description |
|---|:---:|---|
| `PAYMENT_NOT_FOUND` | 404 | Payment ID does not exist |
| `SUBMISSION_NOT_FOUND` | 404 | Submission ID does not exist |
| `USER_NOT_FOUND` | 404 | User from JWT not found in database |
| `NO_INSTITUTE_ACCESS` | 403 | User is not enrolled in this institute |
| `NOT_A_PAYER_ROLE` | 403 | Admin/Teacher tried to submit a payment (only students/parents can) |
| `PAYMENT_TARGET_MISMATCH` | 403 | Student tried to submit a parent-only payment (or vice versa) |
| `PAYMENT_INACTIVE` | 400 | Payment is no longer accepting submissions |
| `PAYMENT_EXPIRED` | 400 | Submission deadline has passed |
| `DUPLICATE_SUBMISSION` | 400 | User already submitted for this payment |
| `SUBMISSION_ALREADY_PROCESSED` | 400 | Cannot verify/reject a non-PENDING submission |
| `REJECTION_REASON_REQUIRED` | 400 | Must provide reason when rejecting |
| `FILE_UPLOAD_DEPRECATED` | 400 | Direct file upload not supported; use `receiptUrl` |
| `VERIFIED_SUBMISSION_DELETE_DENIED` | 400 | Cannot delete a verified submission |
| `SUBMISSION_DELETE_DENIED` | 403 | Only the creator can delete their submission |

---

## 9. Frontend Integration Notes

### For Student / Parent Apps

1. **Dashboard Flow:**
   - Call `GET .../my-payments` to show applicable payment cards
   - Show `targetType` badge so users know who the payment is for
   - Use `GET .../my-summary` (institute-level) to show overall payment status
   - Use `GET .../my-status` (class-subject-level) to check per-payment submission state

2. **Submit Payment Flow:**
   - Upload receipt image via `POST /upload/verify-and-publish`
   - On success, call the submit endpoint with the returned `receiptUrl`
   - Show PENDING status immediately after submission
   - Poll or re-fetch submission status to show VERIFIED/REJECTED updates

3. **Resubmission Flow (after rejection):**
   - Check `statusIndicators.canResubmit` from the submission response
   - If true, user can delete the rejected submission then create a new one
   - Only works while the payment is still ACTIVE and before the deadline

4. **Rate Limits:**
   - Submit: 5 per 15 minutes
   - Create payment: 10 per minute

### For Admin / Teacher Dashboards

1. **Payment Management:**
   - Use `GET .../stats` for dashboard overview cards
   - Use the paginated list endpoints for payment tables
   - Support all query filters (status, search, date ranges, etc.)

2. **Submission Review Queue:**
   - Use `GET .../pending-submissions` for the review queue (oldest first)
   - Use per-payment `GET .../submissions` for detailed per-payment view
   - Show submitter name, amount, receipt preview, and transaction reference

3. **Verification Actions:**
   - Show VERIFY and REJECT buttons for PENDING submissions
   - Rejection MUST include a reason (enforced server-side)
   - After verification, the UI should refresh the submission list
   - The student's cached data is refreshed automatically server-side

4. **Cross-Level Views:**
   - Institute-level: `GET /institute-payments/institute/:id` — all institute fees
   - Class-level: `GET /institute-class-subject-payments/institute/:id/class/:classId/payments` — all subjects in a class
   - Subject-level: `GET /institute-class-subject-payments/institute/:id/class/:classId/subject/:subjectId` — specific subject

### Common Patterns

- All paginated responses include: `{ data, total, page, limit, totalPages }`
- Institute-level submissions also include `hasNextPage` / `hasPreviousPage`
- Dates are returned in ISO 8601 format (Sri Lanka timezone handled server-side)
- Receipt URLs are returned as full URLs (server transforms relative paths)
- All monetary amounts use 2 decimal places (max 999,999.99)
