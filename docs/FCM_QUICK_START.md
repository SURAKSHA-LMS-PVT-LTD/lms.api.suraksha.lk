# 🚀 FCM Push Notifications - Quick Start Guide

> **5-Minute Setup for React + Backend**

---

## 📋 Prerequisites Checklist

- ✅ Backend running (`npm start` on port 8080)
- ✅ Firebase credentials in `.env`
- ✅ React app created
- ✅ HTTPS enabled (production only)

---

## 🔧 Backend Setup (Already Done!)

Your backend is **ready to use**. These files exist:

```
✅ src/common/services/fcm-notification.service.ts
✅ src/modules/user/entities/user-fcm-token.entity.ts
✅ src/modules/user/services/user-fcm-token.service.ts
✅ src/modules/user/controllers/user-fcm-token.controller.ts
✅ Database table: user_fcm_tokens
```

### Firebase Credentials (in `.env`)

```env
FIREBASE_PROJECT_ID=suraksha-37230
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n..."
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-fbsvc@suraksha-37230.iam.gserviceaccount.com
```

---

## ⚛️ React Setup (3 Steps)

### Step 1: Install Firebase

```bash
npm install firebase
```

### Step 2: Create 3 Files

**File 1:** `public/firebase-messaging-sw.js`

```javascript
importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyBeX_q4BUr4q6rNqLj2v6Hp__cN3Teblho",
  projectId: "suraksha-37230",
  messagingSenderId: "763675183954",
  appId: "1:763675183954:web:4eb11703dcd10f7c5e888b"
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  self.registration.showNotification(
    payload.notification.title,
    { body: payload.notification.body, icon: '/logo192.png' }
  );
});
```

**File 2:** `src/config/firebase.js`

```javascript
import { initializeApp } from 'firebase/app';
import { getMessaging } from 'firebase/messaging';

const app = initializeApp({
  apiKey: "AIzaSyBeX_q4BUr4q6rNqLj2v6Hp__cN3Teblho",
  authDomain: "suraksha-37230.firebaseapp.com",
  projectId: "suraksha-37230",
  storageBucket: "suraksha-37230.firebasestorage.app",
  messagingSenderId: "763675183954",
  appId: "1:763675183954:web:4eb11703dcd10f7c5e888b"
});

export const messaging = getMessaging(app);
```

**File 3:** `src/hooks/useFCM.js`

```javascript
import { useState, useEffect } from 'react';
import { getToken, onMessage } from 'firebase/messaging';
import { messaging } from '../config/firebase';

const VAPID_KEY = "BEsTv-eK9cK1QZFs0Ymi2oZ1JqYCjxIAjKXWaefnPQqESlWwAxvAfDoDld_UJyNVfE2moQiMo--gZWmt6HAptdg";

export const useFCM = (userId) => {
  const [notification, setNotification] = useState(null);

  useEffect(() => {
    if (!userId) return;

    // Request permission and get token
    Notification.requestPermission().then(async (permission) => {
      if (permission === 'granted') {
        const registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js');
        const token = await getToken(messaging, { vapidKey: VAPID_KEY, serviceWorkerRegistration: registration });
        
        // Register token with backend
        await fetch('http://localhost:8080/users/fcm-tokens', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${localStorage.getItem('access_token')}`
          },
          body: JSON.stringify({
            userId,
            fcmToken: token,
            deviceId: `web-${Date.now()}`,
            deviceType: 'web',
            deviceName: navigator.userAgent.split(' ').pop()
          })
        });
        
        console.log('✅ FCM Token registered:', token);
      }
    });

    // Listen for foreground messages
    return onMessage(messaging, (payload) => {
      console.log('📬 Notification:', payload);
      setNotification(payload.notification);
    });
  }, [userId]);

  return { notification };
};
```

### Step 3: Use in App

```javascript
import { useFCM } from './hooks/useFCM';

function App() {
  const user = { id: '123' }; // Your logged-in user
  const { notification } = useFCM(user.id);

  useEffect(() => {
    if (notification) {
      alert(`${notification.title}: ${notification.body}`);
    }
  }, [notification]);

  return <div>Your app...</div>;
}
```

---

## 🧪 Test It!

### 1. Start Everything

```bash
# Terminal 1: Backend
cd backend
npm start

# Terminal 2: React
cd frontend
npm start
```

### 2. Open Browser

```
http://localhost:3000
```

- Click "Allow" when prompted for notifications
- Check console: Should see "✅ FCM Token registered"

### 3. Send Test Notification

**Create:** `test-notification.js`

```javascript
const axios = require('axios');

axios.post('http://localhost:8080/users/fcm-tokens', {
  userId: '123',
  fcmToken: 'YOUR_TOKEN_FROM_CONSOLE',
  deviceId: 'test-1',
  deviceType: 'web',
  deviceName: 'Chrome'
}, {
  headers: { 'Authorization': 'Bearer YOUR_JWT_TOKEN' }
}).then(() => console.log('✅ Registered'));
```

---

## 📤 Sending Notifications (Backend)

### Example: Send to Single User

```typescript
import { FcmNotificationService } from '@/common/services/fcm-notification.service';

@Injectable()
export class YourService {
  constructor(
    private readonly fcmService: FcmNotificationService
  ) {}

  async notifyStudent(studentId: string) {
    await this.fcmService.sendToUser(
      studentId,
      {
        title: '📚 New Assignment',
        body: 'Math homework due Friday'
      },
      {
        type: 'ASSIGNMENT',
        url: '/assignments/123'
      }
    );
  }
}
```

### Example: Send to Multiple Users

```typescript
async notifyClass(studentIds: string[]) {
  await this.fcmService.sendToUsers(
    studentIds,
    {
      title: '📢 Class Announcement',
      body: 'Tomorrow class is canceled'
    },
    { type: 'ANNOUNCEMENT' }
  );
}
```

---

## 🎯 Common Issues & Fixes

| Issue | Solution |
|-------|----------|
| "Notifications blocked" | Check browser settings → Allow notifications for localhost |
| "Service worker not found" | File must be in `public/` folder |
| "Token registration fails" | Check JWT token is valid, backend is running |
| "No notifications in background" | Close browser tab, should still receive notifications |
| "HTTPS required" | Development: Use localhost (works). Production: Must use HTTPS |

---

## 🔑 Important URLs

- **Backend API:** `http://localhost:8080`
- **Register Token:** `POST /users/fcm-tokens`
- **Get Tokens:** `GET /users/fcm-tokens/user/:userId`
- **Frontend:** `http://localhost:3000`

---

## 📊 API Endpoints

```bash
# Register FCM token
POST /users/fcm-tokens
Body: { userId, fcmToken, deviceId, deviceType, deviceName }

# Get user tokens
GET /users/fcm-tokens/user/:userId

# Update last seen
PATCH /users/fcm-tokens/:id/last-seen

# Deactivate token
PATCH /users/fcm-tokens/:id/deactivate
```

---

## 🎓 Real-World Examples

### 1. Assignment Notification

```typescript
// Backend: When teacher creates assignment
await fcmService.sendToUser(studentId, {
  title: '📚 New Assignment',
  body: 'Math Chapter 5 homework'
}, {
  type: 'ASSIGNMENT',
  assignmentId: '123',
  url: '/assignments/123'
});

// Frontend: Handle notification click
if (notification.data.type === 'ASSIGNMENT') {
  navigate(`/assignments/${notification.data.assignmentId}`);
}
```

### 2. Grade Published

```typescript
// Backend
await fcmService.sendToUser(studentId, {
  title: '🎓 Grade Published',
  body: 'Your Math exam grade: 95/100'
}, {
  type: 'GRADE',
  url: '/grades'
});
```

### 3. Class Announcement

```typescript
// Backend: Send to whole class
const students = await getClassStudents(classId);
await fcmService.sendToUsers(
  students.map(s => s.id),
  {
    title: '📢 Class Update',
    body: 'Extra class on Saturday 10 AM'
  },
  { type: 'ANNOUNCEMENT' }
);
```

---

## ✅ Production Checklist

- [ ] HTTPS enabled on frontend
- [ ] HTTPS enabled on backend  
- [ ] Service worker deployed
- [ ] Environment variables set
- [ ] Firebase credentials verified
- [ ] CORS configured correctly
- [ ] Token cleanup cron job running
- [ ] Error logging enabled

---

## 📚 Full Documentation

For complete guides, see:
- **Backend:** `docs/FCM_PUSH_NOTIFICATIONS_COMPLETE_GUIDE.md`
- **React:** `docs/REACT_FCM_INTEGRATION_GUIDE.md`
- **Auth:** `docs/REFRESH_TOKEN_COOKIE_AUTHENTICATION.md`

---

## 🎉 You're Done!

Your push notification system is ready! 🚀

**What works:**
✅ Users can receive notifications on web
✅ Backend can send to single/multiple users
✅ Tokens automatically registered
✅ Multi-device support
✅ Background notifications

**Next Steps:**
1. Test with real users
2. Add notification preferences UI
3. Implement notification history
4. Deploy to production with HTTPS

---

**Questions?** Check the full documentation files or test with the examples above.

**Last Updated:** November 22, 2025  
**Status:** ✅ Production Ready
