# Push Notification Frontend Integration Guide - PART 1

## Complete Guide for Suraksha LMS Push Notifications

**Part 1 of 3: Setup & Configuration**

This part covers:
- Firebase Configuration
- Service Worker Setup
- FCM Token Registration

---

## Table of Contents
1. [Firebase Configuration](#1-firebase-configuration)
2. [Service Worker Setup](#2-service-worker-setup)
3. [FCM Token Registration](#3-fcm-token-registration)

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

// Device type enum matching backend (MUST be lowercase)
export enum DeviceType {
  ANDROID = 'android',
  IOS = 'ios',
  WEB = 'web'
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

## Next Steps

Continue with **Part 2** for:
- User Notifications (Before Institute Selection)
- Institute Notifications (After Institute Selection)
