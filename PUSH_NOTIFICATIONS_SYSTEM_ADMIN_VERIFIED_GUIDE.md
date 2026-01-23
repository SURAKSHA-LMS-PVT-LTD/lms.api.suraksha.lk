# 🔔 Push Notifications - System Admin Complete Guide

**✅ VERIFIED AGAINST ACTUAL IMPLEMENTATION**  
**Last Updated:** January 23, 2026  
**Source Files Verified:**
- `src/modules/push-notifications/controllers/push-notification-admin.controller.ts`
- `src/modules/push-notifications/controllers/push-notification-user.controller.ts`
- `src/modules/push-notifications/dto/create-push-notification.dto.ts`
- `src/modules/push-notifications/entities/push-notification.entity.ts`

---

## 📋 Table of Contents

1. [Overview & Architecture](#overview--architecture)
2. [Database Schema (Actual Entity)](#database-schema-actual-entity)
3. [Enums Reference (Actual Values)](#enums-reference-actual-values)
4. [Admin API Endpoints](#admin-api-endpoints)
5. [User API Endpoints](#user-api-endpoints)
6. [Permission Matrix (Verified)](#permission-matrix-verified)
7. [Complete Examples](#complete-examples)
8. [Validation Rules](#validation-rules)
9. [Error Handling](#error-handling)

---

## 🎯 Overview & Architecture

### System Flow
```
┌──────────────────────────────────────────────────────────────────┐
│                    PUSH NOTIFICATION FLOW                         │
├──────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ADMIN CONTROLLER: /push-notifications/admin                      │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │ POST /           → Create notification                       │ │
│  │ GET /            → List all (with filters)                   │ │
│  │ GET /:id         → Get single notification                   │ │
│  │ POST /:id/send   → Send/trigger notification                 │ │
│  │ POST /:id/resend → Resend failed notification                │ │
│  │ PUT /:id/cancel  → Cancel draft/scheduled                    │ │
│  │ DELETE /:id      → Delete notification                       │ │
│  └─────────────────────────────────────────────────────────────┘ │
│                                                                   │
│  USER CONTROLLER: /push-notifications                             │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │ GET /institute/:id             → Get institute notifications │ │
│  │ GET /institute/:id/unread-count → Get unread count          │ │
│  │ GET /system                    → Get global notifications    │ │
│  │ GET /system/unread-count       → Get system unread count    │ │
│  │ GET /:id                       → Get single + mark read     │ │
│  │ POST /:id/read                 → Mark as read               │ │
│  │ POST /mark-read                → Mark multiple as read      │ │
│  │ POST /institute/:id/mark-all-read → Mark all as read        │ │
│  └─────────────────────────────────────────────────────────────┘ │
│                                                                   │
└──────────────────────────────────────────────────────────────────┘
```

### Role Hierarchy
| Role | GLOBAL | INSTITUTE | CLASS | SUBJECT |
|------|--------|-----------|-------|---------|
| SUPERADMIN | ✅ Create | ✅ Create | ✅ Create | ✅ Create |
| Institute Admin | ❌ | ✅ Own Institute | ✅ Own Classes | ✅ Own Subjects |
| Teacher | ❌ | ❌ | ✅ Own Classes | ✅ Own Subjects |
| Student/Parent | ❌ | ❌ | ❌ | ❌ |

---

## 🗄️ Database Schema (Actual Entity)

### PushNotificationEntity
**Table:** `push_notifications`

```typescript
// File: src/modules/push-notifications/entities/push-notification.entity.ts

@Entity('push_notifications')
@Index('idx_push_notifications_institute', ['instituteId', 'status'])
@Index('idx_push_notifications_scope', ['scope', 'status'])
@Index('idx_push_notifications_created', ['createdAt'])
@Index('idx_push_notifications_scheduled', ['scheduledAt', 'status'])
@Index('idx_push_notifications_sender', ['senderId'])
export class PushNotificationEntity {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string;

  // Content
  @Column({ type: 'varchar', length: 255 })
  title: string;

  @Column({ type: 'text' })
  body: string;

  @Column({ name: 'image_url', type: 'varchar', length: 500, nullable: true })
  imageUrl?: string;

  @Column({ name: 'icon', type: 'varchar', length: 100, nullable: true })
  icon?: string;

  @Column({ name: 'action_url', type: 'varchar', length: 500, nullable: true })
  actionUrl?: string;

  @Column({ name: 'data_payload', type: 'json', nullable: true })
  dataPayload?: Record<string, string>;

  // Targeting
  @Column({ type: 'enum', enum: NotificationScope, default: NotificationScope.INSTITUTE })
  scope: NotificationScope;

  @Column({ name: 'target_user_types', type: 'json' })
  targetUserTypes: NotificationTargetUserType[];

  // Relations (nullable for different scopes)
  @Column({ name: 'institute_id', type: 'bigint', nullable: true })
  instituteId?: string;

  @Column({ name: 'class_id', type: 'bigint', nullable: true })
  classId?: string;

  @Column({ name: 'subject_id', type: 'bigint', nullable: true })
  subjectId?: string;

  // Settings
  @Column({ type: 'enum', enum: NotificationPriority, default: NotificationPriority.NORMAL })
  priority: NotificationPriority;

  @Column({ type: 'enum', enum: NotificationStatus, default: NotificationStatus.DRAFT })
  status: NotificationStatus;

  @Column({ name: 'collapse_key', type: 'varchar', length: 100, nullable: true })
  collapseKey?: string;

  @Column({ name: 'time_to_live', type: 'int', default: 86400 })
  timeToLive: number;  // 86400 = 24 hours

  // Scheduling
  @Column({ name: 'scheduled_at', type: 'timestamp', nullable: true })
  scheduledAt?: Date;

  @Column({ name: 'sent_at', type: 'timestamp', nullable: true })
  sentAt?: Date;

  // Sender
  @Column({ name: 'sender_id', type: 'bigint', nullable: true })
  senderId?: string;

  @Column({ name: 'sender_role', type: 'varchar', length: 50 })
  senderRole: string;

  // Statistics
  @Column({ name: 'total_recipients', type: 'int', default: 0 })
  totalRecipients: number;

  @Column({ name: 'sent_count', type: 'int', default: 0 })
  sentCount: number;

  @Column({ name: 'failed_count', type: 'int', default: 0 })
  failedCount: number;

  @Column({ name: 'read_count', type: 'int', default: 0 })
  readCount: number;

  // Timestamps
  @Column({ name: 'created_at', type: 'timestamp' })
  createdAt: Date;

  @Column({ name: 'updated_at', type: 'timestamp' })
  updatedAt: Date;
}
```

### Foreign Key Relations
```
push_notifications
├── institute_id → institutes.id (CASCADE delete)
├── class_id → institute_classes.id (CASCADE delete)
├── subject_id → subjects.id (CASCADE delete)
└── sender_id → users.id (SET NULL on delete)
```

---

## 📋 Enums Reference (Actual Values)

### NotificationScope
```typescript
enum NotificationScope {
  GLOBAL = 'GLOBAL',       // System-wide (SUPERADMIN only)
  INSTITUTE = 'INSTITUTE', // Institute-wide
  CLASS = 'CLASS',         // Class-specific
  SUBJECT = 'SUBJECT'      // Subject-specific
}
```

### NotificationTargetUserType ⚠️ IMPORTANT
```typescript
enum NotificationTargetUserType {
  // Standard targets
  ALL = 'ALL',
  STUDENTS = 'STUDENTS',
  TEACHERS = 'TEACHERS',
  PARENTS = 'PARENTS',
  ATTENDANCE_MARKERS = 'ATTENDANCE_MARKERS',
  INSTITUTE_ADMINS = 'INSTITUTE_ADMINS',
  
  // ✅ Advanced filters (GLOBAL scope only)
  USERS_WITHOUT_INSTITUTE = 'USERS_WITHOUT_INSTITUTE',   // Not enrolled anywhere
  USERS_WITHOUT_PARENT = 'USERS_WITHOUT_PARENT',         // USER_WITHOUT_PARENT type
  USERS_WITHOUT_STUDENT = 'USERS_WITHOUT_STUDENT',       // USER_WITHOUT_STUDENT type
  VERIFIED_USERS_ONLY = 'VERIFIED_USERS_ONLY',           // isEmailVerified = true
  UNVERIFIED_USERS_ONLY = 'UNVERIFIED_USERS_ONLY'        // isEmailVerified = false
}
```

> ⚠️ **Note:** The guide mentioned `ADMINS` but actual enum uses `INSTITUTE_ADMINS`

### NotificationPriority
```typescript
enum NotificationPriority {
  HIGH = 'HIGH',
  NORMAL = 'NORMAL',   // Default
  LOW = 'LOW'
}
```

### NotificationStatus
```typescript
enum NotificationStatus {
  DRAFT = 'DRAFT',         // Initial state
  SCHEDULED = 'SCHEDULED', // For future delivery
  SENDING = 'SENDING',     // Currently processing
  SENT = 'SENT',           // Successfully sent
  FAILED = 'FAILED',       // Send failed
  CANCELLED = 'CANCELLED'  // Manually cancelled
}
```

---

## 🔌 Admin API Endpoints

### Base URL
```
Production: https://lmsapi.suraksha.lk/push-notifications/admin
Development: http://localhost:3000/push-notifications/admin
```

### Authentication
```
Authorization: Bearer <JWT_TOKEN>
```

---

### 1️⃣ Create Push Notification

```http
POST /push-notifications/admin
```

#### Guards Applied
```typescript
@UseGuards(JwtAuthGuard, FlexibleAccessGuard)
@RequireAnyOfRoles({
  global: [UserType.SUPERADMIN],
  instituteAdmin: true,
  teacher: true
})
```

#### Request Body (CreatePushNotificationDto)
```typescript
{
  // ✅ REQUIRED
  title: string;           // Max 255 chars
  body: string;            // Max 5000 chars
  scope: 'GLOBAL' | 'INSTITUTE' | 'CLASS' | 'SUBJECT';
  targetUserTypes: NotificationTargetUserType[];  // Array
  
  // 📌 CONDITIONAL - Based on scope
  instituteId?: string;    // Required if scope != GLOBAL
  classId?: string;        // Required if scope = CLASS or SUBJECT
  subjectId?: string;      // Required if scope = SUBJECT
  
  // ⚙️ OPTIONAL
  imageUrl?: string;       // Max 500 chars, must be valid URL
  icon?: string;           // Max 100 chars
  actionUrl?: string;      // Max 500 chars (deep link)
  dataPayload?: object;    // JSON key-value pairs
  priority?: 'HIGH' | 'NORMAL' | 'LOW';  // Default: NORMAL
  collapseKey?: string;    // Max 100 chars (FCM grouping)
  timeToLive?: number;     // Seconds, default: 86400 (24h)
  scheduledAt?: string;    // ISO 8601 datetime
  sendImmediately?: boolean;  // Default: true
}
```

#### Response (201 Created)
```json
{
  "id": "1",
  "title": "System Maintenance",
  "body": "The system will undergo maintenance...",
  "scope": "GLOBAL",
  "targetUserTypes": ["STUDENTS", "TEACHERS", "PARENTS"],
  "priority": "HIGH",
  "status": "DRAFT",
  "senderId": "1",
  "senderRole": "SYSTEM_ADMIN",
  "totalRecipients": 0,
  "sentCount": 0,
  "failedCount": 0,
  "readCount": 0,
  "createdAt": "2026-01-23T10:00:00.000Z",
  "updatedAt": "2026-01-23T10:00:00.000Z"
}
```

---

### 2️⃣ Get All Notifications (Admin)

```http
GET /push-notifications/admin
```

#### Query Parameters
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `page` | number | 1 | Page number |
| `limit` | number | 10 | Items per page |
| `sortBy` | string | 'createdAt' | Sort field |
| `sortOrder` | 'ASC' \| 'DESC' | 'DESC' | Sort direction |
| `instituteId` | string | - | Filter by institute |
| `classId` | string | - | Filter by class |
| `subjectId` | string | - | Filter by subject |
| `scope` | NotificationScope | - | Filter by scope |
| `status` | NotificationStatus | - | Filter by status |
| `priority` | NotificationPriority | - | Filter by priority |
| `senderId` | string | - | Filter by sender |
| `search` | string | - | Search in title/body |
| `dateFrom` | string | - | ISO date from |
| `dateTo` | string | - | ISO date to |

#### Response
```json
{
  "data": [
    {
      "id": "1",
      "title": "System Maintenance",
      "body": "...",
      "scope": "GLOBAL",
      "status": "SENT",
      "priority": "HIGH",
      "totalRecipients": 1500,
      "sentCount": 1498,
      "failedCount": 2,
      "readCount": 1200,
      "createdAt": "2026-01-23T10:00:00.000Z",
      "sentAt": "2026-01-23T10:05:00.000Z"
    }
  ],
  "total": 50,
  "page": 1,
  "limit": 10,
  "totalPages": 5
}
```

---

### 3️⃣ Get Single Notification

```http
GET /push-notifications/admin/:id
```

#### Response
Full notification object with all relations (institute, class, subject, sender).

---

### 4️⃣ Send Notification

```http
POST /push-notifications/admin/:id/send
```

**Use Cases:**
- Send a DRAFT notification immediately
- Trigger a SCHEDULED notification manually
- Resend to new recipients

#### Response (SendNotificationResultDto)
```json
{
  "notificationId": "1",
  "status": "SENT",
  "totalRecipients": 250,
  "sentCount": 248,
  "failedCount": 2,
  "sentAt": "2026-01-23T10:05:00.000Z"
}
```

---

### 5️⃣ Resend Failed Notification

```http
POST /push-notifications/admin/:id/resend
```

> ⚠️ Only works for notifications with `status: FAILED`

#### Response
Same as Send Notification.

---

### 6️⃣ Cancel Notification

```http
PUT /push-notifications/admin/:id/cancel
```

> ⚠️ Can only cancel `DRAFT` or `SCHEDULED` notifications

#### Response
```json
{
  "message": "Notification cancelled successfully"
}
```

---

### 7️⃣ Delete Notification

```http
DELETE /push-notifications/admin/:id
```

#### Guards (More Restrictive)
```typescript
@RequireAnyOfRoles({
  global: [UserType.SUPERADMIN],
  instituteAdmin: true
  // ❌ Teachers cannot delete
})
```

#### Response
```json
{
  "message": "Notification deleted successfully"
}
```

---

## 👤 User API Endpoints

### Base URL
```
Production: https://lmsapi.suraksha.lk/push-notifications
Development: http://localhost:3000/push-notifications
```

---

### 1️⃣ Get Institute Notifications

```http
GET /push-notifications/institute/:instituteId
```

#### Query Parameters
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `page` | number | 1 | Page number |
| `limit` | number | 20 | Items per page |
| `isRead` | boolean | - | Filter by read status |
| `includeDeleted` | boolean | false | Include deleted |
| `search` | string | - | Search text |

#### Response
```json
{
  "data": [
    {
      "id": "1",
      "title": "Class Cancelled",
      "body": "Math class tomorrow is cancelled.",
      "scope": "CLASS",
      "priority": "NORMAL",
      "imageUrl": null,
      "actionUrl": "app://schedule",
      "institute": {
        "id": "101",
        "name": "Royal College"
      },
      "sender": {
        "id": "5",
        "firstName": "John",
        "lastName": "Teacher"
      },
      "senderRole": "TEACHER",
      "isRead": false,
      "readAt": null,
      "createdAt": "2026-01-23T08:00:00.000Z"
    }
  ],
  "total": 25,
  "page": 1,
  "limit": 20,
  "totalPages": 2
}
```

---

### 2️⃣ Get System (Global) Notifications

```http
GET /push-notifications/system
```

Returns only `GLOBAL` scope notifications.

---

### 3️⃣ Get Unread Count

**Institute:**
```http
GET /push-notifications/institute/:instituteId/unread-count
```

**System:**
```http
GET /push-notifications/system/unread-count
```

#### Response
```json
{
  "unreadCount": 5,
  "totalCount": 0
}
```

---

### 4️⃣ Mark as Read

**Single:**
```http
POST /push-notifications/:id/read
```

**Multiple:**
```http
POST /push-notifications/mark-read
Content-Type: application/json

{
  "notificationIds": ["1", "2", "3"]
}
```

**All Institute:**
```http
POST /push-notifications/institute/:instituteId/mark-all-read
```

---

### 5️⃣ Get Single Notification (Auto-marks as read)

```http
GET /push-notifications/:id
```

> ⚠️ Automatically marks notification as read when viewed

---

## 🔐 Permission Matrix (Verified)

### Admin Controller Endpoints

| Endpoint | SUPERADMIN | Institute Admin | Teacher |
|----------|------------|-----------------|---------|
| `POST /admin` (GLOBAL scope) | ✅ | ❌ | ❌ |
| `POST /admin` (INSTITUTE scope) | ✅ | ✅ Own | ❌ |
| `POST /admin` (CLASS scope) | ✅ | ✅ Own | ✅ Own |
| `POST /admin` (SUBJECT scope) | ✅ | ✅ Own | ✅ Own |
| `GET /admin` | ✅ All | ✅ Own | ✅ Own |
| `GET /admin/:id` | ✅ | ✅ Own | ✅ Own |
| `POST /admin/:id/send` | ✅ | ✅ Own | ✅ Own |
| `POST /admin/:id/resend` | ✅ | ✅ Own | ✅ Own |
| `PUT /admin/:id/cancel` | ✅ | ✅ Own | ✅ Own |
| `DELETE /admin/:id` | ✅ | ✅ Own | ❌ |

### User Controller Endpoints

| Endpoint | Any Authenticated User |
|----------|------------------------|
| `GET /institute/:id` | ✅ (with institute access) |
| `GET /system` | ✅ |
| `GET /institute/:id/unread-count` | ✅ |
| `GET /system/unread-count` | ✅ |
| `POST /:id/read` | ✅ |
| `POST /mark-read` | ✅ |
| `POST /institute/:id/mark-all-read` | ✅ |
| `GET /:id` | ✅ |

---

## 📝 Complete Examples

### Example 1: SUPERADMIN - Create Global Notification

```typescript
// ✅ GLOBAL notification - SUPERADMIN only
const response = await fetch('/push-notifications/admin', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${superAdminToken}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    title: "System Maintenance Notice",
    body: "The system will be down for maintenance on January 25, 2026 from 2:00 AM to 4:00 AM IST. Please save your work.",
    scope: "GLOBAL",
    targetUserTypes: ["STUDENTS", "TEACHERS", "PARENTS", "INSTITUTE_ADMINS"],
    priority: "HIGH",
    sendImmediately: true
  })
});
```

### Example 2: SUPERADMIN - Target Advanced User Types

```typescript
// ✅ Target only unverified users (for verification reminder)
const response = await fetch('/push-notifications/admin', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${superAdminToken}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    title: "Please Verify Your Email",
    body: "Complete your registration by verifying your email address.",
    scope: "GLOBAL",
    targetUserTypes: ["UNVERIFIED_USERS_ONLY"],
    priority: "NORMAL",
    actionUrl: "app://settings/verify-email",
    sendImmediately: true
  })
});
```

### Example 3: Institute Admin - Institute-wide Notification

```typescript
// ✅ Institute-wide notification
const response = await fetch('/push-notifications/admin', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${instituteAdminToken}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    title: "School Holiday Notice",
    body: "School will remain closed on Friday due to public holiday.",
    scope: "INSTITUTE",
    targetUserTypes: ["STUDENTS", "PARENTS", "TEACHERS"],
    instituteId: "101",  // Required for INSTITUTE scope
    priority: "NORMAL",
    sendImmediately: true
  })
});
```

### Example 4: Teacher - Class Notification

```typescript
// ✅ Class notification with scheduling
const response = await fetch('/push-notifications/admin', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${teacherToken}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    title: "Test Reminder",
    body: "Don't forget: Math test tomorrow at 9:00 AM. Topics: Algebra Ch 1-3",
    scope: "CLASS",
    targetUserTypes: ["STUDENTS", "PARENTS"],
    instituteId: "101",
    classId: "1000",      // Required for CLASS scope
    priority: "HIGH",
    scheduledAt: "2026-01-24T06:00:00.000Z",  // Schedule for morning
    sendImmediately: false
  })
});
```

### Example 5: Teacher - Subject Notification with Deep Link

```typescript
// ✅ Subject notification with homework deep link
const response = await fetch('/push-notifications/admin', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${teacherToken}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    title: "New Homework Assigned",
    body: "Complete exercises 1-10 from Chapter 5. Due: January 26, 2026",
    scope: "SUBJECT",
    targetUserTypes: ["STUDENTS"],
    instituteId: "101",
    classId: "1000",
    subjectId: "500",     // Required for SUBJECT scope
    priority: "NORMAL",
    actionUrl: "app://homework/123",
    dataPayload: {
      homeworkId: "123",
      dueDate: "2026-01-26T17:00:00.000Z",
      subjectName: "Mathematics"
    },
    sendImmediately: true
  })
});
```

### Example 6: Frontend - Notification Badge & List

```typescript
// React hook for notification badge
const useNotificationBadge = (instituteId: string) => {
  const [unreadCount, setUnreadCount] = useState(0);
  
  useEffect(() => {
    const fetchUnread = async () => {
      const res = await fetch(
        `/push-notifications/institute/${instituteId}/unread-count`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const data = await res.json();
      setUnreadCount(data.unreadCount);
    };
    
    fetchUnread();
    const interval = setInterval(fetchUnread, 30000); // Poll every 30s
    
    return () => clearInterval(interval);
  }, [instituteId]);
  
  return unreadCount;
};

// Get notifications with pagination
const getNotifications = async (instituteId: string, page = 1) => {
  const res = await fetch(
    `/push-notifications/institute/${instituteId}?page=${page}&limit=20`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  return res.json();
};
```

---

## ✅ Validation Rules

### Scope-Based Required Fields

| Scope | Required Fields |
|-------|-----------------|
| `GLOBAL` | `title`, `body`, `scope`, `targetUserTypes` |
| `INSTITUTE` | + `instituteId` |
| `CLASS` | + `instituteId`, `classId` |
| `SUBJECT` | + `instituteId`, `classId`, `subjectId` |

### Field Constraints

| Field | Constraint |
|-------|------------|
| `title` | Max 255 characters, required |
| `body` | Max 5000 characters, required |
| `imageUrl` | Valid URL, max 500 characters |
| `icon` | Max 100 characters |
| `actionUrl` | Max 500 characters |
| `collapseKey` | Max 100 characters |
| `timeToLive` | Number (seconds), default 86400 |
| `scheduledAt` | ISO 8601 datetime string |

### Sender Role Mapping (from JWT)

| JWT `userTypeKey` | `senderRole` Value |
|-------------------|-------------------|
| `0` (SUPERADMIN) | `SYSTEM_ADMIN` |
| Institute role `0` | `INSTITUTE_ADMIN` |
| Institute role `1` | `TEACHER` |
| Institute role `2` | `STUDENT` |
| Institute role `3` | `PARENT` |
| Institute role `4` | `ATTENDANCE_MARKER` |

---

## ❌ Error Handling

### 400 Bad Request - Validation Errors

```json
{
  "statusCode": 400,
  "message": [
    "title must be shorter than or equal to 255 characters",
    "instituteId is required for non-global notifications"
  ],
  "error": "Bad Request"
}
```

### 403 Forbidden - Permission Denied

```json
{
  "statusCode": 403,
  "message": "You do not have permission to create GLOBAL notifications",
  "error": "Forbidden"
}
```

### 404 Not Found

```json
{
  "statusCode": 404,
  "message": "Notification not found",
  "error": "Not Found"
}
```

### 400 Bad Request - Invalid Status Transition

```json
{
  "statusCode": 400,
  "message": "Cannot cancel a notification that has already been sent",
  "error": "Bad Request"
}
```

```json
{
  "statusCode": 400,
  "message": "Only failed notifications can be resent",
  "error": "Bad Request"
}
```

---

## 📊 Differences from Previous Guide

| Aspect | Previous Guide | ✅ Actual Implementation |
|--------|---------------|--------------------------|
| Target enum | `ADMINS` | `INSTITUTE_ADMINS` |
| Advanced targets | Not documented | `USERS_WITHOUT_INSTITUTE`, `VERIFIED_USERS_ONLY`, etc. |
| Delete permission | Not specified | Teachers CANNOT delete |
| Auto-mark read | Not mentioned | `GET /:id` auto-marks as read |
| Response for mark-all | Generic | Returns count of marked |

---

## 🎯 Summary

### Admin API Quick Reference
| Action | Method | Endpoint |
|--------|--------|----------|
| Create | POST | `/push-notifications/admin` |
| List | GET | `/push-notifications/admin` |
| Get One | GET | `/push-notifications/admin/:id` |
| Send | POST | `/push-notifications/admin/:id/send` |
| Resend | POST | `/push-notifications/admin/:id/resend` |
| Cancel | PUT | `/push-notifications/admin/:id/cancel` |
| Delete | DELETE | `/push-notifications/admin/:id` |

### User API Quick Reference
| Action | Method | Endpoint |
|--------|--------|----------|
| Institute List | GET | `/push-notifications/institute/:id` |
| System List | GET | `/push-notifications/system` |
| Unread Count | GET | `/push-notifications/institute/:id/unread-count` |
| System Unread | GET | `/push-notifications/system/unread-count` |
| Single | GET | `/push-notifications/:id` |
| Mark Read | POST | `/push-notifications/:id/read` |
| Mark Multiple | POST | `/push-notifications/mark-read` |
| Mark All | POST | `/push-notifications/institute/:id/mark-all-read` |

---

**✅ This guide has been verified against actual implementation files.**
