# Push Notification Frontend Integration Guide

## Complete Guide for Suraksha LMS Push Notifications

This guide covers everything you need to implement push notifications in the frontend, organized as step-by-step tasks.

---

## Table of Contents
1. [Firebase Configuration](#1-firebase-configuration)
2. [Service Worker Setup](#2-service-worker-setup)
3. [FCM Token Registration](#3-fcm-token-registration)
4. [User Notifications (Before Institute Selection)](#4-user-notifications-before-institute-selection)
5. [Institute Notifications (After Institute Selection)](#5-institute-notifications-after-institute-selection)
6. [Admin/Teacher: Create Notifications](#6-adminteacher-create-notifications)
7. [Real-time Notification Handling](#7-real-time-notification-handling)

---

## 1. Firebase Configuration

### Task 1.1: Install Firebase SDK

```bash
npm install firebase
```

### Task 1.2: Create Firebase Configuration File

Create `src/config/firebase.ts`:

```typescript
// src/config/firebase.ts
import { initializeApp } from "firebase/app";
import { getMessaging, getToken, onMessage, Messaging } from "firebase/messaging";

// Your Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyA8-bs6QKh68evrW7QUW6_Azc64SAUnnYY",
  authDomain: "suraksha-ab3c0.firebaseapp.com",
  projectId: "suraksha-ab3c0",
  storageBucket: "suraksha-ab3c0.firebasestorage.app",
  messagingSenderId: "701726387829",
  appId: "1:701726387829:web:d01761e6a286c5f458d23c",
  measurementId: "G-7PJJ1LTLYW"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Firebase Cloud Messaging
let messaging: Messaging | null = null;

// Check if browser supports notifications
if (typeof window !== 'undefined' && 'Notification' in window) {
  messaging = getMessaging(app);
}

export { app, messaging, getToken, onMessage };
```

### Task 1.3: Get VAPID Key from Firebase Console

1. Go to [Firebase Console](https://console.firebase.google.com/project/suraksha-ab3c0)
2. Navigate to: ⚙️ **Project Settings** → **Cloud Messaging** tab
3. Scroll to **Web Push certificates**
4. Click **Generate key pair** (if not already generated)
5. Copy the **Key pair** value (this is your VAPID key)

```typescript
// Add this to your firebase.ts
export const VAPID_KEY = "YOUR_VAPID_KEY_HERE"; // Replace with actual key
```

---

## 2. Service Worker Setup

### Task 2.1: Create Firebase Messaging Service Worker

Create `public/firebase-messaging-sw.js` in your public folder:

```javascript
// public/firebase-messaging-sw.js
importScripts('https://www.gstatic.com/firebasejs/10.7.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.7.0/firebase-messaging-compat.js');

// Initialize Firebase in the service worker
firebase.initializeApp({
  apiKey: "AIzaSyA8-bs6QKh68evrW7QUW6_Azc64SAUnnYY",
  authDomain: "suraksha-ab3c0.firebaseapp.com",
  projectId: "suraksha-ab3c0",
  storageBucket: "suraksha-ab3c0.firebasestorage.app",
  messagingSenderId: "701726387829",
  appId: "1:701726387829:web:d01761e6a286c5f458d23c"
});

const messaging = firebase.messaging();

// Handle background messages
messaging.onBackgroundMessage((payload) => {
  console.log('[firebase-messaging-sw.js] Background message received:', payload);
  
  const notificationTitle = payload.notification?.title || 'New Notification';
  const notificationOptions = {
    body: payload.notification?.body || '',
    icon: payload.notification?.icon || '/logo192.png',
    badge: '/badge-icon.png',
    image: payload.notification?.image,
    data: payload.data,
    tag: payload.data?.notificationId || 'default',
    requireInteraction: true,
    actions: [
      { action: 'view', title: 'View' },
      { action: 'dismiss', title: 'Dismiss' }
    ]
  };

  return self.registration.showNotification(notificationTitle, notificationOptions);
});

// Handle notification click
self.addEventListener('notificationclick', (event) => {
  console.log('[firebase-messaging-sw.js] Notification clicked:', event);
  
  event.notification.close();
  
  const actionUrl = event.notification.data?.actionUrl || '/notifications';
  
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      // Check if there is already a window/tab open with the target URL
      for (const client of windowClients) {
        if (client.url === actionUrl && 'focus' in client) {
          return client.focus();
        }
      }
      // If not, open a new window/tab
      if (clients.openWindow) {
        return clients.openWindow(actionUrl);
      }
    })
  );
});
```

### Task 2.2: Register Service Worker

Add to your main app initialization:

```typescript
// src/utils/serviceWorkerRegistration.ts
export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) {
    console.warn('Service Worker not supported in this browser');
    return null;
  }

  try {
    const registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js', {
      scope: '/'
    });
    console.log('Service Worker registered successfully:', registration);
    return registration;
  } catch (error) {
    console.error('Service Worker registration failed:', error);
    return null;
  }
}
```

---

## 3. FCM Token Registration

### Task 3.1: Create Push Notification Service

Create `src/services/pushNotificationService.ts`:

```typescript
// src/services/pushNotificationService.ts
import { messaging, getToken, onMessage, VAPID_KEY } from '../config/firebase';
import { apiClient } from './apiClient'; // Your API client

// Device type enum matching backend
export enum DeviceType {
  ANDROID = 'ANDROID',
  IOS = 'IOS',
  WEB = 'WEB'
}

interface FcmTokenPayload {
  userId: string;
  fcmToken: string;
  deviceId: string;
  deviceType: DeviceType;
  deviceName?: string;
  appVersion?: string;
  osVersion?: string;
  isActive?: boolean;
}

interface FcmTokenResponse {
  id: string;
  userId: string;
  fcmToken: string;
  deviceId: string;
  deviceType: DeviceType;
  deviceName?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

class PushNotificationService {
  private fcmToken: string | null = null;
  private deviceId: string | null = null;

  /**
   * Generate a unique device ID
   */
  private generateDeviceId(): string {
    let deviceId = localStorage.getItem('suraksha_device_id');
    if (!deviceId) {
      deviceId = 'web_' + crypto.randomUUID();
      localStorage.setItem('suraksha_device_id', deviceId);
    }
    return deviceId;
  }

  /**
   * Get browser/device information
   */
  private getDeviceInfo(): { deviceName: string; osVersion: string } {
    const userAgent = navigator.userAgent;
    let deviceName = 'Unknown Browser';
    let osVersion = 'Unknown OS';

    // Detect browser
    if (userAgent.includes('Chrome')) {
      deviceName = 'Chrome';
    } else if (userAgent.includes('Firefox')) {
      deviceName = 'Firefox';
    } else if (userAgent.includes('Safari')) {
      deviceName = 'Safari';
    } else if (userAgent.includes('Edge')) {
      deviceName = 'Edge';
    }

    // Detect OS
    if (userAgent.includes('Windows')) {
      osVersion = 'Windows';
    } else if (userAgent.includes('Mac OS')) {
      osVersion = 'macOS';
    } else if (userAgent.includes('Linux')) {
      osVersion = 'Linux';
    } else if (userAgent.includes('Android')) {
      osVersion = 'Android';
    } else if (userAgent.includes('iOS')) {
      osVersion = 'iOS';
    }

    return { deviceName, osVersion };
  }

  /**
   * Request notification permission from user
   */
  async requestPermission(): Promise<boolean> {
    if (!('Notification' in window)) {
      console.warn('This browser does not support notifications');
      return false;
    }

    const permission = await Notification.requestPermission();
    console.log('Notification permission:', permission);
    return permission === 'granted';
  }

  /**
   * Get FCM token from Firebase
   */
  async getFcmToken(): Promise<string | null> {
    if (!messaging) {
      console.warn('Firebase messaging not initialized');
      return null;
    }

    try {
      const currentToken = await getToken(messaging, { vapidKey: VAPID_KEY });
      
      if (currentToken) {
        console.log('FCM Token obtained:', currentToken.substring(0, 20) + '...');
        this.fcmToken = currentToken;
        return currentToken;
      } else {
        console.warn('No FCM token available. Request permission first.');
        return null;
      }
    } catch (error) {
      console.error('Error getting FCM token:', error);
      return null;
    }
  }

  /**
   * Register FCM token with backend
   * Call this after user logs in
   */
  async registerToken(userId: string, jwtToken: string): Promise<FcmTokenResponse | null> {
    // Step 1: Request permission
    const hasPermission = await this.requestPermission();
    if (!hasPermission) {
      console.warn('Notification permission denied');
      return null;
    }

    // Step 2: Get FCM token
    const fcmToken = await this.getFcmToken();
    if (!fcmToken) {
      console.error('Failed to get FCM token');
      return null;
    }

    // Step 3: Prepare payload
    this.deviceId = this.generateDeviceId();
    const { deviceName, osVersion } = this.getDeviceInfo();

    const payload: FcmTokenPayload = {
      userId,
      fcmToken,
      deviceId: this.deviceId,
      deviceType: DeviceType.WEB,
      deviceName,
      osVersion,
      appVersion: '1.0.0', // Your app version
      isActive: true
    };

    // Step 4: Send to backend
    try {
      const response = await apiClient.post<FcmTokenResponse>(
        '/users/fcm-tokens',
        payload,
        {
          headers: {
            'Authorization': `Bearer ${jwtToken}`,
            'Content-Type': 'application/json'
          }
        }
      );

      console.log('FCM token registered successfully:', response.data);
      return response.data;
    } catch (error) {
      console.error('Failed to register FCM token:', error);
      return null;
    }
  }

  /**
   * Unregister FCM token when user logs out
   */
  async unregisterToken(tokenId: string, jwtToken: string): Promise<boolean> {
    try {
      await apiClient.delete(`/users/fcm-tokens/${tokenId}`, {
        headers: {
          'Authorization': `Bearer ${jwtToken}`
        }
      });
      console.log('FCM token unregistered successfully');
      this.fcmToken = null;
      return true;
    } catch (error) {
      console.error('Failed to unregister FCM token:', error);
      return false;
    }
  }

  /**
   * Listen for foreground messages
   */
  onForegroundMessage(callback: (payload: any) => void): () => void {
    if (!messaging) {
      console.warn('Firebase messaging not initialized');
      return () => {};
    }

    const unsubscribe = onMessage(messaging, (payload) => {
      console.log('Foreground message received:', payload);
      callback(payload);
    });

    return unsubscribe;
  }
}

export const pushNotificationService = new PushNotificationService();
```

### Task 3.2: Initialize on User Login

Add to your authentication flow:

```typescript
// In your login handler or auth context
import { pushNotificationService } from '../services/pushNotificationService';

async function onUserLogin(user: User, jwtToken: string) {
  // ... your existing login logic ...

  // Register FCM token for push notifications
  const tokenResult = await pushNotificationService.registerToken(user.id, jwtToken);
  
  if (tokenResult) {
    // Store token ID for later use (e.g., logout)
    localStorage.setItem('fcm_token_id', tokenResult.id);
    console.log('Push notifications enabled');
  }
}

async function onUserLogout(jwtToken: string) {
  const tokenId = localStorage.getItem('fcm_token_id');
  
  if (tokenId) {
    await pushNotificationService.unregisterToken(tokenId, jwtToken);
    localStorage.removeItem('fcm_token_id');
  }
  
  // ... your existing logout logic ...
}
```

---

## 4. User Notifications (Before Institute Selection)

**When to show:** User is logged in but has NOT selected an institute yet.

**Location:** Display as "Notifications" in the header/sidebar.

### Task 4.1: Create System Notifications API Service

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

### Task 4.2: System Notifications Component

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

### Task 4.3: API Response Examples

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

## 5. Institute Notifications (After Institute Selection)

**When to show:** User has selected an institute.

**Location:** Rename the section to "Institute Notifications" in the header/sidebar.

### Task 5.1: Add Institute Notifications to API Service

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

### Task 5.2: Institute Notifications Component

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

### Task 5.3: API Response Examples

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

## 6. Admin/Teacher: Create Notifications

**Who can access:**
- **SUPERADMIN**: Can create GLOBAL, INSTITUTE, CLASS, SUBJECT notifications
- **Institute Admin**: Can create INSTITUTE, CLASS, SUBJECT notifications for their institute
- **Teacher**: Can create CLASS, SUBJECT notifications for their classes/subjects

**Location:** After selecting institute, show "Create Notification" button if user is Institute Admin or Teacher.

### Task 6.1: Admin Notification Service

```typescript
// src/services/adminNotificationService.ts

export enum NotificationScope {
  GLOBAL = 'GLOBAL',
  INSTITUTE = 'INSTITUTE',
  CLASS = 'CLASS',
  SUBJECT = 'SUBJECT'
}

export enum NotificationTargetUserType {
  ALL = 'ALL',
  STUDENTS = 'STUDENTS',
  PARENTS = 'PARENTS',
  TEACHERS = 'TEACHERS',
  ADMINS = 'ADMINS'
}

export enum NotificationPriority {
  LOW = 'LOW',
  NORMAL = 'NORMAL',
  HIGH = 'HIGH',
  URGENT = 'URGENT'
}

export interface CreateNotificationPayload {
  title: string;
  body: string;
  imageUrl?: string;
  icon?: string;
  actionUrl?: string;
  dataPayload?: Record<string, string>;
  scope: NotificationScope;
  targetUserTypes: NotificationTargetUserType[];
  instituteId?: string;
  classId?: string;
  subjectId?: string;
  priority?: NotificationPriority;
  collapseKey?: string;
  timeToLive?: number;
  scheduledAt?: string;
  sendImmediately?: boolean;
}

export interface NotificationResult {
  id: string;
  title: string;
  scope: NotificationScope;
  status: 'DRAFT' | 'PENDING' | 'SENT' | 'FAILED' | 'CANCELLED';
  recipientCount: number;
  successCount: number;
  failureCount: number;
  createdAt: string;
  sentAt?: string;
}

class AdminNotificationService {

  /**
   * Create and send a new push notification
   * 
   * @endpoint POST /push-notifications/admin
   * @access SUPERADMIN, Institute Admin, Teacher
   */
  async createNotification(
    payload: CreateNotificationPayload,
    jwtToken: string
  ): Promise<NotificationResult> {
    const response = await fetch('/api/push-notifications/admin', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${jwtToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Failed to create notification');
    }

    return response.json();
  }

  /**
   * Get all notifications created by admin (for management)
   * 
   * @endpoint GET /push-notifications/admin
   */
  async getAdminNotifications(
    jwtToken: string,
    options?: {
      page?: number;
      limit?: number;
      scope?: NotificationScope;
      status?: string;
      instituteId?: string;
    }
  ): Promise<{
    data: NotificationResult[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    const params = new URLSearchParams();
    if (options?.page) params.append('page', options.page.toString());
    if (options?.limit) params.append('limit', options.limit.toString());
    if (options?.scope) params.append('scope', options.scope);
    if (options?.status) params.append('status', options.status);
    if (options?.instituteId) params.append('instituteId', options.instituteId);

    const response = await fetch(
      `/api/push-notifications/admin?${params.toString()}`,
      {
        headers: {
          'Authorization': `Bearer ${jwtToken}`
        }
      }
    );

    if (!response.ok) {
      throw new Error('Failed to fetch notifications');
    }

    return response.json();
  }

  /**
   * Resend a failed notification
   * 
   * @endpoint POST /push-notifications/admin/:id/resend
   */
  async resendNotification(
    notificationId: string,
    jwtToken: string
  ): Promise<NotificationResult> {
    const response = await fetch(
      `/api/push-notifications/admin/${notificationId}/resend`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${jwtToken}`
        }
      }
    );

    if (!response.ok) {
      throw new Error('Failed to resend notification');
    }

    return response.json();
  }

  /**
   * Cancel a scheduled notification
   * 
   * @endpoint PUT /push-notifications/admin/:id/cancel
   */
  async cancelNotification(
    notificationId: string,
    jwtToken: string
  ): Promise<void> {
    const response = await fetch(
      `/api/push-notifications/admin/${notificationId}/cancel`,
      {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${jwtToken}`
        }
      }
    );

    if (!response.ok) {
      throw new Error('Failed to cancel notification');
    }
  }

  /**
   * Delete a notification
   * 
   * @endpoint DELETE /push-notifications/admin/:id
   */
  async deleteNotification(
    notificationId: string,
    jwtToken: string
  ): Promise<void> {
    const response = await fetch(
      `/api/push-notifications/admin/${notificationId}`,
      {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${jwtToken}`
        }
      }
    );

    if (!response.ok) {
      throw new Error('Failed to delete notification');
    }
  }
}

export const adminNotificationService = new AdminNotificationService();
```

### Task 6.2: Create Notification Form Component

```tsx
// src/components/notifications/CreateNotificationForm.tsx
import React, { useState } from 'react';
import { 
  adminNotificationService,
  NotificationScope,
  NotificationTargetUserType,
  NotificationPriority,
  CreateNotificationPayload
} from '../../services/adminNotificationService';
import { useAuth } from '../../hooks/useAuth';
import { useInstitute } from '../../hooks/useInstitute';

interface Props {
  onSuccess: () => void;
  onCancel: () => void;
}

/**
 * Create Notification Form
 * 
 * Visibility Rules:
 * - SUPERADMIN: Can select any scope (GLOBAL, INSTITUTE, CLASS, SUBJECT)
 * - Institute Admin: Can select INSTITUTE, CLASS, SUBJECT (for their institute)
 * - Teacher: Can select CLASS, SUBJECT (for their classes/subjects)
 */
export const CreateNotificationForm: React.FC<Props> = ({ onSuccess, onCancel }) => {
  const { jwtToken, user } = useAuth();
  const { selectedInstituteId, classes, subjects } = useInstitute();
  
  const isSuperAdmin = user?.userType === 'SUPERADMIN';
  const isInstituteAdmin = user?.instituteRole === 'ADMIN';
  const isTeacher = user?.instituteRole === 'TEACHER';

  // Form State
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [actionUrl, setActionUrl] = useState('');
  const [scope, setScope] = useState<NotificationScope>(
    isSuperAdmin ? NotificationScope.GLOBAL : NotificationScope.INSTITUTE
  );
  const [targetUserTypes, setTargetUserTypes] = useState<NotificationTargetUserType[]>([
    NotificationTargetUserType.ALL
  ]);
  const [selectedClassId, setSelectedClassId] = useState('');
  const [selectedSubjectId, setSelectedSubjectId] = useState('');
  const [priority, setPriority] = useState<NotificationPriority>(NotificationPriority.NORMAL);
  const [sendImmediately, setSendImmediately] = useState(true);
  const [scheduledAt, setScheduledAt] = useState('');
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Available scopes based on user role
  const getAvailableScopes = (): NotificationScope[] => {
    if (isSuperAdmin) {
      return [
        NotificationScope.GLOBAL,
        NotificationScope.INSTITUTE,
        NotificationScope.CLASS,
        NotificationScope.SUBJECT
      ];
    }
    if (isInstituteAdmin) {
      return [
        NotificationScope.INSTITUTE,
        NotificationScope.CLASS,
        NotificationScope.SUBJECT
      ];
    }
    if (isTeacher) {
      return [
        NotificationScope.CLASS,
        NotificationScope.SUBJECT
      ];
    }
    return [];
  };

  const handleTargetUserTypeChange = (type: NotificationTargetUserType) => {
    if (type === NotificationTargetUserType.ALL) {
      setTargetUserTypes([NotificationTargetUserType.ALL]);
    } else {
      const newTypes = targetUserTypes.filter(t => t !== NotificationTargetUserType.ALL);
      if (newTypes.includes(type)) {
        setTargetUserTypes(newTypes.filter(t => t !== type));
      } else {
        setTargetUserTypes([...newTypes, type]);
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      // Validation
      if (!title.trim()) throw new Error('Title is required');
      if (!body.trim()) throw new Error('Message body is required');
      if (targetUserTypes.length === 0) throw new Error('Select at least one target audience');
      
      if (scope !== NotificationScope.GLOBAL && !selectedInstituteId) {
        throw new Error('Institute must be selected for non-global notifications');
      }
      if (scope === NotificationScope.CLASS && !selectedClassId) {
        throw new Error('Please select a class');
      }
      if (scope === NotificationScope.SUBJECT && !selectedSubjectId) {
        throw new Error('Please select a subject');
      }

      const payload: CreateNotificationPayload = {
        title: title.trim(),
        body: body.trim(),
        scope,
        targetUserTypes,
        priority,
        sendImmediately
      };

      // Optional fields
      if (imageUrl.trim()) payload.imageUrl = imageUrl.trim();
      if (actionUrl.trim()) payload.actionUrl = actionUrl.trim();
      
      // Scope-specific fields
      if (scope !== NotificationScope.GLOBAL) {
        payload.instituteId = selectedInstituteId!;
      }
      if (scope === NotificationScope.CLASS || scope === NotificationScope.SUBJECT) {
        payload.classId = selectedClassId;
      }
      if (scope === NotificationScope.SUBJECT) {
        payload.subjectId = selectedSubjectId;
      }
      
      // Scheduled notifications
      if (!sendImmediately && scheduledAt) {
        payload.scheduledAt = new Date(scheduledAt).toISOString();
        payload.sendImmediately = false;
      }

      await adminNotificationService.createNotification(payload, jwtToken!);
      onSuccess();
    } catch (err: any) {
      setError(err.message || 'Failed to create notification');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="create-notification-modal">
      <h2>Create App Notification</h2>
      
      {error && <div className="error-message">{error}</div>}

      <form onSubmit={handleSubmit}>
        {/* Title */}
        <div className="form-group">
          <label htmlFor="title">Title *</label>
          <input
            id="title"
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Enter notification title"
            maxLength={255}
            required
          />
          <span className="char-count">{title.length}/255</span>
        </div>

        {/* Body */}
        <div className="form-group">
          <label htmlFor="body">Message *</label>
          <textarea
            id="body"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Enter notification message"
            maxLength={5000}
            rows={4}
            required
          />
          <span className="char-count">{body.length}/5000</span>
        </div>

        {/* Scope */}
        <div className="form-group">
          <label>Notification Scope *</label>
          <select
            value={scope}
            onChange={(e) => setScope(e.target.value as NotificationScope)}
          >
            {getAvailableScopes().map((s) => (
              <option key={s} value={s}>
                {s === 'GLOBAL' && 'Global (All Users)'}
                {s === 'INSTITUTE' && 'Institute-wide'}
                {s === 'CLASS' && 'Specific Class'}
                {s === 'SUBJECT' && 'Specific Subject'}
              </option>
            ))}
          </select>
        </div>

        {/* Class Selection (for CLASS and SUBJECT scope) */}
        {(scope === NotificationScope.CLASS || scope === NotificationScope.SUBJECT) && (
          <div className="form-group">
            <label>Select Class *</label>
            <select
              value={selectedClassId}
              onChange={(e) => setSelectedClassId(e.target.value)}
              required
            >
              <option value="">-- Select Class --</option>
              {classes.map((cls) => (
                <option key={cls.id} value={cls.id}>
                  {cls.name}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Subject Selection (for SUBJECT scope) */}
        {scope === NotificationScope.SUBJECT && selectedClassId && (
          <div className="form-group">
            <label>Select Subject *</label>
            <select
              value={selectedSubjectId}
              onChange={(e) => setSelectedSubjectId(e.target.value)}
              required
            >
              <option value="">-- Select Subject --</option>
              {subjects
                .filter(sub => sub.classId === selectedClassId)
                .map((sub) => (
                  <option key={sub.id} value={sub.id}>
                    {sub.name}
                  </option>
                ))}
            </select>
          </div>
        )}

        {/* Target Audience */}
        <div className="form-group">
          <label>Target Audience *</label>
          <div className="checkbox-group">
            {Object.values(NotificationTargetUserType).map((type) => (
              <label key={type} className="checkbox-label">
                <input
                  type="checkbox"
                  checked={targetUserTypes.includes(type)}
                  onChange={() => handleTargetUserTypeChange(type)}
                />
                {type === 'ALL' && 'Everyone'}
                {type === 'STUDENTS' && 'Students Only'}
                {type === 'PARENTS' && 'Parents Only'}
                {type === 'TEACHERS' && 'Teachers Only'}
                {type === 'ADMINS' && 'Admins Only'}
              </label>
            ))}
          </div>
        </div>

        {/* Priority */}
        <div className="form-group">
          <label>Priority</label>
          <select
            value={priority}
            onChange={(e) => setPriority(e.target.value as NotificationPriority)}
          >
            <option value="LOW">Low</option>
            <option value="NORMAL">Normal</option>
            <option value="HIGH">High</option>
            <option value="URGENT">Urgent</option>
          </select>
        </div>

        {/* Image URL (optional) */}
        <div className="form-group">
          <label htmlFor="imageUrl">Image URL (optional)</label>
          <input
            id="imageUrl"
            type="url"
            value={imageUrl}
            onChange={(e) => setImageUrl(e.target.value)}
            placeholder="https://example.com/image.jpg"
          />
        </div>

        {/* Action URL (optional) */}
        <div className="form-group">
          <label htmlFor="actionUrl">Action URL (optional)</label>
          <input
            id="actionUrl"
            type="text"
            value={actionUrl}
            onChange={(e) => setActionUrl(e.target.value)}
            placeholder="/announcements/123 or https://..."
          />
          <small>Where to navigate when notification is clicked</small>
        </div>

        {/* Schedule */}
        <div className="form-group">
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={sendImmediately}
              onChange={(e) => setSendImmediately(e.target.checked)}
            />
            Send Immediately
          </label>
        </div>

        {!sendImmediately && (
          <div className="form-group">
            <label htmlFor="scheduledAt">Schedule For</label>
            <input
              id="scheduledAt"
              type="datetime-local"
              value={scheduledAt}
              onChange={(e) => setScheduledAt(e.target.value)}
              min={new Date().toISOString().slice(0, 16)}
              required
            />
          </div>
        )}

        {/* Actions */}
        <div className="form-actions">
          <button type="button" onClick={onCancel} disabled={loading}>
            Cancel
          </button>
          <button type="submit" className="primary" disabled={loading}>
            {loading ? 'Sending...' : (sendImmediately ? 'Send Now' : 'Schedule')}
          </button>
        </div>
      </form>
    </div>
  );
};
```

### Task 6.3: Create Notification Button (Conditional)

```tsx
// src/components/notifications/NotificationHeader.tsx
import React, { useState } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { useInstitute } from '../../hooks/useInstitute';
import { CreateNotificationForm } from './CreateNotificationForm';

export const NotificationHeader: React.FC = () => {
  const { user } = useAuth();
  const { selectedInstituteId } = useInstitute();
  const [showCreateForm, setShowCreateForm] = useState(false);

  // Determine if user can create notifications
  const canCreateNotification = () => {
    if (!user) return false;
    
    // SUPERADMIN can always create
    if (user.userType === 'SUPERADMIN') return true;
    
    // Institute Admin and Teacher need to have an institute selected
    if (!selectedInstituteId) return false;
    
    // Check institute role
    return user.instituteRole === 'ADMIN' || user.instituteRole === 'TEACHER';
  };

  return (
    <div className="notification-header">
      <h1>
        {selectedInstituteId ? 'Institute Notifications' : 'Notifications'}
      </h1>
      
      {canCreateNotification() && (
        <button 
          className="btn-primary"
          onClick={() => setShowCreateForm(true)}
        >
          + Create App Notification
        </button>
      )}

      {showCreateForm && (
        <div className="modal-overlay">
          <CreateNotificationForm
            onSuccess={() => {
              setShowCreateForm(false);
              // Optionally refresh notification list
            }}
            onCancel={() => setShowCreateForm(false)}
          />
        </div>
      )}
    </div>
  );
};
```

### Task 6.4: Create Notification Request/Response Examples

**POST /push-notifications/admin**

Request Body:
```json
{
  "title": "Holiday Announcement",
  "body": "School will remain closed on January 26th for Republic Day celebrations. Classes will resume on January 27th.",
  "scope": "INSTITUTE",
  "targetUserTypes": ["STUDENTS", "PARENTS"],
  "instituteId": "1",
  "priority": "HIGH",
  "imageUrl": "https://example.com/republic-day.jpg",
  "actionUrl": "/announcements/holiday-jan26",
  "sendImmediately": true
}
```

Response:
```json
{
  "id": "50",
  "title": "Holiday Announcement",
  "body": "School will remain closed on January 26th for Republic Day celebrations...",
  "scope": "INSTITUTE",
  "targetUserTypes": ["STUDENTS", "PARENTS"],
  "instituteId": "1",
  "priority": "HIGH",
  "status": "SENT",
  "recipientCount": 450,
  "successCount": 445,
  "failureCount": 5,
  "createdAt": "2026-01-21T10:00:00.000Z",
  "sentAt": "2026-01-21T10:00:03.000Z",
  "senderId": "10",
  "senderName": "Admin User"
}
```

**Class-level Notification:**
```json
{
  "title": "Homework Reminder",
  "body": "Don't forget to submit your Math assignment by tomorrow!",
  "scope": "CLASS",
  "targetUserTypes": ["STUDENTS", "PARENTS"],
  "instituteId": "1",
  "classId": "40",
  "priority": "NORMAL",
  "sendImmediately": true
}
```

**Subject-level Notification:**
```json
{
  "title": "Physics Lab Tomorrow",
  "body": "Bring your lab coat and notebook for tomorrow's practical session.",
  "scope": "SUBJECT",
  "targetUserTypes": ["STUDENTS"],
  "instituteId": "1",
  "classId": "40",
  "subjectId": "5",
  "priority": "NORMAL",
  "sendImmediately": true
}
```

**Scheduled Notification:**
```json
{
  "title": "Exam Reminder",
  "body": "Final exams start next week. Good luck!",
  "scope": "INSTITUTE",
  "targetUserTypes": ["ALL"],
  "instituteId": "1",
  "priority": "HIGH",
  "sendImmediately": false,
  "scheduledAt": "2026-01-25T08:00:00.000Z"
}
```

---

## 7. Real-time Notification Handling

### Task 7.1: Foreground Message Handler

```tsx
// src/hooks/usePushNotifications.ts
import { useEffect, useState, useCallback } from 'react';
import { pushNotificationService } from '../services/pushNotificationService';
import { useAuth } from './useAuth';

interface PushNotificationPayload {
  notification?: {
    title?: string;
    body?: string;
    icon?: string;
    image?: string;
  };
  data?: {
    notificationId?: string;
    actionUrl?: string;
    scope?: string;
    instituteId?: string;
    [key: string]: string | undefined;
  };
}

export const usePushNotifications = () => {
  const { jwtToken, user } = useAuth();
  const [latestNotification, setLatestNotification] = useState<PushNotificationPayload | null>(null);
  const [showToast, setShowToast] = useState(false);

  useEffect(() => {
    if (!jwtToken || !user) return;

    // Register FCM token on login
    const registerToken = async () => {
      await pushNotificationService.registerToken(user.id, jwtToken);
    };
    registerToken();

    // Listen for foreground messages
    const unsubscribe = pushNotificationService.onForegroundMessage((payload) => {
      console.log('New notification received:', payload);
      setLatestNotification(payload);
      setShowToast(true);
      
      // Auto-hide toast after 5 seconds
      setTimeout(() => setShowToast(false), 5000);
    });

    return () => {
      unsubscribe();
    };
  }, [jwtToken, user]);

  const dismissToast = useCallback(() => {
    setShowToast(false);
  }, []);

  const handleNotificationClick = useCallback(() => {
    if (latestNotification?.data?.actionUrl) {
      window.location.href = latestNotification.data.actionUrl;
    }
    dismissToast();
  }, [latestNotification, dismissToast]);

  return {
    latestNotification,
    showToast,
    dismissToast,
    handleNotificationClick
  };
};
```

### Task 7.2: Notification Toast Component

```tsx
// src/components/notifications/NotificationToast.tsx
import React from 'react';
import { usePushNotifications } from '../../hooks/usePushNotifications';

export const NotificationToast: React.FC = () => {
  const { latestNotification, showToast, dismissToast, handleNotificationClick } = usePushNotifications();

  if (!showToast || !latestNotification) return null;

  return (
    <div className="notification-toast" onClick={handleNotificationClick}>
      <div className="toast-content">
        {latestNotification.notification?.icon && (
          <img 
            src={latestNotification.notification.icon} 
            alt="" 
            className="toast-icon"
          />
        )}
        <div className="toast-text">
          <div className="toast-title">
            {latestNotification.notification?.title}
          </div>
          <div className="toast-body">
            {latestNotification.notification?.body}
          </div>
        </div>
        <button 
          className="toast-close" 
          onClick={(e) => { e.stopPropagation(); dismissToast(); }}
        >
          ×
        </button>
      </div>
    </div>
  );
};
```

### Task 7.3: Add Toast to App Root

```tsx
// src/App.tsx
import { NotificationToast } from './components/notifications/NotificationToast';

function App() {
  return (
    <AuthProvider>
      <InstituteProvider>
        <div className="app">
          {/* Your app content */}
          <Router>
            {/* Routes */}
          </Router>
          
          {/* Global Notification Toast */}
          <NotificationToast />
        </div>
      </InstituteProvider>
    </AuthProvider>
  );
}
```

---

## Summary: Complete API Reference

### FCM Token Management
| Method | Endpoint | Description | Access |
|--------|----------|-------------|--------|
| POST | `/users/fcm-tokens` | Register FCM token | All authenticated users |
| GET | `/users/fcm-tokens/user/:userId` | Get user's tokens | All authenticated users |
| DELETE | `/users/fcm-tokens/:id` | Delete token (logout) | All authenticated users |

### User Notification Endpoints
| Method | Endpoint | Description | Access |
|--------|----------|-------------|--------|
| GET | `/push-notifications/system` | Get global notifications | All authenticated users |
| GET | `/push-notifications/system/unread-count` | Get global unread count | All authenticated users |
| GET | `/push-notifications/institute/:id` | Get institute notifications | Institute members |
| GET | `/push-notifications/institute/:id/unread-count` | Get institute unread count | Institute members |
| POST | `/push-notifications/:id/read` | Mark as read | All authenticated users |
| POST | `/push-notifications/mark-read` | Mark multiple as read | All authenticated users |
| POST | `/push-notifications/institute/:id/mark-all-read` | Mark all as read | Institute members |

### Admin Notification Endpoints
| Method | Endpoint | Description | Access |
|--------|----------|-------------|--------|
| POST | `/push-notifications/admin` | Create notification | SUPERADMIN, Admin, Teacher |
| GET | `/push-notifications/admin` | List admin notifications | SUPERADMIN, Admin, Teacher |
| GET | `/push-notifications/admin/:id` | Get notification details | SUPERADMIN, Admin, Teacher |
| POST | `/push-notifications/admin/:id/send` | Send notification | SUPERADMIN, Admin, Teacher |
| POST | `/push-notifications/admin/:id/resend` | Resend failed notification | SUPERADMIN, Admin, Teacher |
| PUT | `/push-notifications/admin/:id/cancel` | Cancel scheduled | SUPERADMIN, Admin, Teacher |
| DELETE | `/push-notifications/admin/:id` | Delete notification | SUPERADMIN, Admin, Teacher |

---

## Checklist

### Setup
- [ ] Install Firebase SDK (`npm install firebase`)
- [ ] Create Firebase configuration file
- [ ] Get VAPID key from Firebase Console
- [ ] Create Service Worker file
- [ ] Register Service Worker

### User Flow
- [ ] Implement FCM token registration on login
- [ ] Implement FCM token deletion on logout
- [ ] Create System Notifications component (before institute selection)
- [ ] Create Institute Notifications component (after institute selection)
- [ ] Implement mark as read functionality
- [ ] Implement pagination
- [ ] Show unread count badge in header

### Admin Flow
- [ ] Create "Create Notification" button (conditional on user role)
- [ ] Create notification form with scope selection
- [ ] Implement class/subject selection for targeted notifications
- [ ] Implement schedule/send immediately toggle
- [ ] Create notification management page (list, resend, cancel, delete)

### Real-time
- [ ] Implement foreground message handler
- [ ] Create notification toast component
- [ ] Handle notification click navigation

---

## Need Help?

Contact the backend team for:
- VAPID key issues
- FCM token registration failures
- Permission denied errors
- API authentication issues
