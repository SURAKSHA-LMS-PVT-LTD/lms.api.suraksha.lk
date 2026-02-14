# 🔐 System Admin API - Complete Documentation

**Last Updated:** February 14, 2026  
**Base URL:** `/admin/users`  
**Access Level:** SUPER_ADMIN only  
**Authentication:** JWT Bearer Token

---

## 📑 Table of Contents

1. [Authentication](#authentication)
2. [Family Unit Management](#family-unit-management)
   - [Create Family Unit](#1-create-family-unit)
   - [Bulk Create Family Units](#2-bulk-create-family-units)
3. [User Profile Management](#user-profile-management)
   - [Get Incomplete Profiles](#3-get-incomplete-profiles)
   - [Complete First Login](#4-complete-first-login)
   - [Resend Welcome Notification](#5-resend-welcome-notification)
4. [Profile Image Management (Student ID)](#profile-image-management-student-id)
   - [Lookup Student](#6-lookup-student-by-student-id)
   - [Generate Upload URL](#7-generate-signed-url-for-profile-image)
   - [Assign Profile Image](#8-assign-profile-image-to-student)
   - [Quick Upload (Combined)](#9-quick-profile-image-url)
5. [Profile Image Management (User ID)](#profile-image-management-user-id)
   - [Lookup User](#10-lookup-user-by-user-id)
   - [Generate Upload URL](#11-generate-upload-url-by-user-id)
   - [Assign Profile Image](#12-assign-profile-image-by-user-id)
   - [Quick Upload](#13-quick-upload-by-user-id)
6. [Image Verification](#image-verification)
   - [Get Unverified Users](#14-get-unverified-users)
   - [Approve User Image](#15-approve-user-profile-image)
   - [Reject User Image](#16-reject-user-profile-image)
7. [Card Management](#card-management)
   - [Get Card Info](#17-get-user-card-info)
   - [Assign Normal Card](#18-assign-normal-card)
   - [Update Card Status](#19-update-card-status)
   - [Lookup User by Card](#20-lookup-user-by-card-id)
8. [Push Notification Management](#push-notification-management)
   - [Create Notification](#21-create-push-notification)
   - [Get All Notifications](#22-get-all-notifications)
   - [Get Notification by ID](#23-get-notification-by-id)
   - [Send/Resend Notification](#24-send-notification)
   - [Resend Failed Notification](#25-resend-failed-notification)
   - [Cancel Notification](#26-cancel-notification)
   - [Delete Notification](#27-delete-notification)
9. [Error Codes](#error-codes)
10. [Best Practices](#best-practices)

---

## 🔑 Authentication

All endpoints require:
- **JWT Bearer Token** in Authorization header
- **SUPER_ADMIN** role

```http
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

---

## 👨‍👩‍👧 Family Unit Management

### 1. Create Family Unit

**Creates a complete family (student + parents) in ONE transaction**

```http
POST /admin/users/family-unit
Content-Type: application/json
Authorization: Bearer {token}
```

#### Request Body

```json
{
  "student": {
    "firstName": "Kasun",
    "lastName": "Perera",
    "phoneNumber": "+94771234567",
    "email": "kasun@example.com",
    "dateOfBirth": "2010-05-15",
    "gender": "MALE",
    "studentId": "STU-2026-001"
  },
  "father": {
    "firstName": "Nimal",
    "lastName": "Perera",
    "phoneNumber": "+94772345678",
    "email": "nimal@example.com",
    "nic": "198512345678"
  },
  "mother": {
    "firstName": "Kumari",
    "lastName": "Perera",
    "phoneNumber": "+94773456789",
    "email": "kumari@example.com"
  },
  "guardian": {
    "firstName": "Uncle",
    "phoneNumber": "+94774567890"
  },
  "sendWelcomeNotifications": true,
  "instituteCode": "INST-20260122-001"
}
```

#### Minimal Requirements

Each user **only needs ONE of**:
- ✅ `email` OR
- ✅ `phoneNumber`

All other fields are optional!

#### Field Details

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `student.firstName` | string | ❌ | Student first name |
| `student.lastName` | string | ❌ | Student last name |
| `student.email` | string | ⚠️ | Email (required if no phone) |
| `student.phoneNumber` | string | ⚠️ | Phone (required if no email) |
| `student.studentId` | string | ❌ | Auto-generated if not provided |
| `student.dateOfBirth` | string | ❌ | Format: YYYY-MM-DD |
| `student.gender` | enum | ❌ | MALE, FEMALE, OTHER |
| `father.*` | object | ❌ | Optional father details |
| `mother.*` | object | ❌ | Optional mother details |
| `guardian.*` | object | ❌ | Optional guardian details |
| `sendWelcomeNotifications` | boolean | ❌ | Default: true |
| `instituteCode` | string | ❌ | Auto-assign to institute |

#### Response (201 Created)

```json
{
  "success": true,
  "student": {
    "id": "500364",
    "studentId": "STU-2026-001",
    "firstName": "Kasun",
    "lastName": "Perera",
    "email": "kasun@example.com",
    "phoneNumber": "+94771234567",
    "profileCompletionStatus": "COMPLETE",
    "profileCompletionPercentage": 100,
    "cardId": "CARD-2026-00042",
    "cardStatus": "ACTIVE",
    "cardExpiryDate": "2028-02-14T00:00:00.000Z"
  },
  "father": {
    "id": "500365",
    "relationship": "FATHER",
    "isExisting": false
  },
  "mother": {
    "id": "500366",
    "relationship": "MOTHER",
    "isExisting": false
  },
  "guardian": {
    "id": "500367",
    "relationship": "GUARDIAN",
    "isExisting": false
  },
  "notifications": [
    {
      "userId": "500364",
      "method": "email",
      "sent": true
    },
    {
      "userId": "500365",
      "method": "sms",
      "sent": true
    }
  ]
}
```

#### Auto Features

✅ **Student ID** auto-generated: `STU-YYYY-NNNNN`  
✅ **Card ID** auto-generated: `CARD-YYYY-NNNNN`  
✅ **Card Status** set to ACTIVE  
✅ **Card Expiry** set to +2 years  
✅ **Name with Initials** generated from first/last name  
✅ **Existing Parents** reused if email/phone matches  
✅ **Welcome Emails/SMS** sent automatically  
✅ **ID Card PDF** generated and sent via email

---

### 2. Bulk Create Family Units

**Create multiple families in batch**

```http
POST /admin/users/family-units/bulk
Content-Type: application/json
Authorization: Bearer {token}
```

#### Request Body

```json
{
  "families": [
    {
      "student": {
        "firstName": "Student1",
        "phoneNumber": "+94771111111"
      },
      "father": {
        "firstName": "Father1",
        "phoneNumber": "+94772222222"
      }
    },
    {
      "student": {
        "firstName": "Student2",
        "email": "student2@example.com"
      }
    }
  ],
  "sendWelcomeNotifications": true,
  "continueOnError": true
}
```

#### Response (201 Created)

```json
{
  "success": true,
  "total": 2,
  "successCount": 2,
  "failureCount": 0,
  "results": [
    {
      "index": 0,
      "success": true,
      "student": { "id": "500364", "studentId": "STU-2026-001" }
    },
    {
      "index": 1,
      "success": true,
      "student": { "id": "500365", "studentId": "STU-2026-002" }
    }
  ],
  "errors": []
}
```

---

## 👤 User Profile Management

### 3. Get Incomplete Profiles

**List users who haven't completed first-login**

```http
GET /admin/users/incomplete-profiles?page=1&limit=20&createdByAdminId=1
Authorization: Bearer {token}
```

#### Query Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `page` | number | ❌ | 1 | Page number |
| `limit` | number | ❌ | 20 | Items per page |
| `createdByAdminId` | string | ❌ | - | Filter by admin who created |

#### Response (200 OK)

```json
{
  "data": [
    {
      "id": "500320",
      "firstName": "John",
      "lastName": "Doe",
      "email": "john@example.com",
      "phoneNumber": "+94771234567",
      "profileCompletionStatus": "INCOMPLETE",
      "profileCompletionPercentage": 45,
      "createdAt": "2026-02-14T10:30:00.000Z",
      "createdByAdmin": {
        "id": "1",
        "firstName": "Super",
        "lastName": "Admin"
      }
    }
  ],
  "total": 15,
  "page": 1,
  "limit": 20,
  "totalPages": 1
}
```

---

### 4. Complete First Login

**Allows incomplete user to set password and complete profile**

```http
PATCH /admin/users/first-login/{userId}
Content-Type: application/json
Authorization: Bearer {token}
```

#### Request Body

```json
{
  "password": "SecurePass123!",
  "firstName": "John",
  "lastName": "Doe",
  "dateOfBirth": "2000-01-15",
  "gender": "MALE"
}
```

#### Response (200 OK)

```json
{
  "success": true,
  "message": "First login completed successfully",
  "canLogin": true,
  "user": {
    "id": "500320",
    "profileCompletionStatus": "COMPLETE",
    "profileCompletionPercentage": 100
  }
}
```

---

### 5. Resend Welcome Notification

**Resend first-login email/SMS to incomplete user**

```http
POST /admin/users/{userId}/resend-welcome
Authorization: Bearer {token}
```

#### Response (200 OK)

```json
{
  "success": true,
  "message": "Welcome notification sent successfully",
  "sentMethods": ["email", "sms"]
}
```

---

## 📸 Profile Image Management (Student ID)

### 6. Lookup Student by Student ID

**Find student by studentId to verify before uploading image**

```http
GET /admin/users/student/lookup/{studentId}
Authorization: Bearer {token}
```

#### Example

```http
GET /admin/users/student/lookup/STU-2026-001
```

#### Response (200 OK)

```json
{
  "userId": "500364",
  "studentId": "STU-2026-001",
  "firstName": "Kasun",
  "lastName": "Perera",
  "email": "kasun@example.com",
  "phoneNumber": "+94771234567",
  "imageUrl": "https://storage.googleapis.com/bucket/user-profiles/profile-abc123.jpg",
  "imageVerificationStatus": "PENDING"
}
```

---

### 7. Generate Signed URL for Profile Image

**Step 1: Get pre-signed URL for direct cloud upload**

```http
POST /admin/users/student/profile-image/generate-url
Content-Type: application/json
Authorization: Bearer {token}
```

#### Request Body

```json
{
  "studentId": "STU-2026-001",
  "fileName": "profile.jpg",
  "contentType": "image/jpeg",
  "fileSize": 1048576
}
```

#### Supported Formats
- ✅ `image/jpeg` (.jpg, .jpeg)
- ✅ `image/png` (.png)
- ✅ `image/gif` (.gif)
- ✅ `image/webp` (.webp)

#### Max File Size: 5MB

#### Response (200 OK)

```json
{
  "uploadUrl": "https://storage.googleapis.com/bucket/user-profiles/profile-xyz789.jpg?X-Goog-Signature=...",
  "publicUrl": "https://storage.googleapis.com/bucket/user-profiles/profile-xyz789.jpg",
  "relativePath": "user-profiles/profile-xyz789.jpg",
  "expiresAt": "2026-02-14T11:30:00.000Z",
  "expiresIn": 600
}
```

#### Upload the File

```bash
# Upload using curl
curl -X PUT "https://storage.googleapis.com/..." \
  -H "Content-Type: image/jpeg" \
  --data-binary @profile.jpg

# Upload using PowerShell
Invoke-RestMethod -Uri "uploadUrl" -Method PUT `
  -ContentType "image/jpeg" `
  -InFile "profile.jpg"
```

---

### 8. Assign Profile Image to Student

**Step 2: After upload, assign image to student profile**

```http
POST /admin/users/student/profile-image/assign
Content-Type: application/json
Authorization: Bearer {token}
```

#### Request Body

```json
{
  "studentId": "STU-2026-001",
  "relativePath": "user-profiles/profile-xyz789.jpg"
}
```

#### Response (200 OK)

```json
{
  "success": true,
  "message": "Profile image assigned successfully",
  "user": {
    "id": "500364",
    "studentId": "STU-2026-001",
    "imageUrl": "https://storage.googleapis.com/bucket/user-profiles/profile-xyz789.jpg",
    "imageVerificationStatus": "PENDING"
  }
}
```

---

### 9. Quick Profile Image URL

**Shortcut: Get upload URL with studentId in path**

```http
POST /admin/users/student/{studentId}/profile-image
Content-Type: application/json
Authorization: Bearer {token}
```

#### Example

```http
POST /admin/users/student/STU-2026-001/profile-image

{
  "fileName": "profile.jpg",
  "contentType": "image/jpeg",
  "fileSize": 1048576
}
```

---

## 🆔 Profile Image Management (User ID)

### 10. Lookup User by User ID

```http
GET /admin/users/lookup/{userId}
Authorization: Bearer {token}
```

#### Example

```http
GET /admin/users/lookup/500364
```

---

### 11. Generate Upload URL by User ID

```http
POST /admin/users/profile-image/generate-url
Content-Type: application/json
Authorization: Bearer {token}
```

#### Request Body

```json
{
  "userId": 500364,
  "fileName": "profile.jpg",
  "contentType": "image/jpeg",
  "fileSize": 1048576
}
```

---

### 12. Assign Profile Image by User ID

```http
POST /admin/users/profile-image/assign
Content-Type: application/json
Authorization: Bearer {token}
```

#### Request Body

```json
{
  "userId": 500364,
  "relativePath": "user-profiles/profile-xyz789.jpg"
}
```

---

### 13. Quick Upload by User ID

```http
POST /admin/users/{userId}/profile-image
Content-Type: application/json
Authorization: Bearer {token}
```

#### Example

```http
POST /admin/users/500364/profile-image

{
  "fileName": "profile.jpg",
  "contentType": "image/jpeg"
}
```

---

## ✅ Image Verification

### 14. Get Unverified Users

**List users with pending image verification**

```http
GET /admin/users/unverified?page=1&limit=20&status=PENDING
Authorization: Bearer {token}
```

#### Query Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `page` | number | ❌ | Page number (default: 1) |
| `limit` | number | ❌ | Items per page (default: 20) |
| `status` | enum | ❌ | PENDING, VERIFIED, REJECTED |

#### Response (200 OK)

```json
{
  "data": [
    {
      "id": "500364",
      "firstName": "Kasun",
      "lastName": "Perera",
      "email": "kasun@example.com",
      "imageUrl": "https://storage.googleapis.com/bucket/user-profiles/profile-abc.jpg",
      "imageVerificationStatus": "PENDING",
      "imageUploadedAt": "2026-02-14T10:00:00.000Z",
      "student": {
        "studentId": "STU-2026-001"
      }
    }
  ],
  "total": 5,
  "page": 1,
  "limit": 20,
  "totalPages": 1
}
```

---

### 15. Approve User Profile Image

**Approve pending image and send confirmation email**

```http
POST /admin/users/{userId}/approve-image
Content-Type: application/json
Authorization: Bearer {token}
```

#### Request Body

```json
{
  "notes": "Image approved - clear photo with proper lighting"
}
```

#### Response (200 OK)

```json
{
  "success": true,
  "message": "User image approved successfully",
  "user": {
    "id": "500364",
    "imageVerificationStatus": "VERIFIED",
    "imageVerifiedAt": "2026-02-14T11:00:00.000Z",
    "imageVerifiedBy": "1"
  },
  "cardGenerated": true,
  "cardId": "CARD-2026-00042",
  "emailSent": true
}
```

**Features:**
- ✅ Sets `imageVerificationStatus` to `VERIFIED`
- ✅ Generates card ID if not exists
- ✅ Sends ID card PDF via email (for students)
- ✅ Records admin who approved

---

### 16. Reject User Profile Image

**Reject image, delete from storage, send re-upload link**

```http
POST /admin/users/{userId}/reject-image
Content-Type: application/json
Authorization: Bearer {token}
```

#### Request Body

```json
{
  "reason": "Poor image quality - please upload a clearer photo with good lighting",
  "notes": "Photo is too dark and blurry"
}
```

#### Response (200 OK)

```json
{
  "success": true,
  "message": "User image rejected successfully",
  "user": {
    "id": "500364",
    "imageVerificationStatus": "REJECTED",
    "imageRejectionReason": "Poor image quality"
  },
  "imageDeleted": true,
  "reUploadDetails": {
    "uploadUrl": "https://storage.googleapis.com/...",
    "expiresAt": "2026-02-21T11:00:00.000Z",
    "expiresInDays": 7
  },
  "emailSent": true
}
```

**Features:**
- ✅ Deletes rejected image from cloud storage
- ✅ Generates 7-day upload URL for re-upload
- ✅ Sends email with reason + upload link
- ✅ Records rejection reason and admin

---

## 🎴 Card Management

### 17. Get User Card Info

**View both normal (QR/barcode) + RFID card details**

```http
GET /admin/users/{userId}/card-info
Authorization: Bearer {token}
```

#### Response (200 OK)

```json
{
  "userId": "500364",
  "normalCard": {
    "cardId": "CARD-2026-00042",
    "cardStatus": "ACTIVE",
    "cardExpiryDate": "2028-02-14T00:00:00.000Z"
  },
  "rfidCard": {
    "rfid": "NFC-ABC123",
    "rfidCardStatus": "ACTIVE",
    "rfidExpiryDate": "2027-12-31T00:00:00.000Z"
  },
  "user": {
    "firstName": "Kasun",
    "lastName": "Perera",
    "studentId": "STU-2026-001"
  }
}
```

---

### 18. Assign Normal Card

**Assign QR/barcode card to user**

```http
POST /admin/users/{userId}/assign-card
Content-Type: application/json
Authorization: Bearer {token}
```

#### Request Body

```json
{
  "cardId": "CARD-2026-00050",
  "cardExpiryDate": "2028-12-31"
}
```

#### Response (200 OK)

```json
{
  "success": true,
  "message": "Normal card assigned successfully",
  "user": {
    "id": "500364",
    "cardId": "CARD-2026-00050",
    "cardStatus": "ACTIVE",
    "cardExpiryDate": "2028-12-31T00:00:00.000Z"
  },
  "previousCard": {
    "cardId": "CARD-2026-00042",
    "status": "REPLACED"
  }
}
```

**Features:**
- ✅ Auto-replaces old card (sets to REPLACED)
- ✅ Sets new card to ACTIVE
- ✅ Optional expiry date (default: +2 years)

---

### 19. Update Card Status

**Change card status independently for normal or RFID**

```http
PATCH /admin/users/{userId}/card-status
Content-Type: application/json
Authorization: Bearer {token}
```

#### Request Body

```json
{
  "cardType": "normal",
  "status": "DEACTIVATED"
}
```

#### Card Types
- `normal` - QR/barcode card
- `rfid` - NFC/RFID card

#### Card Statuses
- `ACTIVE` - Card is working
- `INACTIVE` - Temporarily disabled
- `DEACTIVATED` - User deactivated (can reactivate)
- `EXPIRED` - Past expiry date
- `LOST` - Reported lost
- `DAMAGED` - Card damaged
- `REPLACED` - New card issued

#### Response (200 OK)

```json
{
  "success": true,
  "message": "Card status updated successfully",
  "cardType": "normal",
  "user": {
    "id": "500364",
    "cardId": "CARD-2026-00050",
    "cardStatus": "DEACTIVATED",
    "cardExpiryDate": "2028-12-31T00:00:00.000Z"
  }
}
```

**Note:** Normal and RFID cards are **independent** - deactivating one doesn't affect the other!

---

### 20. Lookup User by Card ID

**Find user by normal card ID or RFID**

```http
GET /admin/users/card-lookup/{cardId}
Authorization: Bearer {token}
```

#### Examples

```http
GET /admin/users/card-lookup/CARD-2026-00050
GET /admin/users/card-lookup/NFC-ABC123
```

#### Response (200 OK)

```json
{
  "found": true,
  "matchType": "normal_card",
  "user": {
    "id": "500364",
    "firstName": "Kasun",
    "lastName": "Perera",
    "email": "kasun@example.com",
    "studentId": "STU-2026-001"
  },
  "normalCard": {
    "cardId": "CARD-2026-00050",
    "cardStatus": "ACTIVE",
    "cardExpiryDate": "2028-12-31T00:00:00.000Z"
  },
  "rfidCard": {
    "rfid": null,
    "rfidCardStatus": null
  }
}
```

#### Match Types
- `normal_card` - Found by normal card ID
- `rfid` - Found by RFID number
- `not_found` - No match

---

## 🔔 Push Notification Management

### 21. Create Push Notification

**Send notifications to users based on scope (global, institute, class, subject)**

```http
POST /push-notifications/admin
Content-Type: application/json
Authorization: Bearer {token}
```

#### Access Control

| User Type | Global | Institute | Class | Subject |
|-----------|--------|-----------|-------|---------|
| SUPERADMIN | ✅ | ✅ | ✅ | ✅ |
| Institute Admin | ❌ | ✅ | ✅ | ✅ |
| Teacher | ❌ | ❌ | ✅ | ✅ |

#### Request Body

```json
{
  "title": "Important Announcement",
  "body": "Classes will be cancelled tomorrow due to weather conditions.",
  "imageUrl": "https://example.com/notification-image.jpg",
  "icon": "ic_announcement",
  "actionUrl": "app://announcements/123",
  "dataPayload": {
    "announcementId": "123",
    "type": "general"
  },
  "scope": "GLOBAL",
  "targetUserTypes": ["ALL"],
  "instituteId": "109",
  "classId": "1004",
  "subjectId": "8",
  "priority": "HIGH",
  "collapseKey": "announcement_general",
  "timeToLive": 86400,
  "scheduledAt": "2026-02-15T10:00:00.000Z",
  "sendImmediately": true
}
```

#### Notification Scopes

| Scope | Description | Required Fields | Example Use Case |
|-------|-------------|----------------|-----------------|
| `GLOBAL` | System-wide (all users) | None | System maintenance notice |
| `INSTITUTE` | All users in institute | `instituteId` | Institute-wide exam announcement |
| `CLASS` | All users in class | `instituteId`, `classId` | Class trip notification |
| `SUBJECT` | All users in subject | `instituteId`, `classId`, `subjectId` | Homework deadline |

#### Target User Types

| Type | Description |
|------|-------------|
| `ALL` | All users (default) |
| `STUDENTS` | Only students |
| `TEACHERS` | Only teachers |
| `PARENTS` | Only parents |
| `ATTENDANCE_MARKERS` | Only attendance markers |
| `INSTITUTE_ADMINS` | Only institute admins |
| `USERS_WITHOUT_INSTITUTE` | Users not enrolled in any institute |
| `USERS_WITHOUT_PARENT` | Users who cannot be parents |
| `USERS_WITHOUT_STUDENT` | Users who cannot be students |
| `VERIFIED_USERS_ONLY` | Only email-verified users |
| `UNVERIFIED_USERS_ONLY` | Only unverified users |

#### Priority Levels

| Priority | Description | FCM Priority |
|----------|-------------|--------------|
| `HIGH` | Urgent notifications | High (wakes device) |
| `NORMAL` | Regular notifications | Normal (default) |
| `LOW` | Non-urgent notifications | Normal |

#### Response (201 Created)

```json
{
  "id": "35",
  "title": "Important Announcement",
  "body": "Classes will be cancelled tomorrow due to weather conditions.",
  "imageUrl": "https://example.com/notification-image.jpg",
  "icon": "ic_announcement",
  "actionUrl": "app://announcements/123",
  "dataPayload": {
    "announcementId": "123",
    "type": "general"
  },
  "scope": "GLOBAL",
  "targetUserTypes": ["ALL"],
  "instituteId": null,
  "institute": null,
  "classId": null,
  "class": null,
  "subjectId": null,
  "subject": null,
  "priority": "HIGH",
  "status": "SENT",
  "collapseKey": "announcement_general",
  "timeToLive": 86400,
  "scheduledAt": null,
  "sentAt": "2026-02-14T23:15:38.000Z",
  "senderId": "1",
  "senderRole": "SYSTEM_ADMIN",
  "sender": {
    "id": "1",
    "firstName": "Super",
    "lastName": "Admin",
    "email": "admin@example.com",
    "userType": "SUPER_ADMIN"
  },
  "totalRecipients": 22,
  "sentCount": 7,
  "failedCount": 0,
  "readCount": 0,
  "createdAt": "2026-02-14T23:15:27.000Z",
  "updatedAt": "2026-02-14T23:15:38.000Z"
}
```

#### Notification Statuses

| Status | Description |
|--------|-------------|
| `DRAFT` | Created but not sent |
| `SCHEDULED` | Scheduled for future sending |
| `SENDING` | Currently being sent |
| `SENT` | Successfully sent |
| `FAILED` | Failed to send |
| `CANCELLED` | Cancelled by admin |

---

### 22. Get All Notifications

**List all notifications with filters and pagination**

```http
GET /push-notifications/admin?page=1&limit=20&scope=GLOBAL&status=SENT
Authorization: Bearer {token}
```

#### Query Parameters

| Parameter | Type | Required | Description | Example |
|-----------|------|----------|-------------|---------|
| `page` | number | ❌ | Page number (default: 1) | `1` |
| `limit` | number | ❌ | Items per page (default: 20, max: 100) | `20` |
| `scope` | enum | ❌ | Filter by scope | `GLOBAL`, `INSTITUTE` |
| `status` | enum | ❌ | Filter by status | `SENT`, `FAILED` |
| `instituteId` | string | ❌ | Filter by institute | `109` |
| `classId` | string | ❌ | Filter by class | `1004` |
| `subjectId` | string | ❌ | Filter by subject | `8` |
| `senderId` | string | ❌ | Filter by sender | `1` |

#### Response (200 OK)

```json
{
  "data": [
    {
      "id": "35",
      "title": "Important Announcement",
      "body": "Classes will be cancelled tomorrow...",
      "scope": "GLOBAL",
      "status": "SENT",
      "priority": "HIGH",
      "totalRecipients": 22,
      "sentCount": 7,
      "failedCount": 0,
      "readCount": 0,
      "sentAt": "2026-02-14T23:15:38.000Z",
      "sender": {
        "id": "1",
        "firstName": "Super",
        "lastName": "Admin"
      },
      "createdAt": "2026-02-14T23:15:27.000Z"
    }
  ],
  "total": 35,
  "page": 1,
  "limit": 20,
  "totalPages": 2
}
```

---

### 23. Get Notification by ID

**Get detailed information about a specific notification**

```http
GET /push-notifications/admin/{id}
Authorization: Bearer {token}
```

#### Response (200 OK)

Same as Create Notification response with full details including institute, class, subject relations.

---

### 24. Send Notification

**Manually send or resend a draft notification**

```http
POST /push-notifications/admin/{id}/send
Authorization: Bearer {token}
```

#### Use Cases
- Send a draft notification immediately
- Retry sending a failed notification
- Schedule notification for later

#### Response (200 OK)

```json
{
  "success": true,
  "notificationId": "35",
  "totalRecipients": 22,
  "sentCount": 7,
  "failedCount": 0,
  "usersWithoutTokens": 15,
  "usersWithTokens": 7,
  "message": "Notification sent successfully",
  "details": {
    "targetedUsers": 22,
    "usersWithTokens": 7,
    "usersWithoutTokens": 15,
    "successfulSends": 7,
    "failedSends": 0,
    "deliveryRate": "100.0%"
  }
}
```

---

### 25. Resend Failed Notification

**Retry sending a failed notification**

```http
POST /push-notifications/admin/{id}/resend
Authorization: Bearer {token}
```

**Requirements:**
- ✅ Notification status must be `FAILED`
- ❌ Cannot resend `SENT` notifications

#### Response (200 OK)

Same as Send Notification response.

---

### 26. Cancel Notification

**Cancel a draft or scheduled notification**

```http
PUT /push-notifications/admin/{id}/cancel
Authorization: Bearer {token}
```

**Requirements:**
- ✅ Can cancel `DRAFT` or `SCHEDULED` notifications
- ❌ Cannot cancel `SENT`, `SENDING`, or `FAILED` notifications

#### Response (200 OK)

```json
{
  "message": "Notification cancelled successfully"
}
```

---

### 27. Delete Notification

**Permanently delete a notification**

```http
DELETE /push-notifications/admin/{id}
Authorization: Bearer {token}
```

**Access:**
- ✅ SUPERADMIN - Can delete any notification
- ✅ Institute Admin - Can delete institute-level notifications

#### Response (200 OK)

```json
{
  "message": "Notification deleted successfully"
}
```

---

### Notification Examples

#### Example 1: Global Announcement (SUPERADMIN only)

```json
{
  "title": "System Maintenance",
  "body": "The system will be under maintenance from 2 AM to 4 AM tonight.",
  "scope": "GLOBAL",
  "targetUserTypes": ["ALL"],
  "priority": "HIGH",
  "sendImmediately": true
}
```

#### Example 2: Institute-Wide Notification

```json
{
  "title": "Exam Schedule Released",
  "body": "Final exam schedule has been published. Check your dashboard for details.",
  "scope": "INSTITUTE",
  "targetUserTypes": ["STUDENTS", "PARENTS"],
  "instituteId": "109",
  "priority": "HIGH",
  "actionUrl": "app://exams/schedule",
  "sendImmediately": true
}
```

#### Example 3: Class-Specific Notification

```json
{
  "title": "Class Trip Tomorrow",
  "body": "Don't forget about the science museum trip tomorrow at 9 AM!",
  "scope": "CLASS",
  "targetUserTypes": ["STUDENTS", "PARENTS"],
  "instituteId": "109",
  "classId": "1004",
  "priority": "NORMAL",
  "scheduledAt": "2026-02-15T07:00:00.000Z",
  "sendImmediately": false
}
```

#### Example 4: Subject Homework Reminder

```json
{
  "title": "Math Homework Due",
  "body": "Reminder: Chapter 5 exercises are due tomorrow by 5 PM.",
  "scope": "SUBJECT",
  "targetUserTypes": ["STUDENTS"],
  "instituteId": "109",
  "classId": "1004",
  "subjectId": "8",
  "priority": "NORMAL",
  "actionUrl": "app://homework/123",
  "dataPayload": {
    "homeworkId": "123",
    "dueDate": "2026-02-15T17:00:00.000Z"
  },
  "sendImmediately": true
}
```

#### Example 5: Scheduled Notification

```json
{
  "title": "Good Morning!",
  "body": "Have a great day at school today!",
  "scope": "INSTITUTE",
  "targetUserTypes": ["STUDENTS"],
  "instituteId": "109",
  "priority": "LOW",
  "scheduledAt": "2026-02-15T06:00:00.000Z",
  "sendImmediately": false
}
```

---

## ⚠️ Error Codes

| Status | Code | Description |
|--------|------|-------------|
| 400 | `BAD_REQUEST` | Invalid request body or parameters |
| 401 | `UNAUTHORIZED` | Missing or invalid JWT token |
| 403 | `FORBIDDEN` | User is not SUPER_ADMIN |
| 404 | `NOT_FOUND` | User, student, or card not found |
| 409 | `CONFLICT` | Email/phone already exists |
| 413 | `PAYLOAD_TOO_LARGE` | File size exceeds 5MB |
| 415 | `UNSUPPORTED_MEDIA_TYPE` | Invalid image format |
| 422 | `UNPROCESSABLE_ENTITY` | Validation error |
| 500 | `INTERNAL_SERVER_ERROR` | Server error |

### Error Response Format

```json
{
  "statusCode": 400,
  "message": "Validation failed",
  "error": "Bad Request",
  "details": [
    "email must be a valid email address",
    "phoneNumber must match E.164 format"
  ]
}
```

---

## 💡 Best Practices

### 1. Family Creation
- ✅ Always provide at least email OR phone for student
- ✅ Use `sendWelcomeNotifications: true` for new users
- ✅ Set `continueOnError: true` for bulk imports to process all records
- ✅ Provide instituteCode to auto-assign students

### 2. Profile Images
- ✅ Call `/lookup` first to verify user exists
- ✅ Upload images directly to signed URL (don't send through API)
- ✅ Call `/assign` immediately after upload
- ✅ Use 7-day URL expiry for user-facing re-upload links
- ✅ Compress images to < 2MB for faster upload

### 3. Image Verification
- ✅ Review PENDING images within 24 hours
- ✅ Provide clear rejection reasons for users
- ✅ Approve immediately to generate ID cards
- ⚠️ Rejected images are DELETED - cannot undo

### 4. Card Management
- ✅ Check card info before assigning new card
- ✅ Use `REPLACED` status when issuing new card
- ✅ Normal and RFID cards are independent
- ✅ Set expiry dates for security (2-3 years typical)
- ⚠️ LOST/DAMAGED cards should be replaced, not reactivated

### 5. Performance
- ✅ Use bulk create for >10 families
- ✅ Paginate incomplete profiles (limit: 50 max)
- ✅ Cache card lookups for attendance systems
- ✅ Use studentId for lookups (faster than user ID)

### 6. Security
- ✅ Rotate SUPER_ADMIN tokens regularly
- ✅ Log all card status changes
- ✅ Verify image content before approval
- ✅ Don't expose upload URLs publicly (10min expiry)
- ⚠️ Never store signed URLs in database

### 7. Push Notifications
- ✅ Use `HIGH` priority only for urgent/time-sensitive notifications
- ✅ Set `sendImmediately: false` + `scheduledAt` for future delivery
- ✅ Target specific user types to reduce spam (avoid `ALL` unless necessary)
- ✅ Use `collapseKey` to group related notifications (e.g., "homework_reminders")
- ✅ Set appropriate `timeToLive` (default: 24 hours, max: 28 days)
- ✅ Include `actionUrl` for deep linking to app content
- ✅ Keep title under 50 chars, body under 200 chars for mobile display
- ✅ Test notifications with small groups before sending to all users
- ⚠️ Cannot unsend notifications once sent
- ⚠️ Review delivery rate - low rates indicate FCM token issues

### 8. Performance
- ✅ Bulk send optimized: 500+ users in ~2-3 seconds
- ✅ Use `scope: INSTITUTE/CLASS/SUBJECT` instead of targeting individual users
- ✅ Schedule non-urgent notifications during off-peak hours
- ✅ Monitor `sentCount` vs `totalRecipients` to track token health
- ✅ Paginate notification lists (limit: 100 max per page)

---

## 📊 Common Workflows

### Workflow 1: Onboard New Student with Family

```bash
# Step 1: Create family unit
POST /admin/users/family-unit
{
  "student": { "firstName": "Student", "phoneNumber": "+94771234567" },
  "father": { "firstName": "Father", "phoneNumber": "+94772345678" },
  "sendWelcomeNotifications": true
}

# Step 2: Get student ID from response
# studentId: "STU-2026-001"

# Step 3: Upload profile image
POST /admin/users/student/profile-image/generate-url
{ "studentId": "STU-2026-001", "fileName": "photo.jpg", "contentType": "image/jpeg" }

# Step 4: Upload to signed URL
PUT https://storage.googleapis.com/... (uploadUrl from step 3)

# Step 5: Assign image
POST /admin/users/student/profile-image/assign
{ "studentId": "STU-2026-001", "relativePath": "user-profiles/..." }

# Step 6: Approve image
POST /admin/users/500364/approve-image
{ "notes": "Image approved" }

# Done! Student has card ID and can use attendance system
```

### Workflow 2: Bulk Import Students

```bash
# Step 1: Prepare CSV data
# Convert to JSON array

# Step 2: Bulk create
POST /admin/users/family-units/bulk
{
  "families": [ /* 100 families */ ],
  "continueOnError": true
}

# Step 3: Check results
# Review errors array for failed records

# Step 4: Re-attempt failed records individually
```

### Workflow 3: Handle Rejected Image

```bash
# Step 1: User uploads poor quality image
# Admin reviews unverified images

# Step 2: Reject image
POST /admin/users/500364/reject-image
{
  "reason": "Poor lighting and blurry photo",
  "notes": "Please ensure good lighting"
}

# Step 3: User receives email with 7-day upload link
# User re-uploads via the link

# Step 4: Admin approves new image
POST /admin/users/500364/approve-image
```

### Workflow 4: Replace Lost Card

```bash
# Step 1: Mark old card as lost
PATCH /admin/users/500364/card-status
{ "cardType": "normal", "status": "LOST" }

# Step 2: Assign new card
POST /admin/users/500364/assign-card
{ "cardId": "CARD-2026-00999", "cardExpiryDate": "2028-12-31" }

# Done! Old card is REPLACED, new card is ACTIVE
```

### Workflow 5: Send Institute-Wide Emergency Alert

```bash
# Step 1: Create urgent notification
POST /push-notifications/admin
{
  "title": "URGENT: School Closed Today",
  "body": "Due to severe weather, school is closed today. All activities cancelled.",
  "scope": "INSTITUTE",
  "instituteId": "109",
  "targetUserTypes": ["STUDENTS", "PARENTS", "TEACHERS"],
  "priority": "HIGH",
  "sendImmediately": true
}

# Step 2: Check delivery status
GET /push-notifications/admin/35

# Response shows:
# - totalRecipients: 500
# - sentCount: 450
# - deliveryRate: 90%

# Done! Emergency alert sent to entire institute
```

### Workflow 6: Schedule Daily Morning Announcements

```bash
# Create scheduled notification for tomorrow 7 AM
POST /push-notifications/admin
{
  "title": "Good Morning! 🌅",
  "body": "Today's cafeteria menu: Rice & Curry, Sandwich, Fruit Salad",
  "scope": "INSTITUTE",
  "instituteId": "109",
  "targetUserTypes": ["STUDENTS"],
  "priority": "LOW",
  "scheduledAt": "2026-02-15T07:00:00.000Z",
  "sendImmediately": false
}

# Notification saved with status: SCHEDULED
# Will automatically send at 7 AM tomorrow

# To cancel before sending:
PUT /push-notifications/admin/36/cancel
```

### Workflow 7: Notify Parents of Low Attendance

```bash
# Step 1: Query students with low attendance (separate API)
# Get list of student IDs: [500364, 500365, 500366]

# Step 2: Create targeted notification
POST /push-notifications/admin
{
  "title": "Attendance Alert",
  "body": "Your child has missed classes this week. Please contact the school.",
  "scope": "INSTITUTE",
  "instituteId": "109",
  "targetUserTypes": ["PARENTS"],
  "priority": "HIGH",
  "actionUrl": "app://attendance/report",
  "sendImmediately": true
}

# Note: This sends to ALL parents in institute
# For individual parent targeting, use user-specific notification API
```

---

## 🔗 Related Documentation

- [User Authentication Guide](./AUTH_COMPLETE_IMPLEMENTATION_GUIDE.md)
- [Card System Guide](./CARD_SYSTEM_DATE_FIX.md)
- [Profile Image API](./PROFILE_IMAGE_API_SUMMARY.md)
- [First Login Frontend](./FIRST_LOGIN_FRONTEND_GUIDE.md)
- [Parent Access Guide](./PARENT_ACCESS_COMPLETE_IMPLEMENTATION.md)
- [Firebase Push Notifications](./FIREBASE_PUSH_NOTIFICATIONS_COMPLETE_GUIDE.md)
- [Push Notification Analysis](./PUSH_NOTIFICATION_ANALYSIS.md)

---

## 📞 Support

For issues or questions:
- Check error response `details` array
- Review logs in Cloud Run console
- Test in Postman/Insomnia first
- Verify JWT token is SUPER_ADMIN role

---

**End of System Admin API Documentation**
