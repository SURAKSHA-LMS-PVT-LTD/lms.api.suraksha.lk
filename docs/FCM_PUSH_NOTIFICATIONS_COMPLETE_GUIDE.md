# 🔥 Firebase Cloud Messaging (FCM) - Complete Implementation Guide

## 📚 Table of Contents
1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Backend Setup](#backend-setup)
4. [Frontend Setup](#frontend-setup)
5. [Usage Examples](#usage-examples)
6. [Testing](#testing)
7. [Production Deployment](#production-deployment)

---

## 🎯 Overview

### What We Built

✅ **Complete FCM System with:**
- Multi-device support (iOS, Android, Web, Desktop)
- Multiple tokens per user
- Batch notifications
- Topic subscriptions
- Invalid token handling
- Database integration

### Components

**Backend (NestJS):**
- `FcmNotificationService` - Send notifications
- `UserFcmTokenEntity` - Store tokens
- `UserFcmTokenService` - Manage tokens
- `UserFcmTokenController` - REST APIs

**Frontend:**
- Web app uses Firebase Web SDK
- Mobile apps use Firebase iOS/Android SDK
- Service Worker for background notifications

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      YOUR LMS BACKEND                       │
│                                                             │
│  ┌──────────────────────┐    ┌──────────────────────┐     │
│  │ FcmNotificationService│───▶│ Firebase Admin SDK   │     │
│  └──────────────────────┘    └──────────────────────┘     │
│            │                            │                   │
│            │                            │                   │
│            ▼                            ▼                   │
│  ┌──────────────────────┐    ┌──────────────────────┐     │
│  │ UserFcmTokenEntity    │    │  Firebase Cloud      │     │
│  │ (MySQL Database)      │    │  Messaging Service   │     │
│  └──────────────────────┘    └──────────────────────┘     │
└─────────────────────────────────────────────────────────────┘
                                        │
                    ┌───────────────────┼───────────────────┐
                    ▼                   ▼                   ▼
           ┌──────────────┐   ┌──────────────┐   ┌──────────────┐
           │   Web App    │   │ Android App  │   │   iOS App    │
           │  (Browser)   │   │   (Phone)    │   │   (iPhone)   │
           └──────────────┘   └──────────────┘   └──────────────┘
```

---

## 🔧 Backend Setup

### 1. Environment Variables (Already Added)

**File:** `.env`
```env
FIREBASE_PROJECT_ID=suraksha-37230
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n..."
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-fbsvc@suraksha-37230.iam.gserviceaccount.com
```

### 2. Files Created

✅ `src/common/services/fcm-notification.service.ts`
✅ `src/modules/user/entities/user-fcm-token.entity.ts`
✅ `src/modules/user/services/user-fcm-token.service.ts`
✅ `src/modules/user/controllers/user-fcm-token.controller.ts`
✅ `src/modules/user/repositories/user-fcm-token.repository.ts`

### 3. Database Table

```sql
CREATE TABLE user_fcm_tokens (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT NOT NULL,
  fcm_token VARCHAR(255) NOT NULL,
  device_id VARCHAR(255) NOT NULL,
  device_type ENUM('android', 'ios', 'web', 'desktop') DEFAULT 'android',
  device_name VARCHAR(255),
  app_version VARCHAR(50),
  os_version VARCHAR(50),
  is_active BOOLEAN DEFAULT TRUE,
  is_synced BOOLEAN DEFAULT FALSE,
  last_seen TIMESTAMP NULL,
  last_notification_sent TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY idx_user_device (user_id, device_id),
  KEY idx_user_id (user_id),
  KEY idx_is_active (is_active),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
```

---

## 🌐 Frontend Setup

### For Web Apps (Browser)

#### 1. Firebase Web Configuration

**Public credentials (safe to expose):**
```javascript
const firebaseConfig = {
  apiKey: "AIzaSyBeX_q4BUr4q6rNqLj2v6Hp__cN3Teblho",
  authDomain: "suraksha-37230.firebaseapp.com",
  projectId: "suraksha-37230",
  storageBucket: "suraksha-37230.firebasestorage.app",
  messagingSenderId: "763675183954",
  appId: "1:763675183954:web:4eb11703dcd10f7c5e888b",
  measurementId: "G-F4P9PVZ2JF"
};

const vapidKey = "BEsTv-eK9cK1QZFs0Ymi2oZ1JqYCjxIAjKXWaefnPQqESlWwAxvAfDoDld_UJyNVfE2moQiMo--gZWmt6HAptdg";
```

#### 2. Web App Integration

**File:** `public/firebase-init.js`
```javascript
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getMessaging, getToken, onMessage } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging.js";

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const messaging = getMessaging(app);

// Register service worker
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/firebase-messaging-sw.js')
    .then((registration) => {
      console.log('✅ Service Worker registered');
    });
}

// Request permission and get token
async function requestNotificationPermission() {
  const permission = await Notification.requestPermission();
  
  if (permission === 'granted') {
    const token = await getToken(messaging, { vapidKey });
    
    // Send token to your backend
    await fetch('/api/users/fcm-tokens', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${yourJwtToken}`
      },
      body: JSON.stringify({
        userId: currentUserId,
        fcmToken: token,
        deviceId: generateDeviceId(), // Unique browser identifier
        deviceType: 'web',
        deviceName: navigator.userAgent,
        appVersion: '1.0.0'
      })
    });
    
    console.log('✅ FCM Token registered:', token);
  }
}

// Handle foreground messages
onMessage(messaging, (payload) => {
  console.log('📬 Notification received:', payload);
  
  // Show notification
  new Notification(payload.notification.title, {
    body: payload.notification.body,
    icon: payload.notification.icon,
    data: payload.data
  });
});

// Call on page load
requestNotificationPermission();
```

#### 3. Service Worker

**File:** `public/firebase-messaging-sw.js`
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

// Handle background messages
messaging.onBackgroundMessage((payload) => {
  console.log('📩 Background message:', payload);
  
  const notificationTitle = payload.notification.title;
  const notificationOptions = {
    body: payload.notification.body,
    icon: '/icon-192x192.png',
    badge: '/badge-72x72.png',
    data: payload.data
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});
```

---

## 💡 Usage Examples

### Example 1: Register FCM Token (Frontend)

```typescript
// Student opens LMS in Chrome
POST /users/fcm-tokens
{
  "userId": "12345",
  "fcmToken": "eTJtbZetZrykAsyfLQTOaW:APA91bF...",
  "deviceId": "chrome-windows-abc123",
  "deviceType": "web",
  "deviceName": "Chrome on Windows 11",
  "appVersion": "2.0.0",
  "osVersion": "Windows 11"
}
```

### Example 2: Send Notification to Single User (Backend)

```typescript
import { FcmNotificationService } from '@/common/services/fcm-notification.service';

@Injectable()
export class AssignmentService {
  constructor(
    private readonly fcmService: FcmNotificationService
  ) {}

  async assignHomework(studentId: string, assignment: any) {
    // ... create assignment logic ...

    // Send push notification to student
    await this.fcmService.sendToUser(
      studentId,
      {
        title: '📚 New Assignment',
        body: `You have a new assignment: ${assignment.title}`,
        icon: '/icons/assignment.png'
      },
      {
        type: 'ASSIGNMENT',
        assignmentId: assignment.id,
        url: `/assignments/${assignment.id}`
      },
      {
        priority: 'high',
        timeToLive: 86400 // 24 hours
      }
    );

    return assignment;
  }
}
```

### Example 3: Send to Multiple Users (Bulk)

```typescript
@Injectable()
export class AnnouncementService {
  constructor(
    private readonly fcmService: FcmNotificationService
  ) {}

  async sendClassAnnouncement(classId: string, announcement: string) {
    // Get all students in class
    const studentIds = await this.getStudentIds(classId);

    // Send to all students
    const result = await this.fcmService.sendToUsers(
      studentIds,
      {
        title: '📢 Class Announcement',
        body: announcement,
        icon: '/icons/announcement.png'
      },
      {
        type: 'ANNOUNCEMENT',
        classId: classId
      }
    );

    console.log(`✅ Sent to ${result.totalSuccess} students`);
    return result;
  }
}
```

### Example 4: Topic Subscriptions

```typescript
@Injectable()
export class NotificationTopicService {
  constructor(
    private readonly fcmService: FcmNotificationService,
    private readonly tokenRepository: UserFcmTokenRepository
  ) {}

  // Subscribe all students to "grade-10" topic
  async subscribeToGradeTopic(gradeId: string) {
    const students = await this.getStudentsByGrade(gradeId);
    const tokens = await this.tokenRepository.findActiveTokensByUserIds(
      students.map(s => s.id)
    );

    await this.fcmService.subscribeToTopic(
      tokens.map(t => t.fcmToken),
      `grade-${gradeId}`
    );
  }

  // Send to all grade 10 students at once
  async sendToGrade(gradeId: string, message: string) {
    await this.fcmService.sendToTopic(
      `grade-${gradeId}`,
      {
        title: '🎓 Grade Announcement',
        body: message
      },
      {
        type: 'GRADE_ANNOUNCEMENT',
        gradeId: gradeId
      }
    );
  }
}
```

### Example 5: Welcome Notification on User Registration

```typescript
@Injectable()
export class UserService {
  constructor(
    private readonly fcmService: FcmNotificationService
  ) {}

  async createUser(dto: CreateUserDto) {
    const user = await this.usersRepository.create(dto);

    // Send welcome email (existing)
    await this.emailService.sendWelcomeEmail(user.email, user.firstName);

    // NEW: Send push notification if they have FCM token
    // (They might have installed app before registering)
    setTimeout(async () => {
      await this.fcmService.sendToUser(
        user.id,
        {
          title: '🎉 Welcome to Suraksha LMS!',
          body: `Hi ${user.firstName}, your account is ready!`,
          icon: '/icons/welcome.png'
        },
        {
          type: 'WELCOME',
          userId: user.id,
          url: '/dashboard'
        }
      );
    }, 5000); // Delay 5 seconds

    return user;
  }
}
```

---

## 🧪 Testing

### Test Script (Already Created)

**File:** `test-fcm-push.js`
```javascript
const admin = require('firebase-admin');
const serviceAccount = require('./path/to/service-account.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const fcmToken = 'eTJtbZetZrykAsyfLQTOaW:APA91bF...';

admin.messaging().send({
  token: fcmToken,
  notification: {
    title: '🎉 Test Notification',
    body: 'FCM is working!'
  },
  data: {
    type: 'TEST',
    timestamp: new Date().toISOString()
  }
}).then(messageId => {
  console.log('✅ Sent! Message ID:', messageId);
}).catch(error => {
  console.error('❌ Error:', error);
});
```

### Manual Testing Steps

1. **Get FCM Token:**
   - Open: `http://localhost:3000/get-fcm-token.html`
   - Click "Get FCM Token"
   - Allow notifications
   - Copy token

2. **Test via API:**
```bash
curl -X POST http://localhost:8080/users/fcm-tokens \
  -H "Authorization: Bearer YOUR_JWT" \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "12345",
    "fcmToken": "YOUR_TOKEN_HERE",
    "deviceId": "test-device-1",
    "deviceType": "web",
    "deviceName": "Test Browser"
  }'
```

3. **Send Test Notification:**
```bash
node test-fcm-push.js
```

---

## 🚀 Production Deployment

### Checklist

- [ ] Firebase credentials in `.env` (production values)
- [ ] Service Worker deployed to production (`/firebase-messaging-sw.js`)
- [ ] HTTPS enabled (required for Web Push)
- [ ] VAPID key configured
- [ ] Database table created
- [ ] Token cleanup cron job scheduled
- [ ] Rate limiting configured
- [ ] Error monitoring enabled

### Security Considerations

✅ **Safe to Expose (Frontend):**
- Firebase Web API Key
- Project ID
- App ID
- VAPID Key
- Messaging Sender ID

❌ **NEVER Expose (Backend Only):**
- Firebase Private Key
- Service Account JSON
- Database credentials

### Performance Tips

1. **Batch Sending:**
   - Use `sendToMultipleDevices()` instead of loops
   - FCM supports up to 500 tokens per batch

2. **Token Cleanup:**
   - Run daily cron to deactivate old tokens
   ```typescript
   @Cron('0 2 * * *') // 2 AM daily
   async cleanupInactiveTokens() {
     await this.tokenRepository.cleanupInactiveTokens(30); // 30 days old
   }
   ```

3. **Topic Subscriptions:**
   - Use topics for large groups (>100 users)
   - More efficient than individual sends

---

## 📊 API Endpoints

### Token Management

```
POST   /users/fcm-tokens              Register/update token
GET    /users/fcm-tokens              List all tokens (admin)
GET    /users/fcm-tokens/:id          Get token by ID
GET    /users/fcm-tokens/user/:userId Get user's tokens
PATCH  /users/fcm-tokens/:id          Update token
DELETE /users/fcm-tokens/:id          Delete token
PATCH  /users/fcm-tokens/:id/last-seen          Update last seen
PATCH  /users/fcm-tokens/:id/deactivate         Deactivate token
DELETE /users/fcm-tokens/cleanup/inactive       Cleanup old tokens
```

---

## ✅ Success Criteria

Your FCM system is **PRODUCTION READY** when:

✅ Users can register tokens from web/mobile
✅ Backend can send notifications to single users
✅ Backend can send batch notifications
✅ Invalid tokens are automatically deactivated
✅ Service Worker handles background messages
✅ Foreground messages display in app
✅ Multi-device support working
✅ Error logging and monitoring enabled

---

## 🎯 Next Steps

1. **Integrate with Existing Features:**
   - Assignment notifications
   - Grade notifications
   - Attendance alerts
   - Chat messages
   - Announcements

2. **Add Advanced Features:**
   - Notification preferences (settings)
   - Do Not Disturb hours
   - Notification history
   - Read receipts
   - Action buttons (reply, dismiss, etc.)

3. **Mobile Apps:**
   - Android: Firebase Cloud Messaging SDK
   - iOS: Apple Push Notification service (APNs) via FCM

---

## 📞 Support

**Firebase Documentation:**
- Web: https://firebase.google.com/docs/cloud-messaging/js/client
- Admin SDK: https://firebase.google.com/docs/cloud-messaging/admin

**Your Implementation:**
- Service: `src/common/services/fcm-notification.service.ts`
- Controller: `src/modules/user/controllers/user-fcm-token.controller.ts`
- Test: `test-fcm-push.js`

---

**🎉 Congratulations! Your FCM Push Notification System is Complete!**
