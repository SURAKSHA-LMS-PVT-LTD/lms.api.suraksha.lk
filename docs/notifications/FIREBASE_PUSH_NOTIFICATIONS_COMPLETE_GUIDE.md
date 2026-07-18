# 🔔 Firebase Push Notifications - Complete Implementation Guide

## 📋 Table of Contents
1. [Firebase Setup](#firebase-setup)
2. [FCM Token Management](#fcm-token-management)
3. [Push Notification Creation & Sending](#push-notification-creation--sending)
4. [User Notification Retrieval](#user-notification-retrieval)
5. [Complete API Reference](#complete-api-reference)
6. [Error Handling](#error-handling)
7. [Testing Guide](#testing-guide)

---

## 🔥 Firebase Setup

### 1. Firebase Admin SDK Configuration

**Service Account File Location:**
```
d:\User\Desktop\suraksha-ab3c0-firebase-adminsdk-fbsvc-cd2955765b.json
```

**Environment Variables (.env):**
```env
# Firebase Cloud Messaging
FIREBASE_PROJECT_ID=suraksha-ab3c0
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-fbsvc@suraksha-ab3c0.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...[your key]...\n-----END PRIVATE KEY-----\n"
```

**Service Account Details:**
- **Project ID:** `suraksha-ab3c0`
- **Client Email:** `firebase-adminsdk-fbsvc@suraksha-ab3c0.iam.gserviceaccount.com`
- **Client ID:** `115906352575661165711`
- **Auth URI:** `https://accounts.google.com/o/oauth2/auth`
- **Token URI:** `https://oauth2.googleapis.com/token`

### 2. Backend Service Initialization

The FCM service is automatically initialized on application startup via `FcmNotificationService`:

**File:** `src/common/services/fcm-notification.service.ts`

```typescript
// Automatically initialized using environment variables
// Supports graceful degradation if Firebase is not configured
```

---

## 🎯 FCM Token Management

### 1. Register FCM Token

**Endpoint:** `POST /users/fcm-tokens`

**Access:** All authenticated users (JWT required)

**Use Case:** Call this endpoint after user login to register their device for push notifications

#### Request Headers
```http
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
Content-Type: application/json
```

#### Request Body
```json
{
  "userId": "2",
  "fcmToken": "dG1kYXZhOmFzZGFzZGFzZGFzZGFzZGFzZGFzZGFzZGFz...",
  "deviceId": "web-chrome-windows-abc123def456",
  "deviceType": "web",
  "deviceName": "Chrome on Windows",
  "appVersion": "1.0.0",
  "osVersion": "Windows 10",
  "isActive": true
}
```

#### Request Body Parameters
| Field | Type | Required | Description | Example |
|-------|------|----------|-------------|---------|
| `userId` | string | ✅ | User ID (BigInt as string) | `"2"` |
| `fcmToken` | string | ✅ | FCM registration token from Firebase SDK | `"dG1kYXZhOmFz..."` |
| `deviceId` | string | ✅ | Unique device identifier (generated client-side) | `"web-chrome-windows-abc123"` |
| `deviceType` | enum | ✅ | Device platform: `web`, `android`, `ios` | `"web"` |
| `deviceName` | string | ❌ | Human-readable device name | `"Chrome on Windows"` |
| `appVersion` | string | ❌ | Application version | `"1.0.0"` |
| `osVersion` | string | ❌ | Operating system version | `"Windows 10"` |
| `isActive` | boolean | ❌ | Token active status (default: true) | `true` |

#### Response (201 Created)
```json
{
  "id": "1234567890",
  "userId": "2",
  "fcmToken": "dG1kYXZhOmFzZGFzZGFzZGFzZGFzZGFzZGFzZGFzZGFz...",
  "deviceId": "web-chrome-windows-abc123def456",
  "deviceType": "web",
  "deviceName": "Chrome on Windows",
  "appVersion": "1.0.0",
  "osVersion": "Windows 10",
  "isActive": true,
  "isSynced": false,
  "lastSeen": null,
  "lastNotificationSent": null,
  "createdAt": "2026-01-24T02:03:42.000Z",
  "updatedAt": "2026-01-24T02:03:42.000Z"
}
```

#### Important Notes
- **Upsert Logic:** If a token with same `userId` + `deviceId` exists, it will be updated instead of creating duplicate
- **Device Limit:** Maximum 10 devices per user. Oldest inactive device auto-removed if limit reached
- **Token Refresh:** Call this endpoint each time FCM token refreshes (Firebase SDK handles this)

#### Error Responses
```json
// 400 Bad Request - Invalid data
{
  "statusCode": 400,
  "message": ["fcmToken should not be empty", "deviceType must be one of web, android, ios"],
  "error": "Bad Request"
}

// 401 Unauthorized - No JWT token
{
  "statusCode": 401,
  "message": "Unauthorized"
}

// 409 Conflict - Device limit reached
{
  "statusCode": 409,
  "message": "Maximum devices per user reached",
  "error": "Conflict"
}
```

---

### 2. Get User's FCM Tokens

**Endpoint:** `GET /users/fcm-tokens/user/:userId`

**Access:** All authenticated users

#### Request Example
```http
GET /users/fcm-tokens/user/2
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

#### Response (200 OK)
```json
[
  {
    "id": "1234567890",
    "userId": "2",
    "fcmToken": "dG1kYXZhOmFzZGFzZGFzZGFzZGFzZGFzZGFzZGFzZGFz...",
    "deviceId": "web-chrome-windows-abc123",
    "deviceType": "web",
    "deviceName": "Chrome on Windows",
    "appVersion": "1.0.0",
    "osVersion": "Windows 10",
    "isActive": true,
    "isSynced": true,
    "lastSeen": "2026-01-24T02:03:42.000Z",
    "lastNotificationSent": "2026-01-24T01:30:15.000Z",
    "createdAt": "2026-01-23T10:00:00.000Z",
    "updatedAt": "2026-01-24T02:03:42.000Z"
  },
  {
    "id": "1234567891",
    "userId": "2",
    "fcmToken": "eU5saWJhOmJzZGJzZGJzZGJzZGJzZGJzZGJzZGJzZGJz...",
    "deviceId": "android-samsung-galaxy-xyz789",
    "deviceType": "android",
    "deviceName": "Samsung Galaxy S21",
    "appVersion": "1.0.0",
    "osVersion": "Android 13",
    "isActive": true,
    "isSynced": true,
    "lastSeen": "2026-01-24T01:45:30.000Z",
    "lastNotificationSent": "2026-01-24T01:30:15.000Z",
    "createdAt": "2026-01-20T15:30:00.000Z",
    "updatedAt": "2026-01-24T01:45:30.000Z"
  }
]
```

---

### 3. Get User's Active FCM Tokens Only

**Endpoint:** `GET /users/fcm-tokens/user/:userId/active`

**Access:** All authenticated users

#### Request Example
```http
GET /users/fcm-tokens/user/2/active
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

#### Response (200 OK)
```json
[
  {
    "id": "1234567890",
    "userId": "2",
    "fcmToken": "dG1kYXZhOmFzZGFzZGFzZGFzZGFzZGFzZGFzZGFzZGFz...",
    "deviceId": "web-chrome-windows-abc123",
    "deviceType": "web",
    "isActive": true,
    "lastSeen": "2026-01-24T02:03:42.000Z"
  }
]
```

---

### 4. Delete FCM Token (Logout)

**Endpoint:** `DELETE /users/fcm-tokens/:id`

**Access:** All authenticated users

**Use Case:** Call this when user logs out to stop receiving notifications on that device

#### Request Example
```http
DELETE /users/fcm-tokens/1234567890
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

#### Response (204 No Content)
```
(Empty body - successful deletion)
```

---

### 5. Get User's Device Count

**Endpoint:** `GET /users/fcm-tokens/user/:userId/count`

**Access:** All authenticated users

#### Request Example
```http
GET /users/fcm-tokens/user/2/count
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

#### Response (200 OK)
```json
{
  "total": 3,
  "active": 2,
  "inactive": 1
}
```

---

### 6. Deactivate FCM Token

**Endpoint:** `PATCH /users/fcm-tokens/:id/deactivate`

**Access:** All authenticated users

**Use Case:** Temporarily disable notifications without deleting the token

#### Request Example
```http
PATCH /users/fcm-tokens/1234567890/deactivate
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

#### Response (204 No Content)

---

## 📨 Push Notification Creation & Sending

### 1. Create Push Notification

**Endpoint:** `POST /push-notifications/admin`

**Access:**
- **SUPERADMIN:** Can create `GLOBAL`, `INSTITUTE`, `CLASS`, `SUBJECT` notifications
- **Institute Admin:** Can create `INSTITUTE`, `CLASS`, `SUBJECT` for their institute
- **Teacher:** Can create `CLASS`, `SUBJECT` for their classes/subjects

#### Request Headers
```http
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
Content-Type: application/json
```

#### Request Body - Global Notification (SUPERADMIN Only)
```json
{
  "title": "System Maintenance Notice",
  "body": "The LMS will undergo scheduled maintenance on Saturday from 10 PM to 2 AM. Please save your work before this time.",
  "imageUrl": "https://lmsapi.suraksha.lk/images/maintenance-banner.jpg",
  "icon": "ic_warning",
  "actionUrl": "app://announcements/maintenance-2026-01-25",
  "dataPayload": {
    "announcementId": "789",
    "type": "maintenance",
    "severity": "medium"
  },
  "scope": "GLOBAL",
  "targetUserTypes": ["STUDENTS", "PARENTS", "TEACHERS"],
  "priority": "HIGH",
  "collapseKey": "system_maintenance",
  "timeToLive": 172800,
  "sendImmediately": true
}
```

#### Request Body - Institute Notification
```json
{
  "title": "Holiday Announcement",
  "body": "School will be closed on January 26th for Republic Day. Classes will resume on January 27th.",
  "imageUrl": "https://lmsapi.suraksha.lk/images/holiday-banner.jpg",
  "icon": "ic_event",
  "actionUrl": "app://calendar/event-holiday-2026-01-26",
  "dataPayload": {
    "eventId": "456",
    "eventType": "holiday",
    "date": "2026-01-26"
  },
  "scope": "INSTITUTE",
  "targetUserTypes": ["STUDENTS", "PARENTS", "TEACHERS"],
  "instituteId": "101",
  "priority": "NORMAL",
  "collapseKey": "institute_holiday",
  "timeToLive": 86400,
  "sendImmediately": true
}
```

#### Request Body - Class Notification
```json
{
  "title": "Class Cancelled - Math",
  "body": "Tomorrow's Math class (10 AM) is cancelled due to teacher unavailability. Rescheduled to next Monday at the same time.",
  "icon": "ic_class_cancelled",
  "actionUrl": "app://schedule/class-1000-reschedule",
  "dataPayload": {
    "classId": "1000",
    "originalDate": "2026-01-25",
    "rescheduledDate": "2026-01-27",
    "subjectId": "2"
  },
  "scope": "CLASS",
  "targetUserTypes": ["STUDENTS", "PARENTS"],
  "instituteId": "101",
  "classId": "1000",
  "priority": "HIGH",
  "collapseKey": "class_schedule_change",
  "timeToLive": 43200,
  "sendImmediately": true
}
```

#### Request Body - Subject Notification
```json
{
  "title": "New Homework Assignment - Physics",
  "body": "New homework assigned: Chapter 5 - Laws of Motion. Due date: January 30th. Check the homework section for details.",
  "icon": "ic_assignment",
  "actionUrl": "app://homework/assignment-12345",
  "dataPayload": {
    "homeworkId": "12345",
    "subjectId": "3",
    "classId": "1000",
    "dueDate": "2026-01-30"
  },
  "scope": "SUBJECT",
  "targetUserTypes": ["STUDENTS", "PARENTS"],
  "instituteId": "101",
  "classId": "1000",
  "subjectId": "3",
  "priority": "NORMAL",
  "collapseKey": "homework_assignment",
  "timeToLive": 86400,
  "sendImmediately": true
}
```

#### Request Body - Scheduled Notification
```json
{
  "title": "Exam Reminder",
  "body": "Your Math exam is scheduled for tomorrow at 9 AM. Please arrive 15 minutes early. Good luck!",
  "icon": "ic_exam",
  "actionUrl": "app://exams/exam-456",
  "dataPayload": {
    "examId": "456",
    "subjectId": "2",
    "examDate": "2026-01-26T09:00:00.000Z"
  },
  "scope": "CLASS",
  "targetUserTypes": ["STUDENTS", "PARENTS"],
  "instituteId": "101",
  "classId": "1000",
  "priority": "HIGH",
  "collapseKey": "exam_reminder",
  "timeToLive": 43200,
  "scheduledAt": "2026-01-25T18:00:00.000Z",
  "sendImmediately": false
}
```

#### Request Body Field Reference
| Field | Type | Required | Description | Example |
|-------|------|----------|-------------|---------|
| `title` | string (max 255) | ✅ | Notification title | `"System Maintenance"` |
| `body` | string (max 5000) | ✅ | Notification message | `"Scheduled maintenance..."` |
| `imageUrl` | string (URL, max 500) | ❌ | Image to display in notification | `"https://..."` |
| `icon` | string (max 100) | ❌ | Icon identifier for mobile apps | `"ic_warning"` |
| `actionUrl` | string (max 500) | ❌ | Deep link when notification clicked | `"app://announcements/123"` |
| `dataPayload` | object | ❌ | Custom key-value data | `{"type": "maintenance"}` |
| `scope` | enum | ✅ | `GLOBAL`, `INSTITUTE`, `CLASS`, `SUBJECT` | `"GLOBAL"` |
| `targetUserTypes` | array | ✅ | `STUDENTS`, `PARENTS`, `TEACHERS` | `["STUDENTS", "PARENTS"]` |
| `instituteId` | string | ⚠️ | Required if scope != GLOBAL | `"101"` |
| `classId` | string | ⚠️ | Required if scope = CLASS/SUBJECT | `"1000"` |
| `subjectId` | string | ⚠️ | Required if scope = SUBJECT | `"2"` |
| `priority` | enum | ❌ | `HIGH`, `NORMAL`, `LOW` (default: NORMAL) | `"HIGH"` |
| `collapseKey` | string (max 100) | ❌ | FCM grouping key | `"exam_reminder"` |
| `timeToLive` | number | ❌ | Seconds (default: 86400 = 24h) | `43200` |
| `scheduledAt` | string (ISO date) | ❌ | Future send time | `"2026-01-25T18:00:00.000Z"` |
| `sendImmediately` | boolean | ❌ | Send now (default: true) | `true` |

#### Response (201 Created) - Sent Immediately
```json
{
  "id": "9876543210",
  "title": "Class Cancelled - Math",
  "body": "Tomorrow's Math class (10 AM) is cancelled...",
  "imageUrl": null,
  "icon": "ic_class_cancelled",
  "actionUrl": "app://schedule/class-1000-reschedule",
  "dataPayload": {
    "classId": "1000",
    "originalDate": "2026-01-25",
    "rescheduledDate": "2026-01-27",
    "subjectId": "2"
  },
  "scope": "CLASS",
  "targetUserTypes": ["STUDENTS", "PARENTS"],
  "priority": "HIGH",
  "collapseKey": "class_schedule_change",
  "timeToLive": 43200,
  "status": "SENT",
  "recipientCount": 45,
  "successCount": 43,
  "failureCount": 2,
  "scheduledAt": null,
  "sentAt": "2026-01-24T02:10:35.000Z",
  "senderId": "2",
  "senderRole": "TEACHER",
  "instituteId": "101",
  "classId": "1000",
  "subjectId": null,
  "institute": {
    "id": "101",
    "name": "ABC International School",
    "logoUrl": "https://lmsapi.suraksha.lk/logos/abc-school.jpg"
  },
  "class": {
    "id": "1000",
    "name": "Grade 10 - Section A",
    "code": "10-A"
  },
  "sender": {
    "id": "2",
    "firstName": "John",
    "lastName": "Doe",
    "nameWithInitials": "J.D.",
    "imageUrl": "https://lmsapi.suraksha.lk/profiles/john-doe.jpg"
  },
  "createdAt": "2026-01-24T02:10:30.000Z",
  "updatedAt": "2026-01-24T02:10:35.000Z"
}
```

#### Response (201 Created) - Scheduled
```json
{
  "id": "9876543211",
  "title": "Exam Reminder",
  "body": "Your Math exam is scheduled for tomorrow at 9 AM...",
  "status": "PENDING",
  "recipientCount": 0,
  "successCount": 0,
  "failureCount": 0,
  "scheduledAt": "2026-01-25T18:00:00.000Z",
  "sentAt": null,
  "createdAt": "2026-01-24T02:15:00.000Z",
  "updatedAt": "2026-01-24T02:15:00.000Z"
}
```

#### Notification Status Flow
- **DRAFT:** Created but not sent (`sendImmediately: false`, no `scheduledAt`)
- **PENDING:** Scheduled for future (`scheduledAt` set)
- **SENT:** Successfully sent to recipients
- **FAILED:** Failed to send
- **CANCELLED:** Manually cancelled before sending

#### Error Responses
```json
// 400 Bad Request - Missing required fields
{
  "statusCode": 400,
  "message": [
    "instituteId is required for INSTITUTE scope",
    "classId is required for CLASS scope"
  ],
  "error": "Bad Request"
}

// 403 Forbidden - Insufficient permissions
{
  "statusCode": 403,
  "message": "Teachers cannot create INSTITUTE scope notifications",
  "error": "Forbidden"
}

// 404 Not Found - Invalid institute/class/subject
{
  "statusCode": 404,
  "message": "Institute with ID 999 not found",
  "error": "Not Found"
}
```

---

### 2. Send/Resend Notification

**Endpoint:** `POST /push-notifications/admin/:id/send`

**Access:** SUPERADMIN, Institute Admin, Teacher

**Use Case:**
- Send a DRAFT notification immediately
- Trigger a SCHEDULED notification early
- Resend a FAILED notification

#### Request Example
```http
POST /push-notifications/admin/9876543211/send
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

#### Response (200 OK)
```json
{
  "notificationId": "9876543211",
  "status": "SENT",
  "totalRecipients": 45,
  "sentCount": 45,
  "failedCount": 0,
  "sentAt": "2026-01-24T02:20:15.000Z",
  "failedTokens": []
}
```

#### Response - Partial Failure
```json
{
  "notificationId": "9876543211",
  "status": "SENT",
  "totalRecipients": 45,
  "sentCount": 42,
  "failedCount": 3,
  "sentAt": "2026-01-24T02:20:15.000Z",
  "failedTokens": [
    {
      "fcmToken": "expired-token-abc123...",
      "error": "messaging/registration-token-not-registered"
    },
    {
      "fcmToken": "invalid-token-xyz789...",
      "error": "messaging/invalid-registration-token"
    },
    {
      "fcmToken": "another-failed-token...",
      "error": "messaging/mismatched-credential"
    }
  ]
}
```

---

### 3. Cancel Scheduled Notification

**Endpoint:** `PUT /push-notifications/admin/:id/cancel`

**Access:** SUPERADMIN, Institute Admin, Teacher

**Use Case:** Cancel a notification that is scheduled for future

#### Request Example
```http
PUT /push-notifications/admin/9876543211/cancel
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

#### Response (204 No Content)

---

### 4. Delete Notification

**Endpoint:** `DELETE /push-notifications/admin/:id`

**Access:** SUPERADMIN, Institute Admin, Teacher

**Use Case:** Permanently delete a notification (DRAFT or CANCELLED only)

#### Request Example
```http
DELETE /push-notifications/admin/9876543211
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

#### Response (204 No Content)

#### Error Response
```json
// 400 Bad Request - Cannot delete sent notification
{
  "statusCode": 400,
  "message": "Cannot delete sent notifications",
  "error": "Bad Request"
}
```

---

### 5. Get Admin Notifications (Paginated)

**Endpoint:** `GET /push-notifications/admin`

**Access:** SUPERADMIN, Institute Admin, Teacher

**Use Case:** List all notifications created by the admin

#### Request Example
```http
GET /push-notifications/admin?page=1&limit=10&scope=CLASS&status=SENT&instituteId=101
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

#### Query Parameters
| Parameter | Type | Description | Example |
|-----------|------|-------------|---------|
| `page` | number | Page number (default: 1) | `1` |
| `limit` | number | Items per page (default: 10) | `10` |
| `scope` | enum | Filter by scope | `CLASS` |
| `status` | enum | Filter by status | `SENT` |
| `instituteId` | string | Filter by institute | `101` |
| `classId` | string | Filter by class | `1000` |
| `subjectId` | string | Filter by subject | `2` |
| `senderId` | string | Filter by sender | `2` |
| `sortBy` | string | Sort field (default: createdAt) | `sentAt` |
| `sortOrder` | enum | `ASC` or `DESC` (default: DESC) | `DESC` |

#### Response (200 OK)
```json
{
  "data": [
    {
      "id": "9876543210",
      "title": "Class Cancelled - Math",
      "body": "Tomorrow's Math class (10 AM) is cancelled...",
      "scope": "CLASS",
      "status": "SENT",
      "recipientCount": 45,
      "successCount": 43,
      "failureCount": 2,
      "priority": "HIGH",
      "scheduledAt": null,
      "sentAt": "2026-01-24T02:10:35.000Z",
      "senderId": "2",
      "senderRole": "TEACHER",
      "instituteId": "101",
      "classId": "1000",
      "institute": {
        "id": "101",
        "name": "ABC International School"
      },
      "class": {
        "id": "1000",
        "name": "Grade 10 - Section A"
      },
      "sender": {
        "id": "2",
        "nameWithInitials": "J.D."
      },
      "createdAt": "2026-01-24T02:10:30.000Z",
      "updatedAt": "2026-01-24T02:10:35.000Z"
    }
  ],
  "total": 25,
  "page": 1,
  "limit": 10,
  "totalPages": 3
}
```

---

### 6. Get Single Notification Details

**Endpoint:** `GET /push-notifications/admin/:id`

**Access:** SUPERADMIN, Institute Admin, Teacher

#### Request Example
```http
GET /push-notifications/admin/9876543210
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

#### Response (200 OK)
```json
{
  "id": "9876543210",
  "title": "Class Cancelled - Math",
  "body": "Tomorrow's Math class (10 AM) is cancelled...",
  "imageUrl": null,
  "icon": "ic_class_cancelled",
  "actionUrl": "app://schedule/class-1000-reschedule",
  "dataPayload": {
    "classId": "1000",
    "originalDate": "2026-01-25",
    "rescheduledDate": "2026-01-27",
    "subjectId": "2"
  },
  "scope": "CLASS",
  "targetUserTypes": ["STUDENTS", "PARENTS"],
  "priority": "HIGH",
  "collapseKey": "class_schedule_change",
  "timeToLive": 43200,
  "status": "SENT",
  "recipientCount": 45,
  "successCount": 43,
  "failureCount": 2,
  "scheduledAt": null,
  "sentAt": "2026-01-24T02:10:35.000Z",
  "senderId": "2",
  "senderRole": "TEACHER",
  "instituteId": "101",
  "classId": "1000",
  "subjectId": null,
  "institute": {
    "id": "101",
    "name": "ABC International School",
    "logoUrl": "https://lmsapi.suraksha.lk/logos/abc-school.jpg"
  },
  "class": {
    "id": "1000",
    "name": "Grade 10 - Section A",
    "code": "10-A"
  },
  "subject": null,
  "sender": {
    "id": "2",
    "firstName": "John",
    "lastName": "Doe",
    "nameWithInitials": "J.D.",
    "imageUrl": "https://lmsapi.suraksha.lk/profiles/john-doe.jpg"
  },
  "createdAt": "2026-01-24T02:10:30.000Z",
  "updatedAt": "2026-01-24T02:10:35.000Z"
}
```

---

## 📬 User Notification Retrieval

### 1. Get System/Global Notifications

**Endpoint:** `GET /push-notifications/system`

**Access:** All authenticated users

**Use Case:** Fetch global notifications for all users (shown before institute selection)

#### Request Example
```http
GET /push-notifications/system?page=1&limit=10&onlyUnread=true
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

#### Query Parameters
| Parameter | Type | Description | Default |
|-----------|------|-------------|---------|
| `page` | number | Page number | `1` |
| `limit` | number | Items per page | `10` |
| `onlyUnread` | boolean | Show only unread | `false` |

#### Response (200 OK)
```json
{
  "data": [
    {
      "id": "9876543215",
      "title": "System Maintenance Notice",
      "body": "The LMS will undergo scheduled maintenance on Saturday...",
      "imageUrl": "https://lmsapi.suraksha.lk/images/maintenance-banner.jpg",
      "icon": "ic_warning",
      "actionUrl": "app://announcements/maintenance-2026-01-25",
      "priority": "HIGH",
      "sentAt": "2026-01-24T01:00:00.000Z",
      "isRead": false,
      "readAt": null
    }
  ],
  "total": 5,
  "page": 1,
  "limit": 10,
  "totalPages": 1,
  "unreadCount": 3
}
```

---

### 2. Get System Notifications Unread Count

**Endpoint:** `GET /push-notifications/system/unread-count`

**Access:** All authenticated users

#### Request Example
```http
GET /push-notifications/system/unread-count
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

#### Response (200 OK)
```json
{
  "unreadCount": 3
}
```

---

### 3. Get Institute Notifications

**Endpoint:** `GET /push-notifications/institute/:instituteId`

**Access:** All authenticated users (must be enrolled in institute)

**Use Case:** Fetch institute-specific, class-specific, and subject-specific notifications

#### Request Example
```http
GET /push-notifications/institute/101?page=1&limit=10&onlyUnread=false
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

#### Response (200 OK)
```json
{
  "data": [
    {
      "id": "9876543210",
      "title": "Class Cancelled - Math",
      "body": "Tomorrow's Math class (10 AM) is cancelled...",
      "icon": "ic_class_cancelled",
      "actionUrl": "app://schedule/class-1000-reschedule",
      "scope": "CLASS",
      "priority": "HIGH",
      "sentAt": "2026-01-24T02:10:35.000Z",
      "isRead": true,
      "readAt": "2026-01-24T02:15:00.000Z",
      "class": {
        "id": "1000",
        "name": "Grade 10 - Section A"
      },
      "sender": {
        "nameWithInitials": "J.D."
      }
    },
    {
      "id": "9876543211",
      "title": "Holiday Announcement",
      "body": "School will be closed on January 26th for Republic Day...",
      "imageUrl": "https://lmsapi.suraksha.lk/images/holiday-banner.jpg",
      "scope": "INSTITUTE",
      "priority": "NORMAL",
      "sentAt": "2026-01-23T10:00:00.000Z",
      "isRead": false,
      "readAt": null,
      "institute": {
        "id": "101",
        "name": "ABC International School"
      },
      "sender": {
        "nameWithInitials": "M.S."
      }
    }
  ],
  "total": 12,
  "page": 1,
  "limit": 10,
  "totalPages": 2,
  "unreadCount": 5
}
```

---

### 4. Get Institute Notifications Unread Count

**Endpoint:** `GET /push-notifications/institute/:instituteId/unread-count`

**Access:** All authenticated users

#### Request Example
```http
GET /push-notifications/institute/101/unread-count
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

#### Response (200 OK)
```json
{
  "unreadCount": 5
}
```

---

### 5. Mark Notification as Read

**Endpoint:** `POST /push-notifications/:id/mark-read`

**Access:** All authenticated users

#### Request Example
```http
POST /push-notifications/9876543210/mark-read
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

#### Response (204 No Content)

---

### 6. Mark All Institute Notifications as Read

**Endpoint:** `POST /push-notifications/institute/:instituteId/mark-all-read`

**Access:** All authenticated users

#### Request Example
```http
POST /push-notifications/institute/101/mark-all-read
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

#### Response (200 OK)
```json
{
  "markedCount": 5
}
```

---

## 📖 Complete API Reference

### FCM Token Management Endpoints
| Method | Endpoint | Description | Access |
|--------|----------|-------------|--------|
| POST | `/users/fcm-tokens` | Register/update FCM token | All authenticated users |
| GET | `/users/fcm-tokens/user/:userId` | Get user's all tokens | All authenticated users |
| GET | `/users/fcm-tokens/user/:userId/active` | Get user's active tokens | All authenticated users |
| GET | `/users/fcm-tokens/user/:userId/count` | Get user's device count | All authenticated users |
| PATCH | `/users/fcm-tokens/:id` | Update token details | All authenticated users |
| PATCH | `/users/fcm-tokens/:id/deactivate` | Deactivate token | All authenticated users |
| DELETE | `/users/fcm-tokens/:id` | Delete token (logout) | All authenticated users |
| DELETE | `/users/fcm-tokens/user/:userId` | Delete all user tokens | All authenticated users |

### Admin Notification Endpoints
| Method | Endpoint | Description | Access |
|--------|----------|-------------|--------|
| POST | `/push-notifications/admin` | Create notification | SUPERADMIN, Admin, Teacher |
| GET | `/push-notifications/admin` | List admin notifications (paginated) | SUPERADMIN, Admin, Teacher |
| GET | `/push-notifications/admin/:id` | Get notification details | SUPERADMIN, Admin, Teacher |
| POST | `/push-notifications/admin/:id/send` | Send/resend notification | SUPERADMIN, Admin, Teacher |
| PUT | `/push-notifications/admin/:id/cancel` | Cancel scheduled notification | SUPERADMIN, Admin, Teacher |
| DELETE | `/push-notifications/admin/:id` | Delete notification | SUPERADMIN, Admin, Teacher |

### User Notification Endpoints
| Method | Endpoint | Description | Access |
|--------|----------|-------------|--------|
| GET | `/push-notifications/system` | Get global notifications (paginated) | All authenticated users |
| GET | `/push-notifications/system/unread-count` | Get global unread count | All authenticated users |
| GET | `/push-notifications/institute/:instituteId` | Get institute notifications | All authenticated users |
| GET | `/push-notifications/institute/:instituteId/unread-count` | Get institute unread count | All authenticated users |
| POST | `/push-notifications/:id/mark-read` | Mark notification as read | All authenticated users |
| POST | `/push-notifications/institute/:instituteId/mark-all-read` | Mark all institute notifications as read | All authenticated users |
| POST | `/push-notifications/system/mark-all-read` | Mark all system notifications as read | All authenticated users |

---

## ⚠️ Error Handling

### Common Error Response Format
```json
{
  "statusCode": 400,
  "message": "Error message or array of validation errors",
  "error": "Bad Request"
}
```

### HTTP Status Codes
| Status | Meaning | Example |
|--------|---------|---------|
| 200 | OK | Successful GET request |
| 201 | Created | Notification created successfully |
| 204 | No Content | Successful DELETE or mark-read |
| 400 | Bad Request | Invalid request data |
| 401 | Unauthorized | Missing or invalid JWT token |
| 403 | Forbidden | Insufficient permissions |
| 404 | Not Found | Resource not found |
| 409 | Conflict | Duplicate or conflict error |
| 500 | Internal Server Error | Server-side error |

### FCM-Specific Errors
| FCM Error Code | Meaning | Action |
|----------------|---------|--------|
| `messaging/registration-token-not-registered` | Token expired or deleted | Delete token from database |
| `messaging/invalid-registration-token` | Malformed token | Delete token from database |
| `messaging/mismatched-credential` | Token belongs to different project | Delete token |
| `messaging/invalid-argument` | Invalid notification payload | Fix notification data |
| `messaging/server-unavailable` | FCM service temporarily down | Retry later |

---

## 🧪 Testing Guide

### 1. Test FCM Token Registration

```bash
curl -X POST https://lmsapi.suraksha.lk/users/fcm-tokens \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "2",
    "fcmToken": "test-fcm-token-abc123",
    "deviceId": "web-test-device-001",
    "deviceType": "web",
    "deviceName": "Test Browser",
    "appVersion": "1.0.0",
    "osVersion": "Windows 10",
    "isActive": true
  }'
```

### 2. Test Global Notification (SUPERADMIN)

```bash
curl -X POST https://lmsapi.suraksha.lk/push-notifications/admin \
  -H "Authorization: Bearer SUPERADMIN_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Test Global Notification",
    "body": "This is a test notification for all users.",
    "scope": "GLOBAL",
    "targetUserTypes": ["STUDENTS", "PARENTS", "TEACHERS"],
    "priority": "NORMAL",
    "sendImmediately": true
  }'
```

### 3. Test Institute Notification

```bash
curl -X POST https://lmsapi.suraksha.lk/push-notifications/admin \
  -H "Authorization: Bearer ADMIN_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Test Institute Notification",
    "body": "This is a test notification for institute.",
    "scope": "INSTITUTE",
    "targetUserTypes": ["STUDENTS", "PARENTS"],
    "instituteId": "101",
    "priority": "NORMAL",
    "sendImmediately": true
  }'
```

### 4. Test Class Notification

```bash
curl -X POST https://lmsapi.suraksha.lk/push-notifications/admin \
  -H "Authorization: Bearer TEACHER_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Test Class Notification",
    "body": "This is a test notification for a specific class.",
    "scope": "CLASS",
    "targetUserTypes": ["STUDENTS", "PARENTS"],
    "instituteId": "101",
    "classId": "1000",
    "priority": "HIGH",
    "sendImmediately": true
  }'
```

### 5. Verify Notification Received

```bash
# Get system notifications
curl -X GET "https://lmsapi.suraksha.lk/push-notifications/system?page=1&limit=10" \
  -H "Authorization: Bearer USER_JWT_TOKEN"

# Get institute notifications
curl -X GET "https://lmsapi.suraksha.lk/push-notifications/institute/101?page=1&limit=10" \
  -H "Authorization: Bearer USER_JWT_TOKEN"
```

### 6. Mark Notification as Read

```bash
curl -X POST https://lmsapi.suraksha.lk/push-notifications/9876543210/mark-read \
  -H "Authorization: Bearer USER_JWT_TOKEN"
```

---

## 🔐 Security Notes

1. **JWT Authentication:** All endpoints require valid JWT token in Authorization header
2. **Role-Based Access:** Different roles have different permissions (SUPERADMIN, Admin, Teacher, User)
3. **Institute Validation:** Users can only access notifications for institutes they're enrolled in
4. **Device Limit:** Maximum 10 devices per user to prevent abuse
5. **Firebase Security:** Service account key should be stored securely (environment variable)
6. **HTTPS Only:** API should only be accessed via HTTPS in production
7. **Origin Validation:** Enable origin validation in production (currently bypassed in dev mode)

---

## 📊 Current System Status (2026-01-24 02:03 IST)

✅ **Working:**
- User institute listing (GET `/users/2/institutes`) - 200 OK
- Pagination working (`?page=1&limit=10`)
- FCM token registration (POST `/users/fcm-tokens`)
- JWT authentication active
- Refresh token flow (POST `/auth/refresh`)
- CORS preflight (OPTIONS) handled
- Response times: 2-44ms (excellent)

⚠️ **Development Mode:**
- Origin validation bypassed (enable for production)

---

## 📞 Support

For issues or questions:
- Check error logs in Google Cloud Console
- Verify Firebase Admin SDK configuration
- Ensure JWT tokens are valid and not expired
- Check user permissions for institute/class/subject access

---

**Document Version:** 1.0  
**Last Updated:** January 24, 2026  
**API Base URL:** https://lmsapi.suraksha.lk  
**Firebase Project:** suraksha-ab3c0
