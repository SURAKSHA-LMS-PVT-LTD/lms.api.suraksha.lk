# Image Management – System Admin & Institute Admin Frontend Guide

Complete reference for all administrator image management operations:
- System Admin: global user profile image verification, admin-initiated uploads, institute image management
- Institute Admin: institute-level user image verification, pending queue, batch operations
- Institute entity images: logo, gallery, loading GIF

---

## Table of Contents

1. [Role Reference](#1-role-reference)
2. [Image Architecture Summary](#2-image-architecture-summary)
3. [System Admin – Global Profile Image Management](#3-system-admin--global-profile-image-management)
   - 3.1 [View Pending Queue](#31-view-pending-queue)
   - 3.2 [Approve an Image](#32-approve-an-image)
   - 3.3 [Reject an Image](#33-reject-an-image)
   - 3.4 [Admin-Initiated Upload (for a User)](#34-admin-initiated-upload-for-a-user)
   - 3.5 [Lookup User Before Upload](#35-lookup-user-before-upload)
4. [Institute Admin – Institute-Level Image Management](#4-institute-admin--institute-level-image-management)
   - 4.1 [Get All Uploaded Images (with Status)](#41-get-all-uploaded-images-with-status)
   - 4.2 [Get Pending Images Only (Unverified Queue)](#42-get-pending-images-only-unverified-queue)
   - 4.3 [Get Pending Count (Dashboard Badge)](#43-get-pending-count-dashboard-badge)
   - 4.4 [Approve (Verify) an Image](#44-approve-verify-an-image)
   - 4.5 [Reject an Image](#45-reject-an-image)
   - 4.6 [Upload Image on Behalf of User](#46-upload-image-on-behalf-of-user)
4.7 [Assign Institute Card ID](#47-assign-institute-card-id)
5. [Institute Entity Images (Logo, Gallery, GIF)](#5-institute-entity-images-logo-gallery-gif)
   - 5.1 [Upload Institute Logo / Gallery / GIF](#51-upload-institute-logo--gallery--gif)
   - 5.2 [Update Institute Images](#52-update-institute-images)
   - 5.3 [Reading Institute Image Fields](#53-reading-institute-image-fields)
6. [Upload Infrastructure (Admin Context)](#6-upload-infrastructure-admin-context)
7. [Complete API Reference (Admin Endpoints)](#7-complete-api-reference-admin-endpoints)
8. [React / TypeScript Implementation](#8-react--typescript-implementation)
   - 8.1 [System Admin – Pending Queue Component](#81-system-admin--pending-queue-component)
   - 8.2 [Institute Admin – Pending Queue Component](#82-institute-admin--pending-queue-component)
   - 8.3 [Admin Upload on Behalf of User](#83-admin-upload-on-behalf-of-user)
9. [Status & Field Reference](#9-status--field-reference)
10. [Error Reference](#10-error-reference)

---

## 1. Role Reference

| Role | What they can do with images |
|------|------------------------------|
| **SUPERADMIN** (System Admin) | Approve/reject global user images, upload images for any user, manage all institute entity images |
| **INSTITUTE_ADMIN** | Approve/reject institute-level images for users in their institute, upload institute-level images on behalf of users, manage institute logo/gallery |
| **Any authenticated user** | Upload their own images (see User Frontend Guide) |

---

## 2. Image Architecture Summary

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  GLOBAL USER IMAGE                  INSTITUTE-LEVEL USER IMAGE              │
│  ──────────────────                 ──────────────────────────              │
│  Table: users                       Table: institute_user                   │
│  Column: image_url                  Column: institute_user_image_url        │
│  Status: image_verification_status  Status: image_verification_status       │
│  Reviewer: SYSTEM ADMIN             Reviewer: INSTITUTE ADMIN                │
│                                                                             │
│  Flow:                              Flow:                                   │
│  User uploads →                     User/Admin uploads →                    │
│  PENDING →                          PENDING →                               │
│  System Admin reviews →             Institute Admin reviews →               │
│  VERIFIED or REJECTED               VERIFIED or REJECTED                   │
│                                                                             │
│  On rejection:                      On rejection:                           │
│  - File deleted from GCS            - File deleted from GCS                │
│  - Email sent with re-upload link   - institute_user_image_url set null    │
│  - image_url set null               - Status set REJECTED                  │
│                                                                             │
│  INSTITUTE ENTITY IMAGES                                                    │
│  ────────────────────────                                                   │
│  Table: institutes                                                          │
│  Columns: logo_url, image_url, image_urls (JSON array), loading_gif_url    │
│  No approval workflow — changes take effect immediately                     │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. System Admin – Global Profile Image Management

### 3.1 View Pending Queue

Retrieve all users whose global profile images are awaiting review.

```http
GET /admin/users/unverified?status=PENDING&page=1&limit=20
Authorization: Bearer {systemAdminToken}
```

**Query Parameters:**

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `status` | `PENDING` \| `VERIFIED` \| `REJECTED` | `PENDING` | Filter by verification status |
| `page` | number | 1 | Page number |
| `limit` | number | 20 | Items per page |

**Response `200`:**
```json
{
  "users": [
    {
      "userId": "42",
      "nameWithInitials": "J. Silva",
      "email": "j*****@gmail.com",
      "phoneNumber": "+94 7** *** 456",
      "imageUrl": "https://storage.googleapis.com/suraksha-lms/profile-images/user-42.jpg",
      "imageVerificationStatus": "PENDING",
      "imageUploadedAt": "2026-03-10T08:23:45.000Z",
      "userType": "STUDENT"
    }
  ],
  "total":      125,
  "page":       1,
  "limit":      20,
  "totalPages": 7
}
```

> **Note:** Email and phone are masked in the response (`j*****@gmail.com`). This is by design for privacy.

---

### 3.2 Approve an Image

```http
POST /admin/users/{userId}/approve-image
Authorization: Bearer {systemAdminToken}
Content-Type: application/json

{
  "userId": 42,
  "note": "Image looks clear and professional"
}
```

**Request Body:**

| Field | Required | Description |
|-------|----------|-------------|
| `userId` | ✅ | Numeric user ID |
| `note` | ❌ | Optional admin note (not sent to user) |

**Success Response `200`:**
```json
{
  "success":     true,
  "message":     "User image approved successfully",
  "userId":      "42",
  "status":      "VERIFIED",
  "approvedBy":  "1",
  "approvedAt":  "2026-03-12T10:05:00.000Z",
  "cardGenerated": true,
  "cardId":      "CARD-2026-000042"
}
```

**What happens on approval:**
- `users.image_verification_status` → `VERIFIED`
- `users.image_verified_by` → admin user ID
- `users.image_verified_at` → current timestamp
- `users.image_rejection_reason` → cleared (set `null`)
- If user is a student and has no `cardId` → a new card ID is **auto-generated** with 2-year expiry
- User receives an **approval email** (students w/ card get ID card email)

---

### 3.3 Reject an Image

```http
POST /admin/users/{userId}/reject-image
Authorization: Bearer {systemAdminToken}
Content-Type: application/json

{
  "userId":           42,
  "rejectionReason":  "Image is blurry and does not clearly show the face",
  "userEmail":        "john@example.com",
  "urlValidityDays":  7
}
```

**Request Body:**

| Field | Required | Description |
|-------|----------|-------------|
| `userId` | ✅ | Numeric user ID |
| `rejectionReason` | ✅ | Reason shown to the user in the email |
| `userEmail` | ❌ | Override email address (defaults to `users.email`) |
| `urlValidityDays` | ❌ | How many days the re-upload link stays valid (1–30, default 7) |

**Success Response `200`:**
```json
{
  "success":         true,
  "message":         "User image rejected successfully. User notified via email.",
  "userId":          "42",
  "rejectionReason": "Image is blurry and does not clearly show the face",
  "uploadUrl":       "https://lms.suraksha.lk/profile/image/upload?token=...",
  "expiresAt":       "2026-03-19T10:05:00.000Z",
  "emailSent":       true,
  "uploadToken":     "eyJ1c2VySWQiOjQyLCJwdXJwb3NlIjoi..."
}
```

**What happens on rejection:**
- Rejected image is **deleted from cloud storage** (GCS/S3)
- `users.image_url` → `null`
- `users.image_verification_status` → `REJECTED`
- `users.image_rejection_reason` → set to provided reason
- A **signed re-upload token** is generated (HMAC-SHA256, 7-day default)
- User receives a **rejection email** with a direct re-upload link

> **Do not share the `uploadToken` publicly** — it authorizes image upload for that user ID without credentials.

---

### 3.4 Admin-Initiated Upload (for a User)

Admins can upload a profile image directly for any user. Admin-uploaded images are **auto-approved** (no pending review).

**Method A — By Student ID (quick path)**

```http
POST /admin/users/student/:studentId/profile-image
Authorization: Bearer {systemAdminToken}
Content-Type: application/json

{
  "fileName":    "student-42-photo.jpg",
  "contentType": "image/jpeg"
}
```

This endpoint returns a signed URL. Upload the file to it, then call verify-and-publish, then assign.

**Method B — By User ID (lookup then assign)**

Step 1: Lookup user

```http
GET /admin/users/lookup/{userId}
Authorization: Bearer {systemAdminToken}
```

Step 2: Generate signed URL

```http
POST /admin/users/profile-image/generate-url
Authorization: Bearer {systemAdminToken}
Content-Type: application/json

{
  "userId":      "42",
  "fileName":    "admin-upload-42.jpg",
  "contentType": "image/jpeg"
}
```

Step 3: Upload file to the returned `uploadUrl` directly (PUT).

Step 4: Assign the image

```http
POST /admin/users/profile-image/assign
Authorization: Bearer {systemAdminToken}
Content-Type: application/json

{
  "userId":   "42",
  "imageUrl": "profile-images/admin-upload-42.jpg"
}
```

> The `imageUrl` here is the **relative path** (not full URL), as returned by the generate-url step.

**Alternative quick-path (generates URL + assigns in one call):**

```http
POST /admin/users/{userId}/profile-image
Authorization: Bearer {systemAdminToken}
Content-Type: application/json

{
  "fileName":    "quick-upload-42.jpg",
  "contentType": "image/jpeg"
}
```

---

### 3.5 Lookup User Before Upload

Before uploading on behalf of a user, look them up to confirm identity:

```http
GET /admin/users/lookup/{userId}
Authorization: Bearer {systemAdminToken}
```

**Response:**
```json
{
  "userId":      "42",
  "name":        "John Silva",
  "email":       "john@example.com",
  "userType":    "STUDENT",
  "imageUrl":    null,
  "imageStatus": "REJECTED"
}
```

---

## 4. Institute Admin – Institute-Level Image Management

### 4.1 Get All Uploaded Images (with Status)

Returns all users in the institute who have an `institute_user_image_url` **regardless of status** (PENDING, VERIFIED, REJECTED). Ordered by status (PENDING first) then by upload date.

```http
GET /institute-users/institute/{instituteId}/users/image-verification
Authorization: Bearer {adminToken}
```

**Query Parameters:**

| Param | Type | Description |
|-------|------|-------------|
| `page` | number | Page number (default 1) |
| `limit` | number | Per page (default 10, max 100) |
| `isVerified` | `true` \| `false` | Filter: `true` = VERIFIED only, `false` = PENDING only |

**Response `200`:**
```json
{
  "data": [
    {
      "id":                      "42",
      "firstName":               "John",
      "lastName":                "Silva",
      "email":                   "john@example.com",
      "phoneNumber":             "+94771234567",
      "imageUrl":                "https://storage.googleapis.com/suraksha-lms/profile-images/user-42.jpg",
      "instituteUserImageUrl":   "https://storage.googleapis.com/suraksha-lms/institute-user-images/42-inst.jpg",
      "instituteCardId":         "CARD-001",
      "imageVerificationStatus": "PENDING",
      "imageVerifiedBy":         null,
      "userIdByInstitute":       "STU-2026-042",
      "status":                  "ACTIVE"
    }
  ],
  "meta": {
    "total":      38,
    "page":       1,
    "limit":      10,
    "totalPages": 4
  }
}
```

**Key fields:**

| Field | Description |
|-------|-------------|
| `instituteUserImageUrl` | The institute-specific image (full URL) |
| `imageVerificationStatus` | `PENDING` / `VERIFIED` / `REJECTED` |
| `imageUrl` | Global profile image (fallback) |
| `imageVerifiedBy` | Admin user ID who last acted on this image |

---

### 4.2 Get Pending Images Only (Unverified Queue)

More targeted endpoint — only returns users with uploaded images that are still `PENDING`.

```http
GET /institute-users/institute/{instituteId}/users/unverified-with-images
Authorization: Bearer {adminToken}
```

**Query Parameters:**

| Param | Type | Description |
|-------|------|-------------|
| `page` | number | Page number (default 1) |
| `limit` | number | Per page (default 10, max 100) |
| `search` | string | Filter by user name or email |

**Response** — same shape as §4.1 but only includes `imageVerificationStatus = PENDING`.

---

### 4.3 Get Pending Count (Dashboard Badge)

Lightweight endpoint for showing a notification badge on the admin dashboard.

```http
GET /institute-users/institute/{instituteId}/users/unverified-with-images/count
Authorization: Bearer {adminToken}
```

**Response `200`:**
```json
{
  "count": 7
}
```

**Usage (React):**
```tsx
function PendingBadge({ instituteId, token }: { instituteId: string; token: string }) {
  const [count, setCount] = React.useState(0);

  React.useEffect(() => {
    fetch(`/institute-users/institute/${instituteId}/users/unverified-with-images/count`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.json())
      .then(({ count }) => setCount(count));
  }, [instituteId, token]);

  return count > 0 ? <span className="badge">{count}</span> : null;
}
```

---

### 4.4 Approve (Verify) an Image

```http
POST /institute-users/institute/{instituteId}/users/{userId}/verify-image
Authorization: Bearer {adminToken}
Content-Type: application/json

{
  "status": "VERIFIED"
}
```

**Request Body:**

| Field | Required | Values |
|-------|----------|--------|
| `status` | ✅ | `"VERIFIED"` or `"REJECTED"` |
| `rejectionReason` | Only when rejecting | Reason string |

**Success Response `200` (Approve):**
```json
{
  "success": true,
  "message": "Image verification approved successfully",
  "status":  "VERIFIED"
}
```

**What happens:**
- `institute_user.image_verification_status` → `VERIFIED`
- `institute_user.image_verified_by` → admin user ID
- Image URL is kept in `institute_user_image_url`

---

### 4.5 Reject an Image

```http
POST /institute-users/institute/{instituteId}/users/{userId}/verify-image
Authorization: Bearer {adminToken}
Content-Type: application/json

{
  "status":          "REJECTED",
  "rejectionReason": "Photo does not show the face clearly"
}
```

**Success Response `200` (Reject):**
```json
{
  "success": true,
  "message": "Image verification rejected and deleted from cloud successfully",
  "status":  "REJECTED"
}
```

**What happens on institute image rejection:**
- File is **deleted from cloud storage** (GCS/S3)
- `institute_user.institute_user_image_url` → `null`
- `institute_user.image_verification_status` → `REJECTED`
- `institute_user.image_verified_by` → `null` (cleared)

> Unlike the global image rejection, no email is sent automatically. The user must be notified through your app's own notification system if needed.

---

### 4.6 Upload Image on Behalf of User

Institute admins can upload an institute-level image directly for a user. The image is **immediately set to VERIFIED** when an admin uploads it.

**Step 1** – Follow the 3-step upload flow using `folder = 'institute-user-images'` (see §6).

**Step 2** – Register the image:

```http
POST /institute-users/institute/{instituteId}/users/{userId}/upload-image
Authorization: Bearer {adminToken}
Content-Type: application/json

{
  "imageUrl": "https://storage.googleapis.com/suraksha-lms/institute-user-images/admin-upload-42.jpg"
}
```

The backend sets `imageVerificationStatus = VERIFIED` when the caller has admin privileges (determined by JWT role).

> **Note**: The endpoint itself does not check roles internally — the guard on the controller does. Ensure the JWT belongs to an admin or SUPERADMIN.

---

### 4.7 Assign Institute Card ID

Assign or update the physical/QR card ID for a user within the institute.

```http
POST /institute-users/institute/{instituteId}/users/{userId}/assign-card-id
Authorization: Bearer {adminToken}
Content-Type: application/json

{
  "cardId": "CARD-2026-042"
}
```

**Constraints:**
- `cardId` max 100 characters
- Must be unique within the institute (409 Conflict if already assigned to another user)

**Response `200`:**
```json
{
  "success": true,
  "message": "Institute card ID assigned successfully",
  "cardId":  "CARD-2026-042"
}
```

---

## 5. Institute Entity Images (Logo, Gallery, GIF)

These are images belonging to the **institute itself** (not individual users). They have **no approval workflow** — changes take effect immediately.

### 5.1 Upload Institute Logo / Gallery / GIF

**Step 1** – Get signed URL using `folder = 'institute-images'`:

```typescript
const params = new URLSearchParams({
  folder:      'institute-images',
  fileName:    'logo.png',
  contentType: 'image/png',
  fileSize:    String(file.size),
});

// Note: institute-images can also use the PUBLIC upload endpoint
const res = await fetch(`/public/upload/get-signed-url?${params}`, {
  headers: { 'X-API-Key': apiKey }, // API key auth for public endpoint
});
```

**Step 2** – PUT file to signed URL.

**Step 3** – Verify & publish:

```typescript
const verifyRes = await fetch('/public/upload/verify-and-publish', {
  method:  'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-API-Key':    apiKey,
  },
  body: JSON.stringify({ relativePath }),
});
const { publicUrl } = await verifyRes.json();
```

**Supported formats for `institute-images`:** `.jpg .jpeg .png .webp .svg`  
**Public upload endpoint rate limit:** 10 requests/minute.

---

### 5.2 Update Institute Images

Pass the relative paths (returned from `verify-and-publish`) to the institute create or update endpoint:

**Create institute with images:**
```http
POST /institutes
Authorization: Bearer {superAdminToken}
Content-Type: application/json

{
  "name":          "Suraksha Academy",
  "logoUrl":       "institute-images/logo-uuid.png",
  "loadingGifUrl": "institute-images/loader-uuid.gif",
  "imageUrl":      "institute-images/banner-uuid.jpg",
  "imageUrls": [
    "institute-images/gallery-1-uuid.jpg",
    "institute-images/gallery-2-uuid.jpg"
  ]
}
```

**Update institute images (partial):**
```http
PATCH /institutes/{id}
Authorization: Bearer {adminToken}
Content-Type: application/json

{
  "logoUrl":  "institute-images/new-logo-uuid.svg",
  "imageUrls": [
    "institute-images/gallery-1-uuid.jpg",
    "institute-images/new-gallery-3-uuid.jpg",
    "institute-images/gallery-4-uuid.jpg"
  ]
}
```

> Pass all desired gallery images in `imageUrls` — it replaces the entire array, not appends.

---

### 5.3 Reading Institute Image Fields

When the API returns an institute object, image fields are pre-converted to **full public URLs**:

```typescript
interface InstituteResponse {
  id:             string;
  name:           string;
  logoUrl:        string | null;  // full https:// URL
  imageUrl:       string | null;  // full https:// URL (legacy single)
  imageUrls:      string[];       // array of full https:// URLs
  loadingGifUrl:  string | null;  // full https:// URL
}
```

No URL transformation needed on the frontend for institute images.

---

## 6. Upload Infrastructure (Admin Context)

Admins have access to both the **authenticated** and **public** upload endpoints.

### Authenticated Upload (JWT)

```
GET  /upload/get-signed-url           → query string params
POST /upload/generate-signed-url      → JSON body
POST /upload/verify-and-publish       → { relativePath }
```

### Public Upload (API Key — Institute Images Only)

Restricted to the `institute-images` folder. Rate limited to 10 req/min.

```
GET  /public/upload/get-signed-url    → query string params
POST /public/upload/generate-signed-url  → JSON body
POST /public/upload/verify-and-publish   → { relativePath }
```

### Upload Parameters

```typescript
interface GenerateUploadUrlDto {
  folder: 
    | 'profile-images'
    | 'student-images'
    | 'institute-images'           // institute entity images
    | 'institute-user-images'      // user image within institute
    | 'id-documents'
    | 'subject-images'
    | 'homework-files'
    | 'correction-files'
    | 'institute-payment-receipts'
    | 'subject-payment-receipts'
    | 'bookhire-vehicle-images'
    | 'bookhire-owner-images';
  fileName:    string;  // original filename (UUID appended automatically)
  contentType: string;  // MIME type
  fileSize:    number;  // bytes — validated server-side
}
```

**Signed URL properties:**
- Expires in **10 minutes** (fixed, not configurable)
- Upload via HTTP `PUT` with exact `Content-Type` header
- File is **private** until `/verify-and-publish` is called

---

## 7. Complete API Reference (Admin Endpoints)

### System Admin – Global User Image

| Method | Endpoint | Guard | Description |
|--------|----------|-------|-------------|
| `GET` | `/admin/users/unverified` | SystemAdmin JWT | List global pending/verified/rejected images |
| `POST` | `/admin/users/:userId/approve-image` | SystemAdmin JWT | Approve global profile image |
| `POST` | `/admin/users/:userId/reject-image` | SystemAdmin JWT | Reject global profile image (deletes file + sends email) |
| `GET` | `/admin/users/student/lookup/:studentId` | SystemAdmin JWT | Lookup student by ID |
| `GET` | `/admin/users/lookup/:userId` | SystemAdmin JWT | Lookup any user by ID |
| `POST` | `/admin/users/student/profile-image/generate-url` | SystemAdmin JWT | Generate signed URL for student |
| `POST` | `/admin/users/student/profile-image/assign` | SystemAdmin JWT | Assign profile image to student |
| `POST` | `/admin/users/student/:studentId/profile-image` | SystemAdmin JWT | Quick: generate + assign in one step |
| `POST` | `/admin/users/profile-image/generate-url` | SystemAdmin JWT | Generate signed URL for any user |
| `POST` | `/admin/users/profile-image/assign` | SystemAdmin JWT | Assign profile image to any user |
| `POST` | `/admin/users/:userId/profile-image` | SystemAdmin JWT | Quick: generate + assign for any user |

**`GET /admin/users/unverified` Query Parameters:**

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `status` | `PENDING` \| `VERIFIED` \| `REJECTED` | `PENDING` | Verification status filter |
| `page` | number | 1 | Page |
| `limit` | number | 20 | Per page |

---

### Institute Admin – Institute-Level Images

| Method | Endpoint | Guard | Description |
|--------|----------|-------|-------------|
| `GET` | `/institute-users/institute/:instituteId/users/image-verification` | JWT + (SUPERADMIN or InstituteAdmin) | All users with images (any status) |
| `GET` | `/institute-users/institute/:instituteId/users/unverified-with-images` | JWT + (SUPERADMIN or InstituteAdmin) | Only PENDING images |
| `GET` | `/institute-users/institute/:instituteId/users/unverified-with-images/count` | JWT + (SUPERADMIN or InstituteAdmin) | Count of PENDING images |
| `POST` | `/institute-users/institute/:instituteId/users/:userId/upload-image` | JWT | Upload/replace institute user image |
| `POST` | `/institute-users/institute/:instituteId/users/:userId/verify-image` | JWT | Approve or reject institute image |
| `POST` | `/institute-users/institute/:instituteId/users/:userId/assign-card-id` | JWT | Set institute card ID for user |

---

### Institute Entity Images

| Method | Endpoint | Guard | Description |
|--------|----------|-------|-------------|
| `POST` | `/institutes` | SUPERADMIN JWT | Create institute with logo/gallery/GIF |
| `PATCH` | `/institutes/:id` | SUPERADMIN or InstituteAdmin JWT | Update institute images |

---

## 8. React / TypeScript Implementation

### 8.1 System Admin – Pending Queue Component

```tsx
import React, { useEffect, useState, useCallback } from 'react';

const API_BASE = process.env.REACT_APP_API_URL;

interface PendingUser {
  userId:                  string;
  nameWithInitials:        string;
  email:                   string;
  phoneNumber:             string;
  imageUrl:                string;
  imageVerificationStatus: string;
  imageUploadedAt:         string;
  userType:                string;
}

interface PendingListResponse {
  users:      PendingUser[];
  total:      number;
  page:       number;
  limit:      number;
  totalPages: number;
}

export function SystemAdminImageQueue({
  token,
}: { token: string }) {
  const [users, setUsers]     = useState<PendingUser[]>([]);
  const [page, setPage]       = useState(1);
  const [total, setTotal]     = useState(0);
  const [loading, setLoading] = useState(false);
  const LIMIT = 20;

  const fetchPending = useCallback(async (p: number) => {
    setLoading(true);
    const res = await fetch(
      `${API_BASE}/admin/users/unverified?status=PENDING&page=${p}&limit=${LIMIT}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    const data: PendingListResponse = await res.json();
    setUsers(data.users);
    setTotal(data.total);
    setLoading(false);
  }, [token]);

  useEffect(() => { fetchPending(page); }, [page, fetchPending]);

  async function approveImage(userId: string) {
    await fetch(`${API_BASE}/admin/users/${userId}/approve-image`, {
      method:  'POST',
      headers: {
        Authorization:  `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ userId: Number(userId) }),
    });
    fetchPending(page);
  }

  async function rejectImage(userId: string, reason: string) {
    const res = await fetch(`${API_BASE}/admin/users/${userId}/reject-image`, {
      method:  'POST',
      headers: {
        Authorization:  `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        userId:          Number(userId),
        rejectionReason: reason,
        urlValidityDays: 7,
      }),
    });
    const data = await res.json();
    console.log('Rejection email sent:', data.emailSent);
    fetchPending(page);
  }

  return (
    <div>
      <h2>Pending Profile Images ({total})</h2>
      {loading && <p>Loading…</p>}

      {users.map(user => (
        <div key={user.userId} style={{ border: '1px solid #ccc', padding: 16, margin: 8 }}>
          <img
            src={user.imageUrl}
            alt={user.nameWithInitials}
            style={{ width: 100, height: 100, objectFit: 'cover', borderRadius: 8 }}
          />
          <div>
            <strong>{user.nameWithInitials}</strong> ({user.userType})<br />
            <small>{user.email} · {user.phoneNumber}</small><br />
            <small>Uploaded: {new Date(user.imageUploadedAt).toLocaleString()}</small>
          </div>
          <div style={{ marginTop: 8 }}>
            <button
              onClick={() => approveImage(user.userId)}
              style={{ background: 'green', color: '#fff', marginRight: 8 }}
            >
              ✅ Approve
            </button>
            <button
              onClick={() => {
                const reason = prompt('Rejection reason:');
                if (reason) rejectImage(user.userId, reason);
              }}
              style={{ background: 'red', color: '#fff' }}
            >
              ❌ Reject
            </button>
          </div>
        </div>
      ))}

      {/* Pagination */}
      <div>
        <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>
          ← Prev
        </button>
        <span> Page {page} of {Math.ceil(total / LIMIT)} </span>
        <button
          onClick={() => setPage(p => p + 1)}
          disabled={page >= Math.ceil(total / LIMIT)}
        >
          Next →
        </button>
      </div>
    </div>
  );
}
```

---

### 8.2 Institute Admin – Pending Queue Component

```tsx
import React, { useEffect, useState, useCallback } from 'react';

const API_BASE = process.env.REACT_APP_API_URL;

interface InstituteUserImage {
  id:                      string;
  firstName:               string;
  lastName:                string;
  email:                   string;
  imageUrl:                string | null;       // global image
  instituteUserImageUrl:   string | null;       // institute image
  imageVerificationStatus: 'PENDING' | 'VERIFIED' | 'REJECTED' | null;
  imageVerifiedBy:         string | null;
  userIdByInstitute:       string | null;
}

interface PaginatedResponse {
  data: InstituteUserImage[];
  meta: { total: number; page: number; limit: number; totalPages: number };
}

export function InstituteImageQueue({
  instituteId,
  token,
}: { instituteId: string; token: string }) {
  const [users, setUsers]     = useState<InstituteUserImage[]>([]);
  const [meta, setMeta]       = useState({ total: 0, page: 1, limit: 10, totalPages: 1 });
  const [loading, setLoading] = useState(false);

  const fetchPending = useCallback(async (page: number) => {
    setLoading(true);
    const res = await fetch(
      `${API_BASE}/institute-users/institute/${instituteId}/users/unverified-with-images?page=${page}&limit=10`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    const data: PaginatedResponse = await res.json();
    setUsers(data.data);
    setMeta(data.meta);
    setLoading(false);
  }, [instituteId, token]);

  useEffect(() => { fetchPending(1); }, [fetchPending]);

  async function verifyImage(
    userId: string,
    status: 'VERIFIED' | 'REJECTED',
    rejectionReason?: string
  ) {
    await fetch(
      `${API_BASE}/institute-users/institute/${instituteId}/users/${userId}/verify-image`,
      {
        method:  'POST',
        headers: {
          Authorization:  `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status, rejectionReason }),
      }
    );
    fetchPending(meta.page);
  }

  return (
    <div>
      <h2>Institute Pending Images ({meta.total})</h2>
      {loading && <p>Loading…</p>}

      {users.map(user => (
        <div key={user.id} style={{ border: '1px solid #eee', padding: 12, marginBottom: 12 }}>
          {user.instituteUserImageUrl ? (
            <img
              src={user.instituteUserImageUrl}
              alt={`${user.firstName} ${user.lastName}`}
              style={{ width: 90, height: 90, objectFit: 'cover', borderRadius: 6 }}
            />
          ) : (
            <div style={{ width: 90, height: 90, background: '#f0f0f0', borderRadius: 6 }} />
          )}

          <div>
            <strong>{user.firstName} {user.lastName}</strong><br />
            <small>Institute ID: {user.userIdByInstitute ?? '—'}</small><br />
            <small>Status: {user.imageVerificationStatus}</small>
          </div>

          <div style={{ marginTop: 8 }}>
            <button
              onClick={() => verifyImage(user.id, 'VERIFIED')}
              style={{ background: '#388e3c', color: '#fff', marginRight: 8 }}
            >
              ✅ Approve
            </button>
            <button
              onClick={() => {
                const reason = prompt('Enter rejection reason:');
                if (reason) verifyImage(user.id, 'REJECTED', reason);
              }}
              style={{ background: '#d32f2f', color: '#fff' }}
            >
              ❌ Reject
            </button>
          </div>
        </div>
      ))}

      {/* Pagination controls */}
      <div>
        <button
          disabled={meta.page <= 1}
          onClick={() => fetchPending(meta.page - 1)}
        >Prev</button>
        <span> {meta.page} / {meta.totalPages} </span>
        <button
          disabled={meta.page >= meta.totalPages}
          onClick={() => fetchPending(meta.page + 1)}
        >Next</button>
      </div>
    </div>
  );
}
```

---

### 8.3 Admin Upload on Behalf of User

```tsx
async function adminUploadForUser(
  file: File,
  userId: string,
  token: string
): Promise<void> {
  const API_BASE = process.env.REACT_APP_API_URL!;

  // Step 1: Generate signed URL via admin endpoint
  const genRes = await fetch(`${API_BASE}/admin/users/profile-image/generate-url`, {
    method:  'POST',
    headers: {
      Authorization:  `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      userId,
      fileName:    file.name,
      contentType: file.type,
    }),
  });

  if (!genRes.ok) throw new Error('Failed to generate upload URL');
  const { uploadUrl, relativePath } = await genRes.json();

  // Step 2: PUT file to cloud
  await fetch(uploadUrl, {
    method:  'PUT',
    body:    file,
    headers: { 'Content-Type': file.type },
  });

  // Step 3: Assign the image to the user (auto-approved)
  const assignRes = await fetch(`${API_BASE}/admin/users/profile-image/assign`, {
    method:  'POST',
    headers: {
      Authorization:  `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ userId, imageUrl: relativePath }),
  });

  if (!assignRes.ok) {
    const err = await assignRes.json();
    throw new Error(err.message || 'Failed to assign image');
  }
}

// ── Institute Image Upload (for institute entity itself) ──
async function uploadInstituteEntityImage(
  file: File,
  apiKey: string
): Promise<string> {
  const API_BASE = process.env.REACT_APP_API_URL!;

  // Step 1: Public signed URL
  const params = new URLSearchParams({
    folder:      'institute-images',
    fileName:    file.name,
    contentType: file.type,
    fileSize:    String(file.size),
  });

  const signedRes = await fetch(`${API_BASE}/public/upload/get-signed-url?${params}`, {
    headers: { 'X-API-Key': apiKey },
  });
  const { uploadUrl, relativePath } = await signedRes.json();

  // Step 2: Upload
  await fetch(uploadUrl, {
    method:  'PUT',
    body:    file,
    headers: { 'Content-Type': file.type },
  });

  // Step 3: Verify & publish
  const verifyRes = await fetch(`${API_BASE}/public/upload/verify-and-publish`, {
    method:  'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key':    apiKey,
    },
    body: JSON.stringify({ relativePath }),
  });

  const { publicUrl } = await verifyRes.json();
  return relativePath; // Return RELATIVE path for use in PATCH /institutes/:id
}

// ── Example: Update institute logo ──
async function updateInstituteLogo(
  instituteId: string,
  file: File,
  apiKey: string,
  adminToken: string
): Promise<void> {
  const API_BASE = process.env.REACT_APP_API_URL!;

  const logoRelativePath = await uploadInstituteEntityImage(file, apiKey);

  await fetch(`${API_BASE}/institutes/${instituteId}`, {
    method:  'PATCH',
    headers: {
      Authorization:  `Bearer ${adminToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ logoUrl: logoRelativePath }),
  });
}
```

---

## 9. Status & Field Reference

### Global User Image (System Admin context)

| DB Column | Type | Description |
|-----------|------|-------------|
| `image_url` | `varchar(255)` | Relative storage path (converted to full URL in API responses) |
| `image_verification_status` | `enum` | `PENDING` / `VERIFIED` / `REJECTED` |
| `image_verified_by` | `bigint` | Admin user ID |
| `image_verified_at` | `timestamp` | When approved/rejected |
| `image_rejection_reason` | `text` | Reason (set on rejection, cleared on approval) |
| `id_url` | `varchar(255)` | ID document path (no verification) |

### Institute-Level User Image (Institute Admin context)

| DB Column | Type | Description |
|-----------|------|-------------|
| `institute_user_image_url` | `varchar(255)` | Institute-specific image path |
| `image_verification_status` | `enum` | `PENDING` / `VERIFIED` / `REJECTED` (default PENDING) |
| `image_verified_by` | `bigint` | Admin who acted |
| `institute_card_id` | `varchar(100)` | Institute card/QR ID |

### Institute Entity Images

| DB Column | Type | Max | Description |
|-----------|------|-----|-------------|
| `logo_url` | `varchar(255)` | — | Institute logo relative path |
| `image_url` | `varchar(255)` | — | Legacy single image |
| `image_urls` | `json` | 10 items | Gallery image array |
| `loading_gif_url` | `varchar(255)` | — | Loading animation |

---

## 10. Error Reference

| HTTP Status | Scenario | Resolution |
|-------------|----------|------------|
| `400 Bad Request` | `imageUrl` missing on reject call | Provide `rejectionReason` in body |
| `400 Bad Request` | User has no image to approve | Check user has an `imageUrl` before approving |
| `400 Bad Request` | No image found to verify (institute) | User must upload an image first |
| `401 Unauthorized` | Missing or expired JWT | Refresh admin token |
| `403 Forbidden` | Non-admin token used on admin endpoints | Use System Admin / Institute Admin JWT |
| `404 Not Found` | User not found | Verify `userId` is correct |
| `404 Not Found` | Institute user relationship not found | User must be enrolled in this institute first |
| `409 Conflict` | Card ID already assigned to another user | Use a different `cardId` |
| `429 Too Many Requests` | Public upload rate limit (10/min) | Retry after 60 seconds |
| GCS `403` on PUT | Signed URL expired | Re-fetch `/upload/get-signed-url` and retry |

---

*Last updated: 2026 — Based on codebase analysis of `system-admin-user.service.ts`, `system-admin-user.controller.ts`, `institue_user.service.ts`, `institue_user.controller.ts`, `institute.service.ts`, `upload.controller.ts`, and related entities.*
