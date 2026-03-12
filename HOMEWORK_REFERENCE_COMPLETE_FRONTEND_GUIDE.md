# Homework Reference Upload — Complete Frontend Guide

> **Base URL:** `https://lmsapi.suraksha.lk`  
> **Auth:** `Authorization: Bearer <jwt_token>` required on all calls  
> **Who can add references:** Teachers and Institute Admins only

---

## Table of Contents

1. [Overview — 3 Upload Methods](#1-overview--3-upload-methods)
2. [S3 Direct Upload (Step-by-Step)](#2-s3-direct-upload-step-by-step)
3. [Google Drive Upload (Step-by-Step)](#3-google-drive-upload-step-by-step)
4. [External Link (YouTube / Website)](#4-external-link-youtube--website)
5. [Read References](#5-read-references)
6. [Update & Delete References](#6-update--delete-references)
7. [Complete React Component Examples](#7-complete-react-component-examples)
8. [Error Reference](#8-error-reference)

---

## 1. Overview — 3 Upload Methods

| Method | Endpoint | When to Use |
|--------|----------|-------------|
| **S3 Upload** | `POST /homework-references/upload/generate-url` → upload → `POST /homework-references/upload/confirm` | Upload a file from device (video, PDF, image, document, audio) |
| **Google Drive** | `POST /homework-references/google-drive` | File already exists in teacher's Google Drive |
| **External Link** | `POST /homework-references/link` | YouTube video, external website, any URL |

### Allowed Reference Types

| `referenceType` | Allowed File Types | Max Size |
|-----------------|--------------------|----------|
| `VIDEO` | mp4, webm, ogg, mov, avi, wmv | 500 MB |
| `IMAGE` | jpg, png, gif, webp, svg, bmp | 10 MB |
| `PDF` | pdf | 50 MB |
| `DOCUMENT` | doc, docx, xls, xlsx, ppt, pptx, txt, rtf | 50 MB |
| `AUDIO` | mp3, wav, ogg, webm, aac, m4a | 100 MB |
| `LINK` | N/A | N/A |
| `OTHER` | Any | 100 MB |

---

## 2. S3 Direct Upload (Step-by-Step)

Three-step process: get URL → upload file → confirm.

### Step 1 — Generate Signed Upload URL

```
POST /homework-references/upload/generate-url
Authorization: Bearer <token>
Content-Type: application/json
```

**Request Body:**
```json
{
  "homeworkId": "123",
  "fileName": "chapter1-lecture.mp4",
  "contentType": "video/mp4",
  "fileSize": 52428800,
  "referenceType": "VIDEO"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `homeworkId` | string | ✅ | ID of the homework to attach to |
| `fileName` | string | ✅ | Original filename |
| `contentType` | string | ✅ | MIME type (e.g. `video/mp4`, `application/pdf`) |
| `fileSize` | number | ✅ | File size in bytes |
| `referenceType` | enum | ✅ | `VIDEO`, `IMAGE`, `PDF`, `DOCUMENT`, `AUDIO`, `OTHER` |

**Response (200):**
```json
{
  "uploadUrl": "https://suraksha-lms-main-bucket.s3.us-east-1.amazonaws.com",
  "relativePath": "homework-references/123/chapter1-lecture-a1b2c3d4.mp4",
  "fields": {
    "key": "homework-references/123/chapter1-lecture-a1b2c3d4.mp4",
    "Content-Type": "video/mp4",
    "x-amz-server-side-encryption": "AES256",
    "Policy": "eyJ...",
    "X-Amz-Signature": "abc123...",
    "X-Amz-Algorithm": "AWS4-HMAC-SHA256",
    "X-Amz-Credential": "AKIA.../20260313/us-east-1/s3/aws4_request",
    "X-Amz-Date": "20260313T120000Z"
  },
  "expiresIn": 3600,
  "maxFileSize": 524288000
}
```

> ⚠️ **Important:** Save `relativePath` — you need it in Step 3.

---

### Step 2 — Upload File Directly to S3

Use the `uploadUrl` and `fields` from Step 1. The file **must be the last item** in the FormData.

```js
async function uploadToS3(uploadUrl, fields, file) {
  const formData = new FormData();

  // Add ALL fields from response FIRST
  Object.entries(fields).forEach(([key, value]) => {
    formData.append(key, value);
  });

  // Add file LAST (required by S3 presigned POST)
  formData.append('file', file);

  const response = await fetch(uploadUrl, {
    method: 'POST',
    body: formData,
    // Do NOT set Content-Type header — browser sets it with boundary automatically
  });

  if (!response.ok && response.status !== 204) {
    throw new Error(`S3 upload failed: ${response.status}`);
  }
  // 204 No Content = success
}
```

---

### Step 3 — Confirm Upload & Create Reference

```
POST /homework-references/upload/confirm
Authorization: Bearer <token>
Content-Type: application/json
```

**Request Body:**
```json
{
  "homeworkId": "123",
  "title": "Chapter 1 Video Lecture",
  "description": "Full explanation of chapter 1 concepts",
  "referenceType": "VIDEO",
  "relativePath": "homework-references/123/chapter1-lecture-a1b2c3d4.mp4",
  "fileName": "chapter1-lecture.mp4",
  "fileSize": 52428800,
  "mimeType": "video/mp4",
  "displayOrder": 0,
  "videoDuration": 3600
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `homeworkId` | string | ✅ | Same homework ID from Step 1 |
| `title` | string | ✅ | Display title for the reference |
| `referenceType` | enum | ✅ | Same type from Step 1 |
| `relativePath` | string | ✅ | Exactly the `relativePath` returned in Step 1 |
| `fileName` | string | ✅ | Original filename |
| `fileSize` | number | ✅ | File size in bytes |
| `mimeType` | string | ✅ | MIME type |
| `description` | string | ❌ | Optional description |
| `displayOrder` | number | ❌ | Position in list (0 = first). Default: 0 |
| `videoDuration` | number | ❌ | Duration in seconds (VIDEO only) |
| `thumbnailUrl` | string | ❌ | Relative path to a thumbnail image |

**Response (201):** → [Reference Object](#reference-response-object)

---

## 3. Google Drive Upload (Step-by-Step)

### Prerequisites

The teacher must have connected Google Drive. Check the connection status first:

```
GET /drive-access/status
Authorization: Bearer <token>
```

**If `isConnected: false`** — redirect user to connect:
```
GET /auth/google
Authorization: Bearer <token>
```
This returns a Google OAuth URL. Open it in a popup/redirect so the user can authorize. After authorization, the backend stores the access token automatically.

---

### Get Access Token

```
GET /drive-access/token
Authorization: Bearer <token>
```

**Response:**
```json
{
  "accessToken": "ya29.a0AfH6SMBx...",
  "expiresAt": "2026-03-13T13:00:00.000Z"
}
```

Store this `accessToken` — it will be sent when linking Drive files.

---

### Link a File from Google Drive

```
POST /homework-references/google-drive
Authorization: Bearer <token>
Content-Type: application/json
```

**Request Body:**
```json
{
  "homeworkId": "123",
  "title": "Chapter 1 Notes from Drive",
  "description": "Shared notes from my Google Drive",
  "referenceType": "PDF",
  "driveFileId": "1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms",
  "accessToken": "ya29.a0AfH6SMBx...",
  "displayOrder": 1,
  "videoDuration": null
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `homeworkId` | string | ✅ | Homework ID |
| `title` | string | ✅ | Display title |
| `referenceType` | enum | ✅ | `VIDEO`, `PDF`, `DOCUMENT`, `IMAGE`, `AUDIO`, `OTHER`, `LINK` |
| `driveFileId` | string | ✅ | Google Drive file ID (from Drive picker or URL) |
| `accessToken` | string | ✅ | Google OAuth access token from `/drive-access/token` |
| `description` | string | ❌ | Optional description |
| `displayOrder` | number | ❌ | Position in list. Default: 0 |
| `videoDuration` | number | ❌ | Duration in seconds (for Drive video files) |

**Response (201):**
```json
{
  "id": "2",
  "homeworkId": "123",
  "uploadedById": "456",
  "title": "Chapter 1 Notes from Drive",
  "referenceType": "PDF",
  "referenceSource": "GOOGLE_DRIVE",
  "displayOrder": 1,
  "driveFileId": "1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms",
  "driveFileName": "Chapter 1 Notes.pdf",
  "driveMimeType": "application/pdf",
  "driveFileSize": 1048576,
  "driveViewUrl": "https://drive.google.com/file/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/view",
  "driveDownloadUrl": "https://drive.google.com/uc?export=download&id=1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms",
  "driveEmbedUrl": "https://drive.google.com/file/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/preview",
  "isActive": true,
  "createdAt": "2026-03-13T10:35:00.000Z"
}
```

**Drive URL Fields in Response:**
| Field | Use |
|-------|-----|
| `driveViewUrl` | Link button to "Open in Drive" |
| `driveDownloadUrl` | Link button to "Download" |
| `driveEmbedUrl` | `<iframe src="...">` for inline preview |

---

### How to Get the `driveFileId`

The `driveFileId` is the long string in a Google Drive file's URL:

```
https://drive.google.com/file/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/view
                                  ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
                                  This is the driveFileId
```

Use the [Google Drive Picker API](https://developers.google.com/drive/picker) in your frontend to let users browse and select files from their Drive. The Picker returns the file ID directly.

---

## 4. External Link (YouTube / Website)

No file upload needed — just POST the URL.

```
POST /homework-references/link
Authorization: Bearer <token>
Content-Type: application/json
```

**Request Body:**
```json
{
  "homeworkId": "123",
  "title": "Khan Academy - Chapter 1",
  "description": "Great explanation of the topic",
  "referenceType": "VIDEO",
  "externalUrl": "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
  "linkTitle": "Watch on YouTube",
  "displayOrder": 2,
  "videoDuration": 212
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `homeworkId` | string | ✅ | Homework ID |
| `title` | string | ✅ | Display title |
| `referenceType` | enum | ✅ | Usually `VIDEO` or `LINK` |
| `externalUrl` | string | ✅ | Full URL (must be valid URL) |
| `linkTitle` | string | ❌ | Label for the link button (e.g. "Watch on YouTube") |
| `description` | string | ❌ | Optional description |
| `displayOrder` | number | ❌ | Position. Default: 0 |
| `videoDuration` | number | ❌ | Duration in seconds |
| `thumbnailUrl` | string | ❌ | Relative S3 path to thumbnail image |

**Response (201):** → [Reference Object](#reference-response-object)

---

## 5. Read References

### Get All References for a Homework

```
GET /homework-references/homework/:homeworkId
Authorization: Bearer <token>
```

Returns all active references, ordered by `displayOrder ASC`.

**Response (200):**
```json
[
  {
    "id": "1",
    "title": "Chapter 1 Video Lecture",
    "referenceType": "VIDEO",
    "referenceSource": "S3_UPLOAD",
    "displayOrder": 0,
    "viewUrl": "https://suraksha-lms-main-bucket.s3.us-east-1.amazonaws.com/homework-references/123/lecture.mp4",
    "fileName": "chapter1-lecture.mp4",
    "fileSize": 52428800,
    "mimeType": "video/mp4",
    "videoDuration": 3600,
    "isActive": true
  },
  {
    "id": "2",
    "title": "Chapter 1 Notes from Drive",
    "referenceType": "PDF",
    "referenceSource": "GOOGLE_DRIVE",
    "displayOrder": 1,
    "driveViewUrl": "https://drive.google.com/file/d/1Bxi.../view",
    "driveDownloadUrl": "https://drive.google.com/uc?export=download&id=1Bxi...",
    "driveEmbedUrl": "https://drive.google.com/file/d/1Bxi.../preview",
    "driveFileName": "Chapter 1 Notes.pdf",
    "driveMimeType": "application/pdf",
    "isActive": true
  },
  {
    "id": "3",
    "title": "YouTube Tutorial",
    "referenceType": "VIDEO",
    "referenceSource": "MANUAL_LINK",
    "displayOrder": 2,
    "viewUrl": "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    "externalUrl": "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    "linkTitle": "Watch on YouTube",
    "isActive": true
  }
]
```

### Reference Response Object

All three upload methods return the same base shape. Fields are `null` if not applicable to that source.

| Field | S3 Upload | Google Drive | External Link |
|-------|-----------|--------------|---------------|
| `id` | ✅ | ✅ | ✅ |
| `homeworkId` | ✅ | ✅ | ✅ |
| `title` | ✅ | ✅ | ✅ |
| `description` | ✅ | ✅ | ✅ |
| `referenceType` | ✅ | ✅ | ✅ |
| `referenceSource` | `S3_UPLOAD` | `GOOGLE_DRIVE` | `MANUAL_LINK` |
| `displayOrder` | ✅ | ✅ | ✅ |
| `viewUrl` | Full S3 URL | null | External URL |
| `fileUrl` | Relative S3 path | null | null |
| `fileName` | ✅ | null | null |
| `fileSize` | ✅ (bytes) | null | null |
| `mimeType` | ✅ | null | null |
| `videoDuration` | ✅ (seconds) | ✅ | ✅ |
| `driveFileId` | null | ✅ | null |
| `driveFileName` | null | ✅ | null |
| `driveMimeType` | null | ✅ | null |
| `driveFileSize` | null | ✅ (bytes) | null |
| `driveViewUrl` | null | ✅ | null |
| `driveDownloadUrl` | null | ✅ | null |
| `driveEmbedUrl` | null | ✅ | null |
| `externalUrl` | null | null | ✅ |
| `linkTitle` | null | null | ✅ |
| `thumbnailUrl` | ✅ | null | ✅ |
| `uploadedBy` | ✅ | ✅ | ✅ |
| `isActive` | ✅ | ✅ | ✅ |
| `createdAt` | ✅ | ✅ | ✅ |

### Get Reference Count Summary

```
GET /homework-references/homework/:homeworkId/summary
Authorization: Bearer <token>
```

**Response (200):**
```json
{
  "total": 5,
  "byType": {
    "VIDEO": 2,
    "PDF": 2,
    "IMAGE": 1
  },
  "bySource": {
    "S3_UPLOAD": 3,
    "GOOGLE_DRIVE": 1,
    "MANUAL_LINK": 1
  }
}
```

### Get References with Filtering

```
GET /homework-references?homeworkId=123&referenceType=VIDEO&page=1&limit=10
Authorization: Bearer <token>
```

| Query Param | Type | Description |
|-------------|------|-------------|
| `homeworkId` | string | Filter by homework ID |
| `referenceType` | enum | `VIDEO`, `IMAGE`, `PDF`, `DOCUMENT`, `LINK`, `AUDIO`, `OTHER` |
| `referenceSource` | enum | `S3_UPLOAD`, `GOOGLE_DRIVE`, `MANUAL_LINK` |
| `search` | string | Search title and description |
| `page` | number | Default: 1 |
| `limit` | number | Default: 10, max: 100 |
| `sortBy` | enum | `displayOrder` (default), `title`, `createdAt`, `referenceType` |
| `sortOrder` | enum | `ASC` (default), `DESC` |

---

## 6. Update & Delete References

### Update Reference Metadata

```
PATCH /homework-references/:id
Authorization: Bearer <token>
Content-Type: application/json
```

```json
{
  "title": "Updated Title",
  "description": "Updated description",
  "displayOrder": 5
}
```

All fields optional. You can update `title`, `description`, `displayOrder`, `referenceType`.

---

### Reorder References

```
PATCH /homework-references/homework/:homeworkId/reorder
Authorization: Bearer <token>
Content-Type: application/json
```

```json
{
  "referenceIds": ["3", "1", "2"]
}
```

Pass all reference IDs in the desired order. Their `displayOrder` will be set to 0, 1, 2… respectively.

---

### Soft Delete (Teacher or Admin)

```
DELETE /homework-references/:id
Authorization: Bearer <token>
```

Sets `isActive = false`. The reference is hidden but not removed from the database.

---

### Restore (Teacher or Admin)

```
PATCH /homework-references/:id/restore
Authorization: Bearer <token>
```

Sets `isActive = true` again.

---

### Permanent Delete (Institute Admin Only)

```
DELETE /homework-references/:id/permanent
Authorization: Bearer <token>
```

> ⚠️ **Deletes the database record AND the S3 file permanently. Cannot be undone.**

---

## 7. Complete React Component Examples

### 7.1 — S3 File Upload

```tsx
// AddS3Reference.tsx
import React, { useState, useRef } from 'react';

const API_URL = 'https://lmsapi.suraksha.lk';

type ReferenceType = 'VIDEO' | 'IMAGE' | 'PDF' | 'DOCUMENT' | 'AUDIO' | 'OTHER';

const MIME_TO_TYPE: Record<string, ReferenceType> = {
  'video/mp4': 'VIDEO',
  'video/webm': 'VIDEO',
  'video/quicktime': 'VIDEO',
  'image/jpeg': 'IMAGE',
  'image/png': 'IMAGE',
  'image/gif': 'IMAGE',
  'application/pdf': 'PDF',
  'application/msword': 'DOCUMENT',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'DOCUMENT',
  'application/vnd.ms-excel': 'DOCUMENT',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'DOCUMENT',
  'audio/mpeg': 'AUDIO',
  'audio/wav': 'AUDIO',
};

interface Props {
  homeworkId: string;
  token: string;
  onSuccess: (reference: any) => void;
}

export const AddS3Reference: React.FC<Props> = ({ homeworkId, token, onSuccess }) => {
  const [title, setTitle] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState<'idle' | 'uploading' | 'confirming' | 'done' | 'error'>('idle');
  const [error, setError] = useState('');

  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  async function handleUpload() {
    if (!file || !title.trim()) return;

    const referenceType: ReferenceType = MIME_TO_TYPE[file.type] ?? 'OTHER';

    try {
      setStatus('uploading');
      setError('');

      // Step 1: Get signed URL
      const genRes = await fetch(`${API_URL}/homework-references/upload/generate-url`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          homeworkId,
          fileName: file.name,
          contentType: file.type,
          fileSize: file.size,
          referenceType,
        }),
      });
      if (!genRes.ok) {
        const err = await genRes.json();
        throw new Error(err.message || 'Failed to get upload URL');
      }
      const { uploadUrl, relativePath, fields } = await genRes.json();

      // Step 2: Upload to S3
      const formData = new FormData();
      Object.entries(fields).forEach(([k, v]) => formData.append(k, v as string));
      formData.append('file', file); // file MUST be last

      setProgress(30);

      const s3Res = await fetch(uploadUrl, { method: 'POST', body: formData });
      if (!s3Res.ok && s3Res.status !== 204) {
        throw new Error('Upload to S3 failed');
      }
      setProgress(80);

      // Step 3: Confirm upload
      setStatus('confirming');
      const confirmRes = await fetch(`${API_URL}/homework-references/upload/confirm`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          homeworkId,
          title: title.trim(),
          referenceType,
          relativePath,
          fileName: file.name,
          fileSize: file.size,
          mimeType: file.type,
        }),
      });
      if (!confirmRes.ok) {
        const err = await confirmRes.json();
        throw new Error(err.message || 'Failed to confirm upload');
      }
      const reference = await confirmRes.json();
      setProgress(100);
      setStatus('done');
      onSuccess(reference);
    } catch (e: any) {
      setStatus('error');
      setError(e.message);
    }
  }

  return (
    <div>
      <h3>Upload File (S3)</h3>
      <input
        type="text"
        placeholder="Reference title"
        value={title}
        onChange={e => setTitle(e.target.value)}
      />
      <input
        type="file"
        accept="video/*,image/*,application/pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,audio/*"
        onChange={e => setFile(e.target.files?.[0] ?? null)}
      />
      <button onClick={handleUpload} disabled={!file || !title || status === 'uploading'}>
        {status === 'uploading' ? `Uploading ${progress}%` :
         status === 'confirming' ? 'Saving...' :
         status === 'done' ? 'Done!' : 'Upload'}
      </button>
      {error && <p style={{ color: 'red' }}>{error}</p>}
    </div>
  );
};
```

---

### 7.2 — Google Drive Reference

```tsx
// AddDriveReference.tsx
import React, { useState, useEffect } from 'react';

const API_URL = 'https://lmsapi.suraksha.lk';

interface Props {
  homeworkId: string;
  token: string;
  onSuccess: (reference: any) => void;
}

export const AddDriveReference: React.FC<Props> = ({ homeworkId, token, onSuccess }) => {
  const [title, setTitle] = useState('');
  const [driveFileId, setDriveFileId] = useState('');
  const [referenceType, setReferenceType] = useState('PDF');
  const [isConnected, setIsConnected] = useState<boolean | null>(null);
  const [accessToken, setAccessToken] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  // Check Drive connection on mount
  useEffect(() => {
    fetch(`${API_URL}/drive-access/status`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(data => setIsConnected(data.isConnected));
  }, [token]);

  // Load access token if connected
  useEffect(() => {
    if (!isConnected) return;
    fetch(`${API_URL}/drive-access/token`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(data => setAccessToken(data.accessToken));
  }, [isConnected, token]);

  async function connectDrive() {
    const res = await fetch(`${API_URL}/auth/google`, { headers: { Authorization: `Bearer ${token}` } });
    const data = await res.json();
    // Open OAuth URL in popup
    window.open(data.url, 'google-oauth', 'width=600,height=600');
    // Poll for connection (or use postMessage from OAuth callback)
    const interval = setInterval(async () => {
      const statusRes = await fetch(`${API_URL}/drive-access/status`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const status = await statusRes.json();
      if (status.isConnected) {
        setIsConnected(true);
        clearInterval(interval);
      }
    }, 2000);
  }

  async function handleLink() {
    if (!title.trim() || !driveFileId.trim()) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${API_URL}/homework-references/google-drive`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          homeworkId,
          title: title.trim(),
          referenceType,
          driveFileId: driveFileId.trim(),
          accessToken,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || 'Failed to link Drive file');
      }
      const reference = await res.json();
      onSuccess(reference);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  if (isConnected === null) return <p>Checking Drive connection...</p>;

  if (!isConnected) {
    return (
      <div>
        <p>Google Drive is not connected.</p>
        <button onClick={connectDrive}>Connect Google Drive</button>
      </div>
    );
  }

  return (
    <div>
      <h3>Add from Google Drive</h3>
      <input
        type="text"
        placeholder="Reference title"
        value={title}
        onChange={e => setTitle(e.target.value)}
      />
      <input
        type="text"
        placeholder="Google Drive File ID"
        value={driveFileId}
        onChange={e => setDriveFileId(e.target.value)}
      />
      <small>
        File ID is in the Drive URL:{' '}
        <code>drive.google.com/file/d/<strong>[FILE_ID]</strong>/view</code>
      </small>
      <select value={referenceType} onChange={e => setReferenceType(e.target.value)}>
        <option value="PDF">PDF</option>
        <option value="VIDEO">Video</option>
        <option value="DOCUMENT">Document</option>
        <option value="IMAGE">Image</option>
        <option value="AUDIO">Audio</option>
        <option value="OTHER">Other</option>
      </select>
      <button onClick={handleLink} disabled={!title || !driveFileId || loading}>
        {loading ? 'Linking...' : 'Add Drive File'}
      </button>
      {error && <p style={{ color: 'red' }}>{error}</p>}
    </div>
  );
};
```

---

### 7.3 — External Link Reference

```tsx
// AddLinkReference.tsx
import React, { useState } from 'react';

const API_URL = 'https://lmsapi.suraksha.lk';

interface Props {
  homeworkId: string;
  token: string;
  onSuccess: (reference: any) => void;
}

export const AddLinkReference: React.FC<Props> = ({ homeworkId, token, onSuccess }) => {
  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');
  const [linkTitle, setLinkTitle] = useState('');
  const [referenceType, setReferenceType] = useState('LINK');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleAdd() {
    if (!title.trim() || !url.trim()) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${API_URL}/homework-references/link`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          homeworkId,
          title: title.trim(),
          referenceType,
          externalUrl: url.trim(),
          linkTitle: linkTitle.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || 'Failed to add link');
      }
      const reference = await res.json();
      onSuccess(reference);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <h3>Add External Link</h3>
      <input
        type="text"
        placeholder="Reference title (e.g. Khan Academy - Chapter 1)"
        value={title}
        onChange={e => setTitle(e.target.value)}
      />
      <input
        type="url"
        placeholder="https://www.youtube.com/watch?v=..."
        value={url}
        onChange={e => setUrl(e.target.value)}
      />
      <input
        type="text"
        placeholder="Link button label (optional, e.g. Watch on YouTube)"
        value={linkTitle}
        onChange={e => setLinkTitle(e.target.value)}
      />
      <select value={referenceType} onChange={e => setReferenceType(e.target.value)}>
        <option value="LINK">Link</option>
        <option value="VIDEO">Video</option>
        <option value="OTHER">Other</option>
      </select>
      <button onClick={handleAdd} disabled={!title || !url || loading}>
        {loading ? 'Adding...' : 'Add Link'}
      </button>
      {error && <p style={{ color: 'red' }}>{error}</p>}
    </div>
  );
};
```

---

### 7.4 — Display References List (All Sources)

```tsx
// ReferenceList.tsx
import React from 'react';

type Source = 'S3_UPLOAD' | 'GOOGLE_DRIVE' | 'MANUAL_LINK';

interface Reference {
  id: string;
  title: string;
  referenceType: string;
  referenceSource: Source;
  displayOrder: number;
  viewUrl?: string;
  driveViewUrl?: string;
  driveDownloadUrl?: string;
  driveEmbedUrl?: string;
  externalUrl?: string;
  linkTitle?: string;
  fileName?: string;
  fileSize?: number;
  driveFileName?: string;
  isActive: boolean;
}

const formatBytes = (bytes?: number) => {
  if (!bytes) return '';
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024).toFixed(0)} KB`;
};

const ReferenceItem: React.FC<{ ref: Reference; canEdit: boolean; onDelete: (id: string) => void }> = ({
  ref,
  canEdit,
  onDelete,
}) => {
  const getLink = () => {
    switch (ref.referenceSource) {
      case 'S3_UPLOAD':    return ref.viewUrl;
      case 'GOOGLE_DRIVE': return ref.driveViewUrl;
      case 'MANUAL_LINK':  return ref.externalUrl;
    }
  };

  const getLabel = () => {
    if (ref.referenceSource === 'GOOGLE_DRIVE') return ref.driveFileName || ref.title;
    if (ref.referenceSource === 'MANUAL_LINK')  return ref.linkTitle || 'Open Link';
    return ref.fileName || ref.title;
  };

  const link = getLink();

  return (
    <div style={{ border: '1px solid #ddd', padding: 12, marginBottom: 8, borderRadius: 6 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
        <div>
          <strong>{ref.title}</strong>
          <span style={{ marginLeft: 8, fontSize: 12, background: '#eee', padding: '2px 6px', borderRadius: 4 }}>
            {ref.referenceType}
          </span>
          <span style={{ marginLeft: 4, fontSize: 12, color: '#666' }}>
            {ref.referenceSource === 'S3_UPLOAD' ? '☁️ S3' :
             ref.referenceSource === 'GOOGLE_DRIVE' ? '📁 Drive' : '🔗 Link'}
          </span>
          {(ref.fileSize || ref.driveFileSize) && (
            <span style={{ marginLeft: 8, fontSize: 12, color: '#999' }}>
              {formatBytes(ref.fileSize)}
            </span>
          )}
        </div>
        {canEdit && (
          <button
            onClick={() => onDelete(ref.id)}
            style={{ color: 'red', border: 'none', background: 'none', cursor: 'pointer' }}
          >
            Delete
          </button>
        )}
      </div>

      <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
        {link && (
          <a href={link} target="_blank" rel="noopener noreferrer">
            {getLabel()}
          </a>
        )}
        {ref.referenceSource === 'GOOGLE_DRIVE' && ref.driveDownloadUrl && (
          <a href={ref.driveDownloadUrl} target="_blank" rel="noopener noreferrer">
            ⬇ Download
          </a>
        )}
      </div>

      {/* Inline Drive preview */}
      {ref.referenceSource === 'GOOGLE_DRIVE' && ref.driveEmbedUrl &&
       (ref.referenceType === 'PDF' || ref.referenceType === 'DOCUMENT') && (
        <iframe
          src={ref.driveEmbedUrl}
          width="100%"
          height="400"
          style={{ marginTop: 8, border: 'none' }}
          title={ref.title}
        />
      )}
    </div>
  );
};

interface ListProps {
  references: Reference[];
  canEdit: boolean;
  onDelete: (id: string) => void;
}

export const ReferenceList: React.FC<ListProps> = ({ references, canEdit, onDelete }) => {
  if (references.length === 0) {
    return <p style={{ color: '#999' }}>No references added yet.</p>;
  }
  return (
    <div>
      {references
        .sort((a, b) => a.displayOrder - b.displayOrder)
        .map(ref => (
          <ReferenceItem key={ref.id} ref={ref} canEdit={canEdit} onDelete={onDelete} />
        ))}
    </div>
  );
};
```

---

### 7.5 — Combined Add Reference Modal (all 3 methods)

```tsx
// AddReferenceModal.tsx
import React, { useState } from 'react';
import { AddS3Reference } from './AddS3Reference';
import { AddDriveReference } from './AddDriveReference';
import { AddLinkReference } from './AddLinkReference';

type Tab = 's3' | 'drive' | 'link';

interface Props {
  homeworkId: string;
  token: string;
  onSuccess: (reference: any) => void;
  onClose: () => void;
}

export const AddReferenceModal: React.FC<Props> = ({ homeworkId, token, onSuccess, onClose }) => {
  const [tab, setTab] = useState<Tab>('s3');

  const tabStyle = (t: Tab) => ({
    padding: '8px 16px',
    borderBottom: tab === t ? '2px solid #4CAF50' : '2px solid transparent',
    cursor: 'pointer',
    fontWeight: tab === t ? 'bold' : 'normal',
    background: 'none',
    border: 'none',
    borderBottom: tab === t ? '2px solid #4CAF50' as any : '2px solid transparent',
  });

  const handleSuccess = (reference: any) => {
    onSuccess(reference);
    onClose();
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000
    }}>
      <div style={{ background: '#fff', borderRadius: 8, padding: 24, width: 480, maxHeight: '90vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
          <h2 style={{ margin: 0 }}>Add Reference</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer' }}>×</button>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', borderBottom: '1px solid #eee', marginBottom: 20 }}>
          <button style={tabStyle('s3')} onClick={() => setTab('s3')}>📤 Upload File</button>
          <button style={tabStyle('drive')} onClick={() => setTab('drive')}>📁 Google Drive</button>
          <button style={tabStyle('link')} onClick={() => setTab('link')}>🔗 External Link</button>
        </div>

        {tab === 's3'    && <AddS3Reference    homeworkId={homeworkId} token={token} onSuccess={handleSuccess} />}
        {tab === 'drive' && <AddDriveReference  homeworkId={homeworkId} token={token} onSuccess={handleSuccess} />}
        {tab === 'link'  && <AddLinkReference   homeworkId={homeworkId} token={token} onSuccess={handleSuccess} />}
      </div>
    </div>
  );
};
```

---

## 8. Error Reference

| HTTP Status | Error Code | Meaning | Fix |
|-------------|------------|---------|-----|
| `400` | `BAD_REQUEST` | Invalid file type for `referenceType` | Check allowed MIME types for the type |
| `400` | `BAD_REQUEST` | File size exceeds limit | Reduce file size |
| `400` | `BAD_REQUEST` | File not found after upload | S3 upload failed — retry Step 2 |
| `400` | `BAD_REQUEST` | Could not access Google Drive file | Check `driveFileId` and `accessToken` |
| `401` | `UNAUTHORIZED` | Missing or invalid JWT token | Re-login and get fresh token |
| `403` | `FORBIDDEN` | Not a teacher/admin | Only teachers and admins can add references |
| `403` | `FORBIDDEN` | Homework belongs to different institute | Check `homeworkId` is correct |
| `404` | `NOT_FOUND` | Homework not found | Check `homeworkId` |
| `404` | `NOT_FOUND` | Reference not found | Check reference `id` |

### Common Error Response Shape

```json
{
  "statusCode": 400,
  "message": "File size exceeds limit for VIDEO. Maximum: 500MB",
  "error": "Bad Request"
}
```

---

## Quick Reference — All Endpoints

| Method | URL | Auth | Who | Purpose |
|--------|-----|------|-----|---------|
| `POST` | `/homework-references/upload/generate-url` | JWT | Teacher/Admin | Step 1: Get S3 upload URL |
| `POST` | `/homework-references/upload/confirm` | JWT | Teacher/Admin | Step 3: Confirm S3 upload |
| `POST` | `/homework-references/google-drive` | JWT | Teacher/Admin | Add Google Drive file |
| `POST` | `/homework-references/link` | JWT | Teacher/Admin | Add external URL |
| `POST` | `/homework-references` | JWT | Teacher/Admin | Generic create (advanced) |
| `GET` | `/homework-references/homework/:id` | JWT | All roles | Get all refs for homework |
| `GET` | `/homework-references/homework/:id/summary` | JWT | All roles | Get ref count by type |
| `GET` | `/homework-references` | JWT | All roles | Get refs with filters |
| `GET` | `/homework-references/:id` | JWT | All roles | Get single reference |
| `PATCH` | `/homework-references/:id` | JWT | Teacher/Admin | Update title/description/order |
| `PATCH` | `/homework-references/homework/:id/reorder` | JWT | Teacher/Admin | Reorder all references |
| `PATCH` | `/homework-references/:id/restore` | JWT | Teacher/Admin | Restore soft-deleted ref |
| `DELETE` | `/homework-references/:id` | JWT | Teacher/Admin | Soft delete |
| `DELETE` | `/homework-references/:id/permanent` | JWT | Admin only | Permanent delete |
