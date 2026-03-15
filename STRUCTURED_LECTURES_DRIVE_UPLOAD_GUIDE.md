# Structured Lectures — Reference Documents via Google Drive

> **Rule**: Lecture reference documents (attachments) are uploaded **exclusively** to the teacher's own Google Drive.  
> Our S3 bucket is used **only** for the cover image. Never send document files to S3.

---

## Architecture Overview

```
Frontend  ──(1) get token──►  GET /drive-access/token (backend)
Frontend  ──(2) get folder─►  GET /drive-access/folder?purpose=LECTURE_DOCUMENT
Frontend  ──(3) upload ────►  Google Drive API  (direct, no backend in the middle)
Google    ──► returns driveFileId ──► Frontend
Frontend  ──(4) register ──►  POST /drive-access/files/register (backend verifies file)
Frontend  ──(5) save lec. ─►  POST /api/structured-lectures  (with driveFileId in documents[])
```

Files never pass through our backend. The teacher's Google Drive stores them.

---

## Step 0 — One-Time Google Drive Connection

Must be done once per teacher account before any upload.

### Check if already connected
```http
GET /drive-access/status
Authorization: Bearer <jwt>
```
Response:
```json
{
  "isConnected": true,
  "googleEmail": "teacher@gmail.com",
  "googleDisplayName": "Jane Teacher",
  "connectedAt": "2025-01-15T08:00:00Z"
}
```
If `isConnected: false`, proceed to connect.

### Get the OAuth consent URL
```http
GET /drive-access/connect?returnUrl=/lectures/new
Authorization: Bearer <jwt>
```
Response:
```json
{
  "authUrl": "https://accounts.google.com/o/oauth2/v2/auth?client_id=...",
  "state": "abc123..."
}
```
Frontend action:
```javascript
window.location.href = response.authUrl;
```

Google redirects back to our backend callback, which then redirects the browser to:
```
https://lms.suraksha.lk/lectures/new?drive_connected=true&google_email=teacher%40gmail.com
```

On your return page, read the query params:
```javascript
const params = new URLSearchParams(window.location.search);
if (params.get('drive_connected') === 'true') {
  // Show success toast: "Google Drive connected!"
}
if (params.get('drive_connected') === 'false') {
  // Show error: params.get('error')
}
```

### Disconnect (optional settings page)
```http
POST /drive-access/disconnect
Authorization: Bearer <jwt>
```

---

## Step 1 — Get a Short-Lived Access Token

Call this **each time before uploading** (or cache until `expiresAt`).

```http
GET /drive-access/token
Authorization: Bearer <jwt>
```
Response:
```json
{
  "accessToken": "ya29.a0AfH6SMBx...",
  "expiresAt": "2026-03-16T10:30:00Z",
  "tokenType": "Bearer"
}
```

> The refresh token stays encrypted on our server — this is the only token the frontend ever sees.

```typescript
async function getDriveAccessToken(): Promise<string> {
  const res = await fetch('/drive-access/token', {
    headers: { Authorization: `Bearer ${jwt}` },
  });
  if (!res.ok) throw new Error('Drive not connected — redirect to /drive-access/connect');
  const data = await res.json();
  return data.accessToken;
}
```

---

## Step 2 — Get the Upload Folder

Get (or auto-create) the organised folder for lecture documents.

```http
GET /drive-access/folder?purpose=LECTURE_DOCUMENT
Authorization: Bearer <jwt>
```
Response:
```json
{
  "folderId": "1BxiMHmkNJqVtZLOEMKxQwNb94rhkNab3",
  "folderPath": "Suraksha LMS / Lecture Documents"
}
```

Cache `folderId` for this session — it won't change.

---

## Step 3 — Upload Directly to Google Drive

Use the access token from Step 1 and the folderId from Step 2.

### JavaScript / TypeScript upload helper

```typescript
async function uploadToGoogleDrive(
  file: File,
  accessToken: string,
  folderId: string,
): Promise<{ driveFileId: string; fileName: string; mimeType: string }> {
  // Step 3a: Create the file metadata (get resumable upload URI)
  const metadataRes = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json; charset=UTF-8',
        'X-Upload-Content-Type': file.type,
        'X-Upload-Content-Length': String(file.size),
      },
      body: JSON.stringify({
        name: file.name,
        parents: [folderId],
        mimeType: file.type,
      }),
    },
  );

  if (!metadataRes.ok) throw new Error('Failed to initiate Google Drive upload');
  const uploadUrl = metadataRes.headers.get('Location');

  // Step 3b: Upload the file bytes
  const uploadRes = await fetch(uploadUrl, {
    method: 'PUT',
    headers: {
      'Content-Type': file.type,
      'Content-Length': String(file.size),
    },
    body: file,
  });

  if (!uploadRes.ok) throw new Error('Google Drive upload failed');
  const fileData = await uploadRes.json();

  return {
    driveFileId: fileData.id,
    fileName: fileData.name,
    mimeType: fileData.mimeType,
  };
}
```

### React example (with progress)

```typescript
import { useState } from 'react';

function LectureDocumentUploader({ lectureId }: { lectureId?: string }) {
  const [uploading, setUploading] = useState(false);
  const [docs, setDocs] = useState<DriveDoc[]>([]);

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      // 1. Get token
      const { accessToken } = await api.get('/drive-access/token');

      // 2. Get folder
      const { folderId } = await api.get('/drive-access/folder?purpose=LECTURE_DOCUMENT');

      // 3. Upload
      const { driveFileId, fileName, mimeType } = await uploadToGoogleDrive(file, accessToken, folderId);

      // 4. Register with our backend
      const registered = await api.post('/drive-access/files/register', {
        driveFileId,
        purpose: 'LECTURE_DOCUMENT',
        referenceType: 'structured_lecture',
        referenceId: lectureId ?? undefined, // pass if updating an existing lecture
      });

      // 5. Add to document list for the lecture payload
      setDocs(prev => [...prev, {
        documentName: fileName,
        driveFileId: registered.driveFileId,
        driveWebViewLink: registered.viewUrl,
        documentUrl: registered.viewUrl,
        source: 'GOOGLE_DRIVE',
      }]);
    } catch (err) {
      if (err.message.includes('Drive not connected')) {
        window.location.href = '/drive-access/connect?returnUrl=/lectures/new';
      } else {
        alert(`Upload failed: ${err.message}`);
      }
    } finally {
      setUploading(false);
    }
  }

  return (
    <div>
      <input type="file" onChange={handleFileSelect} disabled={uploading} />
      {uploading && <span>Uploading to Google Drive…</span>}
      <ul>
        {docs.map(d => (
          <li key={d.driveFileId}>
            <a href={d.driveWebViewLink} target="_blank" rel="noreferrer">{d.documentName}</a>
          </li>
        ))}
      </ul>
    </div>
  );
}
```

---

## Step 4 — Register the File with Our Backend

After Google returns the file ID in Step 3, call our backend to verify and record it.

```http
POST /drive-access/files/register
Authorization: Bearer <jwt>
Content-Type: application/json

{
  "driveFileId": "1abc123def456ghi789",
  "purpose": "LECTURE_DOCUMENT",
  "referenceType": "structured_lecture",
  "referenceId": "<lectureId if known>"
}
```

Response:
```json
{
  "id": "55",
  "driveFileId": "1abc123def456ghi789",
  "fileName": "Chapter_1_Introduction.pdf",
  "mimeType": "application/pdf",
  "fileSize": 1048576,
  "viewUrl": "https://drive.google.com/file/d/1abc123def456ghi789/view",
  "embedUrl": "https://drive.google.com/file/d/1abc123def456ghi789/preview",
  "purpose": "LECTURE_DOCUMENT"
}
```

---

## Step 5 — Create or Update the Lecture

Use the `documents` array to attach Drive files. The `driveFileId` is the key field.

### Create
```http
POST /api/structured-lectures
Authorization: Bearer <jwt>
Content-Type: application/json

{
  "instituteId": "101",
  "subjectId": "SUBJ_MATH_001",
  "grade": 10,
  "lessonNumber": 1,
  "lectureNumber": 2,
  "title": "Introduction to Algebra",
  "description": "Covers variables, equations, and expressions.",
  "provider": "Dr. Jane Smith",
  "lectureLink": "https://zoom.us/j/123456789",
  "isActive": true,
  "documents": [
    {
      "documentName": "Chapter_1_Introduction.pdf",
      "driveFileId": "1abc123def456ghi789",
      "driveWebViewLink": "https://drive.google.com/file/d/1abc123def456ghi789/view",
      "documentUrl": "https://drive.google.com/file/d/1abc123def456ghi789/view",
      "source": "GOOGLE_DRIVE"
    },
    {
      "documentName": "Practice_Problems.pdf",
      "driveFileId": "2xyz789abc123def456",
      "driveWebViewLink": "https://drive.google.com/file/d/2xyz789abc123def456/view",
      "documentUrl": "https://drive.google.com/file/d/2xyz789abc123def456/view",
      "source": "GOOGLE_DRIVE"
    }
  ]
}
```

### Update (PATCH keeps existing cover image if not provided)
```http
PUT /api/structured-lectures/:id
Authorization: Bearer <jwt>
Content-Type: application/json

{
  "documents": [
    {
      "documentName": "Updated_Notes.pdf",
      "driveFileId": "3newFileId...",
      "driveWebViewLink": "https://drive.google.com/file/d/3newFileId.../view",
      "documentUrl": "https://drive.google.com/file/d/3newFileId.../view",
      "source": "GOOGLE_DRIVE"
    }
  ]
}
```

> Sending `documents: []` clears all attachments. Omitting `documents` entirely leaves them unchanged.

---

## What the API Returns

Lecture responses always include the full `documents` array with Drive metadata preserved:

```json
{
  "data": {
    "_id": "uuid-of-lecture",
    "title": "Introduction to Algebra",
    "coverImageUrl": "https://storage.suraksha.lk/lecture-covers/cover-uuid.jpg",
    "documents": [
      {
        "documentName": "Chapter_1_Introduction.pdf",
        "documentUrl": "https://drive.google.com/file/d/1abc123def456ghi789/view",
        "driveFileId": "1abc123def456ghi789",
        "driveWebViewLink": "https://drive.google.com/file/d/1abc123def456ghi789/view",
        "source": "GOOGLE_DRIVE"
      }
    ],
    "lessonNumber": 1,
    "lectureNumber": 2,
    "provider": "Dr. Jane Smith"
  }
}
```

To show an inline preview of a PDF in an `<iframe>`:
```html
<iframe
  src="https://drive.google.com/file/d/{driveFileId}/preview"
  width="100%"
  height="600"
  allow="autoplay"
/>
```

---

## API Quick Reference

| Step | Method | Endpoint | Purpose |
|------|--------|----------|---------|
| Check connection | `GET` | `/drive-access/status` | Is Drive connected? |
| Connect Drive | `GET` | `/drive-access/connect?returnUrl=...` | Get OAuth URL (one-time) |
| Disconnect | `POST` | `/drive-access/disconnect` | Remove Drive connection |
| **Get token** | `GET` | `/drive-access/token` | Short-lived upload token |
| **Get folder** | `GET` | `/drive-access/folder?purpose=LECTURE_DOCUMENT` | Folder ID for uploads |
| **Register file** | `POST` | `/drive-access/files/register` | Record after Drive upload |
| List files | `GET` | `/drive-access/files?purpose=LECTURE_DOCUMENT` | Uploaded lecture docs |
| File detail | `GET` | `/drive-access/files/:id` | Single file metadata |
| Delete file | `DELETE` | `/drive-access/files/:id` | Delete from Drive + DB |
| Download (proxy) | `GET` | `/drive-access/files/:id/download` | Stream through backend |
| Create lecture | `POST` | `/api/structured-lectures` | Save lecture with docs |
| Update lecture | `PUT` | `/api/structured-lectures/:id` | Update docs |

---

## Error Handling

| HTTP | Meaning | Action |
|------|---------|--------|
| `401` from `/drive-access/token` | Drive not connected | Redirect to `/drive-access/connect` |
| `400 "File not found on Drive"` | `driveFileId` is invalid | Retry the upload |
| `403` | JWT expired or no permission | Re-login |
| `503` | Google API is down | Show retry message |

```typescript
async function safeGetToken(jwt: string): Promise<string | null> {
  const res = await fetch('/drive-access/token', {
    headers: { Authorization: `Bearer ${jwt}` },
  });

  if (res.status === 401) {
    // Drive disconnected — redirect user to reconnect
    window.location.href = `/drive-access/connect?returnUrl=${encodeURIComponent(window.location.pathname)}`;
    return null;
  }

  if (!res.ok) throw new Error(`Token fetch failed: ${res.status}`);
  const { accessToken } = await res.json();
  return accessToken;
}
```

---

## Cover Image (S3) vs Documents (Google Drive) — Summary

| | Cover Image | Reference Documents |
|--|-------------|---------------------|
| **Storage** | Our S3 bucket | Teacher's Google Drive |
| **Upload flow** | Signed URL (`/api/structured-lectures/upload/cover-image/signed-url`) | Direct Drive upload (3-step flow above) |
| **Field in lecture** | `coverImageUrl` | `documents[].driveFileId` |
| **Who owns the file** | Suraksha LMS | The teacher |
