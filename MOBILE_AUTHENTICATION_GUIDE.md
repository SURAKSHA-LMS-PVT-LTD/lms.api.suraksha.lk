# 📱 Mobile Authentication Implementation Guide

## Overview

This guide covers the platform-aware authentication system that supports both web browsers and mobile applications (iOS/Android).

| Platform | Token Storage | Refresh Token Handling |
|----------|---------------|------------------------|
| **Web** | `localStorage` | HTTP-only cookie (SSO enabled) |
| **Mobile** | Capacitor Preferences (native secure storage) | Response body (not cookie) |

---

## 🔑 API Endpoints Summary

| Platform | Endpoint | Method | Description |
|----------|----------|--------|-------------|
| Web | `/v2/auth/login` | POST | Login with httpOnly cookie |
| Mobile | `/v2/auth/login/mobile` | POST | Login with token in body |
| Web | `/auth/refresh` | POST | Refresh using cookie |
| Mobile | `/auth/refresh/mobile` | POST | Refresh using body |
| Web | `/auth/logout` | POST | Logout (clears cookie) |
| Mobile | `/auth/logout/mobile` | POST | Logout (revokes token) |
| Both | `/auth/me` | GET | Get current user |

---

## 📱 Mobile Login

### Endpoint
```
POST /v2/auth/login/mobile
```

### Request
```json
{
  "identifier": "user@example.com",
  "password": "password123",
  "deviceId": "android_1706438400000_abc123xyz",
  "deviceName": "Samsung Galaxy S21",
  "platform": "android"
}
```

### Supported Login Identifiers
Mobile login now supports multiple identifier types (same as web):
- **Email**: `user@example.com`
- **Phone Number**: `+94771234567`, `0771234567`, `771234567`
- **System ID**: `500423` (6-digit registration number)
- **Birth Certificate**: Any format stored in user profile

### Request Parameters
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `identifier` | string | ✅ | User identifier (email, phone, system ID, or birth certificate) |
| `password` | string | ✅ | User password |
| `deviceId` | string | ✅ | Unique device identifier (format: `platform_timestamp_uuid`) |
| `deviceName` | string | ❌ | User-friendly device name |
| `platform` | string | ❌ | `android` or `ios` (auto-detected from deviceId if not provided) |

### Response (200 OK)
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refresh_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "expires_in": 3600,
  "payload": {
    "s": "12345",
    "u": 2,
    "t": 1706128000,
    "i": [
      {
        "i": "101",
        "r": 2,
        "c": [["1000"]]
      }
    ]
  },
  "user": {
    "id": "12345",
    "email": "user@example.com",
    "nameWithInitials": "J. Doe",
    "userType": "STUDENT",
    "imageUrl": "https://storage.googleapis.com/..."
  }
}
```

### Error Responses
```json
// 401 Unauthorized - Invalid credentials
{
  "statusCode": 401,
  "message": "Invalid credentials",
  "error": "Unauthorized"
}

// 400 Bad Request - Missing deviceId
{
  "statusCode": 400,
  "message": ["Device ID is required for mobile login"],
  "error": "Bad Request"
}

// 429 Too Many Requests
{
  "statusCode": 429,
  "message": "Too many login attempts. Try again in 15 minutes.",
  "error": "Too Many Requests"
}
```

---

## 📱 Mobile Token Refresh

### Endpoint
```
POST /auth/refresh/mobile
```

### Request
```json
{
  "refresh_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "deviceId": "android_1706438400000_abc123xyz"
}
```

### Request Parameters
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `refresh_token` | string | ✅ | Refresh token from login/previous refresh |
| `deviceId` | string | ✅ | Must match the deviceId used during login |

### Response (200 OK)
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refresh_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "expires_in": 3600,
  "user": {
    "id": "12345",
    "email": "user@example.com",
    "nameWithInitials": "J. Doe",
    "userType": "STUDENT",
    "imageUrl": "https://storage.googleapis.com/..."
  }
}
```

### Error Responses
```json
// 401 Unauthorized - Device mismatch
{
  "statusCode": 401,
  "message": "Device ID mismatch - token may have been stolen",
  "error": "Unauthorized"
}

// 401 Unauthorized - Token expired
{
  "statusCode": 401,
  "message": "Refresh token expired",
  "error": "Unauthorized"
}
```

### Security Note
⚠️ **Device ID Validation**: The refresh endpoint validates that the `deviceId` matches the one used during login. This prevents token theft where an attacker obtains the refresh token but doesn't know the device ID.

---

## 📱 Mobile Logout

### Endpoint
```
POST /auth/logout/mobile
```

### Request
```json
{
  "refresh_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "deviceId": "android_1706438400000_abc123xyz"
}
```

### Response (200 OK)
```json
{
  "success": true,
  "message": "Logged out successfully"
}
```

---

## 🔒 Security Features

### 1. Device-Specific Sessions
- Each device has its own refresh token
- New login on same device revokes previous tokens
- Device ID embedded in refresh token JWT payload

### 2. Token Rotation
- Every refresh generates a new refresh token
- Old refresh token is immediately revoked
- Prevents refresh token reuse attacks

### 3. Device ID Validation
- Refresh requests must include matching device ID
- Mismatched device ID = potential token theft
- Automatic logging of suspicious activity

### 4. Hierarchy Validation
- User must still have valid institute access
- User account must be active
- All tokens revoked if user becomes inactive

---

## 📱 Frontend Implementation (Ionic/Capacitor)

### Storage Service
```typescript
// storage.service.ts
import { Preferences } from '@capacitor/preferences';

export class SecureStorage {
  private static readonly ACCESS_TOKEN_KEY = 'access_token';
  private static readonly REFRESH_TOKEN_KEY = 'refresh_token';
  private static readonly USER_KEY = 'user';

  static async setAccessToken(token: string): Promise<void> {
    await Preferences.set({ key: this.ACCESS_TOKEN_KEY, value: token });
  }

  static async getAccessToken(): Promise<string | null> {
    const { value } = await Preferences.get({ key: this.ACCESS_TOKEN_KEY });
    return value;
  }

  static async setRefreshToken(token: string): Promise<void> {
    await Preferences.set({ key: this.REFRESH_TOKEN_KEY, value: token });
  }

  static async getRefreshToken(): Promise<string | null> {
    const { value } = await Preferences.get({ key: this.REFRESH_TOKEN_KEY });
    return value;
  }

  static async clearAll(): Promise<void> {
    await Preferences.clear();
  }
}
```

### Device ID Generation
```typescript
// device.service.ts
import { Device } from '@capacitor/device';
import { Capacitor } from '@capacitor/core';

export class DeviceService {
  private static deviceId: string | null = null;

  static async getDeviceId(): Promise<string> {
    if (this.deviceId) return this.deviceId;

    const platform = Capacitor.getPlatform(); // 'android' | 'ios' | 'web'
    const info = await Device.getId();
    const timestamp = Date.now();
    
    this.deviceId = `${platform}_${timestamp}_${info.identifier}`;
    return this.deviceId;
  }

  static async getDeviceName(): Promise<string> {
    const info = await Device.getInfo();
    return `${info.manufacturer} ${info.model}`;
  }

  static getPlatform(): 'android' | 'ios' | 'web' {
    const platform = Capacitor.getPlatform();
    if (platform === 'android') return 'android';
    if (platform === 'ios') return 'ios';
    return 'web';
  }
}
```

### Auth Service
```typescript
// auth.service.ts
import { SecureStorage } from './storage.service';
import { DeviceService } from './device.service';

const API_BASE = 'https://lmsapi.suraksha.lk';

export class MobileAuthService {
  
  static async login(identifier: string, password: string): Promise<any> {
    const deviceId = await DeviceService.getDeviceId();
    const deviceName = await DeviceService.getDeviceName();
    const platform = DeviceService.getPlatform();

    const response = await fetch(`${API_BASE}/v2/auth/login/mobile`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        identifier, // Supports email, phone, system ID, birth certificate
        password,
        deviceId,
        deviceName,
        platform
      })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Login failed');
    }

    const data = await response.json();
    
    // Store tokens securely
    await SecureStorage.setAccessToken(data.access_token);
    await SecureStorage.setRefreshToken(data.refresh_token);
    
    return data;
  }

  static async refreshToken(): Promise<any> {
    const refreshToken = await SecureStorage.getRefreshToken();
    const deviceId = await DeviceService.getDeviceId();

    if (!refreshToken) {
      throw new Error('No refresh token available');
    }

    const response = await fetch(`${API_BASE}/auth/refresh/mobile`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        refresh_token: refreshToken,
        deviceId
      })
    });

    if (!response.ok) {
      await SecureStorage.clearAll();
      throw new Error('Session expired. Please login again.');
    }

    const data = await response.json();
    
    // Store new tokens
    await SecureStorage.setAccessToken(data.access_token);
    await SecureStorage.setRefreshToken(data.refresh_token);
    
    return data;
  }

  static async logout(): Promise<void> {
    try {
      const refreshToken = await SecureStorage.getRefreshToken();
      const deviceId = await DeviceService.getDeviceId();

      if (refreshToken) {
        await fetch(`${API_BASE}/auth/logout/mobile`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            refresh_token: refreshToken,
            deviceId
          })
        });
      }
    } catch (error) {
      console.error('Logout API error:', error);
    } finally {
      await SecureStorage.clearAll();
    }
  }
}
```

### API Client with Auto-Refresh
```typescript
// api.client.ts
import { SecureStorage } from './storage.service';
import { MobileAuthService } from './auth.service';

let isRefreshing = false;
let refreshPromise: Promise<any> | null = null;

export async function apiClient<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const accessToken = await SecureStorage.getAccessToken();

  const config: RequestInit = {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
      ...(accessToken && { Authorization: `Bearer ${accessToken}` })
    }
  };

  let response = await fetch(`${API_BASE}${endpoint}`, config);

  // Handle 401 - Try refresh
  if (response.status === 401) {
    if (!isRefreshing) {
      isRefreshing = true;
      refreshPromise = MobileAuthService.refreshToken()
        .finally(() => {
          isRefreshing = false;
          refreshPromise = null;
        });
    }

    try {
      await refreshPromise;
      
      // Retry with new token
      const newToken = await SecureStorage.getAccessToken();
      config.headers = {
        ...config.headers,
        Authorization: `Bearer ${newToken}`
      };
      response = await fetch(`${API_BASE}${endpoint}`, config);
    } catch (error) {
      // Refresh failed - logout
      await SecureStorage.clearAll();
      throw new Error('Session expired');
    }
  }

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Request failed');
  }

  return response.json();
}
```

---

## 🗄️ Database Schema

### RefreshTokens Table (Updated)
```sql
CREATE TABLE refresh_tokens (
  id UUID PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id),
  token VARCHAR(500) NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  is_revoked BOOLEAN DEFAULT FALSE,
  ip_address VARCHAR(100),
  user_agent TEXT,
  platform ENUM('web', 'android', 'ios') DEFAULT 'web',
  device_id VARCHAR(255),           -- NULL for web, required for mobile
  device_name VARCHAR(100),         -- User-friendly device name
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  
  INDEX idx_refresh_token_user (user_id, is_revoked),
  INDEX idx_refresh_token (token),
  INDEX idx_refresh_token_expires (expires_at, is_revoked),
  INDEX idx_refresh_token_device (device_id, user_id),
  INDEX idx_refresh_token_platform (platform, user_id)
);
```

---

## 🧪 Testing

### cURL Commands

#### Mobile Login
```bash
# Login with email
curl -X POST https://lmsapi.suraksha.lk/v2/auth/login/mobile \
  -H "Content-Type: application/json" \
  -d '{
    "identifier": "user@example.com",
    "password": "password123",
    "deviceId": "android_1706438400000_abc123xyz",
    "deviceName": "Test Device",
    "platform": "android"
  }'

# Login with phone number
curl -X POST https://lmsapi.suraksha.lk/v2/auth/login/mobile \
  -H "Content-Type: application/json" \
  -d '{
    "identifier": "0771234567",
    "password": "password123",
    "deviceId": "android_1706438400000_abc123xyz",
    "deviceName": "Test Device",
    "platform": "android"
  }'

# Login with system ID
curl -X POST https://lmsapi.suraksha.lk/v2/auth/login/mobile \
  -H "Content-Type: application/json" \
  -d '{
    "identifier": "500423",
    "password": "password123",
    "deviceId": "android_1706438400000_abc123xyz",
    "deviceName": "Test Device",
    "platform": "android"
  }'
```

#### Mobile Token Refresh
```bash
curl -X POST https://lmsapi.suraksha.lk/auth/refresh/mobile \
  -H "Content-Type: application/json" \
  -d '{
    "refresh_token": "YOUR_REFRESH_TOKEN",
    "deviceId": "android_1706438400000_abc123xyz"
  }'
```

#### Mobile Logout
```bash
curl -X POST https://lmsapi.suraksha.lk/auth/logout/mobile \
  -H "Content-Type: application/json" \
  -d '{
    "refresh_token": "YOUR_REFRESH_TOKEN",
    "deviceId": "android_1706438400000_abc123xyz"
  }'
```

---

## 📋 Migration Guide

### Step 1: Run Database Migration
```bash
npm run migration:run
```

### Step 2: Verify Endpoints
```bash
# Check Swagger documentation
open https://lmsapi.suraksha.lk/api
```

### Step 3: Update Mobile App
1. Replace login endpoint from `/v2/auth/login` to `/v2/auth/login/mobile`
2. **Change `email` field to `identifier`** - now supports email, phone, system ID, birth certificate
3. Add device ID generation
4. Store refresh token securely (Capacitor Preferences)
5. Update refresh logic to use `/auth/refresh/mobile`
6. Update logout to use `/auth/logout/mobile`

### Example Login Screen Update
```typescript
// Before
await MobileAuthService.login(email, password);

// After (supports multiple identifier types)
await MobileAuthService.login(identifier, password);
// identifier can be: email, phone (+94771234567, 0771234567), system ID, birth cert
```

---

## 🔧 CORS Configuration

Ensure CORS allows mobile origins:

```typescript
// main.ts
app.enableCors({
  origin: [
    'http://localhost:8080',
    'http://localhost:5173',
    'https://lms.suraksha.lk',
    'capacitor://localhost',  // iOS
    'http://localhost'        // Android WebView
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization']
});
```

---

## ❓ FAQ

### Q: Why separate endpoints for mobile?
A: Mobile apps cannot use httpOnly cookies effectively due to WebView limitations and cross-origin restrictions. Returning the refresh token in the body allows secure storage in native secure storage (Capacitor Preferences/Keychain).

### Q: What if deviceId changes?
A: The user will need to login again. Device ID should be persisted across app restarts using Capacitor's Device plugin.

### Q: Can a user have multiple devices?
A: Yes! Each device gets its own refresh token. Logging out on one device doesn't affect others.

### Q: What happens if refresh token is stolen?
A: The attacker also needs the matching device ID. Without it, the refresh will fail with "Device ID mismatch" error.

---

**Document Version:** 1.0  
**Last Updated:** January 28, 2026  
**API Base URL:** https://lmsapi.suraksha.lk
