# Institute User Creation & Image Management — Complete API Guide

> **Scope:** This document covers the full lifecycle of creating users (institute admins,
> teachers, and students) within an institute, attaching images, and the downstream
> effects on ID card generation.

---

## Table of Contents

1. [Overview & Design Principles](#1-overview--design-principles)
2. [User Roles & Types](#2-user-roles--types)
3. [Image Rules](#3-image-rules)
4. [ID Card Rule](#4-id-card-rule)
5. [API Reference](#5-api-reference)
   - 5.1 [Institute Admin: Create User in Institute](#51-institute-admin-create-user-in-institute)
   - 5.2 [System Admin: Create Family Unit](#52-system-admin-create-family-unit)
   - 5.3 [Upload Signed URL (Pre-Upload)](#53-upload-signed-url-pre-upload)
   - 5.4 [System Admin: Approve Global Image](#54-system-admin-approve-global-image)
   - 5.5 [System Admin: Reject Global Image](#55-system-admin-reject-global-image)
   - 5.6 [Get Image Verification Status](#56-get-image-verification-status)
   - 5.7 [User Card Order](#57-user-card-order)
6. [Flow Diagrams](#6-flow-diagrams)
7. [Database Tables Affected](#7-database-tables-affected)
8. [Request Examples](#8-request-examples)

---

## 1. Overview & Design Principles

| Concern | Rule |
|---------|------|
| **Institute image** | Auto-verified when set by an institute admin or system admin. Creates a `user_images` row with `scope=INSTITUTE, status=VERIFIED`. |
| **Global / system image** | Requires **system admin (SUPER_ADMIN) approval**. Creates a `user_images` row with `scope=GLOBAL, status=PENDING`. `user.imageUrl` stays `NULL` until approved. |
| **ID card email** | Only dispatched when `user.imageUrl` is set **AND** `user.imageVerificationStatus=VERIFIED`. |
| **Physical card order** | Blocked until at least one `VERIFIED` image exists (`user.imageUrl` set, or any `user_images` row is `VERIFIED`). |
| **Audit trail** | Every image submission (creation, approval, rejection) creates or updates a `user_images` row — no history is lost. |

---

## 2. User Roles & Types

### Global `UserType` (stored in `users` table)

| Value | Description |
|-------|-------------|
| `USER` | Full flexibility — can be student, teacher, admin, and parent |
| `USER_WITHOUT_PARENT` | Can play any institute role but cannot be a parent |
| `USER_WITHOUT_STUDENT` | Can be a parent but not a student |
| `SUPER_ADMIN` | System-wide administrator |
| `ORGANIZATION_MANAGER` | Organization-level access |

### Institute `InstituteUserType` (stored in `institute_user` table)

| Value | Automatically assigned global type | Student record? |
|-------|------------------------------------|-----------------|
| `STUDENT` | `USER` | ✅ Yes |
| `TEACHER` | `USER_WITHOUT_STUDENT` | No |
| `INSTITUTE_ADMIN` | `USER_WITHOUT_STUDENT` | No |
| `ATTENDANCE_MARKER` | `USER_WITHOUT_STUDENT` | No |
| `PARENT` | `USER_WITHOUT_STUDENT` | No |

---

## 3. Image Rules

### 3.1 Institute-Scoped Image (`instituteUserImageUrl`)

```
Upload via signed URL → POST /institutes/:id/users (or family-unit) with `instituteUserImageUrl`
                     ↓
user_images row inserted:
  - scope        = INSTITUTE
  - institute_id = <instituteId>
  - status       = VERIFIED          ← auto-verified
  - verified_by  = <adminUserId>

institute_user row updated:
  - institute_user_image_url   = <URL>
  - image_verification_status  = VERIFIED
  - image_verified_by          = <adminUserId>
```

**Used for:** Institute-specific ID cards, attendance photos.  
**Approval required:** No.  
**Who can set it:** Institute admin, system admin.

---

### 3.2 Global Image (`globalImageUrl` / self-upload)

```
Upload via signed URL → submit URL to API
                     ↓
user_images row inserted:
  - scope  = GLOBAL
  - status = PENDING         ← awaits system admin approval

users row:
  - imageUrl               = NULL      ← not set until approved
  - imageVerificationStatus = PENDING
                     ↓
System admin reviews via GET /admin/users/unverified-images
                     ↓
APPROVE → user_images.status = VERIFIED
        → users.imageUrl = <URL>
        → users.imageVerificationStatus = VERIFIED
        → ID card email dispatched ✅

REJECT  → user_images.status = REJECTED
        → users.imageVerificationStatus = REJECTED
        → Cloud file deleted
        → ID card email NOT sent
```

**Used for:** Global profile image visible across all institutes.  
**Approval required:** Yes — by SUPER_ADMIN.  
**Who can set it:** Any user (self-service), institute admins, system admins.

---

## 4. ID Card Rule

> **No ID card email is dispatched and no physical card order is allowed
> until the user has at least one VERIFIED image.**

| Condition | ID card email sent? | Physical card order allowed? |
|-----------|--------------------|-----------------------------|
| No image at all | ❌ No | ❌ Blocked |
| Global image PENDING | ❌ No | ❌ Blocked |
| Global image REJECTED | ❌ No | ❌ Blocked |
| Global image VERIFIED (`user.imageUrl` set) | ✅ Yes | ✅ Allowed |
| Institute image VERIFIED (any `user_images` record) | Email: ❌ No (no global imageUrl) | ✅ Allowed |

---

## 5. API Reference

### 5.1 Institute Admin: Create User in Institute

```
POST /institutes/:instituteId/users
```

**Access:** JWT — caller must be `INSTITUTE_ADMIN` (active) in the target institute.

#### Path Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `instituteId` | string (bigint) | Institute ID |

#### Request Body (`CreateInstituteUserDto`)

```jsonc
{
  // ── Identity (at least one of email / phoneNumber required) ──────────────
  "firstName": "Kasun",
  "lastName": "Perera",
  "nameWithInitials": "K.B. Perera",       // optional — auto-generated
  "email": "kasun@school.lk",
  "phoneNumber": "+94771234567",
  "gender": "MALE",                         // MALE | FEMALE | OTHER
  "dateOfBirth": "2005-06-15",              // YYYY-MM-DD
  "nic": "200512345678",
  "addressLine1": "12 Main St",
  "city": "Colombo",
  "district": "COLOMBO",
  "province": "WESTERN",
  "language": "ENGLISH",                    // ENGLISH | SINHALA | TAMIL
  "password": "secretPass123",             // optional — omit for first-login flow

  // ── Role ─────────────────────────────────────────────────────────────────
  "instituteUserType": "STUDENT",           // STUDENT | TEACHER | INSTITUTE_ADMIN | ATTENDANCE_MARKER

  // ── Institute tracking ───────────────────────────────────────────────────
  "userIdByInstitute": "RC-2026-001",       // admission number / index
  "instituteCardId": "CARD-LIB-0042",       // library / access card

  // ── Images ───────────────────────────────────────────────────────────────
  "instituteUserImageUrl": "profile-images/1/1743000000000_photo.jpg",
  //  ^ Upload via GET /upload/generate-signed-url first.
  //  ^ Automatically VERIFIED (scope=INSTITUTE). Used for institute ID card.

  "globalImageUrl": "profile-images/1/1743000000001_photo.jpg",
  //  ^ Saved as PENDING. Requires SUPER_ADMIN approval.
  //  ^ user.imageUrl stays NULL until approved.
  //  ^ No ID card email until approved.

  // ── Class & subject enrollment (STUDENT only) ────────────────────────────
  "classEnrollments": [
    {
      "classId": "201",
      "subjectEnrollments": [
        { "subjectId": "301" },
        { "subjectId": "302" }
      ]
    },
    {
      "classId": "202"
    }
  ],

  // ── Student-specific ─────────────────────────────────────────────────────
  "studentData": {
    "studentId": "STU-2026-0001234",        // optional — auto-generated
    "emergencyContact": "+94771111111",
    "bloodGroup": "O+",
    "medicalConditions": "Asthma",
    "allergies": "Peanuts"
  },

  // ── Parents (STUDENT only) ───────────────────────────────────────────────
  "father": {
    "firstName": "Nimal",
    "phoneNumber": "+94772345678"
  },
  "mother": {
    "email": "mother@example.com"
  },

  // ── Notifications ────────────────────────────────────────────────────────
  "sendWelcomeNotifications": true
}
```

#### Successful Response (`201 Created`)

```jsonc
{
  "success": true,
  "message": "STUDENT created and enrolled in Royal College Colombo",
  "userId": "1234",
  "firstName": "Kasun",
  "lastName": "Perera",
  "nameWithInitials": "K.B. Perera",
  "email": "kasun@school.lk",
  "phoneNumber": "+94771234567",
  "instituteUserType": "STUDENT",
  "profileCompletionStatus": "BASIC",       // INCOMPLETE | BASIC | COMPLETE
  "profileCompletionPercentage": 65,
  "requiresFirstLogin": false,
  "studentId": "STU-2026-0001234",

  "instituteImage": {
    "scope": "INSTITUTE",
    "status": "VERIFIED",
    "imageUrl": "https://storage.suraksha.lk/profile-images/1/1743000000000_photo.jpg",
    "note": "Auto-verified by institute admin"
  },

  "globalImage": {
    "scope": "GLOBAL",
    "status": "PENDING",
    "imageUrl": "https://storage.suraksha.lk/profile-images/1/1743000000001_photo.jpg",
    "note": "Requires system admin approval. ID card will be sent after approval."
  },

  "classEnrollments": [
    {
      "classId": "201",
      "className": "Grade 12 - Science",
      "success": true,
      "subjectEnrollments": [
        { "subjectId": "301", "enrolled": true },
        { "subjectId": "302", "enrolled": true }
      ]
    }
  ],

  "welcomeNotificationSent": true
}
```

#### Error Responses

| Status | Condition |
|--------|-----------|
| `400` | email / phone not provided, or user with that email/phone already exists |
| `403` | Caller is not an active INSTITUTE_ADMIN of this institute |
| `404` | Institute not found |

---

### 5.2 System Admin: Create Family Unit

```
POST /admin/users/family-unit
```

**Access:** JWT + SUPER_ADMIN role.

#### Key enhancements (new behaviour)

- When `student.imageUrl` is provided → a `user_images` row is created with
  `scope=GLOBAL, status=VERIFIED` (system admin is trusted).
- When `instituteEnrollments[].instituteUserImageUrl` is provided → a `user_images` row
  is created with `scope=INSTITUTE, status=VERIFIED` in addition to setting
  `institute_user.institute_user_image_url`.
- ID card email is only dispatched when `user.imageVerificationStatus = VERIFIED`.

#### Request Body (`CreateFamilyUnitDto`) — key fields

```jsonc
{
  "student": {
    "firstName": "Amali",
    "email": "amali@school.lk",
    "imageUrl": "profile-images/u1/photo.jpg"   // → GLOBAL, VERIFIED row created
  },
  "father": { "phoneNumber": "+94772345678" },
  "sendWelcomeNotifications": true,

  "instituteEnrollments": [
    {
      "instituteId": "100",
      "instituteUserType": "STUDENT",
      "userIdByInstitute": "RC-2026-002",
      "instituteUserImageUrl": "profile-images/u1/institute-photo.jpg",  // → INSTITUTE, VERIFIED
      "instituteCardId": "CARD-0099",
      "classEnrollments": [
        {
          "classId": "201",
          "subjectEnrollments": [{ "subjectId": "301" }]
        }
      ]
    }
  ]
}
```

---

### 5.3 Upload Signed URL (Pre-Upload)

Before submitting any image URL to the create-user endpoints, upload the file:

```
GET /upload/generate-signed-url?folder=profile-images&fileName=photo.jpg&contentType=image/jpeg
```

**Returns:**

```jsonc
{
  "uploadUrl": "https://storage.googleapis.com/...",
  "relativePath": "profile-images/1/1743000000000_photo.jpg",
  "expiresAt": "2026-03-15T10:10:00.000Z"
}
```

Use `relativePath` as the value for `instituteUserImageUrl` or `globalImageUrl`.

---

### 5.4 System Admin: Approve Global Image

```
PATCH /admin/users/:userId/approve-image
```

**Access:** SUPER_ADMIN  
**Body:**

```jsonc
{ "imageId": "456" }   // optional — if omitted, latest PENDING image is used
```

**Effect:**

- `user_images` row → `status=VERIFIED`
- `users.imageUrl` → set to the image URL
- `users.imageVerificationStatus` → `VERIFIED`
- `users.imageVerifiedBy` → admin user ID
- ID card email dispatched if user has `cardId`

---

### 5.5 System Admin: Reject Global Image

```
PATCH /admin/users/:userId/reject-image
```

**Access:** SUPER_ADMIN  
**Body:**

```jsonc
{
  "imageId": "456",
  "rejectionReason": "Image is blurry and face is not clearly visible"
}
```

**Effect:**

- `user_images` row → `status=REJECTED`
- Cloud file deleted
- `users.imageVerificationStatus` → `REJECTED`
- `users.imageRejectionReason` → reason text

---

### 5.6 Get Image Verification Status

```
GET /users/profile/image-status
```

**Access:** Any authenticated user (self).

**Response:**

```jsonc
{
  "success": true,
  "data": {
    "userId": "1234",
    "imageUrl": null,                         // null until global image is VERIFIED
    "pendingImageUrl": "https://storage.suraksha.lk/profile-images/...",
    "pendingImageId": "456",
    "imageVerificationStatus": "PENDING"      // PENDING | VERIFIED | REJECTED | null
  }
}
```

---

### 5.7 User Card Order

```
POST /cards/orders
```

**Access:** Authenticated user (self).

**Image gate (new):** The request is blocked with `400 Bad Request` if the user has
no verified image:

```jsonc
{
  "statusCode": 400,
  "message": "A verified profile image is required before ordering an ID card. Please upload an image and wait for system admin approval."
}
```

The order proceeds normally once any of the following conditions is met:
- `user.imageUrl` is set AND `user.imageVerificationStatus = VERIFIED`
- OR any `user_images` row for that user has `status = VERIFIED`

---

## 6. Flow Diagrams

### 6.1 Institute Admin Creates a Student

```
Institute Admin
   │
   ├─1─▶  GET /upload/generate-signed-url
   │       → gets { uploadUrl, relativePath }
   │
   ├─2─▶  PUT <uploadUrl>  (browser/mobile uploads file directly to cloud)
   │
   ├─3─▶  POST /institutes/:id/users
   │       body: { ..., instituteUserImageUrl: relativePath,
   │                    globalImageUrl: anotherRelativePath }
   │
   │   Backend:
   │    ├─ Creates user in `users` table (imageUrl=NULL if globalImageUrl provided)
   │    ├─ Creates `students` record
   │    ├─ Creates `user_images` row (scope=INSTITUTE, status=VERIFIED)
   │    ├─ Creates `user_images` row (scope=GLOBAL, status=PENDING)
   │    ├─ Creates `institute_user` row (status=ACTIVE, imageVerificationStatus=VERIFIED)
   │    ├─ Enrolls in classes & subjects
   │    └─ Sends welcome email (NOT ID card — image PENDING)
   │
   └─4─▶  System Admin reviews pending images
           GET /admin/users/unverified-images
```

### 6.2 Global Image Approval & ID Card Dispatch

```
System Admin
   │
   ├─1─▶  GET /admin/users/unverified-images
   │       → list of users with PENDING images
   │
   ├─2─▶  Reviews image
   │
   ├─3a─▶ APPROVE: PATCH /admin/users/:id/approve-image
   │         → user.imageUrl set
   │         → user.imageVerificationStatus = VERIFIED
   │         → ID card email dispatched ✅
   │
   └─3b─▶ REJECT: PATCH /admin/users/:id/reject-image  { rejectionReason }
             → cloud file deleted
             → user.imageVerificationStatus = REJECTED
             → No ID card ❌
```

### 6.3 Physical Card Order Gate

```
User
  │
  ├─▶  POST /cards/orders
  │
  │  Backend checks:
  │   ├─ user.imageUrl != null AND imageVerificationStatus = VERIFIED?  YES → proceed
  │   ├─ OR any user_images row with status=VERIFIED?                   YES → proceed
  │   └─ Neither condition met:
  │        → 400 "A verified profile image is required before ordering an ID card"
  │
  └─▶  Order created (PENDING_PAYMENT)
```

---

## 7. Database Tables Affected

### `user_images` (per-image audit trail)

| Column | Created when |
|--------|--------------|
| `user_id` | Always |
| `image_url` | Always |
| `scope` | `GLOBAL` (system/global) or `INSTITUTE` (institute-specific) |
| `institute_id` | Only when `scope=INSTITUTE` |
| `status` | `VERIFIED` (institute/system admin-created) or `PENDING` (user-uploaded global) |
| `verified_by` | Set when `status=VERIFIED` |
| `verified_at` | Set when `status=VERIFIED` |
| `rejection_reason` | Set when `status=REJECTED` |

### `institute_user`

| Column | When populated |
|--------|---------------|
| `institute_user_image_url` | When `instituteUserImageUrl` provided during creation |
| `image_verification_status` | `VERIFIED` if image provided by admin, else `PENDING` |
| `image_verified_by` | Set by admin when image is provided/approved |
| `institute_card_id` | When `instituteCardId` provided |
| `user_id_by_institute` | When `userIdByInstitute` provided |
| `status` | `ACTIVE` (institute admin-created), `PENDING` (self-enrolled) |

### `users`

| Column | Behaviour |
|--------|-----------|
| `image_url` | Only set when global image is VERIFIED |
| `image_verification_status` | `PENDING` → `VERIFIED` / `REJECTED` |
| `image_verified_by` | Admin who approved |
| `image_verified_at` | When approved |
| `image_rejection_reason` | When rejected |

---

## 8. Request Examples

### Example A: Institute Admin Creates a Teacher (no image)

```bash
curl -X POST "https://api.suraksha.lk/institutes/42/users" \
  -H "Authorization: Bearer <institute_admin_jwt>" \
  -H "Content-Type: application/json" \
  -d '{
    "firstName": "Priya",
    "lastName": "Silva",
    "email": "priya.silva@school.lk",
    "phoneNumber": "+94771234567",
    "instituteUserType": "TEACHER",
    "userIdByInstitute": "TCH-2026-007",
    "sendWelcomeNotifications": true
  }'
```

---

### Example B: Institute Admin Creates a Student with Institute Image + Classes

```bash
# Step 1 — Get signed upload URL
curl "https://api.suraksha.lk/upload/generate-signed-url?folder=profile-images&fileName=kasun.jpg&contentType=image/jpeg" \
  -H "Authorization: Bearer <jwt>"

# Step 2 — Upload file to returned uploadUrl (browser/mobile handles this)

# Step 3 — Create student with the relativePath from Step 1
curl -X POST "https://api.suraksha.lk/institutes/42/users" \
  -H "Authorization: Bearer <institute_admin_jwt>" \
  -H "Content-Type: application/json" \
  -d '{
    "firstName": "Kasun",
    "lastName": "Perera",
    "email": "kasun@school.lk",
    "gender": "MALE",
    "dateOfBirth": "2005-06-15",
    "instituteUserType": "STUDENT",
    "userIdByInstitute": "RC-2026-001",
    "instituteCardId": "CARD-LIB-0042",
    "instituteUserImageUrl": "profile-images/42/1743000000000_kasun.jpg",
    "classEnrollments": [
      {
        "classId": "201",
        "subjectEnrollments": [
          { "subjectId": "301" },
          { "subjectId": "302" }
        ]
      }
    ],
    "studentData": {
      "emergencyContact": "+94771111111",
      "bloodGroup": "O+",
      "medicalConditions": "None",
      "allergies": "Peanuts"
    },
    "father": {
      "firstName": "Nimal",
      "phoneNumber": "+94772345678"
    },
    "sendWelcomeNotifications": true
  }'
```

---

### Example C: Institute Admin Creates a Student with BOTH Institute AND Global Image

```bash
curl -X POST "https://api.suraksha.lk/institutes/42/users" \
  -H "Authorization: Bearer <institute_admin_jwt>" \
  -H "Content-Type: application/json" \
  -d '{
    "firstName": "Amali",
    "lastName": "Fernando",
    "email": "amali@school.lk",
    "instituteUserType": "STUDENT",
    "instituteUserImageUrl": "profile-images/42/1743000000000_amali_inst.jpg",
    "globalImageUrl":        "profile-images/42/1743000000001_amali_global.jpg",
    "classEnrollments": [{ "classId": "202" }]
  }'
```

Expected outcome:
- Institute image → immediately usable for institute ID card ✅
- Global image → PENDING, system admin must approve before email ID card is sent

---

### Example D: System Admin Approves Image → ID Card Automatically Sent

```bash
curl -X PATCH "https://api.suraksha.lk/admin/users/1234/approve-image" \
  -H "Authorization: Bearer <super_admin_jwt>" \
  -H "Content-Type: application/json" \
  -d '{ "imageId": "456" }'
```

After this call:
- `users.imageUrl` = set
- `users.imageVerificationStatus` = `VERIFIED`
- Welcome + ID card email dispatched to user ✅

---

### Example E: Physical Card Order (blocked until image verified)

```bash
# This will be rejected if no verified image exists
curl -X POST "https://api.suraksha.lk/cards/orders" \
  -H "Authorization: Bearer <user_jwt>" \
  -H "Content-Type: application/json" \
  -d '{
    "cardId": "10",
    "deliveryAddress": "12 Main Street, Colombo 03",
    "contactPhone": "+94771234567"
  }'

# Error if no verified image:
# { "statusCode": 400, "message": "A verified profile image is required before ordering an ID card." }

# Success after system admin approves the global image:
# { "id": "99", "orderStatus": "PENDING_PAYMENT", ... }
```

---

## Appendix: enum Values

### `InstituteUserType`
`STUDENT` | `TEACHER` | `INSTITUTE_ADMIN` | `ATTENDANCE_MARKER` | `PARENT`

### `ImageVerificationStatus`
`PENDING` | `VERIFIED` | `REJECTED`

### `ImageScope` (in `user_images`)
`GLOBAL` | `INSTITUTE`

### `InstituteUserStatus`
`ACTIVE` | `INACTIVE` | `SUSPENDED` | `PENDING` | `FORMER` | `INVITED`

### `ProfileCompletionStatus`
`INCOMPLETE` | `BASIC` | `COMPLETE`

### `CardStatus` (physical card)
`INACTIVE` | `ACTIVE` | `DEACTIVATED` | `EXPIRED` | `LOST` | `DAMAGED` | `REPLACED`

### `OrderStatus` (card order)
`PENDING_PAYMENT` | `PAYMENT_RECEIVED` | `PROCESSING` | `SHIPPED` | `DELIVERED` | `CANCELLED` | `REJECTED`
