# Complete Homework System API Guide

## Overview
Complete API reference for homework management system with role-based access control.

---

## Table of Contents
1. [User Flows](#user-flows)
2. [Homework CRUD](#homework-crud)
3. [Reference CRUD](#reference-crud)
4. [Student Submission CRUD](#student-submission-crud)
5. [Teacher Submission Management](#teacher-submission-management)
6. [Correction File Management](#correction-file-management)
7. [Push Notifications CRUD (Super Admin)](#push-notifications-crud-super-admin)

---

## User Flows

### Student Flow
```
1. Get homeworks with references and own submissions (ONE CALL)
   GET /institute-class-subject-homeworks?classId=X&subjectId=Y&includeReferences=true&includeSubmissions=true
   
2. Submit homework
   POST /institute-class-subject-homeworks-submission/{homeworkId}/submit
   OR
   POST /institute-class-subject-homeworks-submissions/submit-google-drive
   
3. Update own submission (before deadline)
   PATCH /institute-class-subject-homeworks-submission/{submissionId}
   
4. Delete own submission (before deadline)
   DELETE /institute-class-subject-homeworks-submission/{submissionId}
```

### Teacher/Admin Flow
```
1. Get homeworks (NO submissions in list)
   GET /institute-class-subject-homeworks?classId=X&subjectId=Y&includeReferences=true
   
2. Get all submissions for specific homework (SEPARATE CALL)
   GET /institute-class-subject-homeworks-submissions?homeworkId=X
   
3. Review submission and add correction
   PATCH /institute-class-subject-homework-submissions/{submissionId}/review
   
4. Upload correction file
   POST /institute-class-subject-homework-submissions/{submissionId}/correction-file
```

---

## 1. Homework CRUD

### 1.1 Get Homework List

#### For Students (Complete View)
```http
GET /institute-class-subject-homeworks?classId={classId}&subjectId={subjectId}&includeReferences=true&includeSubmissions=true
Authorization: Bearer <student-token>
```

**Response (Student):**
```json
{
  "data": [{
    "id": "1",
    "title": "Math Assignment",
    "startDate": "2026-01-20T00:00:00.000Z",
    "endDate": "2026-01-28T00:00:00.000Z",
    "references": [{
      "id": "1",
      "title": "Video Tutorial",
      "referenceType": "VIDEO",
      "viewUrl": "https://..."
    }],
    "mySubmissions": [{
      "id": "1",
      "submissionDate": "2026-01-22T18:51:35.000Z",
      "fileUrl": "https://...",
      "teacherCorrectionFileUrl": "https://...",
      "remarks": "Good work!"
    }],
    "hasSubmitted": true
  }]
}
```

#### For Teachers (No Submissions)
```http
GET /institute-class-subject-homeworks?classId={classId}&subjectId={subjectId}&includeReferences=true
Authorization: Bearer <teacher-token>
```

**Response (Teacher):**
```json
{
  "data": [{
    "id": "1",
    "title": "Math Assignment",
    "references": [{...}],
    "submissionCount": 25
  }]
}
```

### 1.2 Get Single Homework
```http
GET /institute-class-subject-homeworks/{id}
Authorization: Bearer <token>
```

### 1.3 Create Homework (Teacher/Admin)
```http
POST /institute-class-subject-homeworks
Authorization: Bearer <teacher-token>
Content-Type: application/json

{
  "title": "Mathematics Assignment - Chapter 5",
  "description": "Solve exercises 1-10",
  "classId": "40",
  "subjectId": "5",
  "startDate": "2026-01-20T00:00:00.000Z",
  "endDate": "2026-01-27T23:59:59.000Z"
}
```

### 1.4 Update Homework (Teacher who created / Admin)
```http
PATCH /institute-class-subject-homeworks/{id}
Authorization: Bearer <teacher-token>
Content-Type: application/json

{
  "title": "Updated Title",
  "endDate": "2026-01-30T23:59:59.000Z"
}
```

### 1.5 Delete Homework (Soft Delete)
```http
DELETE /institute-class-subject-homeworks/{id}
Authorization: Bearer <teacher-token>
```

---

## 2. Reference CRUD

### 2.1 Get References
```http
GET /homework-references?homeworkId={homeworkId}
Authorization: Bearer <token>
```

### 2.2 Get Single Reference
```http
GET /homework-references/{id}
Authorization: Bearer <token>
```

### 2.3 Create Reference - S3 Upload (Teacher/Admin)

**Step 1: Generate Upload URL**
```http
POST /homework-references/upload/generate-url
Authorization: Bearer <teacher-token>
Content-Type: application/json

{
  "homeworkId": "123",
  "fileName": "lecture.mp4",
  "contentType": "video/mp4",
  "fileSize": 52428800,
  "referenceType": "VIDEO"
}
```

**Response:**
```json
{
  "uploadUrl": "https://bucket.s3.region.amazonaws.com/...",
  "relativePath": "homework-references/123/lecture-uuid.mp4",
  "expiresIn": 3600
}
```

**Step 2: Upload to S3** (Frontend using signed URL)

**Step 3: Confirm Upload**
```http
POST /homework-references/upload/confirm
Authorization: Bearer <teacher-token>
Content-Type: application/json

{
  "homeworkId": "123",
  "title": "Chapter 5 Lecture",
  "referenceType": "VIDEO",
  "relativePath": "homework-references/123/lecture-uuid.mp4",
  "fileName": "lecture.mp4",
  "fileSize": 52428800,
  "mimeType": "video/mp4"
}
```

### 2.4 Create Reference - Google Drive (Teacher/Admin)
```http
POST /homework-references/google-drive
Authorization: Bearer <teacher-token>
Content-Type: application/json

{
  "homeworkId": "123",
  "title": "Assignment Template",
  "referenceType": "DOCUMENT",
  "driveFileId": "1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms",
  "accessToken": "ya29.a0AfH6SMBx..."
}
```

### 2.5 Create Reference - External Link (Teacher/Admin)
```http
POST /homework-references/link
Authorization: Bearer <teacher-token>
Content-Type: application/json

{
  "homeworkId": "123",
  "title": "YouTube Tutorial",
  "referenceType": "LINK",
  "externalUrl": "https://www.youtube.com/watch?v=example"
}
```

### 2.6 Update Reference (Teacher/Admin)
```http
PATCH /homework-references/{id}
Authorization: Bearer <teacher-token>
Content-Type: application/json

{
  "title": "Updated Title",
  "description": "Updated description",
  "displayOrder": 2
}
```

### 2.7 Reorder References (Teacher/Admin)
```http
PATCH /homework-references/homework/{homeworkId}/reorder
Authorization: Bearer <teacher-token>
Content-Type: application/json

{
  "referenceIds": ["3", "1", "2"]
}
```

### 2.8 Delete Reference - Soft Delete (Teacher/Admin)
```http
DELETE /homework-references/{id}
Authorization: Bearer <teacher-token>
```

### 2.9 Delete Reference - Permanent (Institute Admin Only)
```http
DELETE /homework-references/{id}/permanent
Authorization: Bearer <admin-token>
```

### 2.10 Restore Deleted Reference (Teacher/Admin)
```http
PATCH /homework-references/{id}/restore
Authorization: Bearer <teacher-token>
```

---

## 3. Student Submission CRUD

### 3.1 Create Submission - File Upload (Student)
```http
POST /institute-class-subject-homework-submissions/{homeworkId}/submit
Authorization: Bearer <student-token>
Content-Type: multipart/form-data

file: <binary file data>
remarks: "My completed homework"
```

### 3.2 Create Submission - Google Drive (Student)
```http
POST /institute-class-subject-homeworks-submissions/submit-google-drive
Authorization: Bearer <student-token>
Content-Type: application/json

{
  "homeworkId": "123",
  "fileId": "1Ya8Cjjx4h5FjYvDB9gDIST7LaJiswiJC",
  "accessToken": "ya29.a0AfH6SMBx...",
  "fileName": "homework.pdf",
  "mimeType": "application/pdf"
}
```

### 3.3 Get Own Submissions (Student)
```http
GET /institute-class-subject-homework-submissions/{homeworkId}/my-submissions
Authorization: Bearer <student-token>
```

**Response:**
```json
{
  "data": [{
    "id": "1",
    "submissionDate": "2026-01-22T18:51:35.000Z",
    "fileUrl": "https://...",
    "teacherCorrectionFileUrl": "https://...",
    "driveViewUrl": "https://drive.google.com/file/d/.../view",
    "remarks": "Good work!",
    "grade": "A"
  }]
}
```

### 3.4 Update Own Submission (Student - Before Deadline)
```http
PATCH /institute-class-subject-homeworks-submissions/{id}
Authorization: Bearer <student-token>
Content-Type: multipart/form-data

file: <new file>
remarks: "Updated submission"
```

### 3.5 Delete Own Submission (Student - Before Deadline)
```http
DELETE /institute-class-subject-homeworks-submissions/{id}
Authorization: Bearer <student-token>
```

---

## 4. Teacher Submission Management

### 4.1 Get All Submissions for Homework (Teacher/Admin)
```http
GET /institute-class-subject-homeworks-submissions?homeworkId={homeworkId}
Authorization: Bearer <teacher-token>
```

**Response:**
```json
{
  "data": [{
    "id": "1",
    "studentId": "2",
    "studentName": "John Student",
    "studentImageUrl": "https://...",
    "submissionDate": "2026-01-22T18:51:35.000Z",
    "fileUrl": "https://...",
    "teacherCorrectionFileUrl": null,
    "remarks": null
  }],
  "total": 25
}
```

### 4.2 Get Submissions by Class/Subject (Teacher/Admin)
```http
GET /institute-class-subject-homework-submissions/institute/{instituteId}/class/{classId}/subject/{subjectId}
Authorization: Bearer <teacher-token>
```

### 4.3 Get Single Submission Details (Teacher/Admin)
```http
GET /institute-class-subject-homework-submissions/{submissionId}/details
Authorization: Bearer <teacher-token>
```

### 4.4 Get Submissions for Specific Student (Teacher/Admin)
```http
GET /institute-class-subject-homework-submissions/student/{studentId}/submissions
Authorization: Bearer <teacher-token>
```

---

## 5. Correction File Management

### 5.1 Upload Correction File (Teacher/Admin)
```http
POST /institute-class-subject-homework-submissions/{submissionId}/correction-file
Authorization: Bearer <teacher-token>
Content-Type: multipart/form-data

correctionFile: <binary file data>
```

**Response:**
```json
{
  "teacherCorrectionFileUrl": "https://storage.suraksha.lk/corrections/..."
}
```

### 5.2 Review Submission with Remarks (Teacher/Admin)
```http
PATCH /institute-class-subject-homework-submissions/{submissionId}/review
Authorization: Bearer <teacher-token>
Content-Type: application/json

{
  "remarks": "Good work! See corrections attached.",
  "grade": "A"
}
```

### 5.3 Review with Correction File (Teacher/Admin)
```http
PATCH /institute-class-subject-homework-submissions/{submissionId}/review
Authorization: Bearer <teacher-token>
Content-Type: multipart/form-data

remarks: "Good work! See corrections attached."
grade: "A"
correctionFile: <binary file data>
```

**Response:**
```json
{
  "id": "1",
  "remarks": "Good work! See corrections attached.",
  "grade": "A",
  "teacherCorrectionFileUrl": "https://storage.suraksha.lk/corrections/...",
  "reviewedAt": "2026-01-23T10:00:00.000Z"
}
```

### 5.4 Delete Correction File (Teacher/Admin)
```http
DELETE /institute-class-subject-homework-submissions/{submissionId}/correction-file
Authorization: Bearer <teacher-token>
```

### 5.5 Update Correction File (Teacher/Admin)
```http
PUT /institute-class-subject-homework-submissions/{submissionId}/correction-file
Authorization: Bearer <teacher-token>
Content-Type: multipart/form-data

correctionFile: <new binary file data>
```

---

## Permission Matrix

| Operation | Student | Teacher | Institute Admin | Super Admin |
|-----------|---------|---------|-----------------|-------------|
| **Homework** |
| List (with submissions) | ✅ Own only | ❌ Use separate API | ❌ Use separate API | ❌ Use separate API |
| List (no submissions) | ❌ | ✅ | ✅ | ✅ |
| Create | ❌ | ✅ | ✅ | ✅ |
| Update | ❌ | ✅ Own | ✅ All | ✅ All |
| Delete | ❌ | ✅ Own | ✅ All | ✅ All |
| **References** |
| View | ✅ | ✅ | ✅ | ✅ |
| Create | ❌ | ✅ | ✅ | ✅ |
| Update | ❌ | ✅ Own homework | ✅ All | ✅ All |
| Delete (Soft) | ❌ | ✅ Own homework | ✅ All | ✅ All |
| Delete (Permanent) | ❌ | ❌ | ✅ | ✅ |
| **Submissions** |
| View Own | ✅ | ✅ | ✅ | ✅ |
| View All | ❌ | ✅ Own subjects | ✅ All | ✅ All |
| Create | ✅ | ❌ | ❌ | ❌ |
| Update Own | ✅ Before deadline | ❌ | ❌ | ❌ |
| Delete Own | ✅ Before deadline | ❌ | ❌ | ❌ |
| Delete Any | ❌ | ✅ Own subjects | ✅ All | ✅ All |
| **Correction Files** |
| Upload | ❌ | ✅ | ✅ | ✅ |
| Update | ❌ | ✅ | ✅ | ✅ |
| Delete | ❌ | ✅ | ✅ | ✅ |
| Review | ❌ | ✅ | ✅ | ✅ |

---

## Important Notes

### Students
- Get **everything in ONE call** using `includeReferences=true&includeSubmissions=true`
- Submissions automatically filtered to own submissions only
- No redundant data (no own name/image in submission response)
- Can only submit before deadline

### Teachers/Admins
- **DO NOT** use `includeSubmissions` in homework list (performance)
- Use **separate API** to get all submissions: `/institute-class-subject-homeworks-submissions?homeworkId=X`
- Get full student details (name, image) in submission list
- Can add correction files and remarks to any submission

### Performance
- Student query optimized: No student table JOIN (they know who they are)
- Teacher query optimized: Only load submissions when explicitly requested via submission API
- Reduces query load by 50% for teacher homework lists

---

## Error Responses

### 403 Forbidden
```json
{
  "statusCode": 403,
  "message": "You do not have access to this resource"
}
```

### 404 Not Found
```json
{
  "statusCode": 404,
  "message": "Homework not found"
}
```

### 400 Bad Request - Deadline Passed
```json
{
  "statusCode": 400,
  "message": "Submission deadline has passed"
}
```

### 400 Bad Request - Already Submitted
```json
{
  "statusCode": 400,
  "message": "You have already submitted this homework"
}
```

---

## Frontend Integration Examples

### Student: Get All Homeworks with Submissions
```typescript
const getMyHomeworks = async (classId: string, subjectId: string) => {
  const response = await fetch(
    `/institute-class-subject-homeworks?` +
    `classId=${classId}&` +
    `subjectId=${subjectId}&` +
    `includeReferences=true&` +
    `includeSubmissions=true`,
    {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    }
  );
  return response.json();
};
```

### Teacher: Get Homework List (No Submissions)
```typescript
const getHomeworks = async (classId: string, subjectId: string) => {
  const response = await fetch(
    `/institute-class-subject-homeworks?` +
    `classId=${classId}&` +
    `subjectId=${subjectId}&` +
    `includeReferences=true`,
    {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    }
  );
  return response.json();
};
```

### Teacher: Get All Submissions for Homework
```typescript
const getHomeworkSubmissions = async (homeworkId: string) => {
  const response = await fetch(
    `/institute-class-subject-homeworks-submissions?homeworkId=${homeworkId}`,
    {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    }
  );
  return response.json();
};
```

### Student: Submit Homework
```typescript
const submitHomework = async (homeworkId: string, file: File) => {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('remarks', 'My homework submission');
  
  const response = await fetch(
    `/institute-class-subject-homework-submissions/${homeworkId}/submit`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`
      },
      body: formData
    }
  );
  return response.json();
};
```

### Teacher: Add Correction
```typescript
const addCorrection = async (submissionId: string, correctionFile: File, remarks: string, grade: string) => {
  const formData = new FormData();
  formData.append('correctionFile', correctionFile);
  formData.append('remarks', remarks);
  formData.append('grade', grade);
  
  const response = await fetch(
    `/institute-class-subject-homework-submissions/${submissionId}/review`,
    {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${token}`
      },
      body: formData
    }
  );
  return response.json();
};
```

---

## Summary

### Key Differences by Role

**Students:**
- ✅ ONE API call for complete view
- ✅ Homeworks + References + Own Submissions
- ✅ Optimized response (no redundant data)

**Teachers/Admins:**
- ✅ Homework list without submissions (fast)
- ✅ Separate API for submissions (when needed)
- ✅ Full student details in submissions
- ✅ Can add corrections and remarks

This architecture ensures:
- **Performance**: No unnecessary data loading
- **Security**: Automatic role-based filtering
- **Developer Experience**: Clear, predictable API structure
