# 🔐 Complete Authentication & Session Management Guide

## Table of Contents
1. [Overview](#overview)
2. [Environment Configuration](#environment-configuration)
3. [Login Flows](#login-flows)
4. [Session Management](#session-management)
5. [Token Structure](#token-structure)
6. [System Admin Functions](#system-admin-functions)
7. [API Reference](#api-reference)
8. [Security Features](#security-features)
9. [Troubleshooting](#troubleshooting)

---

## Overview

The LMS API implements a **dual-token authentication system** with JWT access tokens and refresh tokens, supporting:
- ✅ Web browser authentication (cookie-based)
- ✅ Mobile app authentication (iOS/Android with device tracking)
- ✅ Single Sign-On (SSO) with 30-day extended sessions
- ✅ Automatic token rotation for security
- ✅ Device-level session management
- ✅ Admin-level token revocation

**Token Lifetimes:**
- Access Token: `JWT_EXPIRES_IN` (default: 1 hour)
- Refresh Token: `JWT_REFRESH_EXPIRES_IN` (default: 7 days)
- SSO Extended: 30 days when `rememberMe=true`

---

## Environment Configuration

### Required Variables

```env
# JWT Access Token Configuration
JWT_SECRET=your_super_secure_secret_min_64_chars
JWT_EXPIRES_IN=1h          # or use JWT_EXPIRATION
JWT_EXPIRATION=1h          # Alternative to JWT_EXPIRES_IN

# JWT Refresh Token Configuration
JWT_REFRESH_SECRET=your_refresh_secret_min_64_chars
JWT_REFRESH_EXPIRES_IN=7d  # 7 days default, 14d, 30d, etc.

# Database Configuration
DB_HOST=localhost
DB_PORT=3306
DB_USERNAME=your_db_user
DB_PASSWORD=your_db_password
DB_DATABASE=suraksha_lms_db

# Environment
NODE_ENV=production        # or development
```

### Token Expiry Formats

Supported time units:
- `s` - seconds: `3600s`
- `m` - minutes: `60m`
- `h` - hours: `1h`, `24h`
- `d` - days: `7d`, `14d`, `30d`

**Examples:**
```env
JWT_EXPIRES_IN=1h          # 1 hour (3600 seconds)
JWT_EXPIRES_IN=30m         # 30 minutes
JWT_EXPIRES_IN=86400s      # 24 hours in seconds
JWT_REFRESH_EXPIRES_IN=14d # 14 days
```

---

## Login Flows

### 1. Web Browser Login (V2 - Recommended)

**Endpoint:** `POST /auth/v2/login`

**Features:**
- HttpOnly cookies for refresh token (XSS protection)
- CSRF protection (SameSite cookies)
- SSO support with `rememberMe` flag

**Request:**
```json
{
  "identifier": "student@example.com",  // email, phone, systemId, birthCertificate
  "password": "securePassword123",
  "rememberMe": true                    // Optional: 30-day session
}
```

**Response:**
```json
{
  "access_token": "eyJhbGci...",
  "refresh_token": "eyJhbGci...",       // Also set in httpOnly cookie
  "expires_in": 3600,                   // Access token expiry (seconds)
  "refresh_expires_in": 2592000,        // Refresh token expiry (30 days if rememberMe)
  "payload": {
    "s": "2",                            // Compressed payload
    "u": 4,
    "t": 1770735177,
    "i": [...]
  },
  "user": {
    "id": "uuid",
    "email": "student@example.com",
    "nameWithInitials": "J. Doe",
    "userType": "STUDENT",
    "imageUrl": "https://..."
  }
}
```

**Cookie Details:**
- Name: `refresh_token`
- HttpOnly: `true` (JavaScript cannot access)
- Secure: `true` (HTTPS only in production)
- SameSite: `strict` (production) or `lax` (development)
- MaxAge: 30 days (rememberMe) or 7 days (default)

---

### 2. Mobile App Login

**Endpoint:** `POST /auth/mobile/login`

**Features:**
- Device ID tracking
- Platform identification (iOS/Android)
- Single device session (auto-revokes previous tokens)
- SSO support with `rememberMe`

**Request:**
```json
{
  "identifier": "student@example.com",
  "password": "securePassword123",
  "deviceId": "A1B2C3D4-E5F6-7890",    // Required: Unique device identifier
  "deviceName": "iPhone 13 Pro",       // Optional: User-friendly name
  "platform": "ios",                   // Optional: "ios" or "android"
  "rememberMe": true                   // Optional: 30-day session
}
```

**Response:**
```json
{
  "access_token": "eyJhbGci...",
  "refresh_token": "eyJhbGci...",       // Store securely on device
  "expires_in": 3600,
  "refresh_expires_in": 2592000,
  "payload": { "s": "2", "u": 4, ... },
  "user": {
    "id": "uuid",
    "email": "student@example.com",
    "nameWithInitials": "J. Doe",
    "userType": "STUDENT",
    "imageUrl": "https://..."
  }
}
```

**Mobile Security Notes:**
- Store refresh token in **Keychain (iOS)** or **Keystore (Android)**
- Include device ID in all refresh requests
- One active session per device (auto-logout on new login)

---

### 3. Multi-Identifier Support

All login endpoints accept these identifier types:

**Email:**
```json
{ "identifier": "john.doe@example.com" }
```

**Phone Number:**
```json
{ "identifier": "+94771234567" }
{ "identifier": "0771234567" }
```

**System ID:**
```json
{ "identifier": "STU2024001" }
```

**Birth Certificate Number:**
```json
{ "identifier": "202401234567" }
```

---

## Session Management

### Access Token Refresh

#### Web (Cookie-based)
**Endpoint:** `POST /auth/v2/refresh`

**Request:**
```json
{
  "refresh_token": "optional_if_cookie_present"
}
```

- If cookie exists, `refresh_token` in body is optional
- Cookie is automatically included by browser

**Response:**
```json
{
  "access_token": "new_eyJhbGci...",
  "refresh_token": "new_eyJhbGci...",  // Old token auto-revoked
  "expires_in": 3600,
  "refresh_expires_in": 2592000,       // Preserves original expiry
  "user": {
    "id": "uuid",
    "email": "student@example.com",
    "nameWithInitials": "J. Doe",
    "userType": "STUDENT"
  }
}
```

#### Mobile (Device-based)
**Endpoint:** `POST /auth/mobile/refresh`

**Request:**
```json
{
  "refresh_token": "eyJhbGci...",
  "deviceId": "A1B2C3D4-E5F6-7890"     // Must match login device
}
```

**Response:** Same as web refresh

**Token Rotation:**
- Each refresh issues **new access + refresh tokens**
- Old refresh token is **immediately revoked**
- Previous access token remains valid until expiry
- `rememberMe` flag is preserved in refresh chain

---

### Logout

#### Web Logout
**Endpoint:** `POST /auth/v2/logout`

**Request:**
```json
{
  "refresh_token": "optional_if_cookie_present"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Logged out successfully"
}
```

**Actions:**
- Revokes refresh token in database
- Clears `refresh_token` cookie
- Access token remains valid until expiry (stateless JWT)

#### Mobile Logout
**Endpoint:** `POST /auth/mobile/logout`

**Request:**
```json
{
  "refresh_token": "eyJhbGci...",
  "deviceId": "A1B2C3D4-E5F6-7890"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Device logged out successfully"
}
```

**Actions:**
- Revokes refresh token for specific device
- Other devices remain logged in
- Device can re-login immediately

---

## Token Structure

### Access Token (JWT)

**Compact Payload (for users with institute access):**
```json
{
  "s": "2",              // Session version
  "u": 4,                // User type (4=STUDENT, 2=TEACHER, etc.)
  "t": 1770735177,       // Issued at timestamp
  "i": [                 // Institute assignments
    {
      "i": "101",        // Institute ID
      "r": 4,            // Role in institute
      "c": [             // Class assignments
        ["1000", 2]      // [classId, role]
      ]
    }
  ],
  "c": ["500341", "500362"],  // Child IDs (for parents)
  "iat": 1770735177,
  "exp": 1770738777      // Expiry timestamp
}
```

**Expanded Payload (for super admins):**
```json
{
  "sub": "user-uuid",
  "email": "admin@example.com",
  "role": "super_admin",
  "userType": "SUPERADMIN",
  "iat": 1770735177,
  "exp": 1770738777
}
```

### Refresh Token (JWT)

**Web Refresh Token:**
```json
{
  "sub": "user-uuid",
  "type": "refresh",
  "rm": true,            // rememberMe flag (preserves 30-day expiry)
  "iat": 1770735177,
  "exp": 1773327177      // 30 days later
}
```

**Mobile Refresh Token:**
```json
{
  "sub": "user-uuid",
  "type": "refresh",
  "platform": "ios",
  "deviceId": "A1B2C3D4-E5F6-7890",
  "rm": true,
  "iat": 1770735177,
  "exp": 1773327177
}
```

**Database Record:**
```sql
CREATE TABLE refresh_tokens (
  id VARCHAR(36) PRIMARY KEY,
  token VARCHAR(255),           -- SHA-256 hash of token (security)
  userId VARCHAR(36),
  expiresAt TIMESTAMP,
  ipAddress VARCHAR(45),
  userAgent TEXT,
  platform VARCHAR(20),         -- 'web', 'ios', 'android'
  deviceId VARCHAR(255),        -- NULL for web
  deviceName VARCHAR(255),
  isRevoked BOOLEAN DEFAULT 0,
  createdAt TIMESTAMP,
  updatedAt TIMESTAMP
);
```

---

## System Admin Functions

### 1. View All Active Sessions (User)

**Query Database:**
```sql
-- Get all active refresh tokens for a user
SELECT 
  id,
  platform,
  deviceName,
  deviceId,
  ipAddress,
  createdAt,
  expiresAt,
  isRevoked
FROM refresh_tokens
WHERE userId = 'user-uuid'
  AND isRevoked = 0
  AND expiresAt > NOW()
ORDER BY createdAt DESC;
```

### 2. Revoke All Sessions (Force Logout All Devices)

**SQL Command:**
```sql
-- Revoke all refresh tokens for a user (emergency logout)
UPDATE refresh_tokens
SET isRevoked = 1, updatedAt = NOW()
WHERE userId = 'user-uuid'
  AND isRevoked = 0;
```

**Use Cases:**
- Account compromise
- Password reset
- Security breach
- User request

### 3. Revoke Specific Device

**SQL Command:**
```sql
-- Logout specific device
UPDATE refresh_tokens
SET isRevoked = 1, updatedAt = NOW()
WHERE userId = 'user-uuid'
  AND deviceId = 'A1B2C3D4-E5F6-7890'
  AND isRevoked = 0;
```

### 4. View Session History

**Query:**
```sql
-- Get login history (last 30 days)
SELECT 
  platform,
  deviceName,
  ipAddress,
  userAgent,
  createdAt,
  expiresAt,
  isRevoked,
  CASE 
    WHEN isRevoked = 1 THEN 'Logged Out'
    WHEN expiresAt < NOW() THEN 'Expired'
    ELSE 'Active'
  END as status
FROM refresh_tokens
WHERE userId = 'user-uuid'
  AND createdAt >= DATE_SUB(NOW(), INTERVAL 30 DAY)
ORDER BY createdAt DESC
LIMIT 50;
```

### 5. Clean Expired Tokens (Maintenance)

**Scheduled Task (run daily):**
```sql
-- Delete expired or revoked tokens older than 90 days
DELETE FROM refresh_tokens
WHERE (
  (isRevoked = 1 AND updatedAt < DATE_SUB(NOW(), INTERVAL 90 DAY))
  OR
  (expiresAt < DATE_SUB(NOW(), INTERVAL 90 DAY))
);
```

### 6. Monitor Suspicious Activity

**Detect Multiple Devices:**
```sql
-- Find users with more than 5 active sessions
SELECT 
  userId,
  COUNT(*) as active_sessions,
  COUNT(DISTINCT deviceId) as unique_devices,
  COUNT(DISTINCT ipAddress) as unique_ips
FROM refresh_tokens
WHERE isRevoked = 0
  AND expiresAt > NOW()
GROUP BY userId
HAVING active_sessions > 5
ORDER BY active_sessions DESC;
```

**Detect Login from New Location:**
```sql
-- Compare current IP with user's typical IPs
SELECT DISTINCT
  userId,
  ipAddress,
  COUNT(*) as login_count,
  MAX(createdAt) as last_login
FROM refresh_tokens
WHERE userId = 'user-uuid'
  AND createdAt >= DATE_SUB(NOW(), INTERVAL 90 DAY)
GROUP BY userId, ipAddress
ORDER BY login_count DESC;
```

---

## API Reference

### Authentication Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/auth/v2/login` | Web browser login (cookie-based) |
| POST | `/auth/v2/refresh` | Refresh access token (web) |
| POST | `/auth/v2/logout` | Logout (web) |
| POST | `/auth/mobile/login` | Mobile app login |
| POST | `/auth/mobile/refresh` | Refresh access token (mobile) |
| POST | `/auth/mobile/logout` | Logout (mobile) |

### Rate Limits

| Endpoint | Limit | Window |
|----------|-------|--------|
| `/auth/*/login` | 10 requests | 60 seconds |
| `/auth/*/refresh` | 10 requests | 60 seconds |
| `/auth/*/logout` | 20 requests | 60 seconds |

---

## Security Features

### 1. Token Storage

**Web (Browser):**
- ✅ HttpOnly cookies (XSS protection)
- ✅ Secure flag (HTTPS only)
- ✅ SameSite=strict (CSRF protection)
- ❌ Never store tokens in localStorage
- ❌ Never store tokens in sessionStorage

**Mobile (App):**
- ✅ iOS Keychain with `kSecAttrAccessibleWhenUnlockedThisDeviceOnly`
- ✅ Android Keystore with `setRequireUserAuthentication()`
- ❌ Never store in SharedPreferences
- ❌ Never store in plain text files

### 2. Token Hashing

Refresh tokens are hashed (SHA-256) before database storage:

```typescript
// Token hashing (prevents token theft from DB breach)
import * as crypto from 'crypto';

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}
```

### 3. Token Rotation

Every refresh issues new tokens and revokes old ones:
- Prevents token replay attacks
- Limits exposure window
- Automatic breach detection (token reuse = alert)

### 4. Device Tracking

Mobile sessions track:
- Device ID (persistent identifier)
- Platform (iOS/Android)
- Device name (user-friendly)
- IP address
- User agent

Benefits:
- Single device session enforcement
- Anomaly detection
- User session visibility

---

## Troubleshooting

### Issue: "Invalid or expired refresh token"

**Causes:**
1. Token expired (check `JWT_REFRESH_EXPIRES_IN`)
2. Token revoked (check database: `isRevoked=1`)
3. Device ID mismatch (mobile only)
4. Token not found in database

**Solution:**
```bash
# Check token in database
SELECT * FROM refresh_tokens 
WHERE token = SHA2('paste_token_here', 256)
LIMIT 1;

# Check expiry
SELECT 
  expiresAt,
  NOW(),
  CASE WHEN expiresAt > NOW() THEN 'Valid' ELSE 'Expired' END
FROM refresh_tokens
WHERE token = SHA2('paste_token_here', 256);
```

### Issue: "Unauthorized" on API requests

**Causes:**
1. Access token expired
2. Invalid JWT secret
3. Token format invalid

**Solution:**
```bash
# Decode token (jwt.io)
# Check:
# - exp (expiry timestamp) > current time
# - signature valid with JWT_SECRET
# - payload structure correct
```

### Issue: Cookie not being sent

**Causes:**
1. CORS misconfiguration
2. SameSite policy blocking
3. Different domain/port

**Solution:**
```typescript
// Frontend must include credentials
fetch('http://localhost:8080/auth/v2/refresh', {
  method: 'POST',
  credentials: 'include',  // REQUIRED for cookies
  headers: {
    'Content-Type': 'application/json'
  }
});
```

**Backend CORS:**
```typescript
app.enableCors({
  origin: 'http://localhost:3000',
  credentials: true  // REQUIRED
});
```

### Issue: "rememberMe not working"

**Check:**
1. `rememberMe: true` in login request
2. Response `refresh_expires_in` = 2592000 (30 days)
3. Database `expiresAt` is 30 days from now
4. Cookie `maxAge` = 30 days

**Verify:**
```sql
-- Check token expiry
SELECT 
  userId,
  expiresAt,
  TIMESTAMPDIFF(DAY, NOW(), expiresAt) as days_until_expiry
FROM refresh_tokens
WHERE userId = 'user-uuid'
  AND isRevoked = 0
ORDER BY createdAt DESC
LIMIT 1;
```

---

## Summary

**For System Admins:**
- Set `JWT_EXPIRES_IN` and `JWT_REFRESH_EXPIRES_IN` in `.env`
- Monitor `refresh_tokens` table for suspicious activity
- Clean expired tokens monthly
- Revoke all sessions on security incidents

**For Frontend Developers:**
- Use `/auth/v2/login` for web (handles cookies automatically)
- Use `/auth/mobile/login` for mobile apps
- Include `credentials: 'include'` in fetch requests
- Store mobile refresh tokens securely

**For Security:**
- Never store tokens in localStorage
- Always use HttpOnly cookies for web
- Implement token rotation
- Monitor session anomalies
- Revoke tokens on password change

---

**Environment:** `NODE_ENV=production`, Port: `8080`
**Database:** MySQL 8.0+, Table: `refresh_tokens`
**Security:** JWT with HS256, Token hashing with SHA-256
