# Profile Image & ID Document — Complete Implementation Guide

> **Base URL:** `https://lmsapi.suraksha.lk`  
> **Auth:** `Authorization: Bearer <jwt_token>` on all endpoints unless marked 🔓 Public  
> **Storage:** AWS S3 (`suraksha-lms-main-bucket`, `us-east-1`)

---

## Table of Contents

1. [Image Lifecycle Overview](#1-image-lifecycle-overview)
2. [File Upload Flow (Signed URL)](#2-file-upload-flow-signed-url)
3. [Update Profile Image](#3-update-profile-image)
4. [Update ID Document](#4-update-id-document)
5. [Get Profile Image Status](#5-get-profile-image-status)
6. [Admin: Reject Profile Image](#6-admin-reject-profile-image)
7. [Public: Re-upload After Rejection](#7-public-re-upload-after-rejection)
8. [Allowed File Types & Size Limits](#8-allowed-file-types--size-limits)
9. [Complete React Implementation](#9-complete-react-implementation)
10. [Error Reference](#10-error-reference)

---

## 1. Image Lifecycle Overview

```
User uploads image
       │
       ▼
imageVerificationStatus = PENDING
       │
       ├─── System Admin reviews via /users/verified-users endpoint
       │
       ├─── APPROVE ──────► imageVerificationStatus = VERIFIED
       │                          imageUrl = relative S3 path (shown as full URL in API)
       │
       └─── REJECT ───────► imageVerificationStatus = REJECTED
                                  imageUrl = null (cleared)
                                  User receives email with re-upload link
                                  User re-uploads via /users/profile/image/reupload?token=xxx
```

### Status Values

| Status | Meaning | Image Visible |
|--------|---------|--------------|
| `null` | No image uploaded yet | No |
| `PENDING` | Uploaded, awaiting admin review | Shown to admins only |
| `VERIFIED` | Approved by admin | ✅ Visible to all |
| `REJECTED` | Rejected by admin — image cleared | No |

---

## 2. File Upload Flow (Signed URL)

All file uploads use a 3-step process: **get URL → upload to S3 → confirm/register**.

### Step 1 — Get Signed Upload URL

Two methods available:

#### Method A — POST (recommended, more control)

```
POST /upload/generate-signed-url
Authorization: Bearer <token>  OR  Bearer <API_KEY>
Content-Type: application/json
```

**Request Body:**
```json
{
  "folder": "profile-images",
  "fileName": "user-avatar.jpg",
  "contentType": "image/jpeg",
  "fileSize": 2097152
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `folder` | enum | ✅ | Target storage folder (see list below) |
| `fileName` | string | ✅ | Original filename. Will be made unique automatically |
| `contentType` | string | ✅ | MIME type (e.g. `image/jpeg`) |
| `fileSize` | number | ✅ | File size in bytes. Used for server-side validation |

**Allowed `folder` values:**

| `folder` | Use For |
|----------|---------|
| `profile-images` | User profile pictures |
| `student-images` | Student registration photos |
| `institute-images` | Institute logos |
| `institute-user-images` | Institute-specific user photos |
| `id-documents` | National ID / passport images |
| `homework-files` | Homework submissions |
| `correction-files` | Teacher corrections |
| `institute-payment-receipts` | Institute-level receipts |
| `subject-payment-receipts` | Subject-level receipts |
| `bookhire-vehicle-images` | Vehicle photos |
| `bookhire-owner-images` | Transport owner photos |

**Response (200):**
```json
{
  "success": true,
  "message": "SHORT-LIVED private upload URL generated (expires in 10 minutes)",
  "data": {
    "uploadUrl": "https://suraksha-lms-main-bucket.s3.us-east-1.amazonaws.com",
    "relativePath": "profile-images/user-avatar-a1b2c3d4-uuid.jpg",
    "expiresAt": "2026-03-13T10:10:00.000Z",
    "maxFileSize": 5242880,
    "fields": {
      "key": "profile-images/user-avatar-a1b2c3d4-uuid.jpg",
      "Content-Type": "image/jpeg",
      "x-amz-server-side-encryption": "AES256",
      "Policy": "eyJ...",
      "X-Amz-Signature": "abc123...",
      "X-Amz-Algorithm": "AWS4-HMAC-SHA256",
      "X-Amz-Credential": "AKIA.../20260313/us-east-1/s3/aws4_request",
      "X-Amz-Date": "20260313T100000Z"
    }
  },
  "instructions": {
    "uploadMethod": "POST",
    "step1": "Upload file to uploadUrl using POST request",
    "step2": "Send relativePath to /upload/verify-and-publish endpoint",
    "step3": "Backend verifies and returns long-term public URL",
    "important": "File will be PRIVATE until verified by backend"
  }
}
```

> ⚠️ **Save `data.relativePath`** — you need it in Step 3.

#### Method B — GET (quick integration / mobile)

```
GET /upload/get-signed-url?folder=profile-images&fileName=avatar.jpg&contentType=image/jpeg&fileSize=2097152
Authorization: Bearer <token>
```

Same response shape as Method A.

#### Method C — Profile images only (API key auth)

```
GET /upload/profile-images/get-signed-url?fileName=avatar.jpg&contentType=image/jpeg&fileSize=2097152
Authorization: Bearer <API_KEY>
```

---

### Step 2 — Upload File Directly to S3

Use the `data.uploadUrl` and `data.fields` from Step 1. For AWS S3, this is a **multipart POST**. Fields from the response must come **before** the file.

```js
async function uploadToS3(uploadUrl, fields, file) {
  const formData = new FormData();

  // 1. Add ALL fields from the response FIRST (order matters for S3)
  Object.entries(fields).forEach(([key, value]) => {
    formData.append(key, value);
  });

  // 2. Add the actual file LAST
  formData.append('file', file);

  const response = await fetch(uploadUrl, {
    method: 'POST',
    body: formData,
    // Do NOT set Content-Type manually — browser sets it with boundary
  });

  // S3 returns 204 No Content on success
  if (!response.ok && response.status !== 204) {
    const errText = await response.text();
    throw new Error(`S3 upload failed (${response.status}): ${errText}`);
  }
}
```

---

### Step 3 — Verify & Publish

After upload completes, tell the backend to verify the file and make it publicly accessible.

```
POST /upload/verify-and-publish
Authorization: Bearer <token>
Content-Type: application/json
```

**Request Body:**
```json
{
  "relativePath": "profile-images/user-avatar-a1b2c3d4-uuid.jpg"
}
```

**Response (200):**
```json
{
  "success": true,
  "message": "File verified and made public successfully",
  "publicUrl": "https://suraksha-lms-main-bucket.s3.us-east-1.amazonaws.com/profile-images/user-avatar-a1b2c3d4-uuid.jpg",
  "relativePath": "profile-images/user-avatar-a1b2c3d4-uuid.jpg",
  "instructions": {
    "nextStep": "Use publicUrl in your API calls (user creation, profile update, etc.)",
    "note": "This URL is now publicly accessible and has no expiration"
  }
}
```

Use the returned `publicUrl` in the subsequent profile update or ID document endpoint call.

---

## 3. Update Profile Image

After completing the signed URL upload (Steps 1–3 above), register the image on the user's profile.

```
POST /users/:id/profile-image
Authorization: Bearer <token>
Content-Type: application/json
```

**Rate limit:** 5 requests per 15 minutes per user.

**Request Body:**
```json
{
  "imageUrl": "https://suraksha-lms-main-bucket.s3.us-east-1.amazonaws.com/profile-images/user-avatar-a1b2c3d4-uuid.jpg"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `imageUrl` | string (URL) | ✅ | Full public URL from `/upload/verify-and-publish` |

**Response (200):**
```json
{
  "success": true,
  "message": "Profile image updated successfully",
  "data": {
    "userId": "123",
    "imageUrl": "https://suraksha-lms-main-bucket.s3.us-east-1.amazonaws.com/profile-images/user-avatar-a1b2c3d4-uuid.jpg"
  }
}
```

> ℹ️ After update, `imageVerificationStatus` is automatically set to **`PENDING`** — the image is queued for admin review.

---

## 4. Update ID Document

Upload the ID document first (use `folder: "id-documents"` in Step 1), then register it.

```
POST /users/:userId/upload-id-document
Authorization: Bearer <token>
Content-Type: application/json
```

**Rate limit:** 5 requests per 15 minutes per user.

**Request Body:**
```json
{
  "idUrl": "https://suraksha-lms-main-bucket.s3.us-east-1.amazonaws.com/id-documents/user-id-a1b2c3d4.jpg"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `idUrl` | string (URL) | ✅ | Full public URL from `/upload/verify-and-publish` |

**Response (200):**
```json
{
  "success": true,
  "message": "ID document updated successfully",
  "data": {
    "userId": "123",
    "idUrl": "https://suraksha-lms-main-bucket.s3.us-east-1.amazonaws.com/id-documents/user-id-a1b2c3d4.jpg"
  }
}
```

> ⚠️ The backend performs a `fileExists` check in S3 before accepting the URL. Call this endpoint only **after** the S3 upload completes. If you get a 400 "File not found" error, wait 2 seconds and retry once.

---

## 5. Get Profile Image Status

Check the current image and its verification status for the authenticated user.

```
GET /users/profile/image-status
Authorization: Bearer <token>
```

**Response (200):**
```json
{
  "success": true,
  "data": {
    "userId": "123",
    "imageUrl": "https://suraksha-lms-main-bucket.s3.us-east-1.amazonaws.com/profile-images/user-avatar-a1b2c3d4.jpg",
    "imageVerificationStatus": "PENDING"
  }
}
```

| `imageVerificationStatus` | When to Show in UI |
|--------------------------|-------------------|
| `null` | "Upload your profile photo" prompt |
| `PENDING` | "Your photo is under review" banner |
| `VERIFIED` | Show photo normally |
| `REJECTED` | "Your photo was rejected — please upload again" |

When `imageUrl` is `null` and `imageVerificationStatus` is `REJECTED`, the user must re-upload using the token from their rejection email.

---

## 6. Admin: Reject Profile Image

**System Admin (SUPERADMIN role) only.**

```
POST /users/reject-profile-image/:userId
Authorization: Bearer <token>
Content-Type: application/json
```

**Request Body:**
```json
{
  "reason": "Photo is blurry and does not clearly show the face"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `reason` | string | ❌ | Rejection reason shown to user in email |

**Response (200):**
```json
{
  "success": true,
  "message": "Profile image rejected successfully. Email notification sent to user.",
  "data": {
    "userId": "123",
    "emailSent": true,
    "userEmail": "u***r@example.com"
  }
}
```

**What happens on rejection:**
1. `imageUrl` is set to `null` on the user record
2. `imageVerificationStatus` is set to `REJECTED`
3. An email is sent to the user with:
   - The rejection reason
   - A one-time re-upload link with an expiring token
4. User can re-upload via the public endpoint (Section 7)

---

## 7. Public: Re-upload After Rejection

🔓 **No JWT required** — uses a one-time upload token from the rejection email.

```
POST /users/profile/image/reupload?token=<upload_token>
Content-Type: application/json
```

**Request Body:**
```json
{
  "imageUrl": "https://suraksha-lms-main-bucket.s3.us-east-1.amazonaws.com/profile-images/user-reupload-uuid.jpg"
}
```

The user must still upload the file to S3 first (Steps 1–3 above). The signed URL endpoint (`/upload/profile-images/get-signed-url`) accepts an API key, so it works without a JWT.

**Response (200):**
```json
{
  "success": true,
  "message": "Profile image updated successfully. It will be reviewed by an administrator.",
  "data": {
    "userId": "123"
  }
}
```

After re-upload, `imageVerificationStatus` is reset to **`PENDING`** for re-review.

---

## 8. Allowed File Types & Size Limits

### Profile Images (`profile-images`)

| Allowed Extensions | Max Size |
|--------------------|----------|
| `.jpg`, `.jpeg`, `.png`, `.webp` | 5 MB |

### ID Documents (`id-documents`)

| Allowed Extensions | Max Size |
|--------------------|----------|
| `.jpg`, `.jpeg`, `.png`, `.pdf` | 10 MB |

### Other Folders

| `folder` | Allowed Extensions | Max Size |
|----------|--------------------|----------|
| `student-images` | `.jpg`, `.jpeg`, `.png`, `.webp` | 5 MB |
| `institute-images` | `.jpg`, `.jpeg`, `.png`, `.webp`, `.svg` | 5 MB |
| `homework-files` | `.pdf`, `.jpg`, `.jpeg`, `.png`, `.doc`, `.docx` | 50 MB |
| `correction-files` | `.pdf`, `.jpg`, `.jpeg`, `.png` | 20 MB |

> ⚠️ **Double extensions like `file.pdf.jpg` are always rejected** regardless of folder.

---

## 9. Complete React Implementation

### 9.1 — Complete Profile Image Upload Component

```tsx
// ProfileImageUpload.tsx
import React, { useState, useEffect, useRef } from 'react';

const API_URL = 'https://lmsapi.suraksha.lk';

interface ImageStatus {
  userId: string;
  imageUrl: string | null;
  imageVerificationStatus: 'PENDING' | 'VERIFIED' | 'REJECTED' | null;
}

interface Props {
  userId: string;
  token: string;
  onSuccess?: (imageUrl: string) => void;
}

export const ProfileImageUpload: React.FC<Props> = ({ userId, token, onSuccess }) => {
  const [status, setStatus] = useState<ImageStatus | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [uploadState, setUploadState] = useState<
    'idle' | 'getting-url' | 'uploading' | 'publishing' | 'registering' | 'done' | 'error'
  >('idle');
  const [error, setError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const authHeaders = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };

  // Load current image status on mount
  useEffect(() => {
    fetch(`${API_URL}/users/profile/image-status`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.json())
      .then(data => {
        if (data.success) setStatus(data.data);
      })
      .catch(() => {}); // Endpoint may not be available in all contexts
  }, [token]);

  // Create preview when file is selected
  useEffect(() => {
    if (!file) { setPreview(null); return; }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = e.target.files?.[0];
    if (!selected) return;

    // Client-side validation
    const allowed = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    if (!allowed.includes(selected.type)) {
      setError('Only JPEG, PNG, and WebP images are allowed.');
      return;
    }
    if (selected.size > 5 * 1024 * 1024) {
      setError('Image must be smaller than 5 MB.');
      return;
    }
    setError('');
    setFile(selected);
  }

  async function handleUpload() {
    if (!file) return;
    setError('');

    try {
      // ── Step 1: Get signed upload URL ──
      setUploadState('getting-url');
      const genRes = await fetch(`${API_URL}/upload/generate-signed-url`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          folder: 'profile-images',
          fileName: file.name,
          contentType: file.type,
          fileSize: file.size,
        }),
      });
      if (!genRes.ok) {
        const err = await genRes.json();
        throw new Error(err.message || 'Failed to get upload URL');
      }
      const genData = await genRes.json();
      const { uploadUrl, relativePath, fields } = genData.data;

      // ── Step 2: Upload to S3 ──
      setUploadState('uploading');
      const formData = new FormData();
      // Fields FIRST, file LAST (S3 requirement)
      Object.entries(fields || {}).forEach(([k, v]) => formData.append(k, v as string));
      formData.append('file', file);

      const s3Res = await fetch(uploadUrl, { method: 'POST', body: formData });
      if (!s3Res.ok && s3Res.status !== 204) {
        throw new Error(`S3 upload failed (status ${s3Res.status})`);
      }

      // ── Step 3: Verify & publish ──
      setUploadState('publishing');
      const pubRes = await fetch(`${API_URL}/upload/verify-and-publish`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({ relativePath }),
      });
      if (!pubRes.ok) {
        const err = await pubRes.json();
        throw new Error(err.message || 'Failed to publish file');
      }
      const { publicUrl } = await pubRes.json();

      // ── Step 4: Register on user profile ──
      setUploadState('registering');
      const regRes = await fetch(`${API_URL}/users/${userId}/profile-image`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({ imageUrl: publicUrl }),
      });
      if (!regRes.ok) {
        const err = await regRes.json();
        throw new Error(err.message || 'Failed to register image');
      }

      setUploadState('done');
      setStatus({ userId, imageUrl: publicUrl, imageVerificationStatus: 'PENDING' });
      onSuccess?.(publicUrl);
    } catch (e: any) {
      setUploadState('error');
      setError(e.message);
    }
  }

  const statusBadge = () => {
    if (!status?.imageVerificationStatus) return null;
    const styles: Record<string, React.CSSProperties> = {
      PENDING:  { background: '#fff3cd', color: '#856404', padding: '4px 10px', borderRadius: 12, fontSize: 12 },
      VERIFIED: { background: '#d1e7dd', color: '#0f5132', padding: '4px 10px', borderRadius: 12, fontSize: 12 },
      REJECTED: { background: '#f8d7da', color: '#842029', padding: '4px 10px', borderRadius: 12, fontSize: 12 },
    };
    const labels = { PENDING: '⏳ Under Review', VERIFIED: '✅ Verified', REJECTED: '❌ Rejected' };
    const s = status.imageVerificationStatus;
    return <span style={styles[s]}>{labels[s]}</span>;
  };

  const buttonLabel = () => {
    switch (uploadState) {
      case 'getting-url':   return 'Preparing upload...';
      case 'uploading':     return 'Uploading to S3...';
      case 'publishing':    return 'Finalizing...';
      case 'registering':   return 'Saving...';
      case 'done':          return '✅ Done!';
      default:              return 'Upload Photo';
    }
  };

  return (
    <div style={{ maxWidth: 360 }}>
      {/* Current image */}
      <div style={{ marginBottom: 12 }}>
        {status?.imageUrl ? (
          <img
            src={status.imageUrl}
            alt="Profile"
            style={{ width: 100, height: 100, borderRadius: '50%', objectFit: 'cover', border: '2px solid #ddd' }}
          />
        ) : (
          <div style={{ width: 100, height: 100, borderRadius: '50%', background: '#eee', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 36 }}>
            👤
          </div>
        )}
        <div style={{ marginTop: 6 }}>{statusBadge()}</div>

        {status?.imageVerificationStatus === 'REJECTED' && (
          <p style={{ color: '#842029', fontSize: 13, marginTop: 6 }}>
            Your profile photo was rejected. Please upload a new one.
          </p>
        )}
        {status?.imageVerificationStatus === 'PENDING' && (
          <p style={{ color: '#856404', fontSize: 13, marginTop: 6 }}>
            Your photo is under review by an administrator.
          </p>
        )}
      </div>

      {/* File picker + preview */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        style={{ display: 'none' }}
        onChange={handleFileChange}
      />
      <button
        onClick={() => fileInputRef.current?.click()}
        style={{ padding: '6px 14px', marginRight: 8, cursor: 'pointer' }}
        disabled={uploadState === 'uploading' || uploadState === 'publishing' || uploadState === 'registering'}
      >
        Choose Photo
      </button>
      {file && (
        <span style={{ fontSize: 13, color: '#666' }}>{file.name} ({(file.size / 1024).toFixed(0)} KB)</span>
      )}

      {preview && (
        <div style={{ marginTop: 8 }}>
          <img src={preview} alt="Preview" style={{ width: 80, height: 80, objectFit: 'cover', borderRadius: 8, border: '1px solid #ddd' }} />
        </div>
      )}

      <div style={{ marginTop: 10 }}>
        <button
          onClick={handleUpload}
          disabled={!file || uploadState === 'uploading' || uploadState === 'publishing' || uploadState === 'registering' || uploadState === 'done'}
          style={{ padding: '8px 16px', background: '#0d6efd', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer' }}
        >
          {buttonLabel()}
        </button>
      </div>

      {error && (
        <p style={{ color: '#842029', marginTop: 8, fontSize: 13, background: '#f8d7da', padding: '8px 12px', borderRadius: 6 }}>
          ⚠️ {error}
        </p>
      )}
    </div>
  );
};
```

---

### 9.2 — ID Document Upload Component

```tsx
// IdDocumentUpload.tsx
import React, { useState } from 'react';

const API_URL = 'https://lmsapi.suraksha.lk';

interface Props {
  userId: string;
  token: string;
  onSuccess?: (idUrl: string) => void;
}

export const IdDocumentUpload: React.FC<Props> = ({ userId, token, onSuccess }) => {
  const [file, setFile] = useState<File | null>(null);
  const [state, setState] = useState<'idle' | 'uploading' | 'done' | 'error'>('idle');
  const [error, setError] = useState('');

  const authHeaders = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    const allowed = ['image/jpeg', 'image/jpg', 'image/png', 'application/pdf'];
    if (!allowed.includes(f.type)) {
      setError('Only JPEG, PNG, or PDF files are allowed for ID documents.');
      return;
    }
    if (f.size > 10 * 1024 * 1024) {
      setError('ID document must be smaller than 10 MB.');
      return;
    }
    setError('');
    setFile(f);
  }

  async function handleUpload() {
    if (!file) return;
    setError('');
    setState('uploading');

    try {
      // Step 1 — Get signed URL
      const genRes = await fetch(`${API_URL}/upload/generate-signed-url`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          folder: 'id-documents',
          fileName: file.name,
          contentType: file.type,
          fileSize: file.size,
        }),
      });
      if (!genRes.ok) {
        const err = await genRes.json();
        throw new Error(err.message || 'Failed to get upload URL');
      }
      const { data: { uploadUrl, relativePath, fields } } = await genRes.json();

      // Step 2 — Upload to S3
      const formData = new FormData();
      Object.entries(fields || {}).forEach(([k, v]) => formData.append(k, v as string));
      formData.append('file', file);

      const s3Res = await fetch(uploadUrl, { method: 'POST', body: formData });
      if (!s3Res.ok && s3Res.status !== 204) {
        throw new Error(`Upload failed: ${s3Res.status}`);
      }

      // Step 3 — Verify & publish
      const pubRes = await fetch(`${API_URL}/upload/verify-and-publish`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({ relativePath }),
      });
      if (!pubRes.ok) {
        const err = await pubRes.json();
        throw new Error(err.message || 'Failed to publish file');
      }
      const { publicUrl } = await pubRes.json();

      // Step 4 — Register on user profile (1 retry for race condition)
      const register = async () => {
        const res = await fetch(`${API_URL}/users/${userId}/upload-id-document`, {
          method: 'POST',
          headers: authHeaders,
          body: JSON.stringify({ idUrl: publicUrl }),
        });
        if (!res.ok) {
          const err = await res.json();
          // Retry once on "file not found" (S3 eventual consistency)
          if (err.message?.includes('not found') || res.status === 400) {
            await new Promise(r => setTimeout(r, 2000));
            const retry = await fetch(`${API_URL}/users/${userId}/upload-id-document`, {
              method: 'POST',
              headers: authHeaders,
              body: JSON.stringify({ idUrl: publicUrl }),
            });
            if (!retry.ok) {
              const retryErr = await retry.json();
              throw new Error(retryErr.message || 'Failed to save ID document');
            }
            return retry.json();
          }
          throw new Error(err.message || 'Failed to save ID document');
        }
        return res.json();
      };

      await register();
      setState('done');
      onSuccess?.(publicUrl);
    } catch (e: any) {
      setState('error');
      setError(e.message);
    }
  }

  return (
    <div style={{ maxWidth: 400 }}>
      <h4 style={{ marginBottom: 8 }}>ID Document Upload</h4>
      <p style={{ fontSize: 13, color: '#666', marginBottom: 12 }}>
        Upload your National ID card, passport, or driving licence (JPG, PNG, or PDF — max 10 MB)
      </p>

      <input
        type="file"
        accept="image/jpeg,image/png,application/pdf"
        onChange={handleFileChange}
        disabled={state === 'uploading'}
      />

      {file && (
        <p style={{ fontSize: 12, color: '#666', marginTop: 4 }}>
          Selected: {file.name} ({(file.size / 1024 / 1024).toFixed(2)} MB)
        </p>
      )}

      <div style={{ marginTop: 10 }}>
        <button
          onClick={handleUpload}
          disabled={!file || state === 'uploading' || state === 'done'}
          style={{ padding: '8px 16px', background: '#198754', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer' }}
        >
          {state === 'uploading' ? 'Uploading...' : state === 'done' ? '✅ Saved' : 'Upload Document'}
        </button>
      </div>

      {error && (
        <p style={{ color: '#842029', marginTop: 8, fontSize: 13, background: '#f8d7da', padding: '8px 12px', borderRadius: 6 }}>
          ⚠️ {error}
        </p>
      )}
    </div>
  );
};
```

---

### 9.3 — Image Status Banner (Read-Only Display)

```tsx
// ImageStatusBanner.tsx
import React, { useEffect, useState } from 'react';

const API_URL = 'https://lmsapi.suraksha.lk';

interface Props {
  token: string;
  onRejected?: () => void;
}

export const ImageStatusBanner: React.FC<Props> = ({ token, onRejected }) => {
  const [status, setStatus] = useState<'PENDING' | 'VERIFIED' | 'REJECTED' | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${API_URL}/users/profile/image-status`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.json())
      .then(data => {
        if (data.success) setStatus(data.data.imageVerificationStatus);
      })
      .finally(() => setLoading(false));
  }, [token]);

  if (loading || status === null || status === 'VERIFIED') return null;

  if (status === 'PENDING') {
    return (
      <div style={{ background: '#fff3cd', border: '1px solid #ffc107', padding: '10px 16px', borderRadius: 8, fontSize: 14 }}>
        ⏳ <strong>Your profile photo is under review.</strong> It will be visible after an administrator approves it.
      </div>
    );
  }

  if (status === 'REJECTED') {
    return (
      <div style={{ background: '#f8d7da', border: '1px solid #f5c2c7', padding: '10px 16px', borderRadius: 8, fontSize: 14 }}>
        ❌ <strong>Your profile photo was rejected.</strong> Please check your email for the upload link, or{' '}
        <button
          onClick={onRejected}
          style={{ background: 'none', border: 'none', color: '#842029', cursor: 'pointer', textDecoration: 'underline', padding: 0 }}
        >
          upload a new photo now
        </button>.
      </div>
    );
  }

  return null;
};
```

---

### 9.4 — Public Re-upload (Token-Based)

```tsx
// ReuploadPage.tsx
// Rendered at: /profile-image/reupload?token=<token_from_email>
import React, { useState } from 'react';

const API_URL = 'https://lmsapi.suraksha.lk';

export const ReuploadPage: React.FC = () => {
  const token = new URLSearchParams(window.location.search).get('token') || '';
  const [file, setFile] = useState<File | null>(null);
  const [state, setState] = useState<'idle' | 'uploading' | 'done' | 'error'>('idle');
  const [error, setError] = useState('');

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    const allowed = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    if (!allowed.includes(f.type)) {
      setError('Only JPEG, PNG, WebP images allowed.');
      return;
    }
    if (f.size > 5 * 1024 * 1024) {
      setError('Maximum size is 5 MB.');
      return;
    }
    setError('');
    setFile(f);
  }

  async function handleReupload() {
    if (!file || !token) return;
    setState('uploading');
    setError('');

    try {
      // Step 1 — Get signed URL (uses API key auth, no JWT needed)
      const genRes = await fetch(
        `${API_URL}/upload/profile-images/get-signed-url?fileName=${encodeURIComponent(file.name)}&contentType=${encodeURIComponent(file.type)}&fileSize=${file.size}`,
        { headers: { Authorization: `Bearer ${import.meta.env.VITE_API_KEY}` } }
      );
      if (!genRes.ok) {
        const err = await genRes.json();
        throw new Error(err.message || 'Could not get upload URL');
      }
      const genData = await genRes.json();
      const { uploadUrl, relativePath, fields } = genData;

      // Step 2 — Upload to S3
      const formData = new FormData();
      Object.entries(fields || {}).forEach(([k, v]) => formData.append(k, v as string));
      formData.append('file', file);
      const s3Res = await fetch(uploadUrl, { method: 'POST', body: formData });
      if (!s3Res.ok && s3Res.status !== 204) throw new Error('Upload to storage failed');

      // Step 3 — Verify & publish (no auth needed for profile-images via API key guard)
      const pubRes = await fetch(`${API_URL}/upload/verify-and-publish`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${import.meta.env.VITE_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ relativePath }),
      });
      if (!pubRes.ok) throw new Error('Could not finalise upload');
      const { publicUrl } = await pubRes.json();

      // Step 4 — Re-register via token-based public endpoint
      const reupRes = await fetch(`${API_URL}/users/profile/image/reupload?token=${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageUrl: publicUrl }),
      });
      if (!reupRes.ok) {
        const err = await reupRes.json();
        throw new Error(err.message || 'Could not save new image');
      }

      setState('done');
    } catch (e: any) {
      setState('error');
      setError(e.message);
    }
  }

  if (!token) {
    return (
      <div style={{ padding: 24, textAlign: 'center', color: '#842029' }}>
        ❌ Invalid or missing upload token. Please use the link from your email.
      </div>
    );
  }

  if (state === 'done') {
    return (
      <div style={{ padding: 24, textAlign: 'center' }}>
        <h2>✅ Photo uploaded successfully!</h2>
        <p>Your new profile photo has been submitted and will be reviewed shortly.</p>
      </div>
    );
  }

  return (
    <div style={{ padding: 24, maxWidth: 400, margin: '0 auto' }}>
      <h2>Upload New Profile Photo</h2>
      <p style={{ color: '#666', fontSize: 14 }}>Your previous photo was not accepted. Please upload a clear, front-facing photo.</p>

      <input
        type="file"
        accept="image/jpeg,image/png,image/webp"
        onChange={handleFileChange}
        disabled={state === 'uploading'}
      />

      <div style={{ marginTop: 12 }}>
        <button
          onClick={handleReupload}
          disabled={!file || state === 'uploading'}
          style={{ padding: '8px 20px', background: '#0d6efd', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer' }}
        >
          {state === 'uploading' ? 'Uploading...' : 'Submit New Photo'}
        </button>
      </div>

      {error && (
        <p style={{ color: '#842029', marginTop: 10, background: '#f8d7da', padding: '8px 12px', borderRadius: 6, fontSize: 13 }}>
          ⚠️ {error}
        </p>
      )}
    </div>
  );
};
```

---

## 10. Error Reference

### Upload Signed URL Errors

| Status | Message | Fix |
|--------|---------|-----|
| `400` | `Missing required parameters: folder, fileName, contentType, fileSize` | All four fields are required |
| `400` | `Invalid folder. Must be one of: ...` | Check allowed folder values in Section 2 |
| `400` | `Invalid file extension. Allowed extensions for profile-images: .jpg, .jpeg, .png, .webp` | Only use allowed extensions |
| `400` | `Double file extensions are not allowed` | Rename file to have single extension |
| `400` | `fileSize must be a valid number` | Send `fileSize` as a number, not string |
| `400` | `File size exceeds maximum limit` | Reduce file size below limit for folder |
| `401` | `Unauthorized` | Missing or invalid JWT / API key |

### S3 Upload Errors

| S3 Status | Cause | Fix |
|-----------|-------|-----|
| `400` | Policy expired | Signed URL is older than 10 minutes — restart from Step 1 |
| `400` | `EntityTooLarge` | File exceeds the `maxFileSize` set in the signed URL | Reduce file size |
| `403` | `AccessDenied` | Fields in FormData were modified or `file` was not the last field | Ensure correct field order |
| `415` | Wrong content type | `Content-Type` field in FormData doesn't match `contentType` from Step 1 | Use matching MIME type |

### Verify & Publish Errors

| Status | Message | Fix |
|--------|---------|-----|
| `400` | `File not found or upload incomplete` | S3 upload may have failed — check S3 response in Step 2 |
| `400` | `relativePath is required` | Include `relativePath` in the request body |

### Profile Image Update Errors

| Status | Message | Fix |
|--------|---------|-----|
| `400` | `User not found` | Verify the `userId` in the URL |
| `400` | `Image URL must be a valid URL` | Pass the full `https://` URL from Step 3 |
| `400` | `Image file not found in storage` | Ensure you called `/upload/verify-and-publish` first |
| `401` | `Unauthorized` | Missing or expired JWT token |
| `403` | `Forbidden` | User does not have permission to update this profile |
| `429` | `ThrottlerException` | Rate limit hit (5 per 15 min) — wait and retry |

### ID Document Errors

| Status | Message | Fix |
|--------|---------|-----|
| `400` | `User not found` | Verify `userId` |
| `400` | `ID document URL must be a valid URL` | Pass full HTTPS URL |
| `400` | `ID document file not found in storage` | Upload to S3 finished — wait 2s and retry. Backend has 1.5s auto-retry built in |
| `429` | `ThrottlerException` | 5 per 15 min limit — wait |

### Image Status Errors

| Status | Message | Fix |
|--------|---------|-----|
| `400` | `User not found` | Token may be for a deleted user |
| `401` | `Unauthorized` | JWT missing/expired |

### Re-upload (Token-Based) Errors

| Status | Message | Fix |
|--------|---------|-----|
| `400` | `Invalid or expired upload token` | Token from email has expired — contact admin for re-rejection |
| `400` | `Image URL must be a valid URL` | Must use full HTTPS URL |
| `404` | `User not found` | User account may have been removed |

### Admin Rejection Errors

| Status | Message | Fix |
|--------|---------|-----|
| `403` | `Access denied` | Only SUPERADMIN can reject images |
| `404` | `User not found` | Check `userId` |

---

## Quick Reference — All Endpoints

| Method | URL | Auth | Who | Purpose |
|--------|-----|------|-----|---------|
| `POST` | `/upload/generate-signed-url` | JWT or API key | All | Step 1: Get private upload URL |
| `GET` | `/upload/get-signed-url` | JWT | All | Step 1: Get URL (query params) |
| `GET` | `/upload/profile-images/get-signed-url` | API key or JWT | All | Step 1: Profile images only |
| `POST` | `/upload/verify-and-publish` | JWT or API key | All | Step 3: Verify S3 upload |
| `POST` | `/users/:id/profile-image` | JWT | Any role | Register profile image |
| `POST` | `/users/:userId/upload-id-document` | JWT | Any role | Register ID document |
| `GET` | `/users/profile/image-status` | JWT | Any role | Get image + status |
| `POST` | `/users/profile/image/reupload?token=` | 🔓 None | Any | Re-upload after rejection |
| `POST` | `/users/reject-profile-image/:userId` | JWT | SUPERADMIN | Reject image + email user |
