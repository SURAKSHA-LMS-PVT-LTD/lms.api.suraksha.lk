# Comprehensive User Creation & Image Upload API Guide

> **Base URL:** `https://lmsapi.suraksha.lk`  
> **Auth:** Bearer JWT or Special API Key (where noted)

---

## Table of Contents

1. [Comprehensive User Creation](#1-comprehensive-user-creation)
2. [Family Unit Creation (Admin)](#2-family-unit-creation-admin)
3. [Bulk Family Unit Creation](#3-bulk-family-unit-creation)
4. [Image Upload Flow Overview](#4-image-upload-flow-overview)
5. [Generic Signed Upload URL](#5-generic-signed-upload-url)
6. [Profile-Image Signed URL (API Key / JWT)](#6-profile-image-signed-url-api-key--jwt)
7. [Verify & Publish Uploaded File](#7-verify--publish-uploaded-file)
8. [Admin: Profile Image by Student ID](#8-admin-profile-image-by-student-id)
9. [Admin: Profile Image by User ID](#9-admin-profile-image-by-user-id)
10. [Admin: Image Verification (Approve / Reject)](#10-admin-image-verification-approve--reject)
11. [Update Profile Image URL (JSON)](#11-update-profile-image-url-json)
12. [Error Reference](#12-error-reference)

---

## 1. Comprehensive User Creation

```
POST /users/comprehensive
```

Creates a user across multiple database tables in a single transaction based on `userType`.

### Authentication

| Method | Header |
|---|---|
| JWT Bearer | `Authorization: Bearer <JWT_TOKEN>` |
| Special API Key | `Authorization: Bearer <SPECIAL_API_KEY>` |

### Allowed Roles (JWT)

`SUPERADMIN`, `ORGANIZATION_MANAGER`, `INSTITUTE_ADMIN`, `TEACHER`

### Table Creation Logic

| `userType` | Tables Created |
|---|---|
| `USER` | `users` + `students` + `parents` |
| `USER_WITHOUT_PARENT` | `users` + `students` |
| `USER_WITHOUT_STUDENT` | `users` + `parents` |
| `SUPERADMIN` / `ORGANIZATION_MANAGER` | `users` only |

### Request Body

```json
{
  "firstName": "Kasun",
  "lastName": "Perera",
  "nameWithInitials": "K. Perera",
  "email": "kasun.perera@example.com",
  "phoneNumber": "+94771234567",
  "userType": "USER",
  "gender": "MALE",
  "dateOfBirth": "2005-08-15",
  "nic": "200512345678",
  "birthCertificateNo": "BC-123456",
  "addressLine1": "123 Galle Road",
  "addressLine2": "Apt 2A",
  "city": "Colombo",
  "district": "COLOMBO",
  "province": "WESTERN",
  "postalCode": "00100",
  "country": "Sri Lanka",
  "imageUrl": "https://storage.googleapis.com/bucket/profile-images/photo.jpg",
  "idUrl": "https://storage.googleapis.com/bucket/id-documents/nic.pdf",
  "isActive": true,
  "instituteId": "INST-20260118-001",
  "studentData": {
    "studentId": "STU-2026-001",
    "emergencyContact": "+94772345678",
    "medicalConditions": "Asthma",
    "allergies": "Peanuts",
    "bloodGroup": "O+",
    "fatherPhoneNumber": "+94773456789",
    "motherPhoneNumber": "+94774567890",
    "fatherSkipReason": "",
    "motherSkipReason": "",
    "guardianSkipReason": ""
  },
  "parentData": {
    "occupation": "ENGINEER",
    "workplace": "ABC Corp",
    "workPhone": "+94112345678",
    "educationLevel": "BSc Engineering"
  }
}
```

### Field Reference

#### Top-Level Fields

| Field | Type | Required | Notes |
|---|---|---|---|
| `firstName` | string | ✅ | 1–50 chars |
| `lastName` | string | ✅ | 1–50 chars |
| `nameWithInitials` | string | ✅ | Auto-generated if empty using Sri Lankan naming convention |
| `email` | string | ✅ | Converted to lowercase; max 60 chars |
| `phoneNumber` | string | ❌ | Auto-normalized to `+94XXXXXXXXX` |
| `userType` | enum | ✅ | `USER`, `USER_WITHOUT_PARENT`, `USER_WITHOUT_STUDENT` |
| `gender` | enum | ❌ | `MALE`, `FEMALE`, `OTHER` |
| `dateOfBirth` | string | ❌ | Format: `YYYY-MM-DD` |
| `nic` | string | ❌ | National ID number |
| `birthCertificateNo` | string | ❌ | Birth certificate number |
| `addressLine1` | string | ❌ | Max 100 chars |
| `addressLine2` | string | ❌ | Max 100 chars |
| `city` | string | ❌ | Max 50 chars |
| `district` | enum | ❌ | Uppercase: `COLOMBO`, `GAMPAHA`, etc. |
| `province` | enum | ❌ | Uppercase: `WESTERN`, `CENTRAL`, etc. |
| `postalCode` | string | ❌ | Max 6 chars |
| `country` | string | ❌ | Defaults to `"Sri Lanka"` if omitted |
| `imageUrl` | string | ❌ | Relative path or full URL from cloud storage |
| `idUrl` | string | ❌ | Relative path or full URL from cloud storage |
| `isActive` | boolean | ❌ | Defaults to `true` |
| `instituteId` | string | ❌ | Enroll user to an institute |

#### `studentData` (required when `userType` = `USER` or `USER_WITHOUT_PARENT`)

| Field | Type | Notes |
|---|---|---|
| `studentId` | string | Auto-generated if omitted; max 15 chars |
| `emergencyContact` | string | Auto-normalized phone |
| `medicalConditions` | string | Free text |
| `allergies` | string | Free text |
| `bloodGroup` | string | `A+`, `A-`, `B+`, `B-`, `O+`, `O-`, `AB+`, `AB-` or enum form |
| `fatherId` | string | Existing user ID for father |
| `fatherPhoneNumber` | string | System fetches father by this phone |
| `motherId` | string | Existing user ID for mother |
| `motherPhoneNumber` | string | System fetches mother by this phone |
| `guardianId` | string | Existing user ID for guardian |
| `guardianPhoneNumber` | string | System fetches guardian by this phone |
| `fatherSkipReason` | string | Reason if father not provided |
| `motherSkipReason` | string | Reason if mother not provided |
| `guardianSkipReason` | string | Reason if guardian not provided |

#### `parentData` (required when `userType` = `USER` or `USER_WITHOUT_STUDENT`)

| Field | Type | Notes |
|---|---|---|
| `occupation` | enum | `ENGINEER`, `DOCTOR`, `TEACHER`, etc. |
| `workplace` | string | Max 100 chars |
| `workPhone` | string | Auto-normalized phone |
| `educationLevel` | string | Max 100 chars |

### Success Response `201 Created`

```json
{
  "success": true,
  "userId": "1234",
  "user": {
    "id": "1234",
    "firstName": "Kasun",
    "lastName": "Perera",
    "email": "ka***n@example.com",
    "phoneNumber": "+947*****567",
    "userType": "USER",
    "isActive": true,
    "createdAt": "2026-03-21T10:00:00.000Z"
  },
  "student": {
    "userId": "1234",
    "studentId": "STU-2026-001",
    "emergencyContact": "+94772345678",
    "bloodGroup": "O+"
  },
  "parent": {
    "id": "567",
    "userId": "1234",
    "occupation": "ENGINEER",
    "workplace": "ABC Corp"
  },
  "summary": {
    "tablesCreated": ["users", "students", "parents"],
    "userType": "USER",
    "totalTablesAffected": 3
  }
}
```

### Error Responses

| Status | Cause |
|---|---|
| `400` | Missing required field, invalid enum, empty email |
| `409` | Duplicate email, phone, or NIC |
| `403` | Insufficient role |

---

## 2. Family Unit Creation (Admin)

```
POST /admin/users/family-unit
```

Creates a complete student + optional parents in one transaction with minimal data. Users are created with `INCOMPLETE` status and must complete a first-login flow.

### Authentication

JWT Bearer — `SUPERADMIN` only

### Request Body

```json
{
  "student": {
    "firstName": "Kasun",
    "lastName": "Perera",
    "phoneNumber": "+94771234567",
    "email": "kasun@example.com",
    "studentId": "STU-2026-001"
  },
  "father": {
    "firstName": "Nimal",
    "phoneNumber": "+94772345678"
  },
  "mother": {
    "email": "mother@example.com"
  },
  "guardian": null,
  "sendWelcomeNotifications": true,
  "instituteCode": "INST-20260122-001"
}
```

### Notes

- Each member only needs **one of** `email` OR `phoneNumber`
- If a parent with the same email/phone already exists, it is reused (not duplicated)
- `studentId` is auto-generated if not provided
- `nameWithInitials` is auto-generated from `firstName` + `lastName`

### Success Response `201 Created`

```json
{
  "success": true,
  "student": { "userId": "1234", "studentId": "STU-2026-001", ... },
  "father": { "userId": "567", ... },
  "mother": { "userId": "890", ... },
  "notificationsSent": true
}
```

---

## 3. Bulk Family Unit Creation

```
POST /admin/users/family-units/bulk
```

Creates multiple family units in batch. Each family is wrapped in its own transaction.

### Authentication

JWT Bearer — `SUPERADMIN` only

### Request Body

```json
{
  "families": [
    {
      "student": { "firstName": "Kasun", "phoneNumber": "+94771111111" },
      "father": { "firstName": "Nimal", "phoneNumber": "+94772222222" }
    },
    {
      "student": { "firstName": "Amali", "email": "amali@example.com" }
    }
  ],
  "continueOnError": true
}
```

### Response

```json
{
  "total": 2,
  "success": 2,
  "failed": 0,
  "results": [...]
}
```

---

## 4. Image Upload Flow Overview

All image uploads follow a **3-step signed URL flow**:

```
Step 1 ─── GET/POST signed upload URL  ──►  Backend returns { uploadUrl, relativePath }
Step 2 ─── PUT <uploadUrl>             ──►  Client uploads file directly to Cloud Storage
Step 3 ─── POST /upload/verify-and-publish  ──►  Backend makes file public, returns publicUrl
```

> **Important:** Files are **private** in cloud storage until Step 3 is completed.

---

## 5. Generic Signed Upload URL

### Option A — GET (query params)

```
GET /upload/get-signed-url?folder=profile-images&fileName=avatar.jpg&contentType=image/jpeg&fileSize=2048576
Authorization: Bearer <JWT_TOKEN>
```

### Option B — POST (JSON body)

```
POST /upload/generate-signed-url
Authorization: Bearer <JWT_TOKEN> or <API_KEY>
Content-Type: application/json
```

```json
{
  "folder": "profile-images",
  "fileName": "user-avatar.jpg",
  "contentType": "image/jpeg",
  "fileSize": 2048576
}
```

### Allowed Folders

| Folder | Use Case | Allowed Types | Max Size |
|---|---|---|---|
| `profile-images` | User profile photos | jpg, jpeg, png, webp | 5 MB |
| `student-images` | Student photos | jpg, jpeg, png, webp | 5 MB |
| `institute-images` | Institute logo | jpg, jpeg, png, webp, svg | 5 MB |
| `id-documents` | NIC / passport scans | jpg, jpeg, png, pdf | 10 MB |
| `homework-files` | Homework submissions | pdf, jpg, jpeg, png, doc, docx | 20 MB |
| `correction-files` | Teacher corrections | pdf, jpg, jpeg, png | 20 MB |
| `institute-payment-receipts` | Institute payments | jpg, jpeg, png, pdf | 10 MB |
| `subject-payment-receipts` | Subject payments | jpg, jpeg, png, pdf | 10 MB |
| `bookhire-vehicle-images` | Transport vehicle photos | jpg, jpeg, png, webp | 5 MB |
| `bookhire-owner-images` | Transport owner photos | jpg, jpeg, png, webp | 5 MB |

### Response

```json
{
  "success": true,
  "message": "Signed URL generated successfully (10 min expiry)",
  "uploadUrl": "https://storage.googleapis.com/bucket/...",
  "publicUrl": "https://storage.googleapis.com/bucket/profile-images/avatar-uuid.jpg",
  "relativePath": "profile-images/avatar-uuid.jpg",
  "expiresAt": "2026-03-21T10:10:00.000Z",
  "instructions": {
    "step1": "PUT <uploadUrl>",
    "step2": "Add header: Content-Type: image/jpeg",
    "step3": "POST /upload/verify-and-publish with relativePath",
    "important": "File is PRIVATE until verify-and-publish is called"
  }
}
```

### Upload the File (Step 2)

```
PUT <uploadUrl>
Content-Type: image/jpeg

<binary file data>
```

---

## 6. Profile-Image Signed URL (API Key / JWT)

Dedicated endpoint for profile images that accepts an API key for external systems.

```
GET /upload/profile-images/get-signed-url?fileName=avatar.jpg&contentType=image/jpeg&fileSize=2048576
Authorization: Bearer <API_KEY_or_JWT>
```

Same response format as Section 5. No `folder` param needed — fixed to `profile-images`.

---

## 7. Verify & Publish Uploaded File

After uploading to the signed URL, call this to make the file publicly accessible.

```
POST /upload/verify-and-publish
Authorization: Bearer <JWT_TOKEN>
Content-Type: application/json
```

```json
{
  "relativePath": "profile-images/avatar-uuid.jpg"
}
```

### Response

```json
{
  "success": true,
  "message": "File verified and made public successfully",
  "publicUrl": "https://storage.googleapis.com/bucket/profile-images/avatar-uuid.jpg",
  "relativePath": "profile-images/avatar-uuid.jpg"
}
```

> Use `publicUrl` when saving to the database or passing to user creation endpoints.

---

## 8. Admin: Profile Image by Student ID

Full workflow using the student's `studentId` (e.g., `STU-20260123-001`).

### Step 1 — Lookup Student

```
GET /admin/users/student/lookup/:studentId
Authorization: Bearer <JWT_TOKEN>
```

**Response:**
```json
{
  "studentId": "STU-20260123-001",
  "userId": "1234",
  "firstName": "Kasun",
  "imageUrl": null
}
```

### Step 2 — Generate Upload URL

```
POST /admin/users/student/profile-image/generate-url
Authorization: Bearer <JWT_TOKEN>
Content-Type: application/json
```

```json
{
  "studentId": "STU-20260123-001",
  "fileName": "profile.jpg",
  "contentType": "image/jpeg",
  "fileSize": 1048576
}
```

**Response:**
```json
{
  "uploadUrl": "https://storage.googleapis.com/...",
  "relativePath": "profile-images/1234/1742553600000-profile-uuid.jpg",
  "expiresAt": "2026-03-21T10:10:00.000Z",
  "contentType": "image/jpeg"
}
```

### Step 2 (Alternative) — Generate URL via Path Param

```
POST /admin/users/student/:studentId/profile-image
Content-Type: application/json

{ "fileName": "profile.jpg", "contentType": "image/jpeg" }
```

### Step 3 — Upload File to Cloud Storage

```
PUT <uploadUrl>
Content-Type: image/jpeg

<binary file data>
```

### Step 4 — Assign Image to Student

```
POST /admin/users/student/profile-image/assign
Authorization: Bearer <JWT_TOKEN>
Content-Type: application/json
```

```json
{
  "studentId": "STU-20260123-001",
  "relativePath": "profile-images/1234/1742553600000-profile-uuid.jpg"
}
```

**Response:**
```json
{
  "success": true,
  "studentId": "STU-20260123-001",
  "userId": "1234",
  "imageUrl": "https://storage.googleapis.com/bucket/profile-images/1234/...",
  "message": "Profile image assigned successfully"
}
```

---

## 9. Admin: Profile Image by User ID

When you have a `userId` (numeric) instead of a `studentId`.

### Lookup User

```
GET /admin/users/lookup/:userId
Authorization: Bearer <JWT_TOKEN>
```

### Generate Upload URL

```
POST /admin/users/profile-image/generate-url
Authorization: Bearer <JWT_TOKEN>
Content-Type: application/json
```

```json
{
  "userId": 1234,
  "fileName": "profile.jpg",
  "contentType": "image/jpeg",
  "fileSize": 1048576
}
```

### Alternative (path param)

```
POST /admin/users/:userId/profile-image
Content-Type: application/json

{ "fileName": "profile.jpg", "contentType": "image/jpeg" }
```

### Upload & Assign

After uploading with `PUT <uploadUrl>`:

```
POST /admin/users/profile-image/assign
Authorization: Bearer <JWT_TOKEN>
Content-Type: application/json
```

```json
{
  "userId": 1234,
  "relativePath": "profile-images/1234/1742553600000-profile-uuid.jpg"
}
```

---

## 10. Admin: Image Verification (Approve / Reject)

### Get Unverified Users

```
GET /admin/users/unverified
GET /admin/users/unverified-images
Authorization: Bearer <JWT_TOKEN>
```

Query params: `page`, `limit`, `status` (`PENDING` | `VERIFIED` | `REJECTED`)

### Approve Image

```
POST /admin/users/:userId/approve-image
Authorization: Bearer <JWT_TOKEN>
Content-Type: application/json

{}
```

**Response:**
```json
{
  "success": true,
  "message": "Profile image approved. Confirmation email sent to user."
}
```

### Reject Image

```
POST /admin/users/:userId/reject-image
Authorization: Bearer <JWT_TOKEN>
Content-Type: application/json
```

```json
{
  "reason": "Image is blurry or does not show full face"
}
```

**What happens on rejection:**
- Image is deleted from cloud storage
- A 7-day signed re-upload URL is generated
- User receives an email with the re-upload link

**Response:**
```json
{
  "success": true,
  "message": "Profile image rejected. User notified via email with re-upload link."
}
```

### Image Statistics

```
GET /admin/users/image-stats
Authorization: Bearer <JWT_TOKEN>
```

```json
{
  "pending": 12,
  "verified": 340,
  "rejected": 5
}
```

### User Image History

```
GET /admin/users/:userId/image-history
Authorization: Bearer <JWT_TOKEN>
```

---

## 11. Update Profile Image URL (JSON)

Update a user's profile image directly via a URL (no file upload needed). SUPERADMIN only.

```
PATCH /users/profile/image-url
Authorization: Bearer <JWT_TOKEN>
Content-Type: application/json
```

```json
{
  "imageUrl": "https://storage.googleapis.com/bucket/profile-images/photo.jpg"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Profile image URL updated successfully",
  "imageUrl": "https://storage.googleapis.com/bucket/profile-images/photo.jpg"
}
```

---

## 12. Error Reference

| Status | Code | Meaning |
|---|---|---|
| `400` | Bad Request | Missing field, invalid enum, empty required value |
| `401` | Unauthorized | Invalid or missing JWT / API key |
| `403` | Forbidden | Insufficient role for the operation |
| `404` | Not Found | User / student not found |
| `409` | Conflict | Duplicate email, phone number, or NIC |
| `500` | Internal Server Error | Cloud storage misconfiguration or unexpected error |

### Common 400 Error Shape

```json
{
  "success": false,
  "statusCode": 400,
  "message": "Required field is missing",
  "error": "HttpException",
  "details": {
    "field": "country",
    "suggestion": "Please provide a value for country"
  }
}
```

---

## End-to-End Example: Create User with Profile Image

```
# 1. Generate upload URL
GET /upload/profile-images/get-signed-url?fileName=kasun.jpg&contentType=image/jpeg&fileSize=512000
→ { uploadUrl, relativePath, publicUrl }

# 2. Upload to GCS
PUT <uploadUrl>
Content-Type: image/jpeg
[binary]

# 3. Make public
POST /upload/verify-and-publish
{ "relativePath": "profile-images/kasun-uuid.jpg" }
→ { publicUrl: "https://..." }

# 4. Create user with image
POST /users/comprehensive
{
  "firstName": "Kasun",
  "lastName": "Perera",
  "email": "kasun@example.com",
  "userType": "USER_WITHOUT_PARENT",
  "imageUrl": "https://storage.googleapis.com/bucket/profile-images/kasun-uuid.jpg",
  "studentData": { "bloodGroup": "O+" }
}
```
