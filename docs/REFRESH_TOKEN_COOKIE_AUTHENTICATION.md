# 🔐 Refresh Token Cookie Authentication System

## Overview

The system now implements a secure refresh token mechanism using **httpOnly cookies** for enhanced security. This prevents XSS attacks from accessing refresh tokens while maintaining proper user session management with hierarchy validation.

## 🎯 Key Features

### 1. **Secure Cookie Storage**
- Refresh tokens are stored in **httpOnly cookies** (not accessible via JavaScript)
- **HTTPS-only** in production mode
- **SameSite** protection against CSRF attacks
- 7-day expiration with automatic cleanup

### 2. **Hierarchy Validation**
- **User Active Status**: Automatically revokes tokens for inactive users
- **Institute Access**: Validates user has active institute access (non-superadmin)
- **Active Institutes**: Ensures user has access to at least one active institute
- **Automatic Token Revocation**: Revokes all tokens when validation fails

### 3. **Environment-Based Security**
```typescript
Development Mode:
- Cookies work over HTTP
- SameSite: 'lax' (allows cross-origin requests)
- CORS: All origins allowed
- Origin validation: Disabled

Production Mode:
- Cookies require HTTPS only
- SameSite: 'strict' (strict CSRF protection)
- CORS: Whitelist-based only
- Origin validation: Strict
```

## 📋 API Endpoints

### 1. **POST /v2/auth/login**
Login and receive tokens with refresh token in cookie.

**Request:**
```json
{
  "email": "user@example.com",
  "password": "SecurePassword123!"
}
```

**Response:**
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "payload": {
    "s": "12345",
    "u": "STUDENT",
    "i": [...],
    "c": [...]
  },
  "user": {
    "id": "12345",
    "email": "user@example.com",
    "firstName": "John",
    "lastName": "Doe",
    "userType": "STUDENT"
  }
}
```

**Cookie Set:**
```
Set-Cookie: refresh_token=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...; 
  HttpOnly; 
  Secure (production); 
  SameSite=Strict (production) / Lax (dev); 
  Max-Age=604800; 
  Path=/
```

**Security Notes:**
- ⚠️ Refresh token is **NOT returned** in response body
- 🔒 Rate limited: 5 attempts per 15 minutes
- 🔐 Refresh token stored in httpOnly cookie only

---

### 2. **POST /auth/refresh**
Refresh access token using cookie (no body required).

**Request:**
```http
POST /auth/refresh HTTP/1.1
Host: api.example.com
Cookie: refresh_token=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**Response:**
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "12345",
    "email": "user@example.com",
    "firstName": "John",
    "lastName": "Doe",
    "userType": "STUDENT"
  }
}
```

**Security Validations:**
1. ✅ Refresh token exists in cookie
2. ✅ Token is valid and not expired
3. ✅ Token is not revoked in database
4. ✅ User account is active
5. ✅ User has valid institute access (non-superadmin)
6. ✅ User has access to at least one active institute

**Auto-Revocation Triggers:**
- User account becomes inactive → All tokens revoked
- User loses institute access → All tokens revoked
- All user's institutes become inactive → All tokens revoked

---

### 3. **POST /auth/logout**
Logout and revoke refresh token (no body required).

**Request:**
```http
POST /auth/logout HTTP/1.1
Host: api.example.com
Cookie: refresh_token=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**Response:**
```json
{
  "success": true,
  "message": "Logged out successfully"
}
```

**Actions Performed:**
1. Revokes refresh token in database
2. Clears refresh_token cookie
3. Returns success message

---

### 4. **GET /auth/me**
Get current user profile (requires access token).

**Request:**
```http
GET /auth/me HTTP/1.1
Host: api.example.com
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**Response:**
```json
{
  "id": "12345",
  "email": "user@example.com",
  "firstName": "John",
  "lastName": "Doe",
  "userType": "STUDENT",
  "isActive": true,
  "phoneNumber": "+94771234567",
  "dateOfBirth": "2000-01-01",
  "gender": "MALE",
  "city": "Colombo",
  "province": "WESTERN"
}
```

## 🔧 Client Implementation

### JavaScript/TypeScript (Fetch API)

```javascript
// Login
async function login(email, password) {
  const response = await fetch('http://localhost:8080/v2/auth/login', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ email, password }),
    credentials: 'include' // ⭐ CRITICAL: Include cookies
  });
  
  const data = await response.json();
  // Store access token in memory or localStorage
  localStorage.setItem('access_token', data.access_token);
  return data;
}

// Refresh token
async function refreshToken() {
  const response = await fetch('http://localhost:8080/auth/refresh', {
    method: 'POST',
    credentials: 'include' // ⭐ CRITICAL: Send cookies
  });
  
  if (!response.ok) {
    // Token refresh failed - redirect to login
    window.location.href = '/login';
    return null;
  }
  
  const data = await response.json();
  localStorage.setItem('access_token', data.access_token);
  return data;
}

// Logout
async function logout() {
  await fetch('http://localhost:8080/auth/logout', {
    method: 'POST',
    credentials: 'include' // ⭐ CRITICAL: Send cookies
  });
  
  localStorage.removeItem('access_token');
  window.location.href = '/login';
}

// API call with automatic token refresh
async function apiCall(url, options = {}) {
  let token = localStorage.getItem('access_token');
  
  const response = await fetch(url, {
    ...options,
    headers: {
      ...options.headers,
      'Authorization': `Bearer ${token}`
    },
    credentials: 'include'
  });
  
  // If 401, try to refresh token
  if (response.status === 401) {
    const refreshed = await refreshToken();
    if (refreshed) {
      // Retry original request with new token
      return fetch(url, {
        ...options,
        headers: {
          ...options.headers,
          'Authorization': `Bearer ${refreshed.access_token}`
        },
        credentials: 'include'
      });
    }
  }
  
  return response;
}
```

### Axios Example

```javascript
import axios from 'axios';

const api = axios.create({
  baseURL: 'http://localhost:8080',
  withCredentials: true // ⭐ CRITICAL: Include cookies
});

// Request interceptor to add token
api.interceptors.request.use(
  config => {
    const token = localStorage.getItem('access_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  error => Promise.reject(error)
);

// Response interceptor to handle token refresh
api.interceptors.response.use(
  response => response,
  async error => {
    const originalRequest = error.config;
    
    // If 401 and not already retried
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;
      
      try {
        const { data } = await api.post('/auth/refresh');
        localStorage.setItem('access_token', data.access_token);
        
        // Retry original request
        originalRequest.headers.Authorization = `Bearer ${data.access_token}`;
        return api(originalRequest);
      } catch (refreshError) {
        // Refresh failed - redirect to login
        localStorage.removeItem('access_token');
        window.location.href = '/login';
        return Promise.reject(refreshError);
      }
    }
    
    return Promise.reject(error);
  }
);

// Usage
async function login(email, password) {
  const { data } = await api.post('/v2/auth/login', { email, password });
  localStorage.setItem('access_token', data.access_token);
  return data;
}

async function logout() {
  await api.post('/auth/logout');
  localStorage.removeItem('access_token');
  window.location.href = '/login';
}
```

## 🔒 Security Best Practices

### 1. **Always Use `credentials: 'include'`**
```javascript
// ✅ CORRECT
fetch(url, { credentials: 'include' })

// ❌ WRONG - Cookies won't be sent
fetch(url)
```

### 2. **Never Store Refresh Tokens in localStorage**
```javascript
// ❌ WRONG - Vulnerable to XSS
localStorage.setItem('refresh_token', token);

// ✅ CORRECT - Server sets httpOnly cookie automatically
// Client never sees refresh token
```

### 3. **Handle Token Refresh Transparently**
```javascript
// Implement automatic token refresh on 401 responses
// User stays logged in seamlessly
```

### 4. **Clear Access Token on Logout**
```javascript
await logout();
localStorage.removeItem('access_token');
sessionStorage.clear();
```

## 🛡️ Hierarchy Validation Details

### User Status Checks
```typescript
// 1. User must be active
if (!user.isActive) {
  // Revoke ALL refresh tokens
  await revokeAllUserTokens(user.id);
  throw new UnauthorizedException('User account is inactive');
}
```

### Institute Access Checks (Non-Superadmin)
```typescript
// 2. User must have active institute access
const instituteAccess = await getActiveInstituteAccess(user.id);
if (instituteAccess.length === 0) {
  // Revoke ALL refresh tokens
  await revokeAllUserTokens(user.id);
  throw new UnauthorizedException('User has no valid institute access');
}

// 3. At least one institute must be active
const hasActiveInstitute = instituteAccess.some(
  access => access.institute?.isActive
);
if (!hasActiveInstitute) {
  // Revoke ALL refresh tokens
  await revokeAllUserTokens(user.id);
  throw new UnauthorizedException('User has no access to active institutes');
}
```

### Superadmin Exception
```typescript
// Superadmins bypass institute access checks
if (user.userType === UserType.SUPERADMIN) {
  // Only check if active
  // No institute validation required
}
```

## 🔄 Token Lifecycle

```
1. LOGIN
   ├─ Validate credentials
   ├─ Generate access token (15 min)
   ├─ Generate refresh token (7 days)
   ├─ Store refresh token in database
   ├─ Set refresh token in httpOnly cookie
   └─ Return access token in response body

2. API REQUESTS
   ├─ Client sends access token in Authorization header
   ├─ Server validates access token
   └─ Access granted/denied

3. ACCESS TOKEN EXPIRES
   ├─ Client detects 401 response
   ├─ Client calls /auth/refresh (automatic cookie sent)
   ├─ Server validates refresh token from cookie
   ├─ Server validates user hierarchy
   ├─ Server generates new access token
   ├─ Server generates new refresh token
   ├─ Server revokes old refresh token
   ├─ Server sets new refresh token in cookie
   └─ Client receives new access token

4. LOGOUT
   ├─ Client calls /auth/logout
   ├─ Server revokes refresh token in database
   ├─ Server clears refresh token cookie
   └─ Client clears access token
```

## 🧪 Testing

### Manual Testing with cURL

```bash
# Login
curl -X POST http://localhost:8080/v2/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password"}' \
  -c cookies.txt -v

# Refresh (using cookie)
curl -X POST http://localhost:8080/auth/refresh \
  -b cookies.txt -v

# Get profile
curl -X GET http://localhost:8080/auth/me \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -b cookies.txt -v

# Logout
curl -X POST http://localhost:8080/auth/logout \
  -b cookies.txt -v
```

### Postman Testing

1. **Enable Cookie Jar**
   - Settings → General → Enable "Cookie Jar"

2. **Login Request**
   - Method: POST
   - URL: `http://localhost:8080/v2/auth/login`
   - Body: Raw JSON
   ```json
   {
     "email": "test@example.com",
     "password": "password"
   }
   ```
   - Check "Cookies" tab to see refresh_token

3. **Refresh Request**
   - Method: POST
   - URL: `http://localhost:8080/auth/refresh`
   - No body needed (cookie sent automatically)

## 📊 Database Schema

### refresh_tokens Table
```sql
CREATE TABLE refresh_tokens (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  user_id BIGINT NOT NULL,
  token VARCHAR(500) NOT NULL UNIQUE,
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  is_revoked BOOLEAN DEFAULT FALSE,
  ip_address VARCHAR(45),
  user_agent VARCHAR(255),
  
  INDEX idx_refresh_token_user (user_id),
  INDEX idx_refresh_token_expires (expires_at),
  INDEX idx_refresh_token_revoked (is_revoked),
  
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
```

## 🚀 Production Deployment Checklist

- [x] Set `NODE_ENV=production` in environment
- [x] Configure HTTPS for API server
- [x] Set `CORS_ORIGINS` to whitelist frontend domains
- [x] Configure `JWT_SECRET` (256-bit minimum)
- [x] Configure `JWT_REFRESH_SECRET` (different from JWT_SECRET)
- [x] Enable database indexes on refresh_tokens table
- [x] Set up automatic cleanup of expired tokens
- [x] Monitor refresh token usage patterns
- [x] Set up alerts for suspicious token activity

## 📝 Environment Variables

```env
# Security
NODE_ENV=production
JWT_SECRET=your-256-bit-secret-key
JWT_REFRESH_SECRET=your-different-256-bit-refresh-secret
JWT_EXPIRY=15m
JWT_REFRESH_EXPIRY=7d

# CORS
CORS_ORIGINS=https://app.example.com,https://admin.example.com

# Database
DB_HOST=your-database-host
DB_PORT=3306
DB_USERNAME=your-db-user
DB_PASSWORD=your-db-password
DB_NAME=your-db-name
```

## 🎉 Summary

✅ **Secure**: Refresh tokens in httpOnly cookies prevent XSS attacks
✅ **Validated**: Full hierarchy and permission checks on every refresh
✅ **Automatic**: Seamless token refresh for users
✅ **Flexible**: Environment-based security (dev vs production)
✅ **Tracked**: IP and user agent logging for security audits
✅ **Revocable**: Admin can revoke tokens at any time
✅ **Expirable**: Automatic cleanup of old tokens

---

**Last Updated:** November 22, 2025
**Version:** 2.0
**Status:** ✅ Production Ready
