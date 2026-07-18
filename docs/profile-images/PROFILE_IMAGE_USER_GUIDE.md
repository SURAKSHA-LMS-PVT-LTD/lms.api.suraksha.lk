# Profile Image - User Frontend Guide

Current implementation. Backend stores every submission in the user_images table.
The active profile picture is only updated after a System Admin approves the submission.

## How It Works

`
User uploads image
       down
POST /upload/generate-signed-url  -> signed URL
PUT  signedUrl                    -> file in GCS
POST /upload/verify-and-publish   -> publicUrl
POST /users/:id/profile-image     -> submission created (PENDING)
       down
Admin reviews
       down
VERIFIED -> imageUrl updated on profile
REJECTED -> old image stays, user re-uploads
`

## Step 1 - Get signed upload URL

POST /upload/generate-signed-url
Authorization: Bearer token

Request:
`json
{
  "folder": "profile-images",
  "fileName": "photo.jpg",
  "contentType": "image/jpeg",
  "fileSize": 204800
}
`

folder: always profile-images
contentType: image/jpeg, image/jpg, image/png, image/webp
fileSize: bytes - required for server validation

Response:
`json
{
  "success": true,
  "data": {
    "uploadUrl": "https://storage.googleapis.com/suraksha-lms-main-bucket/profile-images/photo-UUID.jpg",
    "relativePath": "profile-images/photo-UUID.jpg",
    "expiresAt": "2026-03-13T18:10:00.000Z",
    "contentType": "image/jpeg"
  }
}
`

## Step 2 - Upload file to GCS

Method: PUT with Content-Type header (NOT FormData).

`	ypescript
await fetch(uploadUrl, {
  method: 'PUT',
  headers: { 'Content-Type': contentType },
  body: file,   // raw File/Blob
});
`

IMPORTANT: Do NOT use FormData. Do NOT add extra headers. GCS uses PUT not POST.

## Step 3 - Publish the file

POST /upload/verify-and-publish
Authorization: Bearer token

Request: { "relativePath": "profile-images/photo-UUID.jpg" }

Response: { "success": true, "publicUrl": "https://storage.googleapis.com/...", "relativePath": "..." }

## Step 4 - Submit image for review

POST /users/:userId/profile-image
Authorization: Bearer token

Request:
`json
{
  "imageUrl": "https://storage.googleapis.com/.../photo-UUID.jpg",
  "scope": "GLOBAL"
}
`

imageUrl: required, full public URL from Step 3
scope: GLOBAL (default) or INSTITUTE
instituteId: required only when scope=INSTITUTE

Response: { "success": true, "message": "Profile image updated successfully", "data": { "userId": "2", "imageUrl": "..." } }

After this call the image has status=PENDING. The user profile picture does NOT change yet.

## Check current status

GET /users/profile/image-status
Authorization: Bearer token

Response:
`json
{
  "success": true,
  "data": {
    "userId": "2",
    "imageUrl": "https://.../currently-active-approved.jpg",
    "pendingImageUrl": "https://.../image-under-review.jpg",
    "pendingImageId": "7",
    "imageVerificationStatus": "PENDING"
  }
}
`

imageUrl: active approved image shown on profile (null if never approved)
pendingImageUrl: image currently under admin review (null if not PENDING)
pendingImageId: user_images record ID (null if not PENDING)
imageVerificationStatus: PENDING / VERIFIED / REJECTED / null

## View full submission history

GET /users/profile/image-history
Authorization: Bearer token

Response:
`json
{
  "success": true,
  "data": [
    {
      "imageId": "7",
      "imageUrl": "https://.../photo-new.jpg",
      "scope": "GLOBAL",
      "instituteId": null,
      "status": "PENDING",
      "rejectionReason": null,
      "verifiedAt": null,
      "verifiedBy": null,
      "uploadedAt": "2026-03-13T17:00:00.000Z"
    },
    {
      "imageId": "3",
      "imageUrl": "https://.../photo-old.jpg",
      "scope": "GLOBAL",
      "instituteId": null,
      "status": "VERIFIED",
      "rejectionReason": null,
      "verifiedAt": "2026-02-01T10:00:00.000Z",
      "verifiedBy": "1",
      "uploadedAt": "2026-01-15T08:00:00.000Z"
    }
  ]
}
`

Ordered newest first.

## What to show per status

null (never uploaded)
  Show upload prompt

PENDING
  Show pendingImageUrl as preview with badge "Under Review"
  Show imageUrl as current profile picture if not null
  Disable upload button - show "Awaiting admin review"

VERIFIED
  Show imageUrl as active profile picture
  Show "Change photo" button

REJECTED
  Get rejection reason from image-history (latest REJECTED record)
  Show re-upload button
  If user had a previously approved image, it remains as their active profile picture

## Complete TypeScript example

`	ypescript
async function submitProfileImage(userId: string, file: File): Promise<void> {
  // 1. Get signed URL
  const { data: urlData } = await api.post('/upload/generate-signed-url', {
    folder: 'profile-images',
    fileName: file.name,
    contentType: file.type,
    fileSize: file.size,
  });
  const { uploadUrl, relativePath, contentType } = urlData.data;

  // 2. Upload to GCS (PUT - NOT FormData)
  const uploadRes = await fetch(uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': contentType },
    body: file,
  });
  if (!uploadRes.ok) throw new Error('Upload to storage failed');

  // 3. Publish
  const { data: publishData } = await api.post('/upload/verify-and-publish', { relativePath });
  const { publicUrl } = publishData;

  // 4. Submit for review
  await api.post('/users/' + userId + '/profile-image', {
    imageUrl: publicUrl,
    scope: 'GLOBAL',
  });

  // 5. Refresh status to show PENDING state
  const { data: status } = await api.get('/users/profile/image-status');
  // status.data.imageVerificationStatus === 'PENDING'
  // status.data.pendingImageUrl === the image just submitted
}
`

## Errors

400 Image file not found in storage: Step 2 or 3 was skipped - repeat upload + verify
400 User not found: Wrong userId in URL
400 Invalid image URL: Must be a valid https:// URL
429 Too Many Requests: 5 submissions per 15 min - wait and retry
