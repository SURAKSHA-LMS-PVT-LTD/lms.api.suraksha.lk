# Google Drive / Gmail OAuth — Frontend Implementation Guide

## Overview

This guide covers how to connect a user's Google Drive account from both the **web app** and the **mobile app (React Native / Flutter)**. The backend handles all OAuth2 token exchange and storage — the frontend only needs to:

1. Call the connect endpoint to get an `authUrl`
2. Open that URL in a browser or in-app browser
3. Handle the redirect/deep-link that arrives after Google consent

---

## Architecture

```
Frontend ──► GET /drive-access/connect ──► Backend
                                                │
                                          returns { authUrl }
                                                │
Frontend ──► opens authUrl in browser ──► Google consent page
                                                │
                              Google redirects to /drive-access/callback
                                                │
                         Backend exchanges code, stores refresh token
                                                │
                    Web:    redirect → https://lms.suraksha.lk/profile?tab=apps?drive_connected=true&google_email=...
                    Mobile: deep-link → lk.suraksha.lms://drive-callback?drive_connected=true&google_email=...
```

---

## Step 1 — Call the Connect Endpoint

**Endpoint:** `GET /drive-access/connect`

**Auth:** Requires `Authorization: Bearer <jwt>` header

**Query params:**

| Param | Required | Values | Default |
|-------|----------|--------|---------|
| `platform` | No | `web` \| `mobile` | `web` |
| `returnUrl` | No | Any relative path (web only) | `/profile?tab=apps` |

### Web

```typescript
// React / Next.js example
async function connectGoogleDrive() {
  const res = await fetch('/drive-access/connect?platform=web&returnUrl=/profile?tab=apps', {
    headers: { Authorization: `Bearer ${jwt}` },
  });
  const { authUrl } = await res.json();
  window.location.href = authUrl; // redirect to Google consent
}
```

### Mobile (React Native)

```typescript
import { Linking } from 'react-native';

async function connectGoogleDrive(jwt: string) {
  const res = await fetch('https://lmsapi.suraksha.lk/drive-access/connect?platform=mobile', {
    headers: { Authorization: `Bearer ${jwt}` },
  });
  const { authUrl } = await res.json();
  await Linking.openURL(authUrl); // opens system browser / Chrome Custom Tab
}
```

### Mobile (Flutter)

```dart
import 'package:url_launcher/url_launcher.dart';

Future<void> connectGoogleDrive(String jwt) async {
  final response = await http.get(
    Uri.parse('https://lmsapi.suraksha.lk/drive-access/connect?platform=mobile'),
    headers: {'Authorization': 'Bearer $jwt'},
  );
  final authUrl = jsonDecode(response.body)['authUrl'] as String;
  await launchUrl(Uri.parse(authUrl), mode: LaunchMode.externalApplication);
}
```

---

## Step 2 — Handle the Callback

### Web (React / Next.js)

After Google consent, the browser is redirected to your page via query params. Read them on mount:

```typescript
// /profile?tab=apps page or a dedicated /drive-callback page
import { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom'; // or next/navigation

function ProfilePage() {
  const [searchParams] = useSearchParams();

  useEffect(() => {
    const driveConnected = searchParams.get('drive_connected');
    const googleEmail    = searchParams.get('google_email');
    const error          = searchParams.get('error');

    if (driveConnected === 'true') {
      showSuccessToast(`Google Drive connected: ${googleEmail}`);
      // refresh profile data
      fetchUserProfile();
    } else if (driveConnected === 'false') {
      showErrorToast(error || 'Failed to connect Google Drive');
    }

    // Clean up URL so params don't persist on page refresh
    window.history.replaceState({}, '', '/profile?tab=apps');
  }, []);

  // ... rest of component
}
```

### Mobile — Register the Deep Link

After Google consent the backend redirects to:
```
lk.suraksha.lms://drive-callback?drive_connected=true&google_email=user@gmail.com
```

#### React Native — AndroidManifest.xml

```xml
<activity android:name=".MainActivity">
  <intent-filter android:label="Drive Callback">
    <action android:name="android.intent.action.VIEW" />
    <category android:name="android.intent.category.DEFAULT" />
    <category android:name="android.intent.category.BROWSABLE" />
    <data android:scheme="lk.suraksha.lms" android:host="drive-callback" />
  </intent-filter>
</activity>
```

#### React Native — Info.plist (iOS)

```xml
<key>CFBundleURLTypes</key>
<array>
  <dict>
    <key>CFBundleURLSchemes</key>
    <array>
      <string>lk.suraksha.lms</string>
    </array>
  </dict>
</array>
```

#### React Native — Handle the Deep Link

```typescript
import { Linking } from 'react-native';
import { useEffect } from 'react';

function useGoogleDriveCallback() {
  useEffect(() => {
    const handleUrl = ({ url }: { url: string }) => {
      if (!url.startsWith('lk.suraksha.lms://drive-callback')) return;

      const params = new URLSearchParams(url.split('?')[1]);
      const driveConnected = params.get('drive_connected');
      const googleEmail    = params.get('google_email');
      const error          = params.get('error');

      if (driveConnected === 'true') {
        showSuccessToast(`Google Drive connected: ${googleEmail}`);
        refreshProfile();
      } else {
        showErrorToast(error || 'Failed to connect Google Drive');
      }
    };

    const sub = Linking.addEventListener('url', handleUrl);

    // Handle case where app was cold-started by the deep link
    Linking.getInitialURL().then((url) => {
      if (url) handleUrl({ url });
    });

    return () => sub.remove();
  }, []);
}
```

#### Flutter

```dart
// pubspec.yaml: add app_links or uni_links package

import 'package:app_links/app_links.dart';

class DriveCallbackHandler {
  final _appLinks = AppLinks();

  void init() {
    _appLinks.uriLinkStream.listen((uri) {
      if (uri.scheme == 'lk.suraksha.lms' && uri.host == 'drive-callback') {
        final driveConnected = uri.queryParameters['drive_connected'];
        final googleEmail    = uri.queryParameters['google_email'];
        final error          = uri.queryParameters['error'];

        if (driveConnected == 'true') {
          showSuccessSnackbar('Google Drive connected: $googleEmail');
          context.read<ProfileCubit>().refresh();
        } else {
          showErrorSnackbar(error ?? 'Failed to connect Google Drive');
        }
      }
    });
  }
}
```

---

## Step 3 — Check / Display Connection Status

**Endpoint:** `GET /drive-access/status`

**Auth:** `Authorization: Bearer <jwt>`

```typescript
// Returns:
{
  "isConnected": true,
  "googleEmail": "teacher@gmail.com",
  "googleDisplayName": "Kasun Perera",
  "connectedAt": "2026-03-16T08:00:00Z"
}
```

Use this on page load to show "Connected as teacher@gmail.com" or a "Connect Google Drive" button.

---

## Step 4 — Disconnect

**Endpoint:** `DELETE /drive-access/disconnect`

**Auth:** `Authorization: Bearer <jwt>`

```typescript
async function disconnectGoogleDrive(jwt: string) {
  await fetch('/drive-access/disconnect', {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${jwt}` },
  });
  // update UI
}
```

---

## Complete Web UI Example (React)

```tsx
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

interface DriveStatus {
  isConnected: boolean;
  googleEmail?: string;
  googleDisplayName?: string;
}

export function DriveConnectionCard({ jwt }: { jwt: string }) {
  const [status, setStatus] = useState<DriveStatus>({ isConnected: false });
  const [searchParams] = useSearchParams();

  useEffect(() => {
    // Handle callback redirect
    const driveConnected = searchParams.get('drive_connected');
    if (driveConnected === 'true') {
      showToast(`Google Drive connected!`);
      window.history.replaceState({}, '', '/profile?tab=apps');
    } else if (driveConnected === 'false') {
      showToast(searchParams.get('error') || 'Connection failed', 'error');
      window.history.replaceState({}, '', '/profile?tab=apps');
    }

    // Load current status
    fetch('/drive-access/status', { headers: { Authorization: `Bearer ${jwt}` } })
      .then((r) => r.json())
      .then(setStatus);
  }, []);

  async function connect() {
    const res = await fetch(
      `/drive-access/connect?platform=web&returnUrl=${encodeURIComponent('/profile?tab=apps')}`,
      { headers: { Authorization: `Bearer ${jwt}` } },
    );
    const { authUrl } = await res.json();
    window.location.href = authUrl;
  }

  async function disconnect() {
    await fetch('/drive-access/disconnect', {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${jwt}` },
    });
    setStatus({ isConnected: false });
  }

  if (status.isConnected) {
    return (
      <div>
        <p>Connected as <strong>{status.googleEmail}</strong></p>
        <button onClick={disconnect}>Disconnect</button>
      </div>
    );
  }

  return <button onClick={connect}>Connect Google Drive</button>;
}
```

---

## Error Handling

| `error` query param value | Meaning | UX action |
|--------------------------|---------|-----------|
| `Google Drive access was denied` | User clicked "Deny" on consent screen | Show info message, offer to retry |
| `Google OAuth error: access_denied` | Same via raw OAuth error | Same |
| `Invalid state parameter` | CSRF or tampered link | Show generic error, do not retry automatically |
| `Failed to connect Google Drive` | Server error | Show error, allow manual retry |

---

## Environment Summary

| Item | Value |
|------|-------|
| API base | `https://lmsapi.suraksha.lk` |
| Web frontend | `https://lms.suraksha.lk` |
| Post-connect page | `/profile?tab=apps` |
| Mobile deep-link scheme | `lk.suraksha.lms` |
| Mobile deep-link host | `drive-callback` |
| Full mobile deep-link | `lk.suraksha.lms://drive-callback` |

---

## Gmail OAuth (same flow)

If the app also connects Gmail, the connect endpoint is the same but uses a different scope internally. Pass `platform` the same way — the callback deep-link and redirect logic is identical.
