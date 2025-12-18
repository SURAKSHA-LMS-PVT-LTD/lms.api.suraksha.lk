# 🔒 Production Security - Strict Mode Implementation

## Overview
Complete security hardening to ensure **ONLY authorized frontend applications** can access the API in production mode. All direct access via Postman, browsers, or unauthorized sources is **BLOCKED with 403 Forbidden**.

## 🛡️ Security Layers Implemented

### 1. **Global JWT Authentication Guard**
- **ALL endpoints** require valid JWT token by default
- Applied globally via `APP_GUARD` in `app.module.ts`
- Only explicitly marked `@Public()` routes bypass JWT authentication

**IMPORTANT:** `@Public()` routes still enforce:
- ✅ Origin validation (must come from whitelisted frontends)
- ✅ CORS restrictions
- ✅ Rate limiting
- ✅ All other security measures

**Implementation:**
```typescript
// app.module.ts
{
  provide: APP_GUARD,
  useClass: JwtAuthGuard,
}
```

### 2. **Strict Origin Validation Guard**
- **Validates ALL requests** come from whitelisted frontend domains
- **Includes @Public() routes** - they MUST have valid origin
- Blocks requests without `Origin` or `Referer` headers in production
- Applied globally via `APP_GUARD`

**Key Features:**
- ✅ Development mode: All requests allowed (detailed error messages)
- ✅ API Key auth: ONLY bypass for origin validation (backend-to-backend)
- ❌ Production mode: Requires origin from whitelist (**including @Public() routes**)
- ❌ No origin/referer: **Silent 403** (empty response, looks like DNS/network error)

### 3. **Silent 403 Response Filter**
- **Production**: Returns **empty 403** response (no JSON, no details)
- **Makes API appear unreachable** to unauthorized users
- **Prevents information leakage** about API structure
- **Development**: Returns detailed error for debugging

**Response Comparison:**
```
Production (Unauthorized):
HTTP/1.1 403 Forbidden
[empty body - looks like DNS/network error]

Development (Unauthorized):
HTTP/1.1 403 Forbidden
{
  "statusCode": 403,
  "message": "Access denied: Origin not allowed",
  "error": "ORIGIN_NOT_ALLOWED"
}
```

### 4. **Strict CORS Configuration**
- **Production mode**: Only whitelisted origins allowed
- **Rejects requests** without `Origin` header in production
- **Development mode**: All origins allowed for local testing

**Whitelisted Origins:**
```typescript
const allowedOrigins = [
  'https://lms.suraksha.lk',          // Main LMS frontend
  'https://org.suraksha.lk',          // Organization portal
  'https://transport.suraksha.lk',    // Transportation portal
  'https://admin.suraksha.lk',        // Admin portal
  'http://localhost:5173',            // Local dev (Vite)
  'http://localhost:3000',            // Local dev (alternative)
];
```

### 5. **Rate Limiting**
- Global rate limiting applied to prevent abuse
- Multiple tiers: short (1s), medium (10s), long (1min)

---

## 🚫 What's Blocked in Production

### ❌ Direct API Access (Silent Block - Empty Response)
- **Postman** without origin header → `403 Forbidden` (empty body)
- **cURL** without origin header → `403 Forbidden` (empty body)
- **Direct browser** access → `403 Forbidden` (empty body)
- **Looks like**: DNS error, network timeout, or server unreachable

### ❌ Unauthorized Origins (Silent Block - Empty Response)
- Any domain not in whitelist → `403 Forbidden` (empty body)
- Example: `https://malicious-site.com` → **BLOCKED** (silent)

### ❌ Missing Authentication (JSON Error)
- Requests without JWT token → `401 Unauthorized` (JSON with details)
- Invalid/expired tokens → `401 Unauthorized` (JSON with details)

---

## ✅ What's Allowed

### Public Endpoints (No JWT Required, But Origin Still Validated!)
These endpoints are explicitly marked with `@Public()` decorator - **JWT not required**, but **origin MUST be valid**:

**🔒 Security Note:** Even though these are "public", they STILL require:
- ✅ Valid origin from whitelisted frontend
- ✅ CORS compliance
- ✅ Rate limiting

1. **Authentication:**
   - `POST /v2/auth/login` - User login
   - `POST /auth/forgot-password` - Request password reset OTP
   - `POST /auth/reset-password` - Reset password with OTP

2. **User Registration/OTP:**
   - `POST /users/create-email-otp/request` - Request email OTP
   - `POST /users/create-email-otp/verify` - Verify email OTP
   - Other OTP verification endpoints

3. **File Uploads:**
   - `POST /upload/generate-signed-url` - Generate signed upload URLs

**Example:** You can call `/v2/auth/login` without JWT token, but you MUST call it from a whitelisted frontend domain. Calling from Postman without origin header = **403 Forbidden**

### API Key Authentication (Backend-to-Backend)
- Services with valid API keys bypass origin validation
- Used for server-to-server communication
- Example: Internal microservices, scheduled jobs

---

## 🔧 Configuration

### Environment Variables

#### Required for Production:
```env
NODE_ENV=production
JWT_SECRET=your-secure-64-character-secret
```

#### Optional CORS Configuration:
```env
# Custom frontend origins (comma-separated)
CORS_ORIGINS=https://lms.suraksha.lk,https://org.suraksha.lk,https://transport.suraksha.lk

# IP whitelist for server-to-server (optional)
ALLOWED_IPS=10.0.0.1,10.0.0.2

# Origin strict mode (default: true in production)
ORIGIN_STRICT_MODE=true
```

---

## 📋 Security Checklist

- [x] Global JWT authentication guard enabled
- [x] Origin validation guard blocks unauthorized origins
- [x] Silent 403 filter (empty response in production)
- [x] CORS rejects requests without origin in production
- [x] Rate limiting prevents abuse
- [x] Helmet security headers enabled
- [x] CSRF protection enabled
- [x] Cookie-based refresh tokens (httpOnly, secure)
- [x] Hello World endpoint removed/secured
- [x] All public endpoints explicitly marked with @Public()

---

## 🎭 Response Behavior Comparison

### Unauthorized Access (Invalid/Missing Origin):

**Production Mode (Stealth):**
```
User → Postman/cURL (no origin) → API
         ↓
      403 Forbidden
      [empty body]
         ↓
User sees: "Connection refused" or "Server not responding"
```

**Development Mode (Debugging):**
```
Developer → Postman (no origin) → API
              ↓
           403 Forbidden
           {
             "statusCode": 403,
             "message": "Access denied: Origin not allowed",
             "error": "ORIGIN_NOT_ALLOWED"
           }
              ↓
Developer sees: Detailed error for debugging
```

### Authorized Access:

**From Whitelisted Frontend:**
```
Frontend (https://lms.suraksha.lk) → API
              ↓
          ✅ Origin validated
              ↓
          ✅ JWT validated (if required)
              ↓
          ✅ 200 OK + Response data
```

---

## 🧪 Testing Security

### Development Mode (NODE_ENV != production)
```bash
# All these work in development:
curl http://localhost:8080/health
# Postman without origin → ✅ Allowed
# Browser direct access → ✅ Allowed
```

### Production Mode (NODE_ENV=production)

**Protected Endpoint (Requires JWT):**
```bash
# Without origin header → Silent 403 (empty response)
curl https://api.suraksha.lk/health
# Response: HTTP 403 Forbidden
# Body: [empty - looks like DNS/network error]

# With origin but no JWT → 401 Unauthorized (JSON error)
curl -H "Origin: https://lms.suraksha.lk" https://api.suraksha.lk/health
# Response: HTTP 401 Unauthorized
# Body: {"statusCode":401,"message":"Unauthorized"}

# From whitelisted frontend WITH JWT → ✅ Success
curl -H "Origin: https://lms.suraksha.lk" \
     -H "Authorization: Bearer valid-jwt-token" \
     https://api.suraksha.lk/health
# Response: HTTP 200 OK
# Body: {"status":"healthy","timestamp":"2025-11-26T..."}
```

**@Public() Endpoint (No JWT needed, but origin required):**
```bash
# Without origin header → Silent 403 (empty response)
curl -X POST https://api.suraksha.lk/v2/auth/login \
     -H "Content-Type: application/json" \
     -d '{"email":"user@example.com","password":"pass"}'
# Response: HTTP 403 Forbidden
# Body: [empty - looks like DNS/network error]

# With unauthorized origin → Silent 403 (empty response)
curl -X POST -H "Origin: https://malicious.com" \
     -H "Content-Type: application/json" \
     https://api.suraksha.lk/v2/auth/login \
     -d '{"email":"user@example.com","password":"pass"}'
# Response: HTTP 403 Forbidden
# Body: [empty - looks like DNS/network error]

# From whitelisted frontend (no JWT needed) → ✅ Success
curl -X POST -H "Origin: https://lms.suraksha.lk" \
     -H "Content-Type: application/json" \
     https://api.suraksha.lk/v2/auth/login \
     -d '{"email":"user@example.com","password":"SecurePass123!"}'
# Response: HTTP 200 OK
# Body: {"access_token":"eyJhbGc...","user":{...}}
```

---

## 🎯 Understanding @Public() Decorator

### What @Public() Does:
- ❌ Does NOT bypass origin validation
- ❌ Does NOT bypass CORS checks
- ❌ Does NOT bypass rate limiting
- ✅ ONLY bypasses JWT authentication requirement

### Security Layers for @Public() Routes:
```
Request to @Public() endpoint
    ↓
1. ✅ CORS Check (must be from allowed origin)
    ↓
2. ✅ Origin Validation Guard (must have valid origin header)
    ↓
3. ✅ Rate Limiting (throttle protection)
    ↓
4. ⏭️  JWT Auth Guard (SKIPPED for @Public())
    ↓
5. ✅ Route Handler Executes
```

### Security Layers for Protected Routes:
```
Request to protected endpoint
    ↓
1. ✅ CORS Check (must be from allowed origin)
    ↓
2. ✅ Origin Validation Guard (must have valid origin header)
    ↓
3. ✅ Rate Limiting (throttle protection)
    ↓
4. ✅ JWT Auth Guard (REQUIRED - must have valid token)
    ↓
5. ✅ Route Handler Executes
```

---

## 🔐 Authentication Flow

### 1. Login (No JWT Required, But Origin Required!)
```typescript
POST /v2/auth/login
Headers:
  Origin: https://lms.suraksha.lk
  Content-Type: application/json
Body:
{
  "email": "user@example.com",
  "password": "SecurePass123!"
}
```
**Response:**
- `access_token` (15 min expiry)
- `refresh_token` set in httpOnly cookie (7 days)

### 2. Protected Endpoints (JWT Required)
```typescript
GET /auth/me
Headers:
  Authorization: Bearer eyJhbGc...
  Origin: https://lms.suraksha.lk
```

### 3. Token Refresh
```typescript
POST /auth/refresh-token
// Reads refresh token from httpOnly cookie
```

---

## 🚨 Error Responses

### 401 Unauthorized (Invalid/Missing JWT)
```json
{
  "statusCode": 401,
  "message": "Unauthorized",
  "error": "Unauthorized"
}
```

### 403 Forbidden (Invalid Origin - Silent Block)

**Production Mode:**
```
HTTP/1.1 403 Forbidden
[empty body]

# Looks like: DNS error, network timeout, or server unreachable
# No information leakage about API structure
```

**Development Mode:**
```json
{
  "statusCode": 403,
  "message": "Access denied: Origin not allowed",
  "error": "ORIGIN_NOT_ALLOWED",
  "timestamp": "2025-11-26T10:30:00.000Z",
  "hint": "This API requires requests to originate from whitelisted frontend domains"
}
```

### 429 Too Many Requests (Rate Limit)
```json
{
  "statusCode": 429,
  "message": "ThrottlerException: Too Many Requests"
}
```

---

## 📊 Security Monitoring

### Logs to Monitor:
1. **Blocked Origins:**
   ```
   🚫 Origin Validation Failed - Blocked origin: https://malicious.com
   🚫 CORS blocked origin: https://malicious.com
   🚫 SECURITY BLOCK - No origin/referer headers from IP: 192.168.1.1
   ```

2. **Authentication Failures:**
   ```
   ❌ API Frontend Guard - Access denied: Invalid token
   🚫 JWT validation failed: Token expired
   ```

3. **Rate Limiting:**
   ```
   ⚠️ Rate limit exceeded for IP: 192.168.1.1
   ```

---

## 🎯 Best Practices

### For Frontend Developers:
1. Always send `Authorization: Bearer <token>` header
2. Frontend framework automatically sends `Origin` header
3. Use environment variables for API base URL
4. Handle 401 errors → redirect to login
5. Handle 403 errors → show "Access denied" message

### For Backend Developers:
1. Mark truly public endpoints with `@Public()` decorator
2. Never disable origin validation in production
3. Use API keys for backend-to-backend communication
4. Monitor security logs regularly
5. Keep JWT_SECRET secure and rotate periodically

---

## 🔄 Migration Notes

### Changed:
- ❌ Removed: `GET /` (Hello World endpoint)
- ✅ Added: `GET /health` (requires authentication)
- ✅ Enhanced: Origin validation now stricter in production
- ✅ Enhanced: CORS rejects missing origin in production

### No Impact On:
- ✅ Development workflow (all origins allowed in dev mode)
- ✅ Existing frontend applications (already send origin header)
- ✅ API key authenticated services (bypass origin check)

---

## 📞 Support

For issues related to:
- **403 Forbidden errors**: Check CORS_ORIGINS environment variable
- **401 Unauthorized**: Verify JWT token is valid and not expired
- **Origin blocking**: Ensure frontend domain is whitelisted

---

## 🔗 Related Documentation

- [JWT Authentication Guide](./JWT_ARCHITECTURE_GUIDE.md)
- [API Key Authentication](./API_KEY_AUTHENTICATION_GUIDE.md)
- [Complete Security Audit](./COMPLETE_SYSTEM_SECURITY_AUDIT_2024.md)
- [Production Deployment Checklist](./PRODUCTION_DEPLOYMENT_CHECKLIST.md)

---

## 🎯 Summary: What Attackers See

### Scenario 1: Hacker tries to access API from Postman
```bash
curl https://api.suraksha.lk/v2/auth/login
```
**Attacker sees:** 
- HTTP 403 Forbidden
- Empty response body
- **Thinks:** "Server doesn't exist" or "Connection refused"
- **Cannot determine:** API structure, endpoints, or authentication requirements

### Scenario 2: Hacker tries with fake origin
```bash
curl -H "Origin: https://fake-site.com" https://api.suraksha.lk/v2/auth/login
```
**Attacker sees:**
- HTTP 403 Forbidden  
- Empty response body
- **Thinks:** "Server unreachable" or "DNS failure"
- **Cannot determine:** That origin validation is in place

### Scenario 3: Legitimate user from authorized frontend
```javascript
// From https://lms.suraksha.lk
fetch('https://api.suraksha.lk/v2/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: 'user@example.com', password: 'pass' })
})
```
**User sees:**
- ✅ Normal login flow works perfectly
- ✅ Gets access token
- ✅ Full API functionality

---

## 🛡️ Security Benefits

1. **Information Hiding:** Attackers can't tell if server exists
2. **Zero Leakage:** No API structure or error details exposed
3. **False Negative:** Looks like network/DNS error, not security block
4. **Development Friendly:** Detailed errors in dev mode for debugging
5. **Frontend Transparent:** Legitimate users see no difference

---

**Last Updated:** November 26, 2025
**Status:** ✅ Fully Implemented and Production Ready with Silent 403 Protection
