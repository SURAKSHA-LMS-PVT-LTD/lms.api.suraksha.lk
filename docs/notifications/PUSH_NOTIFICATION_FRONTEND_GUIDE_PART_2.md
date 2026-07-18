# Push Notification Frontend Integration Guide - PART 2

## Complete Guide for Suraksha LMS Push Notifications

**Part 2 of 3: User & Institute Notifications**

This part covers:
- User Notifications (Before Institute Selection)
- Institute Notifications (After Institute Selection)

---

## Table of Contents
1. [User Notifications (Before Institute Selection)](#1-user-notifications-before-institute-selection)
2. [Institute Notifications (After Institute Selection)](#2-institute-notifications-after-institute-selection)

---

## 1. User Notifications (Before Institute Selection)

**When to show:** User is logged in but has NOT selected an institute yet.

**Location:** Display as "Notifications" in the header/sidebar.

### Task 1.1: Create System Notifications API Service

```typescript
// src/services/notificationApiService.ts

export interface Notification {
  id: string;
  title: string;
  body: string;
  imageUrl?: string;
  icon?: string;
  actionUrl?: string;
  scope: 'GLOBAL' | 'INSTITUTE' | 'CLASS' | 'SUBJECT';
  priority: 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';
  isRead: boolean;
  createdAt: string;
  sentAt?: string;
  senderName?: string;
}

export interface PaginatedNotifications {
  data: Notification[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface UnreadCount {
  unreadCount: number;
  totalCount: number;
}

class NotificationApiService {
  
  /**
   * Get SYSTEM/GLOBAL notifications only
   * Call this when user has NOT selected any institute
   * 
   * @endpoint GET /push-notifications/system
   */
  async getSystemNotifications(
    jwtToken: string,
    options?: {
      page?: number;
      limit?: number;
      unreadOnly?: boolean;
    }
  ): Promise<PaginatedNotifications> {
    const params = new URLSearchParams();
    if (options?.page) params.append('page', options.page.toString());
    if (options?.limit) params.append('limit', options.limit.toString());
    if (options?.unreadOnly) params.append('unreadOnly', 'true');

    const response = await fetch(
      `/api/push-notifications/system?${params.toString()}`,
      {
        headers: {
          'Authorization': `Bearer ${jwtToken}`
        }
      }
    );

    if (!response.ok) {
      throw new Error('Failed to fetch system notifications');
    }

    return response.json();
  }

  /**
   * Get unread count for system notifications
   * 
   * @endpoint GET /push-notifications/system/unread-count
   */
  async getSystemUnreadCount(jwtToken: string): Promise<UnreadCount> {
    const response = await fetch(
      '/api/push-notifications/system/unread-count',
      {
        headers: {
          'Authorization': `Bearer ${jwtToken}`
        }
      }
    );

    if (!response.ok) {
      throw new Error('Failed to fetch unread count');
    }

    return response.json();
  }
}

export const notificationApiService = new NotificationApiService();
```

### Task 1.2: System Notifications Component

```tsx
// src/components/notifications/SystemNotifications.tsx
import React, { useState, useEffect } from 'react';
import { notificationApiService, Notification, PaginatedNotifications } from '../../services/notificationApiService';
import { useAuth } from '../../hooks/useAuth';

/**
 * System Notifications Component
 * Shows GLOBAL notifications when user hasn't selected an institute
 */
export const SystemNotifications: React.FC = () => {
  const { jwtToken } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  useEffect(() => {
    if (jwtToken) {
      loadNotifications();
      loadUnreadCount();
    }
  }, [jwtToken, page]);

  const loadNotifications = async () => {
    try {
      setLoading(true);
      const result = await notificationApiService.getSystemNotifications(jwtToken!, {
        page,
        limit: 10
      });
      setNotifications(result.data);
      setTotalPages(result.totalPages);
    } catch (error) {
      console.error('Failed to load notifications:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadUnreadCount = async () => {
    try {
      const result = await notificationApiService.getSystemUnreadCount(jwtToken!);
      setUnreadCount(result.unreadCount);
    } catch (error) {
      console.error('Failed to load unread count:', error);
    }
  };

  if (loading) {
    return <div className="loading">Loading notifications...</div>;
  }

  return (
    <div className="notifications-container">
      <div className="notifications-header">
        <h2>Notifications</h2>
        {unreadCount > 0 && (
          <span className="badge">{unreadCount} unread</span>
        )}
      </div>

      {notifications.length === 0 ? (
        <div className="empty-state">
          <p>No notifications yet</p>
        </div>
      ) : (
        <ul className="notifications-list">
          {notifications.map((notification) => (
            <NotificationItem 
              key={notification.id} 
              notification={notification}
              onRead={() => loadUnreadCount()}
            />
          ))}
        </ul>
      )}

      {/* Pagination */}
      <div className="pagination">
        <button 
          disabled={page === 1} 
          onClick={() => setPage(p => p - 1)}
        >
          Previous
        </button>
        <span>Page {page} of {totalPages}</span>
        <button 
          disabled={page === totalPages} 
          onClick={() => setPage(p => p + 1)}
        >
          Next
        </button>
      </div>
    </div>
  );
};
```

### Task 1.3: API Response Examples

**GET /push-notifications/system**

```json
{
  "data": [
    {
      "id": "1",
      "title": "System Maintenance",
      "body": "The system will undergo maintenance on Sunday 2 AM - 4 AM",
      "imageUrl": null,
      "icon": "ic_maintenance",
      "actionUrl": null,
      "scope": "GLOBAL",
      "priority": "HIGH",
      "isRead": false,
      "createdAt": "2026-01-21T08:00:00.000Z",
      "sentAt": "2026-01-21T08:00:01.000Z",
      "senderName": "System Admin"
    },
    {
      "id": "2",
      "title": "New Feature Available",
      "body": "Check out our new attendance analytics feature!",
      "imageUrl": "https://example.com/feature-image.jpg",
      "icon": "ic_feature",
      "actionUrl": "/features/attendance-analytics",
      "scope": "GLOBAL",
      "priority": "NORMAL",
      "isRead": true,
      "createdAt": "2026-01-20T10:00:00.000Z",
      "sentAt": "2026-01-20T10:00:05.000Z",
      "senderName": "Suraksha Team"
    }
  ],
  "total": 15,
  "page": 1,
  "limit": 10,
  "totalPages": 2
}
```

**GET /push-notifications/system/unread-count**

```json
{
  "unreadCount": 3,
  "totalCount": 15
}
```

---

## 2. Institute Notifications (After Institute Selection)

**When to show:** User has selected an institute.

**Location:** Rename the section to "Institute Notifications" in the header/sidebar.

### Task 2.1: Add Institute Notifications to API Service

```typescript
// Add to src/services/notificationApiService.ts

class NotificationApiService {
  // ... previous methods ...

  /**
   * Get notifications for a specific institute
   * Call this when user has selected an institute
   * Includes: INSTITUTE, CLASS, SUBJECT scope notifications
   * 
   * @endpoint GET /push-notifications/institute/:instituteId
   */
  async getInstituteNotifications(
    instituteId: string,
    jwtToken: string,
    options?: {
      page?: number;
      limit?: number;
      unreadOnly?: boolean;
      scope?: 'INSTITUTE' | 'CLASS' | 'SUBJECT';
      classId?: string;
      subjectId?: string;
    }
  ): Promise<PaginatedNotifications> {
    const params = new URLSearchParams();
    if (options?.page) params.append('page', options.page.toString());
    if (options?.limit) params.append('limit', options.limit.toString());
    if (options?.unreadOnly) params.append('unreadOnly', 'true');
    if (options?.scope) params.append('scope', options.scope);
    if (options?.classId) params.append('classId', options.classId);
    if (options?.subjectId) params.append('subjectId', options.subjectId);

    const response = await fetch(
      `/api/push-notifications/institute/${instituteId}?${params.toString()}`,
      {
        headers: {
          'Authorization': `Bearer ${jwtToken}`
        }
      }
    );

    if (!response.ok) {
      throw new Error('Failed to fetch institute notifications');
    }

    return response.json();
  }

  /**
   * Get unread count for institute notifications
   * 
   * @endpoint GET /push-notifications/institute/:instituteId/unread-count
   */
  async getInstituteUnreadCount(
    instituteId: string,
    jwtToken: string
  ): Promise<UnreadCount> {
    const response = await fetch(
      `/api/push-notifications/institute/${instituteId}/unread-count`,
      {
        headers: {
          'Authorization': `Bearer ${jwtToken}`
        }
      }
    );

    if (!response.ok) {
      throw new Error('Failed to fetch unread count');
    }

    return response.json();
  }

  /**
   * Mark a notification as read
   * 
   * @endpoint POST /push-notifications/:id/read
   */
  async markAsRead(notificationId: string, jwtToken: string): Promise<void> {
    const response = await fetch(
      `/api/push-notifications/${notificationId}/read`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${jwtToken}`
        }
      }
    );

    if (!response.ok) {
      throw new Error('Failed to mark notification as read');
    }
  }

  /**
   * Mark multiple notifications as read
   * 
   * @endpoint POST /push-notifications/mark-read
   */
  async markMultipleAsRead(
    notificationIds: string[],
    jwtToken: string
  ): Promise<{ message: string; count: number }> {
    const response = await fetch(
      '/api/push-notifications/mark-read',
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${jwtToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ notificationIds })
      }
    );

    if (!response.ok) {
      throw new Error('Failed to mark notifications as read');
    }

    return response.json();
  }

  /**
   * Mark all notifications as read for an institute
   * 
   * @endpoint POST /push-notifications/institute/:instituteId/mark-all-read
   */
  async markAllAsRead(instituteId: string, jwtToken: string): Promise<void> {
    const response = await fetch(
      `/api/push-notifications/institute/${instituteId}/mark-all-read`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${jwtToken}`
        }
      }
    );

    if (!response.ok) {
      throw new Error('Failed to mark all notifications as read');
    }
  }
}
```

### Task 2.2: Institute Notifications Component

```tsx
// src/components/notifications/InstituteNotifications.tsx
import React, { useState, useEffect } from 'react';
import { notificationApiService, Notification } from '../../services/notificationApiService';
import { useAuth } from '../../hooks/useAuth';
import { useInstitute } from '../../hooks/useInstitute';

/**
 * Institute Notifications Component
 * Shows INSTITUTE, CLASS, and SUBJECT scope notifications
 * when user has selected an institute
 */
export const InstituteNotifications: React.FC = () => {
  const { jwtToken, user } = useAuth();
  const { selectedInstituteId, selectedInstituteName } = useInstitute();
  
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [filter, setFilter] = useState<'ALL' | 'INSTITUTE' | 'CLASS' | 'SUBJECT'>('ALL');

  useEffect(() => {
    if (jwtToken && selectedInstituteId) {
      loadNotifications();
      loadUnreadCount();
    }
  }, [jwtToken, selectedInstituteId, page, filter]);

  const loadNotifications = async () => {
    if (!selectedInstituteId) return;
    
    try {
      setLoading(true);
      const result = await notificationApiService.getInstituteNotifications(
        selectedInstituteId,
        jwtToken!,
        {
          page,
          limit: 10,
          scope: filter !== 'ALL' ? filter : undefined
        }
      );
      setNotifications(result.data);
      setTotalPages(result.totalPages);
    } catch (error) {
      console.error('Failed to load notifications:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadUnreadCount = async () => {
    if (!selectedInstituteId) return;
    
    try {
      const result = await notificationApiService.getInstituteUnreadCount(
        selectedInstituteId,
        jwtToken!
      );
      setUnreadCount(result.unreadCount);
    } catch (error) {
      console.error('Failed to load unread count:', error);
    }
  };

  const handleMarkAsRead = async (notificationId: string) => {
    try {
      await notificationApiService.markAsRead(notificationId, jwtToken!);
      setNotifications(prev =>
        prev.map(n => n.id === notificationId ? { ...n, isRead: true } : n)
      );
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch (error) {
      console.error('Failed to mark as read:', error);
    }
  };

  const handleMarkAllAsRead = async () => {
    if (!selectedInstituteId) return;
    
    try {
      await notificationApiService.markAllAsRead(selectedInstituteId, jwtToken!);
      setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
      setUnreadCount(0);
    } catch (error) {
      console.error('Failed to mark all as read:', error);
    }
  };

  return (
    <div className="notifications-container">
      <div className="notifications-header">
        <h2>Institute Notifications</h2>
        <span className="institute-name">{selectedInstituteName}</span>
        {unreadCount > 0 && (
          <>
            <span className="badge">{unreadCount} unread</span>
            <button onClick={handleMarkAllAsRead} className="btn-link">
              Mark all as read
            </button>
          </>
        )}
      </div>

      {/* Filter Tabs */}
      <div className="filter-tabs">
        {(['ALL', 'INSTITUTE', 'CLASS', 'SUBJECT'] as const).map((f) => (
          <button
            key={f}
            className={`tab ${filter === f ? 'active' : ''}`}
            onClick={() => { setFilter(f); setPage(1); }}
          >
            {f === 'ALL' ? 'All' : f.charAt(0) + f.slice(1).toLowerCase()}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="loading">Loading notifications...</div>
      ) : notifications.length === 0 ? (
        <div className="empty-state">
          <p>No notifications for this institute</p>
        </div>
      ) : (
        <ul className="notifications-list">
          {notifications.map((notification) => (
            <li
              key={notification.id}
              className={`notification-item ${!notification.isRead ? 'unread' : ''}`}
              onClick={() => !notification.isRead && handleMarkAsRead(notification.id)}
            >
              <div className="notification-icon">
                {notification.icon ? (
                  <img src={`/icons/${notification.icon}.png`} alt="" />
                ) : (
                  <span className="default-icon">📢</span>
                )}
              </div>
              <div className="notification-content">
                <div className="notification-title">{notification.title}</div>
                <div className="notification-body">{notification.body}</div>
                <div className="notification-meta">
                  <span className="scope-badge">{notification.scope}</span>
                  <span className="time">
                    {new Date(notification.createdAt).toLocaleDateString()}
                  </span>
                </div>
              </div>
              {!notification.isRead && <span className="unread-dot" />}
            </li>
          ))}
        </ul>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="pagination">
          <button disabled={page === 1} onClick={() => setPage(p => p - 1)}>
            Previous
          </button>
          <span>Page {page} of {totalPages}</span>
          <button disabled={page === totalPages} onClick={() => setPage(p => p + 1)}>
            Next
          </button>
        </div>
      )}
    </div>
  );
};
```

### Task 2.3: API Response Examples

**GET /push-notifications/institute/1**

```json
{
  "data": [
    {
      "id": "10",
      "title": "Class Cancelled Tomorrow",
      "body": "Grade 10A Mathematics class is cancelled tomorrow due to teacher unavailability",
      "imageUrl": null,
      "icon": "ic_class",
      "actionUrl": "/class/40/schedule",
      "scope": "CLASS",
      "targetClassName": "Grade 10A",
      "priority": "HIGH",
      "isRead": false,
      "createdAt": "2026-01-21T14:00:00.000Z",
      "sentAt": "2026-01-21T14:00:02.000Z",
      "senderName": "Mr. John (Mathematics)"
    },
    {
      "id": "9",
      "title": "New Assignment Posted",
      "body": "Physics homework assignment has been posted. Due date: Jan 25",
      "imageUrl": null,
      "icon": "ic_assignment",
      "actionUrl": "/subject/5/assignments/123",
      "scope": "SUBJECT",
      "targetSubjectName": "Physics",
      "targetClassName": "Grade 10A",
      "priority": "NORMAL",
      "isRead": true,
      "createdAt": "2026-01-20T09:30:00.000Z",
      "sentAt": "2026-01-20T09:30:01.000Z",
      "senderName": "Ms. Sarah (Physics)"
    },
    {
      "id": "8",
      "title": "Fee Payment Reminder",
      "body": "Reminder: January fees due by 25th. Please make the payment on time.",
      "imageUrl": null,
      "icon": "ic_payment",
      "actionUrl": "/payments",
      "scope": "INSTITUTE",
      "priority": "NORMAL",
      "isRead": false,
      "createdAt": "2026-01-19T08:00:00.000Z",
      "sentAt": "2026-01-19T08:00:10.000Z",
      "senderName": "Institute Admin"
    }
  ],
  "total": 25,
  "page": 1,
  "limit": 10,
  "totalPages": 3
}
```

---

## Next Steps

Continue with **Part 3** for:
- Admin/Teacher: Create Notifications
- Real-time Notification Handling
- Complete API Reference
- Implementation Checklist
