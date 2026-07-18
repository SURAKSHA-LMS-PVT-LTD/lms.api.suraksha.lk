# Structured Lectures API - Complete Documentation

## 📚 Overview

The Structured Lectures module enables **Institute Admins** and **Teachers** to create and manage **free lectures** for their institutes. This system provides a centralized content library that can be shared across subjects, grades, and lessons.

## 🎯 Key Features

- ✅ **Free Lectures**: Create lectures not tied to specific class schedules
- ✅ **Role-Based Access**: Institute Admins & Teachers can create/manage
- ✅ **Hierarchical Organization**: Subject → Grade → Lesson → Lecture
- ✅ **Rich Content**: Videos, documents, cover images
- ✅ **Cloud Storage**: Integrated Google Cloud Storage with signed URLs
- ✅ **Student Access**: Students can view lectures based on their enrollment

---

## 🔐 Authentication & Authorization

All endpoints require JWT authentication.

### **Access Levels**

| Role | Create | Update | Delete | View All | View Own |
|------|--------|--------|--------|----------|----------|
| **SUPERADMIN** | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Institute Admin** | ✅ | ✅ | ✅ | ✅ Institute | ✅ |
| **Teacher** | ✅ | ✅ | ✅ | ✅ Own | ✅ |
| **Student** | ❌ | ❌ | ❌ | ❌ | ✅ Enrolled |

---

## 📋 API Endpoints

### Base URL
```
/api/structured-lectures
```

---

## 1️⃣ Create Lecture

### **POST** `/api/structured-lectures`

Create a new structured lecture with video, documents, and cover image.

#### **Access**
- SUPERADMIN
- Institute Admin
- Teacher

#### **Request Headers**
```http
Authorization: Bearer <jwt_token>
Content-Type: application/json
```

#### **Request Body**
```json
{
  "instituteId": "101",
  "classId": "1000",
  "subjectId": "40",
  "grade": 10,
  "lessonNumber": 5,
  "lectureNumber": 2,
  "title": "Quadratic Equations - Introduction",
  "description": "Introduction to quadratic equations with real-world examples",
  "lectureVideoUrl": "https://storage.googleapis.com/bucket/videos/lecture-123.mp4",
  "documentUrls": [
    "https://storage.googleapis.com/bucket/docs/notes.pdf",
    "https://storage.googleapis.com/bucket/docs/worksheet.pdf"
  ],
  "coverImageUrl": "https://storage.googleapis.com/bucket/images/cover.jpg",
  "provider": "Institute Mathematics Department",
  "isActive": true
}
```

#### **Field Descriptions**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `instituteId` | string | ✅ Yes | Institute ID (e.g., "101") |
| `classId` | string | ✅ Yes | Class ID (e.g., "1000") |
| `subjectId` | string | ✅ Yes | Subject ID (e.g., "40" for Mathematics) |
| `grade` | number | ✅ Yes | Grade level (1-13) |
| `title` | string | ✅ Yes | Lecture title (max 255 chars) |
| `lessonNumber` | number | ❌ No | Lesson number within subject (default: 1) |
| `lectureNumber` | number | ❌ No | Lecture number within lesson (default: 1) |
| `description` | string | ❌ No | Detailed description (**✅ WORKS**) |
| `lectureVideoUrl` | string | ❌ No | Video URL from signed upload |
| `lectureLink` | string | ❌ No | Alternative: Zoom/external link |
| `documentUrls` | string[] | ❌ No | Array of document URLs |
| `coverImageUrl` | string | ❌ No | Cover image URL |
| `provider` | string | ❌ No | Content provider name |
| `isActive` | boolean | ❌ No | Active status (default: true) |

#### **File Upload Flow**

⚠️ **Important**: Files must be uploaded using signed URLs **BEFORE** creating the lecture.

1. **Get Signed URL** (for each file):
   ```http
   POST /signed-urls/lecture
   Content-Type: application/json
   
   {
     "fileName": "lecture-video.mp4",
     "fileType": "video/mp4"
   }
   ```

2. **Upload File** (client-side):
   ```javascript
   const response = await fetch(signedUrl, {
     method: 'PUT',
     body: file,
     headers: { 'Content-Type': fileType }
   });
   ```

3. **Create Lecture** (use uploaded URLs):
   ```javascript
   const lecture = {
     lectureVideoUrl: "https://storage.googleapis.com/...",
     // ... other fields
   };
   ```

#### **Response (201 Created)**
```json
{
  "success": true,
  "message": "Structured lecture created successfully",
  "data": {
    "id": "789",
    "subjectId": "40",
    "grade": 10,
    "lessonNumber": 5,
    "lectureNumber": 2,
    "title": "Quadratic Equations - Introduction",
    "description": "Introduction to quadratic equations...",
    "lectureVideoUrl": "https://storage.googleapis.com/...",
    "documentUrls": ["https://storage.googleapis.com/..."],
    "coverImageUrl": "https://storage.googleapis.com/...",
    "provider": "Institute Mathematics Department",
    "isActive": true,
    "createdBy": "123",
    "createdAt": "2026-01-30T10:00:00.000Z",
    "updatedAt": "2026-01-30T10:00:00.000Z"
  }
}
```

#### **Error Responses**

**400 Bad Request** - Validation Error
```json
{
  "success": false,
  "message": "Validation failed",
  "errors": [
    "grade must be between 1 and 13",
    "title is required"
  ]
}
```

**409 Conflict** - Duplicate Lecture
```json
{
  "success": false,
  "message": "Lecture already exists for this subject, grade, lesson, and lecture number"
}
```

---

## 2️⃣ Get All Lectures (Filtered)

### **GET** `/api/structured-lectures`

Retrieve lectures with filtering, pagination, and sorting.

#### **Access**
- SUPERADMIN (all lectures)
- Institute Admin (institute lectures)
- Teacher (own lectures)

#### **Query Parameters**

| Parameter | Type | Required | Description | Example |
|-----------|------|----------|-------------|---------|
| `subjectId` | string | ❌ No | Filter by subject | `40` |
| `grade` | number | ❌ No | Filter by grade (1-13) | `10` |
| `lessonNumber` | number | ❌ No | Filter by lesson | `5` |
| `search` | string | ❌ No | Search in title/description | `quadratic` |
| `isActive` | boolean | ❌ No | Filter by status | `true` |
| `provider` | string | ❌ No | Filter by provider | `Math Dept` |
| `page` | number | ❌ No | Page number (default: 1) | `1` |
| `limit` | number | ❌ No | Items per page (default: 10, max: 100) | `20` |
| `sortBy` | string | ❌ No | Sort field | `createdAt` |
| `sortOrder` | string | ❌ No | Sort order (ASC/DESC) | `DESC` |

#### **Example Request**
```http
GET /api/structured-lectures?subjectId=40&grade=10&page=1&limit=20&sortBy=lessonNumber&sortOrder=ASC
Authorization: Bearer <jwt_token>
```

#### **Response (200 OK)**
```json
{
  "success": true,
  "message": "Lectures retrieved successfully",
  "data": [
    {
      "id": "789",
      "subjectId": "40",
      "subjectName": "Mathematics",
      "grade": 10,
      "lessonNumber": 5,
      "lectureNumber": 2,
      "title": "Quadratic Equations - Introduction",
      "description": "Introduction to quadratic equations...",
      "lectureVideoUrl": "https://storage.googleapis.com/...",
      "documentUrls": ["https://storage.googleapis.com/..."],
      "coverImageUrl": "https://storage.googleapis.com/...",
      "provider": "Institute Mathematics Department",
      "isActive": true,
      "viewCount": 45,
      "createdBy": "123",
      "createdAt": "2026-01-30T10:00:00.000Z"
    }
  ],
  "meta": {
    "page": 1,
    "limit": 20,
    "total": 50,
    "totalPages": 3,
    "hasNext": true,
    "hasPrev": false
  }
}
```

---

## 3️⃣ Get Lecture by ID

### **GET** `/api/structured-lectures/:id`

Retrieve a single lecture by ID.

#### **Access**
- SUPERADMIN
- Institute Admin (institute lectures)
- Teacher (own lectures)
- Student (enrolled subjects)

#### **Path Parameters**
- `id` - Lecture ID (string)

#### **Example Request**
```http
GET /api/structured-lectures/789
Authorization: Bearer <jwt_token>
```

#### **Response (200 OK)**
```json
{
  "success": true,
  "data": {
    "id": "789",
    "subjectId": "40",
    "subjectName": "Mathematics",
    "grade": 10,
    "lessonNumber": 5,
    "lectureNumber": 2,
    "title": "Quadratic Equations - Introduction",
    "description": "Introduction to quadratic equations with real-world examples",
    "lectureVideoUrl": "https://storage.googleapis.com/bucket/videos/lecture-123.mp4",
    "documentUrls": [
      "https://storage.googleapis.com/bucket/docs/notes.pdf",
      "https://storage.googleapis.com/bucket/docs/worksheet.pdf"
    ],
    "coverImageUrl": "https://storage.googleapis.com/bucket/images/cover.jpg",
    "provider": "Institute Mathematics Department",
    "isActive": true,
    "viewCount": 45,
    "createdBy": "123",
    "createdByName": "John Doe",
    "createdAt": "2026-01-30T10:00:00.000Z",
    "updatedAt": "2026-01-30T10:00:00.000Z"
  }
}
```

---

## 4️⃣ Update Lecture

### **PUT** `/api/structured-lectures/:id`

Update an existing lecture.

#### **Access**
- SUPERADMIN
- Institute Admin (institute lectures)
- Teacher (own lectures only)

#### **Path Parameters**
- `id` - Lecture ID (string)

#### **Request Body**
```json
{
  "title": "Quadratic Equations - Advanced Concepts",
  "description": "Updated description with more examples",
  "lectureVideoUrl": "https://storage.googleapis.com/bucket/videos/updated-123.mp4",
  "isActive": true
}
```

⚠️ **Note**: All fields are optional. Only include fields you want to update.

#### **Response (200 OK)**
```json
{
  "success": true,
  "message": "Lecture updated successfully",
  "data": {
    "id": "789",
    "title": "Quadratic Equations - Advanced Concepts",
    // ... updated fields
    "updatedAt": "2026-01-30T15:30:00.000Z"
  }
}
```

---

## 5️⃣ Delete Lecture (Soft Delete)

### **DELETE** `/api/structured-lectures/:id`

Soft delete a lecture (sets `isActive = false`).

#### **Access**
- SUPERADMIN
- Institute Admin (institute lectures)
- Teacher (own lectures only)

#### **Path Parameters**
- `id` - Lecture ID (string)

#### **Example Request**
```http
DELETE /api/structured-lectures/789
Authorization: Bearer <jwt_token>
```

#### **Response (200 OK)**
```json
{
  "success": true,
  "message": "Lecture deleted successfully"
}
```

---

## 6️⃣ Get Lectures by Subject

### **GET** `/api/structured-lectures/subject/:subjectId`

Get all lectures for a specific subject, organized by grade and lesson.

#### **Access**
- SUPERADMIN
- Institute Admin
- Teacher
- Student (enrolled subjects)

#### **Path Parameters**
- `subjectId` - Subject ID (string)

#### **Query Parameters**
- `grade` (optional) - Filter by specific grade
- `isActive` (optional) - Filter by status (default: true)

#### **Example Request**
```http
GET /api/structured-lectures/subject/40?grade=10&isActive=true
Authorization: Bearer <jwt_token>
```

#### **Response (200 OK)**
```json
{
  "success": true,
  "data": {
    "subjectId": "40",
    "subjectName": "Mathematics",
    "lecturesByGrade": {
      "10": {
        "lessons": [
          {
            "lessonNumber": 5,
            "lectures": [
              {
                "lectureNumber": 1,
                "id": "788",
                "title": "Quadratic Equations - Basics",
                "coverImageUrl": "https://storage.googleapis.com/...",
                "viewCount": 30
              },
              {
                "lectureNumber": 2,
                "id": "789",
                "title": "Quadratic Equations - Introduction",
                "coverImageUrl": "https://storage.googleapis.com/...",
                "viewCount": 45
              }
            ]
          }
        ]
      }
    },
    "totalLectures": 2
  }
}
```

---

## 🎓 Student Access

Students can view lectures for subjects they are enrolled in.

### **Student Enrollment Check**

Students can only access lectures if:
1. ✅ Enrolled in the subject (via `institute_class_subject`)
2. ✅ Lecture is active (`isActive = true`)
3. ✅ Student has access to the grade level

### **Student View Example**
```http
GET /api/structured-lectures/subject/40?grade=10
Authorization: Bearer <student_jwt_token>
```

---

## 📊 Data Model

### **Lecture Entity**

```typescript
{
  id: string;                    // UUID
  subjectId: string;             // Reference to Subject
  grade: number;                 // 1-13
  lessonNumber: number;          // Lesson number
  lectureNumber: number;         // Lecture number within lesson
  title: string;                 // Lecture title
  description?: string;          // Optional description
  lectureVideoUrl?: string;      // Video URL
  documentUrls?: string[];       // Document URLs array
  coverImageUrl?: string;        // Cover image URL
  provider?: string;             // Content provider
  isActive: boolean;             // Active status
  viewCount: number;             // Number of views
  createdBy: string;             // Creator user ID
  createdAt: Date;               // Creation timestamp
  updatedAt: Date;               // Last update timestamp
}
```

### **Hierarchical Structure**
```
Subject (e.g., Mathematics - ID: 40)
  └── Grade (e.g., 10)
      └── Lesson (e.g., Lesson 5: Quadratic Equations)
          └── Lecture 1: Basics
          └── Lecture 2: Introduction
          └── Lecture 3: Advanced
```

---

## 🔧 Common Use Cases

### **1. Create a Complete Lesson**

```javascript
// Create multiple lectures for Lesson 5
const lectures = [
  { lectureNumber: 1, title: "Basics", ... },
  { lectureNumber: 2, title: "Introduction", ... },
  { lectureNumber: 3, title: "Advanced", ... }
];

for (const lecture of lectures) {
  await createLecture({
    subjectId: "40",
    grade: 10,
    lessonNumber: 5,
    ...lecture
  });
}
```

### **2. Search Lectures**

```http
GET /api/structured-lectures?search=quadratic&subjectId=40&grade=10
```

### **3. Get Student's Available Lectures**

```javascript
// Student automatically sees only enrolled subjects
const lectures = await fetch('/api/structured-lectures/subject/40', {
  headers: { Authorization: `Bearer ${studentToken}` }
});
```

---

## ⚡ Performance Tips

1. **Use Pagination**: Always use `page` and `limit` for large datasets
2. **Filter by Subject**: Use `subjectId` to narrow results
3. **Cache Responses**: Cache lecture lists on frontend
4. **Lazy Load Videos**: Load video URLs only when needed
5. **CDN Integration**: Google Cloud Storage provides CDN automatically

---

## 🚨 Error Handling

### **Common Error Codes**

| Status | Code | Message | Solution |
|--------|------|---------|----------|
| 400 | BAD_REQUEST | Validation failed | Check required fields |
| 401 | UNAUTHORIZED | Invalid JWT token | Re-authenticate |
| 403 | FORBIDDEN | Insufficient permissions | Check user role |
| 404 | NOT_FOUND | Lecture not found | Verify lecture ID |
| 409 | CONFLICT | Duplicate lecture | Change lecture number |

### **Error Response Format**
```json
{
  "success": false,
  "message": "Error description",
  "errors": ["Detailed error 1", "Detailed error 2"]
}
```

---

## 🔒 Security Best Practices

1. **JWT Validation**: All endpoints require valid JWT
2. **Role-Based Access**: Users can only modify their own content
3. **Signed URLs**: Files uploaded via secure signed URLs
4. **Input Validation**: All inputs validated server-side
5. **Rate Limiting**: Applied on create/update operations

---

## 📝 Frontend Integration Example

### **React/TypeScript Example**

```typescript
import axios from 'axios';

// Configure axios with JWT
const api = axios.create({
  baseURL: '/api/structured-lectures',
  headers: {
    Authorization: `Bearer ${getToken()}`
  }
});

// Create Lecture
async function createLecture(lectureData: CreateLectureDto) {
  const response = await api.post('/', lectureData);
  return response.data;
}

// Get Lectures with Filters
async function getLectures(filters: {
  subjectId?: string;
  grade?: number;
  page?: number;
  limit?: number;
}) {
  const response = await api.get('/', { params: filters });
  return response.data;
}

// Get Single Lecture
async function getLecture(id: string) {
  const response = await api.get(`/${id}`);
  return response.data;
}

// Update Lecture
async function updateLecture(id: string, updates: Partial<CreateLectureDto>) {
  const response = await api.put(`/${id}`, updates);
  return response.data;
}

// Delete Lecture
async function deleteLecture(id: string) {
  const response = await api.delete(`/${id}`);
  return response.data;
}

// Get Lectures by Subject (Hierarchical View)
async function getLecturesBySubject(subjectId: string, grade?: number) {
  const params = grade ? { grade } : {};
  const response = await api.get(`/subject/${subjectId}`, { params });
  return response.data;
}
```

---

## 📞 Support

For questions or issues:
- **Documentation**: This guide
- **API Testing**: Use Swagger UI at `/api/docs`
- **Backend Logs**: Check server logs for detailed errors

---

## 🎉 Summary

The Structured Lectures API provides a complete solution for:
- ✅ Creating free educational content
- ✅ Organizing content hierarchically
- ✅ Role-based access control
- ✅ Cloud storage integration
- ✅ Student enrollment validation
- ✅ Rich media support (videos, documents, images)

**Perfect for**: Institute admins and teachers who want to build a centralized content library for their students!
