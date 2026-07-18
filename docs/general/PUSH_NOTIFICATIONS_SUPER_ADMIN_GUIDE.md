# Push Notifications - Complete API Guide (Super Admin & All Roles)

## Overview
Comprehensive push notification system with role-based access control. Supports global, institute, class, and subject-level notifications.

---

## Table of Contents
1. [User Flows by Role](#user-flows-by-role)
2. [Admin APIs - Create & Manage](#admin-apis---create--manage)
3. [User APIs - View & Read](#user-apis---view--read)
4. [Request/Response Examples](#requestresponse-examples)
5. [Permission Matrix](#permission-matrix)
6. [Frontend Integration Guide](#frontend-integration-guide)

---

## User Flows by Role

### Super Admin Flow
```
1. Create global/system notification (ALL users)
   POST /push-notifications/admin
   
2. Create institute-specific notification
   POST /push-notifications/admin
   
3. View all notifications
   GET /push-notifications/admin
   
4. Send/resend notification
   POST /push-notifications/admin/{id}/send
   
5. Delete notification
   DELETE /push-notifications/admin/{id}
```

### Institute Admin Flow
```
1. Create institute-wide notification
   POST /push-notifications/admin
   
2. Create class/subject notifications
   POST /push-notifications/admin
   
3. View institute notifications
   GET /push-notifications/admin?instituteId=X
   
4. Cancel scheduled notification
   PUT /push-notifications/admin/{id}/cancel
```

### Teacher Flow
```
1. Create class notification
   POST /push-notifications/admin (scope: CLASS)
   
2. Create subject notification
   POST /push-notifications/admin (scope: SUBJECT)
   
3. View own notifications
   GET /push-notifications/admin?teacherId=X
```

### Student/Parent/User Flow
```
1. Get institute notifications
   GET /push-notifications/institute/{instituteId}
   
2. Get global/system notifications
   GET /push-notifications/system
   
3. Get unread count
   GET /push-notifications/institute/{instituteId}/unread-count
   
4. Mark as read
   POST /push-notifications/{id}/read
   
5. Mark all as read
   POST /push-notifications/institute/{instituteId}/mark-all-read
```

---

## Admin APIs - Create & Manage

### 1. Create Push Notification

#### Endpoint
```http
POST /push-notifications/admin
Authorization: Bearer <token>
Content-Type: application/json
```

#### Request Body
```json
{
  "title": "Important Announcement",
  "body": "Classes will be cancelled tomorrow due to weather conditions.",
  "imageUrl": "https://example.com/image.jpg",
  "icon": "ic_announcement",
  "actionUrl": "app://announcements/123",
  "dataPayload": {
    "announcementId": "123",
    "type": "general"
  },
  "scope": "INSTITUTE",
  "targetUserTypes": ["STUDENTS", "PARENTS"],
  "instituteId": "101",
  "classId": "1000",
  "subjectId": "2",
  "priority": "HIGH",
  "collapseKey": "announcement_general",
  "timeToLive": 86400,
  "scheduledAt": "2026-01-24T10:00:00.000Z",
  "sendImmediately": false
}
```

#### Field Descriptions

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `title` | string | ✅ | Notification title (max 255 chars) |
| `body` | string | ✅ | Notification message (max 5000 chars) |
| `imageUrl` | string | ❌ | Image URL for notification |
| `icon` | string | ❌ | Icon name (e.g., `ic_announcement`) |
| `actionUrl` | string | ❌ | Deep link when notification clicked |
| `dataPayload` | object | ❌ | Additional data as key-value pairs |
| `scope` | enum | ✅ | `GLOBAL`, `INSTITUTE`, `CLASS`, `SUBJECT` |
| `targetUserTypes` | array | ✅ | `STUDENTS`, `PARENTS`, `TEACHERS`, `ADMINS` |
| `instituteId` | string | Conditional | Required for non-global notifications |
| `classId` | string | Conditional | Required for `CLASS` or `SUBJECT` scope |
| `subjectId` | string | Conditional | Required for `SUBJECT` scope |
| `priority` | enum | ❌ | `LOW`, `NORMAL`, `HIGH` (default: `NORMAL`) |
| `collapseKey` | string | ❌ | FCM collapse key for grouping |
| `timeToLive` | number | ❌ | TTL in seconds (default: 86400 = 24 hours) |
| `scheduledAt` | string | ❌ | ISO datetime for scheduled delivery |
| `sendImmediately` | boolean | ❌ | Send immediately (default: `true`) |

#### Scope Rules

**GLOBAL (Super Admin Only)**
- Reaches ALL users in the system
- No `instituteId`, `classId`, or `subjectId` required

**INSTITUTE (Super Admin, Institute Admin)**
- Reaches all users in the institute
- Requires: `instituteId`

**CLASS (Institute Admin, Teacher)**
- Reaches all users in a specific class
- Requires: `instituteId`, `classId`

**SUBJECT (Institute Admin, Teacher)**
- Reaches all users enrolled in a subject
- Requires: `instituteId`, `classId`, `subjectId`

#### Response
```json
{
  "id": "1",
  "title": "Important Announcement",
  "body": "Classes will be cancelled tomorrow due to weather conditions.",
  "scope": "INSTITUTE",
  "targetUserTypes": ["STUDENTS", "PARENTS"],
  "instituteId": "101",
  "institute": {
    "id": "101",
    "name": "ABC Institute",
    "logoUrl": "https://storage.suraksha.lk/logos/abc.png"
  },
  "priority": "HIGH",
  "status": "DRAFT",
  "scheduledAt": "2026-01-24T10:00:00.000Z",
  "senderId": "2",
  "senderRole": "INSTITUTE_ADMIN",
  "sender": {
    "id": "2",
    "firstName": "John",
    "lastName": "Admin",
    "nameWithInitials": "J. Admin",
    "imageUrl": "https://storage.suraksha.lk/profiles/john.jpg"
  },
  "totalRecipients": 0,
  "sentCount": 0,
  "failedCount": 0,
  "readCount": 0,
  "createdAt": "2026-01-23T01:12:10.000Z",
  "updatedAt": "2026-01-23T01:12:10.000Z"
}
```

### 2. Get All Notifications (Admin View)

#### Endpoint
```http
GET /push-notifications/admin
Authorization: Bearer <token>
```

#### Query Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `page` | number | Page number (default: 1) |
| `limit` | number | Items per page (default: 10, max: 100) |
| `scope` | enum | Filter by scope: `GLOBAL`, `INSTITUTE`, `CLASS`, `SUBJECT` |
| `status` | enum | Filter by status: `DRAFT`, `SCHEDULED`, `SENDING`, `SENT`, `FAILED` |
| `instituteId` | string | Filter by institute |
| `classId` | string | Filter by class |
| `subjectId` | string | Filter by subject |
| `priority` | enum | Filter by priority: `LOW`, `NORMAL`, `HIGH` |
| `fromDate` | string | Filter from date (ISO format) |
| `toDate` | string | Filter to date (ISO format) |

#### Response
```json
{
  "data": [
    {
      "id": "1",
      "title": "Important Announcement",
      "body": "Classes will be cancelled tomorrow...",
      "scope": "INSTITUTE",
      "status": "SENT",
      "priority": "HIGH",
      "totalRecipients": 250,
      "sentCount": 248,
      "failedCount": 2,
      "readCount": 180,
      "createdAt": "2026-01-23T01:12:10.000Z",
      "sentAt": "2026-01-23T02:00:00.000Z"
    }
  ],
  "total": 1,
  "page": 1,
  "limit": 10,
  "totalPages": 1
}
```

### 3. Get Single Notification

#### Endpoint
```http
GET /push-notifications/admin/{id}
Authorization: Bearer <token>
```

#### Response
Full notification details with sender info, institute/class/subject details, and delivery statistics.

### 4. Send/Resend Notification

#### Endpoint
```http
POST /push-notifications/admin/{id}/send
Authorization: Bearer <token>
```

#### Use Cases
- Send draft notification immediately
- Resend failed notification
- Manually trigger scheduled notification

#### Response
```json
{
  "notificationId": "1",
  "status": "SENT",
  "totalRecipients": 250,
  "sentCount": 248,
  "failedCount": 2,
  "sentAt": "2026-01-23T02:00:00.000Z"
}
```

### 5. Cancel Notification

#### Endpoint
```http
PUT /push-notifications/admin/{id}/cancel
Authorization: Bearer <token>
```

#### Notes
- Can only cancel `DRAFT` or `SCHEDULED` notifications
- Cannot cancel already sent notifications

#### Response
```json
{
  "message": "Notification cancelled successfully"
}
```

### 6. Delete Notification

#### Endpoint
```http
DELETE /push-notifications/admin/{id}
Authorization: Bearer <token>
```

#### Access
- **Super Admin**: Can delete any notification
- **Institute Admin**: Can delete institute notifications only

#### Response
```json
{
  "message": "Notification deleted successfully"
}
```

---

## User APIs - View & Read

### 1. Get Institute Notifications

#### Endpoint
```http
GET /push-notifications/institute/{instituteId}
Authorization: Bearer <token>
```

#### Query Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `page` | number | Page number (default: 1) |
| `limit` | number | Items per page (default: 20) |
| `unreadOnly` | boolean | Show only unread notifications |
| `priority` | enum | Filter by priority |

#### Response
```json
{
  "data": [
    {
      "id": "1",
      "title": "Important Announcement",
      "body": "Classes will be cancelled tomorrow due to weather conditions.",
      "imageUrl": "https://example.com/image.jpg",
      "scope": "INSTITUTE",
      "priority": "HIGH",
      "institute": {
        "id": "101",
        "name": "ABC Institute",
        "logoUrl": "https://storage.suraksha.lk/logos/abc.png"
      },
      "sender": {
        "id": "2",
        "firstName": "John",
        "lastName": "Admin",
        "nameWithInitials": "J. Admin",
        "imageUrl": "https://storage.suraksha.lk/profiles/john.jpg"
      },
      "senderRole": "INSTITUTE_ADMIN",
      "isRead": false,
      "readAt": null,
      "createdAt": "2026-01-23T01:12:10.000Z"
    }
  ],
  "total": 25,
  "page": 1,
  "limit": 20,
  "totalPages": 2
}
```

### 2. Get System/Global Notifications

#### Endpoint
```http
GET /push-notifications/system
Authorization: Bearer <token>
```

#### Query Parameters
Same as institute notifications endpoint.

#### Response
Returns only `GLOBAL` scope notifications (from super admin).

### 3. Get Unread Count

#### Institute Notifications
```http
GET /push-notifications/institute/{instituteId}/unread-count
Authorization: Bearer <token>
```

#### System Notifications
```http
GET /push-notifications/system/unread-count
Authorization: Bearer <token>
```

#### Response
```json
{
  "unreadCount": 5,
  "totalCount": 0
}
```

### 4. Mark Notification as Read

#### Endpoint
```http
POST /push-notifications/{id}/read
Authorization: Bearer <token>
```

#### Response
```json
{
  "message": "Notification marked as read"
}
```

#### Auto-marking
Notification is automatically marked as read when user views details via `GET /push-notifications/{id}`.

### 5. Mark Multiple as Read

#### Endpoint
```http
POST /push-notifications/mark-read
Authorization: Bearer <token>
Content-Type: application/json
```

#### Request Body
```json
{
  "notificationIds": ["1", "2", "3"]
}
```

#### Response
```json
{
  "message": "Notifications marked as read",
  "count": 3
}
```

### 6. Mark All Institute Notifications as Read

#### Endpoint
```http
POST /push-notifications/institute/{instituteId}/mark-all-read
Authorization: Bearer <token>
```

#### Response
```json
{
  "message": "Marked 15 notifications as read"
}
```

---

## Request/Response Examples

### Example 1: Super Admin - Create Global Notification

```typescript
const createGlobalNotification = async () => {
  const response = await fetch('/push-notifications/admin', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${superAdminToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      title: "System Maintenance",
      body: "The system will be down for maintenance on Jan 25, 2026 from 2:00 AM to 4:00 AM.",
      scope: "GLOBAL",
      targetUserTypes: ["STUDENTS", "PARENTS", "TEACHERS", "ADMINS"],
      priority: "HIGH",
      sendImmediately: true
    })
  });
  
  return await response.json();
};
```

### Example 2: Institute Admin - Create Class Notification

```typescript
const createClassNotification = async () => {
  const response = await fetch('/push-notifications/admin', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${adminToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      title: "Class Cancelled",
      body: "Math class on Friday is cancelled. Rescheduled to next Monday.",
      scope: "CLASS",
      targetUserTypes: ["STUDENTS", "PARENTS"],
      instituteId: "101",
      classId: "1000",
      priority: "NORMAL",
      actionUrl: "app://schedule/reschedule",
      sendImmediately: true
    })
  });
  
  return await response.json();
};
```

### Example 3: Teacher - Create Subject Notification

```typescript
const createSubjectNotification = async () => {
  const response = await fetch('/push-notifications/admin', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${teacherToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      title: "Homework Reminder",
      body: "Don't forget to submit your homework by tomorrow 5 PM.",
      scope: "SUBJECT",
      targetUserTypes: ["STUDENTS"],
      instituteId: "101",
      classId: "1000",
      subjectId: "2",
      priority: "NORMAL",
      actionUrl: "app://homework/123",
      dataPayload: {
        homeworkId: "123",
        dueDate: "2026-01-24T17:00:00.000Z"
      },
      scheduledAt: "2026-01-24T08:00:00.000Z",
      sendImmediately: false
    })
  });
  
  return await response.json();
};
```

### Example 4: Student - Get Notifications with Unread Badge

```typescript
const getNotifications = async (instituteId: string) => {
  // Get unread count for badge
  const countResponse = await fetch(
    `/push-notifications/institute/${instituteId}/unread-count`,
    {
      headers: { 'Authorization': `Bearer ${studentToken}` }
    }
  );
  const { unreadCount } = await countResponse.json();
  
  // Get notifications list
  const listResponse = await fetch(
    `/push-notifications/institute/${instituteId}?page=1&limit=20`,
    {
      headers: { 'Authorization': `Bearer ${studentToken}` }
    }
  );
  const notifications = await listResponse.json();
  
  return { unreadCount, notifications };
};
```

### Example 5: Mark Notification as Read on Click

```typescript
const markAsReadAndOpen = async (notificationId: string) => {
  // Mark as read
  await fetch(`/push-notifications/${notificationId}/read`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}` }
  });
  
  // Get full details
  const response = await fetch(`/push-notifications/${notificationId}`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  
  return await response.json();
};
```

---

## Permission Matrix

### Admin APIs (/push-notifications/admin)

| Operation | Super Admin | Institute Admin | Teacher | Student/Parent |
|-----------|-------------|-----------------|---------|----------------|
| **Create** |
| Global Notification | ✅ | ❌ | ❌ | ❌ |
| Institute Notification | ✅ | ✅ Own institute | ❌ | ❌ |
| Class Notification | ✅ | ✅ Own institute | ✅ Own classes | ❌ |
| Subject Notification | ✅ | ✅ Own institute | ✅ Own subjects | ❌ |
| **View** |
| All Notifications | ✅ | ✅ Own institute | ✅ Own created | ❌ |
| Notification Details | ✅ | ✅ Own institute | ✅ Own created | ❌ |
| **Manage** |
| Send/Resend | ✅ | ✅ Own institute | ✅ Own created | ❌ |
| Cancel | ✅ | ✅ Own institute | ✅ Own created | ❌ |
| Delete | ✅ | ✅ Own institute | ❌ | ❌ |

### User APIs (/push-notifications)

| Operation | Super Admin | Institute Admin | Teacher | Student/Parent |
|-----------|-------------|-----------------|---------|----------------|
| View Institute Notifications | ✅ | ✅ | ✅ | ✅ |
| View System Notifications | ✅ | ✅ | ✅ | ✅ |
| Get Unread Count | ✅ | ✅ | ✅ | ✅ |
| Mark as Read | ✅ | ✅ | ✅ | ✅ |
| Mark Multiple as Read | ✅ | ✅ | ✅ | ✅ |
| Mark All as Read | ✅ | ✅ | ✅ | ✅ |

---

## Frontend Integration Guide

### Implementation Checklist

#### 1. Notification Badge
```typescript
// Update badge count every 30 seconds
useEffect(() => {
  const fetchUnreadCount = async () => {
    const response = await fetch(
      `/push-notifications/institute/${instituteId}/unread-count`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    const { unreadCount } = await response.json();
    setBadgeCount(unreadCount);
  };
  
  fetchUnreadCount();
  const interval = setInterval(fetchUnreadCount, 30000);
  
  return () => clearInterval(interval);
}, [instituteId, token]);
```

#### 2. Notification List with Infinite Scroll
```typescript
const NotificationList = () => {
  const [notifications, setNotifications] = useState([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  
  const loadMore = async () => {
    const response = await fetch(
      `/push-notifications/institute/${instituteId}?page=${page}&limit=20`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    const data = await response.json();
    
    setNotifications(prev => [...prev, ...data.data]);
    setHasMore(page < data.totalPages);
    setPage(prev => prev + 1);
  };
  
  return (
    <InfiniteScroll loadMore={loadMore} hasMore={hasMore}>
      {notifications.map(notif => (
        <NotificationCard key={notif.id} notification={notif} />
      ))}
    </InfiniteScroll>
  );
};
```

#### 3. Auto-mark as Read on View
```typescript
const NotificationCard = ({ notification }) => {
  const markAsRead = async () => {
    if (!notification.isRead) {
      await fetch(`/push-notifications/${notification.id}/read`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
    }
  };
  
  const handleClick = () => {
    markAsRead();
    // Navigate to action URL or show details
    if (notification.actionUrl) {
      router.push(notification.actionUrl);
    }
  };
  
  return (
    <div 
      className={notification.isRead ? 'read' : 'unread'}
      onClick={handleClick}
    >
      <h3>{notification.title}</h3>
      <p>{notification.body}</p>
      <span>{formatDate(notification.createdAt)}</span>
    </div>
  );
};
```

#### 4. Admin Create Notification Form
```typescript
const CreateNotificationForm = () => {
  const [formData, setFormData] = useState({
    title: '',
    body: '',
    scope: 'INSTITUTE',
    targetUserTypes: ['STUDENTS'],
    instituteId: '',
    priority: 'NORMAL',
    sendImmediately: true
  });
  
  const handleSubmit = async (e) => {
    e.preventDefault();
    
    const response = await fetch('/push-notifications/admin', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(formData)
    });
    
    if (response.ok) {
      const notification = await response.json();
      alert(`Notification created! ID: ${notification.id}`);
    }
  };
  
  return (
    <form onSubmit={handleSubmit}>
      <input 
        placeholder="Title"
        value={formData.title}
        onChange={(e) => setFormData({...formData, title: e.target.value})}
        required
      />
      <textarea 
        placeholder="Message"
        value={formData.body}
        onChange={(e) => setFormData({...formData, body: e.target.value})}
        required
      />
      {/* Add more fields */}
      <button type="submit">Create & Send</button>
    </form>
  );
};
```

---

## Best Practices

### For Admins Creating Notifications

1. **Choose Appropriate Scope**
   - Use `GLOBAL` sparingly (system-wide announcements only)
   - Prefer `CLASS` or `SUBJECT` for targeted communications

2. **Target Specific User Types**
   - Don't send to all user types unnecessarily
   - Example: Homework reminders → Students only, not parents

3. **Set Priority Correctly**
   - `HIGH`: Emergency, urgent announcements
   - `NORMAL`: Regular communications
   - `LOW`: Optional information

4. **Use Scheduled Delivery**
   - Schedule for optimal times (e.g., 8 AM for school notifications)
   - Avoid late-night notifications

5. **Include Action URLs**
   - Link to relevant content in the app
   - Examples: `app://homework/123`, `app://announcements/456`

### For Frontend Developers

1. **Implement Real-time Updates**
   - Poll unread count every 30 seconds
   - Consider WebSocket for instant delivery

2. **Optimize Performance**
   - Use infinite scroll for notification lists
   - Cache notifications locally
   - Debounce mark-as-read actions

3. **Handle Deep Links**
   - Parse `actionUrl` and navigate appropriately
   - Handle missing or invalid URLs gracefully

4. **Visual Indicators**
   - Show unread badge prominently
   - Use different colors for priority levels
   - Animate new notifications

---

## Error Handling

### Common Errors

#### 403 Forbidden
```json
{
  "statusCode": 403,
  "message": "You do not have permission to create notifications for this scope"
}
```

**Solution**: Check user role and scope combination.

#### 400 Bad Request - Missing Required Fields
```json
{
  "statusCode": 400,
  "message": "instituteId is required for INSTITUTE scope"
}
```

**Solution**: Provide all required fields based on scope.

#### 400 Bad Request - Invalid Scheduled Time
```json
{
  "statusCode": 400,
  "message": "scheduledAt must be in the future"
}
```

**Solution**: Ensure `scheduledAt` is a future datetime.

#### 404 Not Found
```json
{
  "statusCode": 404,
  "message": "Notification not found"
}
```

**Solution**: Verify notification ID exists and user has access.

---

## Summary

### Key Features

✅ **Multi-level Scoping**: Global → Institute → Class → Subject  
✅ **Role-based Access**: Super Admin, Institute Admin, Teacher permissions  
✅ **Flexible Targeting**: Target specific user types  
✅ **Scheduling**: Send immediately or schedule for later  
✅ **Read Tracking**: Track which users have read notifications  
✅ **Rich Content**: Images, icons, action URLs, custom data  
✅ **Priority Levels**: HIGH, NORMAL, LOW  
✅ **Delivery Stats**: Total sent, failed, read counts  

### Architecture Benefits

- **Performance**: Efficient querying with filters
- **Security**: Automatic role-based filtering
- **Scalability**: Handles large recipient counts
- **Flexibility**: Supports various notification types
- **Analytics**: Track delivery and engagement metrics
