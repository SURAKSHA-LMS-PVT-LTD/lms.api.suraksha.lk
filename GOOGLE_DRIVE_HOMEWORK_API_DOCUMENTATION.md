# Google Drive & Homework System — Complete API Documentation

> **Version:** 2.0 | **Base URL:** `https://api.suraksha.lk` | **Auth:** Bearer JWT Token  
> All endpoints require `Authorization: Bearer <token>` unless marked PUBLIC.

---

## Table of Contents

1. [Authentication & Roles](#1-authentication--roles)
2. [File Upload Flow (Cloud Storage)](#2-file-upload-flow-cloud-storage)
3. [Google Drive Integration](#3-google-drive-integration)
4. [Homework Management](#4-homework-management)
5. [Homework References (Teacher Attachments)](#5-homework-references-teacher-attachments)
6. [Homework Submissions](#6-homework-submissions)
7. [Teacher Corrections (Upload & Drive)](#7-teacher-corrections-upload--drive)
8. [Database Schema](#8-database-schema)
9. [Error Handling](#9-error-handling)
10. [Complete Workflow Examples](#10-complete-workflow-examples)

---

## 1. Authentication & Roles

### JWT Token Structure (v2 compact)

```json
{
  "s": "userId",
  "i": [
    {
      "i": "instituteId",
      "r": 6,
      "c": [["classId", 15]]
    }
  ]
}
```

| Field | Description |
|-------|-------------|
| `s` | User ID (subject) |
| `i` | Institute access array |
| `i[].i` | Institute ID |
| `i[].r` | Role bitmask: `1`=Student, `2`=Teacher, `4`=InstituteAdmin |
| `i[].c` | Class access: `[[classId, subjectBitmask], ...]` |

### Role-Based Access

| Role | Bitmask | Can Do |
|------|---------|--------|
| Student | 1 | Submit homework, view own submissions |
| Teacher | 2 | Create homework, add references, review/correct submissions |
| Institute Admin | 4 | All teacher actions + manage institute |
| Superadmin | Global | Full system access |

---

## 2. File Upload Flow (Cloud Storage)

### 2.1 Generate Signed URL

**`POST /upload/generate-signed-url`** — PUBLIC (no auth required)

Generate a temporary upload URL for direct browser-to-cloud upload.

**Request Body:**
```json
{
  "folder": "homework-files",
  "fileName": "essay_assignment.pdf",
  "contentType": "application/pdf",
  "fileSize": 2048576
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `folder` | enum | Yes | Target folder (see valid values below) |
| `fileName` | string | Yes | Original file name |
| `contentType` | string | Yes | MIME type |
| `fileSize` | number | Yes | File size in bytes |

**Valid Folders & Allowed Types:**

| Folder | Extensions | Max Size |
|--------|-----------|----------|
| `homework-files` | .pdf, .jpg, .jpeg, .png, .doc, .docx | 20MB |
| `correction-files` | .pdf, .jpg, .jpeg, .png | 20MB |
| `profile-images` | .jpg, .jpeg, .png, .webp | 5MB |
| `institute-images` | .jpg, .jpeg, .png, .webp, .svg | 10MB |
| `student-images` | .jpg, .jpeg, .png, .webp | 5MB |

**Response (200):**
```json
{
  "success": true,
  "message": "Signed URL generated successfully",
  "data": {
    "uploadUrl": "https://storage.googleapis.com/bucket/...",
    "relativePath": "homework-files/uuid-essay_assignment.pdf",
    "expiresAt": "2024-01-15T10:10:00Z",
    "maxFileSize": 20971520,
    "contentType": "application/pdf"
  },
  "instructions": "PUT file to uploadUrl with Content-Type header, then call /upload/verify-and-publish"
}
```

### 2.2 Upload File to Cloud

**`PUT {uploadUrl}`** — Direct to cloud (not our API)

```bash
curl -X PUT "{uploadUrl}" \
  -H "Content-Type: application/pdf" \
  --data-binary @essay_assignment.pdf
```

### 2.3 Verify & Publish

**`POST /upload/verify-and-publish`** — Auth required

Makes the uploaded file publicly accessible and returns the permanent URL.

**Request Body:**
```json
{
  "relativePath": "homework-files/uuid-essay_assignment.pdf"
}
```

**Response (200):**
```json
{
  "success": true,
  "message": "File verified and published",
  "publicUrl": "https://storage.googleapis.com/suraksha-lms/homework-files/uuid-essay_assignment.pdf",
  "relativePath": "homework-files/uuid-essay_assignment.pdf"
}
```

### 2.4 Profile Image Signed URL

**`GET /upload/profile-images/get-signed-url`** — Public + API Key or JWT

**Query Params:** `fileName`, `contentType`, `fileSize`

Same response shape as 2.1.

---

## 3. Google Drive Integration

### Overview

Two Drive authentication patterns exist:

| Pattern | Use Case | Auth |
|---------|----------|------|
| **Stored OAuth** (`/drive-access/*`) | Persistent Drive connection, auto-refresh | Server-side encrypted tokens |
| **User-provided token** | One-time upload, quick access | Frontend Google Sign-In token |

### 3.1 Check Connection Status

**`GET /drive-access/status`**

**Response (200):**
```json
{
  "isConnected": true,
  "googleEmail": "teacher@gmail.com",
  "googleDisplayName": "Mr. Smith",
  "googleProfilePicture": "https://lh3.googleusercontent.com/...",
  "grantedScopes": "https://www.googleapis.com/auth/drive.file",
  "lastUsedAt": "2024-01-15T10:00:00Z",
  "connectedAt": "2024-01-01T08:00:00Z",
  "needsReauthorization": false
}
```

### 3.2 Connect Google Drive (OAuth)

**`GET /drive-access/connect`**

| Query | Type | Required | Description |
|-------|------|----------|-------------|
| `returnUrl` | string | No | Frontend URL to redirect after OAuth |

**Response (200):**
```json
{
  "authUrl": "https://accounts.google.com/o/oauth2/v2/auth?...",
  "state": "encrypted-state-token"
}
```

**Frontend:** Redirect user to `authUrl`. After consent, callback redirects to `returnUrl?drive_connected=true`.

### 3.3 OAuth Callback

**`GET /drive-access/callback`** — PUBLIC (OAuth redirect)

Handled automatically. Redirects to frontend with `?drive_connected=true` or `?drive_connected=false&error=...`.

### 3.4 Disconnect Drive

**`POST /drive-access/disconnect`**

**Response (200):**
```json
{
  "success": true,
  "message": "Google Drive disconnected successfully"
}
```

### 3.5 Get Access Token

**`GET /drive-access/token`**

Returns a short-lived access token (~1 hour) for frontend direct Drive uploads.

**Response (200):**
```json
{
  "accessToken": "ya29.a0AfH6SM...",
  "expiresIn": 3599,
  "expiresAt": "2024-01-15T11:00:00Z",
  "googleEmail": "teacher@gmail.com",
  "clientId": "123456789.apps.googleusercontent.com"
}
```

> **Security:** Refresh tokens are AES-256-GCM encrypted in DB, never exposed to frontend.

### 3.6 Get Upload Folder

**`GET /drive-access/folder`**

| Query | Type | Required | Description |
|-------|------|----------|-------------|
| `purpose` | enum | Yes | Upload purpose (see enum below) |

**DriveUploadPurpose enum:** `HOMEWORK_SUBMISSION`, `HOMEWORK_REFERENCE`, `HOMEWORK_CORRECTION`, `EXAM_SUBMISSION`, `PROFILE_DOCUMENT`, `GENERAL`

**Response (200):**
```json
{
  "folderId": "1ABCdef...",
  "folderPath": "Suraksha LMS/Homework Corrections"
}
```

### 3.7 Create Custom Folder

**`POST /drive-access/folder`**

**Request Body:**
```json
{
  "folderName": "Physics Corrections Term 2",
  "parentFolderId": "1ABCdef..."
}
```

**Response (201):**
```json
{
  "folderId": "1XYZabc...",
  "folderName": "Physics Corrections Term 2",
  "webViewLink": "https://drive.google.com/drive/folders/1XYZabc..."
}
```

### 3.8 Register Uploaded File

**`POST /drive-access/files/register`**

After uploading a file to Drive via the frontend, register it in the LMS system.

**Request Body:**
```json
{
  "driveFileId": "1BxiMVs0XRA5nFMd...",
  "purpose": "HOMEWORK_CORRECTION",
  "referenceType": "homework_submission",
  "referenceId": "456",
  "shareWithEmails": "student@gmail.com"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `driveFileId` | string | Yes | Google Drive file ID |
| `purpose` | enum | Yes | DriveUploadPurpose value |
| `referenceType` | string | No | Entity type (e.g., `homework_submission`) |
| `referenceId` | string | No | Entity ID being referenced |
| `shareWithEmails` | string | No | Comma-separated emails to share with |

**Response (201):**
```json
{
  "id": "1",
  "driveFileId": "1BxiMVs0XRA5nFMd...",
  "fileName": "Correction_Essay.pdf",
  "mimeType": "application/pdf",
  "fileSize": 1048576,
  "viewUrl": "https://drive.google.com/file/d/1BxiMVs0XRA5nFMd.../view",
  "embedUrl": "https://drive.google.com/file/d/1BxiMVs0XRA5nFMd.../preview",
  "downloadUrl": "https://drive.google.com/uc?id=1BxiMVs0XRA5nFMd...&export=download",
  "purpose": "HOMEWORK_CORRECTION",
  "referenceType": "homework_submission",
  "referenceId": "456",
  "createdAt": "2024-01-15T14:30:00Z"
}
```

### 3.9 List Files

**`GET /drive-access/files`**

| Query | Type | Required | Description |
|-------|------|----------|-------------|
| `purpose` | enum | No | Filter by purpose |
| `referenceType` | string | No | Filter by reference type |
| `referenceId` | string | No | Filter by reference ID |
| `page` | number | No | Page number (default: 1) |
| `limit` | number | No | Items per page (default: 10) |

**Response (200):**
```json
{
  "data": [
    {
      "id": "1",
      "driveFileId": "1BxiMVs0...",
      "fileName": "Correction.pdf",
      "mimeType": "application/pdf",
      "purpose": "HOMEWORK_CORRECTION",
      "createdAt": "2024-01-15T14:30:00Z"
    }
  ],
  "total": 1,
  "page": 1,
  "limit": 10,
  "totalPages": 1
}
```

### 3.10 Get File Details

**`GET /drive-access/files/:id`**

**Response:** Same as single item in register response.

### 3.11 Download File

**`GET /drive-access/files/:id/download`**

Returns binary file content with `Content-Disposition: attachment` header.

### 3.12 Delete File

**`DELETE /drive-access/files/:id`**

**Response (200):**
```json
{
  "success": true,
  "message": "File deleted successfully"
}
```

---

## 4. Homework Management

### 4.1 Create Homework

**`POST /institute-class-subject-homeworks`** — Teacher, InstituteAdmin, Superadmin

**Request Body:**
```json
{
  "instituteId": "1",
  "classId": "2",
  "subjectId": "3",
  "teacherId": "10",
  "title": "Essay: Climate Change Impact",
  "description": "Write a 1000-word essay on climate change effects in Sri Lanka",
  "startDate": "2024-01-15",
  "endDate": "2024-01-22",
  "referenceLink": "https://example.com/climate-guide",
  "isActive": true
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `instituteId` | string | Yes | Institute ID |
| `classId` | string | Yes | Class ID |
| `subjectId` | string | Yes | Subject ID |
| `teacherId` | string | Yes | Assigning teacher ID |
| `title` | string | Yes | Homework title |
| `startDate` | string | Yes | Start date (ISO) |
| `description` | string | No | Detailed description |
| `endDate` | string | No | Due date (ISO) |
| `referenceLink` | string | No | External reference URL |
| `isActive` | boolean | No | Active status (default: true) |

**Response (201):** `InstituteClassSubjectHomeworkResponseDto`

### 4.2 List Homework

**`GET /institute-class-subject-homeworks`** — anyInstituteRole

| Query | Type | Default | Description |
|-------|------|---------|-------------|
| `instituteId` | string | — | Filter by institute |
| `classId` | string | — | Filter by class |
| `subjectId` | string | — | Filter by subject |
| `teacherId` | string | — | Filter by teacher |
| `search` | string | — | Search in title/description |
| `isActive` | boolean | — | Active status filter |
| `fromDate` | string | — | Start date range |
| `toDate` | string | — | End date range |
| `includeReferences` | boolean | false | Include reference attachments |
| `includeSubmissions` | boolean | false | Include submission data |
| `page` | number | 1 | Page number |
| `limit` | number | 10 | Items per page |
| `sortBy` | enum | — | `title`, `startDate`, `endDate`, `createdAt` |
| `sortOrder` | enum | DESC | `ASC` or `DESC` |

**Response (200):**
```json
{
  "data": [{
    "id": "1",
    "title": "Essay: Climate Change Impact",
    "instituteId": "1",
    "classId": "2",
    "subjectId": "3",
    "teacherId": "10",
    "startDate": "2024-01-15",
    "endDate": "2024-01-22",
    "referenceCount": 3,
    "submissionCount": 25,
    "correctedCount": 15,
    "pendingCorrectionCount": 10,
    "hasSubmitted": true,
    "references": [],
    "mySubmissions": []
  }],
  "total": 50,
  "page": 1,
  "limit": 10,
  "totalPages": 5,
  "hasNext": true,
  "hasPrev": false
}
```

### 4.3 List by Class & Subject

**`GET /institute-class-subject-homeworks/class/:classId/subject/:subjectId`** — anyInstituteRole

Same query params and response as 4.2.

### 4.4 List by Institute

**`GET /institute-class-subject-homeworks/institute/:instituteId`** — anyInstituteRole

Same query params and response as 4.2.

### 4.5 List by Teacher

**`GET /institute-class-subject-homeworks/teacher/:teacherId`** — anyInstituteRole

Same query params and response as 4.2.

### 4.6 Get Homework by ID

**`GET /institute-class-subject-homeworks/:id`** — anyInstituteRole

**Response:** Full `InstituteClassSubjectHomeworkResponseDto` with nested `institute`, `class`, `subject`, `teacher`, `references[]`, `mySubmissions[]`.

### 4.7 Update Homework

**`PATCH /institute-class-subject-homeworks/:id`** — Teacher, InstituteAdmin, Superadmin

All fields from create DTO are optional.

### 4.8 Get Homework for User

**`GET /institute-class-subject-homeworks/user/:userId`** — Student, Parent, anyInstituteRole

**Required Query:** `instituteId`, `classId`, `subjectId`  
**Optional Query:** `page`, `limit`

### 4.9 Delete Homework

**`DELETE /institute-class-subject-homeworks/:id`** — Teacher, InstituteAdmin, Superadmin

**Response:** 204 No Content

---

## 5. Homework References (Teacher Attachments)

### Overview

Teachers can attach references to homework using three sources:
- **S3_UPLOAD** — Upload via signed URL to cloud storage
- **GOOGLE_DRIVE** — Link from teacher's Google Drive
- **MANUAL_LINK** — External URL (YouTube, website, etc.)

Reference types: `VIDEO`, `IMAGE`, `PDF`, `DOCUMENT`, `LINK`, `AUDIO`, `OTHER`

### 5.1 Create Reference (Generic)

**`POST /homework-references`** — Teacher, InstituteAdmin, Superadmin

**Request Body:**
```json
{
  "homeworkId": "1",
  "title": "Climate Change Research Paper",
  "referenceType": "PDF",
  "referenceSource": "S3_UPLOAD",
  "description": "Required reading material",
  "fileUrl": "homework-references/uuid-paper.pdf",
  "fileName": "research_paper.pdf",
  "fileSize": 2048576,
  "mimeType": "application/pdf",
  "displayOrder": 1
}
```

### 5.2 Generate Upload URL for Reference

**`POST /homework-references/upload/generate-url`** — Teacher, InstituteAdmin, Superadmin

**Request Body:**
```json
{
  "homeworkId": "1",
  "fileName": "lecture_notes.pdf",
  "contentType": "application/pdf",
  "fileSize": 5242880,
  "referenceType": "PDF"
}
```

**File Size Limits:**
| Type | Max Size |
|------|----------|
| VIDEO | 500MB |
| AUDIO | 100MB |
| PDF/DOCUMENT | 50MB |
| IMAGE | 10MB |

**Response (200):**
```json
{
  "uploadUrl": "https://storage.googleapis.com/...",
  "relativePath": "homework-references/uuid-lecture_notes.pdf",
  "expiresAt": "2024-01-15T10:10:00Z"
}
```

### 5.3 Confirm Reference Upload

**`POST /homework-references/upload/confirm`** — Teacher, InstituteAdmin, Superadmin

After uploading to the signed URL, confirm and create the reference record.

**Request Body:**
```json
{
  "homeworkId": "1",
  "title": "Lecture Notes Chapter 5",
  "referenceType": "PDF",
  "relativePath": "homework-references/uuid-lecture_notes.pdf",
  "fileName": "lecture_notes.pdf",
  "fileSize": 5242880,
  "mimeType": "application/pdf",
  "description": "Chapter 5 lecture notes for reference",
  "displayOrder": 2
}
```

### 5.4 Create Reference from Google Drive

**`POST /homework-references/google-drive`** — Teacher, InstituteAdmin, Superadmin

Attach a file from the teacher's Google Drive as a homework reference.

**Request Body:**
```json
{
  "homeworkId": "1",
  "title": "Research Video - Climate Patterns",
  "referenceType": "VIDEO",
  "driveFileId": "1BxiMVs0XRA5nFMdKvBd...",
  "accessToken": "ya29.a0AfH6SM...",
  "description": "Watch this before starting the essay",
  "displayOrder": 3,
  "videoDuration": "PT15M30S"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `homeworkId` | string | Yes | Target homework ID |
| `title` | string | Yes | Reference title |
| `referenceType` | enum | Yes | Type of reference |
| `driveFileId` | string | Yes | Google Drive file ID |
| `accessToken` | string | Yes | OAuth access token |
| `description` | string | No | Description |
| `displayOrder` | number | No | Display order |
| `videoDuration` | string | No | ISO 8601 duration |

**Response (201):**
```json
{
  "id": "5",
  "homeworkId": "1",
  "title": "Research Video - Climate Patterns",
  "referenceType": "VIDEO",
  "referenceSource": "GOOGLE_DRIVE",
  "driveFileId": "1BxiMVs0XRA5nFMdKvBd...",
  "driveFileName": "Climate_Patterns.mp4",
  "driveMimeType": "video/mp4",
  "driveFileSize": 52428800,
  "driveViewUrl": "https://drive.google.com/file/d/1BxiMVs0.../view",
  "driveDownloadUrl": "https://drive.google.com/uc?id=1BxiMVs0...&export=download",
  "driveEmbedUrl": "https://drive.google.com/file/d/1BxiMVs0.../preview",
  "displayOrder": 3,
  "isActive": true,
  "createdAt": "2024-01-15T10:00:00Z"
}
```

### 5.5 Create Reference from External Link

**`POST /homework-references/link`** — Teacher, InstituteAdmin, Superadmin

**Request Body:**
```json
{
  "homeworkId": "1",
  "title": "YouTube: Climate Change Explained",
  "referenceType": "LINK",
  "externalUrl": "https://youtube.com/watch?v=abc123",
  "linkTitle": "Climate Change Explained in 10 Minutes",
  "description": "Watch this introductory video",
  "thumbnailUrl": "https://img.youtube.com/vi/abc123/0.jpg",
  "videoDuration": "PT10M00S"
}
```

### 5.6 List References

**`GET /homework-references`** — anyInstituteRole

| Query | Type | Description |
|-------|------|-------------|
| `homeworkId` | string | Filter by homework |
| `referenceType` | enum | VIDEO, IMAGE, PDF, DOCUMENT, LINK, AUDIO, OTHER |
| `referenceSource` | enum | S3_UPLOAD, GOOGLE_DRIVE, MANUAL_LINK |
| `uploadedById` | string | Filter by uploader |
| `isActive` | boolean | Active filter |
| `search` | string | Search in title/description |
| `page` | number | Page (default: 1) |
| `limit` | number | Limit (default: 10, max: 100) |
| `sortBy` | enum | displayOrder, title, createdAt, updatedAt, referenceType |
| `sortOrder` | enum | ASC, DESC |

### 5.7 Get References by Homework

**`GET /homework-references/homework/:homeworkId`** — anyInstituteRole

Returns all references for a homework (array, not paginated).

### 5.8 Get Reference Summary

**`GET /homework-references/homework/:homeworkId/summary`** — anyInstituteRole

Returns count breakdown by type and source.

### 5.9 Get Reference by ID

**`GET /homework-references/:id`** — anyInstituteRole

### 5.10 Update Reference

**`PATCH /homework-references/:id`** — Teacher, InstituteAdmin, Superadmin

All fields optional: `title`, `description`, `referenceType`, `displayOrder`, `fileUrl`, `fileName`, `fileSize`, `mimeType`, `driveFileId`, `driveFileName`, `driveMimeType`, `driveFileSize`, `externalUrl`, `linkTitle`, `videoDuration`, `thumbnailUrl`, `isActive`.

### 5.11 Reorder References

**`PATCH /homework-references/homework/:homeworkId/reorder`** — Teacher, InstituteAdmin, Superadmin

**Request Body:**
```json
{
  "referenceIds": ["5", "3", "1", "2", "4"]
}
```

### 5.12 Delete Reference (Soft)

**`DELETE /homework-references/:id`** — Teacher, InstituteAdmin, Superadmin

### 5.13 Delete Reference (Permanent)

**`DELETE /homework-references/:id/permanent`** — InstituteAdmin, Superadmin

### 5.14 Bulk Delete References

**`DELETE /homework-references/bulk`** — Teacher, InstituteAdmin, Superadmin

**Request Body:**
```json
{
  "ids": ["1", "2", "3"]
}
```

### 5.15 Restore Reference

**`PATCH /homework-references/:id/restore`** — Teacher, InstituteAdmin, Superadmin

---

## 6. Homework Submissions

### 6.1 Submit Homework (Cloud Storage)

**`POST /institute-class-subject-homework-submissions/:homeworkId/submit`** — Student only

**Request Body:**
```json
{
  "fileUrl": "https://storage.googleapis.com/suraksha-lms/homework-files/submission.pdf"
}
```

**Response (200):**
```json
{
  "success": true,
  "message": "Homework submitted successfully",
  "data": {
    "submissionId": "123",
    "publicUrl": "https://storage.googleapis.com/suraksha-lms/homework-files/submission.pdf",
    "submittedAt": "2024-01-15T10:30:00+05:30"
  }
}
```

### 6.2 Submit Homework via Google Drive

Students can also submit homework from their Google Drive. This uses the `submitViaGoogleDrive` service method. The submission is created with `submissionType: 'GOOGLE_DRIVE'` and stores Drive metadata.

### 6.3 List Submissions (Teacher/Admin View)

**`GET /institute-class-subject-homework-submissions/institute/:instituteId/class/:classId/subject/:subjectId`** — Teacher (requireSubject), InstituteAdmin, Superadmin

| Query | Type | Description |
|-------|------|-------------|
| `homeworkId` | string | Filter by homework |
| `studentId` | string | Filter by student |
| `submissionDateFrom` | string | Date range start |
| `submissionDateTo` | string | Date range end |
| `isActive` | boolean | Active status |
| `hasFile` | boolean | Has file attached |
| `hasTeacherCorrection` | boolean | Has teacher correction |
| `remarksSearch` | string | Search in remarks |
| `page` | number | Page (default: 1) |
| `limit` | number | Items per page (default: 10) |
| `sortBy` | enum | submissionDate, grade, createdAt, updatedAt |
| `sortOrder` | enum | ASC, DESC |

**Response (200):**
```json
{
  "data": [{
    "id": "123",
    "homeworkId": "1",
    "studentId": "50",
    "studentName": "John Doe",
    "studentEmail": "john@example.com",
    "studentImageUrl": "https://storage.googleapis.com/.../profile.jpg",
    "submissionDate": "2024-01-15T10:30:00Z",
    "fileUrl": "https://storage.googleapis.com/.../submission.pdf",
    "submissionType": "UPLOAD",
    "driveFileId": null,
    "driveFileName": null,
    "driveViewUrl": null,
    "teacherCorrectionFileUrl": "https://storage.googleapis.com/.../correction.pdf",
    "correctionType": "UPLOAD",
    "correctionDriveFileId": null,
    "correctionDriveFileName": null,
    "correctionDriveViewUrl": null,
    "remarks": "Good work, improve conclusion",
    "isActive": true,
    "createdAt": "2024-01-15T10:30:00Z",
    "updatedAt": "2024-01-16T09:00:00Z"
  }],
  "meta": {
    "total": 25,
    "page": 1,
    "limit": 10,
    "totalPages": 3
  }
}
```

### 6.4 Review Submission

**`PATCH /institute-class-subject-homework-submissions/:submissionId/review`** — Teacher (requireSubject), InstituteAdmin, Superadmin

**Request Body:**
```json
{
  "remarks": "Good analysis but needs more citations",
  "requestResubmission": false,
  "grade": "A-"
}
```

**Response (200):**
```json
{
  "success": true,
  "message": "Submission reviewed successfully",
  "data": {
    "submissionId": "123",
    "remarks": "Good analysis but needs more citations",
    "requestResubmission": false,
    "reviewDate": "2024-01-16T09:00:00+05:30"
  }
}
```

### 6.5 Get Submission Details

**`GET /institute-class-subject-homework-submissions/:submissionId/details`** — anyInstituteRole

Returns full submission with nested homework and student details.

**Response (200):**
```json
{
  "id": "123",
  "homeworkId": "1",
  "studentId": "50",
  "submissionDate": "2024-01-15T10:30:00Z",
  "fileUrl": "https://storage.googleapis.com/.../submission.pdf",
  "submissionType": "UPLOAD",
  "driveFileId": null,
  "driveViewUrl": null,
  "teacherCorrectionFileUrl": "https://storage.googleapis.com/.../correction.pdf",
  "correctionType": "GOOGLE_DRIVE",
  "correctionDriveFileId": "1BxiMVs0...",
  "correctionDriveFileName": "Correction_Essay.pdf",
  "correctionDriveMimeType": "application/pdf",
  "correctionDriveFileSize": 1048576,
  "correctionDriveViewUrl": "https://drive.google.com/file/d/1BxiMVs0.../view",
  "remarks": "See corrections in the attached Drive file",
  "isActive": true,
  "homework": {
    "id": "1",
    "title": "Essay: Climate Change Impact",
    "description": "Write 1000-word essay...",
    "startDate": "2024-01-15",
    "endDate": "2024-01-22"
  },
  "student": {
    "id": "50",
    "firstName": "John",
    "lastName": "Doe",
    "email": "john@example.com"
  }
}
```

### 6.6 Get My Submissions (Student)

**`GET /institute-class-subject-homework-submissions/:homeworkId/my-submissions`** — Student only

| Query | Type | Description |
|-------|------|-------------|
| `page` | number | Page number |
| `limit` | number | Items per page |

### 6.7 Get Student Submissions (Teacher View)

**`GET /institute-class-subject-homework-submissions/student/:studentId/submissions`** — Teacher (requireSubject), InstituteAdmin, Superadmin

| Query | Type | Description |
|-------|------|-------------|
| `homeworkId` | string | Filter by homework |
| `page` | number | Page number |
| `limit` | number | Items per page |

---

## 7. Teacher Corrections (Upload & Drive)

### 7.1 Upload Correction File (Cloud Storage)

**`POST /institute-class-subject-homework-submissions/:submissionId/correction-file`** — Teacher (requireSubject), InstituteAdmin, Superadmin

Standard upload flow: Generate signed URL → Upload → Verify → Submit URL here.

**Request Body:**
```json
{
  "correctionFileUrl": "https://storage.googleapis.com/suraksha-lms/correction-files/correction.pdf"
}
```

**Response (200):**
```json
{
  "success": true,
  "message": "Correction file uploaded successfully",
  "data": {
    "submissionId": "123",
    "correctionFileUrl": "https://storage.googleapis.com/suraksha-lms/correction-files/correction.pdf",
    "uploadDate": "2024-01-16T09:00:00+05:30"
  }
}
```

### 7.2 Upload Correction File from Google Drive

**`POST /institute-class-subject-homework-submissions/:submissionId/correction-file-drive`** — Teacher (requireSubject), InstituteAdmin, Superadmin

Attach a correction file directly from Google Drive. The access token is used only for validation, never stored.

**Request Body:**
```json
{
  "driveFileId": "1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms",
  "accessToken": "ya29.a0AfH6SM...",
  "fileName": "Correction_Essay_JohnDoe.pdf",
  "mimeType": "application/pdf",
  "remarks": "Good work overall. Please review the highlighted corrections."
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `driveFileId` | string | Yes | Google Drive file ID |
| `accessToken` | string | Yes | OAuth access token (from `/drive-access/token` or Google Sign-In) |
| `fileName` | string | No | Custom name (auto-detected if omitted) |
| `mimeType` | string | No | MIME type (auto-detected if omitted) |
| `remarks` | string | No | Teacher feedback |

**Getting an access token:**
- **Option A (Stored OAuth):** `GET /drive-access/token` returns a fresh access token
- **Option B (Frontend Sign-In):** Use Google Sign-In SDK to get an access token directly

**Response (200):**
```json
{
  "success": true,
  "message": "Correction file from Google Drive attached successfully",
  "data": {
    "submissionId": "123",
    "correctionType": "GOOGLE_DRIVE",
    "correctionDriveFileId": "1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms",
    "correctionDriveFileName": "Correction_Essay_JohnDoe.pdf",
    "correctionDriveMimeType": "application/pdf",
    "correctionDriveViewUrl": "https://drive.google.com/file/d/1BxiMVs0.../view",
    "uploadDate": "2024-01-16T09:00:00+05:30"
  }
}
```

---

## 8. Database Schema

### Homework Submissions Table

```
institute_class_subject_homeworks_submissions
├── id                          BIGINT PK AUTO_INCREMENT
├── homeworkId                  BIGINT FK → homeworks.id
├── studentId                   BIGINT FK → users.id
├── submissionDate              DATETIME
├── fileUrl                     VARCHAR(500)       -- Cloud storage path
├── submissionType              ENUM('UPLOAD','GOOGLE_DRIVE') DEFAULT NULL
├── driveFileId                 VARCHAR(255)       -- Student Drive file ID
├── driveFileName               VARCHAR(500)       -- Student Drive file name
├── driveMimeType               VARCHAR(100)       -- Student Drive MIME type
├── driveFileSize               BIGINT             -- Student Drive file size
├── teacherCorrectionFileUrl    VARCHAR(500)       -- Cloud storage path or Drive URL
├── correctionType              ENUM('UPLOAD','GOOGLE_DRIVE') DEFAULT NULL
├── correctionDriveFileId       VARCHAR(255)       -- Teacher Drive file ID
├── correctionDriveFileName     VARCHAR(500)       -- Teacher Drive file name
├── correctionDriveMimeType     VARCHAR(100)       -- Teacher Drive MIME type
├── correctionDriveFileSize     BIGINT             -- Teacher Drive file size
├── remarks                     TEXT
├── isActive                    BOOLEAN DEFAULT TRUE
├── createdAt                   DATETIME
└── updatedAt                   DATETIME
```

### Homework References Table

```
institute_class_subject_homework_references
├── id                  BIGINT PK AUTO_INCREMENT
├── homeworkId           BIGINT FK → homeworks.id
├── uploadedById         BIGINT FK → users.id
├── title               VARCHAR(200)
├── description         TEXT
├── referenceType       ENUM('VIDEO','IMAGE','PDF','DOCUMENT','LINK','AUDIO','OTHER')
├── referenceSource     ENUM('S3_UPLOAD','GOOGLE_DRIVE','MANUAL_LINK')
├── displayOrder        INT DEFAULT 0
├── fileUrl             VARCHAR(500)       -- S3 path
├── fileName            VARCHAR(200)
├── fileSize            BIGINT
├── mimeType            VARCHAR(100)
├── driveFileId         VARCHAR(255)       -- Google Drive file ID
├── driveFileName       VARCHAR(500)
├── driveMimeType       VARCHAR(100)
├── driveFileSize       BIGINT
├── externalUrl         VARCHAR(1000)      -- Manual link URL
├── linkTitle           VARCHAR(300)
├── videoDuration       VARCHAR(50)
├── thumbnailUrl        VARCHAR(500)
├── isActive            BOOLEAN DEFAULT TRUE
├── createdAt           DATETIME
└── updatedAt           DATETIME
```

### User Drive Files Table

```
user_drive_files
├── id                  BIGINT PK AUTO_INCREMENT
├── userId              BIGINT FK → users.id
├── driveFileId         VARCHAR(255) NOT NULL
├── fileName            VARCHAR(500)
├── mimeType            VARCHAR(100)
├── fileSize            BIGINT
├── driveWebViewLink    VARCHAR(1000)
├── purpose             ENUM('HOMEWORK_SUBMISSION','HOMEWORK_REFERENCE',
│                            'HOMEWORK_CORRECTION','EXAM_SUBMISSION',
│                            'PROFILE_DOCUMENT','GENERAL')
├── referenceType       VARCHAR(100)       -- Polymorphic type
├── referenceId         BIGINT             -- Polymorphic ID
├── isActive            BOOLEAN DEFAULT TRUE
├── createdAt           DATETIME
└── updatedAt           DATETIME
```

---

## 9. Error Handling

### Standard Error Response

```json
{
  "statusCode": 400,
  "message": "Detailed error message",
  "error": "Bad Request"
}
```

### Common Error Codes

| Code | Scenario |
|------|----------|
| 400 | Missing required fields, invalid file type/size, Drive file not accessible |
| 401 | Missing or expired JWT token |
| 403 | Insufficient role/permissions (student trying to correct, teacher accessing other institute) |
| 404 | Homework/submission/reference not found |
| 409 | Duplicate submission |
| 413 | File too large (exceeds folder max) |

### Drive-Specific Errors

| Error | Cause | Solution |
|-------|-------|----------|
| `Unable to verify file in Google Drive` | Invalid driveFileId or expired token | Check file ID; refresh access token |
| `needsReauthorization: true` | Refresh token revoked | Re-connect via `/drive-access/connect` |
| `Drive not connected` | No stored OAuth | Connect first via `/drive-access/connect` |

---

## 10. Complete Workflow Examples

### Workflow A: Teacher Creates Homework with Drive Reference

```
1. POST /institute-class-subject-homeworks
   → Creates homework, returns homeworkId

2. GET /drive-access/token
   → Gets access token for Drive API

3. POST /homework-references/google-drive
   Body: { homeworkId, title, referenceType: "PDF", driveFileId, accessToken }
   → Attaches Drive file as reference

4. POST /homework-references/link
   Body: { homeworkId, title, referenceType: "LINK", externalUrl }
   → Adds YouTube video link
```

### Workflow B: Student Submits via Cloud Storage

```
1. POST /upload/generate-signed-url
   Body: { folder: "homework-files", fileName, contentType, fileSize }
   → Gets uploadUrl and relativePath

2. PUT {uploadUrl}
   Headers: Content-Type: application/pdf
   Body: <binary file>
   → Uploads to cloud

3. POST /upload/verify-and-publish
   Body: { relativePath }
   → Gets publicUrl

4. POST /institute-class-subject-homework-submissions/{homeworkId}/submit
   Body: { fileUrl: publicUrl }
   → Creates submission
```

### Workflow C: Teacher Corrects via Google Drive

```
1. GET /drive-access/status
   → Check if Drive is connected

2a. (If not connected) GET /drive-access/connect → Redirect to OAuth
2b. (If connected) GET /drive-access/token → Get access token

3. Teacher creates/edits correction file in Google Drive (frontend)

4. POST /institute-class-subject-homework-submissions/{submissionId}/correction-file-drive
   Body: { driveFileId, accessToken, remarks }
   → Attaches Drive correction to submission

5. (Optional) POST /drive-access/files/register
   Body: { driveFileId, purpose: "HOMEWORK_CORRECTION", referenceType: "homework_submission", referenceId }
   → Registers file in Drive tracking system
```

### Workflow D: Teacher Corrects via Cloud Storage

```
1. POST /upload/generate-signed-url
   Body: { folder: "correction-files", fileName, contentType, fileSize }
   → Gets uploadUrl

2. PUT {uploadUrl} → Upload correction PDF

3. POST /upload/verify-and-publish → Get publicUrl

4. POST /institute-class-subject-homework-submissions/{submissionId}/correction-file
   Body: { correctionFileUrl: publicUrl }
   → Attaches correction
```

### Workflow E: Full Reference Upload Cycle (S3)

```
1. POST /homework-references/upload/generate-url
   Body: { homeworkId, fileName, contentType, fileSize, referenceType: "PDF" }
   → Gets uploadUrl and relativePath

2. PUT {uploadUrl} → Upload file

3. POST /homework-references/upload/confirm
   Body: { homeworkId, title, referenceType, relativePath, fileName, fileSize, mimeType }
   → Creates reference record
```

---

## Quick Reference — All Endpoints

| # | Method | Path | Auth |
|---|--------|------|------|
| **Upload** | | | |
| 1 | POST | `/upload/generate-signed-url` | Public |
| 2 | GET | `/upload/get-signed-url` | JWT |
| 3 | GET | `/upload/profile-images/get-signed-url` | Public/Key |
| 4 | POST | `/upload/verify-and-publish` | JWT |
| **Drive Access** | | | |
| 5 | GET | `/drive-access/status` | JWT |
| 6 | GET | `/drive-access/connect` | JWT |
| 7 | GET | `/drive-access/callback` | Public |
| 8 | POST | `/drive-access/disconnect` | JWT |
| 9 | GET | `/drive-access/token` | JWT |
| 10 | GET | `/drive-access/folder` | JWT |
| 11 | POST | `/drive-access/folder` | JWT |
| 12 | POST | `/drive-access/files/register` | JWT |
| 13 | GET | `/drive-access/files` | JWT |
| 14 | GET | `/drive-access/files/:id` | JWT |
| 15 | GET | `/drive-access/files/:id/download` | JWT |
| 16 | DELETE | `/drive-access/files/:id` | JWT |
| **Homework** | | | |
| 17 | POST | `/institute-class-subject-homeworks` | Teacher+ |
| 18 | GET | `/institute-class-subject-homeworks` | Any |
| 19 | GET | `/institute-class-subject-homeworks/class/:classId/subject/:subjectId` | Any |
| 20 | GET | `/institute-class-subject-homeworks/institute/:instituteId` | Any |
| 21 | GET | `/institute-class-subject-homeworks/teacher/:teacherId` | Any |
| 22 | GET | `/institute-class-subject-homeworks/:id` | Any |
| 23 | PATCH | `/institute-class-subject-homeworks/:id` | Teacher+ |
| 24 | GET | `/institute-class-subject-homeworks/user/:userId` | Student+ |
| 25 | DELETE | `/institute-class-subject-homeworks/:id` | Teacher+ |
| **References** | | | |
| 26 | POST | `/homework-references` | Teacher+ |
| 27 | POST | `/homework-references/upload/generate-url` | Teacher+ |
| 28 | POST | `/homework-references/upload/confirm` | Teacher+ |
| 29 | POST | `/homework-references/google-drive` | Teacher+ |
| 30 | POST | `/homework-references/link` | Teacher+ |
| 31 | GET | `/homework-references` | Any |
| 32 | GET | `/homework-references/homework/:homeworkId` | Any |
| 33 | GET | `/homework-references/homework/:homeworkId/summary` | Any |
| 34 | GET | `/homework-references/:id` | Any |
| 35 | PATCH | `/homework-references/:id` | Teacher+ |
| 36 | PATCH | `/homework-references/homework/:homeworkId/reorder` | Teacher+ |
| 37 | DELETE | `/homework-references/:id` | Teacher+ |
| 38 | DELETE | `/homework-references/:id/permanent` | Admin+ |
| 39 | DELETE | `/homework-references/bulk` | Teacher+ |
| 40 | PATCH | `/homework-references/:id/restore` | Teacher+ |
| **Submissions** | | | |
| 41 | POST | `/.../homework-submissions/:homeworkId/submit` | Student |
| 42 | GET | `/.../homework-submissions/institute/:iId/class/:cId/subject/:sId` | Teacher+ |
| 43 | PATCH | `/.../homework-submissions/:submissionId/review` | Teacher+ |
| 44 | POST | `/.../homework-submissions/:submissionId/correction-file` | Teacher+ |
| 45 | POST | `/.../homework-submissions/:submissionId/correction-file-drive` | Teacher+ |
| 46 | GET | `/.../homework-submissions/:submissionId/details` | Any |
| 47 | GET | `/.../homework-submissions/:homeworkId/my-submissions` | Student |
| 48 | GET | `/.../homework-submissions/student/:studentId/submissions` | Teacher+ |

> **Legend:** Teacher+ = Teacher, InstituteAdmin, Superadmin | Admin+ = InstituteAdmin, Superadmin | Any = anyInstituteRole | Student = Student only
