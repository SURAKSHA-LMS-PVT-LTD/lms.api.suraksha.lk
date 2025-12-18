# 🔥 React + FCM Push Notifications - Complete Integration Guide

## 📚 Table of Contents
1. [Quick Start](#quick-start)
2. [Installation](#installation)
3. [Configuration](#configuration)
4. [React Implementation](#react-implementation)
5. [API Integration](#api-integration)
6. [Testing](#testing)
7. [Production Deployment](#production-deployment)

---

## ⚡ Quick Start

### What You'll Build

✅ React app that receives push notifications  
✅ Service Worker for background notifications  
✅ Token registration with your backend  
✅ Automatic token refresh on login  
✅ Notification permission handling  

### Prerequisites

- Node.js 16+ and npm/yarn
- React 18+ application
- Your LMS backend running
- Firebase project credentials

---

## 📦 Installation

### 1. Install Firebase SDK

```bash
npm install firebase
# or
yarn add firebase
```

### 2. Project Structure

```
your-react-app/
├── public/
│   ├── firebase-messaging-sw.js  ← Service Worker
│   └── manifest.json              ← PWA manifest
├── src/
│   ├── config/
│   │   └── firebase.js            ← Firebase config
│   ├── hooks/
│   │   └── useFCM.js              ← Custom hook
│   ├── services/
│   │   ├── fcmService.js          ← FCM helper functions
│   │   └── apiService.js          ← Backend API calls
│   └── App.js
└── .env                            ← Environment variables
```

---

## ⚙️ Configuration

### 1. Environment Variables

**File:** `.env`

```env
# Firebase Configuration (Public - Safe to expose)
REACT_APP_FIREBASE_API_KEY=AIzaSyBeX_q4BUr4q6rNqLj2v6Hp__cN3Teblho
REACT_APP_FIREBASE_AUTH_DOMAIN=suraksha-37230.firebaseapp.com
REACT_APP_FIREBASE_PROJECT_ID=suraksha-37230
REACT_APP_FIREBASE_STORAGE_BUCKET=suraksha-37230.firebasestorage.app
REACT_APP_FIREBASE_MESSAGING_SENDER_ID=763675183954
REACT_APP_FIREBASE_APP_ID=1:763675183954:web:4eb11703dcd10f7c5e888b
REACT_APP_FIREBASE_MEASUREMENT_ID=G-F4P9PVZ2JF

# VAPID Key (Public - Safe to expose)
REACT_APP_FIREBASE_VAPID_KEY=BEsTv-eK9cK1QZFs0Ymi2oZ1JqYCjxIAjKXWaefnPQqESlWwAxvAfDoDld_UJyNVfE2moQiMo--gZWmt6HAptdg

# Your Backend API
REACT_APP_API_URL=http://localhost:8080
```

### 2. Firebase Initialization

**File:** `src/config/firebase.js`

```javascript
import { initializeApp } from 'firebase/app';
import { getMessaging, isSupported } from 'firebase/messaging';

const firebaseConfig = {
  apiKey: process.env.REACT_APP_FIREBASE_API_KEY,
  authDomain: process.env.REACT_APP_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.REACT_APP_FIREBASE_PROJECT_ID,
  storageBucket: process.env.REACT_APP_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.REACT_APP_FIREBASE_APP_ID,
  measurementId: process.env.REACT_APP_FIREBASE_MEASUREMENT_ID
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Firebase Cloud Messaging
let messaging = null;
if (typeof window !== 'undefined') {
  isSupported().then((supported) => {
    if (supported) {
      messaging = getMessaging(app);
    }
  });
}

export { app, messaging };
```

### 3. Service Worker Setup

**File:** `public/firebase-messaging-sw.js`

```javascript
// Import Firebase scripts (using CDN for service worker)
importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging-compat.js');

// Initialize Firebase in service worker
firebase.initializeApp({
  apiKey: "AIzaSyBeX_q4BUr4q6rNqLj2v6Hp__cN3Teblho",
  authDomain: "suraksha-37230.firebaseapp.com",
  projectId: "suraksha-37230",
  storageBucket: "suraksha-37230.firebasestorage.app",
  messagingSenderId: "763675183954",
  appId: "1:763675183954:web:4eb11703dcd10f7c5e888b"
});

const messaging = firebase.messaging();

// Handle background messages
messaging.onBackgroundMessage((payload) => {
  console.log('[firebase-messaging-sw.js] Received background message:', payload);
  
  const notificationTitle = payload.notification?.title || 'New Notification';
  const notificationOptions = {
    body: payload.notification?.body || '',
    icon: payload.notification?.icon || '/logo192.png',
    badge: '/badge-72x72.png',
    tag: payload.data?.type || 'default',
    data: payload.data,
    requireInteraction: false,
    vibrate: [200, 100, 200]
  };

  return self.registration.showNotification(notificationTitle, notificationOptions);
});

// Handle notification clicks
self.addEventListener('notificationclick', (event) => {
  console.log('[firebase-messaging-sw.js] Notification clicked:', event.notification.data);
  
  event.notification.close();

  // Navigate to URL from notification data
  const urlToOpen = event.notification.data?.url || '/';
  
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then((windowClients) => {
        // Check if there's already a window open
        for (let client of windowClients) {
          if (client.url === urlToOpen && 'focus' in client) {
            return client.focus();
          }
        }
        // Open new window if none exists
        if (clients.openWindow) {
          return clients.openWindow(urlToOpen);
        }
      })
  );
});
```

---

## ⚛️ React Implementation

### 1. FCM Service Helper

**File:** `src/services/fcmService.js`

```javascript
import { getToken, onMessage } from 'firebase/messaging';
import { messaging } from '../config/firebase';

/**
 * Request notification permission and get FCM token
 */
export const requestNotificationPermission = async () => {
  try {
    // Check if messaging is supported
    if (!messaging) {
      console.warn('Firebase Messaging is not supported in this browser');
      return null;
    }

    // Request permission
    const permission = await Notification.requestPermission();
    
    if (permission !== 'granted') {
      console.log('Notification permission denied');
      return null;
    }

    // Register service worker
    const registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js');
    console.log('✅ Service Worker registered');

    // Get FCM token
    const vapidKey = process.env.REACT_APP_FIREBASE_VAPID_KEY;
    const token = await getToken(messaging, {
      vapidKey,
      serviceWorkerRegistration: registration
    });

    console.log('✅ FCM Token obtained:', token);
    return token;

  } catch (error) {
    console.error('Error getting FCM token:', error);
    return null;
  }
};

/**
 * Listen for foreground messages
 */
export const onMessageListener = (callback) => {
  if (!messaging) return () => {};

  return onMessage(messaging, (payload) => {
    console.log('📬 Foreground message received:', payload);
    callback(payload);
  });
};

/**
 * Generate unique device ID for this browser
 */
export const getDeviceId = () => {
  let deviceId = localStorage.getItem('deviceId');
  
  if (!deviceId) {
    deviceId = `web-${navigator.userAgent.split(' ').slice(-1)[0]}-${Date.now()}`;
    localStorage.setItem('deviceId', deviceId);
  }
  
  return deviceId;
};

/**
 * Get device info
 */
export const getDeviceInfo = () => {
  const ua = navigator.userAgent;
  let browser = 'Unknown';
  let os = 'Unknown';

  // Detect browser
  if (ua.includes('Chrome')) browser = 'Chrome';
  else if (ua.includes('Firefox')) browser = 'Firefox';
  else if (ua.includes('Safari')) browser = 'Safari';
  else if (ua.includes('Edge')) browser = 'Edge';

  // Detect OS
  if (ua.includes('Windows')) os = 'Windows';
  else if (ua.includes('Mac')) os = 'macOS';
  else if (ua.includes('Linux')) os = 'Linux';
  else if (ua.includes('Android')) os = 'Android';
  else if (ua.includes('iOS')) os = 'iOS';

  return {
    deviceId: getDeviceId(),
    deviceType: 'web',
    deviceName: `${browser} on ${os}`,
    appVersion: process.env.REACT_APP_VERSION || '1.0.0',
    osVersion: os
  };
};
```

### 2. API Service

**File:** `src/services/apiService.js`

```javascript
import axios from 'axios';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:8080';

// Create axios instance with default config
const api = axios.create({
  baseURL: API_URL,
  withCredentials: true, // Include cookies for refresh token
  headers: {
    'Content-Type': 'application/json'
  }
});

// Add auth token to requests
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('access_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Handle token refresh on 401
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;
      
      try {
        const { data } = await api.post('/auth/refresh');
        localStorage.setItem('access_token', data.access_token);
        originalRequest.headers.Authorization = `Bearer ${data.access_token}`;
        return api(originalRequest);
      } catch (refreshError) {
        localStorage.removeItem('access_token');
        window.location.href = '/login';
        return Promise.reject(refreshError);
      }
    }
    
    return Promise.reject(error);
  }
);

/**
 * Register FCM token with backend
 */
export const registerFCMToken = async (userId, fcmToken, deviceInfo) => {
  try {
    const response = await api.post('/users/fcm-tokens', {
      userId,
      fcmToken,
      ...deviceInfo
    });
    return response.data;
  } catch (error) {
    console.error('Error registering FCM token:', error);
    throw error;
  }
};

/**
 * Update FCM token last seen
 */
export const updateTokenLastSeen = async (tokenId) => {
  try {
    await api.patch(`/users/fcm-tokens/${tokenId}/last-seen`);
  } catch (error) {
    console.error('Error updating last seen:', error);
  }
};

/**
 * Get user's FCM tokens
 */
export const getUserFCMTokens = async (userId) => {
  try {
    const response = await api.get(`/users/fcm-tokens/user/${userId}`);
    return response.data;
  } catch (error) {
    console.error('Error fetching FCM tokens:', error);
    return [];
  }
};

/**
 * Deactivate FCM token (logout)
 */
export const deactivateFCMToken = async (tokenId) => {
  try {
    await api.patch(`/users/fcm-tokens/${tokenId}/deactivate`);
  } catch (error) {
    console.error('Error deactivating FCM token:', error);
  }
};

export default api;
```

### 3. Custom React Hook

**File:** `src/hooks/useFCM.js`

```javascript
import { useState, useEffect, useCallback } from 'react';
import { requestNotificationPermission, onMessageListener, getDeviceInfo } from '../services/fcmService';
import { registerFCMToken, updateTokenLastSeen } from '../services/apiService';

/**
 * Custom hook for FCM integration
 * @param {string} userId - Current logged-in user ID
 */
export const useFCM = (userId) => {
  const [token, setToken] = useState(null);
  const [notification, setNotification] = useState(null);
  const [permissionGranted, setPermissionGranted] = useState(false);
  const [loading, setLoading] = useState(false);

  /**
   * Request notification permission and register token
   */
  const requestPermission = useCallback(async () => {
    if (!userId) {
      console.warn('Cannot request FCM permission without userId');
      return;
    }

    setLoading(true);
    try {
      // Get FCM token
      const fcmToken = await requestNotificationPermission();
      
      if (fcmToken) {
        setToken(fcmToken);
        setPermissionGranted(true);

        // Register with backend
        const deviceInfo = getDeviceInfo();
        await registerFCMToken(userId, fcmToken, deviceInfo);
        
        console.log('✅ FCM token registered with backend');

        // Store token locally
        localStorage.setItem('fcm_token', fcmToken);
      }
    } catch (error) {
      console.error('Error requesting FCM permission:', error);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  /**
   * Listen for foreground messages
   */
  useEffect(() => {
    const unsubscribe = onMessageListener((payload) => {
      console.log('📬 Notification received:', payload);
      
      setNotification({
        title: payload.notification?.title,
        body: payload.notification?.body,
        data: payload.data
      });

      // Show browser notification if permission granted
      if (Notification.permission === 'granted') {
        new Notification(payload.notification?.title || 'New Notification', {
          body: payload.notification?.body || '',
          icon: payload.notification?.icon || '/logo192.png',
          data: payload.data
        });
      }
    });

    return unsubscribe;
  }, []);

  /**
   * Auto-request permission on mount if user is logged in
   */
  useEffect(() => {
    if (userId && !token) {
      const savedToken = localStorage.getItem('fcm_token');
      if (savedToken) {
        setToken(savedToken);
        setPermissionGranted(true);
      } else if (Notification.permission === 'default') {
        // Don't auto-request, wait for user action
        console.log('FCM: Waiting for user to grant permission');
      }
    }
  }, [userId, token]);

  /**
   * Update last seen every 5 minutes
   */
  useEffect(() => {
    if (!token) return;

    const interval = setInterval(() => {
      const tokenId = localStorage.getItem('fcm_token_id');
      if (tokenId) {
        updateTokenLastSeen(tokenId);
      }
    }, 5 * 60 * 1000); // 5 minutes

    return () => clearInterval(interval);
  }, [token]);

  return {
    token,
    notification,
    permissionGranted,
    loading,
    requestPermission
  };
};
```

### 4. React Component Example

**File:** `src/components/NotificationButton.jsx`

```javascript
import React from 'react';
import { useFCM } from '../hooks/useFCM';
import { Bell, BellOff } from 'lucide-react'; // Or any icon library

const NotificationButton = ({ userId }) => {
  const { permissionGranted, loading, requestPermission, notification } = useFCM(userId);

  // Show notification toast
  React.useEffect(() => {
    if (notification) {
      // You can use a toast library here (react-toastify, sonner, etc.)
      console.log('Show notification toast:', notification);
    }
  }, [notification]);

  return (
    <div className="notification-button">
      {!permissionGranted ? (
        <button
          onClick={requestPermission}
          disabled={loading}
          className="btn btn-primary"
        >
          {loading ? (
            <>
              <span className="spinner"></span>
              Requesting...
            </>
          ) : (
            <>
              <Bell size={20} />
              Enable Notifications
            </>
          )}
        </button>
      ) : (
        <div className="notification-enabled">
          <Bell size={20} className="text-success" />
          <span>Notifications Enabled</span>
        </div>
      )}
    </div>
  );
};

export default NotificationButton;
```

### 5. App Integration

**File:** `src/App.js`

```javascript
import React, { useEffect, useState } from 'react';
import { useFCM } from './hooks/useFCM';
import NotificationButton from './components/NotificationButton';
import './App.css';

function App() {
  const [user, setUser] = useState(null);

  // Initialize FCM for logged-in user
  const { notification, permissionGranted } = useFCM(user?.id);

  // Load user from token
  useEffect(() => {
    const token = localStorage.getItem('access_token');
    if (token) {
      // Decode JWT and get user info
      // Or fetch from /auth/me endpoint
      fetchCurrentUser().then(setUser);
    }
  }, []);

  // Handle notification clicks
  useEffect(() => {
    if (notification) {
      console.log('New notification:', notification);
      
      // Handle different notification types
      if (notification.data?.type === 'ASSIGNMENT') {
        // Navigate to assignment page
        window.location.href = notification.data.url;
      }
    }
  }, [notification]);

  return (
    <div className="App">
      <header className="App-header">
        <h1>Suraksha LMS</h1>
        
        {user && (
          <div className="user-section">
            <p>Welcome, {user.firstName}!</p>
            <NotificationButton userId={user.id} />
            {permissionGranted && (
              <span className="badge badge-success">🔔 Notifications Active</span>
            )}
          </div>
        )}
      </header>

      <main>
        {/* Your app content */}
      </main>
    </div>
  );
}

// Helper function to fetch current user
async function fetchCurrentUser() {
  try {
    const response = await fetch('http://localhost:8080/auth/me', {
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('access_token')}`
      }
    });
    return await response.json();
  } catch (error) {
    console.error('Error fetching user:', error);
    return null;
  }
}

export default App;
```

---

## 🧪 Testing

### 1. Test in Development

```bash
# Start your React app
npm start

# Open browser console
# You should see:
# ✅ Service Worker registered
# ✅ FCM Token obtained: eT...
# ✅ FCM token registered with backend
```

### 2. Test Notification Receipt

**Backend test script:** `test-send-notification.js`

```javascript
const axios = require('axios');

async function testNotification() {
  const userId = '12345'; // Your test user ID
  const token = 'YOUR_JWT_TOKEN'; // Your JWT access token

  try {
    const response = await axios.post(
      'http://localhost:8080/test/send-notification',
      { userId },
      {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      }
    );
    
    console.log('✅ Notification sent!', response.data);
  } catch (error) {
    console.error('❌ Error:', error.response?.data || error.message);
  }
}

testNotification();
```

### 3. Browser DevTools Testing

```javascript
// In browser console:

// Check if service worker is registered
navigator.serviceWorker.getRegistrations().then(console.log);

// Check notification permission
console.log('Permission:', Notification.permission);

// Test showing notification
new Notification('Test', { body: 'Testing notifications' });

// Check FCM token
console.log('FCM Token:', localStorage.getItem('fcm_token'));
```

---

## 🚀 Production Deployment

### 1. Build for Production

```bash
# Build React app
npm run build

# Files to check:
# - build/firebase-messaging-sw.js ✅
# - build/manifest.json ✅
# - build/static/js/main.*.js ✅
```

### 2. Environment Configuration

**Production `.env`:**

```env
REACT_APP_FIREBASE_API_KEY=AIzaSyBeX_q4BUr4q6rNqLj2v6Hp__cN3Teblho
REACT_APP_FIREBASE_PROJECT_ID=suraksha-37230
# ... other Firebase config

REACT_APP_API_URL=https://api.suraksha.lk
```

### 3. HTTPS Requirement

⚠️ **CRITICAL:** Web Push notifications require HTTPS in production!

```nginx
# Nginx config
server {
    listen 443 ssl;
    server_name app.suraksha.lk;
    
    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;
    
    location / {
        root /var/www/react-app/build;
        try_files $uri $uri/ /index.html;
    }
    
    # Service worker must be served with correct MIME type
    location /firebase-messaging-sw.js {
        add_header Content-Type application/javascript;
        add_header Service-Worker-Allowed /;
    }
}
```

### 4. PWA Manifest

**File:** `public/manifest.json`

```json
{
  "short_name": "Suraksha LMS",
  "name": "Suraksha Learning Management System",
  "icons": [
    {
      "src": "logo192.png",
      "type": "image/png",
      "sizes": "192x192"
    },
    {
      "src": "logo512.png",
      "type": "image/png",
      "sizes": "512x512"
    }
  ],
  "start_url": ".",
  "display": "standalone",
  "theme_color": "#000000",
  "background_color": "#ffffff",
  "gcm_sender_id": "763675183954"
}
```

---

## 🎯 Common Use Cases

### 1. Assignment Notification

```javascript
// When teacher creates assignment
await fcmService.sendToUser(
  studentId,
  {
    title: '📚 New Assignment',
    body: 'Math homework due on Friday',
    icon: '/icons/assignment.png'
  },
  {
    type: 'ASSIGNMENT',
    assignmentId: '123',
    url: '/assignments/123'
  }
);
```

**React handling:**
```javascript
useEffect(() => {
  if (notification?.data?.type === 'ASSIGNMENT') {
    navigate(`/assignments/${notification.data.assignmentId}`);
  }
}, [notification]);
```

### 2. Grade Published

```javascript
// When teacher publishes grades
await fcmService.sendToUser(
  studentId,
  {
    title: '🎓 Grade Published',
    body: 'Your Math exam grade is available',
    icon: '/icons/grade.png'
  },
  {
    type: 'GRADE',
    subjectId: '456',
    url: '/grades'
  }
);
```

### 3. Class Announcement

```javascript
// Send to all students in class
const studentIds = await getClassStudents(classId);
await fcmService.sendToUsers(
  studentIds,
  {
    title: '📢 Class Announcement',
    body: 'Tomorrow\'s class is canceled',
    icon: '/icons/announcement.png'
  },
  {
    type: 'ANNOUNCEMENT',
    classId: classId
  }
);
```

---

## 🐛 Troubleshooting

### Issue: "Notifications not working"

**Check:**
1. Is HTTPS enabled? (Required for production)
2. Is service worker registered? Check DevTools → Application → Service Workers
3. Is permission granted? Check `Notification.permission`
4. Is FCM token registered with backend?

### Issue: "Service worker not loading"

**Solution:**
```javascript
// Clear service workers
navigator.serviceWorker.getRegistrations().then(registrations => {
  registrations.forEach(r => r.unregister());
});

// Reload page and re-register
```

### Issue: "Token registration fails"

**Check:**
1. Backend API is running
2. JWT token is valid
3. Network tab in DevTools for errors
4. CORS is configured on backend

### Issue: "Background notifications not showing"

**Check:**
1. Service worker is active
2. Firebase config is correct in service worker
3. Browser supports background notifications (Safari doesn't)

---

## ✅ Success Checklist

- [ ] Firebase SDK installed
- [ ] Environment variables configured
- [ ] Service worker created and registered
- [ ] FCM hook implemented
- [ ] API service configured
- [ ] Token registration working
- [ ] Foreground notifications showing
- [ ] Background notifications showing
- [ ] Notification clicks handled
- [ ] HTTPS configured for production
- [ ] PWA manifest configured

---

## 📚 Additional Resources

- **Firebase Docs:** https://firebase.google.com/docs/cloud-messaging/js/client
- **React Docs:** https://react.dev
- **Service Workers:** https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API
- **Web Push:** https://web.dev/push-notifications-overview/

---

**🎉 Your React app is now ready to receive push notifications!**

**Next Steps:**
1. Test on multiple browsers (Chrome, Firefox, Edge)
2. Test on mobile browsers
3. Implement notification preferences UI
4. Add notification history page
5. Deploy to production with HTTPS

---

**Last Updated:** November 22, 2025  
**Version:** 1.0  
**Status:** ✅ Complete
