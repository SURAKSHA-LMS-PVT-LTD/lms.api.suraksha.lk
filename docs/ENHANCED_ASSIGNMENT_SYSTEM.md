# 🚀 Enhanced Institute User Assignment System

**Last Updated:** January 19, 2025  
**Status:** ✅ **IMPLEMENTATION GUIDE**

---

## 📋 Overview

Enhanced assignment system that supports **4 identification methods** for assigning users to institutes with optional image upload and auto-verification.

### **Key Features:**

✅ **4 Identification Methods:**
1. User ID (system-wide unique ID)
2. RFID (physical card/tag identifier)
3. Phone Number (registered phone)
4. Email (registered email)

✅ **Enhanced Features:**
- Institute-specific user ID
- Institute-specific card ID  
- Optional image upload during assignment
- Auto-verification of uploaded images
- Institute user type (STUDENT, TEACHER, ADMIN, etc.)
- Status management (ACTIVE, PENDING, etc.)

---

## 🎯 Request Body Structure

### **Enhanced Assignment DTO:**

```typescript
{
  // ============ USER IDENTIFICATION (ONE REQUIRED) ============
  "userId": "123",                    // Option 1: System user ID
  "rfid": "RFID-ABC-123456",          // Option 2: RFID card
  "phoneNumber": "+94771234567",      // Option 3: Phone number
  "email": "john@example.com",        // Option 4: Email

  // ============ INSTITUTE INFORMATION ============
  "instituteUserId": "STU-2024-001",  // Optional: Institute-specific ID
  "instituteCardId": "CARD-2024-001", // Optional: Access card ID
  "instituteUserType": "STUDENT",     // Required: Role in institute
  "status": "ACTIVE",                 // Optional: Default is PENDING

  // ============ IMAGE VERIFICATION ============
  "autoVerifyImage": true             // Optional: Auto-verify uploaded image
}
```

### **Field Descriptions:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `userId` | string | One of 4 required | System-wide unique user ID |
| `rfid` | string | One of 4 required | RFID card/tag identifier |
| `phoneNumber` | string | One of 4 required | Phone in international format |
| `email` | string | One of 4 required | Registered email address |
| `instituteUserId` | string | Optional | Institute-specific ID (e.g., admission number) |
| `instituteCardId` | string | Optional | Access control card ID |
| `instituteUserType` | enum | **Required** | Role: STUDENT, TEACHER, INSTITUTE_ADMIN, ATTENDANCE_MARKER |
| `status` | enum | Optional | ACTIVE, INACTIVE, PENDING, SUSPENDED, REJECTED |
| `autoVerifyImage` | boolean | Optional | If true, uploaded image is auto-verified |

---

## 📸 Image Upload with Assignment

### **Multipart Form Data Request:**

When uploading an image during assignment, use `multipart/form-data`:

```bash
POST /institute-users/enhanced-assign/:instituteId
Content-Type: multipart/form-data
Authorization: Bearer {JWT_TOKEN}

# Form fields:
- assignmentData: { 
    "phoneNumber": "+94771234567",
    "instituteUserId": "STU-2024-001",
    "instituteUserType": "STUDENT",
    "status": "ACTIVE",
    "autoVerifyImage": true
  }
- image: [binary file data]
```

### **Image Requirements:**

| Requirement | Value |
|-------------|-------|
| **File Types** | JPEG, PNG, WebP |
| **Max Size** | 2 MB |
| **Dimensions** | Any (will be stored as-is) |
| **Upload Path** | `institute-users/{instituteId}/{userId}_{timestamp}.{ext}` |

### **Auto-Verification:**

If `autoVerifyImage: true` and image is uploaded:
- ✅ `isImageVerified` = true
- ✅ `imageVerifiedBy` = assigning user ID (from JWT)
- ✅ `verifiedAt` = current timestamp
- ✅ `imageVerificationStatus` = VERIFIED

If `autoVerifyImage: false` or not provided:
- ⏳ `isImageVerified` = false
- ⏳ `imageVerificationStatus` = PENDING
- ⏳ Manual verification required later

---

## 🌐 API Endpoints

### **1. Enhanced Single Assignment**

```http
POST /institute-users/enhanced-assign/:instituteId
Content-Type: application/json
Authorization: Bearer {JWT_TOKEN}
```

**Request Body (JSON - No Image):**
```json
{
  "phoneNumber": "+94771234567",
  "instituteUserId": "STU-2024-001",
  "instituteCardId": "CARD-2024-001",
  "instituteUserType": "STUDENT",
  "status": "ACTIVE"
}
```

**Response:**
```json
{
  "success": true,
  "message": "User John Doe successfully assigned to institute",
  "user": {
    "userId": "123",
    "userName": "John Doe",
    "userType": "USER",
    "identifier": "phone: +94771234567"
  },
  "assignment": {
    "instituteId": "1",
    "instituteUserId": "STU-2024-001",
    "instituteCardId": "CARD-2024-001",
    "instituteUserType": "STUDENT",
    "status": "ACTIVE"
  }
}
```

---

### **2. Enhanced Assignment with Image Upload**

```http
POST /institute-users/enhanced-assign/:instituteId
Content-Type: multipart/form-data
Authorization: Bearer {JWT_TOKEN}
```

**Form Data:**
```
assignmentData: {
  "email": "student@example.com",
  "instituteUserId": "STU-2024-002",
  "instituteUserType": "STUDENT",
  "autoVerifyImage": true
}
image: [file upload]
```

**Response:**
```json
{
  "success": true,
  "message": "User Jane Smith successfully assigned to institute",
  "user": {
    "userId": "124",
    "userName": "Jane Smith",
    "userType": "USER",
    "identifier": "email: student@example.com"
  },
  "assignment": {
    "instituteId": "1",
    "instituteUserId": "STU-2024-002",
    "instituteUserType": "STUDENT",
    "status": "PENDING"
  },
  "imageInfo": {
    "imageUrl": "https://storage.googleapis.com/bucket/institute-users/1/124_1705654800000.jpg",
    "isVerified": true,
    "verifiedBy": "456",
    "verifiedAt": "2025-01-19T10:00:00.000Z"
  }
}
```

---

### **3. Bulk Enhanced Assignment**

```http
POST /institute-users/bulk-enhanced-assign/:instituteId
Content-Type: application/json
Authorization: Bearer {JWT_TOKEN}
```

**Request Body:**
```json
{
  "assignments": [
    {
      "phoneNumber": "+94771234567",
      "instituteUserId": "STU-001",
      "instituteUserType": "STUDENT",
      "status": "ACTIVE"
    },
    {
      "email": "teacher@example.com",
      "instituteUserId": "TEA-001",
      "instituteUserType": "TEACHER",
      "status": "ACTIVE"
    },
    {
      "rfid": "RFID-123456",
      "instituteUserId": "STU-002",
      "instituteUserType": "STUDENT",
      "status": "PENDING"
    }
  ]
}
```

**Response:**
```json
{
  "success": true,
  "successfulAssignments": [
    {
      "success": true,
      "message": "User John Doe successfully assigned",
      "user": { "userId": "123", "userName": "John Doe", "userType": "USER", "identifier": "phone: +94771234567" },
      "assignment": { "instituteId": "1", "instituteUserId": "STU-001", "instituteUserType": "STUDENT", "status": "ACTIVE" }
    },
    {
      "success": true,
      "message": "User Jane Smith successfully assigned",
      "user": { "userId": "124", "userName": "Jane Smith", "userType": "USER", "identifier": "email: teacher@example.com" },
      "assignment": { "instituteId": "1", "instituteUserId": "TEA-001", "instituteUserType": "TEACHER", "status": "ACTIVE" }
    }
  ],
  "failedAssignments": [
    {
      "identifier": "rfid: RFID-123456",
      "instituteUserType": "STUDENT",
      "error": "User not found with identifier: rfid: RFID-123456"
    }
  ],
  "summary": {
    "total": 3,
    "successful": 2,
    "failed": 1
  }
}
```

---

## 🔄 Assignment Flow

### **Complete Flow Diagram:**

```
1. Client Request
   ├─ JSON: { userId/rfid/phone/email, ... }
   └─ OR multipart/form-data with image
   ↓
2. Validate Input
   ├─ Check at least ONE identifier provided
   ├─ Validate instituteUserType is required
   └─ Validate instituteUserType ≠ PARENT
   ↓
3. Find User
   ├─ Query by userId
   ├─ OR query by rfid
   ├─ OR query by phoneNumber
   └─ OR query by email
   ↓
4. Validate User Type
   ├─ Check user.userType compatibility
   ├─ Check existing STUDENT relation
   └─ Validate comprehensive role assignment
   ↓
5. Check Existing Assignment
   ├─ Check if already assigned with same role
   └─ Throw error if exists
   ↓
6. Check Card ID Uniqueness
   ├─ If instituteCardId provided
   └─ Ensure not assigned to another user
   ↓
7. Handle Image Upload (if provided)
   ├─ Validate file type (JPEG/PNG/WebP)
   ├─ Validate file size (max 2MB)
   ├─ Upload to Google Cloud Storage
   ├─ If autoVerifyImage=true:
   │  ├─ Set isImageVerified = true
   │  ├─ Set imageVerifiedBy = assigningUserId
   │  └─ Set verifiedAt = now
   └─ Otherwise: Set status = PENDING
   ↓
8. Create Assignment
   ├─ Save to institute_user table
   ├─ Set instituteUserId
   ├─ Set instituteCardId
   ├─ Set instituteUserImageUrl
   ├─ Set imageVerificationStatus
   └─ Set status
   ↓
9. Refresh Caches
   ├─ Refresh user management cache
   └─ Refresh user access cache
   ↓
10. Return Response
   ├─ User details
   ├─ Assignment details
   └─ Image info (if uploaded)
```

---

## 🔐 Validation Rules

### **User Type Validation:**

| User Type | Can be assigned as | Cannot be assigned as |
|-----------|-------------------|----------------------|
| **USER** | STUDENT, TEACHER, ADMIN, ATTENDANCE_MARKER | PARENT |
| **USER_WITHOUT_PARENT** | STUDENT, TEACHER, ADMIN, ATTENDANCE_MARKER | PARENT |
| **USER_WITHOUT_STUDENT** | TEACHER, ADMIN, ATTENDANCE_MARKER | STUDENT, PARENT |
| **TEACHER** | TEACHER only | STUDENT, PARENT, ADMIN |
| **ADMIN** | ADMIN only | STUDENT, PARENT, TEACHER |
| **SUPERADMIN** | Cannot assign to institute | - |
| **PARENT** | Cannot assign to institute | - |

### **Institute User Type Restrictions:**

- ❌ **PARENT** cannot be used as `instituteUserType`
- ✅ Parents are linked via `students` table (father_id, mother_id, guardian_id)
- ✅ Must specify one of: STUDENT, TEACHER, INSTITUTE_ADMIN, ATTENDANCE_MARKER

---

## 💾 Database Schema

### **Updated `institute_user` Table:**

```sql
CREATE TABLE institute_user (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  instituteId BIGINT NOT NULL,
  userId BIGINT NOT NULL,
  
  -- Institute-specific IDs
  userIdByInstitute VARCHAR(100),          -- Institute-assigned ID
  instituteCardId VARCHAR(100),            -- Access card ID
  
  -- Role and Status
  instituteUserType ENUM('STUDENT', 'TEACHER', 'INSTITUTE_ADMIN', 'ATTENDANCE_MARKER') NOT NULL,
  status ENUM('ACTIVE', 'INACTIVE', 'PENDING', 'SUSPENDED', 'REJECTED') DEFAULT 'PENDING',
  
  -- Image Upload & Verification
  instituteUserImageUrl TEXT,              -- Uploaded image URL
  isImageVerified BOOLEAN DEFAULT FALSE,   -- Verification status
  imageVerifiedBy BIGINT,                  -- Who verified
  imageVerificationStatus ENUM('NOT_UPLOADED', 'PENDING', 'VERIFIED', 'REJECTED') DEFAULT 'NOT_UPLOADED',
  
  -- Timestamps
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  -- Foreign Keys
  FOREIGN KEY (instituteId) REFERENCES institute(id),
  FOREIGN KEY (userId) REFERENCES user(id),
  FOREIGN KEY (imageVerifiedBy) REFERENCES user(id),
  
  -- Unique Constraints
  UNIQUE KEY UK_institute_user_role (instituteId, userId, instituteUserType),
  UNIQUE KEY UK_institute_card_id (instituteId, instituteCardId),
  
  -- Indexes
  INDEX idx_institute_status (instituteId, status),
  INDEX idx_user_institute (userId, instituteId),
  INDEX idx_institute_user_type (instituteId, instituteUserType),
  INDEX idx_image_verification (instituteId, imageVerificationStatus)
);
```

---

## 🎯 Use Cases

### **Use Case 1: Assign Student by Phone with Image**

```bash
# Student registers and uploads ID photo
POST /institute-users/enhanced-assign/1
Content-Type: multipart/form-data

assignmentData: {
  "phoneNumber": "+94771234567",
  "instituteUserId": "STU-2024-001",
  "instituteCardId": "CARD-001",
  "instituteUserType": "STUDENT",
  "status": "PENDING",
  "autoVerifyImage": false  # Needs manual verification
}
image: student_photo.jpg
```

### **Use Case 2: Assign Teacher by Email (No Image)**

```bash
# Teacher assignment without photo
POST /institute-users/enhanced-assign/1
Content-Type: application/json

{
  "email": "teacher@school.com",
  "instituteUserId": "TEA-2024-001",
  "instituteUserType": "TEACHER",
  "status": "ACTIVE"
}
```

### **Use Case 3: Assign by RFID Card**

```bash
# Student taps RFID card at registration
POST /institute-users/enhanced-assign/1
Content-Type: application/json

{
  "rfid": "RFID-ABC-123456",
  "instituteUserId": "STU-2024-002",
  "instituteCardId": "RFID-ABC-123456",  # Use RFID as card ID
  "instituteUserType": "STUDENT",
  "status": "ACTIVE"
}
```

### **Use Case 4: Bulk Import from CSV**

```bash
# Import 100 students from CSV file
POST /institute-users/bulk-enhanced-assign/1
Content-Type: application/json

{
  "assignments": [
    { "phoneNumber": "+94771234567", "instituteUserId": "STU-001", "instituteUserType": "STUDENT" },
    { "email": "student2@mail.com", "instituteUserId": "STU-002", "instituteUserType": "STUDENT" },
    # ... 98 more
  ]
}
```

---

## ✅ Benefits of Enhanced System

### **Flexibility:**
- ✅ Support multiple identification methods
- ✅ Choose most convenient identifier for each use case
- ✅ No need for separate endpoints per identifier type

### **Efficiency:**
- ✅ Upload and verify images during assignment
- ✅ Auto-verification saves admin time
- ✅ Bulk operations for mass enrollment

### **Security:**
- ✅ Comprehensive validation rules
- ✅ Unique constraint on card IDs
- ✅ Role-based access control
- ✅ Image verification workflow

### **Usability:**
- ✅ Single unified endpoint
- ✅ Clear error messages
- ✅ Detailed response information
- ✅ Support for partial success in bulk operations

---

## 🚀 Implementation Checklist

- [ ] 1. Create enhanced DTOs (`enhanced-assign-user.dto.ts`) ✅
- [ ] 2. Add service methods to `institue_user.service.ts`
- [ ] 3. Add controller endpoints to `institue_user.controller.ts`
- [ ] 4. Update image verification enum if needed
- [ ] 5. Test single assignment (each identifier type)
- [ ] 6. Test assignment with image upload
- [ ] 7. Test auto-verification
- [ ] 8. Test bulk assignment
- [ ] 9. Test validation rules
- [ ] 10. Update API documentation

---

## 📄 Files Created

1. ✅ `enhanced-assign-user.dto.ts` - DTO definitions
2. 📝 `enhanced-assignment.service.method.ts` - Service implementation reference
3. ✅ `ENHANCED_ASSIGNMENT_SYSTEM.md` - This documentation

---

**Status:** ✅ **DTOs CREATED - Ready for Service & Controller Implementation**

**Next Steps:** 
1. Add service methods to existing `institue_user.service.ts`
2. Add controller endpoints to existing `institue_user.controller.ts`
3. Test with Postman/API client

