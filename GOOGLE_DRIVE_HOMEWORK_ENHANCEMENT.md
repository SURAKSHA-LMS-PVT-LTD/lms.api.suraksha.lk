# 🎓 Google Drive Homework Submission - Integration Guide

## 📋 Overview

Enhanced the existing **institute_class_subject_homeworks_submissions** module to support Google Drive file submissions alongside traditional file uploads.

### 🔑 Key Features

✅ **Dual Submission Types**
- Traditional file uploads (existing)
- Google Drive file linking (new)

✅ **Zero Storage Approach**
- Files remain in student's Google Drive
- Backend only stores file metadata (fileId)
- Access tokens used temporarily for validation only

✅ **Seamless Integration**
- Works with existing homework management system
- No breaking changes to existing functionality
- Backward compatible with traditional uploads

---

## 🏗️ Architecture

```
Student Flow (Google Drive):
1. Student logs into LMS → JWT token
2. Student clicks "Connect Google Drive" → /auth/google
3. Google OAuth consent → Student grants drive.file permission
4. Callback returns access token (temporary)
5. Student uploads file to Drive (frontend direct)
6. Frontend gets fileId from Google Drive
7. Student submits to LMS → POST /institute-class-subject-homeworks-submissions/submit-google-drive
8. Backend validates fileId exists
9. Backend stores metadata only (NO token storage)
10. Student sees confirmation ✅
```

---

## 📦 What Was Enhanced

### 1. **Database Schema** (Entity)

Added new fields to `InstituteClassSubjectHomeworksSubmission`:

```typescript
// New Google Drive fields
driveFileId?: string;           // Google Drive file ID
driveFileName?: string;         // Original file name
driveMimeType?: string;         // MIME type
driveFileSize?: number;         // File size in bytes
submissionType: 'UPLOAD' | 'GOOGLE_DRIVE';  // Submission method
```

### 2. **API Endpoints**

#### New Endpoint: Submit via Google Drive
```http
POST /institute-class-subject-homeworks-submissions/submit-google-drive
Authorization: Bearer <LMS_JWT_TOKEN>

{
  "homeworkId": "123",
  "fileId": "1a2b3c4d5e6f7g8h9i0j",
  "accessToken": "ya29.a0...",
  "fileName": "homework.pdf",
  "mimeType": "application/pdf"
}
```

### 3. **Service Methods**

Added `submitViaGoogleDrive()` method:
- Validates homework exists
- Checks for duplicate submissions
- Verifies fileId in Google Drive (temporary token use)
- Stores metadata only
- Returns submission confirmation

---

## 🚀 Quick Setup

### 1. Environment Variables

Already configured in `.env`:
```env
GOOGLE_CLIENT_ID=696735498700-vifcskk15iiq8731ic53fm2ukfo7g3av.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=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
GOOGLE_REDIRECT_URI=https://lmsapi.suraksha.lk/auth/google/callback
FRONTEND_URL=https://lms.suraksha.lk
```

### 2. Run Migration

```bash
npm run migration:run
```

This adds the new Google Drive fields to the existing table.

### 3. Restart Backend

```bash
npm run start:dev
```

---

## 💻 Frontend Implementation

### Complete React Component

```typescript
// HomeworkGoogleDriveSubmit.tsx
import React, { useState, useEffect } from 'react';
import axios from 'axios';

const API_URL = 'https://lmsapi.suraksha.lk';

interface Props {
  homeworkId: string;
  onSuccess: () => void;
}

export const HomeworkGoogleDriveSubmit: React.FC<Props> = ({ homeworkId, onSuccess }) => {
  const [file, setFile] = useState<File | null>(null);
  const [googleAccessToken, setGoogleAccessToken] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const lmsToken = localStorage.getItem('accessToken');

  // Step 1: Check for Google OAuth callback
  useEffect(() => {
    const hash = window.location.hash.substring(1);
    const params = new URLSearchParams(hash);
    const accessToken = params.get('access_token');
    
    if (accessToken) {
      setGoogleAccessToken(accessToken);
      window.history.replaceState(null, '', window.location.pathname);
    }
  }, []);

  // Step 2: Connect to Google Drive
  const connectGoogleDrive = () => {
    window.location.href = `${API_URL}/auth/google`;
  };

  // Step 3: Upload to Google Drive
  const uploadToGoogleDrive = async (file: File): Promise<string> => {
    if (!googleAccessToken) {
      throw new Error('No Google access token');
    }

    const metadata = {
      name: file.name,
      mimeType: file.type,
    };

    const formData = new FormData();
    formData.append(
      'metadata',
      new Blob([JSON.stringify(metadata)], { type: 'application/json' })
    );
    formData.append('file', file);

    const response = await fetch(
      'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart',
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${googleAccessToken}` },
        body: formData,
      }
    );

    if (!response.ok) throw new Error('Upload failed');
    const data = await response.json();
    return data.id; // fileId
  };

  // Step 4: Submit to LMS
  const handleSubmit = async () => {
    if (!file || !googleAccessToken) return;

    setUploading(true);
    try {
      // Upload to Drive
      const fileId = await uploadToGoogleDrive(file);

      // Submit to LMS
      await axios.post(
        `${API_URL}/institute-class-subject-homeworks-submissions/submit-google-drive`,
        {
          homeworkId,
          fileId,
          accessToken: googleAccessToken,
          fileName: file.name,
          mimeType: file.type,
        },
        {
          headers: { Authorization: `Bearer ${lmsToken}` },
        }
      );

      alert('Homework submitted successfully!');
      onSuccess();
    } catch (error) {
      console.error('Submission failed:', error);
      alert('Failed to submit homework');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="google-drive-submit">
      <h3>Submit via Google Drive</h3>

      {!googleAccessToken ? (
        <button onClick={connectGoogleDrive} className="btn-connect">
          🔗 Connect Google Drive
        </button>
      ) : (
        <div>
          <p>✅ Google Drive Connected</p>
          <input
            type="file"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
            accept=".pdf,.doc,.docx,.txt"
          />
          {file && (
            <button
              onClick={handleSubmit}
              disabled={uploading}
              className="btn-submit"
            >
              {uploading ? 'Submitting...' : 'Submit Homework'}
            </button>
          )}
        </div>
      )}
    </div>
  );
};
```

---

## 📡 API Reference

### Submit via Google Drive

```http
POST /institute-class-subject-homeworks-submissions/submit-google-drive
Authorization: Bearer <LMS_JWT_TOKEN>
Content-Type: application/json
```

**Request Body:**
```json
{
  "homeworkId": "123",
  "fileId": "1a2b3c4d5e6f7g8h9i0j",
  "accessToken": "ya29.a0AfH6SMBx...",
  "fileName": "homework.pdf",
  "mimeType": "application/pdf"
}
```

**Response (201):**
```json
{
  "id": "456",
  "homeworkId": "123",
  "studentId": "789",
  "submissionType": "GOOGLE_DRIVE",
  "driveFileId": "1a2b3c4d5e6f7g8h9i0j",
  "driveFileName": "homework.pdf",
  "driveMimeType": "application/pdf",
  "driveFileSize": 1024000,
  "fileUrl": "https://drive.google.com/file/d/1a2b3c4d5e6f7g8h9i0j/view",
  "submissionDate": "2026-01-22T10:30:00Z",
  "isActive": true
}
```

### Get Submissions (Enhanced)

All existing endpoints now include Google Drive metadata:

```http
GET /institute-class-subject-homeworks-submissions?homeworkId=123
```

**Response includes:**
```json
{
  "data": [
    {
      "id": "1",
      "submissionType": "GOOGLE_DRIVE",
      "driveFileId": "1a2b3c...",
      "driveFileName": "homework.pdf",
      "fileUrl": "https://drive.google.com/file/d/...",
      "driveViewUrl": "https://drive.google.com/file/d/.../view"
    }
  ]
}
```

---

## 🔒 Security Features

| Feature | Implementation |
|---------|----------------|
| **No Token Storage** | ✅ Access tokens used temporarily, never stored |
| **Limited Scope** | ✅ `drive.file` only - can't access other files |
| **FileId Validation** | ✅ Verifies file exists before saving |
| **Student Ownership** | ✅ Files remain in student's Drive account |
| **JWT Authentication** | ✅ All endpoints require LMS authentication |
| **Duplicate Prevention** | ✅ Prevents multiple submissions per homework |

---

## 📊 Database Changes

### Migration: `1737547300000-AddGoogleDriveFieldsToHomeworkSubmissions.ts`

**Added Columns:**
- `drive_file_id` VARCHAR(255) - Google Drive file ID
- `drive_file_name` VARCHAR(500) - Original filename
- `drive_mime_type` VARCHAR(100) - MIME type
- `drive_file_size` BIGINT - File size in bytes
- `submission_type` ENUM('UPLOAD', 'GOOGLE_DRIVE') - Submission method

**Added Indexes:**
- `IDX_homework_submissions_drive_file_id` - Fast file lookups
- `IDX_homework_submissions_type` - Filter by submission type

---

## 🧪 Testing

### Test Google OAuth Flow

```bash
# 1. Start backend
npm run start:dev

# 2. Open browser (logged into LMS)
https://lmsapi.suraksha.lk/auth/google
```

### Test Submission

```bash
curl -X POST https://lmsapi.suraksha.lk/institute-class-subject-homeworks-submissions/submit-google-drive \
  -H "Authorization: Bearer <LMS_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "homeworkId": "123",
    "fileId": "1a2b3c4d5e6f7g8h9i0j",
    "accessToken": "ya29.a0...",
    "fileName": "homework.pdf",
    "mimeType": "application/pdf"
  }'
```

---

## 🔄 Backward Compatibility

✅ **All existing functionality preserved:**
- Traditional file uploads still work
- Existing submissions unaffected
- No breaking changes to APIs
- `submission_type` defaults to 'UPLOAD' for legacy data

---

## 📚 Comparison: Traditional vs Google Drive

| Feature | Traditional Upload | Google Drive |
|---------|-------------------|--------------|
| **File Storage** | LMS Server | Student's Drive |
| **Storage Cost** | LMS pays | Student's quota |
| **File Ownership** | LMS | Student |
| **Access After Submission** | Always available | Requires Drive access |
| **File Size Limit** | Server limit | Student's Drive limit |
| **Offline Access** | ❌ | ✅ (via Drive app) |

---

## ❓ FAQ

**Q: Do students need a Google account?**  
A: Yes, for Google Drive submissions only. Traditional uploads don't require Google.

**Q: Can teachers access student files?**  
A: Teachers get shareable Google Drive links. Students should ensure proper sharing permissions.

**Q: What happens if the student deletes the file from Drive?**  
A: The link becomes broken. We store metadata but can't access deleted files.

**Q: Can students switch between upload methods?**  
A: Yes! Each homework can be submitted via either method.

**Q: Is this GDPR compliant?**  
A: Yes - files stay in student's Google account. LMS only stores metadata.

---

**Status:** ✅ Production Ready  
**Version:** 1.0  
**Last Updated:** January 22, 2026
