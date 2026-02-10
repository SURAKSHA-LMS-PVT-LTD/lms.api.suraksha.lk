# 🔐 ADMIN FEATURES COMPLETE GUIDE

**Date:** January 31, 2025  
**Version:** 2.0  
**System:** Suraksha LMS API  
**Database:** MySQL (suraksha-lms-db)  
**Port:** 8080

---

## 📋 TABLE OF CONTENTS

1. [Overview](#overview)
2. [Permission Levels](#permission-levels)
3. [User Management](#user-management)
4. [Institute Management](#institute-management)
5. [Card Order Management](#card-order-management)
6. [Push Notification Management](#push-notification-management)
7. [System Admin Features](#system-admin-features)
8. [Security & Best Practices](#security--best-practices)

---

## 🎯 OVERVIEW

This guide documents ALL admin-only features across the Suraksha LMS system. Admin features are distributed across multiple controllers with varying permission requirements (SUPERADMIN, INSTITUTE_ADMIN, etc.).

### Key Admin Controllers
- **user.controller.ts** - User lifecycle management
- **system-admin-user.controller.ts** - Special admin user operations
- **institute.controller.ts** - Institute CRUD operations
- **admin-card-order.controller.ts** - Card management system
- **push-notification-admin.controller.ts** - System notifications
- **auth.controller.ts** - Password management & sessions

---

## 🔒 PERMISSION LEVELS

### 1. SUPERADMIN (Global Administrator)
**Highest level** - Can perform ALL operations across ALL institutes.

**Capabilities:**
- ✅ Create/delete/modify ALL users (any institute)
- ✅ Create/delete/modify ALL institutes
- ✅ Manage card orders system-wide
- ✅ Send system-wide push notifications
- ✅ View all statistics and reports
- ✅ Permanently delete users/institutes
- ✅ Access ALL data without restrictions

**Guard:** `@RequireAnyOfRoles({ global: [UserType.SUPERADMIN] })`

---

### 2. INSTITUTE_ADMIN (Institute Administrator)
**Institute-scoped** - Full control within assigned institute(s).

**Capabilities:**
- ✅ Create/modify/deactivate users in their institute
- ✅ Manage institute settings and configuration
- ✅ View institute statistics and reports
- ✅ Manage classes, subjects, teachers
- ✅ Activate/deactivate institute (own institute)
- ❌ Cannot delete users permanently
- ❌ Cannot access other institutes' data
- ❌ Cannot manage card orders system

**Guard:** `@RequireAnyOfRoles({ instituteAdmin: true })`

---

### 3. TEACHER (Limited Admin)
**Class/Subject-scoped** - Can manage assigned classes only.

**Capabilities:**
- ✅ View students in assigned classes
- ✅ Manage homework, exams, lectures in assigned subjects
- ✅ Mark attendance for assigned classes
- ✅ View parent contact information (for assigned students)
- ❌ Cannot create/delete users
- ❌ Cannot modify institute settings
- ❌ Cannot access unassigned classes

**Guard:** `@RequireAnyOfRoles({ teacher: true })`

---

## 👥 USER MANAGEMENT

### 1. CREATE USER (Comprehensive)

**Endpoint:** `POST /users/comprehensive`  
**Access:** `SUPERADMIN`, `INSTITUTE_ADMIN`, `ORGANIZATION_MANAGER`  
**Purpose:** Create a complete user with all related data (student, parent, institute assignment)

#### Request Body
```json
{
  "firstName": "John",
  "lastName": "Doe",
  "email": "john.doe@example.com",
  "phoneNumber": "+94771234567",
  "userType": "USER",
  "gender": "MALE",
  "dateOfBirth": "1995-05-15",
  "nic": "199512345678",
  "birthCertificateNo": "BC-123456789",
  "addressLine1": "123 Main Street",
  "addressLine2": "Apartment 4B",
  "city": "Colombo",
  "district": "COLOMBO",
  "province": "WESTERN",
  "postalCode": "00100",
  "country": "Sri Lanka",
  "imageUrl": "https://storage.googleapis.com/...",
  "idUrl": "https://storage.googleapis.com/...",
  "isActive": true,
  "studentData": {
    "studentId": "STU-2024-001",
    "emergencyContact": "+94771234567",
    "medicalConditions": "Asthma",
    "allergies": "Peanuts",
    "bloodGroup": "O_POSITIVE",
    "fatherId": "123",
    "motherId": "456",
    "guardianId": null,
    "fatherPhoneNumber": "+94771234567",
    "motherPhoneNumber": "+94777654321"
  },
  "parentData": {
    "occupation": "ENGINEER",
    "workplace": "ABC Corporation",
    "workPhone": "+94112345678",
    "educationLevel": "Bachelor of Engineering"
  }
}
```

#### User Types
- **USER** - Student with parents (requires `studentData` + `parentData`)
- **USER_WITHOUT_PARENT** - Student without parent (requires `studentData` only)
- **USER_WITHOUT_STUDENT** - Parent without student (requires `parentData` only)
- **INSTITUTE_USER** - Staff or non-student user

#### Auto-Generated Fields
- **nameWithInitials** - Generated from firstName + lastName using Sri Lankan convention
  - Example: "anura kumara" + "disse aiya kumara" → "A.K.D.A. Kumara"
  - All words become initials EXCEPT last word (shown in full)

#### Important Notes
1. **Minimal Profile Support** - Can create users with only email OR phone (rest filled during first login)
2. **Email/Phone Validation** - System checks for duplicates before creation
3. **Welcome Notifications** - Automatic email/SMS sent with login credentials
4. **Institute Assignment** - Optional `instituteId` field for automatic enrollment

---

### 2. DEACTIVATE USER (Soft Delete)

**Endpoint:** `PATCH /users/:id/deactivate`  
**Access:** `SUPERADMIN`, `INSTITUTE_ADMIN`  
**Purpose:** Disable user account while preserving all data (reversible)

#### Example Request
```http
PATCH /users/40/deactivate
Authorization: Bearer <jwt_token>
```

#### Response
```json
{
  "id": "40",
  "firstName": "John",
  "lastName": "Doe",
  "email": "jo***e@example.com",
  "isActive": false,
  "updatedAt": "2025-01-31T10:30:00Z"
}
```

#### What Happens
1. ✅ User account set to `isActive: false`
2. ✅ All data preserved in database
3. ✅ User cannot login
4. ✅ Existing sessions remain active
5. ✅ Can be reactivated with `/users/:id/activate`
6. ✅ Audit trail maintained

#### Use Cases
- Temporary account suspension
- Student graduated/transferred
- Staff member on leave
- Policy violation (temporary ban)

---

### 3. DELETE USER (Permanent)

**Endpoint:** `DELETE /users/:id`  
**Access:** `SUPERADMIN` **ONLY**  
**Purpose:** Permanently remove user and all related data (IRREVERSIBLE)

#### ⚠️ CRITICAL WARNINGS
- **PERMANENT DELETION** - Cannot be undone
- **CASCADE EFFECTS** - Deletes all related records
- **DATA LOSS** - Student records, attendance, exams all deleted
- **BACKUP RECOMMENDED** - Export data before deletion

#### Example Request
```http
DELETE /users/40
Authorization: Bearer <jwt_token>
```

#### Response
```http
HTTP/1.1 204 No Content
```

#### What Gets Deleted
1. ❌ **User record** (`users` table)
2. ❌ **Student record** (`students` table)
3. ❌ **Parent record** (`parents` table)
4. ❌ **Institute enrollments** (`institute_user` table)
5. ❌ **Class enrollments** (`institute_class_student` table)
6. ❌ **Attendance records** (`attendance` table)
7. ❌ **Exam submissions** (`exam_submissions` table)
8. ❌ **Homework submissions** (`homework_submissions` table)
9. ❌ **Payment records** (references may break)
10. ❌ **Cache entries** (automatically cleared)

#### Pre-Deletion Checklist
- [ ] Export user data to backup
- [ ] Verify no active payment plans
- [ ] Check for dependent records (parent-student relationships)
- [ ] Confirm with stakeholders
- [ ] Document reason for deletion

---

### 4. ACTIVATE USER

**Endpoint:** `PATCH /users/:id/activate`  
**Access:** `SUPERADMIN`, `INSTITUTE_ADMIN`  
**Purpose:** Reactivate previously deactivated user account

#### Example Request
```http
PATCH /users/40/activate
Authorization: Bearer <jwt_token>
```

#### Response
```json
{
  "id": "40",
  "firstName": "John",
  "lastName": "Doe",
  "email": "jo***e@example.com",
  "isActive": true,
  "updatedAt": "2025-01-31T10:35:00Z"
}
```

#### What Happens
1. ✅ Account set to `isActive: true`
2. ✅ User can login immediately
3. ✅ All data remains intact
4. ✅ Cache refreshed automatically

---

### 5. UPDATE USER

**Endpoint:** `PATCH /users/:id`  
**Access:** `SUPERADMIN`, `INSTITUTE_ADMIN`, `SELF` (own profile)  
**Purpose:** Modify user profile information

#### Request Body (Partial Update)
```json
{
  "firstName": "Jane",
  "phoneNumber": "+94771234568",
  "addressLine1": "456 New Street",
  "city": "Galle",
  "district": "GALLE",
  "province": "SOUTHERN"
}
```

#### Validation Rules
1. **Email/Phone Uniqueness** - System checks for conflicts
2. **Enum Validation** - District, province must match enum values
3. **Date Format** - ISO 8601 format required
4. **Required Fields** - Cannot set firstName/email to null

#### Cache Refresh
- Automatic cache refresh after update
- Includes user indexes (phone, email, RFID lookups)
- Non-blocking (won't fail request if cache fails)

---

### 6. VIEW ALL USERS (List)

**Endpoint:** `GET /users`  
**Access:** `SUPERADMIN` **ONLY**  
**Purpose:** Retrieve paginated list with advanced filtering

#### Query Parameters
```http
GET /users?search=john&userType=USER_WITHOUT_PARENT&province=WESTERN&isActive=true&page=1&limit=20&sortBy=createdAt&sortOrder=DESC
```

| Parameter | Type | Description | Example |
|-----------|------|-------------|---------|
| `search` | String | Search across name, email, phone, NIC | `john` |
| `userType` | Enum | Filter by user role | `USER`, `INSTITUTE_ADMIN` |
| `gender` | Enum | Filter by gender | `MALE`, `FEMALE`, `OTHER` |
| `city` | String | Filter by city | `Colombo` |
| `district` | String | Filter by district | `COLOMBO` |
| `province` | String | Filter by province | `WESTERN` |
| `country` | String | Filter by country | `Sri Lanka` |
| `postalCode` | String | Filter by postal code | `00100` |
| `phone` | String | Filter by phone (partial) | `077` |
| `nic` | String | Filter by NIC | `199512345678` |
| `isActive` | Boolean | Filter by active status | `true`, `false` |
| `page` | Number | Page number (starts at 1) | `1` |
| `limit` | Number | Items per page (max 100) | `20` |
| `sortBy` | String | Sort field | `createdAt`, `firstName` |
| `sortOrder` | String | Sort direction | `ASC`, `DESC` |

#### Response
```json
{
  "data": [
    {
      "id": "40",
      "firstName": "John",
      "lastName": "Doe",
      "email": "jo***e@example.com",
      "phoneNumber": "+947*****567",
      "userType": "USER_WITHOUT_PARENT",
      "gender": "MALE",
      "isActive": true,
      "createdAt": "2024-01-15T10:30:00Z"
    }
  ],
  "meta": {
    "page": 1,
    "limit": 20,
    "total": 150,
    "totalPages": 8,
    "hasNext": true,
    "hasPrev": false
  }
}
```

---

### 7. USER STATISTICS

**Endpoint:** `GET /users/statistics`  
**Access:** `SUPERADMIN` **ONLY**  
**Purpose:** Get comprehensive user analytics

#### Response
```json
{
  "totalUsers": 1250,
  "activeUsers": 1180,
  "inactiveUsers": 70,
  "byUserType": {
    "USER": 800,
    "USER_WITHOUT_PARENT": 250,
    "USER_WITHOUT_STUDENT": 150,
    "INSTITUTE_ADMIN": 30,
    "TEACHER": 20
  },
  "byGender": {
    "MALE": 650,
    "FEMALE": 580,
    "OTHER": 20
  },
  "byProvince": {
    "WESTERN": 700,
    "CENTRAL": 300,
    "SOUTHERN": 250
  }
}
```

---

### 8. CHANGE USER PASSWORD (Admin)

**Endpoint:** `POST /auth/change-password` (via JWT)  
**Access:** Authenticated user (self-service)  
**Purpose:** User changes their own password

#### Request Body
```json
{
  "currentPassword": "OldPass123!",
  "newPassword": "NewPass456!",
  "confirmNewPassword": "NewPass456!"
}
```

#### Validation Rules
1. ✅ Current password must be correct
2. ✅ New password must be different from current
3. ✅ New password must match confirmation
4. ✅ Password strength requirements enforced

#### What Happens
1. ✅ Password hashed with bcrypt + pepper
2. ✅ All refresh tokens revoked (forced logout on all devices)
3. ✅ User cache refreshed
4. ✅ Audit trail logged

#### Security Features
- **Token Revocation** - All sessions invalidated after password change
- **Force Re-Login** - User must login again on all devices
- **Audit Logging** - Password change events tracked

---

### 9. RESET USER PASSWORD (Admin Function)

**Endpoint:** Internal service method `authService.resetPassword()`  
**Access:** `SUPERADMIN` via internal service calls  
**Purpose:** Admin resets user password without knowing current password

#### Service Method
```typescript
await authService.resetPassword(
  userId: '40',
  newPassword: 'TempPass123!',
  adminUserId: '1' // Admin performing reset
);
```

#### Use Cases
- User forgot password
- Account recovery
- Security incident response
- First-time login setup

⚠️ **Note:** This bypasses current password verification - use with caution

---

## 🏢 INSTITUTE MANAGEMENT

### 1. CREATE INSTITUTE

**Endpoint:** `POST /institutes`  
**Access:** `SUPERADMIN` **ONLY**  
**Purpose:** Create a new educational institute

#### Request Body
```json
{
  "instituteName": "Royal College",
  "shortName": "Royal",
  "code": "RC001",
  "email": "info@royal.edu.lk",
  "phoneNumber": "+94112345678",
  "addressLine1": "Rajakeeya Mawatha",
  "city": "Colombo 07",
  "district": "COLOMBO",
  "province": "WESTERN",
  "postalCode": "00700",
  "country": "Sri Lanka",
  "primaryColorCode": "#0066CC",
  "secondaryColorCode": "#FFD700",
  "logoUrl": "https://storage.googleapis.com/.../logo.png",
  "loadingGifUrl": "https://storage.googleapis.com/.../loading.gif",
  "imageUrl": "https://storage.googleapis.com/.../main.jpg",
  "imageUrls": ["url1", "url2", "url3"],
  "vision": "To provide world-class education",
  "mission": "Developing future leaders",
  "establishedYear": 1835,
  "website": "https://royalcollege.lk",
  "facebookUrl": "https://facebook.com/royalcollege",
  "instagramUrl": "https://instagram.com/royalcollege",
  "twitterUrl": "https://twitter.com/royalcollege",
  "linkedinUrl": "https://linkedin.com/company/royalcollege",
  "youtubeUrl": "https://youtube.com/@royalcollege",
  "isActive": true
}
```

#### Required Fields
- `instituteName`
- `code` (unique institute identifier)
- `email` (unique contact email)
- `phoneNumber`
- `city`
- `district`
- `province`

#### Auto-Generated Fields
- `id` - Long ID (auto-increment)
- `createdAt` - Timestamp
- `updatedAt` - Timestamp

#### Validation
1. **Code Uniqueness** - Institute code must be unique
2. **Email Uniqueness** - Contact email must be unique
3. **Color Codes** - Must be valid hex colors (#RRGGBB)
4. **URLs** - Must use uploaded URLs from `/upload/verify-and-publish`

---

### 2. UPDATE INSTITUTE

**Endpoint:** `PATCH /institutes/:id`  
**Access:** `SUPERADMIN`, `INSTITUTE_ADMIN` (own institute)  
**Purpose:** Modify institute information

#### Request Body (Partial Update)
```json
{
  "phoneNumber": "+94112345679",
  "website": "https://newwebsite.lk",
  "primaryColorCode": "#FF0000",
  "logoUrl": "https://storage.googleapis.com/.../new-logo.png"
}
```

#### Validation Rules
1. **Code/Email Conflicts** - Cannot change to existing code/email
2. **URL Verification** - URLs must be pre-verified via upload API
3. **Color Validation** - Hex color format required

---

### 3. SOFT DELETE INSTITUTE

**Endpoint:** `DELETE /institutes/:id`  
**Access:** `SUPERADMIN` **ONLY**  
**Purpose:** Deactivate institute (preserves all data)

#### Example Request
```http
DELETE /institutes/44
Authorization: Bearer <jwt_token>
```

#### Response
```json
{
  "message": "Institute deleted successfully"
}
```

#### What Happens
1. ✅ Institute set to `isActive: false`
2. ✅ All data preserved
3. ✅ Users cannot login to this institute
4. ✅ Classes/subjects remain in database
5. ✅ Can be reactivated with `/institutes/:id/activate`

---

### 4. ACTIVATE/DEACTIVATE INSTITUTE

**Endpoint:** `PATCH /institutes/:id/activate` or `PATCH /institutes/:id/deactivate`  
**Access:** `SUPERADMIN`, `INSTITUTE_ADMIN`  
**Purpose:** Toggle institute active status

#### Example Requests
```http
# Activate
PATCH /institutes/44/activate
Authorization: Bearer <jwt_token>

# Deactivate
PATCH /institutes/44/deactivate
Authorization: Bearer <jwt_token>
```

---

### 5. VIEW ALL INSTITUTES

**Endpoint:** `GET /institutes`  
**Access:** `SUPERADMIN` **ONLY**  
**Purpose:** List all institutes with filtering

#### Query Parameters
```http
GET /institutes?search=royal&district=COLOMBO&isActive=true&page=1&limit=20
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `search` | String | Search name, code, email |
| `district` | String | Filter by district |
| `province` | String | Filter by province |
| `city` | String | Filter by city |
| `isActive` | Boolean | Filter by status |
| `page` | Number | Page number |
| `limit` | Number | Items per page |

---

## 💳 CARD ORDER MANAGEMENT

### Overview
**Controller:** `admin-card-order.controller.ts`  
**Access:** **ALL ENDPOINTS REQUIRE SUPERADMIN**  
**Purpose:** Manage RFID card orders, payments, and distribution

### 1. CREATE CARD ORDER

**Endpoint:** `POST /admin/card-orders`  
**Access:** `SUPERADMIN`  
**Purpose:** Create new card order for user

#### Request Body
```json
{
  "userId": "40",
  "cardType": "STUDENT",
  "quantity": 1,
  "deliveryAddress": "123 Main St, Colombo",
  "contactPhone": "+94771234567",
  "notes": "Urgent delivery required"
}
```

---

### 2. UPDATE CARD ORDER STATUS

**Endpoint:** `PATCH /admin/card-orders/:orderId/status`  
**Access:** `SUPERADMIN`  
**Purpose:** Update order processing status

#### Request Body
```json
{
  "status": "PROCESSING",
  "notes": "Card production started"
}
```

#### Status Values
- `PENDING` - Order received
- `PROCESSING` - Card being produced
- `SHIPPED` - Card dispatched
- `DELIVERED` - Card received by user
- `CANCELLED` - Order cancelled

---

### 3. ACTIVATE CARD

**Endpoint:** `PATCH /admin/cards/:cardId/activate`  
**Access:** `SUPERADMIN`  
**Purpose:** Activate card for use in system

#### Request Body
```json
{
  "rfid": "RFID12345678",
  "userId": "40"
}
```

---

### 4. DEACTIVATE CARD

**Endpoint:** `DELETE /admin/cards/:cardId`  
**Access:** `SUPERADMIN`  
**Purpose:** Deactivate lost/stolen card

#### Example Request
```http
DELETE /admin/cards/123
Authorization: Bearer <jwt_token>
```

---

### 5. CARD PAYMENT VERIFICATION

**Endpoint:** `POST /admin/card-payments/:paymentId/verify`  
**Access:** `SUPERADMIN`  
**Purpose:** Verify payment for card order

#### Request Body
```json
{
  "paymentMethod": "BANK_TRANSFER",
  "transactionId": "TXN123456",
  "amount": 500.00,
  "verifiedBy": "admin_user_id"
}
```

---

### 6. VIEW CARD STATISTICS

**Endpoint:** `GET /admin/cards/statistics`  
**Access:** `SUPERADMIN`  
**Purpose:** Get card system analytics

#### Response
```json
{
  "totalCards": 1500,
  "activeCards": 1200,
  "inactiveCards": 300,
  "pendingOrders": 50,
  "totalRevenue": 750000.00,
  "byCardType": {
    "STUDENT": 1000,
    "STAFF": 300,
    "VISITOR": 200
  }
}
```

---

## 📢 PUSH NOTIFICATION MANAGEMENT

### Overview
**Controller:** `push-notification-admin.controller.ts`  
**Access:** `SUPERADMIN`  
**Purpose:** Send system-wide push notifications

### 1. SEND SYSTEM NOTIFICATION

**Endpoint:** `POST /push-notifications/admin/send-system`  
**Access:** `SUPERADMIN`  
**Purpose:** Broadcast notification to all users or specific segments

#### Request Body
```json
{
  "title": "System Maintenance Notice",
  "body": "Scheduled maintenance on Feb 1, 2025 from 2:00 AM - 4:00 AM",
  "data": {
    "type": "SYSTEM_ANNOUNCEMENT",
    "priority": "HIGH",
    "actionUrl": "/announcements/maintenance-2024-02-01"
  },
  "targetAudience": "ALL_USERS",
  "instituteIds": null,
  "userTypes": null,
  "scheduleAt": null
}
```

#### Target Audience Options
- `ALL_USERS` - Everyone in the system
- `SPECIFIC_INSTITUTES` - Users in specified institutes (provide `instituteIds`)
- `SPECIFIC_USER_TYPES` - Users with specific roles (provide `userTypes`)
- `CUSTOM` - Custom filter logic

#### User Type Filters
```json
{
  "targetAudience": "SPECIFIC_USER_TYPES",
  "userTypes": ["STUDENT", "PARENT", "TEACHER"]
}
```

#### Institute Filters
```json
{
  "targetAudience": "SPECIFIC_INSTITUTES",
  "instituteIds": ["44", "45", "46"]
}
```

#### Scheduled Notifications
```json
{
  "title": "Exam Reminder",
  "body": "Your exam starts in 1 hour",
  "scheduleAt": "2025-02-01T08:00:00Z"
}
```

---

### 2. VIEW NOTIFICATION HISTORY

**Endpoint:** `GET /push-notifications/admin/history`  
**Access:** `SUPERADMIN`  
**Purpose:** View all sent notifications

#### Query Parameters
```http
GET /push-notifications/admin/history?startDate=2025-01-01&endDate=2025-01-31&type=SYSTEM_ANNOUNCEMENT&page=1&limit=50
```

#### Response
```json
{
  "data": [
    {
      "id": "123",
      "title": "System Maintenance Notice",
      "body": "Scheduled maintenance...",
      "sentAt": "2025-01-31T10:00:00Z",
      "targetAudience": "ALL_USERS",
      "totalRecipients": 1500,
      "successCount": 1480,
      "failureCount": 20,
      "status": "COMPLETED"
    }
  ],
  "meta": {
    "page": 1,
    "limit": 50,
    "total": 150,
    "totalPages": 3
  }
}
```

---

### 3. NOTIFICATION STATISTICS

**Endpoint:** `GET /push-notifications/admin/statistics`  
**Access:** `SUPERADMIN`  
**Purpose:** Get notification system analytics

#### Response
```json
{
  "totalSent": 5000,
  "totalDelivered": 4800,
  "deliveryRate": 96.0,
  "averageDeliveryTime": 2.5,
  "byType": {
    "SYSTEM_ANNOUNCEMENT": 100,
    "EXAM_REMINDER": 500,
    "HOMEWORK_DUE": 1000,
    "ATTENDANCE_ALERT": 800
  },
  "last24Hours": {
    "sent": 250,
    "delivered": 245,
    "failed": 5
  }
}
```

---

## 🔧 SYSTEM ADMIN FEATURES

### Overview
**Controller:** `system-admin-user.controller.ts`  
**Access:** `SUPERADMIN`  
**Purpose:** Special admin-only user operations

### 1. CREATE FAMILY UNIT (Minimal Info)

**Endpoint:** `POST /admin/users/family-unit`  
**Access:** `SUPERADMIN`  
**Purpose:** Create student + parents with minimal information (incomplete profile mode)

#### Key Features
- ✅ **Email OR Phone Only** - Don't need complete data
- ✅ **Auto-Generation** - System generates studentId, nameWithInitials
- ✅ **First-Login Flow** - Users complete profile on first login
- ✅ **Bulk Support** - Can create multiple family units at once

#### Request Body (Single Family)
```json
{
  "student": {
    "email": "student@example.com",
    "phoneNumber": null
  },
  "father": {
    "email": null,
    "phoneNumber": "+94771234567"
  },
  "mother": {
    "email": "mother@example.com",
    "phoneNumber": null
  },
  "guardian": null,
  "instituteId": "44"
}
```

#### Request Body (Bulk - Multiple Families)
```json
{
  "families": [
    {
      "student": { "email": "student1@example.com" },
      "father": { "phoneNumber": "+94771234567" },
      "mother": { "email": "mother1@example.com" },
      "instituteId": "44"
    },
    {
      "student": { "email": "student2@example.com" },
      "father": { "phoneNumber": "+94771234568" },
      "mother": { "email": "mother2@example.com" },
      "instituteId": "44"
    }
  ]
}
```

#### What Gets Auto-Generated
1. **Student ID** - Format: `STU-{timestamp}-{random}`
2. **Name with Initials** - Generated from partial name or email
3. **Temporary Password** - System-generated secure password
4. **Profile Completion Status** - Marked as incomplete
5. **Welcome Email/SMS** - Login credentials sent

#### Response
```json
{
  "success": true,
  "created": {
    "student": {
      "id": "500341",
      "email": "student@example.com",
      "studentId": "STU-2025-001",
      "profileComplete": false,
      "temporaryPassword": "TempPass123!"
    },
    "father": {
      "id": "500342",
      "phoneNumber": "+94771234567",
      "profileComplete": false
    },
    "mother": {
      "id": "500343",
      "email": "mother@example.com",
      "profileComplete": false
    }
  },
  "relationships": {
    "studentId": "500341",
    "fatherId": "500342",
    "motherId": "500343",
    "guardianId": null
  },
  "instituteEnrollment": {
    "instituteId": "44",
    "status": "PENDING_VERIFICATION",
    "enrolledAt": "2025-01-31T10:00:00Z"
  }
}
```

---

### 2. BULK USER IMPORT

**Endpoint:** `POST /admin/users/bulk-import`  
**Access:** `SUPERADMIN`  
**Purpose:** Import large number of users from CSV/Excel

#### Request Format (Multipart/Form-Data)
```http
POST /admin/users/bulk-import
Content-Type: multipart/form-data
Authorization: Bearer <jwt_token>

file: users.csv
instituteId: 44
```

#### CSV Format
```csv
email,phoneNumber,firstName,lastName,userType,gender
student1@example.com,+94771234567,John,Doe,USER,MALE
student2@example.com,+94771234568,Jane,Smith,USER,FEMALE
```

#### Response
```json
{
  "success": true,
  "total": 100,
  "created": 95,
  "failed": 5,
  "errors": [
    {
      "row": 10,
      "email": "duplicate@example.com",
      "error": "Email already exists"
    }
  ],
  "summary": {
    "students": 80,
    "parents": 160,
    "teachers": 10
  }
}
```

---

### 3. UPDATE PROFILE IMAGES (Batch)

**Endpoint:** `POST /admin/users/update-profile-images`  
**Access:** `SUPERADMIN`  
**Purpose:** Update multiple user profile images at once

#### Request Body
```json
{
  "updates": [
    {
      "userId": "40",
      "imageUrl": "https://storage.googleapis.com/.../profile1.jpg"
    },
    {
      "userId": "41",
      "imageUrl": "https://storage.googleapis.com/.../profile2.jpg"
    }
  ]
}
```

#### Response
```json
{
  "success": true,
  "updated": 2,
  "failed": 0,
  "results": [
    {
      "userId": "40",
      "status": "SUCCESS",
      "imageUrl": "https://storage.googleapis.com/.../profile1.jpg"
    }
  ]
}
```

---

## 🔒 SECURITY & BEST PRACTICES

### 1. Authentication Flow

#### Admin Login
```http
POST /auth/login
Content-Type: application/json

{
  "email": "admin@example.com",
  "password": "SecurePass123!",
  "rememberMe": true
}
```

#### Response
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIs...",
  "refresh_token": "eyJhbGciOiJIUzI1NiIs...",
  "user": {
    "id": "1",
    "email": "admin@example.com",
    "userType": "SUPERADMIN",
    "firstName": "System",
    "lastName": "Administrator"
  },
  "expiresIn": 3600,
  "tokenType": "Bearer"
}
```

#### Using Access Token
```http
GET /users
Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
```

---

### 2. Permission Validation

#### Guard Decorator Usage
```typescript
// SUPERADMIN only
@RequireAnyOfRoles({ global: [UserType.SUPERADMIN] })

// Institute Admin or SUPERADMIN
@RequireAnyOfRoles({ 
  global: [UserType.SUPERADMIN], 
  instituteAdmin: true 
})

// Teacher with class access
@RequireAnyOfRoles({ 
  teacher: { requireClass: true } 
})
```

---

### 3. API Rate Limiting

#### Default Limits
- **Authentication:** 5 requests/15 minutes (prevent brute force)
- **User Creation:** 10 requests/hour (prevent spam)
- **Bulk Operations:** 2 requests/hour (prevent abuse)
- **General APIs:** 100 requests/15 minutes

#### Custom Throttle
```typescript
@Throttle({ default: { limit: 20, ttl: 900000 } }) // 20 req/15 min
```

---

### 4. Data Masking

#### Automatic Masking in Responses
- **Email:** `john.doe@example.com` → `jo***e@example.com`
- **Phone:** `+94771234567` → `+947*****567`
- **NIC:** `199512345678` → `1995****5678`
- **Password:** Never returned in responses

#### Opt-Out (Admin Only)
```http
GET /users?maskData=false
Authorization: Bearer <admin_token>
```

---

### 5. Audit Logging

#### Logged Operations
- ✅ User creation/deletion/deactivation
- ✅ Institute creation/modification
- ✅ Password changes/resets
- ✅ Permission changes
- ✅ Bulk operations
- ✅ Admin actions (SUPERADMIN operations)

#### Log Format
```json
{
  "timestamp": "2025-01-31T10:30:00Z",
  "action": "USER_DELETED",
  "performedBy": "1",
  "performedByType": "SUPERADMIN",
  "targetUserId": "40",
  "targetUserEmail": "john.doe@example.com",
  "ipAddress": "192.168.1.100",
  "userAgent": "Mozilla/5.0...",
  "success": true,
  "metadata": {
    "reason": "Account closure request",
    "backupCreated": true
  }
}
```

---

### 6. Error Handling

#### Standard Error Response
```json
{
  "statusCode": 403,
  "message": "Insufficient permissions to delete users permanently",
  "error": "Forbidden",
  "timestamp": "2025-01-31T10:30:00Z",
  "path": "/users/40"
}
```

#### Common Error Codes
- **400** - Bad Request (validation failed)
- **401** - Unauthorized (invalid token)
- **403** - Forbidden (insufficient permissions)
- **404** - Not Found (resource doesn't exist)
- **409** - Conflict (duplicate email/phone)
- **422** - Unprocessable Entity (business logic error)
- **500** - Internal Server Error (system error)

---

### 7. Session Management

#### View Active Sessions
```http
GET /auth/sessions?sortBy=createdAt&sortOrder=DESC
Authorization: Bearer <jwt_token>
```

#### Response
```json
{
  "data": [
    {
      "id": "1",
      "platform": "WEB",
      "deviceName": "Chrome on Windows",
      "deviceId": "device_abc123",
      "ipAddress": "192.168.1.100",
      "userAgent": "Mozilla/5.0...",
      "createdAt": "2025-01-31T10:00:00Z",
      "expiresAt": "2025-02-30T10:00:00Z",
      "expiresInHuman": "29 days, 23 hours",
      "isRevoked": false
    }
  ],
  "meta": {
    "page": 1,
    "limit": 20,
    "total": 5
  }
}
```

#### Revoke Specific Session
```http
POST /auth/sessions/revoke/1
Authorization: Bearer <jwt_token>
```

#### Revoke All Sessions (Force Logout)
```http
POST /auth/sessions/revoke-all
Authorization: Bearer <jwt_token>
```

---

### 8. Cache Management

#### User Cache Structure
```typescript
// User Data Cache
Key: `user:40`
Value: {
  id: '40',
  email: 'john.doe@example.com',
  firstName: 'John',
  userType: 'USER_WITHOUT_PARENT',
  // ... full user object
}
TTL: 1 hour

// Phone Lookup Index
Key: `user:phone:+94771234567`
Value: '40' (userId)
TTL: 1 hour

// Email Lookup Index
Key: `user:email:john.doe@example.com`
Value: '40' (userId)
TTL: 1 hour

// RFID Lookup Index
Key: `user:rfid:RFID12345`
Value: '40' (userId)
TTL: 1 hour
```

#### Cache Refresh (Automatic)
- ✅ After user creation
- ✅ After profile update
- ✅ After password change
- ✅ After activation/deactivation
- ✅ After RFID registration

#### Manual Cache Refresh
```typescript
await userManagementService.refreshUserCache(userId);
await userManagementService.setUserIndexes(userId);
```

---

## 📊 DATABASE QUERIES (Direct SQL for Advanced Admin)

### 1. Find All SUPERADMIN Users
```sql
SELECT 
  id, 
  CONCAT(firstName, ' ', lastName) AS fullName,
  email, 
  phoneNumber, 
  createdAt, 
  isActive
FROM users
WHERE userType = 'SUPERADMIN'
ORDER BY createdAt DESC;
```

---

### 2. Find Inactive Accounts (30+ days)
```sql
SELECT 
  u.id,
  u.email,
  u.firstName,
  u.lastName,
  u.lastLoginAt,
  DATEDIFF(NOW(), u.lastLoginAt) AS daysSinceLastLogin
FROM users u
WHERE u.isActive = TRUE
  AND u.lastLoginAt IS NOT NULL
  AND DATEDIFF(NOW(), u.lastLoginAt) > 30
ORDER BY u.lastLoginAt ASC;
```

---

### 3. Find Duplicate Phone Numbers
```sql
SELECT 
  phoneNumber,
  COUNT(*) AS duplicateCount,
  GROUP_CONCAT(id) AS userIds
FROM users
WHERE phoneNumber IS NOT NULL
GROUP BY phoneNumber
HAVING COUNT(*) > 1
ORDER BY duplicateCount DESC;
```

---

### 4. Institute User Count
```sql
SELECT 
  i.id,
  i.instituteName,
  COUNT(DISTINCT iu.userId) AS totalUsers,
  SUM(CASE WHEN u.userType = 'STUDENT' THEN 1 ELSE 0 END) AS studentCount,
  SUM(CASE WHEN u.userType = 'TEACHER' THEN 1 ELSE 0 END) AS teacherCount,
  SUM(CASE WHEN u.userType = 'INSTITUTE_ADMIN' THEN 1 ELSE 0 END) AS adminCount
FROM institutes i
LEFT JOIN institute_user iu ON i.id = iu.instituteId
LEFT JOIN users u ON iu.userId = u.id
WHERE i.isActive = TRUE
GROUP BY i.id, i.instituteName
ORDER BY totalUsers DESC;
```

---

### 5. Users Without Complete Profiles
```sql
SELECT 
  id,
  email,
  phoneNumber,
  firstName,
  lastName,
  userType,
  createdAt
FROM users
WHERE (
  firstName IS NULL OR firstName = '' OR
  lastName IS NULL OR lastName = '' OR
  dateOfBirth IS NULL OR
  gender IS NULL OR
  district IS NULL OR
  province IS NULL
)
AND isActive = TRUE
ORDER BY createdAt DESC;
```

---

### 6. Orphaned Student Records (No Parents)
```sql
SELECT 
  s.userId,
  u.firstName,
  u.lastName,
  u.email,
  s.studentId
FROM students s
JOIN users u ON s.userId = u.id
WHERE s.fatherId IS NULL 
  AND s.motherId IS NULL 
  AND s.guardianId IS NULL
  AND u.isActive = TRUE;
```

---

### 7. Revenue by Institute (Card Orders)
```sql
SELECT 
  i.id,
  i.instituteName,
  COUNT(co.id) AS totalOrders,
  SUM(co.amount) AS totalRevenue,
  SUM(CASE WHEN co.status = 'DELIVERED' THEN 1 ELSE 0 END) AS deliveredOrders,
  AVG(co.amount) AS avgOrderValue
FROM institutes i
LEFT JOIN users u ON u.instituteId = i.id
LEFT JOIN card_orders co ON co.userId = u.id
WHERE co.createdAt >= DATE_SUB(NOW(), INTERVAL 1 YEAR)
GROUP BY i.id, i.instituteName
ORDER BY totalRevenue DESC;
```

---

### 8. Session Analysis (Active Users)
```sql
SELECT 
  u.id,
  u.email,
  u.userType,
  COUNT(rt.id) AS activeSessions,
  MAX(rt.createdAt) AS lastSessionCreated,
  MIN(rt.expiresAt) AS earliestExpiry
FROM users u
JOIN refresh_tokens rt ON u.id = rt.userId
WHERE rt.isRevoked = FALSE 
  AND rt.expiresAt > NOW()
GROUP BY u.id, u.email, u.userType
ORDER BY activeSessions DESC
LIMIT 50;
```

---

## 🚀 QUICK REFERENCE - ADMIN ENDPOINTS

| Operation | Endpoint | Access | Method |
|-----------|----------|--------|--------|
| **USER MANAGEMENT** |
| Create user | `/users/comprehensive` | SA, IA | POST |
| Deactivate user | `/users/:id/deactivate` | SA, IA | PATCH |
| Delete user | `/users/:id` | SA only | DELETE |
| Activate user | `/users/:id/activate` | SA, IA | PATCH |
| Update user | `/users/:id` | SA, IA, Self | PATCH |
| List all users | `/users` | SA only | GET |
| User statistics | `/users/statistics` | SA only | GET |
| **INSTITUTE MANAGEMENT** |
| Create institute | `/institutes` | SA only | POST |
| Update institute | `/institutes/:id` | SA, IA | PATCH |
| Delete institute | `/institutes/:id` | SA only | DELETE |
| Activate institute | `/institutes/:id/activate` | SA, IA | PATCH |
| List institutes | `/institutes` | SA only | GET |
| **CARD MANAGEMENT** |
| Create card order | `/admin/card-orders` | SA only | POST |
| Update order status | `/admin/card-orders/:id/status` | SA only | PATCH |
| Activate card | `/admin/cards/:id/activate` | SA only | PATCH |
| Deactivate card | `/admin/cards/:id` | SA only | DELETE |
| Card statistics | `/admin/cards/statistics` | SA only | GET |
| **NOTIFICATIONS** |
| Send system notification | `/push-notifications/admin/send-system` | SA only | POST |
| Notification history | `/push-notifications/admin/history` | SA only | GET |
| Notification stats | `/push-notifications/admin/statistics` | SA only | GET |
| **SYSTEM ADMIN** |
| Create family unit | `/admin/users/family-unit` | SA only | POST |
| Bulk import users | `/admin/users/bulk-import` | SA only | POST |
| Update profile images | `/admin/users/update-profile-images` | SA only | POST |
| **AUTH & SESSIONS** |
| Change password | `/auth/change-password` | Self | POST |
| View sessions | `/auth/sessions` | Self | GET |
| Revoke session | `/auth/sessions/revoke/:id` | Self | POST |
| Revoke all sessions | `/auth/sessions/revoke-all` | Self | POST |

**Legend:**
- **SA** = SUPERADMIN
- **IA** = INSTITUTE_ADMIN
- **Self** = User can perform on their own account

---

## 📞 SUPPORT & TROUBLESHOOTING

### Common Issues

#### 1. "Insufficient permissions" Error
**Solution:** Verify JWT token contains correct `userType` claim (SUPERADMIN or INSTITUTE_ADMIN)

#### 2. User Deletion Fails
**Solution:** Check for foreign key constraints - may need to delete related records first

#### 3. Bulk Import Errors
**Solution:** Validate CSV format matches template, check for duplicate emails/phones

#### 4. Cache Not Refreshing
**Solution:** Redis connection issue - verify Redis is running and accessible

#### 5. Session Dates Showing Null
**Solution:** Date interceptor issue - verify DataMaskingInterceptor and UrlTransformInterceptor have `instanceof Date` checks

---

## 📝 CHANGELOG

### Version 2.0 (January 31, 2025)
- ✅ Added comprehensive admin features documentation
- ✅ Documented all SUPERADMIN-only endpoints
- ✅ Added card management system documentation
- ✅ Added push notification management
- ✅ Added system admin special features (family unit creation)
- ✅ Added SQL queries for advanced admin operations
- ✅ Added security best practices section
- ✅ Added quick reference table

---

## 🔗 RELATED DOCUMENTATION

- [SESSION_AUTH_COMPLETE_GUIDE.md](./SESSION_AUTH_COMPLETE_GUIDE.md) - Session management & JWT
- [SYSTEM_ADMIN_LOGIN_API_GUIDE.md](./SYSTEM_ADMIN_LOGIN_API_GUIDE.md) - Authentication flows
- [FRONTEND_API_CHANGES_COMPREHENSIVE.md](./FRONTEND_API_CHANGES_COMPREHENSIVE.md) - Frontend integration
- [COMPLETE_SYSTEM_AUDIT.md](./COMPLETE_SYSTEM_AUDIT.md) - System architecture

---

**END OF ADMIN FEATURES COMPLETE GUIDE**
