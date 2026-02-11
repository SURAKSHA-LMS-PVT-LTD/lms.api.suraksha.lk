# SSO (Single Sign-On) — Frontend Implementation Guide

> **ZERO unnecessary API calls.** Frontend checks token expiry locally using JWT `exp` claim.  
> Only calls refresh API when access token is actually expired. Students never see login page mid-session.

---

## Architecture Overview

```
LOGIN → Store tokens + expires_in → Use access_token for APIs
                                          ↓
                                   On every API call:
                                   Check exp locally (no API)
                                          ↓
                              ┌─── Token valid? → Make API call
                              │
                              └─── Token expired?
                                          ↓
                                   Call REFRESH endpoint
                                          ↓
                              ┌─── Success? → Update stored tokens → Retry original API
                              │
                              └─── 401? → Redirect to login (refresh token also expired)
```

**DB queries saved per user per hour:** ~10 queries eliminated (no validate/session-status endpoints).

---

## SECTION 1: API Endpoints

### 1.1 Web Login

```
POST /v2/auth/login
Content-Type: application/json
```

**Request:**
```json
{
  "identifier": "user@example.com",
  "password": "MyPassword123!",
  "rememberMe": true
}
```

`identifier` accepts: email, phone (`+94771234567`, `0771234567`, `771234567`), system ID (6-digit like `500423`), or birth certificate number.

**Response (200):**
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIs...",
  "refresh_token": "eyJhbGciOiJIUzI1NiIs...",
  "expires_in": 86400,
  "refresh_expires_in": 604800,
  "payload": {
    "s": "12345",
    "u": 2,
    "t": 1739366400,
    "i": [{ "i": "101", "r": 2, "c": [["1000", 6]] }],
    "c": ["67890"]
  },
  "user": {
    "id": "12345",
    "email": "user@example.com",
    "nameWithInitials": "J. Doe",
    "userType": "USER",
    "imageUrl": "https://storage.googleapis.com/..."
  }
}
```

**Response also sets httpOnly cookie** `refresh_token` (browser-only, auto-sent on refresh calls).

**Key fields to store:**
| Field | Store Where | Purpose |
|-------|------------|---------|
| `access_token` | Memory / SecureStorage | Auth header for all API calls |
| `refresh_token` | SecureStorage (mobile) / Cookie auto (web) | Used to get new access_token |
| `expires_in` | Memory | Seconds until access_token expires (86400 = 24h) |
| `refresh_expires_in` | Memory | Seconds until refresh_token expires (604800 = 7d, 2592000 = 30d with rememberMe) |
| `user` | Memory/State | Display user info |
| `payload` | Memory | JWT claims (institute access, children, etc.) |

**Errors:**
- `401` — Invalid credentials
- `429` — Too many attempts (5 per 15min). Retry after 15 minutes.

---

### 1.2 Mobile Login

```
POST /v2/auth/login/mobile
Content-Type: application/json
```

**Request:**
```json
{
  "identifier": "user@example.com",
  "password": "MyPassword123!",
  "deviceId": "android_1739366400000_abc123xyz",
  "platform": "android",
  "deviceName": "Samsung Galaxy S24",
  "rememberMe": true
}
```

| Field | Required | Description |
|-------|----------|-------------|
| `identifier` | Yes | Email, phone, system ID, or birth certificate |
| `password` | Yes | User password |
| `deviceId` | Yes | Unique device identifier (format: `platform_timestamp_uuid`) |
| `platform` | No | `android` or `ios` (defaults to `android`) |
| `deviceName` | No | Human-readable device name |
| `rememberMe` | No | `true` = 30-day refresh token, `false` = 7-day (default) |

**Response (200):** Same structure as web login. **No cookie is set** — tokens only in response body.

**Errors:**
- `401` — Invalid credentials
- `400` — Missing required fields (deviceId)
- `429` — Too many attempts (5 per 15min)

---

### 1.3 Web Token Refresh

```
POST /v2/auth/refresh
Content-Type: application/json
```

**Request (option A — cookie auto-sent by browser):**
```json
{}
```

**Request (option B — body):**
```json
{
  "refresh_token": "eyJhbGciOiJIUzI1NiIs..."
}
```

Cookie takes priority. If cookie present, body is ignored.

**Response (200):**
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIs...(NEW)",
  "refresh_token": "eyJhbGciOiJIUzI1NiIs...(NEW)",
  "expires_in": 86400,
  "refresh_expires_in": 604800,
  "user": {
    "id": "12345",
    "email": "user@example.com",
    "nameWithInitials": "J. Doe",
    "userType": "USER",
    "imageUrl": "https://storage.googleapis.com/..."
  }
}
```

**IMPORTANT:** After refresh, the old refresh_token is **revoked**. You MUST store the new `refresh_token`. The response also updates the httpOnly cookie for browsers.

**Errors:**
- `401` — Refresh token invalid/expired/revoked → **Redirect to login**
- `429` — Too many refresh attempts (10 per minute)

---

### 1.4 Mobile Token Refresh

```
POST /auth/refresh/mobile
Content-Type: application/json
```

**Request:**
```json
{
  "refresh_token": "eyJhbGciOiJIUzI1NiIs...",
  "deviceId": "android_1739366400000_abc123xyz"
}
```

Both fields required. `deviceId` must match the one used during login.

**Response (200):**
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIs...(NEW)",
  "refresh_token": "eyJhbGciOiJIUzI1NiIs...(NEW)",
  "expires_in": 86400,
  "refresh_expires_in": 604800,
  "user": {
    "id": "12345",
    "email": "user@example.com",
    "nameWithInitials": "J. Doe",
    "userType": "USER",
    "imageUrl": "https://storage.googleapis.com/..."
  }
}
```

**Errors:**
- `401` — Invalid/expired/revoked token OR device mismatch → **Redirect to login**
- `400` — Missing fields
- `429` — Too many attempts (10 per minute)

---

### 1.5 Web Logout

```
POST /auth/logout
```

Reads refresh_token from cookie, revokes it, clears cookie.

**Response:** `{ "success": true, "message": "Logged out successfully" }`

---

### 1.6 Mobile Logout

```
POST /auth/logout/mobile
Content-Type: application/json
```

**Request:**
```json
{
  "refresh_token": "eyJhbGciOiJIUzI1NiIs...",
  "deviceId": "android_1739366400000_abc123xyz"
}
```

**Response:** `{ "success": true, "message": "Logged out successfully" }`

---

### 1.7 Get Current User

```
GET /auth/me
Authorization: Bearer <access_token>
```

**Response (200):**
```json
{
  "success": true,
  "data": {
    "id": "12345",
    "firstName": "John",
    "lastName": "Doe",
    "nameWithInitials": "J. Doe",
    "email": "john.doe@example.com",
    "phoneNumber": "+94771234567",
    "userType": "USER",
    "imageUrl": "https://storage.googleapis.com/...",
    "createdAt": "2024-01-01T00:00:00.000Z",
    "updatedAt": "2024-11-22T00:00:00.000Z"
  }
}
```

---

### 1.8 Session Management

**Get active sessions:**
```
GET /auth/sessions?page=1&limit=10&platform=web&sortBy=createdAt&sortOrder=DESC
Authorization: Bearer <access_token>
```

**Revoke specific session:**
```
POST /auth/sessions/revoke/<sessionId>
Authorization: Bearer <access_token>
```

**Revoke all sessions (logout everywhere):**
```
POST /auth/sessions/revoke-all
Authorization: Bearer <access_token>
```

---

### 1.9 Password Reset (Public)

**Step 1 — Request OTP:**
```
POST /auth/forgot-password
{ "identifier": "user@example.com" }
```

**Step 2 — Reset with OTP:**
```
POST /auth/reset-password
{
  "identifier": "user@example.com",
  "otp": "123456",
  "newPassword": "NewPass123!",
  "confirmPassword": "NewPass123!"
}
```

### 1.10 Change Password (Authenticated)

```
POST /auth/change-password-authenticated
Authorization: Bearer <access_token>
{
  "currentPassword": "OldPass123!",
  "newPassword": "NewPass123!",
  "confirmPassword": "NewPass123!"
}
```

> After password change, ALL sessions are revoked. User must login again on all devices.

---

## SECTION 2: SSO Implementation — The Core Logic

### How It Works (ZERO unnecessary API calls)

```
┌─────────────────────────────────────────────────────┐
│                   FRONTEND LOGIC                     │
│                                                      │
│  1. Login → Store access_token + expires_in          │
│  2. Calculate: token_expiry_time = now + expires_in  │
│  3. On EVERY API call:                               │
│     → Check: is Date.now() < token_expiry_time?      │
│     → YES: Use access_token as-is (no API call!)     │
│     → NO:  Call refresh endpoint FIRST               │
│            then retry the original API call           │
│  4. On 401 from any API: Call refresh                 │
│     → Refresh succeeds: Retry original call           │
│     → Refresh fails (401): Go to login page           │
└─────────────────────────────────────────────────────┘
```

### Token Timeline

```
Login                    18h mark              24h mark        7d/30d mark
  |                         |                     |                |
  |--- access_token valid --|-- should refresh ---|-- EXPIRED -----|
  |                         |  (optional early    |                |
  |                         |   refresh zone)     |                |
  |                         |                     |                |
  |---------- refresh_token valid (7d or 30d) ----|--- EXPIRED ----|
```

- **Access token:** 24 hours (`expires_in: 86400`)
- **Refresh token:** 7 days (or 30 days with `rememberMe: true`)
- **Recommended refresh timing:** When access token has <25% TTL left (i.e., after 18 hours), OR on 401

---

## SECTION 3: Web Frontend Implementation (React/Next.js)

### 3.1 Auth Storage Utility

```typescript
// lib/auth-storage.ts

interface AuthTokens {
  access_token: string;
  refresh_token: string;  // Also in httpOnly cookie for web
  expires_in: number;     // seconds
  refresh_expires_in: number;
  token_expiry_time: number; // timestamp ms (calculated on store)
  user: {
    id: string;
    email: string;
    nameWithInitials: string;
    userType: string;
    imageUrl?: string;
  };
}

const AUTH_KEY = 'auth_tokens';

export function storeAuth(loginResponse: any): void {
  const tokens: AuthTokens = {
    access_token: loginResponse.access_token,
    refresh_token: loginResponse.refresh_token,
    expires_in: loginResponse.expires_in,
    refresh_expires_in: loginResponse.refresh_expires_in,
    // Calculate absolute expiry time (with 60s safety buffer)
    token_expiry_time: Date.now() + (loginResponse.expires_in - 60) * 1000,
    user: loginResponse.user,
  };
  localStorage.setItem(AUTH_KEY, JSON.stringify(tokens));
}

export function getAuth(): AuthTokens | null {
  const raw = localStorage.getItem(AUTH_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function isAccessTokenExpired(): boolean {
  const auth = getAuth();
  if (!auth) return true;
  // Check locally — NO API call
  return Date.now() >= auth.token_expiry_time;
}

export function clearAuth(): void {
  localStorage.removeItem(AUTH_KEY);
}
```

### 3.2 Axios Interceptor (Auto-Refresh)

```typescript
// lib/api-client.ts
import axios from 'axios';
import { getAuth, storeAuth, isAccessTokenExpired, clearAuth } from './auth-storage';

const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL,
  withCredentials: true, // Send httpOnly cookies
});

let isRefreshing = false;
let failedQueue: Array<{
  resolve: (token: string) => void;
  reject: (error: any) => void;
}> = [];

function processQueue(error: any, token: string | null) {
  failedQueue.forEach(({ resolve, reject }) => {
    error ? reject(error) : resolve(token!);
  });
  failedQueue = [];
}

// REQUEST interceptor — check token expiry LOCALLY before every request
api.interceptors.request.use(async (config) => {
  // Skip auth for login/refresh/public endpoints
  const publicPaths = ['/v2/auth/login', '/v2/auth/refresh', '/auth/forgot-password', '/auth/reset-password'];
  if (publicPaths.some(p => config.url?.includes(p))) return config;

  const auth = getAuth();
  if (!auth) return config;

  // LOCAL CHECK — no API call
  if (isAccessTokenExpired()) {
    // Token expired → refresh before making the request
    if (!isRefreshing) {
      isRefreshing = true;
      try {
        const refreshRes = await axios.post(
          `${process.env.NEXT_PUBLIC_API_URL}/v2/auth/refresh`,
          { refresh_token: auth.refresh_token },
          { withCredentials: true }
        );
        storeAuth(refreshRes.data);
        processQueue(null, refreshRes.data.access_token);
        config.headers.Authorization = `Bearer ${refreshRes.data.access_token}`;
      } catch (err) {
        processQueue(err, null);
        clearAuth();
        window.location.href = '/login';
        return Promise.reject(err);
      } finally {
        isRefreshing = false;
      }
    } else {
      // Another request is already refreshing — wait for it
      return new Promise((resolve, reject) => {
        failedQueue.push({
          resolve: (token) => {
            config.headers.Authorization = `Bearer ${token}`;
            resolve(config);
          },
          reject,
        });
      });
    }
  } else {
    config.headers.Authorization = `Bearer ${auth.access_token}`;
  }

  return config;
});

// RESPONSE interceptor — handle unexpected 401 (e.g., token revoked server-side)
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;

      if (!isRefreshing) {
        isRefreshing = true;
        const auth = getAuth();

        try {
          const refreshRes = await axios.post(
            `${process.env.NEXT_PUBLIC_API_URL}/v2/auth/refresh`,
            { refresh_token: auth?.refresh_token },
            { withCredentials: true }
          );
          storeAuth(refreshRes.data);
          processQueue(null, refreshRes.data.access_token);
          originalRequest.headers.Authorization = `Bearer ${refreshRes.data.access_token}`;
          return api(originalRequest);
        } catch (refreshErr) {
          processQueue(refreshErr, null);
          clearAuth();
          window.location.href = '/login';
          return Promise.reject(refreshErr);
        } finally {
          isRefreshing = false;
        }
      }

      return new Promise((resolve, reject) => {
        failedQueue.push({
          resolve: (token) => {
            originalRequest.headers.Authorization = `Bearer ${token}`;
            resolve(api(originalRequest));
          },
          reject,
        });
      });
    }

    return Promise.reject(error);
  }
);

export default api;
```

### 3.3 Login Page

```typescript
// pages/login.tsx
import api from '@/lib/api-client';
import { storeAuth } from '@/lib/auth-storage';

async function handleLogin(identifier: string, password: string, rememberMe: boolean) {
  try {
    const res = await api.post('/v2/auth/login', {
      identifier,
      password,
      rememberMe,
    });

    // Store tokens + expiry
    storeAuth(res.data);

    // Navigate to dashboard
    router.push('/dashboard');
  } catch (err) {
    if (err.response?.status === 401) {
      setError('Invalid credentials');
    } else if (err.response?.status === 429) {
      setError('Too many attempts. Try again in 15 minutes.');
    }
  }
}
```

### 3.4 Logout

```typescript
import { clearAuth } from '@/lib/auth-storage';

async function handleLogout() {
  try {
    await api.post('/auth/logout');
  } catch {} // ignore errors
  clearAuth();
  window.location.href = '/login';
}
```

---

## SECTION 4: Mobile Implementation (React Native / Flutter)

### 4.1 React Native — Auth Storage

```typescript
// auth-storage.ts (React Native)
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const DEVICE_ID_KEY = 'device_id';
const AUTH_KEY = 'auth_tokens';

// Generate or retrieve persistent device ID
export async function getDeviceId(): Promise<string> {
  let deviceId = await SecureStore.getItemAsync(DEVICE_ID_KEY);
  if (!deviceId) {
    const platform = Platform.OS; // 'android' or 'ios'
    deviceId = `${platform}_${Date.now()}_${Math.random().toString(36).substr(2, 12)}`;
    await SecureStore.setItemAsync(DEVICE_ID_KEY, deviceId);
  }
  return deviceId;
}

export async function storeAuth(loginResponse: any): Promise<void> {
  const data = {
    ...loginResponse,
    token_expiry_time: Date.now() + (loginResponse.expires_in - 60) * 1000,
  };
  await SecureStore.setItemAsync(AUTH_KEY, JSON.stringify(data));
}

export async function getAuth(): Promise<any | null> {
  const raw = await SecureStore.getItemAsync(AUTH_KEY);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

export async function isAccessTokenExpired(): Promise<boolean> {
  const auth = await getAuth();
  if (!auth) return true;
  return Date.now() >= auth.token_expiry_time;
}

export async function clearAuth(): Promise<void> {
  await SecureStore.deleteItemAsync(AUTH_KEY);
}
```

### 4.2 React Native — API Client with Auto-Refresh

```typescript
// api-client.ts (React Native)
import axios from 'axios';
import { getAuth, storeAuth, isAccessTokenExpired, clearAuth, getDeviceId } from './auth-storage';
import { navigate } from './navigation'; // your navigation ref

const api = axios.create({ baseURL: 'https://your-api.com' });

let isRefreshing = false;
let failedQueue: any[] = [];

function processQueue(error: any, token: string | null) {
  failedQueue.forEach(({ resolve, reject }) => error ? reject(error) : resolve(token!));
  failedQueue = [];
}

// REQUEST interceptor
api.interceptors.request.use(async (config) => {
  const publicPaths = ['/v2/auth/login/mobile', '/auth/refresh/mobile', '/auth/forgot-password'];
  if (publicPaths.some(p => config.url?.includes(p))) return config;

  const auth = await getAuth();
  if (!auth) return config;

  // LOCAL CHECK — zero API calls
  if (await isAccessTokenExpired()) {
    if (!isRefreshing) {
      isRefreshing = true;
      try {
        const deviceId = await getDeviceId();
        const refreshRes = await axios.post(`https://your-api.com/auth/refresh/mobile`, {
          refresh_token: auth.refresh_token,
          deviceId,
        });
        await storeAuth(refreshRes.data);
        processQueue(null, refreshRes.data.access_token);
        config.headers.Authorization = `Bearer ${refreshRes.data.access_token}`;
      } catch (err) {
        processQueue(err, null);
        await clearAuth();
        navigate('Login');
        return Promise.reject(err);
      } finally {
        isRefreshing = false;
      }
    } else {
      return new Promise((resolve, reject) => {
        failedQueue.push({
          resolve: (token: string) => {
            config.headers.Authorization = `Bearer ${token}`;
            resolve(config);
          },
          reject,
        });
      });
    }
  } else {
    config.headers.Authorization = `Bearer ${auth.access_token}`;
  }
  return config;
});

// RESPONSE interceptor — handle unexpected 401
api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config;
    if (error.response?.status === 401 && !original._retry) {
      original._retry = true;
      if (!isRefreshing) {
        isRefreshing = true;
        const auth = await getAuth();
        try {
          const deviceId = await getDeviceId();
          const refreshRes = await axios.post(`https://your-api.com/auth/refresh/mobile`, {
            refresh_token: auth?.refresh_token,
            deviceId,
          });
          await storeAuth(refreshRes.data);
          processQueue(null, refreshRes.data.access_token);
          original.headers.Authorization = `Bearer ${refreshRes.data.access_token}`;
          return api(original);
        } catch (refreshErr) {
          processQueue(refreshErr, null);
          await clearAuth();
          navigate('Login');
          return Promise.reject(refreshErr);
        } finally {
          isRefreshing = false;
        }
      }
      return new Promise((resolve, reject) => {
        failedQueue.push({
          resolve: (token: string) => {
            original.headers.Authorization = `Bearer ${token}`;
            resolve(api(original));
          },
          reject,
        });
      });
    }
    return Promise.reject(error);
  }
);

export default api;
```

### 4.3 React Native — Login

```typescript
import api from './api-client';
import { storeAuth, getDeviceId } from './auth-storage';

async function handleMobileLogin(identifier: string, password: string) {
  const deviceId = await getDeviceId();

  const res = await api.post('/v2/auth/login/mobile', {
    identifier,
    password,
    deviceId,
    platform: Platform.OS, // 'android' or 'ios'
    deviceName: `${Device.brand} ${Device.modelName}`,
    rememberMe: true, // Always true for mobile = 30 day refresh token
  });

  await storeAuth(res.data);
  navigate('Dashboard');
}
```

### 4.4 React Native — App Resume Handler

```typescript
// App.tsx — handle app coming to foreground
import { AppState } from 'react-native';
import { isAccessTokenExpired, getAuth, storeAuth, clearAuth, getDeviceId } from './auth-storage';

useEffect(() => {
  const sub = AppState.addEventListener('change', async (nextState) => {
    if (nextState === 'active') {
      // App came to foreground — check token locally (NO API call)
      if (await isAccessTokenExpired()) {
        const auth = await getAuth();
        if (auth?.refresh_token) {
          try {
            const deviceId = await getDeviceId();
            const res = await axios.post('https://your-api.com/auth/refresh/mobile', {
              refresh_token: auth.refresh_token,
              deviceId,
            });
            await storeAuth(res.data);
            // Session restored silently — user sees nothing
          } catch {
            await clearAuth();
            navigate('Login');
          }
        } else {
          navigate('Login');
        }
      }
      // Token still valid — do nothing (zero API calls!)
    }
  });
  return () => sub.remove();
}, []);
```

### 4.5 Mobile Logout

```typescript
import { clearAuth, getAuth, getDeviceId } from './auth-storage';

async function handleMobileLogout() {
  const auth = await getAuth();
  const deviceId = await getDeviceId();
  try {
    await api.post('/auth/logout/mobile', {
      refresh_token: auth?.refresh_token,
      deviceId,
    });
  } catch {} // ignore errors
  await clearAuth();
  navigate('Login');
}
```

---

## SECTION 5: Flutter Implementation

### 5.1 Auth Storage

```dart
// auth_storage.dart
import 'dart:convert';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'dart:io' show Platform;

class AuthStorage {
  static const _storage = FlutterSecureStorage();
  static const _authKey = 'auth_tokens';
  static const _deviceIdKey = 'device_id';

  static Future<String> getDeviceId() async {
    String? deviceId = await _storage.read(key: _deviceIdKey);
    if (deviceId == null) {
      final platform = Platform.isIOS ? 'ios' : 'android';
      deviceId = '${platform}_${DateTime.now().millisecondsSinceEpoch}_${_randomString(12)}';
      await _storage.write(key: _deviceIdKey, value: deviceId);
    }
    return deviceId;
  }

  static Future<void> storeAuth(Map<String, dynamic> response) async {
    response['token_expiry_time'] =
        DateTime.now().millisecondsSinceEpoch + ((response['expires_in'] - 60) * 1000);
    await _storage.write(key: _authKey, value: jsonEncode(response));
  }

  static Future<Map<String, dynamic>?> getAuth() async {
    final raw = await _storage.read(key: _authKey);
    if (raw == null) return null;
    return jsonDecode(raw);
  }

  static Future<bool> isAccessTokenExpired() async {
    final auth = await getAuth();
    if (auth == null) return true;
    return DateTime.now().millisecondsSinceEpoch >= auth['token_expiry_time'];
  }

  static Future<void> clearAuth() async {
    await _storage.delete(key: _authKey);
  }

  static String _randomString(int length) {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    return List.generate(length, (_) => chars[(DateTime.now().microsecond % chars.length)]).join();
  }
}
```

### 5.2 Dio Interceptor

```dart
// api_client.dart
import 'package:dio/dio.dart';
import 'auth_storage.dart';

class AuthInterceptor extends Interceptor {
  final Dio _dio;
  bool _isRefreshing = false;
  final List<_QueueItem> _queue = [];

  AuthInterceptor(this._dio);

  @override
  void onRequest(RequestOptions options, RequestInterceptorHandler handler) async {
    final publicPaths = ['/v2/auth/login/mobile', '/auth/refresh/mobile'];
    if (publicPaths.any((p) => options.path.contains(p))) {
      return handler.next(options);
    }

    final auth = await AuthStorage.getAuth();
    if (auth == null) return handler.next(options);

    // LOCAL CHECK — zero API calls
    if (await AuthStorage.isAccessTokenExpired()) {
      if (!_isRefreshing) {
        _isRefreshing = true;
        try {
          final deviceId = await AuthStorage.getDeviceId();
          final res = await Dio().post('https://your-api.com/auth/refresh/mobile', data: {
            'refresh_token': auth['refresh_token'],
            'deviceId': deviceId,
          });
          await AuthStorage.storeAuth(res.data);
          _processQueue(null, res.data['access_token']);
          options.headers['Authorization'] = 'Bearer ${res.data['access_token']}';
        } catch (e) {
          _processQueue(e, null);
          await AuthStorage.clearAuth();
          // Navigate to login
          return handler.reject(DioException(requestOptions: options));
        } finally {
          _isRefreshing = false;
        }
      } else {
        // Wait for ongoing refresh
        return handler.next(options); // will be caught by response interceptor
      }
    } else {
      options.headers['Authorization'] = 'Bearer ${auth['access_token']}';
    }
    handler.next(options);
  }

  @override
  void onError(DioException err, ErrorInterceptorHandler handler) async {
    if (err.response?.statusCode == 401 && !(err.requestOptions.extra['_retry'] == true)) {
      err.requestOptions.extra['_retry'] = true;
      final auth = await AuthStorage.getAuth();
      try {
        final deviceId = await AuthStorage.getDeviceId();
        final res = await Dio().post('https://your-api.com/auth/refresh/mobile', data: {
          'refresh_token': auth?['refresh_token'],
          'deviceId': deviceId,
        });
        await AuthStorage.storeAuth(res.data);
        err.requestOptions.headers['Authorization'] = 'Bearer ${res.data['access_token']}';
        final retryRes = await _dio.fetch(err.requestOptions);
        return handler.resolve(retryRes);
      } catch (e) {
        await AuthStorage.clearAuth();
        // Navigate to login
      }
    }
    handler.next(err);
  }

  void _processQueue(dynamic error, String? token) {
    for (final item in _queue) {
      error != null ? item.completer.completeError(error) : item.completer.complete(token);
    }
    _queue.clear();
  }
}
```

---

## SECTION 6: JWT Payload Decoding (Optional — for UI)

The frontend may want to decode the JWT payload **locally** (without verification) to read user roles, institute access, etc. This is for display only — the server validates on every request.

```typescript
// jwt-utils.ts
export function decodeJwtPayload(token: string): any {
  try {
    const base64Url = token.split('.')[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const json = decodeURIComponent(
      atob(base64).split('').map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)).join('')
    );
    return JSON.parse(json);
  } catch {
    return null;
  }
}

// Usage:
const payload = decodeJwtPayload(access_token);
// payload.s  → user ID
// payload.u  → user type (0=SuperAdmin, 1=OrgManager, 2=User, 3=UserWithoutParent, 4=UserWithoutStudent)
// payload.t  → issued timestamp
// payload.i  → institute access array (or 999999 for global)
// payload.c  → children IDs array (for parents)
// payload.exp → expiry timestamp (UNIX seconds)
// payload.iat → issued at timestamp (UNIX seconds)
```

**Get token expiry locally:**
```typescript
function getTokenExpiryMs(token: string): number {
  const payload = decodeJwtPayload(token);
  return payload?.exp ? payload.exp * 1000 : 0;
}

function isTokenExpired(token: string): boolean {
  return Date.now() >= getTokenExpiryMs(token);
}
```

---

## SECTION 7: Quick Reference

### Endpoint Summary

| # | Method | Path | Auth | Platform | Purpose |
|---|--------|------|------|----------|---------|
| 1 | POST | `/v2/auth/login` | Public | Web | Login (returns tokens + cookie) |
| 2 | POST | `/v2/auth/login/mobile` | Public | Mobile | Login (returns tokens in body) |
| 3 | POST | `/v2/auth/refresh` | Public | Web | Refresh tokens (cookie or body) |
| 4 | POST | `/auth/refresh/mobile` | Public | Mobile | Refresh tokens (body + deviceId) |
| 5 | POST | `/auth/logout` | Public | Web | Logout (revoke cookie) |
| 6 | POST | `/auth/logout/mobile` | Public | Mobile | Logout (revoke by device) |
| 7 | GET | `/auth/me` | JWT | Both | Get current user profile |
| 8 | GET | `/auth/sessions` | JWT | Both | List active sessions |
| 9 | POST | `/auth/sessions/revoke/:id` | JWT | Both | Revoke specific session |
| 10 | POST | `/auth/sessions/revoke-all` | JWT | Both | Logout everywhere |
| 11 | POST | `/auth/forgot-password` | Public | Both | Send OTP for reset |
| 12 | POST | `/auth/reset-password` | Public | Both | Reset password with OTP |
| 13 | POST | `/auth/change-password-authenticated` | JWT | Both | Change password |

### Token Expiry

| Token | TTL | With rememberMe |
|-------|-----|-----------------|
| Access token | 24 hours | 24 hours (same) |
| Refresh token | 7 days | 30 days |

### Decision Tree — "What should frontend do?"

```
App starts / page loads / app resumes
    │
    ├── Has stored tokens?
    │   ├── NO → Go to login page
    │   └── YES
    │       ├── Is access_token expired? (LOCAL check: Date.now() >= token_expiry_time)
    │       │   ├── NO → Use access_token as-is ✅ (ZERO API calls)
    │       │   └── YES → Call refresh endpoint
    │       │       ├── Success → Store new tokens, continue ✅
    │       │       └── 401 → Go to login page ❌
    │       │
    │       └── API call returns 401? (unexpected — server revoked token)
    │           ├── Call refresh endpoint
    │           │   ├── Success → Retry original API call ✅
    │           │   └── 401 → Go to login page ❌
    │           └── Done
    │
    └── Done
```

### Error Handling Quick Guide

| HTTP Status | Meaning | Frontend Action |
|-------------|---------|-----------------|
| 200 | Success | Process response |
| 400 | Bad request / Validation | Show field errors |
| 401 | Unauthorized | Try refresh → if fails, go to login |
| 403 | Forbidden (no access) | Show "no permission" message |
| 429 | Rate limited | Show "too many attempts, wait X minutes" |
| 500 | Server error | Show "something went wrong" |

### SSO Cost Analysis

| Approach | API calls per hour per user |
|----------|---------------------------|
| ❌ Old (validate + session-status) | ~12 calls/hour |
| ✅ New (local TTL check) | **0 calls** until token expires, then **1 refresh call per 24h** |

---

## SECTION 8: Common Mistakes to Avoid

1. **DON'T** store access_token in cookies on mobile — use SecureStore/Keychain
2. **DON'T** call any API to check if token is valid — decode `exp` locally
3. **DON'T** forget to update BOTH access_token AND refresh_token after refresh
4. **DON'T** retry refresh if refresh itself returns 401 — go to login
5. **DON'T** queue multiple refresh calls — use a mutex/flag pattern
6. **DO** subtract 60 seconds from `expires_in` as safety buffer
7. **DO** handle concurrent requests during refresh (queue pattern above)
8. **DO** set `rememberMe: true` on mobile for 30-day refresh tokens
9. **DO** persist `deviceId` between app installs (SecureStore)
10. **DO** clear all tokens on logout
