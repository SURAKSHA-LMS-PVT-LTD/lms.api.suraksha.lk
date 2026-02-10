# Frontend API Changes - February 2026

## 📋 Overview

This document outlines recent API changes that impact frontend implementation. All changes are **breaking changes** and require frontend updates.

---

## 🔐 Authentication & Sessions API

### **Endpoint:** `GET /auth/sessions`

#### ✅ What Changed

**Field Name Changes:**
- ❌ `createdAt` → ✅ `firstLogin` (when user logged in)
- ❌ `expiresAt` → ✅ `tokenExpiry` (when token expires)
- ❌ `expiresInHuman` → **REMOVED** (no longer available)

#### 📊 New Response Format

```typescript
{
  "success": true,
  "sessions": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "platform": "web",
      "deviceName": null,
      "userAgent": "Mozilla/5.0...",
      "firstLogin": "2026-02-11T00:58:48.000Z",      // ✅ NEW NAME
      "tokenExpiry": "2026-02-18T00:58:48.000Z",     // ✅ NEW NAME
      "isCurrent": false
    }
  ],
  "pagination": {
    "total": 53,
    "page": 1,
    "limit": 50,
    "totalPages": 2,
    "hasNext": true,
    "hasPrev": false
  },
  "summary": {
    "totalSessions": 53,
    "webSessions": 53,
    "androidSessions": 0,
    "iosSessions": 0
  }
}
```

#### 🔧 Frontend Migration

**Before:**
```typescript
const createdDate = new Date(session.createdAt);
const expiryDate = new Date(session.expiresAt);
const humanReadable = session.expiresInHuman; // "6 days"
```

**After:**
```typescript
const loginDate = new Date(session.firstLogin);
const expiryDate = new Date(session.tokenExpiry);

// Calculate your own human-readable format
const daysUntilExpiry = Math.ceil(
  (expiryDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)
);
const humanReadable = `${daysUntilExpiry} days`;
```

#### 📦 TypeScript Interface

```typescript
interface Session {
  id: string;
  platform: 'web' | 'android' | 'ios';
  deviceName: string | null;
  userAgent: string | null;
  firstLogin: string;      // ISO 8601 date string
  tokenExpiry: string;     // ISO 8601 date string
  isCurrent: boolean;
}

interface SessionsResponse {
  success: boolean;
  sessions: Session[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
  summary: {
    totalSessions: number;
    webSessions: number;
    androidSessions: number;
    iosSessions: number;
  };
}
```

---

## 🔔 Push Notifications API - Complete Guide

### **Available Endpoints**

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/push-notifications/system` | GET | Get global/system notifications |
| `/push-notifications/institute/:id` | GET | Get institute-specific notifications |
| `/push-notifications/:id` | GET | Get single notification (auto-marks as read) |
| `/push-notifications/system/unread-count` | GET | Get unread count for system notifications |
| `/push-notifications/institute/:id/unread-count` | GET | Get unread count for institute |
| `/push-notifications/:id/read` | POST | Mark single notification as read |
| `/push-notifications/mark-read` | POST | Mark multiple notifications as read |
| `/push-notifications/institute/:id/mark-all-read` | POST | Mark all institute notifications as read |

---

### **1. List Notifications**

#### **System Notifications**
```typescript
GET /push-notifications/system?page=1&limit=10
```

#### **Institute Notifications**
```typescript
GET /push-notifications/institute/123?page=1&limit=10
```

#### ✅ What Changed

**Field Changes:**
- ❌ `createdAt` → **REMOVED**
- ❌ `sender` (full user object) → ✅ `null` (privacy optimization)
- ✅ `sentAt` → **ADDED** (when notification was sent)

**Performance Optimizations:**
- Sender details no longer fetched (reduces database joins)
- Only `senderRole` available (e.g., "SYSTEM_ADMIN", "TEACHER")

#### 📊 Response Format

```typescript
{
  "data": [
    {
      "id": "28",
      "title": "Important Announcement",
      "body": "This is a system notification",
      "imageUrl": "https://example.com/notification-image.jpg",  // Image for notification
      "icon": "bell",                                           // Icon identifier
      "actionUrl": "/dashboard/announcements/28",               // Click destination
      "dataPayload": { "type": "announcement", "priority": "high" },
      "scope": "GLOBAL",
      "priority": "NORMAL",
      "sender": null,                              // Always null now
      "senderRole": "SYSTEM_ADMIN",               // Available
      "isRead": false,
      "sentAt": "2026-01-23T07:03:15.000Z"        // When sent
    }
  ],
  "total": 22,
  "page": 1,
  "limit": 10,
  "totalPages": 3,
  "unreadCount": 5  // Unread notifications count
}
```

---

### **2. Get Single Notification**

```typescript
GET /push-notifications/:id
```

**⚠️ Important:** This endpoint automatically marks the notification as read when viewed.

**Response:**
```typescript
{
  "id": "28",
  "title": "Important Announcement",
  "body": "Full notification content here...",
  "imageUrl": "https://example.com/image.jpg",
  "actionUrl": "/dashboard/view/28",
  "isRead": true,  // Will be true after viewing
  "sentAt": "2026-01-23T07:03:15.000Z"
}
```

---

### **3. Unread Count APIs**

#### **System Notifications Unread Count**
```typescript
GET /push-notifications/system/unread-count

Response:
{
  "unreadCount": 5,
  "totalCount": 0
}
```

#### **Institute Notifications Unread Count**
```typescript
GET /push-notifications/institute/:id/unread-count

Response:
{
  "unreadCount": 12,
  "totalCount": 0
}
```

---

### **4. Mark as Read APIs**

#### **Mark Single Notification as Read**
```typescript
POST /push-notifications/:id/read

Response:
{
  "message": "Notification marked as read"
}
```

#### **Mark Multiple Notifications as Read**
```typescript
POST /push-notifications/mark-read
Content-Type: application/json

{
  "notificationIds": ["28", "27", "26"]
}

Response:
{
  "message": "Notifications marked as read",
  "count": 3
}
```

#### **Mark All Institute Notifications as Read**
```typescript
POST /push-notifications/institute/:id/mark-all-read

Response:
{
  "message": "Marked 12 notifications as read"
}
```

---

### **5. Frontend Implementation Examples**

#### 📦 TypeScript Interfaces

```typescript
interface Notification {
  id: string;
  title: string;
  body: string;
  imageUrl: string | null;
  icon: string | null;
  actionUrl: string | null;                    // URL to navigate when clicked
  dataPayload: Record<string, string> | null;  // Additional metadata
  scope: 'GLOBAL' | 'INSTITUTE' | 'CLASS' | 'SUBJECT';
  priority: 'HIGH' | 'NORMAL' | 'LOW';
  sender: null;
  senderRole: string;
  isRead: boolean;
  sentAt: string;
}

interface NotificationsResponse {
  data: Notification[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  unreadCount: number;
}

interface UnreadCountResponse {
  unreadCount: number;
  totalCount: number;
}
```

---

### **6. Display Notification Card - Professional Design**

#### **React Component with Image & Action URL**

```tsx
import React from 'react';
import { useNavigate } from 'react-router-dom';

interface NotificationCardProps {
  notification: Notification;
  onMarkAsRead: (id: string) => void;
}

export default function NotificationCard({ notification, onMarkAsRead }: NotificationCardProps) {
  const navigate = useNavigate();

  const handleClick = async () => {
    // Mark as read first
    if (!notification.isRead) {
      await onMarkAsRead(notification.id);
    }

    // Navigate to action URL if exists
    if (notification.actionUrl) {
      // Check if external URL
      if (notification.actionUrl.startsWith('http')) {
        window.open(notification.actionUrl, '_blank');
      } else {
        // Internal route
        navigate(notification.actionUrl);
      }
    }
  };

  return (
    <div 
      className={`notification-card ${!notification.isRead ? 'unread' : ''}`}
      onClick={handleClick}
      style={{ cursor: notification.actionUrl ? 'pointer' : 'default' }}
    >
      {/* Left Side: Content */}
      <div className="notification-content">
        {/* Header */}
        <div className="notification-header">
          <h3 className="notification-title">{notification.title}</h3>
          {!notification.isRead && <span className="unread-badge">New</span>}
        </div>

        {/* Body */}
        <p className="notification-body">{notification.body}</p>

        {/* Footer */}
        <div className="notification-footer">
          <span className="role-badge">{notification.senderRole}</span>
          <time className="sent-time">
            {new Date(notification.sentAt).toLocaleString()}
          </time>
          {notification.priority === 'HIGH' && (
            <span className="priority-badge high">High Priority</span>
          )}
        </div>
      </div>

      {/* Right Side: Image (if exists) */}
      {notification.imageUrl && (
        <div className="notification-image">
          <img 
            src={notification.imageUrl} 
            alt={notification.title}
            onError={(e) => {
              // Hide image if load fails
              e.currentTarget.style.display = 'none';
            }}
          />
        </div>
      )}

      {/* Action Indicator */}
      {notification.actionUrl && (
        <div className="action-indicator">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
            <path d="M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6-1.41-1.41z"/>
          </svg>
        </div>
      )}
    </div>
  );
}
```

#### **CSS Styling (Professional Industrial Design)**

```css
.notification-card {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 16px;
  background: #ffffff;
  border: 1px solid #e0e0e0;
  border-radius: 8px;
  margin-bottom: 12px;
  transition: all 0.2s ease;
}

.notification-card:hover {
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  transform: translateY(-2px);
}

.notification-card.unread {
  background: #f0f7ff;
  border-left: 4px solid #2196F3;
}

.notification-content {
  flex: 1;
  min-width: 0; /* Allow text truncation */
}

.notification-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.notification-title {
  font-size: 16px;
  font-weight: 600;
  color: #212121;
  margin: 0;
}

.unread-badge {
  display: inline-block;
  padding: 2px 8px;
  background: #2196F3;
  color: white;
  font-size: 11px;
  font-weight: 600;
  border-radius: 12px;
  text-transform: uppercase;
}

.notification-body {
  font-size: 14px;
  color: #616161;
  line-height: 1.5;
  margin: 0 0 12px 0;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.notification-footer {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 12px;
}

.role-badge {
  padding: 4px 8px;
  background: #f5f5f5;
  color: #616161;
  border-radius: 4px;
  font-weight: 500;
}

.sent-time {
  color: #9e9e9e;
}

.priority-badge.high {
  padding: 4px 8px;
  background: #ffebee;
  color: #c62828;
  border-radius: 4px;
  font-weight: 600;
}

/* Right Side Image */
.notification-image {
  flex-shrink: 0;
  width: 80px;
  height: 80px;
  border-radius: 8px;
  overflow: hidden;
  background: #f5f5f5;
}

.notification-image img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

/* Action Indicator */
.action-indicator {
  flex-shrink: 0;
  color: #9e9e9e;
}

/* Responsive */
@media (max-width: 768px) {
  .notification-card {
    flex-direction: column;
    align-items: flex-start;
  }

  .notification-image {
    width: 100%;
    height: 150px;
  }
}
```

---

### **7. Notification Badge with Unread Count**

```tsx
import { useState, useEffect } from 'react';
import apiClient from '@/lib/apiClient';

export default function NotificationBadge() {
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    fetchUnreadCount();
    // Poll every 30 seconds
    const interval = setInterval(fetchUnreadCount, 30000);
    return () => clearInterval(interval);
  }, []);

  const fetchUnreadCount = async () => {
    try {
      const systemCount = await apiClient.get('/push-notifications/system/unread-count');
      // Add institute count if needed
      // const instituteCount = await apiClient.get('/push-notifications/institute/123/unread-count');
      
      setUnreadCount(systemCount.data.unreadCount);
    } catch (error) {
      console.error('Failed to fetch unread count', error);
    }
  };

  return (
    <div className="notification-badge">
      <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.89 2 2 2zm6-6v-5c0-3.07-1.64-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.63 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z"/>
      </svg>
      {unreadCount > 0 && (
        <span className="badge-count">
          {unreadCount > 99 ? '99+' : unreadCount}
        </span>
      )}
    </div>
  );
}
```

---

### **8. Mark All as Read Button**

```tsx
async function handleMarkAllAsRead(instituteId?: string) {
  try {
    if (instituteId) {
      await apiClient.post(`/push-notifications/institute/${instituteId}/mark-all-read`);
    } else {
      // For system notifications, fetch all and mark
      const response = await apiClient.get('/push-notifications/system?page=1&limit=1000');
      const unreadIds = response.data.data.filter(n => !n.isRead).map(n => n.id);
      
      if (unreadIds.length > 0) {
        await apiClient.post('/push-notifications/mark-read', {
          notificationIds: unreadIds
        });
      }
    }
    
    // Refresh notification list
    fetchNotifications();
  } catch (error) {
    console.error('Failed to mark all as read', error);
  }
}
```

---

### **9. Notification List Component**

```tsx
import { useState, useEffect } from 'react';
import apiClient from '@/lib/apiClient';
import NotificationCard from './NotificationCard';

export default function NotificationList({ instituteId }: { instituteId?: string }) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchNotifications();
  }, [page, instituteId]);

  const fetchNotifications = async () => {
    setLoading(true);
    try {
      const endpoint = instituteId 
        ? `/push-notifications/institute/${instituteId}`
        : '/push-notifications/system';
      
      const response = await apiClient.get(`${endpoint}?page=${page}&limit=10`);
      setNotifications(response.data.data);
      setUnreadCount(response.data.unreadCount);
    } catch (error) {
      console.error('Failed to fetch notifications', error);
    } finally {
      setLoading(false);
    }
  };

  const handleMarkAsRead = async (notificationId: string) => {
    try {
      await apiClient.post(`/push-notifications/${notificationId}/read`);
      
      // Update local state
      setNotifications(prev => 
        prev.map(n => n.id === notificationId ? { ...n, isRead: true } : n)
      );
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch (error) {
      console.error('Failed to mark as read', error);
    }
  };

  const handleMarkAllAsRead = async () => {
    if (instituteId) {
      await apiClient.post(`/push-notifications/institute/${instituteId}/mark-all-read`);
    } else {
      const unreadIds = notifications.filter(n => !n.isRead).map(n => n.id);
      if (unreadIds.length > 0) {
        await apiClient.post('/push-notifications/mark-read', { notificationIds: unreadIds });
      }
    }
    fetchNotifications();
  };

  return (
    <div className="notification-list">
      <div className="notification-header">
        <h2>Notifications</h2>
        <div className="notification-actions">
          {unreadCount > 0 && (
            <span className="unread-count">{unreadCount} unread</span>
          )}
          <button onClick={handleMarkAllAsRead} disabled={unreadCount === 0}>
            Mark All as Read
          </button>
        </div>
      </div>

      {loading ? (
        <div>Loading...</div>
      ) : (
        <div className="notification-items">
          {notifications.map(notification => (
            <NotificationCard
              key={notification.id}
              notification={notification}
              onMarkAsRead={handleMarkAsRead}
            />
          ))}
        </div>
      )}

      {/* Pagination */}
      <div className="pagination">
        <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>
          Previous
        </button>
        <span>Page {page}</span>
        <button onClick={() => setPage(p => p + 1)}>
          Next
        </button>
      </div>
    </div>
  );
}
```

---

### **10. Key Features Explained**

#### **Image Display:**
- Images appear on the **right side** of notification card
- 80x80px thumbnail in list view
- Full width when expanded
- Fallback to hidden if image fails to load
- Professional rounded corners with object-fit cover

#### **Action URL Behavior:**
- If `actionUrl` exists, card becomes clickable
- Internal routes (e.g., `/dashboard/view/28`) use React Router
- External URLs (starting with `http`) open in new tab
- Notification automatically marked as read on click
- Visual indicator (arrow icon) shows clickable state

#### **Unread Count:**
- Badge shows count up to 99 (displays "99+" for higher)
- Updates automatically every 30 seconds
- Decreases when notifications marked as read
- Available per-institute and globally

#### **Priority Display:**
- HIGH priority shows red badge
- NORMAL priority shows default styling
- Badge appears in footer for quick identification

---

### **11. Best Practices**

✅ **Always handle action URLs:**
```typescript
if (notification.actionUrl) {
  // Navigate to the URL when clicked
}
```

✅ **Display images professionally:**
```typescript
{notification.imageUrl && (
  <img src={notification.imageUrl} alt={notification.title} />
)}
```

✅ **Show unread badges clearly:**
```typescript
{!notification.isRead && <span className="unread-badge">New</span>}
```

✅ **Poll for unread counts:**
```typescript
setInterval(fetchUnreadCount, 30000); // Every 30 seconds
```

✅ **Mark as read on view:**
```typescript
// Automatically happens with GET /push-notifications/:id
// Or manually with POST /push-notifications/:id/read
```

---

## 🎨 UI/UX Recommendations

### Session Management Page

**Display Session Information:**
```tsx
<div className="session-card">
  <div className="session-header">
    <span className="platform">{session.platform}</span>
    <span className="device">{session.userAgent}</span>
  </div>
  
  <div className="session-dates">
    <div>
      <label>Logged in:</label>
      <time>{new Date(session.firstLogin).toLocaleString()}</time>
    </div>
    <div>
      <label>Expires:</label>
      <time>{new Date(session.tokenExpiry).toLocaleString()}</time>
    </div>
  </div>
  
  <button onClick={() => revokeSession(session.id)}>
    Revoke Session
  </button>
</div>
```

**Calculate Time Remaining:**
```typescript
function getTimeRemaining(tokenExpiry: string): string {
  const now = Date.now();
  const expiry = new Date(tokenExpiry).getTime();
  const diff = expiry - now;
  
  if (diff <= 0) return 'Expired';
  
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  
  if (days > 0) return `${days} day${days > 1 ? 's' : ''}`;
  return `${hours} hour${hours > 1 ? 's' : ''}`;
}
```

### Notification Features

See the comprehensive **Push Notifications API - Complete Guide** section above for:
- Professional notification card design with images
- Action URL click handling
- Unread count badge implementation
- Mark all as read functionality
- Complete notification list component

---

## 🚀 Testing Checklist

### Sessions API
- [ ] Verify `firstLogin` displays correctly
- [ ] Verify `tokenExpiry` displays correctly
- [ ] Remove all references to `createdAt` and `expiresAt`
- [ ] Remove all references to `expiresInHuman`
- [ ] Test custom time remaining calculation
- [ ] Test session revocation still works

### Notifications API
- [ ] Verify `sentAt` displays correctly
- [ ] Remove all references to `createdAt`
- [ ] Remove all references to `notification.sender.*`
- [ ] Verify `senderRole` displays correctly
- [ ] Test notification image display (right side)
- [ ] Test action URL click navigation
  - [ ] Internal routes navigate correctly
  - [ ] External URLs open in new tab
- [ ] Test notification automatically marks as read when clicked
- [ ] Test unread count badge displays correctly
- [ ] Test unread count updates when marking as read
- [ ] Test "Mark All as Read" functionality
- [ ] Test "Mark Multiple as Read" functionality
- [ ] Test notification list pagination
- [ ] Test high priority badge displays correctly
- [ ] Test notification card hover effects
- [ ] Test GET single notification endpoint
- [ ] Test unread count polling (every 30 seconds)

---

## 📞 API Endpoints Reference

### Quick Reference

| Endpoint | Method | Changes |
|----------|--------|---------|
| `/auth/sessions` | GET | Field renames: `firstLogin`, `tokenExpiry` |
| `/push-notifications/system` | GET | Added `sentAt`, removed `sender` object |
| `/push-notifications/institute/:id` | GET | Added `sentAt`, removed `sender` object |
| `/push-notifications/:id` | GET | Get single notification (auto-marks as read) |
| `/push-notifications/system/unread-count` | GET | Get unread count for system notifications |
| `/push-notifications/institute/:id/unread-count` | GET | Get unread count for institute |
| `/push-notifications/:id/read` | POST | Mark single notification as read |
| `/push-notifications/mark-read` | POST | Mark multiple notifications as read |
| `/push-notifications/institute/:id/mark-all-read` | POST | Mark all institute notifications as read |

---

## 🔄 Refresh Token Flow (No Changes)

The refresh token system remains unchanged and continues to use **HttpOnly cookies**:

```typescript
// Login
const response = await fetch('/v2/auth/login', {
  method: 'POST',
  credentials: 'include', // Sends cookies
  body: JSON.stringify({ identifier, password })
});

// Refresh
const response = await fetch('/v2/auth/refresh', {
  method: 'POST',
  credentials: 'include' // Automatically sends refresh_token cookie
});
```

---

## ❓ Support

For questions or issues:
1. Check TypeScript types in response
2. Test with Postman/browser DevTools
3. Contact backend team if discrepancies found

**Last Updated:** February 10, 2026
