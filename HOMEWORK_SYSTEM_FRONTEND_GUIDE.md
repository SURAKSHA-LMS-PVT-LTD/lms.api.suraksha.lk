# Homework System - Complete Frontend Implementation Guide

## Table of Contents
1. [System Overview](#system-overview)
2. [Authentication & Authorization](#authentication--authorization)
3. [API Endpoints](#api-endpoints)
4. [Student Features](#student-features)
5. [Teacher/Admin Features](#teacheradmin-features)
6. [Implementation Examples](#implementation-examples)
7. [Security & Permissions](#security--permissions)
8. [Error Handling](#error-handling)

---

## System Overview

The homework system consists of three main components:
- **Homeworks**: Assignments created by teachers
- **References**: Study materials attached to homeworks (PDFs, videos, links, etc.)
- **Submissions**: Student work submitted for homeworks

### Key Features
- ✅ Students can view homeworks, submit work, update their submissions, and delete their submissions
- ✅ Teachers/Admins can create homeworks, add references, review submissions, add remarks and corrections
- ✅ Complete permission system ensuring users can only modify their own data
- ✅ Support for file uploads and Google Drive integration
- ✅ Full homework details with submissions and references in single API call

---

## Authentication & Authorization

### JWT Token Structure
All API calls require a Bearer token in the Authorization header:
```
Authorization: Bearer <jwt_token>
```

### JWT Payload Structure (v2)
```typescript
{
  sub: "123",           // User ID
  s: "123",            // User ID (alternative)
  t: "STUDENT",        // User type
  i: [                 // Institute access array
    {
      i: "1",          // Institute ID
      r: 1,            // Role bitmask (1=Student, 2=Teacher, 4=Admin)
      c: [             // Class-Subject access
        ["2", 3]       // [classId, subjectBitmask]
      ]
    }
  ]
}
```

### Role Bitmasks
```typescript
const ROLE_BITMASKS = {
  STUDENT: 1,
  TEACHER: 2,
  INSTITUTE_ADMIN: 4
};
```

---

## API Endpoints

### Base URL
```
https://your-api-domain.com
```

### 1. Get User Homeworks with Submissions and References

**Endpoint:**
```
GET /institute-class-subject-homeworks/user/:userId
```

**Description:** Retrieves all homeworks for a specific institute/class/subject with the user's submissions and reference materials.

**Security:** 
- ✅ JWT token must match the requested userId
- ✅ User must have access to the specified institute/class/subject

**Query Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| instituteId | string | Yes | Institute ID |
| classId | string | Yes | Class ID |
| subjectId | string | Yes | Subject ID |
| page | number | No | Page number (default: 1) |
| limit | number | No | Items per page (default: 20) |

**Example Request:**
```typescript
const userId = "123"; // From JWT token
const response = await fetch(
  `/institute-class-subject-homeworks/user/${userId}?instituteId=1&classId=2&subjectId=3&page=1&limit=20`,
  {
    headers: {
      'Authorization': `Bearer ${jwtToken}`,
      'Content-Type': 'application/json'
    }
  }
);
```

**Example Response:**
```json
{
  "data": [
    {
      "id": "123",
      "instituteId": "1",
      "classId": "2",
      "subjectId": "3",
      "teacherId": "4",
      "title": "Essay Assignment - Climate Change",
      "description": "Write a 1000-word essay about climate change impacts",
      "startDate": "2024-01-10T00:00:00Z",
      "endDate": "2024-01-20T23:59:59Z",
      "referenceLink": "https://example.com/additional-resources",
      "isActive": true,
      "createdAt": "2024-01-05T10:00:00Z",
      "updatedAt": "2024-01-05T10:00:00Z",
      "teacher": {
        "id": "4",
        "nameWithInitials": "Mr. J. Silva",
        "email": "teacher@school.com",
        "imageUrl": "https://storage.googleapis.com/.../teacher.jpg"
      },
      "mySubmissions": [
        {
          "id": "456",
          "submissionDate": "2024-01-15T10:30:00Z",
          "fileUrl": "https://storage.googleapis.com/.../submission.pdf",
          "teacherCorrectionFileUrl": "https://storage.googleapis.com/.../correction.pdf",
          "driveFileId": null,
          "driveFileName": null,
          "driveMimeType": null,
          "submissionType": "UPLOAD",
          "remarks": "Good work! But please improve the conclusion section.",
          "isActive": true
        }
      ],
      "references": [
        {
          "id": "789",
          "title": "Climate Change Research Paper",
          "description": "Essential reading for the assignment",
          "fileUrl": "https://storage.googleapis.com/.../reference.pdf",
          "driveFileId": "1abc...xyz",
          "driveFileName": "climate_research.pdf",
          "driveMimeType": "application/pdf",
          "referenceType": "PDF",
          "referenceSource": "GOOGLE_DRIVE",
          "displayOrder": 1,
          "isActive": true
        },
        {
          "id": "790",
          "title": "Documentary Video",
          "description": "Watch this before starting",
          "fileUrl": "https://www.youtube.com/watch?v=example",
          "driveFileId": null,
          "driveFileName": null,
          "driveMimeType": null,
          "referenceType": "LINK",
          "referenceSource": "MANUAL_LINK",
          "displayOrder": 2,
          "isActive": true
        }
      ]
    }
  ],
  "page": 1,
  "limit": 20,
  "total": 1,
  "totalPages": 1
}
```

---

## Student Features

### 1. View Homework List

Use the main endpoint to get all homeworks with your submissions:

```typescript
async function getMyHomeworks(instituteId: string, classId: string, subjectId: string) {
  const userId = getUserIdFromJWT(); // Extract from JWT token
  
  try {
    const response = await fetch(
      `/institute-class-subject-homeworks/user/${userId}?instituteId=${instituteId}&classId=${classId}&subjectId=${subjectId}`,
      {
        headers: {
          'Authorization': `Bearer ${getJWTToken()}`,
          'Content-Type': 'application/json'
        }
      }
    );
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error fetching homeworks:', error);
    throw error;
  }
}
```

### 2. Submit Homework

**Endpoint:**
```
POST /institute-class-subject-homework-submissions/:homeworkId/submit
```

**Request Body:**
```json
{
  "fileUrl": "https://storage.googleapis.com/.../submission.pdf"
}
```

**Example:**
```typescript
async function submitHomework(homeworkId: string, fileUrl: string) {
  try {
    const response = await fetch(
      `/institute-class-subject-homework-submissions/${homeworkId}/submit`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${getJWTToken()}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ fileUrl })
      }
    );
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error('Error submitting homework:', error);
    throw error;
  }
}
```

### 3. Update Own Submission

**Endpoint:**
```
PATCH /institute-class-subject-homeworks-submissions/:submissionId
```

**Security:** 
- ✅ Students can ONLY update their own submission file
- ❌ Students CANNOT update teacher corrections or remarks

**Request Body:**
```json
{
  "fileUrl": "https://storage.googleapis.com/.../updated-submission.pdf"
}
```

**Example:**
```typescript
async function updateMySubmission(submissionId: string, newFileUrl: string) {
  try {
    const response = await fetch(
      `/institute-class-subject-homeworks-submissions/${submissionId}`,
      {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${getJWTToken()}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ fileUrl: newFileUrl })
      }
    );
    
    if (!response.ok) {
      if (response.status === 403) {
        throw new Error('You can only update your own submissions');
      }
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error('Error updating submission:', error);
    throw error;
  }
}
```

### 4. Delete Own Submission

**Endpoint:**
```
DELETE /institute-class-subject-homeworks-submissions/:submissionId
```

**Security:** 
- ✅ Students can ONLY delete their own submissions
- ✅ Teachers/Admins can delete any submission

**Example:**
```typescript
async function deleteMySubmission(submissionId: string) {
  try {
    const response = await fetch(
      `/institute-class-subject-homeworks-submissions/${submissionId}`,
      {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${getJWTToken()}`
        }
      }
    );
    
    if (!response.ok) {
      if (response.status === 403) {
        throw new Error('You can only delete your own submissions');
      }
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    console.log('Submission deleted successfully');
  } catch (error) {
    console.error('Error deleting submission:', error);
    throw error;
  }
}
```

---

## Teacher/Admin Features

### 1. Create Homework

**Endpoint:**
```
POST /institute-class-subject-homeworks
```

**Request Body:**
```json
{
  "instituteId": "1",
  "classId": "2",
  "subjectId": "3",
  "teacherId": "4",
  "title": "Essay Assignment",
  "description": "Write a 1000-word essay",
  "startDate": "2024-01-10T00:00:00Z",
  "endDate": "2024-01-20T23:59:59Z",
  "referenceLink": "https://example.com/resources",
  "isActive": true
}
```

**Example:**
```typescript
async function createHomework(homeworkData: HomeworkCreateDto) {
  try {
    const response = await fetch('/institute-class-subject-homeworks', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${getJWTToken()}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(homeworkData)
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error('Error creating homework:', error);
    throw error;
  }
}
```

### 2. Add Reference Material

**Endpoint:**
```
POST /homework-references
```

**Request Body (File Upload):**
```json
{
  "homeworkId": "123",
  "title": "Reference Material",
  "description": "Study this before assignment",
  "referenceType": "PDF",
  "referenceSource": "S3_UPLOAD",
  "fileUrl": "homework-references/file.pdf",
  "displayOrder": 1
}
```

**Request Body (Google Drive):**
```json
{
  "homeworkId": "123",
  "title": "Research Paper",
  "description": "Essential reading",
  "referenceType": "PDF",
  "referenceSource": "GOOGLE_DRIVE",
  "driveFileId": "1abc...xyz",
  "driveFileName": "research.pdf",
  "driveMimeType": "application/pdf",
  "displayOrder": 1
}
```

**Request Body (External Link):**
```json
{
  "homeworkId": "123",
  "title": "YouTube Video",
  "description": "Watch this tutorial",
  "referenceType": "LINK",
  "referenceSource": "MANUAL_LINK",
  "fileUrl": "https://www.youtube.com/watch?v=example",
  "displayOrder": 1
}
```

**Example:**
```typescript
async function addReference(referenceData: ReferenceCreateDto) {
  try {
    const response = await fetch('/homework-references', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${getJWTToken()}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(referenceData)
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error('Error adding reference:', error);
    throw error;
  }
}
```

### 3. Update Reference

**Endpoint:**
```
PATCH /homework-references/:referenceId
```

**Security:** 
- ✅ Only Teachers/Admins can update references
- ✅ Can update title, description, display order

**Request Body:**
```json
{
  "title": "Updated Title",
  "description": "Updated description",
  "displayOrder": 2
}
```

**Example:**
```typescript
async function updateReference(referenceId: string, updates: Partial<ReferenceDto>) {
  try {
    const response = await fetch(`/homework-references/${referenceId}`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${getJWTToken()}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(updates)
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error('Error updating reference:', error);
    throw error;
  }
}
```

### 4. Delete Reference

**Endpoint (Soft Delete):**
```
DELETE /homework-references/:referenceId
```

**Endpoint (Permanent Delete - Admin Only):**
```
DELETE /homework-references/:referenceId/permanent
```

**Example:**
```typescript
async function deleteReference(referenceId: string, permanent: boolean = false) {
  const endpoint = permanent 
    ? `/homework-references/${referenceId}/permanent`
    : `/homework-references/${referenceId}`;
  
  try {
    const response = await fetch(endpoint, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${getJWTToken()}`
      }
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    console.log('Reference deleted successfully');
  } catch (error) {
    console.error('Error deleting reference:', error);
    throw error;
  }
}
```

### 5. Review Student Submission

**Endpoint:**
```
PATCH /institute-class-subject-homework-submissions/:submissionId/review
```

**Security:** 
- ✅ Only Teachers/Admins can add corrections and remarks
- ✅ Students CANNOT modify these fields

**Request Body:**
```json
{
  "teacherCorrectionFileUrl": "https://storage.googleapis.com/.../correction.pdf",
  "remarks": "Good work! Please improve the conclusion section."
}
```

**Example:**
```typescript
async function reviewSubmission(
  submissionId: string, 
  correctionFileUrl: string, 
  remarks: string
) {
  try {
    const response = await fetch(
      `/institute-class-subject-homework-submissions/${submissionId}/review`,
      {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${getJWTToken()}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          teacherCorrectionFileUrl: correctionFileUrl,
          remarks: remarks
        })
      }
    );
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error('Error reviewing submission:', error);
    throw error;
  }
}
```

### 6. Update Submission (Teacher/Admin)

**Endpoint:**
```
PATCH /institute-class-subject-homeworks-submissions/:submissionId
```

**Security:** 
- ✅ Teachers/Admins can update correction files, remarks, and student files
- ✅ Students can only update their own submission file

**Request Body:**
```json
{
  "teacherCorrectionFileUrl": "https://storage.googleapis.com/.../correction.pdf",
  "remarks": "Updated remarks"
}
```

**Example:**
```typescript
async function updateSubmissionAsTeacher(
  submissionId: string,
  updates: {
    teacherCorrectionFileUrl?: string;
    remarks?: string;
    fileUrl?: string;
  }
) {
  try {
    const response = await fetch(
      `/institute-class-subject-homeworks-submissions/${submissionId}`,
      {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${getJWTToken()}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(updates)
      }
    );
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error('Error updating submission:', error);
    throw error;
  }
}
```

### 7. Delete Any Submission

**Endpoint:**
```
DELETE /institute-class-subject-homeworks-submissions/:submissionId
```

**Security:** 
- ✅ Teachers/Admins can delete any submission
- ✅ Students can only delete their own submissions

**Example:**
```typescript
async function deleteSubmissionAsTeacher(submissionId: string) {
  try {
    const response = await fetch(
      `/institute-class-subject-homeworks-submissions/${submissionId}`,
      {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${getJWTToken()}`
        }
      }
    );
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    console.log('Submission deleted successfully');
  } catch (error) {
    console.error('Error deleting submission:', error);
    throw error;
  }
}
```

---

## Implementation Examples

### React Component Example - Student Homework List

```typescript
import React, { useState, useEffect } from 'react';
import { getUserIdFromJWT, getJWTToken } from './auth';

interface Homework {
  id: string;
  title: string;
  description: string;
  startDate: string;
  endDate: string;
  teacher: {
    nameWithInitials: string;
    imageUrl: string;
  };
  mySubmissions: Submission[];
  references: Reference[];
}

interface Submission {
  id: string;
  submissionDate: string;
  fileUrl: string;
  teacherCorrectionFileUrl: string | null;
  remarks: string | null;
}

interface Reference {
  id: string;
  title: string;
  description: string;
  fileUrl: string;
  referenceType: string;
  displayOrder: number;
}

export const HomeworkListStudent: React.FC = () => {
  const [homeworks, setHomeworks] = useState<Homework[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const instituteId = "1"; // Get from context/props
  const classId = "2";     // Get from context/props
  const subjectId = "3";   // Get from context/props

  useEffect(() => {
    fetchHomeworks();
  }, []);

  const fetchHomeworks = async () => {
    try {
      setLoading(true);
      const userId = getUserIdFromJWT();
      
      const response = await fetch(
        `/institute-class-subject-homeworks/user/${userId}?instituteId=${instituteId}&classId=${classId}&subjectId=${subjectId}`,
        {
          headers: {
            'Authorization': `Bearer ${getJWTToken()}`,
            'Content-Type': 'application/json'
          }
        }
      );

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      setHomeworks(data.data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (homeworkId: string, fileUrl: string) => {
    try {
      const response = await fetch(
        `/institute-class-subject-homework-submissions/${homeworkId}/submit`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${getJWTToken()}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ fileUrl })
        }
      );

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      // Refresh the list
      fetchHomeworks();
      alert('Homework submitted successfully!');
    } catch (err) {
      alert(`Error: ${err.message}`);
    }
  };

  const handleUpdateSubmission = async (submissionId: string, newFileUrl: string) => {
    try {
      const response = await fetch(
        `/institute-class-subject-homeworks-submissions/${submissionId}`,
        {
          method: 'PATCH',
          headers: {
            'Authorization': `Bearer ${getJWTToken()}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ fileUrl: newFileUrl })
        }
      );

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      fetchHomeworks();
      alert('Submission updated successfully!');
    } catch (err) {
      alert(`Error: ${err.message}`);
    }
  };

  const handleDeleteSubmission = async (submissionId: string) => {
    if (!confirm('Are you sure you want to delete this submission?')) {
      return;
    }

    try {
      const response = await fetch(
        `/institute-class-subject-homeworks-submissions/${submissionId}`,
        {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${getJWTToken()}`
          }
        }
      );

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      fetchHomeworks();
      alert('Submission deleted successfully!');
    } catch (err) {
      alert(`Error: ${err.message}`);
    }
  };

  if (loading) return <div>Loading...</div>;
  if (error) return <div>Error: {error}</div>;

  return (
    <div className="homework-list">
      <h1>My Homeworks</h1>
      
      {homeworks.map((homework) => (
        <div key={homework.id} className="homework-card">
          <h2>{homework.title}</h2>
          <p>{homework.description}</p>
          
          <div className="teacher-info">
            <img src={homework.teacher.imageUrl} alt="Teacher" />
            <span>{homework.teacher.nameWithInitials}</span>
          </div>
          
          <div className="dates">
            <p>Start: {new Date(homework.startDate).toLocaleDateString()}</p>
            <p>Due: {new Date(homework.endDate).toLocaleDateString()}</p>
          </div>

          {/* Reference Materials */}
          {homework.references.length > 0 && (
            <div className="references">
              <h3>Reference Materials</h3>
              {homework.references.map((ref) => (
                <div key={ref.id} className="reference-item">
                  <a href={ref.fileUrl} target="_blank" rel="noopener noreferrer">
                    {ref.title} ({ref.referenceType})
                  </a>
                  <p>{ref.description}</p>
                </div>
              ))}
            </div>
          )}

          {/* My Submissions */}
          {homework.mySubmissions.length > 0 ? (
            <div className="my-submissions">
              <h3>My Submissions</h3>
              {homework.mySubmissions.map((submission) => (
                <div key={submission.id} className="submission-item">
                  <p>Submitted: {new Date(submission.submissionDate).toLocaleString()}</p>
                  <a href={submission.fileUrl} target="_blank" rel="noopener noreferrer">
                    View My Submission
                  </a>
                  
                  {submission.teacherCorrectionFileUrl && (
                    <a href={submission.teacherCorrectionFileUrl} target="_blank" rel="noopener noreferrer">
                      View Teacher Correction
                    </a>
                  )}
                  
                  {submission.remarks && (
                    <div className="teacher-remarks">
                      <strong>Teacher Remarks:</strong>
                      <p>{submission.remarks}</p>
                    </div>
                  )}
                  
                  <button onClick={() => handleUpdateSubmission(submission.id, 'new-file-url')}>
                    Update Submission
                  </button>
                  <button onClick={() => handleDeleteSubmission(submission.id)}>
                    Delete Submission
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <button onClick={() => handleSubmit(homework.id, 'file-url')}>
              Submit Homework
            </button>
          )}
        </div>
      ))}
    </div>
  );
};
```

### React Component Example - Teacher Review Page

```typescript
import React, { useState, useEffect } from 'react';
import { getUserIdFromJWT, getJWTToken } from './auth';

interface HomeworkWithSubmissions {
  id: string;
  title: string;
  submissions: StudentSubmission[];
}

interface StudentSubmission {
  id: string;
  studentName: string;
  studentEmail: string;
  submissionDate: string;
  fileUrl: string;
  teacherCorrectionFileUrl: string | null;
  remarks: string | null;
}

export const TeacherReviewPage: React.FC = () => {
  const [homework, setHomework] = useState<HomeworkWithSubmissions | null>(null);
  const [selectedSubmission, setSelectedSubmission] = useState<string | null>(null);
  const [remarks, setRemarks] = useState('');
  const [correctionFile, setCorrectionFile] = useState<string>('');

  const handleReviewSubmission = async (submissionId: string) => {
    try {
      const response = await fetch(
        `/institute-class-subject-homeworks-submissions/${submissionId}`,
        {
          method: 'PATCH',
          headers: {
            'Authorization': `Bearer ${getJWTToken()}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            teacherCorrectionFileUrl: correctionFile,
            remarks: remarks
          })
        }
      );

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      alert('Review submitted successfully!');
      setSelectedSubmission(null);
      setRemarks('');
      setCorrectionFile('');
      
      // Refresh data
      // fetchHomeworkDetails();
    } catch (err) {
      alert(`Error: ${err.message}`);
    }
  };

  const handleDeleteSubmission = async (submissionId: string) => {
    if (!confirm('Are you sure you want to delete this submission?')) {
      return;
    }

    try {
      const response = await fetch(
        `/institute-class-subject-homeworks-submissions/${submissionId}`,
        {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${getJWTToken()}`
          }
        }
      );

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      alert('Submission deleted successfully!');
      // fetchHomeworkDetails();
    } catch (err) {
      alert(`Error: ${err.message}`);
    }
  };

  return (
    <div className="teacher-review-page">
      <h1>Review Student Submissions</h1>
      
      {/* Submission list and review form */}
      {/* Implementation details... */}
    </div>
  );
};
```

---

## Security & Permissions

### Permission Matrix

| Action | Student (Own) | Student (Others) | Teacher | Admin |
|--------|---------------|------------------|---------|-------|
| View homeworks | ✅ | ❌ | ✅ | ✅ |
| Create homework | ❌ | ❌ | ✅ | ✅ |
| Update homework | ❌ | ❌ | ✅ | ✅ |
| Delete homework | ❌ | ❌ | ✅ | ✅ |
| Add reference | ❌ | ❌ | ✅ | ✅ |
| Update reference | ❌ | ❌ | ✅ | ✅ |
| Delete reference | ❌ | ❌ | ✅ (soft) | ✅ (hard) |
| Submit homework | ✅ | ❌ | ❌ | ❌ |
| Update submission file | ✅ | ❌ | ✅ | ✅ |
| Update correction/remarks | ❌ | ❌ | ✅ | ✅ |
| Delete submission | ✅ | ❌ | ✅ | ✅ |
| View own submissions | ✅ | ❌ | ✅ | ✅ |
| View all submissions | ❌ | ❌ | ✅ | ✅ |

### Security Best Practices

1. **Always validate JWT token on backend**
   - Token must contain valid user ID
   - Token must match requested userId for personal data

2. **Never trust frontend validation**
   - All permission checks happen on backend
   - Frontend can hide UI elements but backend enforces rules

3. **Use proper error handling**
   - 401: Unauthorized (no/invalid token)
   - 403: Forbidden (valid token but no permission)
   - 404: Not found
   - 400: Bad request

4. **Validate user access**
   - Check institute/class/subject access from JWT
   - Verify user belongs to requested resources

---

## Error Handling

### Common Error Responses

#### 401 Unauthorized
```json
{
  "statusCode": 401,
  "message": "Unauthorized",
  "error": "Unauthorized"
}
```

**Frontend Handling:**
```typescript
if (response.status === 401) {
  // Redirect to login
  window.location.href = '/login';
}
```

#### 403 Forbidden
```json
{
  "statusCode": 403,
  "message": "You can only update your own submissions",
  "error": "Forbidden"
}
```

**Frontend Handling:**
```typescript
if (response.status === 403) {
  alert('You do not have permission to perform this action');
}
```

#### 404 Not Found
```json
{
  "statusCode": 404,
  "message": "Homework submission with ID 123 not found",
  "error": "Not Found"
}
```

**Frontend Handling:**
```typescript
if (response.status === 404) {
  alert('Resource not found. It may have been deleted.');
  // Refresh list or navigate away
}
```

#### 400 Bad Request
```json
{
  "statusCode": 400,
  "message": [
    "fileUrl must be a string",
    "fileUrl should not be empty"
  ],
  "error": "Bad Request"
}
```

**Frontend Handling:**
```typescript
if (response.status === 400) {
  const errorData = await response.json();
  const errors = Array.isArray(errorData.message) 
    ? errorData.message.join(', ') 
    : errorData.message;
  alert(`Validation error: ${errors}`);
}
```

### Error Handling Utility

```typescript
export async function handleAPIResponse(response: Response) {
  if (response.ok) {
    return await response.json();
  }

  const errorData = await response.json().catch(() => ({}));
  
  switch (response.status) {
    case 401:
      // Redirect to login
      window.location.href = '/login';
      throw new Error('Session expired. Please login again.');
      
    case 403:
      throw new Error(errorData.message || 'You do not have permission to perform this action');
      
    case 404:
      throw new Error(errorData.message || 'Resource not found');
      
    case 400:
      const errors = Array.isArray(errorData.message) 
        ? errorData.message.join(', ') 
        : errorData.message || 'Invalid request';
      throw new Error(errors);
      
    default:
      throw new Error(errorData.message || 'An unexpected error occurred');
  }
}

// Usage
try {
  const response = await fetch('/api/endpoint', options);
  const data = await handleAPIResponse(response);
  // Handle success
} catch (error) {
  alert(error.message);
}
```

---

## Summary

### Key Points to Remember

1. **Single API Call for Complete Data**
   - Use `/institute-class-subject-homeworks/user/:userId` to get all homeworks with submissions and references
   - Reduces network calls and improves performance

2. **Permission System**
   - Students can only modify their own submissions (file only)
   - Teachers/Admins can modify references, corrections, and remarks
   - Backend enforces all permission checks

3. **Security**
   - JWT token must match requested userId
   - All actions require proper authentication
   - Role-based access control via JWT payload

4. **Best Practices**
   - Always handle errors gracefully
   - Show loading states during API calls
   - Confirm before deleting
   - Refresh data after modifications
   - Use TypeScript interfaces for type safety

5. **File Handling**
   - Upload files first, then submit URLs
   - Support both S3 uploads and Google Drive
   - Validate file types on frontend and backend

---

## Support & Contact

For API issues or questions:
- Backend Team: backend@school.com
- Documentation: https://api-docs.school.com
- Support: support@school.com

---

**Last Updated:** January 29, 2026  
**API Version:** 2.0  
**Document Version:** 1.0
