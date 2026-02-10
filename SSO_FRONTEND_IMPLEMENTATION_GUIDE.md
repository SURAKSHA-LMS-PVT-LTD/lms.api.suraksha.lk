# SSO (Single Sign-On) Frontend Implementation Guide

> **Updated:** February 2026  
> **Backend Version:** LMS API v2  
> **Applies to:** React/Next.js (Web) and React Native / Flutter (Mobile)

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [API Endpoints Reference](#2-api-endpoints-reference)
3. [Web Frontend Implementation](#3-web-frontend-implementation)
4. [Mobile App Implementation](#4-mobile-app-implementation)
5. [Token Lifecycle & Auto-Refresh](#5-token-lifecycle--auto-refresh)
6. [Session Management UI](#6-session-management-ui)
7. [Error Handling](#7-error-handling)
8. [Security Best Practices](#8-security-best-practices)

---

## 1. Architecture Overview

### How SSO Works in This System

```
User Login (once)
    │
    ▼
┌─────────────────────────────────┐
│  POST /v2/auth/login            │
│  Body: { identifier, password,  │
│          rememberMe: true }     │
└───────────┬─────────────────────┘
            │
            ▼
┌─────────────────────────────────────────────────┐
│  Response:                                       │
│  {                                               │
│    access_token: "..." (1h expiry),              │
│    refresh_token: "..." (7d or 30d if remember), │
│    expires_in: 3600,                             │
│    refresh_expires_in: 604800 (or 2592000),      │
│    user: { id, email, userType, ... }            │
│  }                                               │
│                                                  │
│  + Set-Cookie: refresh_token (httpOnly, secure)  │
└───────────┬─────────────────────────────────────┘
            │
            ▼
  ┌─────────────────────────┐
  │  Store access_token in  │
  │  memory (NOT localStorage)│
  │                         │
  │  refresh_token is auto- │
  │  managed via httpOnly   │
  │  cookie (web) or stored │
  │  in secure storage      │
  │  (mobile)               │
  └───────────┬─────────────┘
              │
    Every API call: Authorization: Bearer <access_token>
              │
              ▼
    Access token expired? (401 response)
              │
              ▼
  ┌──────────────────────────────────────┐
  │  POST /v2/auth/refresh               │
  │  (cookie auto-sent or body)          │
  │  → New access_token + refresh_token  │
  │  → Old refresh_token is revoked      │
  └──────────────────────────────────────┘
              │
              ▼
    User stays logged in for 7-30 days
    without re-entering credentials!
```

### Token Expiry Summary

| Token | Default Expiry | With `rememberMe: true` |
|-------|---------------|------------------------|
| Access Token | 1 hour | 1 hour (unchanged) |
| Refresh Token | 7 days | **30 days** |
| Cookie `refresh_token` | 7 days | **30 days** |

### Key Principles

- **Access token** = short-lived, stored in memory only
- **Refresh token** = long-lived, stored in httpOnly cookie (web) or secure storage (mobile)
- **Token rotation** = each refresh generates a NEW refresh token (old one is revoked)
- **Multi-device** = users can be logged in on multiple devices simultaneously
- **`rememberMe`** = extends refresh token from 7 days to 30 days

---

## 2. API Endpoints Reference

### Authentication

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/v2/auth/login` | Public | Web login (returns both cookie + body) |
| POST | `/v2/auth/login/mobile` | Public | Mobile login (body only, requires deviceId) |
| POST | `/v2/auth/refresh` | Public | Refresh token (accepts cookie OR body) |
| POST | `/auth/refresh/mobile` | Public | Mobile refresh (body + deviceId validation) |
| POST | `/auth/logout` | Public | Web logout (clears cookie) |
| POST | `/auth/logout/mobile` | Public | Mobile logout (revokes device token) |
| GET | `/auth/me` | JWT | Get current user profile |

### Session Management

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/auth/sessions` | JWT | Get all active sessions |
| POST | `/auth/sessions/revoke/:sessionId` | JWT | Revoke a specific session |
| POST | `/auth/sessions/revoke-all` | JWT | Revoke all sessions (log out everywhere) |

---

## 3. Web Frontend Implementation

### 3.1 Auth Service (TypeScript)

```typescript
// services/auth.service.ts

interface LoginRequest {
  identifier: string;      // email, phone, system ID, or birth certificate
  password: string;
  rememberMe?: boolean;    // true = 30 days session, false = 7 days
}

interface AuthResponse {
  access_token: string;
  refresh_token: string;    // Also set as httpOnly cookie
  expires_in: number;       // Access token TTL in seconds (e.g., 3600)
  refresh_expires_in: number; // Refresh token TTL in seconds (e.g., 604800 or 2592000)
  payload: {
    s: string;  // user ID
    u: number;  // user type (0=SA, 1=OM, 2=U, 3=UWP, 4=UWS)
    i?: any[];  // institute access
    c?: string[]; // children IDs (parent)
  };
  user: {
    id: string;
    email: string;
    nameWithInitials: string;
    userType: string;
    imageUrl?: string;
  };
}

interface RefreshResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  refresh_expires_in: number;
  user: {
    id: string;
    email: string;
    nameWithInitials: string;
    userType: string;
    imageUrl?: string;
  };
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

class AuthService {
  private accessToken: string | null = null;
  private tokenExpiresAt: number = 0;
  private refreshPromise: Promise<string> | null = null;

  /**
   * Login with identifier + password
   */
  async login(request: LoginRequest): Promise<AuthResponse> {
    const response = await fetch(`${API_BASE}/v2/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include', // IMPORTANT: sends/receives cookies
      body: JSON.stringify({
        identifier: request.identifier,
        password: request.password,
        rememberMe: request.rememberMe ?? false,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Login failed');
    }

    const data: AuthResponse = await response.json();
    
    // Store access token in memory (NOT localStorage!)
    this.setAccessToken(data.access_token, data.expires_in);
    
    return data;
  }

  /**
   * Refresh access token using httpOnly cookie
   * Uses a lock to prevent multiple concurrent refresh calls
   */
  async refreshToken(): Promise<string> {
    // Prevent concurrent refresh calls (race condition)
    if (this.refreshPromise) {
      return this.refreshPromise;
    }

    this.refreshPromise = this._doRefresh();
    
    try {
      const token = await this.refreshPromise;
      return token;
    } finally {
      this.refreshPromise = null;
    }
  }

  private async _doRefresh(): Promise<string> {
    const response = await fetch(`${API_BASE}/v2/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include', // Cookie is sent automatically
      body: JSON.stringify({}), // Empty body - token comes from cookie
    });

    if (!response.ok) {
      // Refresh failed - user must re-login
      this.clearAuth();
      throw new Error('Session expired. Please login again.');
    }

    const data: RefreshResponse = await response.json();
    this.setAccessToken(data.access_token, data.expires_in);
    
    return data.access_token;
  }

  /**
   * Logout - revoke refresh token and clear cookie
   */
  async logout(): Promise<void> {
    try {
      await fetch(`${API_BASE}/auth/logout`, {
        method: 'POST',
        credentials: 'include',
      });
    } finally {
      this.clearAuth();
    }
  }

  /**
   * Get current access token (refresh if expired)
   */
  async getAccessToken(): Promise<string | null> {
    if (this.accessToken && Date.now() < this.tokenExpiresAt) {
      return this.accessToken;
    }

    // Token expired or missing - try to refresh
    try {
      return await this.refreshToken();
    } catch {
      return null;
    }
  }

  /**
   * Check if user is likely authenticated
   * (cannot check httpOnly cookie directly - rely on memory token)
   */
  isAuthenticated(): boolean {
    return this.accessToken !== null;
  }

  private setAccessToken(token: string, expiresIn: number): void {
    this.accessToken = token;
    // Refresh 60 seconds BEFORE actual expiry to avoid edge cases
    this.tokenExpiresAt = Date.now() + (expiresIn - 60) * 1000;
  }

  private clearAuth(): void {
    this.accessToken = null;
    this.tokenExpiresAt = 0;
  }
}

export const authService = new AuthService();
```

### 3.2 Axios Interceptor (Auto-Refresh on 401)

```typescript
// lib/api-client.ts

import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';
import { authService } from '../services/auth.service';

const apiClient = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000',
  withCredentials: true, // Always send cookies
});

// Request interceptor: attach access token
apiClient.interceptors.request.use(async (config: InternalAxiosRequestConfig) => {
  const token = await authService.getAccessToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Response interceptor: auto-refresh on 401
let isRefreshing = false;
let failedQueue: Array<{
  resolve: (token: string) => void;
  reject: (error: any) => void;
}> = [];

const processQueue = (error: any, token: string | null = null) => {
  failedQueue.forEach(prom => {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve(token!);
    }
  });
  failedQueue = [];
};

apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean };
    
    // Only intercept 401 errors (not login failures)
    if (error.response?.status !== 401 || originalRequest._retry) {
      return Promise.reject(error);
    }

    // Don't retry auth endpoints themselves
    if (originalRequest.url?.includes('/auth/login') || 
        originalRequest.url?.includes('/auth/refresh')) {
      return Promise.reject(error);
    }

    if (isRefreshing) {
      // Another refresh is in progress - queue this request
      return new Promise((resolve, reject) => {
        failedQueue.push({ resolve, reject });
      }).then(token => {
        originalRequest.headers.Authorization = `Bearer ${token}`;
        return apiClient(originalRequest);
      }).catch(err => {
        return Promise.reject(err);
      });
    }

    originalRequest._retry = true;
    isRefreshing = true;

    try {
      const newToken = await authService.refreshToken();
      processQueue(null, newToken);
      originalRequest.headers.Authorization = `Bearer ${newToken}`;
      return apiClient(originalRequest);
    } catch (refreshError) {
      processQueue(refreshError, null);
      // Redirect to login page
      window.location.href = '/login';
      return Promise.reject(refreshError);
    } finally {
      isRefreshing = false;
    }
  }
);

export default apiClient;
```

### 3.3 Proactive Token Refresh (Background Timer)

```typescript
// hooks/useTokenRefresh.ts

import { useEffect, useRef } from 'react';
import { authService } from '../services/auth.service';

/**
 * Proactively refreshes the access token before it expires.
 * This prevents the user from ever seeing a 401 error during normal usage.
 * 
 * Strategy: Refresh at 80% of token lifetime
 * Example: 1h token → refresh after 48 minutes
 */
export function useTokenRefresh() {
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const scheduleRefresh = (expiresIn: number) => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }

    // Refresh at 80% of token lifetime (e.g., 48 min for 1h token)
    const refreshAfterMs = expiresIn * 0.8 * 1000;

    timerRef.current = setTimeout(async () => {
      try {
        await authService.refreshToken();
        // Schedule next refresh after successful refresh
        // The new token also has expires_in, so schedule again
        scheduleRefresh(3600); // Default 1h, adjust from response
      } catch (error) {
        console.error('Background token refresh failed:', error);
        // User will be asked to re-login on next API call
      }
    }, refreshAfterMs);
  };

  useEffect(() => {
    // Start the refresh cycle (assuming 1h access token)
    scheduleRefresh(3600);

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, []);
}
```

### 3.4 Login Page Component

```tsx
// pages/login.tsx

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { authService } from '../services/auth.service';

export default function LoginPage() {
  const router = useRouter();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const result = await authService.login({
        identifier,  // Accepts: email, phone, system ID, birth certificate
        password,
        rememberMe,  // true = stay logged in 30 days
      });

      // Store user info in state management (Zustand/Redux/Context)
      // DO NOT store tokens in localStorage!
      
      console.log('Login successful:', result.user);
      console.log('Session duration:', rememberMe ? '30 days' : '7 days');
      
      router.push('/dashboard');
    } catch (err: any) {
      setError(err.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleLogin}>
      <h1>Login</h1>
      
      {error && <div className="error">{error}</div>}
      
      <input
        type="text"
        placeholder="Email, Phone, System ID, or Birth Certificate"
        value={identifier}
        onChange={(e) => setIdentifier(e.target.value)}
        required
      />
      
      <input
        type="password"
        placeholder="Password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        required
      />
      
      <label>
        <input
          type="checkbox"
          checked={rememberMe}
          onChange={(e) => setRememberMe(e.target.checked)}
        />
        Remember me (stay logged in for 30 days)
      </label>
      
      <button type="submit" disabled={loading}>
        {loading ? 'Logging in...' : 'Login'}
      </button>
    </form>
  );
}
```

### 3.5 App Root - Initialize Auth on Load

```tsx
// app/layout.tsx or _app.tsx

'use client';

import { useEffect, useState } from 'react';
import { authService } from '../services/auth.service';
import { useTokenRefresh } from '../hooks/useTokenRefresh';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const [authReady, setAuthReady] = useState(false);

  // Proactive token refresh
  useTokenRefresh();

  useEffect(() => {
    // On app load, try to refresh token from cookie
    // This restores the session after page refresh / browser restart
    const initAuth = async () => {
      try {
        await authService.refreshToken();
        console.log('Session restored from cookie');
      } catch {
        console.log('No active session');
      } finally {
        setAuthReady(true);
      }
    };

    initAuth();
  }, []);

  if (!authReady) {
    return <div>Loading...</div>; // Or a splash screen
  }

  return <>{children}</>;
}
```

---

## 4. Mobile App Implementation

### 4.1 Login (React Native / Flutter)

```typescript
// React Native Example

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';

const API_BASE = 'https://api.suraksha.lk';

interface MobileLoginRequest {
  identifier: string;
  password: string;
  deviceId: string;       // Required for mobile
  platform: 'android' | 'ios';
  deviceName?: string;
  rememberMe?: boolean;
}

async function loginMobile(request: MobileLoginRequest) {
  const response = await fetch(`${API_BASE}/v2/auth/login/mobile`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    throw new Error('Login failed');
  }

  const data = await response.json();
  
  // Store tokens securely
  // ⚠️ NEVER use AsyncStorage for tokens! Use SecureStore/Keychain
  await SecureStore.setItemAsync('access_token', data.access_token);
  await SecureStore.setItemAsync('refresh_token', data.refresh_token);
  await SecureStore.setItemAsync('expires_at', 
    String(Date.now() + data.expires_in * 1000)
  );
  
  // User info can go in AsyncStorage (non-sensitive)
  await AsyncStorage.setItem('user', JSON.stringify(data.user));
  
  return data;
}
```

### 4.2 Device ID Generation

```typescript
// utils/device.ts

import * as Application from 'expo-application';
import { Platform } from 'react-native';
import 'react-native-get-random-values';
import { v4 as uuidv4 } from 'uuid';

/**
 * Generate a stable device ID for session tracking
 * Format: platform_installId_uuid
 */
async function getDeviceId(): Promise<string> {
  // Try to get a stored device ID first (persist across sessions)
  const stored = await SecureStore.getItemAsync('device_id');
  if (stored) return stored;

  // Generate new device ID
  const platform = Platform.OS; // 'android' or 'ios'
  const installId = await Application.getInstallationIdAsync();
  const deviceId = `${platform}_${installId}_${uuidv4().substring(0, 8)}`;
  
  // Store for future use
  await SecureStore.setItemAsync('device_id', deviceId);
  
  return deviceId;
}

function getDeviceName(): string {
  // Return user-friendly device name
  const brand = Platform.OS === 'ios' ? 'iPhone' : 'Android';
  return `${brand} Device`;
}
```

### 4.3 Mobile Token Refresh

```typescript
// services/mobile-auth.service.ts

async function refreshMobileToken(): Promise<string> {
  const refreshToken = await SecureStore.getItemAsync('refresh_token');
  const deviceId = await SecureStore.getItemAsync('device_id');

  if (!refreshToken || !deviceId) {
    throw new Error('No refresh token or device ID');
  }

  const response = await fetch(`${API_BASE}/auth/refresh/mobile`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      refresh_token: refreshToken,
      deviceId: deviceId,
    }),
  });

  if (!response.ok) {
    // Clear stored tokens - user must re-login
    await SecureStore.deleteItemAsync('access_token');
    await SecureStore.deleteItemAsync('refresh_token');
    throw new Error('Session expired');
  }

  const data = await response.json();
  
  // Store new tokens
  await SecureStore.setItemAsync('access_token', data.access_token);
  await SecureStore.setItemAsync('refresh_token', data.refresh_token);
  await SecureStore.setItemAsync('expires_at', 
    String(Date.now() + data.expires_in * 1000)
  );

  return data.access_token;
}
```

### 4.4 Mobile Logout

```typescript
async function logoutMobile(): Promise<void> {
  const refreshToken = await SecureStore.getItemAsync('refresh_token');
  const deviceId = await SecureStore.getItemAsync('device_id');

  if (refreshToken && deviceId) {
    try {
      await fetch(`${API_BASE}/auth/logout/mobile`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          refresh_token: refreshToken,
          deviceId: deviceId,
        }),
      });
    } catch {
      // Ignore - token will expire anyway
    }
  }

  // Clear all stored tokens
  await SecureStore.deleteItemAsync('access_token');
  await SecureStore.deleteItemAsync('refresh_token');
  await SecureStore.deleteItemAsync('expires_at');
  await AsyncStorage.removeItem('user');
}
```

---

## 5. Token Lifecycle & Auto-Refresh

### Complete Lifecycle Flow

```
┌──────────────────────────────────────────────────────────┐
│                    TOKEN LIFECYCLE                         │
├──────────────────────────────────────────────────────────┤
│                                                          │
│  LOGIN  ─────► access_token (1h) + refresh_token (7/30d)│
│                                                          │
│  ┌─── Normal API Call ◄──────────────────┐              │
│  │    Authorization: Bearer <access>      │              │
│  │                                        │              │
│  │    200 OK ─────► Continue              │              │
│  │                                        │              │
│  │    401 Unauthorized                    │              │
│  │      │                                 │              │
│  │      ▼                                 │              │
│  │    POST /v2/auth/refresh               │              │
│  │      │                                 │              │
│  │      ├── 200 OK ──► New tokens ────────┘              │
│  │      │                                                │
│  │      └── 401 ──► Refresh token expired                │
│  │                   │                                   │
│  │                   ▼                                   │
│  │               REDIRECT TO LOGIN                       │
│  │               (session fully expired)                 │
│  │                                                       │
│  └───────────────────────────────────────────────────────┘
│                                                          │
│  LOGOUT  ─────► Revoke refresh_token + clear cookie      │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

### When Tokens Are Revoked (Automatic)

| Event | Access Token | Refresh Token | User Action Required |
|-------|-------------|--------------|---------------------|
| Normal expiry | Expired after 1h | Expired after 7/30d | Re-login |
| Token refresh | Old still works briefly | Old revoked immediately | None (automatic) |
| Password change | Still works until expiry | **All revoked** | Re-login on all devices |
| Account deactivated | Blocked on next request | **All revoked** | Contact admin |
| Manual logout | Not revoked | Revoked for that session | None |
| "Log out everywhere" | Not revoked | **All revoked** | Re-login on all devices |

---

## 6. Session Management UI

### 6.1 Active Sessions Component

```tsx
// components/ActiveSessions.tsx

import { useState, useEffect } from 'react';
import apiClient from '../lib/api-client';

interface Session {
  id: string;
  platform: 'web' | 'android' | 'ios';
  deviceId: string | null;
  deviceName: string | null;
  ipAddress: string | null;
  createdAt: string;
  expiresAt: string;
}

export function ActiveSessions() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);

  const loadSessions = async () => {
    try {
      const { data } = await apiClient.get('/auth/sessions');
      setSessions(data.sessions);
    } catch (error) {
      console.error('Failed to load sessions');
    } finally {
      setLoading(false);
    }
  };

  const revokeSession = async (sessionId: string) => {
    if (!confirm('Are you sure you want to log out this device?')) return;
    
    try {
      await apiClient.post(`/auth/sessions/revoke/${sessionId}`);
      setSessions(prev => prev.filter(s => s.id !== sessionId));
    } catch (error) {
      alert('Failed to revoke session');
    }
  };

  const revokeAll = async () => {
    if (!confirm('This will log you out of ALL devices. Continue?')) return;
    
    try {
      await apiClient.post('/auth/sessions/revoke-all');
      // Redirect to login since current session is also revoked
      window.location.href = '/login';
    } catch (error) {
      alert('Failed to revoke sessions');
    }
  };

  useEffect(() => { loadSessions(); }, []);

  if (loading) return <div>Loading sessions...</div>;

  const getPlatformIcon = (platform: string) => {
    switch (platform) {
      case 'web': return '🖥️';
      case 'android': return '📱';
      case 'ios': return '🍎';
      default: return '❓';
    }
  };

  return (
    <div>
      <h2>Active Sessions ({sessions.length})</h2>
      
      {sessions.map(session => (
        <div key={session.id} className="session-card">
          <span>{getPlatformIcon(session.platform)}</span>
          <div>
            <strong>{session.deviceName || session.platform}</strong>
            <p>IP: {session.ipAddress || 'Unknown'}</p>
            <p>Login: {new Date(session.createdAt).toLocaleDateString()}</p>
            <p>Expires: {new Date(session.expiresAt).toLocaleDateString()}</p>
          </div>
          <button onClick={() => revokeSession(session.id)}>
            Log Out
          </button>
        </div>
      ))}

      {sessions.length > 1 && (
        <button onClick={revokeAll} className="danger">
          Log Out Everywhere
        </button>
      )}
    </div>
  );
}
```

---

## 7. Error Handling

### API Error Responses

```typescript
// Common error response format
interface ErrorResponse {
  statusCode: number;
  message: string | string[];
  error?: string;
}

// Error handling helper
function handleAuthError(error: any): string {
  const status = error.response?.status;
  const message = error.response?.data?.message;

  switch (status) {
    case 401:
      if (message?.includes('inactive')) {
        return 'Your account has been deactivated. Contact your administrator.';
      }
      if (message?.includes('credentials')) {
        return 'Invalid email/phone or password. Please try again.';
      }
      return 'Session expired. Please login again.';
    
    case 429:
      return 'Too many attempts. Please wait 15 minutes and try again.';
    
    case 400:
      if (Array.isArray(message)) {
        return message.join(', ');
      }
      return message || 'Invalid request. Please check your input.';
    
    default:
      return 'Something went wrong. Please try again later.';
  }
}
```

### Handling "Limited Access" After Refresh

The backend now allows refresh even when a user has no active institute access (instead of revoking all sessions). The JWT payload will have empty institute access (`i: []`). Handle this in your frontend:

```typescript
// After successful login or refresh, check institute access
function checkInstituteAccess(payload: any) {
  const instituteAccess = payload.i;
  
  // Global access (superadmin/org manager) = number 999999
  if (typeof instituteAccess === 'number' && instituteAccess === 999999) {
    return { hasAccess: true, isGlobal: true };
  }
  
  // Array of institute access entries
  if (Array.isArray(instituteAccess) && instituteAccess.length > 0) {
    return { hasAccess: true, isGlobal: false, institutes: instituteAccess };
  }
  
  // No institute access - show appropriate UI
  return { hasAccess: false, isGlobal: false };
}

// In your dashboard:
const access = checkInstituteAccess(loginResult.payload);
if (!access.hasAccess) {
  // Show: "You haven't been assigned to any institute yet. 
  //        Contact your administrator."
  // Still let user access profile, settings, etc.
}
```

---

## 8. Security Best Practices

### DO ✅

1. **Store access tokens in memory only** (JavaScript variable, React state, Zustand store)
2. **Use `credentials: 'include'`** with fetch / `withCredentials: true` with Axios
3. **Implement the 401 interceptor** for automatic token refresh
4. **Use the `rememberMe` flag** to control session duration
5. **Clear all state on logout** (including in-memory tokens)
6. **Use SecureStore (mobile)** for refresh tokens — never AsyncStorage
7. **Show session management UI** so users can see/revoke their active sessions

### DON'T ❌

1. **Never store tokens in `localStorage` or `sessionStorage`** (XSS risk)
2. **Never expose refresh_token in URL** parameters
3. **Never call refresh in parallel** — use a lock/queue pattern
4. **Never hardcode API URLs** — use environment variables
5. **Never skip the `deviceId` on mobile** — it's required for security
6. **Never ignore 401 on refresh endpoint** — it means re-login is needed

### Login Identifier Examples

The `identifier` field accepts multiple formats. Show users helpful hints:

| Identifier Type | Example | When to Use |
|----------------|---------|-------------|
| Email | `user@example.com` | Standard login |
| Phone (International) | `+94771234567` | Login with phone |
| Phone (Local with 0) | `0771234567` | Login with phone |
| Phone (Short) | `771234567` | Login with phone |
| System ID | `500423` | Login with 6-digit system ID |
| Birth Certificate | `12345678901` | Login with birth certificate |

---

## Quick Start Checklist

- [ ] Set up `auth.service.ts` with login/refresh/logout methods
- [ ] Set up Axios/fetch interceptor for automatic 401 → refresh → retry
- [ ] Add `rememberMe` checkbox to login form
- [ ] Initialize auth on app load (try refresh from cookie)
- [ ] Set up proactive background token refresh (optional but recommended)
- [ ] Add session management page (`/settings/sessions`)
- [ ] Handle "no institute access" gracefully in dashboard
- [ ] Use SecureStore (mobile) for token storage
- [ ] Test: Login → close browser → reopen → should auto-restore session
- [ ] Test: Login on 2 devices → both should work simultaneously
- [ ] Test: "Log out everywhere" → all devices should require re-login
