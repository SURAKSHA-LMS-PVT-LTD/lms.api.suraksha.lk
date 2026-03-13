# Institute Profile Image — Complete Implementation Guide

## Overview

Users have **two separate profile image systems**:

| System | Scope | Table(s) updated | Who approves |
|---|---|---|---|
| **Global profile image** | `scope=GLOBAL` | `user_images` + `users.imageVerificationStatus` | System Admin |
| **Institute profile image** | `scope=INSTITUTE` | `user_images` + `institute_user.instituteUserImageUrl` | Institute Admin OR System Admin |

These two systems are **completely independent**. An institute image is never mixed with the global image verification flow.

---

## Data Flow

### Submit (user uploads)

```
POST /users/:id/profile-image
Body: { imageUrl, scope: "INSTITUTE", instituteId: "42" }
```

**What happens:**
1. A `user_images` row is inserted: `scope=INSTITUTE`, `institute_id=42`, `status=PENDING`
2. `users.imageVerificationStatus` is set to `PENDING`
3. `institute_user.instituteUserImageUrl` is set to the relative path
4. `institute_user.imageVerificationStatus` is set to `PENDING`

Both tables are now in sync.

### Approve / Reject (institute admin)

```
POST /institute-users/institute/:instituteId/users/:userId/verify-image
Body: { status: "VERIFIED" | "REJECTED", rejectionReason?: "..." }
```

**What happens:**
1. `institute_user.imageVerificationStatus` is updated to the new status
2. If REJECTED: image is deleted from cloud storage; `institute_user.instituteUserImageUrl` is cleared
3. The matching `user_images` row (`scope=INSTITUTE`, `status=PENDING`) is found and its status, `verifiedBy`, `verifiedAt`, and `rejectionReason` are updated to match

### Re-upload (user submits again)

Same as Submit — just call `POST /users/:id/profile-image` again with `scope=INSTITUTE`. A new `user_images` record is created as PENDING, and `institute_user` is updated. Full history is preserved.

---

## API Reference

### User-Facing Endpoints

All require `Authorization: Bearer <jwt>`.

#### Submit / Re-upload Institute Image

```
POST /users/:id/profile-image
```

| Field | Type | Required | Description |
|---|---|---|---|
| `imageUrl` | string (URL) | ✅ | Full URL from `/upload/generate-signed-url` |
| `scope` | `"INSTITUTE"` | ✅ | Must be `INSTITUTE` for institute images |
| `instituteId` | string | ✅ | The institute this image belongs to |

**Response:**
```json
{
  "success": true,
  "message": "Profile image updated successfully",
  "data": {
    "userId": "123",
    "imageUrl": "https://storage.suraksha.lk/..."
  }
}
```

---

#### Get Institute Image History

```
GET /users/:id/profile-image/institute/:instituteId/history
```

Returns all past submissions for the user in the specified institute, newest first.

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "imageId": "88",
      "imageUrl": "https://storage.suraksha.lk/...",
      "status": "VERIFIED",
      "rejectionReason": null,
      "verifiedBy": "5",
      "verifiedAt": "2026-03-14T10:00:00.000Z",
      "submittedAt": "2026-03-13T09:00:00.000Z"
    },
    {
      "imageId": "71",
      "imageUrl": "https://storage.suraksha.lk/...",
      "status": "REJECTED",
      "rejectionReason": "Image too blurry",
      "verifiedBy": "5",
      "verifiedAt": "2026-03-10T08:30:00.000Z",
      "submittedAt": "2026-03-09T14:00:00.000Z"
    }
  ]
}
```

---

#### Delete Pending Institute Image

```
DELETE /users/:id/profile-image/institute/:instituteId
```

Only succeeds when the current submission has `status=PENDING`. Returns 400 if no pending image exists.

**What happens:**
1. Deletes the image file from cloud storage
2. Removes the `user_images` row
3. Clears `institute_user.instituteUserImageUrl` and resets `institute_user.imageVerificationStatus` to PENDING

**Response (success):**
```json
{
  "success": true,
  "message": "Pending institute image deleted successfully"
}
```

**Response (error — not pending):**
```json
{
  "statusCode": 400,
  "message": "No pending institute image found. Only PENDING images can be deleted."
}
```

---

### Institute Admin Endpoints

#### Get Users with Images for Verification

```
GET /institute-users/institute/:instituteId/users/image-verification
GET /institute-users/institute/:instituteId/users/unverified-with-images
GET /institute-users/institute/:instituteId/users/unverified-with-images/count
```

All require institute admin role.

---

#### Approve or Reject Image

```
POST /institute-users/institute/:instituteId/users/:userId/verify-image
Body: { status: "VERIFIED" | "REJECTED", rejectionReason?: "..." }
```

**What happens on approve:**
- `institute_user.imageVerificationStatus` → `VERIFIED`
- `institute_user.imageVerifiedBy` → admin's user ID
- `user_images` matching row → `status=VERIFIED`, `verified_by`, `verified_at` set

**What happens on reject:**
- Image file deleted from cloud storage
- `institute_user.instituteUserImageUrl` → `null`
- `institute_user.imageVerificationStatus` → `REJECTED`
- `user_images` matching row → `status=REJECTED`, `rejection_reason`, `verified_by`, `verified_at` set

---

## Database Tables Involved

### `user_images`

| Column | When set for institute images |
|---|---|
| `user_id` | always |
| `image_url` | relative path |
| `scope` | `INSTITUTE` |
| `institute_id` | the institute ID |
| `status` | `PENDING` on submit → `VERIFIED`/`REJECTED` on admin action |
| `verified_by` | admin user ID (set on approve/reject) |
| `verified_at` | timestamp (set on approve/reject) |
| `rejection_reason` | set on reject |

### `institute_user` (composite PK: institute_id + user_id)

| Column | When set for institute images |
|---|---|
| `institute_user_image_url` | relative path on submit; `null` on reject or delete |
| `image_verification_status` | `PENDING` on submit; `VERIFIED`/`REJECTED` on admin action |
| `image_verified_by` | admin user ID on approve; `null` on reject/reset |

---

## Files Modified

| File | Change |
|---|---|
| `src/modules/user/user.service.ts` | `updateImageUrl()` — when scope=INSTITUTE, calls `institueUserService.uploadInstituteUserImage()` to sync institute_user row; added `getInstituteImageHistory()` and `deleteInstituteProfileImage()` methods |
| `src/modules/institute_mudules/institue_user/institue_user.service.ts` | Injected `UserImageEntity` repository; `verifyInstituteUserImage()` now also updates the matching `user_images` row; added `clearInstituteUserImage()` |
| `src/modules/institute_mudules/institue_user/institue_user.module.ts` | Added `UserImageEntity` to `TypeOrmModule.forFeature` |
| `src/modules/user/controllers/user-profile-image.controller.ts` | Added `GET /:id/profile-image/institute/:instituteId/history` and `DELETE /:id/profile-image/institute/:instituteId` endpoints |

---

## Frontend Integration Notes

### Upload Flow (unchanged for frontend)

```
1. GET  /upload/generate-signed-url?folder=institute-user-images
2. PUT  <signedUrl>  (direct to cloud)
3. POST /users/:id/profile-image
       { imageUrl: "...", scope: "INSTITUTE", instituteId: "42" }
```

### Check Current Status

The existing `GET /users/profile/image-status` returns global status. For institute-specific status, query the history endpoint and check the most recent entry.

### No Frontend Changes Required for Admin APIs

The institute admin approve/reject endpoints (`POST /institute-users/.../verify-image`) are unchanged. They now additionally sync `user_images` behind the scenes automatically.
