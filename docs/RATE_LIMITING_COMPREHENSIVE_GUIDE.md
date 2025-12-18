# Comprehensive Rate Limiting Guide

## Overview
This document provides a complete overview of rate limiting implementation across all API endpoints in the LMS system to prevent abuse, brute force attacks, and resource exhaustion.

---

## Global Configuration

### ThrottlerModule Setup (app.module.ts)
```typescript
ThrottlerModule.forRoot([
  {
    name: 'short',
    ttl: 1000,    // 1 second
    limit: 3,     // 3 requests per second per IP
  },
  {
    name: 'medium',
    ttl: 10000,   // 10 seconds  
    limit: 20,    // 20 requests per 10 seconds per IP
  },
  {
    name: 'long',
    ttl: 60000,   // 1 minute
    limit: 100,   // 100 requests per minute per IP
  }
])
```

### Global Guard
```typescript
{
  provide: APP_GUARD,
  useClass: ThrottlerGuard,
}
```

**Default Protection**: All endpoints automatically protected with **100 requests per minute** unless overridden with `@Throttle` decorator.

---

## Rate Limiting Categories

### 🔴 Critical Security (Strictest)
**Limit**: 3-5 requests per 15 minutes  
**TTL**: 900000ms (15 minutes)  
**Purpose**: Prevent brute force attacks on authentication and password operations

### 🟡 Moderate Security
**Limit**: 5-20 requests per 15 minutes  
**TTL**: 900000ms (15 minutes)  
**Purpose**: Prevent abuse while allowing legitimate usage

### 🟢 Resource Intensive
**Limit**: 3-10 requests per minute  
**TTL**: 60000ms (1 minute)  
**Purpose**: Prevent resource exhaustion (SMS, file uploads, bulk operations)

### 🔵 Standard Operations
**Limit**: 100 requests per minute (Global Default)  
**TTL**: 60000ms (1 minute)  
**Purpose**: General API protection

---

## Endpoint-by-Endpoint Breakdown

### 🔐 Authentication Endpoints

#### `/v2/auth/login` (auth.v2.controller.ts)
- **Limit**: 5 attempts per 15 minutes
- **Category**: 🔴 Critical Security
- **Reason**: Prevent brute force login attacks
```typescript
@Throttle({ default: { limit: 5, ttl: 900000 } })
```

#### `/auth/first-login/initiate` (first-login.controller.ts)
- **Limit**: 3 attempts per 15 minutes
- **Category**: 🔴 Critical Security
- **Reason**: Prevent OTP spam attacks
```typescript
@Throttle({ default: { limit: 3, ttl: 900000 } })
```

#### `/auth/first-login/verify-otp` (first-login.controller.ts)
- **Limit**: 5 attempts per 15 minutes
- **Category**: 🔴 Critical Security
- **Reason**: Prevent OTP brute force
```typescript
@Throttle({ default: { limit: 5, ttl: 900000 } })
```

#### `/auth/first-login/set-password` (first-login.controller.ts)
- **Limit**: 3 attempts per 15 minutes
- **Category**: 🔴 Critical Security
- **Reason**: Prevent password enumeration
```typescript
@Throttle({ default: { limit: 3, ttl: 900000 } })
```

#### `/auth/first-login/resend-otp` (first-login.controller.ts)
- **Limit**: 2 attempts per 10 minutes
- **Category**: 🔴 Critical Security (Stricter)
- **Reason**: Prevent SMS/email flooding
```typescript
@Throttle({ default: { limit: 2, ttl: 600000 } })
```

---

### 🔑 Password Reset/Change Endpoints

#### `/auth/password/reset/initiate` (password-reset.controller.ts)
- **Limit**: 3 attempts per 15 minutes
- **Category**: 🔴 Critical Security
- **Reason**: Prevent password reset spam
```typescript
@Throttle({ default: { limit: 3, ttl: 900000 } })
```

#### `/auth/password/reset/verify-otp` (password-reset.controller.ts)
- **Limit**: 5 attempts per 15 minutes
- **Category**: 🔴 Critical Security
- **Reason**: Prevent OTP brute force
```typescript
@Throttle({ default: { limit: 5, ttl: 900000 } })
```

#### `/auth/password/reset/complete` (password-reset.controller.ts)
- **Limit**: 3 attempts per 15 minutes
- **Category**: 🔴 Critical Security
- **Reason**: Prevent password reset abuse
```typescript
@Throttle({ default: { limit: 3, ttl: 900000 } })
```

#### `/auth/password/change` (password-reset.controller.ts)
- **Limit**: 5 attempts per 15 minutes
- **Category**: 🔴 Critical Security
- **Reason**: Prevent password change abuse
```typescript
@Throttle({ default: { limit: 5, ttl: 900000 } })
```

#### `/auth/password/change/initiate` (password-reset.controller.ts)
- **Limit**: 3 attempts per 15 minutes
- **Category**: 🔴 Critical Security
- **Reason**: Prevent change request spam
```typescript
@Throttle({ default: { limit: 3, ttl: 900000 } })
```

#### `/auth/password/change/complete` (password-reset.controller.ts)
- **Limit**: 5 attempts per 15 minutes
- **Category**: 🔴 Critical Security
- **Reason**: Prevent password change completion abuse
```typescript
@Throttle({ default: { limit: 5, ttl: 900000 } })
```

---

### 👤 User Lookup Endpoints

#### `/users` search endpoints (user.controller.ts)
- **Limit**: 20 requests per 15 minutes
- **Category**: 🟡 Moderate Security
- **Reason**: Prevent user enumeration while allowing searches
```typescript
@Throttle({ default: { limit: 20, ttl: 900000 } })
```

Endpoints:
- `GET /users/search/by-institute-ids`
- `GET /users/search/by-email`
- `GET /users/search/by-phone`
- `GET /users/search/by-nic`

---

### 💰 Payment Endpoints

#### `POST /payment` (payment.controller.ts)
- **Limit**: 5 submissions per 15 minutes
- **Category**: 🟡 Moderate Security
- **Reason**: Prevent payment submission abuse and fraudulent uploads
```typescript
@Throttle({ default: { limit: 5, ttl: 900000 } })
```

**Note**: Other payment endpoints (verification, retrieval) use global default (100/min)

---

### 📱 SMS Endpoints

#### `POST /sms/instant/send-single` (instant-sms.controller.ts)
- **Limit**: 10 SMS per minute
- **Category**: 🟢 Resource Intensive
- **Reason**: Prevent SMS spam and cost abuse
```typescript
@Throttle({ default: { limit: 10, ttl: 60000 } })
```

#### `POST /sms/instant/send-bulk` (instant-sms.controller.ts)
- **Limit**: 3 bulk sends per minute
- **Category**: 🟢 Resource Intensive (Stricter)
- **Reason**: Prevent mass SMS abuse (can send to hundreds)
```typescript
@Throttle({ default: { limit: 3, ttl: 60000 } })
```

**Note**: SMS endpoints are critical cost centers. Rate limits prevent:
- Credit exhaustion attacks
- Spam campaigns
- Excessive API costs

---

### 📸 File Upload Endpoints

#### `POST /users/:id/profile-image` (user-profile-image.controller.ts)
- **Limit**: 5 uploads per 15 minutes
- **Category**: 🟡 Moderate Security
- **Reason**: Prevent storage abuse and resource exhaustion
```typescript
@Throttle({ default: { limit: 5, ttl: 900000 } })
```

#### `POST /users/:userId/upload-id-document` (user-profile-image.controller.ts)
- **Limit**: 5 uploads per 15 minutes
- **Category**: 🟡 Moderate Security
- **Reason**: Prevent storage abuse with larger files (up to 5MB)
```typescript
@Throttle({ default: { limit: 5, ttl: 900000 } })
```

**Additional Protection**:
- Max file size: 5MB
- File type validation (PNG for profile, PNG/JPG/PDF for ID docs)
- Malicious filename detection
- Image compression (WebP conversion for profile images)

---

## Response Headers

When rate limit is active, responses include:
```
X-RateLimit-Limit: 5
X-RateLimit-Remaining: 4
X-RateLimit-Reset: 1640995200
```

When rate limit is exceeded, returns:
```json
{
  "statusCode": 429,
  "message": "ThrottlerException: Too Many Requests",
  "error": "Too Many Requests"
}
```

---

## Testing Rate Limiting

### Test Login Rate Limit
```bash
# Should succeed
for i in {1..5}; do
  curl -X POST http://localhost:3000/v2/auth/login \
    -H "Content-Type: application/json" \
    -d '{"email":"test@example.com","password":"wrong"}'
done

# 6th request should return 429
curl -X POST http://localhost:3000/v2/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"wrong"}'
```

### Test SMS Rate Limit
```bash
# Should succeed 10 times
for i in {1..10}; do
  curl -X POST http://localhost:3000/sms/instant/send-single \
    -H "Authorization: Bearer YOUR_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"phone":"+94771234567","message":"Test"}'
  sleep 0.5
done

# 11th request within same minute should return 429
```

### Test File Upload Rate Limit
```bash
# Upload 5 times (should succeed)
for i in {1..5}; do
  curl -X POST http://localhost:3000/users/123/profile-image \
    -H "Authorization: Bearer YOUR_TOKEN" \
    -F "file=@profile.png"
  sleep 1
done

# 6th upload within 15 minutes should return 429
```

---

## Security Best Practices

### ✅ Implemented
- [x] Global rate limiting (100 req/min)
- [x] Custom limits on auth endpoints (3-5/15min)
- [x] Custom limits on password operations (3-5/15min)
- [x] Custom limits on SMS endpoints (3-10/min)
- [x] Custom limits on file uploads (5/15min)
- [x] Custom limits on payments (5/15min)
- [x] IP-based tracking
- [x] TTL-based expiration

### 🔄 Recommended Future Enhancements
- [ ] User-based rate limiting (track by user ID, not just IP)
- [ ] Redis storage for distributed rate limiting
- [ ] Different limits for authenticated vs anonymous users
- [ ] Rate limit dashboard/monitoring
- [ ] Configurable limits via environment variables
- [ ] Rate limit exemptions for trusted IPs
- [ ] Progressive rate limiting (exponential backoff)

---

## Environment Variables

Current environment variables for rate limiting:
```properties
# Global throttle settings (currently overridden by ThrottlerModule config)
THROTTLE_TTL=30000
THROTTLE_LIMIT=100

# Auth-specific limits (currently not used, using @Throttle decorators)
THROTTLE_LIMIT_LOGIN=10
RATE_LIMIT_WINDOW_SECONDS=30
RATE_LIMIT_MAX_REQUESTS=100
RATE_LIMIT_AUTH_MAX_REQUESTS=10
```

**Note**: Current implementation uses hardcoded limits in `@Throttle` decorators for precise control. Consider migrating to environment variables for production flexibility.

---

## Monitoring & Alerts

### Recommended Monitoring
1. **429 Error Rate**: Alert if >5% of requests return 429
2. **Per-Endpoint Limits**: Track which endpoints hit limits most
3. **IP Patterns**: Identify IPs hitting limits repeatedly
4. **Time Patterns**: Detect automated attacks (consistent timing)

### Log Examples
```
[ThrottlerGuard] IP 192.168.1.100 exceeded limit on POST /v2/auth/login (5/900000ms)
[ThrottlerGuard] IP 192.168.1.101 exceeded limit on POST /sms/instant/send-bulk (3/60000ms)
```

---

## Production Deployment

### Checklist
- [ ] Verify all critical endpoints have rate limiting
- [ ] Test rate limits in staging environment
- [ ] Monitor 429 error rates for 24 hours after deployment
- [ ] Document rate limits in API documentation
- [ ] Notify clients of rate limit headers
- [ ] Set up alerts for abnormal rate limit violations
- [ ] Consider Redis for distributed environments

### Load Balancer Considerations
If using multiple servers:
- **Without Redis**: Rate limits apply per server (100 req/min per server)
- **With Redis** (recommended): Rate limits apply globally across all servers

---

## Quick Reference Table

| Endpoint Category | Limit | TTL | Status |
|------------------|-------|-----|--------|
| **Authentication** | 3-5/15min | 900s | ✅ Protected |
| **Password Reset** | 3-5/15min | 900s | ✅ Protected |
| **User Lookups** | 20/15min | 900s | ✅ Protected |
| **SMS Single** | 10/min | 60s | ✅ Protected |
| **SMS Bulk** | 3/min | 60s | ✅ Protected |
| **File Uploads** | 5/15min | 900s | ✅ Protected |
| **Payments** | 5/15min | 900s | ✅ Protected |
| **All Other APIs** | 100/min | 60s | ✅ Protected (Global) |

---

## Summary

### Coverage Statistics
- **Total Controllers Audited**: 40+
- **Critical Endpoints Protected**: 20+
- **Global Protection**: All endpoints
- **Security Categories**: 4 (Critical, Moderate, Resource, Standard)

### Key Achievements
✅ Brute force protection on all auth endpoints  
✅ SMS cost abuse prevention  
✅ File upload resource protection  
✅ Payment fraud prevention  
✅ Global fallback protection  
✅ Comprehensive documentation  

### Attack Vectors Mitigated
- ✅ Brute force login attempts
- ✅ Password reset flooding
- ✅ OTP enumeration
- ✅ SMS spam/cost attacks
- ✅ Storage exhaustion (file uploads)
- ✅ Payment submission abuse
- ✅ User enumeration (with reasonable limits)
- ✅ DoS attacks (resource exhaustion)

---

**Last Updated**: 2024  
**Maintainer**: LMS Development Team  
**Review Frequency**: Quarterly or after security incidents
