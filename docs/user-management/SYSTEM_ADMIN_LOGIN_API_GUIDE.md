# 🔐 System Admin Login Flow - Complete API Documentation

## Table of Contents
1. [Overview](#overview)
2. [System Admin Authentication](#system-admin-authentication)
3. [Login Flow](#login-flow)
4. [Session Management](#session-management)
5. [Admin API Endpoints](#admin-api-endpoints)
6. [Security & Best Practices](#security--best-practices)
7. [Troubleshooting](#troubleshooting)

---

## Overview

System administrators (SUPERADMIN) use the **same authentication endpoints** as regular users but receive elevated permissions based on their user type. The API automatically detects admin status during login and provides appropriate access tokens with admin privileges.

**Key Features:**
- ✅ Universal login endpoint (email, phone, system ID, birth certificate)
- ✅ Extended session support (30-day SSO with `rememberMe`)
- ✅ HttpOnly cookie-based (web) or token-based (mobile) authentication
- ✅ Automatic token rotation for security
- ✅ Session management across multiple devices
- ✅ Admin-specific endpoints and permissions

---

## System Admin Authentication

### User Types

System admins can have one of these user types:

| User Type | Database Value | Access Level |
|-----------|---------------|--------------|
| Super Admin | `SUPERADMIN` | Full system access |
| Institute Admin | `INSTITUTE_ADMIN` | Institute-level access |
| Teacher/Staff | `TEACHER` | Class/subject-level access |

### Token Structure for Admins

**Super Admin Token (Expanded Payload):**
```json
{
  "sub": "670c30d9-654d-472a-b4dd-59028920a4f0",
  "email": "superadmin@suraksha.com",
  "role": "super_admin",
  "userType": "SUPERADMIN",
  "iat": 1738915895,
  "exp": 1738919495
}
```

**Institute Admin Token (Compact Payload):**
```json
{
  "s": "2",                    // Session ID
  "u": 2,                      // User type: 2 = TEACHER/ADMIN
  "t": 1770735177,            // Issued at timestamp
  "i": [                       // Institute assignments
    {
      "i": "101",             // Institute ID
      "r": 1,                 // Role: 1 = INSTITUTE_ADMIN
      "c": []                 // Classes (empty for admins)
    }
  ],
  "iat": 1770735177,
  "exp": 1770738777
}
```

---

## Login Flow

### 1. Web Browser Login (Recommended for Admin Panel)

**Endpoint:** `POST /v2/auth/login`

**Base URL:** `http://localhost:8080` (development) or `https://api.suraksha.com` (production)

**Request:**
```http
POST /v2/auth/login HTTP/1.1
Content-Type: application/json
Host: localhost:8080

{
  "identifier": "superadmin@suraksha.com",
  "password": "AdminSecure123!",
  "rememberMe": true
}
```

**cURL Example:**
```bash
curl -X POST http://localhost:8080/v2/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "identifier": "superadmin@suraksha.com",
    "password": "AdminSecure123!",
    "rememberMe": true
  }' \
  -c cookies.txt  # Save cookies for subsequent requests
```

**PowerShell Example:**
```powershell
$loginData = @{
    identifier = "superadmin@suraksha.com"
    password = "AdminSecure123!"
    rememberMe = $true
} | ConvertTo-Json

$response = Invoke-RestMethod -Uri "http://localhost:8080/v2/auth/login" `
    -Method POST `
    -Body $loginData `
    -ContentType "application/json" `
    -SessionVariable session

# Save access token for API calls
$accessToken = $response.access_token
Write-Host "✅ Logged in as: $($response.user.email)"
Write-Host "🔑 Token expires in: $($response.expires_in) seconds"
```

**Response:**
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI2NzBjMzBkOS02NTRkLTQ3MmEtYjRkZC01OTAyODkyMGE0ZjAiLCJlbWFpbCI6InN1cGVyYWRtaW5Ac3VyYWtzaGEuY29tIiwicm9sZSI6InN1cGVyX2FkbWluIiwidXNlclR5cGUiOiJTVVBFUkFETUlOIiwiaWF0IjoxNzM4OTE1ODk1LCJleHAiOjE3Mzg5MTk0OTV9.Kq3HXQBN-6ID9I8cFAjGyMPH4QEuIbn5rCaO0ciXsOo",
  "refresh_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "expires_in": 3600,
  "refresh_expires_in": 2592000,
  "payload": {
    "sub": "670c30d9-654d-472a-b4dd-59028920a4f0",
    "email": "superadmin@suraksha.com",
    "role": "super_admin",
    "userType": "SUPERADMIN"
  },
  "user": {
    "id": "670c30d9-654d-472a-b4dd-59028920a4f0",
    "email": "superadmin@suraksha.com",
    "nameWithInitials": "Admin User",
    "userType": "SUPERADMIN",
    "imageUrl": null
  }
}
```

**Cookie Automatically Set:**
```
Set-Cookie: refresh_token=eyJhbGci...; 
  Path=/; 
  HttpOnly; 
  Secure; 
  SameSite=Strict; 
  Max-Age=2592000
```

### 2. Mobile Login (For Admin Mobile Apps)

**Endpoint:** `POST /v2/auth/login/mobile`

**Request:**
```http
POST /v2/auth/login/mobile HTTP/1.1
Content-Type: application/json

{
  "identifier": "admin@institute.com",
  "password": "AdminPass123!",
  "deviceId": "admin_device_1234567890_abc123",
  "deviceName": "Admin iPhone 13 Pro",
  "platform": "ios",
  "rememberMe": true
}
```

**PowerShell Example:**
```powershell
$mobileLogin = @{
    identifier = "admin@institute.com"
    password = "AdminPass123!"
    deviceId = "admin_device_$(Get-Date -UFormat %s)_$([guid]::NewGuid().ToString().Substring(0,8))"
    deviceName = "Admin PC - PowerShell"
    platform = "android"
    rememberMe = $true
} | ConvertTo-Json

$response = Invoke-RestMethod -Uri "http://localhost:8080/v2/auth/login/mobile" `
    -Method POST `
    -Body $mobileLogin `
    -ContentType "application/json"

# Store tokens securely
$accessToken = $response.access_token
$refreshToken = $response.refresh_token
```

**Response:**
```json
{
  "access_token": "eyJhbGci...",
  "refresh_token": "eyJhbGci...",
  "expires_in": 3600,
  "refresh_expires_in": 2592000,
  "payload": {
    "s": "2",
    "u": 2,
    "i": [{"i": "101", "r": 1}]
  },
  "user": {
    "id": "uuid",
    "email": "admin@institute.com",
    "nameWithInitials": "Admin Name",
    "userType": "INSTITUTE_ADMIN",
    "imageUrl": "https://..."
  }
}
```

### 3. Supported Identifier Types

System admins can login with any of these:

**Email:**
```json
{ "identifier": "admin@suraksha.com" }
```

**Phone Number:**
```json
{ "identifier": "+94771234567" }
{ "identifier": "0771234567" }
{ "identifier": "771234567" }
```

**System Registration Number (6 digits):**
```json
{ "identifier": "500001" }
```

**Birth Certificate Number:**
```json
{ "identifier": "199512345678" }
```

---

## Session Management

### Get Current User Info

**Endpoint:** `GET /auth/me`

**Request:**
```http
GET /auth/me HTTP/1.1
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**PowerShell:**
```powershell
$headers = @{
    Authorization = "Bearer $accessToken"
}

$userInfo = Invoke-RestMethod -Uri "http://localhost:8080/auth/me" `
    -Method GET `
    -Headers $headers

Write-Host "👤 User: $($userInfo.data.email)"
Write-Host "🎭 Type: $($userInfo.data.userType)"
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "670c30d9-654d-472a-b4dd-59028920a4f0",
    "firstName": "Super",
    "lastName": "Admin",
    "nameWithInitials": "S. Admin",
    "email": "superadmin@suraksha.com",
    "phoneNumber": "+94771234567",
    "userType": "SUPERADMIN",
    "imageUrl": null,
    "createdAt": "2024-01-01T00:00:00.000Z",
    "updatedAt": "2026-02-10T00:00:00.000Z"
  }
}
```

### Refresh Access Token (Web)

**Endpoint:** `POST /v2/auth/refresh`

**Request (using cookie):**
```http
POST /v2/auth/refresh HTTP/1.1
Cookie: refresh_token=eyJhbGci...
```

**PowerShell:**
```powershell
# Using saved session (cookies)
$newTokens = Invoke-RestMethod -Uri "http://localhost:8080/v2/auth/refresh" `
    -Method POST `
    -WebSession $session

$accessToken = $newTokens.access_token
Write-Host "♻️ Token refreshed"
```

**Alternative (refresh token in body):**
```powershell
$refreshData = @{
    refresh_token = $refreshToken
} | ConvertTo-Json

$newTokens = Invoke-RestMethod -Uri "http://localhost:8080/v2/auth/refresh" `
    -Method POST `
    -Body $refreshData `
    -ContentType "application/json"
```

**Response:**
```json
{
  "access_token": "new_eyJhbGci...",
  "refresh_token": "new_eyJhbGci...",
  "expires_in": 3600,
  "refresh_expires_in": 2592000,
  "user": {
    "id": "670c30d9-654d-472a-b4dd-59028920a4f0",
    "email": "superadmin@suraksha.com",
    "userType": "SUPERADMIN"
  }
}
```

### View All Active Sessions

**Endpoint:** `GET /auth/sessions`

**Request:**
```http
GET /auth/sessions?page=1&limit=10&sortBy=createdAt&sortOrder=DESC HTTP/1.1
Authorization: Bearer eyJhbGci...
```

**PowerShell:**
```powershell
$headers = @{
    Authorization = "Bearer $accessToken"
}

$sessions = Invoke-RestMethod -Uri "http://localhost:8080/auth/sessions?page=1&limit=20" `
    -Method GET `
    -Headers $headers

Write-Host "📱 Active sessions: $($sessions.pagination.total)"
foreach ($session in $sessions.sessions) {
    Write-Host "  🔹 $($session.platform) - $($session.deviceName) - Created: $($session.createdAt)"
}
```

**Response:**
```json
{
  "success": true,
  "sessions": [
    {
      "id": "session-uuid-1",
      "platform": "web",
      "deviceId": null,
      "deviceName": null,
      "ipAddress": "192.168.1.100",
      "userAgent": "Mozilla/5.0...",
      "createdAt": "2026-02-10T08:00:00.000Z",
      "expiresAt": "2026-03-12T08:00:00.000Z",
      "isCurrent": false,
      "expiresInHuman": "30 days"
    },
    {
      "id": "session-uuid-2",
      "platform": "android",
      "deviceId": "admin_device_123",
      "deviceName": "Admin Phone",
      "ipAddress": "192.168.1.101",
      "userAgent": "okhttp/4.9.0",
      "createdAt": "2026-02-09T10:30:00.000Z",
      "expiresAt": "2026-03-11T10:30:00.000Z",
      "isCurrent": false,
      "expiresInHuman": "29 days"
    }
  ],
  "pagination": {
    "total": 2,
    "page": 1,
    "limit": 10,
    "totalPages": 1,
    "hasNext": false,
    "hasPrev": false
  },
  "summary": {
    "total": 2,
    "web": 1,
    "android": 1,
    "ios": 0
  }
}
```

### Revoke Specific Session

**Endpoint:** `POST /auth/sessions/revoke/:sessionId`

**PowerShell:**
```powershell
$sessionId = "session-uuid-2"

$result = Invoke-RestMethod -Uri "http://localhost:8080/auth/sessions/revoke/$sessionId" `
    -Method POST `
    -Headers @{ Authorization = "Bearer $accessToken" }

Write-Host "✅ $($result.message)"
```

**Response:**
```json
{
  "success": true,
  "message": "Session revoked successfully",
  "sessionId": "session-uuid-2"
}
```

### Revoke All Sessions (Force Logout Everywhere)

**Endpoint:** `POST /auth/sessions/revoke-all`

**PowerShell:**
```powershell
$result = Invoke-RestMethod -Uri "http://localhost:8080/auth/sessions/revoke-all" `
    -Method POST `
    -Headers @{ Authorization = "Bearer $accessToken" }

Write-Host "🚨 Revoked $($result.revokedCount) sessions"
```

**Response:**
```json
{
  "success": true,
  "message": "All sessions revoked successfully",
  "revokedCount": 5
}
```

### Logout

**Endpoint:** `POST /auth/logout`

**PowerShell:**
```powershell
# Web logout (uses cookie)
$result = Invoke-RestMethod -Uri "http://localhost:8080/auth/logout" `
    -Method POST `
    -WebSession $session

Write-Host "👋 $($result.message)"
```

**Response:**
```json
{
  "success": true,
  "message": "Logged out successfully"
}
```

---

## Admin API Endpoints

### Making Authenticated Requests

All admin endpoints require the `Authorization` header:

**Request Template:**
```http
GET /admin/endpoint HTTP/1.1
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
Content-Type: application/json
```

**PowerShell Template:**
```powershell
$headers = @{
    Authorization = "Bearer $accessToken"
    "Content-Type" = "application/json"
}

$response = Invoke-RestMethod -Uri "http://localhost:8080/admin/endpoint" `
    -Method GET `
    -Headers $headers
```

### Example: Get Push Notifications (System Admin Only)

**Endpoint:** `GET /push-notifications/system`

**PowerShell:**
```powershell
$headers = @{
    Authorization = "Bearer $accessToken"
}

$notifications = Invoke-RestMethod -Uri "http://localhost:8080/push-notifications/system?page=1&limit=10" `
    -Method GET `
    -Headers $headers

foreach ($notif in $notifications.data) {
    Write-Host "📢 [$($notif.type)] $($notif.title)"
    Write-Host "   Sent: $($notif.sentAt)"
    Write-Host "   Recipients: $($notif.recipientCount)"
    Write-Host ""
}
```

### Example: Create Institute (Super Admin)

**Endpoint:** `POST /institutes`

**PowerShell:**
```powershell
$newInstitute = @{
    name = "New Academic Institute"
    registrationNumber = "INS2026001"
    addressLine1 = "123 Education Street"
    city = "Colombo"
    district = "COLOMBO"
    province = "WESTERN"
    email = "contact@institute.edu"
    phoneNumber = "+94112345678"
} | ConvertTo-Json

$headers = @{
    Authorization = "Bearer $accessToken"
    "Content-Type" = "application/json"
}

$institute = Invoke-RestMethod -Uri "http://localhost:8080/institutes" `
    -Method POST `
    -Body $newInstitute `
    -Headers $headers

Write-Host "✅ Institute created: $($institute.id)"
```

---

## Security & Best Practices

### 1. Token Storage

**Web Admin Panel (Browser):**
- ✅ Access token: Memory only (JavaScript variable)
- ✅ Refresh token: HttpOnly cookie (automatic)
- ❌ NEVER use localStorage
- ❌ NEVER use sessionStorage

**PowerShell Scripts:**
```powershell
# ✅ Store tokens in memory (secure variables)
$secureAccessToken = ConvertTo-SecureString $accessToken -AsPlainText -Force

# ✅ For long-running scripts, save encrypted
$accessToken | ConvertTo-SecureString -AsPlainText -Force | 
    ConvertFrom-SecureString | 
    Out-File ".\admin_token.enc"

# Load encrypted token
$accessToken = Get-Content ".\admin_token.enc" | 
    ConvertTo-SecureString | 
    ConvertFrom-SecureString -AsPlainText

# ❌ NEVER commit tokens to version control
# ❌ NEVER log tokens to console in production
```

### 2. Token Expiry Handling

**Automatic Refresh Strategy:**
```powershell
function Invoke-AdminApiRequest {
    param(
        [string]$Uri,
        [string]$Method = "GET",
        [object]$Body = $null
    )
    
    # Check if token is expired (simplified)
    $tokenExpiry = [DateTimeOffset]::FromUnixTimeSeconds($tokenPayload.exp).DateTime
    if ((Get-Date) -ge $tokenExpiry.AddMinutes(-5)) {
        Write-Host "🔄 Token expiring soon, refreshing..."
        $script:accessToken = Refresh-AccessToken
    }
    
    $headers = @{ Authorization = "Bearer $script:accessToken" }
    
    try {
        return Invoke-RestMethod -Uri $Uri -Method $Method -Headers $headers -Body $Body
    } catch {
        if ($_.Exception.Response.StatusCode -eq 401) {
            Write-Host "🔄 Token expired, refreshing..."
            $script:accessToken = Refresh-AccessToken
            $headers.Authorization = "Bearer $script:accessToken"
            return Invoke-RestMethod -Uri $Uri -Method $Method -Headers $headers -Body $Body
        }
        throw
    }
}
```

### 3. Rate Limiting

**Login Endpoints:**
- `/v2/auth/login`: 5 attempts per 15 minutes
- `/v2/auth/login/mobile`: 5 attempts per 15 minutes
- `/v2/auth/refresh`: 10 attempts per minute

**Handle Rate Limit:**
```powershell
try {
    $response = Invoke-RestMethod -Uri $loginUrl -Method POST -Body $loginData
} catch {
    if ($_.Exception.Response.StatusCode -eq 429) {
        Write-Host "⏳ Rate limit exceeded. Wait 15 minutes."
        # Implement exponential backoff
        Start-Sleep -Seconds 900
    }
}
```

### 4. Session Security

**Monitor Sessions:**
```powershell
# Weekly session audit script
$sessions = Invoke-RestMethod -Uri "http://localhost:8080/auth/sessions?limit=100" `
    -Headers @{ Authorization = "Bearer $accessToken" }

# Check for suspicious activity
$suspiciousSessions = $sessions.sessions | Where-Object {
    $_.ipAddress -notmatch "^192\.168\." -or
    $_.userAgent -match "curl|wget|python"
}

if ($suspiciousSessions.Count -gt 0) {
    Write-Warning "⚠️ Found $($suspiciousSessions.Count) suspicious sessions"
    # Optionally revoke them
}
```

**Force Password Reset on Breach:**
```powershell
# Revoke all sessions for a user (requires direct DB access or admin endpoint)
$userId = "user-uuid"
Invoke-RestMethod -Uri "http://localhost:8080/auth/sessions/revoke-all" `
    -Method POST `
    -Headers @{ Authorization = "Bearer $accessToken" }
```

---

## Troubleshooting

### Issue 1: "Unauthorized" on Login

**Symptoms:**
```json
{
  "statusCode": 401,
  "message": "Unauthorized",
  "error": "Invalid credentials"
}
```

**Solutions:**
1. Verify credentials:
```powershell
# Test with debug endpoint (development only)
$debugInfo = Invoke-RestMethod -Uri "http://localhost:8080/auth/debug-user/admin@suraksha.com" `
    -Headers @{ Authorization = "Bearer $superAdminToken" }

Write-Host "User exists: $($debugInfo.exists)"
Write-Host "Has password: $($debugInfo.hasPassword)"
Write-Host "Is active: $($debugInfo.isActive)"
```

2. Check user is active in database:
```sql
SELECT email, isActive, userType, profileStatus 
FROM users 
WHERE email = 'admin@suraksha.com';
```

3. Verify password complexity meets requirements

### Issue 2: Token Expired

**Symptoms:**
```json
{
  "statusCode": 401,
  "message": "Unauthorized",
  "error": "Token expired"
}
```

**Solution:**
```powershell
# Decode JWT to check expiry (requires jwt-cli or online tool)
# Or implement auto-refresh as shown in Security section

$newTokens = Invoke-RestMethod -Uri "http://localhost:8080/v2/auth/refresh" `
    -Method POST `
    -WebSession $session

$accessToken = $newTokens.access_token
```

### Issue 3: "Refresh token not found"

**Symptoms:**
```json
{
  "statusCode": 401,
  "message": "Invalid or expired refresh token"
}
```

**Causes:**
1. Refresh token expired (check `JWT_REFRESH_EXPIRES_IN` in .env)
2. Token was revoked (logout or session revocation)
3. Cookie not being sent (CORS issue)

**Solution:**
```powershell
# Check cookie is present
$session.Cookies.GetCookies("http://localhost:8080") | 
    Where-Object { $_.Name -eq "refresh_token" }

# If missing, login again
$response = Invoke-RestMethod -Uri "http://localhost:8080/v2/auth/login" `
    -Method POST `
    -Body $loginData `
    -ContentType "application/json" `
    -SessionVariable session
```

### Issue 4: CORS Error (Browser)

**Symptoms:**
```
Access to fetch at 'http://localhost:8080/v2/auth/login' from origin 'http://localhost:3000' 
has been blocked by CORS policy: The value of the 'Access-Control-Allow-Credentials' header 
in the response is '' which must be 'true' when the request's credentials mode is 'include'.
```

**Solution:**
Ensure backend CORS configuration includes:
```typescript
app.enableCors({
  origin: ['http://localhost:3000', 'https://admin.suraksha.com'],
  credentials: true,  // Required for cookies
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
});
```

Frontend fetch must include:
```javascript
fetch('http://localhost:8080/v2/auth/login', {
  method: 'POST',
  credentials: 'include',  // Required for cookies
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(loginData)
});
```

### Issue 5: Session Revoked Unexpectedly

**Check session status:**
```sql
SELECT 
  id,
  platform,
  deviceName,
  expiresAt,
  isRevoked,
  createdAt
FROM refresh_tokens
WHERE userId = 'user-uuid'
ORDER BY createdAt DESC
LIMIT 10;
```

**Common causes:**
- Mobile login revokes previous device token (by design)
- Admin revoked all sessions
- Token cleanup job removed expired tokens

---

## Complete PowerShell Login Example

```powershell
# ============================================================================
# SYSTEM ADMIN LOGIN SCRIPT
# ============================================================================

$baseUrl = "http://localhost:8080"
$adminEmail = "superadmin@suraksha.com"
$adminPassword = "AdminSecure123!"

# Step 1: Login
Write-Host "🔐 Logging in as $adminEmail..."
$loginData = @{
    identifier = $adminEmail
    password = $adminPassword
    rememberMe = $true
} | ConvertTo-Json

try {
    $loginResponse = Invoke-RestMethod -Uri "$baseUrl/v2/auth/login" `
        -Method POST `
        -Body $loginData `
        -ContentType "application/json" `
        -SessionVariable session
    
    $accessToken = $loginResponse.access_token
    $refreshToken = $loginResponse.refresh_token
    
    Write-Host "✅ Login successful!"
    Write-Host "   User: $($loginResponse.user.email)"
    Write-Host "   Type: $($loginResponse.user.userType)"
    Write-Host "   Token expires in: $($loginResponse.expires_in) seconds"
    
} catch {
    Write-Error "❌ Login failed: $($_.Exception.Message)"
    exit 1
}

# Step 2: Get current user info
Write-Host "`n👤 Fetching user profile..."
$headers = @{ Authorization = "Bearer $accessToken" }

$userInfo = Invoke-RestMethod -Uri "$baseUrl/auth/me" `
    -Method GET `
    -Headers $headers

Write-Host "   Name: $($userInfo.data.nameWithInitials)"
Write-Host "   Phone: $($userInfo.data.phoneNumber)"

# Step 3: List active sessions
Write-Host "`n📱 Active sessions:"
$sessions = Invoke-RestMethod -Uri "$baseUrl/auth/sessions?page=1&limit=5" `
    -Method GET `
    -Headers $headers

Write-Host "   Total: $($sessions.pagination.total)"
foreach ($session in $sessions.sessions) {
    Write-Host "   🔹 $($session.platform) - Created: $($session.createdAt)"
}

# Step 4: Make admin API call
Write-Host "`n📢 Fetching system notifications..."
$notifications = Invoke-RestMethod -Uri "$baseUrl/push-notifications/system?page=1&limit=3" `
    -Method GET `
    -Headers $headers

Write-Host "   Found $($notifications.pagination.total) notifications"

# Step 5: Logout
Write-Host "`n👋 Logging out..."
$logoutResult = Invoke-RestMethod -Uri "$baseUrl/auth/logout" `
    -Method POST `
    -WebSession $session

Write-Host "   $($logoutResult.message)"

Write-Host "`n✨ Script completed successfully!"
```

---

## Summary

**For System Admins:**
- Use `/v2/auth/login` for web admin panel
- Use `/v2/auth/login/mobile` for mobile admin apps
- Enable `rememberMe: true` for 30-day sessions
- Monitor sessions via `/auth/sessions`
- Revoke suspicious sessions immediately

**For API Integration:**
- Store access tokens in memory
- Implement automatic token refresh
- Handle 401 errors with retry logic
- Respect rate limits
- Use HttpOnly cookies for web

**Security Checklist:**
- ✅ Use HTTPS in production
- ✅ Enable `rememberMe` only on trusted devices
- ✅ Audit sessions weekly
- ✅ Rotate secrets regularly
- ✅ Monitor failed login attempts
- ✅ Implement IP whitelisting for super admins

---

**Environment:** Development: `http://localhost:8080` | Production: `https://api.suraksha.com`  
**Default Token Lifetime:** Access: 1 hour | Refresh: 7 days (30 days with rememberMe)  
**Rate Limits:** Login: 5/15min | Refresh: 10/min | API: Varies by endpoint
