# Attendance Notification Deep-Link — Frontend Guide

When a parent or guardian receives an attendance push notification, tapping it opens a screen that shows the full details of that specific attendance event — who was marked, at what time, location, and current status. This guide covers everything needed to implement that screen for both the **web app** and the **mobile app**.

---

## How deep-links work

Every push notification payload now contains three extra fields:

| Field | Example value | Purpose |
|---|---|---|
| `attendanceId` | `SXsxMjMjQVRURU5EQUNFQ...` | Opaque ID — decode + lookup |
| `actionUrl` | `https://lms.suraksha.lk/attendance/view?id=<attendanceId>` | Web browser URL |
| `deepLink` | `suraksha://attendance/view?id=<attendanceId>` | Mobile deep-link |

The `attendanceId` is a base64url-encoded composite key. The frontend never needs to decode it — just pass it to `GET /api/attendance/view?id=<attendanceId>`.

---

## Environment variable defaults (overridable by backend)

| Env var | Default | Description |
|---|---|---|
| `WEB_APP_URL` | `https://lms.suraksha.lk` | Base URL for the web `actionUrl` |
| `MOBILE_APP_SCHEME` | `suraksha` | URI scheme for mobile `deepLink` |

---

## Push notification data payload

The full `data` object inside the FCM notification now looks like:

```json
{
  "type": "attendance",
  "studentId": "456",
  "studentName": "K.A. Perera",
  "status": "PRESENT",
  "date": "2026-01-15",
  "time": "2026-01-15T07:30:00.000Z",
  "attendanceType": "CLASS",
  "instituteName": "Suraksha Academy",
  "className": "Grade 10 - A",
  "subjectName": null,
  "attendanceId": "SXsxMjMjQVRURU5EQ...(base64url)",
  "actionUrl": "https://lms.suraksha.lk/attendance/view?id=SXsxMjMjQVRURU5EQ...",
  "deepLink": "suraksha://attendance/view?id=SXsxMjMjQVRURU5EQ..."
}
```

---

## API — `GET /api/attendance/view`

### Request

```
GET /api/attendance/view?id=<attendanceId>
Authorization: Bearer <jwt-token>
```

**Query parameters:**

| Parameter | Required | Description |
|---|---|---|
| `id` | ✅ Yes | The `attendanceId` from the notification payload |

### Response — 200 OK

```json
{
  "id": "SXsxMjMjQVRURU5EQ...",
  "studentId": "456",
  "studentName": "K.A. Perera",
  "studentImageUrl": "https://storage.googleapis.com/suraksha-lms/users/456.jpg",
  "instituteId": "123",
  "instituteName": "Suraksha Academy",
  "classId": "789",
  "className": "Grade 10 - A",
  "subjectId": null,
  "subjectName": null,
  "date": "2026-01-15",
  "status": 1,
  "timestamp": 1705329600000,
  "location": "Suraksha Academy, Grade 10 - A",
  "remarks": null,
  "markingMethod": "QR_CODE",
  "userType": "STUDENT",
  "calendarDayId": "101",
  "eventId": "202"
}
```

### Status field mapping

| Value | Meaning | Badge colour |
|---|---|---|
| `1` | PRESENT | Green |
| `0` | ABSENT | Red |
| `2` | LATE | Amber |
| `3` | LEFT | Grey |
| `4` | LEFT_EARLY | Orange |
| `5` | LEFT_LATELY | Yellow |

### Error responses

| Status | Meaning |
|---|---|
| `400` | `id` query param missing |
| `401` | JWT token missing or expired |
| `404` | Attendance record not found (expired TTL or invalid id) |

---

## Web app implementation

### 1 — Register the route

```tsx
// React Router (or Next.js pages/app router)
// Route: /attendance/view

import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import api from '../utils/api';

export default function AttendanceDetailPage() {
  const [params] = useSearchParams();
  const id = params.get('id');
  const [record, setRecord] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!id) {
      setError('No attendance ID provided');
      setLoading(false);
      return;
    }

    api.get(`/api/attendance/view?id=${encodeURIComponent(id)}`)
      .then(res => setRecord(res.data))
      .catch(err => {
        if (err.response?.status === 404) {
          setError('Attendance record not found or has expired.');
        } else {
          setError('Failed to load attendance details.');
        }
      })
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <Spinner />;
  if (error) return <ErrorMessage message={error} />;
  return <AttendanceDetailCard record={record} />;
}
```

### 2 — Attendance detail card

```tsx
import { statusLabel, statusColor } from '../utils/attendance';

function AttendanceDetailCard({ record }) {
  return (
    <div className="card">
      <img
        src={record.studentImageUrl || '/placeholder-avatar.png'}
        alt={record.studentName}
        className="avatar"
      />
      <h2>{record.studentName}</h2>

      <StatusBadge status={record.status} />

      <dl>
        <dt>Date</dt>
        <dd>{formatDate(record.date)}</dd>

        <dt>Time</dt>
        <dd>{formatTime(record.timestamp)}</dd>

        <dt>Institute</dt>
        <dd>{record.instituteName}</dd>

        {record.className && <><dt>Class</dt><dd>{record.className}</dd></>}
        {record.subjectName && <><dt>Subject</dt><dd>{record.subjectName}</dd></>}

        {record.location && <><dt>Location</dt><dd>{record.location}</dd></>}
        {record.markingMethod && <><dt>Method</dt><dd>{record.markingMethod}</dd></>}
        {record.remarks && <><dt>Remarks</dt><dd>{record.remarks}</dd></>}
      </dl>
    </div>
  );
}

// Status helpers
const STATUS_MAP = {
  0: { label: 'Absent',      color: 'red'    },
  1: { label: 'Present',     color: 'green'  },
  2: { label: 'Late',        color: 'amber'  },
  3: { label: 'Left',        color: 'grey'   },
  4: { label: 'Left Early',  color: 'orange' },
  5: { label: 'Left Lately', color: 'yellow' },
};

function StatusBadge({ status }) {
  const s = STATUS_MAP[status] ?? { label: 'Unknown', color: 'grey' };
  return <span className={`badge badge-${s.color}`}>{s.label}</span>;
}
```

### 3 — Handle the `actionUrl` from notifications (web push)

When the service worker receives a push notification it should:

```js
// service-worker.js
self.addEventListener('notificationclick', event => {
  event.notification.close();

  const data = event.notification.data || {};
  const url = data.actionUrl || '/';   // already has ?id= embedded

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then(windowClients => {
        // Focus existing window if open
        for (const client of windowClients) {
          if (client.url === url && 'focus' in client) return client.focus();
        }
        // Open new window
        if (clients.openWindow) return clients.openWindow(url);
      })
  );
});
```

---

## Mobile app implementation (React Native / Flutter)

### React Native — handle deep-link

```ts
// App.tsx — linking config
const linking = {
  prefixes: ['suraksha://'],
  config: {
    screens: {
      AttendanceDetail: 'attendance/view',  // params: { id: string }
    },
  },
};

// AttendanceDetailScreen.tsx
import { useRoute } from '@react-navigation/native';
import { useEffect, useState } from 'react';
import api from '../services/api';

export default function AttendanceDetailScreen() {
  const { params } = useRoute<any>();
  const { id } = params;   // extracted from suraksha://attendance/view?id=...
  const [record, setRecord] = useState(null);

  useEffect(() => {
    api.get(`/api/attendance/view?id=${encodeURIComponent(id)}`)
       .then(r => setRecord(r.data))
       .catch(console.error);
  }, [id]);

  if (!record) return <ActivityIndicator />;
  return <AttendanceCard record={record} />;
}
```

### Flutter — handle deep-link

```dart
// pubspec.yaml: app_links: ^4.x

import 'package:app_links/app_links.dart';

class AttendanceLinkHandler {
  static void init(BuildContext context) {
    AppLinks().uriLinkStream.listen((uri) {
      if (uri.host == 'attendance' && uri.path == '/view') {
        final id = uri.queryParameters['id'];
        if (id != null) {
          Navigator.push(context, MaterialPageRoute(
            builder: (_) => AttendanceDetailScreen(attendanceId: id),
          ));
        }
      }
    });
  }
}

// AttendanceDetailScreen
class AttendanceDetailScreen extends StatefulWidget {
  final String attendanceId;
  const AttendanceDetailScreen({required this.attendanceId});

  @override
  State<AttendanceDetailScreen> createState() => _AttendanceDetailScreenState();
}

class _AttendanceDetailScreenState extends State<AttendanceDetailScreen> {
  Map<String, dynamic>? _record;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final id = Uri.encodeQueryComponent(widget.attendanceId);
    final res = await ApiService.get('/api/attendance/view?id=$id');
    setState(() => _record = res.data);
  }

  @override
  Widget build(BuildContext context) {
    if (_record == null) return const CircularProgressIndicator();
    return AttendanceDetailCard(record: _record!);
  }
}
```

---

## Firebase Cloud Messaging (FCM) — notification tap handler

When a notification arrives with `data.attendanceId`, the tap should navigate to the detail screen. Both Android and iOS handle this the same way through the FCM data payload.

```ts
// React Native — firebase/messaging
import messaging from '@react-native-firebase/messaging';
import { useNavigation } from '@react-navigation/native';

// Background / quit state tap
messaging().getInitialNotification().then(remoteMessage => {
  if (remoteMessage?.data?.attendanceId) {
    navigate('AttendanceDetail', { id: remoteMessage.data.attendanceId });
  }
});

// Foreground
messaging().onNotificationOpenedApp(remoteMessage => {
  if (remoteMessage?.data?.attendanceId) {
    navigate('AttendanceDetail', { id: remoteMessage.data.attendanceId });
  }
});

// In-foreground display (show banner + navigate on tap)
messaging().onMessage(async remoteMessage => {
  if (remoteMessage.data?.type === 'attendance') {
    showLocalNotification({
      title: remoteMessage.notification?.title,
      body: remoteMessage.notification?.body,
      data: remoteMessage.data,
    });
  }
});
```

---

## Utility helpers

```ts
export function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-LK', {
    year: 'numeric', month: 'long', day: 'numeric',
  });
}

export function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString('en-LK', {
    hour: '2-digit', minute: '2-digit', hour12: true,
    timeZone: 'Asia/Colombo',
  });
}

export function statusLabel(status: number): string {
  const map: Record<number, string> = {
    0: 'Absent', 1: 'Present', 2: 'Late',
    3: 'Left', 4: 'Left Early', 5: 'Left Lately',
  };
  return map[status] ?? 'Unknown';
}
```

---

## FAQ

**Q: The `id` in the URL looks random — what is it?**  
It is a base64url-encoded composite key of the DynamoDB partition key + sort key. It is stable for the lifetime of the record; it never changes after attendance is marked.

**Q: Can the same `id` be used in both the web and mobile app?**  
Yes. The API `/api/attendance/view?id=<id>` is identical for both. The `actionUrl` field is ready to open in a browser; `deepLink` is the native scheme for the mobile app.

**Q: What happens if the attendance record is old and has been removed by TTL?**  
The API returns `404 Not Found`. Display a friendly "Record no longer available" message.

**Q: Does the endpoint require any specific role?**  
JWT only — any authenticated user can view an attendance record via its ID. No additional role checks are applied (the ID itself is opaque and unguessable).

---

*Last updated: March 2026*
