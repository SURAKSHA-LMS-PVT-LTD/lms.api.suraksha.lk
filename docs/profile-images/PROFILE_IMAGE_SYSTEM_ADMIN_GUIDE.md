# Profile Image - System Admin Frontend Guide

Current implementation. Admin actions query the user_images table (new submissions)
AND legacy users (imageVerificationStatus=PENDING on the users table with no user_images record).

## Admin Workflow

`
GET /admin/users/unverified?status=PENDING
      -> shows all images waiting for review

For each record:
  POST /admin/users/:userId/approve-image  -> image goes live, email sent
  POST /admin/users/:userId/reject-image   -> image deleted, email with re-upload link sent
`

---

## List pending images

GET /admin/users/unverified
Authorization: Bearer token (SUPER_ADMIN required)

Query params:
  status: PENDING (default) | VERIFIED | REJECTED
  page:   page number, default 1
  limit:  items per page, default 20, max 100

Example: GET /admin/users/unverified?status=PENDING&page=1&limit=20

Response:
`json
{
  "users": [
    {
      "imageId": "7",
      "userId": "42",
      "nameWithInitials": "K.A. Perera",
      "email": "k***@g***.com",
      "phoneNumber": "077***4567",
      "imageUrl": "https://storage.googleapis.com/.../photo-UUID.jpg",
      "imageVerificationStatus": "PENDING",
      "scope": "GLOBAL",
      "instituteId": null,
      "imageUploadedAt": "2026-03-13T17:00:00.000Z",
      "userType": "USER_WITHOUT_STUDENT",
      "isLegacy": false
    },
    {
      "imageId": null,
      "userId": "15",
      "nameWithInitials": "N. Silva",
      "email": "n***@g***.com",
      "phoneNumber": null,
      "imageUrl": "https://storage.googleapis.com/.../old-photo.jpg",
      "imageVerificationStatus": "PENDING",
      "scope": null,
      "instituteId": null,
      "imageUploadedAt": "2026-01-10T09:00:00.000Z",
      "userType": "USER_WITHOUT_STUDENT",
      "isLegacy": true
    }
  ],
  "total": 2,
  "page": 1,
  "limit": 20,
  "totalPages": 1
}
`

Field notes:
  imageId: ID of the user_images record. null for legacy records (imageId=null means no user_images row exists).
  imageUrl: The image submitted for review (NOT the user's active profile picture).
  isLegacy: true = imageVerificationStatus set by old code before migration; no user_images record.
  email/phoneNumber: Masked for privacy.

---

## Approve an image

POST /admin/users/:userId/approve-image
Authorization: Bearer token (SUPER_ADMIN required)
Content-Type: application/json

Request:
`json
{
  "imageId": 7
}
`

imageId: optional. If omitted, the latest PENDING user_images record is used.
         For legacy records (isLegacy=true, imageId=null), omit imageId.

Response:
`json
{
  "success": true,
  "message": "User image approved successfully",
  "userId": "42",
  "imageId": "7",
  "status": "VERIFIED",
  "approvedBy": "1",
  "approvedAt": "2026-03-13T18:00:00.000Z",
  "cardGenerated": true,
  "cardId": "SLK-2026-001234"
}
`

What happens on approve:
  - user_images record marked VERIFIED
  - user.imageUrl set to the approved image (now visible on profile)
  - user.imageVerificationStatus = VERIFIED
  - If user has no cardId, a new card is generated automatically
  - Confirmation email sent to user (with ID card image for students)

---

## Reject an image

POST /admin/users/:userId/reject-image
Authorization: Bearer token (SUPER_ADMIN required)
Content-Type: application/json

Request:
`json
{
  "imageId": 7,
  "rejectionReason": "Photo is blurry. Please upload a clear, well-lit photo.",
  "urlValidityDays": 7
}
`

imageId: optional - same rule as approve
rejectionReason: required, sent to user via email
urlValidityDays: 1-30, default 7. How long the re-upload link in the email remains valid.

Response:
`json
{
  "success": true,
  "message": "Image rejected and user notified",
  "userId": "42",
  "rejectionReason": "Photo is blurry...",
  "uploadUrl": "https://lms.suraksha.lk/profile/reupload?token=...",
  "expiresAt": "2026-03-20T18:00:00.000Z",
  "emailSent": true
}
`

What happens on reject:
  - user_images record marked REJECTED with reason
  - Cloud file deleted (storage freed)
  - user.imageUrl NOT changed (previous approved image remains active)
  - user.imageVerificationStatus = REJECTED
  - Email sent with rejection reason and re-upload link

---

## Frontend implementation (React)

`	ypescript
// Types

interface PendingImageRecord {
  imageId: string | null;  // null for legacy records
  userId: string;
  nameWithInitials: string;
  email: string;
  phoneNumber: string | null;
  imageUrl: string;
  imageVerificationStatus: 'PENDING' | 'VERIFIED' | 'REJECTED';
  scope: string | null;
  instituteId: string | null;
  imageUploadedAt: string;
  userType: string;
  isLegacy: boolean;
}

// Fetch pending list
async function fetchPendingImages(page = 1): Promise<{users: PendingImageRecord[], total: number}> {
  const res = await adminApi.get('/admin/users/unverified', {
    params: { status: 'PENDING', page, limit: 20 },
  });
  return res.data;
}

// Approve
async function approveImage(userId: string, imageId: string | null): Promise<void> {
  const body: any = {};
  if (imageId !== null) body.imageId = Number(imageId);
  await adminApi.post('/admin/users/' + userId + '/approve-image', body);
}

// Reject
async function rejectImage(userId: string, imageId: string | null, reason: string): Promise<void> {
  const body: any = { rejectionReason: reason, urlValidityDays: 7 };
  if (imageId !== null) body.imageId = Number(imageId);
  await adminApi.post('/admin/users/' + userId + '/reject-image', body);
}
`

---

## Admin dashboard UI checklist

Pending queue table columns:
  - User name (nameWithInitials)
  - Email (masked)
  - Submitted image (imageUrl) - show as thumbnail, click to full size
  - Submitted at (imageUploadedAt) - show relative time
  - User type (userType)
  - Legacy badge (isLegacy=true -> show "Legacy" badge, imageId is null)
  - Actions: Approve button, Reject button (opens reason input dialog)

On approve:
  - Remove row from pending list
  - Show success toast

On reject:
  - Open dialog: text input for rejection reason (required), submit
  - Remove row from pending list
  - Show success toast "Rejection email sent"

Filter tabs:
  - PENDING (default)
  - VERIFIED
  - REJECTED

---

## Status tab differences

PENDING tab shows:
  - imageUrl = the submitted image waiting for review
  - imageId may be null for legacy records - handle this in approve/reject calls

VERIFIED tab shows:
  - imageUrl = the image that was approved
  - imageUploadedAt = when it was originally uploaded
  - verifiedAt is on the user_images record (not in this response, use image-history for per-user detail)

REJECTED tab shows:
  - imageUrl = the rejected image (file may have been deleted from storage - don't rely on URL)
  - For rejected, imageUrl may return 404 from storage since the file is deleted on rejection

---

## Per-user image history (admin view)

To see all submissions for a specific user, use:

GET /admin/users/:userId/image-history  (if this endpoint exists)
OR use the general user detail endpoint.

The user_images table retains REJECTED records (file deleted but DB row kept), 
VERIFIED records, and PENDING records.

---

## Notes on legacy records

isLegacy=true means:
  - This user's imageVerificationStatus was set to PENDING by code running before March 2026
  - There is no user_images record for this submission
  - imageId will be null
  - When approving: POST /admin/users/:userId/approve-image with empty body {}
      The service will use user.imageUrl as the image to approve
  - When rejecting: POST /admin/users/:userId/reject-image with { rejectionReason: "..." }
      The service will use user.imageUrl as the image to reject and delete
