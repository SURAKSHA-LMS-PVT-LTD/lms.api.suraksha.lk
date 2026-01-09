# 🔐 Refresh Token Implementation Guide

## Overview
This LMS API implements secure JWT authentication with refresh tokens using the **v2/auth** endpoints. Access tokens are short-lived (15 minutes) for security, while refresh tokens last 7 days and are stored in httpOnly cookies.

---

## 📋 Table of Contents
1. [Environment Setup](#environment-setup)
2. [API Endpoints](#api-endpoints)
3. [Frontend Implementation Guide](#frontend-implementation-guide)
4. [Security Best Practices](#security-best-practices)
5. [Error Handling](#error-handling)
6. [Token Lifecycle](#token-lifecycle)

---

## 🔧 Environment Setup

### 1. Backend Configuration (.env)

```bash
# JWT Authentication Configuration
# Generate secrets with: node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"

# Access Token (short-lived, 15 minutes)
JWT_SECRET=your_super_secure_jwt_secret_key_here_min_64_chars
JWT_EXPIRES_IN=15m

# Refresh Token (long-lived, 7 days) - MUST be different from JWT_SECRET
JWT_REFRESH_SECRET=your_different_secure_refresh_token_secret_here_min_64_chars
JWT_REFRESH_EXPIRES_IN=7d

# Environment
NODE_ENV=production  # or development
```

### 2. Generate Secure Secrets

```bash
# Generate JWT_SECRET
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"

# Generate JWT_REFRESH_SECRET (must be different!)
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

⚠️ **CRITICAL**: Use different secrets for JWT_SECRET and JWT_REFRESH_SECRET!

---

## 🚀 API Endpoints

### Base URL
```
Development: http://localhost:3000
Production: https://api.yourdomain.com
```

### 1. Login (POST /v2/auth/login)

**Endpoint**: `POST /v2/auth/login`

**Description**: Authenticates user and returns access token. Refresh token is automatically set in httpOnly cookie.

**Request Body**:
```json
{
  "email": "student@example.com",
  "password": "SecurePass123!"
}
```

**Response (200 OK)**:
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "payload": {
    "s": "12345",
    "u": 2,
    "t": 1704844800,
    "i": [
      {
        "i": "1",
        "r": 2,
        "c": [["101"], ["102", 7]]
      }
    ]
  },
  "user": {
    "id": "12345",
    "email": "student@example.com",
    "firstName": "John",
    "lastName": "Doe",
    "userType": "USER",
    "imageUrl": "https://..."
  }
}
```

**Set-Cookie Header** (automatic):
```
Set-Cookie: refresh_token=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...; HttpOnly; Secure; SameSite=Strict; Max-Age=604800; Path=/
```

**Error Responses**:
- `401 Unauthorized`: Invalid credentials
- `429 Too Many Requests`: Too many login attempts (5 per 15 minutes)

---

### 2. Refresh Token (POST /v2/auth/refresh)

**Endpoint**: `POST /v2/auth/refresh`

**Description**: Validates refresh token (from cookie or body) and returns new access token + new refresh token. Old refresh token is automatically revoked.

**Request Body** (optional if refresh_token cookie exists):
```json
{
  "refresh_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

**Response (200 OK)**:
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "12345",
    "email": "student@example.com",
    "firstName": "John",
    "lastName": "Doe",
    "userType": "USER",
    "imageUrl": "https://..."
  }
}
```

**Set-Cookie Header** (automatic):
```
Set-Cookie: refresh_token=new_token...; HttpOnly; Secure; SameSite=Strict; Max-Age=604800; Path=/
```

**Error Responses**:
- `401 Unauthorized`: Invalid, expired, or revoked refresh token
- `429 Too Many Requests`: Too many refresh attempts (10 per minute)

---

## 💻 Frontend Implementation Guide

### Option 1: Cookie-Based (Recommended - Most Secure)

#### Step 1: Login Implementation

```typescript
// api/auth.ts
const API_BASE_URL = 'http://localhost:3000';

interface LoginResponse {
  access_token: string;
  payload: {
    s: string;
    u: number;
    t: number;
    i?: any;
    c?: string[];
  };
  user: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    userType: string;
    imageUrl?: string;
  };
}

export async function login(email: string, password: string): Promise<LoginResponse> {
  const response = await fetch(`${API_BASE_URL}/v2/auth/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    credentials: 'include', // ⭐ IMPORTANT: Include cookies
    body: JSON.stringify({ email, password }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Login failed');
  }

  const data = await response.json();
  
  // Store access token in memory or localStorage
  localStorage.setItem('access_token', data.access_token);
  localStorage.setItem('user', JSON.stringify(data.user));
  
  // Refresh token is automatically stored in httpOnly cookie
  return data;
}
```

#### Step 2: API Client with Automatic Token Refresh

```typescript
// api/client.ts
let isRefreshing = false;
let refreshSubscribers: Array<(token: string) => void> = [];

function subscribeTokenRefresh(callback: (token: string) => void) {
  refreshSubscribers.push(callback);
}

function onTokenRefreshed(token: string) {
  refreshSubscribers.forEach(callback => callback(token));
  refreshSubscribers = [];
}

async function refreshAccessToken(): Promise<string> {
  const response = await fetch(`${API_BASE_URL}/v2/auth/refresh`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    credentials: 'include', // ⭐ IMPORTANT: Include cookies (refresh_token)
  });

  if (!response.ok) {
    // Refresh token expired or invalid - redirect to login
    localStorage.removeItem('access_token');
    localStorage.removeItem('user');
    window.location.href = '/login';
    throw new Error('Session expired. Please login again.');
  }

  const data = await response.json();
  localStorage.setItem('access_token', data.access_token);
  localStorage.setItem('user', JSON.stringify(data.user));
  
  return data.access_token;
}

export async function apiClient(
  endpoint: string,
  options: RequestInit = {}
): Promise<any> {
  const accessToken = localStorage.getItem('access_token');
  
  const config: RequestInit = {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
      ...(accessToken && { Authorization: `Bearer ${accessToken}` }),
    },
    credentials: 'include', // Always include cookies
  };

  let response = await fetch(`${API_BASE_URL}${endpoint}`, config);

  // If 401, try to refresh token
  if (response.status === 401) {
    if (!isRefreshing) {
      isRefreshing = true;
      
      try {
        const newToken = await refreshAccessToken();
        isRefreshing = false;
        onTokenRefreshed(newToken);
        
        // Retry original request with new token
        config.headers = {
          ...config.headers,
          Authorization: `Bearer ${newToken}`,
        };
        response = await fetch(`${API_BASE_URL}${endpoint}`, config);
      } catch (error) {
        isRefreshing = false;
        throw error;
      }
    } else {
      // Wait for token refresh to complete
      return new Promise((resolve, reject) => {
        subscribeTokenRefresh(async (token: string) => {
          config.headers = {
            ...config.headers,
            Authorization: `Bearer ${token}`,
          };
          try {
            const retryResponse = await fetch(`${API_BASE_URL}${endpoint}`, config);
            resolve(await retryResponse.json());
          } catch (error) {
            reject(error);
          }
        });
      });
    }
  }

  return response.json();
}
```

#### Step 3: Usage in Components

```typescript
// Example: Fetching user data
async function loadUserProfile() {
  try {
    const profile = await apiClient('/users/me', { method: 'GET' });
    console.log('Profile:', profile);
  } catch (error) {
    console.error('Failed to load profile:', error);
  }
}

// Example: Creating a resource
async function createAssignment(data: any) {
  try {
    const result = await apiClient('/assignments', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    console.log('Assignment created:', result);
  } catch (error) {
    console.error('Failed to create assignment:', error);
  }
}
```

#### Step 4: Logout

```typescript
export async function logout() {
  // Clear local storage
  localStorage.removeItem('access_token');
  localStorage.removeItem('user');
  
  // Optional: Call logout endpoint to revoke refresh token
  try {
    await fetch(`${API_BASE_URL}/auth/logout`, {
      method: 'POST',
      credentials: 'include',
    });
  } catch (error) {
    console.error('Logout API call failed:', error);
  }
  
  // Redirect to login
  window.location.href = '/login';
}
```

---

### Option 2: Manual Refresh Token Management (Less Secure)

If you can't use cookies (e.g., mobile apps), store refresh token securely:

```typescript
// ⚠️ Less secure - only use if cookies not available

interface LoginResponse {
  access_token: string;
  refresh_token: string; // Only available if not using cookies
  user: any;
}

export async function login(email: string, password: string): Promise<LoginResponse> {
  const response = await fetch(`${API_BASE_URL}/v2/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });

  const data = await response.json();
  
  // Store tokens securely
  // For web: Use httpOnly cookies (already handled by backend)
  // For mobile: Use secure storage (Keychain/Keystore)
  localStorage.setItem('access_token', data.access_token);
  // ⚠️ DO NOT store refresh_token in localStorage in web apps!
  
  return data;
}

export async function refreshToken(refreshToken: string): Promise<string> {
  const response = await fetch(`${API_BASE_URL}/v2/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh_token: refreshToken }),
  });

  const data = await response.json();
  localStorage.setItem('access_token', data.access_token);
  
  return data.access_token;
}
```

---

## 🔒 Security Best Practices

### 1. Cookie Configuration

| Environment | HttpOnly | Secure | SameSite | Domain |
|-------------|----------|--------|----------|--------|
| Production  | ✅ Yes   | ✅ Yes (HTTPS) | Strict | your-domain.com |
| Development | ✅ Yes   | ❌ No  | Lax | localhost |

### 2. Token Storage

| Token Type | Storage Location | Access from JS | Lifetime |
|------------|-----------------|----------------|----------|
| Access Token | localStorage or memory | ✅ Yes | 15 minutes |
| Refresh Token | httpOnly cookie | ❌ No (secure!) | 7 days |

### 3. Security Measures

✅ **Implemented**:
- ✅ Refresh tokens stored in httpOnly cookies (XSS protection)
- ✅ Refresh tokens are one-time use (old token revoked on refresh)
- ✅ Automatic token cleanup for inactive users
- ✅ Automatic token cleanup for users without institute access
- ✅ IP address and user agent tracking
- ✅ Rate limiting on login (5 attempts per 15 minutes)
- ✅ Rate limiting on refresh (10 attempts per minute)
- ✅ CSRF protection with SameSite cookies
- ✅ HTTPS only in production

⚠️ **Additional Recommendations**:
- Implement logout endpoint to revoke all user tokens
- Monitor for suspicious refresh patterns
- Consider device fingerprinting
- Implement 2FA for sensitive operations

---

## ⚠️ Error Handling

### Common Error Scenarios

#### 1. Invalid Credentials (Login)
```json
{
  "statusCode": 401,
  "message": "Invalid credentials",
  "error": "Unauthorized"
}
```
**Action**: Show error message, allow retry

#### 2. Too Many Login Attempts
```json
{
  "statusCode": 429,
  "message": "Too many login attempts. Try again in 15 minutes.",
  "error": "Too Many Requests"
}
```
**Action**: Show countdown timer, disable login form

#### 3. Expired Refresh Token
```json
{
  "statusCode": 401,
  "message": "Refresh token expired",
  "error": "Unauthorized"
}
```
**Action**: Clear storage, redirect to login

#### 4. Revoked Refresh Token
```json
{
  "statusCode": 401,
  "message": "Invalid or revoked refresh token",
  "error": "Unauthorized"
}
```
**Action**: Clear storage, redirect to login

#### 5. User Account Inactive
```json
{
  "statusCode": 401,
  "message": "User account is inactive",
  "error": "Unauthorized"
}
```
**Action**: Show account suspended message, contact support

---

## 🔄 Token Lifecycle

### Timeline Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                       Token Lifecycle                        │
└─────────────────────────────────────────────────────────────┘

Time:     0min      15min     30min     45min     7days
          │         │         │         │         │
Login     ●─────────┐         │         │         │
          │ AT(15m) │         │         │         │
          │ RT(7d)  │         │         │         │
          │         │         │         │         │
          │         ✗ AT expired        │         │
          │         │         │         │         │
Refresh   │         ●─────────┐         │         │
          │         │ AT(15m) │         │         │
          │         │ RT(7d)  │         │         │
          │         │ (new)   │         │         │
          │         │         │         │         │
          │         │         ✗ AT expired        │
          │         │         │         │         │
Refresh   │         │         ●─────────┐         │
          │         │         │ AT(15m) │         │
          │         │         │ RT(7d)  │         │
          │         │         │ (new)   │         │
          │         │         │         │         │
          │         │         │         ✗ RT expired
          │         │         │         │         │
Login     │         │         │         │         ●
Required  │         │         │         │         

AT = Access Token  │  RT = Refresh Token
```

### Flow Description

1. **Initial Login** (t=0):
   - User provides email + password
   - Backend validates credentials
   - Returns: Access Token (15 min) + Refresh Token (7 days in cookie)

2. **Making API Requests** (t=0-15min):
   - Include Access Token in Authorization header
   - Backend validates Access Token
   - Returns requested data

3. **Access Token Expires** (t=15min):
   - API returns 401 Unauthorized
   - Frontend automatically calls /v2/auth/refresh
   - Backend validates Refresh Token from cookie
   - Returns: New Access Token (15 min) + New Refresh Token (7 days)
   - Old Refresh Token is revoked

4. **Continued Usage** (t=15min-7days):
   - Repeat steps 2-3 as Access Tokens expire every 15 minutes
   - Each refresh extends the session by 7 days

5. **Refresh Token Expires** (t=7days):
   - /v2/auth/refresh returns 401
   - Frontend redirects to login page
   - User must login again

---

## 🧪 Testing Guide

### 1. Test Login

```bash
curl -X POST http://localhost:3000/v2/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "SecurePass123!"
  }' \
  -c cookies.txt  # Save cookies
```

### 2. Test Protected Endpoint

```bash
curl -X GET http://localhost:3000/auth/me \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

### 3. Test Refresh Token

```bash
curl -X POST http://localhost:3000/v2/auth/refresh \
  -H "Content-Type: application/json" \
  -b cookies.txt  # Use saved cookies
```

### 4. Test with Expired Access Token

Wait 15 minutes or modify JWT_EXPIRES_IN to 1m for testing.

---

## 📝 Migration from v1 to v2

### Changes from /auth/login to /v2/auth/login

| Feature | v1 (/auth/login) | v2 (/v2/auth/login) |
|---------|------------------|---------------------|
| Access Token | ✅ Yes | ✅ Yes (15 min) |
| Refresh Token | ❌ No | ✅ Yes (7 days, httpOnly cookie) |
| Token Expiry | 7 days | 15 minutes (auto-refresh) |
| Security | Moderate | High (httpOnly cookies) |
| XSS Protection | ❌ Vulnerable | ✅ Protected |
| Auto-Refresh | ❌ Manual re-login | ✅ Automatic |

### Migration Steps

1. **Update Login Call**:
   ```typescript
   // Old
   const response = await fetch('/auth/login', ...);
   
   // New
   const response = await fetch('/v2/auth/login', {
     credentials: 'include',  // Add this!
     ...
   });
   ```

2. **Add Refresh Logic**:
   - Implement automatic token refresh on 401
   - Use the apiClient example above

3. **Update All API Calls**:
   ```typescript
   // Add credentials: 'include' to all fetch calls
   fetch(url, {
     credentials: 'include',
     headers: {
       'Authorization': `Bearer ${accessToken}`,
       ...
     }
   });
   ```

4. **Test Thoroughly**:
   - Test login flow
   - Test token refresh
   - Test expired tokens
   - Test logout

---

## 🆘 Troubleshooting

### Issue: "Refresh token not provided"

**Cause**: Cookie not being sent with request

**Solution**:
```typescript
// Ensure credentials: 'include' is set
fetch(url, {
  credentials: 'include',  // ✅ Required!
  ...
});
```

### Issue: CORS errors with cookies

**Cause**: CORS not configured for credentials

**Solution** (Backend):
```typescript
// In main.ts or CORS configuration
app.enableCors({
  origin: 'http://localhost:5173',  // Your frontend URL
  credentials: true,  // ✅ Required for cookies!
});
```

### Issue: Cookies not working in development

**Cause**: Domain mismatch or secure cookie on HTTP

**Solution**:
- Use `localhost` for both frontend and backend in development
- Backend sets `secure: false` and `sameSite: 'lax'` in development
- Check `NODE_ENV` is set correctly

### Issue: Token refresh fails after some time

**Cause**: Refresh token expired (7 days)

**Solution**: This is expected behavior. User must login again after 7 days of inactivity.

---

## 📊 Database Schema

### Refresh Tokens Table

```sql
CREATE TABLE refresh_tokens (
  id VARCHAR(36) PRIMARY KEY,
  token VARCHAR(500) NOT NULL,
  userId BIGINT NOT NULL,
  expiresAt TIMESTAMP NOT NULL,
  isRevoked BOOLEAN DEFAULT false,
  ipAddress VARCHAR(100),
  userAgent TEXT,
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  INDEX idx_refresh_token_user (userId, isRevoked),
  INDEX idx_refresh_token (token),
  INDEX idx_refresh_token_expires (expiresAt, isRevoked)
);
```

---

## 🚀 Quick Start Checklist

- [ ] Add JWT_REFRESH_SECRET to .env file (different from JWT_SECRET)
- [ ] Set JWT_EXPIRES_IN=15m (access token)
- [ ] Set JWT_REFRESH_EXPIRES_IN=7d (refresh token)
- [ ] Update login to use /v2/auth/login
- [ ] Add credentials: 'include' to all fetch calls
- [ ] Implement automatic token refresh on 401
- [ ] Update CORS configuration to allow credentials
- [ ] Test login flow end-to-end
- [ ] Test token refresh
- [ ] Test expired token handling
- [ ] Deploy and verify in production

---

## 📞 Support

For questions or issues:
1. Check this documentation
2. Review the error messages
3. Check backend logs
4. Contact backend team

**Last Updated**: January 9, 2026
**API Version**: v2
**Backend Framework**: NestJS with JWT
