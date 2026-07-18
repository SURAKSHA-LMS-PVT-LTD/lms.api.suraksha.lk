# 🎓 Google Drive Homework Submission - Complete Implementation Guide

## 📋 Overview

This implementation allows students to upload homework files **directly to their own Google Drive** and submit the file reference to the LMS backend. The backend **NEVER stores files or access tokens permanently**.

### 🏗️ Architecture

```
┌─────────────────┐
│  Student Browser │
└────────┬────────┘
         │
         ├─► 1. Login to LMS (JWT)
         │
         ├─► 2. Initiate Google OAuth
         │       GET /auth/google
         ├──────────────────────────────┐
         │                              │
         ▼                              ▼
┌────────────────┐            ┌──────────────┐
│ Google OAuth   │            │ LMS Backend  │
│ Consent Screen │            │              │
└────────┬───────┘            └──────────────┘
         │
         ├─► 3. User grants permissions
         │
         ├─► 4. Redirect with code
         │       GET /auth/google/callback?code=...
         │
         ▼
┌────────────────┐
│ LMS Backend    │
│ Exchanges code │
│ for token      │
└────────┬───────┘
         │
         ├─► 5. Returns access_token to frontend
         │
         ▼
┌─────────────────┐
│  Student Browser │
│ Uses token to   │
│ upload to Drive │
└────────┬────────┘
         │
         ├─► 6. Upload file to Google Drive API
         │       (Direct from browser)
         │
         ├─► 7. Gets fileId from Drive
         │
         ├─► 8. Submit to LMS
         │       POST /homework/submit
         │       { fileId, subjectId, accessToken }
         │
         ▼
┌────────────────┐
│ LMS Backend    │
│ - Verifies file│
│ - Stores only: │
│   * fileId     │
│   * studentId  │
│   * subjectId  │
│ - NO token     │
│   storage      │
└────────────────┘
```

---

## 🔐 Security Features

### ✅ What We Do
- ✅ Use **Authorization Code Flow** (most secure OAuth flow)
- ✅ Request **limited scope** (`drive.file` - only app-created files)
- ✅ **No refresh tokens** - access tokens expire in 1 hour
- ✅ **Validate fileId** before storing in database
- ✅ **Never store** access tokens in database
- ✅ Files remain in **student's Google Drive** (full ownership)
- ✅ Backend **never accesses file content**

### ❌ What We Don't Do
- ❌ No full Drive access (`drive` scope)
- ❌ No permanent token storage
- ❌ No file content storage
- ❌ No file downloading by backend
- ❌ No refresh token requests

---

## 📦 Installation & Setup

### 1. Install Dependencies

```bash
npm install @nestjs/axios axios class-validator class-transformer
```

### 2. Environment Variables

Add to `.env`:

```env
# Google OAuth 2.0 Configuration
GOOGLE_CLIENT_ID=696735498700-vifcskk15iiq8731ic53fm2ukfo7g3av.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=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
GOOGLE_REDIRECT_URI=https://lmsapi.suraksha.lk/auth/google/callback

# Frontend URL for redirects
FRONTEND_URL=https://lms.suraksha.lk
```

### 3. Update App Module

Add to `src/app.module.ts`:

```typescript
import { GoogleAuthModule } from './modules/google-auth/google-auth.module';
import { HomeworkSubmissionModule } from './modules/homework-submission/homework-submission.module';

@Module({
  imports: [
    // ... existing imports
    GoogleAuthModule,
    HomeworkSubmissionModule,
  ],
})
export class AppModule {}
```

### 4. Run Database Migration

```bash
npm run migration:run
```

---

## 📡 API Endpoints

### 1️⃣ Initiate Google OAuth

```http
GET /auth/google
Authorization: Bearer <LMS_JWT_TOKEN>
```

**Response:** Redirects to Google OAuth consent screen

**Frontend Example:**
```javascript
// User clicks "Upload to Google Drive" button
const initiateGoogleAuth = () => {
  window.location.href = `${API_URL}/auth/google`;
};
```

---

### 2️⃣ OAuth Callback (Automatic)

```http
GET /auth/google/callback?code=<AUTHORIZATION_CODE>&state=<STATE>
```

**Response:** Redirects to frontend with access token in URL fragment

```
https://lms.suraksha.lk/homework/upload#access_token=ya29.a0...&expires_in=3599&token_type=Bearer
```

**Frontend Example:**
```javascript
// On homework upload page
useEffect(() => {
  const hash = window.location.hash.substring(1);
  const params = new URLSearchParams(hash);
  const accessToken = params.get('access_token');
  
  if (accessToken) {
    setGoogleAccessToken(accessToken);
    // Clean URL
    window.history.replaceState(null, '', window.location.pathname);
  }
}, []);
```

---

### 3️⃣ Upload File to Google Drive (Frontend Only)

**This happens entirely in the frontend:**

```javascript
// Upload file to student's Google Drive
const uploadToGoogleDrive = async (file, accessToken) => {
  const metadata = {
    name: file.name,
    mimeType: file.type,
  };

  const formData = new FormData();
  formData.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
  formData.append('file', file);

  const response = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
    },
    body: formData,
  });

  const data = await response.json();
  return data.id; // Google Drive fileId
};
```

---

### 4️⃣ Submit Homework to LMS

```http
POST /homework/submit
Authorization: Bearer <LMS_JWT_TOKEN>
Content-Type: application/json

{
  "subjectId": "123",
  "fileId": "1a2b3c4d5e6f7g8h9i0j",
  "accessToken": "ya29.a0...",
  "fileName": "homework.pdf",
  "mimeType": "application/pdf"
}
```

**Response:**
```json
{
  "id": "1",
  "studentId": "456",
  "subjectId": "123",
  "driveFileId": "1a2b3c4d5e6f7g8h9i0j",
  "fileName": "homework.pdf",
  "mimeType": "application/pdf",
  "fileSize": 1024000,
  "submittedAt": "2026-01-22T10:30:00Z",
  "driveViewUrl": "https://drive.google.com/file/d/1a2b3c4d5e6f7g8h9i0j/view"
}
```

---

### 5️⃣ Get Student Submissions

```http
GET /homework/student/:studentId?subjectId=123
Authorization: Bearer <LMS_JWT_TOKEN>
```

**Response:**
```json
[
  {
    "id": "1",
    "studentId": "456",
    "subjectId": "123",
    "driveFileId": "1a2b3c4d5e6f7g8h9i0j",
    "fileName": "homework.pdf",
    "submittedAt": "2026-01-22T10:30:00Z",
    "driveViewUrl": "https://drive.google.com/file/d/1a2b3c4d5e6f7g8h9i0j/view"
  }
]
```

---

### 6️⃣ Get Subject Submissions (Teacher View)

```http
GET /homework/subject/:subjectId?page=1&limit=20
Authorization: Bearer <LMS_JWT_TOKEN>
```

**Response:**
```json
{
  "data": [
    {
      "id": "1",
      "studentId": "456",
      "driveFileId": "1a2b3c4d5e6f7g8h9i0j",
      "fileName": "homework.pdf",
      "submittedAt": "2026-01-22T10:30:00Z",
      "driveViewUrl": "https://drive.google.com/file/d/1a2b3c4d5e6f7g8h9i0j/view"
    }
  ],
  "total": 15,
  "page": 1,
  "limit": 20
}
```

---

### 7️⃣ Delete Submission

```http
DELETE /homework/:submissionId
Authorization: Bearer <LMS_JWT_TOKEN>
```

**Response:** `204 No Content`

**Note:** This only deletes the submission record in LMS. File remains in student's Google Drive.

---

## 💻 Frontend Implementation

### Complete React Example

```typescript
// HomeworkUpload.tsx
import React, { useState, useEffect } from 'react';
import axios from 'axios';

const API_URL = 'https://lmsapi.suraksha.lk';

export const HomeworkUpload: React.FC = () => {
  const [file, setFile] = useState<File | null>(null);
  const [googleAccessToken, setGoogleAccessToken] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const lmsToken = localStorage.getItem('lmsAccessToken');

  // Check if redirected from Google OAuth
  useEffect(() => {
    const hash = window.location.hash.substring(1);
    const params = new URLSearchParams(hash);
    const accessToken = params.get('access_token');
    
    if (accessToken) {
      setGoogleAccessToken(accessToken);
      window.history.replaceState(null, '', window.location.pathname);
      alert('Google Drive connected! You can now upload files.');
    }

    // Check for errors
    const searchParams = new URLSearchParams(window.location.search);
    const error = searchParams.get('error');
    if (error) {
      alert(`Error: ${error}`);
    }
  }, []);

  // Step 1: Connect to Google Drive
  const connectGoogleDrive = () => {
    window.location.href = `${API_URL}/auth/google`;
  };

  // Step 2: Upload file to Google Drive
  const uploadToGoogleDrive = async (file: File): Promise<string> => {
    if (!googleAccessToken) {
      throw new Error('Google access token not available');
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
        headers: {
          Authorization: `Bearer ${googleAccessToken}`,
        },
        body: formData,
      }
    );

    if (!response.ok) {
      throw new Error('Failed to upload to Google Drive');
    }

    const data = await response.json();
    return data.id; // fileId
  };

  // Step 3: Submit to LMS
  const submitHomework = async (fileId: string) => {
    const subjectId = '123'; // Get from props or context

    await axios.post(
      `${API_URL}/homework/submit`,
      {
        subjectId,
        fileId,
        accessToken: googleAccessToken,
        fileName: file?.name,
        mimeType: file?.type,
      },
      {
        headers: {
          Authorization: `Bearer ${lmsToken}`,
        },
      }
    );
  };

  // Complete flow
  const handleSubmit = async () => {
    if (!file) {
      alert('Please select a file');
      return;
    }

    if (!googleAccessToken) {
      alert('Please connect to Google Drive first');
      return;
    }

    setUploading(true);

    try {
      // Upload to Google Drive
      const fileId = await uploadToGoogleDrive(file);
      console.log('File uploaded to Drive:', fileId);

      // Submit to LMS
      await submitHomework(fileId);
      
      setSubmitted(true);
      alert('Homework submitted successfully!');
    } catch (error) {
      console.error('Upload failed:', error);
      alert('Failed to submit homework');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="homework-upload">
      <h2>Submit Homework</h2>

      {!googleAccessToken ? (
        <div>
          <p>First, connect your Google Drive account:</p>
          <button onClick={connectGoogleDrive} className="btn-primary">
            🔗 Connect Google Drive
          </button>
        </div>
      ) : (
        <div>
          <p>✅ Google Drive connected</p>
          
          <input
            type="file"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
          />

          {file && (
            <div>
              <p>Selected: {file.name}</p>
              <button
                onClick={handleSubmit}
                disabled={uploading || submitted}
                className="btn-success"
              >
                {uploading ? 'Uploading...' : 'Submit Homework'}
              </button>
            </div>
          )}

          {submitted && (
            <div className="success-message">
              ✅ Homework submitted successfully!
            </div>
          )}
        </div>
      )}
    </div>
  );
};
```

---

## 🧪 Testing

### 1. Test OAuth Flow

```bash
# Start backend
npm run start:dev

# Open browser (while logged into LMS)
https://lmsapi.suraksha.lk/auth/google

# You should be redirected to Google consent screen
```

### 2. Test File Upload (Frontend)

```javascript
// Test file upload to Google Drive
const testUpload = async () => {
  const file = new File(['test content'], 'test.txt', { type: 'text/plain' });
  const accessToken = 'ya29.a0...'; // From OAuth callback
  
  const fileId = await uploadToGoogleDrive(file, accessToken);
  console.log('File uploaded:', fileId);
};
```

### 3. Test Homework Submission

```bash
curl -X POST https://lmsapi.suraksha.lk/homework/submit \
  -H "Authorization: Bearer <LMS_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "subjectId": "123",
    "fileId": "1a2b3c4d5e6f7g8h9i0j",
    "accessToken": "ya29.a0...",
    "fileName": "test.pdf",
    "mimeType": "application/pdf"
  }'
```

---

## 🎯 User Flow (Step-by-Step)

1. **Student logs into LMS** → Gets JWT token
2. **Student navigates to homework page**
3. **Student clicks "Connect Google Drive"** → Redirected to `/auth/google`
4. **Backend redirects to Google OAuth consent screen**
5. **Student grants permissions** (drive.file scope)
6. **Google redirects to `/auth/google/callback?code=...`**
7. **Backend exchanges code for access token**
8. **Backend redirects to frontend with token** (URL fragment)
9. **Frontend extracts token from URL**
10. **Student selects file to upload**
11. **Frontend uploads file to Google Drive** (direct API call)
12. **Google Drive returns fileId**
13. **Frontend submits fileId to LMS** (`POST /homework/submit`)
14. **Backend validates fileId** (using access token)
15. **Backend stores metadata** (fileId, studentId, subjectId)
16. **Student sees confirmation** ✅

---

## 📊 Database Schema

```sql
CREATE TABLE homework_submissions (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  student_id BIGINT NOT NULL,
  subject_id BIGINT NOT NULL,
  drive_file_id VARCHAR(255) NOT NULL COMMENT 'Google Drive file ID',
  file_name VARCHAR(500),
  mime_type VARCHAR(100),
  file_size BIGINT COMMENT 'File size in bytes',
  submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  INDEX idx_student_id (student_id),
  INDEX idx_subject_id (subject_id),
  INDEX idx_drive_file_id (drive_file_id),
  INDEX idx_student_subject (student_id, subject_id)
);
```

**IMPORTANT:** No `access_token` column - tokens are NEVER stored!

---

## 🔒 Security Considerations

### Token Handling
- ✅ Access tokens passed temporarily for validation only
- ✅ Tokens expire in 1 hour (Google default)
- ✅ No refresh tokens requested
- ✅ Frontend stores token in memory (not localStorage for production)

### File Permissions
- ✅ Students retain full ownership of files
- ✅ LMS can only access files student explicitly uploads via app
- ✅ Backend never downloads file content
- ✅ Teachers view files via Google Drive shareable links

### API Security
- ✅ All endpoints require JWT authentication
- ✅ Students can only submit their own homework
- ✅ FileId validation before storing
- ✅ Rate limiting recommended

---

## ❓ FAQ

**Q: Where are the files stored?**  
A: Files are stored in the **student's own Google Drive**, not on the LMS servers.

**Q: Can teachers access the files?**  
A: Teachers access files via Google Drive shareable links. Students should ensure files are shared appropriately.

**Q: What happens when the access token expires?**  
A: Students need to reconnect Google Drive (repeat OAuth flow). Token expires in 1 hour.

**Q: Can students delete submissions?**  
A: Yes, students can delete submission records in LMS. Files remain in their Google Drive.

**Q: Is this GDPR compliant?**  
A: Yes - files stay in student's Google account. LMS only stores metadata (fileId).

---

## 📚 References

- [Google OAuth 2.0 Documentation](https://developers.google.com/identity/protocols/oauth2)
- [Google Drive API v3](https://developers.google.com/drive/api/v3/about-sdk)
- [Google Drive File Scopes](https://developers.google.com/drive/api/guides/api-specific-auth)

---

**Document Version:** 1.0  
**Last Updated:** January 22, 2026  
**Status:** Production Ready ✅
