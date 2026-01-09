# 📘 Subject API Migration Implementation Guide

## 🔄 Migration Summary: `instituteType` → `instituteId`

### **OLD SYSTEM (Deprecated ❌)**
```
GET /subjects?instituteType=SCHOOL
GET /subjects?instituteType=UNIVERSITY
GET /subjects?instituteType=TUITION
```
- Global subjects shared across all institutes of same type
- No institute isolation
- Security risk: Cross-institute data access

### **NEW SYSTEM (Current ✅)**
```
GET /subjects?instituteId=1
GET /subjects?instituteId=2
GET /subjects?instituteId=3
```
- Each subject belongs to specific institute
- Complete institute isolation
- Secure: Users only access their institute's subjects

---

## 📊 Database Changes

### **subjects Table Schema**
```sql
-- REMOVED
-- institute_type ENUM('SCHOOL', 'UNIVERSITY', 'TUITION')

-- ADDED
institute_id BIGINT NOT NULL
```

### **Migration Applied**
- ✅ File: `1736482800000-AddInstituteIdToSubjects.ts`
- ✅ Existing subjects assigned to first active institute of matching type
- ✅ All subject IDs preserved (no duplication)
- ✅ Foreign key relationships maintained

---

## 👥 Role-Based Access Control

### **1. SUPERADMIN (System Admin)**
**Capabilities:**
- ✅ Full access to ALL institutes
- ✅ Create subjects for any institute
- ✅ Update subjects across all institutes
- ✅ Soft delete (deactivate) subjects
- ✅ Permanent delete (ONLY SUPERADMIN)
- ✅ View all subjects with any instituteId

**Required in Requests:**
- ✅ `instituteId` parameter (can be any institute)

---

### **2. INSTITUTE ADMIN**
**Capabilities:**
- ✅ Full CRUD access to **their institute's subjects only**
- ✅ Create new subjects for their institute
- ✅ Update existing subjects in their institute
- ✅ Soft delete (deactivate) subjects
- ❌ Cannot permanently delete
- ✅ View subjects from their institute

**Required in Requests:**
- ✅ `instituteId` parameter (must match their institute)

**Restrictions:**
- ❌ Cannot access other institutes' subjects
- ❌ Cannot create subjects for other institutes

---

### **3. TEACHER**
**Capabilities:**
- ✅ **READ ONLY** access to their institute's subjects
- ✅ View all subjects in their institute
- ✅ Assign subjects to their classes
- ❌ Cannot create new subjects
- ❌ Cannot update subjects
- ❌ Cannot delete subjects

**Required in Requests:**
- ✅ `instituteId` parameter (must match their institute)

**Special Access:**
- ✅ Can POST to `/institutes/:instituteId/classes/:classId/subjects` to assign subjects to classes

---

## 🔌 Complete API Documentation

### **Base URL:** `/subjects`

---

## 📝 1. CREATE SUBJECT

### **Endpoint:** `POST /subjects`

### **Access:** SUPERADMIN, Institute Admin

### **Step-by-Step Implementation:**

#### **Step 1: Upload Image (Optional)**

If you want to add a subject image, use the upload flow:

**Option A: Upload Image File**

```http
POST /upload/generate-signed-url
Authorization: Bearer {token}
Content-Type: application/json

{
  "fileName": "math-subject.jpg",
  "contentType": "image/jpeg",
  "folder": "subject-images",
  "maxSizeInMB": 5
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "uploadUrl": "https://storage.googleapis.com/...",
    "relativePath": "subject-images/subject-uuid-timestamp.jpg",
    "fullUrl": "https://storage.googleapis.com/...",
    "expiresIn": "15 minutes"
  }
}
```

**Upload the file to signed URL:**
```http
PUT {uploadUrl}
Content-Type: image/jpeg
Body: [binary image data]
```

**Verify and publish:**
```http
POST /upload/verify-and-publish
Authorization: Bearer {token}
Content-Type: application/json

{
  "relativePath": "subject-images/subject-uuid-timestamp.jpg"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "relativePath": "subject-images/subject-uuid-timestamp.jpg",
    "fullUrl": "https://storage.googleapis.com/...",
    "isPublic": true
  }
}
```

**Option B: Use Custom URL**

Simply provide the URL directly in the subject creation request (skip upload steps).

---

#### **Step 2: Create Subject**

```http
POST /subjects
Authorization: Bearer {token}
Content-Type: application/json

{
  "code": "MATH101",
  "name": "Mathematics",
  "description": "Basic mathematics course",
  "category": "Science",
  "creditHours": 3,
  "isActive": true,
  "subjectType": "MAIN",
  "basketCategory": "G003",
  "instituteId": "1",
  "imgUrl": "subject-images/subject-uuid-timestamp.jpg"
}
```

**Required Fields:**
- ✅ `code` - Unique subject code (max 50 chars)
- ✅ `name` - Subject name (max 255 chars)
- ✅ `instituteId` - Institute ID (REQUIRED)

**Optional Fields:**
- `description` - Subject description
- `category` - Subject category (max 100 chars)
- `creditHours` - Credit hours (1-1000)
- `isActive` - Active status (default: true)
- `subjectType` - MAIN, BASKET, COMMON (default: MAIN)
- `basketCategory` - Basket category code
- `imgUrl` - Subject image path or URL

**Response:**
```json
{
  "id": "123",
  "code": "MATH101",
  "name": "Mathematics",
  "description": "Basic mathematics course",
  "category": "Science",
  "creditHours": 3,
  "isActive": true,
  "subjectType": "MAIN",
  "basketCategory": "G003",
  "instituteId": "1",
  "imgUrl": "https://storage.googleapis.com/suraksha-lms/subject-images/subject-uuid-timestamp.jpg",
  "createdAt": "2026-01-10T10:00:00Z",
  "updatedAt": "2026-01-10T10:00:00Z"
}
```

**Error Responses:**
- `400 Bad Request` - Missing required fields
- `409 Conflict` - Subject code already exists
- `403 Forbidden` - Insufficient permissions

---

## 📖 2. GET ALL SUBJECTS

### **Endpoint:** `GET /subjects?instituteId=1`

### **Access:** SUPERADMIN, Institute Admin, Teacher

### **Request:**
```http
GET /subjects?instituteId=1&isActive=true&search=math&category=Science
Authorization: Bearer {token}
```

**Query Parameters:**
- ✅ **`instituteId`** - REQUIRED - Institute ID
- `isActive` - Filter by active status (default: true)
- `search` - Search in code, name, or description
- `category` - Filter by category
- `classId` - Filter subjects assigned to specific class
- `subjectId` - Filter by specific subject ID
- `page` - Page number (default: 1)
- `limit` - Records per page (default: 50, -1 for all)
- `sortBy` - Sort field (default: createdAt)
- `sortOrder` - ASC or DESC (default: DESC)

**Response:**
```json
[
  {
    "id": "123",
    "code": "MATH101",
    "name": "Mathematics",
    "description": "Basic mathematics course",
    "category": "Science",
    "creditHours": 3,
    "isActive": true,
    "subjectType": "MAIN",
    "basketCategory": "G003",
    "instituteId": "1",
    "imgUrl": "https://storage.googleapis.com/.../subject-123.jpg",
    "createdAt": "2026-01-10T10:00:00Z",
    "updatedAt": "2026-01-10T10:00:00Z"
  }
]
```

**Important Notes:**
- ✅ Returns **only active subjects by default**
- ✅ To get inactive subjects: `?instituteId=1&isActive=false`
- ❌ Missing `instituteId` returns `400 Bad Request`

---

## 📊 3. GET SUBJECT STATISTICS

### **Endpoint:** `GET /subjects/stats?instituteId=1`

### **Access:** SUPERADMIN, Institute Admin, Teacher

### **Request:**
```http
GET /subjects/stats?instituteId=1
Authorization: Bearer {token}
```

**Response:**
```json
{
  "total": 25,
  "active": 20,
  "inactive": 5
}
```

---

## 📁 4. GET SUBJECTS BY CATEGORY

### **Endpoint:** `GET /subjects/categories?instituteId=1`

### **Access:** SUPERADMIN, Institute Admin, Teacher

### **Request:**
```http
GET /subjects/categories?instituteId=1
Authorization: Bearer {token}
```

**Response:**
```json
[
  {
    "category": "Science",
    "count": 12
  },
  {
    "category": "Mathematics",
    "count": 8
  },
  {
    "category": "Uncategorized",
    "count": 5
  }
]
```

---

## 🔍 5. GET SUBJECT BY CODE

### **Endpoint:** `GET /subjects/code/:code?instituteId=1`

### **Access:** SUPERADMIN, Institute Admin, Teacher

### **Request:**
```http
GET /subjects/code/MATH101?instituteId=1
Authorization: Bearer {token}
```

**Response:**
```json
{
  "id": "123",
  "code": "MATH101",
  "name": "Mathematics",
  "description": "Basic mathematics course",
  "category": "Science",
  "creditHours": 3,
  "isActive": true,
  "subjectType": "MAIN",
  "basketCategory": "G003",
  "instituteId": "1",
  "imgUrl": "https://storage.googleapis.com/.../subject-123.jpg",
  "createdAt": "2026-01-10T10:00:00Z",
  "updatedAt": "2026-01-10T10:00:00Z"
}
```

---

## 🔍 6. GET SUBJECT BY ID

### **Endpoint:** `GET /subjects/:id?instituteId=1`

### **Access:** SUPERADMIN, Institute Admin, Teacher

### **Request:**
```http
GET /subjects/123?instituteId=1
Authorization: Bearer {token}
```

**Response:**
```json
{
  "id": "123",
  "code": "MATH101",
  "name": "Mathematics",
  ...
}
```

---

## ✏️ 7. UPDATE SUBJECT

### **Endpoint:** `PATCH /subjects/:id`

### **Access:** SUPERADMIN, Institute Admin

### **Step 1: Upload New Image (Optional)**

Follow the same upload flow as CREATE (Steps 1A or 1B above).

### **Step 2: Update Subject**

```http
PATCH /subjects/123
Authorization: Bearer {token}
Content-Type: application/json

{
  "name": "Advanced Mathematics",
  "description": "Advanced mathematics course",
  "creditHours": 4,
  "imgUrl": "subject-images/new-subject-image.jpg"
}
```

**Updatable Fields:**
- `code` - Subject code (must be unique)
- `name` - Subject name
- `description` - Description
- `category` - Category
- `creditHours` - Credit hours
- `isActive` - Active status
- `subjectType` - Subject type
- `basketCategory` - Basket category
- `imgUrl` - Image URL

**Response:**
```json
{
  "id": "123",
  "code": "MATH101",
  "name": "Advanced Mathematics",
  "description": "Advanced mathematics course",
  "creditHours": 4,
  "imgUrl": "https://storage.googleapis.com/.../new-subject-image.jpg",
  "updatedAt": "2026-01-10T12:00:00Z"
}
```

**Important Notes:**
- ❌ Cannot update `instituteId` (subjects are locked to their institute)
- ✅ Updating `code` checks for uniqueness
- ❌ Teachers cannot update subjects

---

## 🗑️ 8. SOFT DELETE (DEACTIVATE) SUBJECT

### **Endpoint:** `PATCH /subjects/:id/deactivate`

### **Access:** SUPERADMIN, Institute Admin

### **Request:**
```http
PATCH /subjects/123/deactivate
Authorization: Bearer {token}
```

**Response:**
```json
{
  "id": "123",
  "code": "MATH101",
  "name": "Mathematics",
  "isActive": false,
  "updatedAt": "2026-01-10T12:30:00Z"
}
```

**Effect:**
- ✅ Sets `isActive = false`
- ✅ Subject preserved in database
- ✅ Will not appear in default GET requests
- ✅ Can be retrieved with `?isActive=false`

---

## ❌ 9. PERMANENT DELETE SUBJECT

### **Endpoint:** `DELETE /subjects/:id`

### **Access:** SUPERADMIN ONLY

### **Request:**
```http
DELETE /subjects/123
Authorization: Bearer {token}
```

**Response:**
- `204 No Content` - Subject deleted successfully

**Warning:**
- ⚠️ **PERMANENT DELETION** - Cannot be undone
- ⚠️ May break relationships if subject is assigned to classes
- ⚠️ Only SUPERADMIN can perform this action

---

## 🎓 10. ASSIGN SUBJECT TO CLASS (Teacher Access)

### **Endpoint:** `POST /institutes/:instituteId/classes/:classId/subjects`

### **Access:** SUPERADMIN, Institute Admin, Teacher

### **Request:**
```http
POST /institutes/1/classes/5/subjects
Authorization: Bearer {token}
Content-Type: application/json

{
  "subjectId": "123",
  "teacherId": "456",
  "isActive": true
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "instituteId": "1",
    "classId": "5",
    "subjectId": "123",
    "teacherId": "456",
    "isActive": true,
    "createdAt": "2026-01-10T13:00:00Z"
  }
}
```

---

## 🖼️ Image Upload Specifications

### **Supported Formats:**
- ✅ JPG/JPEG
- ✅ PNG
- ✅ WebP
- ✅ GIF

### **File Size Limit:**
- ✅ Maximum: 5 MB

### **Recommended Dimensions:**
- ✅ Aspect Ratio: 4:3 (e.g., 800x600, 1024x768)
- ✅ Frontend should implement crop functionality

### **Image Upload Flow:**

```
┌─────────────────┐
│  Frontend       │
│  Select Image   │
└────────┬────────┘
         │
         ▼
┌─────────────────────────────┐
│ POST /upload/generate-signed-url │
│ - fileName: "math.jpg"      │
│ - contentType: "image/jpeg" │
│ - folder: "subject-images"  │
│ - maxSizeInMB: 5            │
└────────┬────────────────────┘
         │
         ▼ Returns signed URL
┌─────────────────────────────┐
│  PUT to Signed URL          │
│  Upload binary image data   │
└────────┬────────────────────┘
         │
         ▼ Upload complete
┌─────────────────────────────┐
│ POST /upload/verify-and-publish │
│ - relativePath: "..."       │
└────────┬────────────────────┘
         │
         ▼ Returns public URL
┌─────────────────────────────┐
│  POST/PATCH /subjects       │
│  Include imgUrl in body     │
└─────────────────────────────┘
```

---

## 🧪 Testing Guide

### **Test 1: Institute Admin Creates Subject**

```bash
# Login as Institute Admin (Institute ID: 1)
POST /auth/login
{
  "username": "admin@institute1.com",
  "password": "password"
}

# Create Subject
POST /subjects
{
  "code": "TEST101",
  "name": "Test Subject",
  "instituteId": "1"
}

# Expected: 201 Created
```

### **Test 2: Institute Admin Cannot Access Other Institute**

```bash
# Try to get subjects from Institute 2
GET /subjects?instituteId=2

# Expected: 403 Forbidden or empty results
```

### **Test 3: Teacher Cannot Create Subject**

```bash
# Login as Teacher
POST /auth/login
{
  "username": "teacher@institute1.com",
  "password": "password"
}

# Try to create subject
POST /subjects
{
  "code": "FAIL101",
  "name": "Should Fail",
  "instituteId": "1"
}

# Expected: 403 Forbidden
```

### **Test 4: Teacher Can View Subjects**

```bash
# Get subjects as Teacher
GET /subjects?instituteId=1

# Expected: 200 OK with subjects list
```

### **Test 5: Teacher Can Assign Subject to Class**

```bash
# Assign subject to class
POST /institutes/1/classes/5/subjects
{
  "subjectId": "123",
  "teacherId": "456"
}

# Expected: 201 Created
```

### **Test 6: Missing instituteId Returns Error**

```bash
# Try without instituteId
GET /subjects

# Expected: 400 Bad Request
# Error: "instituteId is required to access subjects"
```

### **Test 7: Only Active Subjects Returned**

```bash
# Get subjects (default: active only)
GET /subjects?instituteId=1

# Should only return isActive=true subjects

# Get all including inactive
GET /subjects?instituteId=1&isActive=false

# Should include inactive subjects
```

---

## 🚨 Common Errors and Solutions

### **Error 1: `400 Bad Request - instituteId is required`**

**Cause:** Missing `instituteId` parameter

**Solution:**
```bash
# ❌ Wrong
GET /subjects

# ✅ Correct
GET /subjects?instituteId=1
```

---

### **Error 2: `409 Conflict - Subject code already exists`**

**Cause:** Trying to create/update subject with duplicate code

**Solution:**
- Use a unique subject code
- Check existing subjects first: `GET /subjects?instituteId=1&search=MATH101`

---

### **Error 3: `403 Forbidden`**

**Cause:** User doesn't have permission for the action

**Solution:**
- Check user role
- Teachers cannot create/update/delete subjects
- Institute Admins cannot access other institutes

---

### **Error 4: `404 Not Found - Subject not found in this institute`**

**Cause:** Subject doesn't exist or belongs to different institute

**Solution:**
- Verify subject exists: `GET /subjects/:id?instituteId=1`
- Check you're using correct instituteId

---

## 📋 Frontend Implementation Checklist

### **Subject Create/Edit Form:**

- [ ] Add instituteId hidden field (auto-filled from user context)
- [ ] Implement image upload with:
  - [ ] File size validation (max 5 MB)
  - [ ] File type validation (jpg, png, webp, gif)
  - [ ] 4:3 aspect ratio crop tool
  - [ ] Progress indicator during upload
- [ ] Add switch/tab for custom URL option
- [ ] Required field validation: code, name, instituteId
- [ ] Role-based button visibility:
  - [ ] Hide Create button for Teachers
  - [ ] Hide Update button for Teachers
  - [ ] Hide Delete button for non-SUPERADMIN

### **Subject List Page:**

- [ ] Always pass instituteId from user context
- [ ] Show only active subjects by default
- [ ] Add filter toggle for inactive subjects
- [ ] Implement search by code/name/description
- [ ] Category filter dropdown
- [ ] Role-based action buttons:
  - [ ] Teachers: View only
  - [ ] Institute Admin: View, Edit, Deactivate
  - [ ] SUPERADMIN: All actions

### **Subject Assignment (Teachers):**

- [ ] Class subject assignment interface
- [ ] Subject selector (filtered by instituteId)
- [ ] Teacher assignment dropdown
- [ ] Success/error notifications

---

## 🎯 Migration Checklist

- [x] Database migration executed (instituteType → instituteId)
- [x] All DTOs updated with instituteId
- [x] Repository methods filter by instituteId
- [x] Controller endpoints require instituteId
- [x] Service layer validates institute access
- [x] Role-based access guards implemented
- [x] Active subjects filtering added
- [x] Error messages updated
- [x] API documentation updated
- [ ] Frontend updated to use instituteId
- [ ] Old instituteType references removed
- [ ] Testing completed for all roles
- [ ] Production deployment scheduled

---

## 📝 Summary of Changes

### **✅ Completed:**
1. Database schema migrated (instituteType → instituteId)
2. All APIs require instituteId parameter
3. Role-based access control implemented
4. Institute isolation enforced
5. Active subjects filtering added
6. Image upload flow documented
7. Complete API documentation created

### **⚠️ Pending:**
1. Frontend updates to use new API structure
2. Remove old instituteType references from frontend
3. Update frontend forms with instituteId
4. Implement image upload UI with crop tool
5. Add role-based UI restrictions
6. Complete end-to-end testing
7. User training/documentation

---

## 🎓 Quick Reference

**Always Include:**
- ✅ `instituteId` in all subject API requests
- ✅ `Authorization: Bearer {token}` header

**Default Behavior:**
- ✅ GET requests return only active subjects
- ✅ Use `?isActive=false` to include inactive

**Image Upload:**
1. Generate signed URL
2. Upload to signed URL
3. Verify and publish
4. Include relativePath in subject request

**Access Summary:**
- **SUPERADMIN**: Everything, all institutes
- **Institute Admin**: CRUD in their institute
- **Teacher**: Read only + assign to classes

---

**Need Help?** Contact the development team or refer to the API Swagger documentation at `/api-docs`
