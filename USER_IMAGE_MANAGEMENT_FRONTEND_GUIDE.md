# User Image Management – Frontend Guide

Complete frontend implementation guide for all user-facing image operations:
- Global profile image (upload, change, delete-on-rejection, status polling)
- Institute-level image (upload and status per institute)
- ID document upload

---

## Table of Contents

1. [Overview – Two Image Tiers](#1-overview--two-image-tiers)
2. [Image Verification Status Reference](#2-image-verification-status-reference)
3. [Upload Flow (3 Steps for Any Image)](#3-upload-flow-3-steps-for-any-image)
4. [Global Profile Image – Full Lifecycle](#4-global-profile-image--full-lifecycle)
   - 4.1 [First Upload](#41-first-upload)
   - 4.2 [Polling Verification Status](#42-polling-verification-status)
   - 4.3 [Changing the Image](#43-changing-the-image)
   - 4.4 [Re-Upload After Rejection](#44-re-upload-after-rejection)
5. [Institute-Level User Image – Full Lifecycle](#5-institute-level-user-image--full-lifecycle)
   - 5.1 [Upload Institute Image](#51-upload-institute-image)
   - 5.2 [Get All Uploaded Images & Status](#52-get-all-uploaded-images--status)
   - 5.3 [Change Institute Image](#53-change-institute-image)
6. [ID Document Upload](#6-id-document-upload)
7. [Displaying the Correct Image](#7-displaying-the-correct-image)
8. [Complete API Reference (User Endpoints)](#8-complete-api-reference-user-endpoints)
9. [TypeScript / React Implementation](#9-typescript--react-implementation)
10. [Error Reference](#10-error-reference)

---

## 1. Overview – Two Image Tiers

Every user can have **two independent image slots**:

| Tier | DB Column | Who Reviews | Visibility |
|------|-----------|-------------|------------|
| **Global profile image** | `users.image_url` + `users.image_verification_status` | **System Admin** | Shown everywhere across all institutes once VERIFIED |
| **Institute-level image** | `institute_user.institute_user_image_url` + `institute_user.image_verification_status` | **Institute Admin** of each institute | Used only within that institute (e.g., ID card) |

**Display priority (for a given institute context):**  
If the institute-level image is `VERIFIED` → show it.  
Otherwise → fall back to the global `VERIFIED` profile image.

---

## 2. Image Verification Status Reference

```
PENDING  → Image uploaded, awaiting admin review. Not yet publicly visible.
VERIFIED → Admin approved. Image is active and displayed.
REJECTED → Admin rejected. Image deleted from storage. User must re-upload.
```

All status values are `string` literals — use the constants below in your code:

```typescript
const IMAGE_STATUS = {
  PENDING:  'PENDING',
  VERIFIED: 'VERIFIED',
  REJECTED: 'REJECTED',
} as const;

type ImageVerificationStatus = typeof IMAGE_STATUS[keyof typeof IMAGE_STATUS];
```

---

## 3. Upload Flow (3 Steps for Any Image)

Every image upload (profile, institute, ID doc) follows the **same 3-step pattern**:

```
┌────────────────────────────────────────────────────────────────────┐
│  STEP 1 – Get a signed upload URL (10-minute TTL)                  │
│    GET /upload/get-signed-url?folder=...&fileName=...              │
│    or POST /upload/generate-signed-url  { folder, fileName, ... }  │
│                                                                    │
│  STEP 2 – Upload the file directly to cloud storage (AWS S3)       │
│    POST {uploadUrl}  multipart/form-data: spread all "fields"      │
│    from step 1 response first, then append the file last           │
│                                                                    │
│  STEP 3 – Verify & publish the file                                │
│    POST /upload/verify-and-publish  { relativePath }               │
│    → returns publicUrl                                             │
│                                                                    │
│  STEP 4 (image-specific) – Register the URL with the backend       │
│    POST /users/:id/profile-image       (global profile)            │
│    POST /institute-users/…/upload-image (institute image)          │
│    POST /users/:id/upload-id-document  (ID document)              │
└────────────────────────────────────────────────────────────────────┘
```

### Supported Folders

| Image Type | `folder` Value |
|------------|----------------|
| Global profile image | `profile-images` |
| Institute user image | `institute-user-images` |
| Student images | `student-images` |
| ID document | `id-documents` |

### File Constraints

| Folder | Allowed Extensions | Max Size |
|--------|--------------------|----------|
| `profile-images` | `.jpg .jpeg .png .webp` | 5 MB |
| `institute-user-images` | `.jpg .jpeg .png .webp` | 5 MB |
| `id-documents` | `.jpg .jpeg .png .pdf` | 10 MB |

> **Security**: Double extensions (e.g. `file.pdf.jpg`) are always rejected by the backend.

---

## 4. Global Profile Image – Full Lifecycle

### 4.1 First Upload

#### Step 1 – Get Signed URL

```typescript
// GET method (simplest)
const params = new URLSearchParams({
  folder:      'profile-images',
  fileName:    'my-photo.jpg',
  contentType: 'image/jpeg',
  fileSize:    String(file.size),
});

const res = await fetch(`/upload/get-signed-url?${params}`, {
  headers: { Authorization: `Bearer ${accessToken}` },
});

const { uploadUrl, relativePath, publicUrl, fields } = await res.json();
// uploadUrl      → S3 bucket endpoint for multipart POST upload
// relativePath   → e.g. "profile-images/abc123-my-photo.jpg"
// publicUrl      → future public URL (file not public yet)
// fields         → signed policy fields required by S3 (include in FormData)
```

**Response shape:**
```json
{
  "uploadUrl":    "https://suraksha-lms-main-bucket.s3.us-east-1.amazonaws.com",
  "relativePath": "profile-images/abc123-my-photo.jpg",
  "publicUrl":    "https://suraksha-lms-main-bucket.s3.us-east-1.amazonaws.com/profile-images/abc123-my-photo.jpg",
  "fields": {
    "key":                          "profile-images/abc123-my-photo.jpg",
    "Content-Type":                 "image/jpeg",
    "x-amz-server-side-encryption": "AES256",
    "Policy":                       "eyJleH...",
    "X-Amz-Signature":              "abc123..."
  },
  "expiresIn":    600
}
```

#### Step 2 – Upload File to Cloud (AWS S3 multipart POST)

```typescript
// Build FormData — ALL policy fields must come BEFORE the file
const formData = new FormData();
Object.entries(fields as Record<string, string>).forEach(([key, value]) => {
  formData.append(key, value);
});
formData.append('file', file); // file MUST be the last field

const uploadRes = await fetch(uploadUrl, { method: 'POST', body: formData });
if (!uploadRes.ok) throw new Error('File upload to storage failed');
```

#### Step 3 – Verify & Publish

```typescript
const verifyRes = await fetch('/upload/verify-and-publish', {
  method:  'POST',
  headers: {
    Authorization:  `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ relativePath }),
});

const { publicUrl } = await verifyRes.json();
```

#### Step 4 – Register URL as Profile Image

```http
POST /users/{userId}/profile-image
Authorization: Bearer {token}
Content-Type: application/json

{
  "imageUrl": "https://suraksha-lms-main-bucket.s3.us-east-1.amazonaws.com/profile-images/abc123-my-photo.jpg"
}
```

**Success Response `200`:**
```json
{
  "success": true,
  "message": "Profile image updated successfully",
  "data": {
    "userId": "123",
    "imageUrl": "https://suraksha-lms-main-bucket.s3.us-east-1.amazonaws.com/profile-images/abc123-my-photo.jpg"
  }
}
```

> After this call, `image_verification_status` is automatically set to `PENDING`.  
> The image is **not yet visible on the profile** until a System Admin approves it.

---

### 4.2 Polling Verification Status

There is no dedicated "get my image status" endpoint — the status is returned as part of the user profile response (whichever endpoint your app uses for `GET /users/:id` or `GET /auth/me`).

**Fields to read from the user object:**

```typescript
interface UserProfile {
  imageUrl:                  string | null;   // null if rejected (image deleted)
  imageVerificationStatus:   'PENDING' | 'VERIFIED' | 'REJECTED' | null;
  imageVerifiedAt:           string | null;   // ISO timestamp
  imageRejectionReason:      string | null;   // set when REJECTED
}
```

**Suggested polling pattern (React):**
```typescript
useEffect(() => {
  if (user?.imageVerificationStatus !== 'PENDING') return;

  const id = setInterval(async () => {
    const fresh = await fetchCurrentUser(); // your auth/profile endpoint
    if (fresh.imageVerificationStatus !== 'PENDING') {
      setUser(fresh);
      clearInterval(id);
    }
  }, 30_000); // poll every 30 s

  return () => clearInterval(id);
}, [user?.imageVerificationStatus]);
```

---

### 4.3 Changing the Image

Simply repeat the **same 4-step flow** from §4.1 with the new image file.

The backend:
1. Replaces the existing `image_url` in the database with the new relative path.
2. Sets `image_verification_status = PENDING`.
3. The previously VERIFIED image is **no longer shown** until the new one is approved.

> **Note:** There is no hard limit enforced via this endpoint itself. Any business constraints (e.g., max 3 changes) are recorded in a separate history table and are not checked here.

---

### 4.4 Re-Upload After Rejection

When an admin rejects an image, the user receives an **email** containing a special re-upload link valid for up to 7 days:

```
https://lms.suraksha.lk/profile/image/upload?token={uploadToken}
```

The frontend at that URL must **extract the token from the query string** and call a **public endpoint** (no JWT required):

#### Re-upload Endpoint

```http
POST /users/profile/image/reupload?token={uploadToken}
Content-Type: application/json

{
  "imageUrl": "https://suraksha-lms-main-bucket.s3.us-east-1.amazonaws.com/profile-images/new-photo.jpg"
}
```

> **No `Authorization` header is needed** — the token itself authenticates the request.  
> Rate limit: 10 requests/hour.

**The token contains:**
- `userId` — who is re-uploading
- `exp` — expiry timestamp
- `purpose: 'profile-image-reupload'`

The backend validates the HMAC-SHA256 signature before accepting.

**Success Response `200`:**
```json
{
  "success": true,
  "message": "Profile image re-uploaded successfully. Pending admin review.",
  "userId": "123"
}
```

**Frontend flow for the re-upload page:**

```typescript
// On page load
const token = new URLSearchParams(window.location.search).get('token');

// Still does the 3-step upload first, then:
const res = await fetch(`/users/profile/image/reupload?token=${token}`, {
  method:  'POST',
  headers: { 'Content-Type': 'application/json' },
  body:    JSON.stringify({ imageUrl: publicUrl }),
});
```

---

## 5. Institute-Level User Image – Full Lifecycle

Every institute maintains its own separate image slot for each enrolled user.  
This image is used on institute-issued ID cards and internal dashboards.

### 5.1 Upload Institute Image

Follow the 3-step upload (§3) with `folder = 'institute-user-images'`, then:

```http
POST /institute-users/institute/{instituteId}/users/{userId}/upload-image
Authorization: Bearer {token}
Content-Type: application/json

{
  "imageUrl": "https://suraksha-lms-main-bucket.s3.us-east-1.amazonaws.com/institute-user-images/abc123.jpg"
}
```

> The `imageUrl` must be a full public URL returned from `/upload/verify-and-publish`.

**Success Response `200`:**
```json
{
  "success": true,
  "message": "Institute user image uploaded successfully",
  "imageUrl": "https://suraksha-lms-main-bucket.s3.us-east-1.amazonaws.com/institute-user-images/abc123.jpg",
  "userId": "42",
  "instituteId": "7"
}
```

After upload, `image_verification_status` is set to `PENDING`.

---

### 5.2 Get All Uploaded Images & Status

To see **your own** institute-level image status (and all other institute data), call the endpoint your app uses to load the institute user profile. The image fields are included inline:

**Fields returned in any institute user response:**

```typescript
interface InstituteUserData {
  // Institute-specific image
  instituteUserImageUrl:   string | null;  // full public URL (or null)
  imageVerificationStatus: 'PENDING' | 'VERIFIED' | 'REJECTED' | null;
  imageVerifiedBy:         string | null;  // admin user ID

  // Global user image (fallback)
  userImageUrl:            string | null;

  // Which image is actually displayed
  // Logic: use instituteUserImageUrl if VERIFIED, else userImageUrl
  displayImageUrl:         string | null;  // computed by backend before returning
}
```

> **To list all images you have uploaded across institutes:**  
> Call your app's "my institutes" endpoint for each institute and read the `instituteUserImageUrl` + `imageVerificationStatus` fields.

---

### 5.3 Change Institute Image

To replace an existing institute-level image, simply repeat the upload (§5.1) with the new image. The endpoint overwrites the previous `institute_user_image_url` and resets the status to `PENDING`.

> **On rejection:** The backend deletes the file from cloud storage and nulls `institute_user_image_url`. The user must upload a new image to resume verification.

---

## 6. ID Document Upload

Works exactly like the global profile image but stores in `id-documents` folder and updates `users.id_url`. There is **no admin verification workflow** for ID documents — once uploaded, the URL is immediately saved.

#### Endpoint

```http
POST /users/{userId}/upload-id-document
Authorization: Bearer {token}
Content-Type: application/json

{
  "idUrl": "https://suraksha-lms-main-bucket.s3.us-east-1.amazonaws.com/id-documents/user-42-id.pdf"
}
```

**Success Response `200`:**
```json
{
  "success": true,
  "message": "ID document updated successfully",
  "data": {
    "userId": "42",
    "idUrl": "https://suraksha-lms-main-bucket.s3.us-east-1.amazonaws.com/id-documents/user-42-id.pdf"
  }
}
```

Rate limit: 5 requests per 15 minutes.

---

## 7. Displaying the Correct Image

```typescript
function resolveDisplayImage(user: {
  userImageUrl: string | null;
  userImageStatus: string | null;
  instituteUserImageUrl: string | null;
  instituteImageStatus: string | null;
}): string | null {
  // Prefer institute-level image if it is verified
  if (
    user.instituteUserImageUrl &&
    user.instituteImageStatus === 'VERIFIED'
  ) {
    return user.instituteUserImageUrl;
  }

  // Fall back to global profile image if verified
  if (
    user.userImageUrl &&
    user.userImageStatus === 'VERIFIED'
  ) {
    return user.userImageUrl;
  }

  // No verified image available
  return null;
}
```

**Status badge helper:**

```typescript
function getImageStatusBadge(status: string | null) {
  switch (status) {
    case 'PENDING':  return { label: 'Awaiting Review', color: 'orange' };
    case 'VERIFIED': return { label: 'Approved',        color: 'green'  };
    case 'REJECTED': return { label: 'Rejected',        color: 'red'    };
    default:         return { label: 'No Image',        color: 'grey'   };
  }
}
```

---

## 8. Complete API Reference (User Endpoints)

### Upload Infrastructure

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `GET` | `/upload/get-signed-url` | JWT or API Key | Get signed upload URL (query params) |
| `POST` | `/upload/generate-signed-url` | JWT or API Key | Get signed upload URL (JSON body) |
| `POST` | `/upload/verify-and-publish` | JWT | Make uploaded file public, get final URL |

**`GET /upload/get-signed-url` Query Parameters:**

| Param | Required | Description |
|-------|----------|-------------|
| `folder` | ✅ | `profile-images` / `institute-user-images` / `id-documents` etc. |
| `fileName` | ✅ | Original filename (backend appends UUID) |
| `contentType` | ✅ | MIME type, e.g. `image/jpeg` |
| `fileSize` | ✅ | File size in bytes (validated server-side) |

**`POST /upload/generate-signed-url` JSON body:**

```json
{
  "folder":      "profile-images",
  "fileName":    "photo.jpg",
  "contentType": "image/jpeg",
  "fileSize":    2097152
}
```

---

### Global Profile Image

| Method | Endpoint | Auth | Rate Limit | Description |
|--------|----------|------|------------|-------------|
| `POST` | `/users/:id/profile-image` | JWT | 5/15 min | Set/change global profile image |
| `POST` | `/users/:userId/upload-id-document` | JWT | 5/15 min | Upload ID document |
| `POST` | `/users/profile/image/reupload?token=` | **None** | 10/hour | Re-upload after admin rejection |

**`POST /users/:id/profile-image` Request Body:**
```json
{ "imageUrl": "https://suraksha-lms-main-bucket.s3.us-east-1.amazonaws.com/profile-images/..." }
```

**`POST /users/:userId/upload-id-document` Request Body:**
```json
{ "idUrl": "https://suraksha-lms-main-bucket.s3.us-east-1.amazonaws.com/id-documents/..." }
```

**`POST /users/profile/image/reupload` Request Body:**
```json
{ "imageUrl": "https://suraksha-lms-main-bucket.s3.us-east-1.amazonaws.com/profile-images/..." }
```

---

### Institute-Level Image

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `POST` | `/institute-users/institute/:instituteId/users/:userId/upload-image` | JWT | Upload/replace institute-specific image |

**Request Body:**
```json
{ "imageUrl": "https://suraksha-lms-main-bucket.s3.us-east-1.amazonaws.com/institute-user-images/..." }
```

---

## 9. TypeScript / React Implementation

### Complete Profile Image Upload Component

```tsx
import React, { useRef, useState } from 'react';

const API_BASE = process.env.REACT_APP_API_URL;

interface UploadState {
  status: 'idle' | 'uploading' | 'pending_review' | 'verified' | 'rejected';
  imageUrl: string | null;
  error: string | null;
}

// ──────────────────────────────────────────────
// Core upload helper (reusable for all image types)
// ──────────────────────────────────────────────
async function uploadImageToCloud(
  file: File,
  folder: string,
  token: string
): Promise<{ publicUrl: string; relativePath: string }> {
  // Step 1: Get signed URL
  const params = new URLSearchParams({
    folder,
    fileName:    file.name,
    contentType: file.type,
    fileSize:    String(file.size),
  });

  const signedRes = await fetch(`${API_BASE}/upload/get-signed-url?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!signedRes.ok) {
    const err = await signedRes.json();
    throw new Error(err.message || 'Failed to get upload URL');
  }

  const { uploadUrl, relativePath, fields } = await signedRes.json();

  // Step 2: Upload to cloud (AWS S3 — multipart POST with signed policy fields)
  const formData = new FormData();
  // All policy fields MUST be added first, file MUST be last
  Object.entries(fields as Record<string, string>).forEach(([key, value]) => {
    formData.append(key, value);
  });
  formData.append('file', file);

  const putRes = await fetch(uploadUrl, { method: 'POST', body: formData });
  if (!putRes.ok) throw new Error('File upload to storage failed');

  // Step 3: Verify & publish
  const verifyRes = await fetch(`${API_BASE}/upload/verify-and-publish`, {
    method:  'POST',
    headers: {
      Authorization:  `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ relativePath }),
  });

  if (!verifyRes.ok) {
    const err = await verifyRes.json();
    throw new Error(err.message || 'Failed to verify upload');
  }

  const { publicUrl } = await verifyRes.json();
  return { publicUrl, relativePath };
}

// ──────────────────────────────────────────────
// Global Profile Image Upload Component
// ──────────────────────────────────────────────
export function ProfileImageUpload({
  userId,
  token,
  currentStatus,
  currentImageUrl,
}: {
  userId:          string;
  token:           string;
  currentStatus:   string | null;
  currentImageUrl: string | null;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<UploadState>({
    status:   (currentStatus as any) ?? 'idle',
    imageUrl: currentImageUrl,
    error:    null,
  });
  const [uploading, setUploading] = useState(false);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    // Client-side validation
    const MAX_SIZE_MB = 5;
    if (file.size > MAX_SIZE_MB * 1024 * 1024) {
      setState(s => ({ ...s, error: `File must be under ${MAX_SIZE_MB} MB` }));
      return;
    }

    const allowed = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowed.includes(file.type)) {
      setState(s => ({ ...s, error: 'Only JPEG, PNG, and WebP are allowed' }));
      return;
    }

    setUploading(true);
    setState(s => ({ ...s, error: null }));

    try {
      // Upload to cloud
      const { publicUrl } = await uploadImageToCloud(file, 'profile-images', token);

      // Register with backend
      const regRes = await fetch(`${API_BASE}/users/${userId}/profile-image`, {
        method:  'POST',
        headers: {
          Authorization:  `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ imageUrl: publicUrl }),
      });

      if (!regRes.ok) {
        const err = await regRes.json();
        throw new Error(err.message || 'Failed to save profile image');
      }

      setState({ status: 'pending_review', imageUrl: publicUrl, error: null });
    } catch (err: any) {
      setState(s => ({ ...s, error: err.message }));
    } finally {
      setUploading(false);
    }
  }

  return (
    <div>
      {state.imageUrl && (
        <img
          src={state.imageUrl}
          alt="Profile"
          style={{ width: 120, height: 120, borderRadius: '50%', objectFit: 'cover' }}
        />
      )}

      {/* Status badge */}
      {state.status === 'pending_review' && (
        <span style={{ color: 'orange' }}>⏳ Awaiting admin review</span>
      )}
      {state.status === 'VERIFIED' && (
        <span style={{ color: 'green' }}>✅ Approved</span>
      )}
      {state.status === 'REJECTED' && (
        <span style={{ color: 'red' }}>
          ❌ Rejected — check your email to re-upload
        </span>
      )}

      {state.error && <p style={{ color: 'red' }}>{state.error}</p>}

      <input
        ref={fileRef}
        type="file"
        accept=".jpg,.jpeg,.png,.webp"
        style={{ display: 'none' }}
        onChange={handleFileChange}
      />

      <button
        onClick={() => fileRef.current?.click()}
        disabled={uploading}
      >
        {uploading ? 'Uploading…' : state.imageUrl ? 'Change Image' : 'Upload Image'}
      </button>
    </div>
  );
}

// ──────────────────────────────────────────────
// Institute Image Upload Component
// ──────────────────────────────────────────────
export function InstituteImageUpload({
  userId,
  instituteId,
  token,
  currentImageUrl,
  currentStatus,
}: {
  userId:          string;
  instituteId:     string;
  token:           string;
  currentImageUrl: string | null;
  currentStatus:   string | null;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [imageUrl, setImageUrl] = useState(currentImageUrl);
  const [status, setStatus]   = useState(currentStatus);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setError(null);

    try {
      const { publicUrl } = await uploadImageToCloud(
        file,
        'institute-user-images',
        token
      );

      const endpoint =
        `${API_BASE}/institute-users/institute/${instituteId}/users/${userId}/upload-image`;

      const res = await fetch(endpoint, {
        method:  'POST',
        headers: {
          Authorization:  `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ imageUrl: publicUrl }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || 'Failed to save institute image');
      }

      setImageUrl(publicUrl);
      setStatus('PENDING');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setUploading(false);
    }
  }

  return (
    <div>
      {imageUrl && (
        <img
          src={imageUrl}
          alt="Institute Profile"
          style={{ width: 100, height: 100, objectFit: 'cover', borderRadius: 8 }}
        />
      )}

      {status === 'PENDING'  && <span style={{ color: 'orange' }}>⏳ Pending review</span>}
      {status === 'VERIFIED' && <span style={{ color: 'green' }}>✅ Approved</span>}
      {status === 'REJECTED' && <span style={{ color: 'red' }}>❌ Rejected — upload a new image</span>}

      {error && <p style={{ color: 'red' }}>{error}</p>}

      <input
        ref={fileRef}
        type="file"
        accept=".jpg,.jpeg,.png,.webp"
        style={{ display: 'none' }}
        onChange={handleFileChange}
      />

      <button onClick={() => fileRef.current?.click()} disabled={uploading}>
        {uploading ? 'Uploading…' : imageUrl ? 'Change Image' : 'Upload Image'}
      </button>
    </div>
  );
}

// ──────────────────────────────────────────────
// Re-upload page (called from rejection email link)
// ──────────────────────────────────────────────
export function ReuploadProfileImage({ token: uploadToken }: { token: string }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<'idle' | 'uploading' | 'done' | 'error'>('idle');
  const [message, setMessage] = useState('');

  // Note: we need a JWT for the upload/verify steps only;
  // the reupload registration endpoint accepts the uploadToken instead.

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setStatus('uploading');

    try {
      // Step 1–3: Use API key or fallback approach for getting signed URL
      // Since this page has no JWT, use the public upload endpoint
      const params = new URLSearchParams({
        folder:      'profile-images',
        fileName:    file.name,
        contentType: file.type,
        fileSize:    String(file.size),
      });

      const signedRes = await fetch(
        `${API_BASE}/public/upload/get-signed-url?${params}`,
        {
          // Public endpoint — API key sent via header or no auth required
          // depending on your setup
        }
      );

      if (!signedRes.ok) throw new Error('Could not get upload URL');

      const { uploadUrl, relativePath } = await signedRes.json();

      await fetch(uploadUrl, {
        method:  'PUT',
        body:    file,
        headers: { 'Content-Type': file.type },
      });

      const verifyRes = await fetch(`${API_BASE}/public/upload/verify-and-publish`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ relativePath }),
      });

      const { publicUrl } = await verifyRes.json();

      // Step 4: Register via token
      const regRes = await fetch(
        `${API_BASE}/users/profile/image/reupload?token=${uploadToken}`,
        {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ imageUrl: publicUrl }),
        }
      );

      if (!regRes.ok) {
        const err = await regRes.json();
        throw new Error(err.message || 'Re-upload failed');
      }

      setStatus('done');
      setMessage('Image submitted for review. You will be notified once approved.');
    } catch (err: any) {
      setStatus('error');
      setMessage(err.message);
    }
  }

  return (
    <div>
      <h2>Upload New Profile Image</h2>
      {status === 'done'  && <p style={{ color: 'green' }}>{message}</p>}
      {status === 'error' && <p style={{ color: 'red' }}>{message}</p>}

      {status !== 'done' && (
        <>
          <input
            ref={fileRef}
            type="file"
            accept=".jpg,.jpeg,.png,.webp"
            style={{ display: 'none' }}
            onChange={handleFile}
          />
          <button
            onClick={() => fileRef.current?.click()}
            disabled={status === 'uploading'}
          >
            {status === 'uploading' ? 'Uploading…' : 'Select Image'}
          </button>
        </>
      )}
    </div>
  );
}
```

---

## 10. Error Reference

| HTTP Status | Scenario | Resolution |
|-------------|----------|------------|
| `400 Bad Request` | `imageUrl` is not a valid URL | Pass the full `https://` URL returned by `/upload/verify-and-publish` |
| `400 Bad Request` | Image file not found in storage | Upload via signed URL first, then call verify-and-publish before registering |
| `400 Bad Request` | Double extension in filename (`file.pdf.jpg`) | Rename file to single extension |
| `401 Unauthorized` | Missing or expired JWT | Refresh access token and retry |
| `403 Forbidden` | JWT userId does not match param | Only upload to your own user ID |
| `404 Not Found` | User or institute-user record not found | Verify `userId` / `instituteId` are correct |
| `429 Too Many Requests` | Rate limit exceeded | Profile: 5 per 15 min. Re-upload: 10 per hour. Wait and retry. |
| `400` on reupload | `token` expired (> 7 days) | Contact admin to issue a new rejection + re-upload link |
| GCS `403` on PUT | Signed URL expired (10-min window) | Re-request a new signed URL and upload again |

---

*Last updated: 2026 — Based on codebase analysis of `user-profile-image.controller.ts`, `institue_user.service.ts`, `upload.controller.ts`, and related entities.*
