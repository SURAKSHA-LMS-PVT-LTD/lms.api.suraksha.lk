# Homework Reference Upload - Complete API Documentation

## Overview

Teachers and Institute Admins can upload reference materials (videos, PDFs, images, documents, audio, links) to homework assignments. Three upload methods are supported:

1. **S3 Upload** — Direct file upload to AWS S3 via signed URL
2. **Google Drive** — Link a file from the teacher's Google Drive
3. **External Link** — Attach a manual URL (YouTube, website, etc.)

Base URL: `https://lmsapi.suraksha.lk`

All endpoints require **JWT authentication** (`Authorization: Bearer <token>`).

---

## Access Control

| Role | Can Upload | Can View | Can Delete (Permanent) |
|------|-----------|----------|----------------------|
| SUPERADMIN | Yes | Yes | Yes |
| Institute Admin | Yes | Yes | Yes |
| Teacher | Yes | Yes | No (soft delete only) |
| Student / Parent | No | Yes | No |

---

## Reference Types

| Type | Allowed MIME Types | Max Size |
|------|-------------------|----------|
| `VIDEO` | video/mp4, video/webm, video/ogg, video/quicktime, video/x-msvideo, video/x-ms-wmv | 500 MB |
| `IMAGE` | image/jpeg, image/png, image/gif, image/webp, image/svg+xml, image/bmp | 10 MB |
| `PDF` | application/pdf | 50 MB |
| `DOCUMENT` | application/msword, docx, xls, xlsx, ppt, pptx, text/plain, rtf | 50 MB |
| `AUDIO` | audio/mpeg, audio/wav, audio/ogg, audio/webm, audio/aac, audio/mp4 | 100 MB |
| `LINK` | N/A (external URL) | N/A |
| `OTHER` | Any | 100 MB |

---

## Upload Workflow 1: S3 (Direct File Upload)

### Step 1: Generate Signed Upload URL

```
POST /homework-references/upload/generate-url
Content-Type: application/json
Authorization: Bearer <token>
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

**Response (200):**
```json
{
  "uploadUrl": "https://s3.amazonaws.com/bucket-name",
  "relativePath": "homework-references/123/chapter1-lecture-a1b2c3d4.mp4",
  "fields": {
    "key": "homework-references/123/chapter1-lecture-a1b2c3d4.mp4",
    "Content-Type": "video/mp4",
    "x-amz-server-side-encryption": "AES256",
    "Policy": "eyJ...",
    "X-Amz-Signature": "abc123...",
    "X-Amz-Algorithm": "AWS4-HMAC-SHA256",
    "X-Amz-Credential": "...",
    "X-Amz-Date": "20260306T..."
  },
  "expiresIn": 3600,
  "maxFileSize": 524288000
}
```

### Step 2: Upload to S3

Upload the file directly from the frontend using the returned `uploadUrl` and `fields`:

```js
// Frontend: Upload with POST form data
const formData = new FormData();

// Add ALL fields from the response first
Object.entries(response.fields).forEach(([key, value]) => {
  formData.append(key, value);
});

// Add the file LAST (required by S3)
formData.append('file', selectedFile);

await fetch(response.uploadUrl, {
  method: 'POST',
  body: formData,
});
```

### Step 3: Confirm Upload & Create Reference

```
POST /homework-references/upload/confirm
Content-Type: application/json
Authorization: Bearer <token>
```

**Request Body:**
```json
{
  "homeworkId": "123",
  "title": "Chapter 1 Video Lecture",
  "description": "Covers all key concepts from chapter 1",
  "referenceType": "VIDEO",
  "relativePath": "homework-references/123/chapter1-lecture-a1b2c3d4.mp4",
  "fileName": "chapter1-lecture.mp4",
  "fileSize": 52428800,
  "mimeType": "video/mp4",
  "displayOrder": 0,
  "videoDuration": 3600
}
```

**Response (201):**
```json
{
  "id": "1",
  "homeworkId": "123",
  "uploadedById": "456",
  "title": "Chapter 1 Video Lecture",
  "description": "Covers all key concepts from chapter 1",
  "referenceType": "VIDEO",
  "referenceSource": "S3_UPLOAD",
  "displayOrder": 0,
  "fileUrl": "https://storage.suraksha.lk/homework-references/123/chapter1-lecture-a1b2c3d4.mp4",
  "fileName": "chapter1-lecture.mp4",
  "fileSize": 52428800,
  "mimeType": "video/mp4",
  "videoDuration": 3600,
  "viewUrl": "https://storage.suraksha.lk/homework-references/123/chapter1-lecture-a1b2c3d4.mp4",
  "isActive": true,
  "createdAt": "2026-03-06T10:30:00.000Z",
  "updatedAt": "2026-03-06T10:30:00.000Z",
  "uploadedBy": {
    "id": "456",
    "nameWithInitials": "A.B. Perera",
    "email": "teacher@example.com"
  }
}
```

---

## Upload Workflow 2: Google Drive

Teachers can link files directly from their Google Drive.

**Prerequisites:**
- Teacher must have completed Google OAuth flow via `GET /auth/google`
- Must have a valid Google access token

### Link from Google Drive

```
POST /homework-references/google-drive
Content-Type: application/json
Authorization: Bearer <token>
```

**Request Body:**
```json
{
  "homeworkId": "123",
  "title": "Chapter 1 Notes from Drive",
  "description": "Shared from my Google Drive",
  "referenceType": "PDF",
  "driveFileId": "1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms",
  "accessToken": "ya29.a0AfH6SMBx...",
  "displayOrder": 1
}
```

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
  "isActive": true,
  "createdAt": "2026-03-06T10:35:00.000Z"
}
```

**Google Drive Computed URLs:**
- `driveViewUrl` — Opens file in Google Drive viewer
- `driveDownloadUrl` — Direct download link
- `driveEmbedUrl` — Embeddable iframe URL (for videos/docs)

---

## Upload Workflow 3: External Link

Attach any external URL (YouTube, website, etc.) as a reference.

```
POST /homework-references/link
Content-Type: application/json
Authorization: Bearer <token>
```

**Request Body:**
```json
{
  "homeworkId": "123",
  "title": "YouTube Tutorial",
  "description": "Great explanation of the topic",
  "referenceType": "VIDEO",
  "externalUrl": "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
  "linkTitle": "Watch on YouTube",
  "displayOrder": 2,
  "videoDuration": 212,
  "thumbnailUrl": "homework-references/thumbnails/thumb-abc.jpg"
}
```

**Response (201):**
```json
{
  "id": "3",
  "homeworkId": "123",
  "referenceType": "VIDEO",
  "referenceSource": "MANUAL_LINK",
  "externalUrl": "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
  "linkTitle": "Watch on YouTube",
  "videoDuration": 212,
  "viewUrl": "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
  "isActive": true,
  "createdAt": "2026-03-06T10:40:00.000Z"
}
```

---

## Read Endpoints

### Get All References (with filtering & pagination)

```
GET /homework-references?homeworkId=123&referenceType=VIDEO&page=1&limit=10
Authorization: Bearer <token>
```

**Query Parameters:**

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `homeworkId` | string | No | Filter by homework ID |
| `referenceType` | enum | No | `VIDEO`, `IMAGE`, `PDF`, `DOCUMENT`, `LINK`, `AUDIO`, `OTHER` |
| `referenceSource` | enum | No | `S3_UPLOAD`, `GOOGLE_DRIVE`, `MANUAL_LINK` |
| `uploadedById` | string | No | Filter by uploader user ID |
| `isActive` | boolean | No | Default: `true` |
| `search` | string | No | Search in title and description |
| `page` | number | No | Default: `1` |
| `limit` | number | No | Default: `10`, max: `100` |
| `sortBy` | enum | No | `displayOrder` (default), `title`, `createdAt`, `referenceType` |
| `sortOrder` | enum | No | `ASC` (default), `DESC` |

**Response (200):**
```json
{
  "data": [ /* array of HomeworkReferenceResponseDto */ ],
  "total": 25,
  "page": 1,
  "limit": 10,
  "totalPages": 3,
  "hasNext": true,
  "hasPrev": false
}
```

### Get All References for a Homework

```
GET /homework-references/homework/:homeworkId
Authorization: Bearer <token>
```

Returns all active references ordered by `displayOrder ASC, createdAt DESC`.

**Response (200):**
```json
[
  {
    "id": "1",
    "title": "Chapter 1 Video",
    "referenceType": "VIDEO",
    "referenceSource": "S3_UPLOAD",
    "displayOrder": 0,
    "viewUrl": "https://storage.suraksha.lk/...",
    "isActive": true
  },
  {
    "id": "2",
    "title": "Chapter 1 Notes",
    "referenceType": "PDF",
    "referenceSource": "GOOGLE_DRIVE",
    "displayOrder": 1,
    "driveViewUrl": "https://drive.google.com/file/d/.../view",
    "isActive": true
  }
]
```

### Get Reference Summary

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

### Get Single Reference

```
GET /homework-references/:id
Authorization: Bearer <token>
```

---

## Update Endpoints

### Update Reference Metadata

```
PATCH /homework-references/:id
Content-Type: application/json
Authorization: Bearer <token>
```

**Request Body (all fields optional):**
```json
{
  "title": "Updated Title",
  "description": "Updated description",
  "displayOrder": 5,
  "referenceType": "PDF"
}
```

### Reorder References

```
PATCH /homework-references/homework/:homeworkId/reorder
Content-Type: application/json
Authorization: Bearer <token>
```

**Request Body:**
```json
{
  "referenceIds": ["3", "1", "2"]
}
```

Updates `displayOrder` based on array position (0, 1, 2...).

---

## Delete Endpoints

### Soft Delete (Teacher/Admin)

```
DELETE /homework-references/:id
Authorization: Bearer <token>
```

Sets `isActive = false`. Can be restored later. Returns `204 No Content`.

### Permanent Delete (Admin only)

```
DELETE /homework-references/:id/permanent
Authorization: Bearer <token>
```

Permanently removes the record and deletes the S3 file if applicable. Returns `204 No Content`.

### Bulk Soft Delete

```
DELETE /homework-references/bulk
Content-Type: application/json
Authorization: Bearer <token>
```

**Request Body:**
```json
{
  "ids": ["1", "2", "3"]
}
```

### Restore Soft-Deleted Reference

```
PATCH /homework-references/:id/restore
Authorization: Bearer <token>
```

---

## Frontend Implementation Guide

### Teacher Reference Upload Component

```tsx
// Step 1: Teacher selects upload method
const UPLOAD_METHODS = [
  { value: 'S3_UPLOAD', label: 'Upload File', icon: 'upload' },
  { value: 'GOOGLE_DRIVE', label: 'Google Drive', icon: 'google-drive' },
  { value: 'MANUAL_LINK', label: 'Paste Link', icon: 'link' },
];

// Step 2: Upload flow based on method
const handleUpload = async (method, file, metadata) => {
  switch (method) {
    case 'S3_UPLOAD': {
      // 1. Get signed URL
      const urlRes = await api.post('/homework-references/upload/generate-url', {
        homeworkId,
        fileName: file.name,
        contentType: file.type,
        fileSize: file.size,
        referenceType: detectType(file.type), // e.g., VIDEO, PDF, IMAGE
      });

      // 2. Upload to S3 using POST with form data
      const formData = new FormData();
      Object.entries(urlRes.data.fields).forEach(([key, val]) => {
        formData.append(key, val);
      });
      formData.append('file', file);
      await fetch(urlRes.data.uploadUrl, { method: 'POST', body: formData });

      // 3. Confirm upload
      return api.post('/homework-references/upload/confirm', {
        homeworkId,
        title: metadata.title,
        description: metadata.description,
        referenceType: detectType(file.type),
        relativePath: urlRes.data.relativePath,
        fileName: file.name,
        fileSize: file.size,
        mimeType: file.type,
        displayOrder: metadata.order || 0,
      });
    }

    case 'GOOGLE_DRIVE': {
      // User picks file from Google Drive picker
      return api.post('/homework-references/google-drive', {
        homeworkId,
        title: metadata.title,
        description: metadata.description,
        referenceType: metadata.referenceType,
        driveFileId: metadata.driveFileId,
        accessToken: googleAccessToken,
      });
    }

    case 'MANUAL_LINK': {
      return api.post('/homework-references/link', {
        homeworkId,
        title: metadata.title,
        description: metadata.description,
        referenceType: metadata.referenceType,
        externalUrl: metadata.url,
        linkTitle: metadata.linkTitle,
      });
    }
  }
};
```

### Detect Reference Type from MIME

```ts
function detectType(mimeType: string): string {
  if (mimeType.startsWith('video/')) return 'VIDEO';
  if (mimeType.startsWith('image/')) return 'IMAGE';
  if (mimeType.startsWith('audio/')) return 'AUDIO';
  if (mimeType === 'application/pdf') return 'PDF';
  if (mimeType.includes('word') || mimeType.includes('excel') || 
      mimeType.includes('powerpoint') || mimeType.includes('spreadsheet') ||
      mimeType.includes('presentation') || mimeType === 'text/plain') return 'DOCUMENT';
  return 'OTHER';
}
```

### Reference List Component

```tsx
const ReferenceList = ({ homeworkId }) => {
  const [references, setReferences] = useState([]);

  useEffect(() => {
    api.get(`/homework-references/homework/${homeworkId}`)
      .then(res => setReferences(res.data));
  }, [homeworkId]);

  return references.map(ref => (
    <ReferenceCard
      key={ref.id}
      title={ref.title}
      type={ref.referenceType}
      source={ref.referenceSource}
      viewUrl={ref.viewUrl || ref.driveViewUrl || ref.externalUrl}
      downloadUrl={ref.driveDownloadUrl || ref.fileUrl}
      onDelete={() => handleDelete(ref.id)}
    />
  ));
};
```

---

## Error Codes

| Status | Error | Cause |
|--------|-------|-------|
| 400 | `Invalid file type` | MIME type not allowed for the reference type |
| 400 | `File size exceeds limit` | File too large for the reference type |
| 400 | `File not found` | S3 upload didn't complete before confirm |
| 400 | `Could not access Google Drive file` | Drive file doesn't exist or no permission |
| 403 | `Forbidden` | User doesn't have teacher/admin access to the institute |
| 404 | `Homework not found` | Invalid homework ID |
| 404 | `Reference not found` | Invalid reference ID |

---

## Database Table

Table: `institute_class_subject_homework_references`

| Column | Type | Notes |
|--------|------|-------|
| `id` | BIGINT PK | Auto-increment |
| `homework_id` | BIGINT | FK to homeworks table |
| `uploaded_by_id` | BIGINT | FK to users table |
| `title` | VARCHAR(255) | Required |
| `description` | TEXT | Optional |
| `reference_type` | ENUM | VIDEO, IMAGE, PDF, DOCUMENT, LINK, AUDIO, OTHER |
| `reference_source` | ENUM | S3_UPLOAD, GOOGLE_DRIVE, MANUAL_LINK |
| `display_order` | INT | Default 0 |
| `file_url` | VARCHAR(500) | S3 relative path |
| `file_name` | VARCHAR(255) | Original file name |
| `file_size` | BIGINT | Size in bytes |
| `mime_type` | VARCHAR(100) | MIME type |
| `drive_file_id` | VARCHAR(255) | Google Drive file ID |
| `drive_file_name` | VARCHAR(500) | Drive file name |
| `drive_mime_type` | VARCHAR(100) | Drive MIME type |
| `drive_file_size` | BIGINT | Drive file size |
| `external_url` | VARCHAR(1000) | Manual link URL |
| `link_title` | VARCHAR(255) | Manual link display title |
| `video_duration` | INT | Duration in seconds |
| `thumbnail_url` | VARCHAR(500) | Thumbnail path |
| `is_active` | BOOLEAN | Soft delete flag |
| `created_at` | TIMESTAMP | |
| `updated_at` | TIMESTAMP | |
