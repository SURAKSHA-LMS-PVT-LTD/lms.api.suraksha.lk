# OTP Verification System - Complete Implementation

## 📋 Overview

Complete OTP (One-Time Password) verification system for email and phone number validation with strict rate limiting and security controls.

## 🎯 Features

### ✅ Implemented
- ✅ 6-digit OTP generation
- ✅ 1-minute TTL (Time To Live) per OTP
- ✅ Daily rate limiting: 5 OTP requests per day (2 initial + 3 re-requests)
- ✅ Date-based tracking for daily limits
- ✅ Automatic invalidation of previous OTPs
- ✅ Email verification endpoints (request, verify, re-request)
- ✅ Phone verification endpoints (request, verify, re-request)
- ✅ Phone number normalization (+94XXXXXXXXX format)
- ✅ IP address logging for security
- ✅ API key authentication (SPECIAL_API_KEY)
- ✅ Comprehensive logging with request IDs
- ✅ Email & SMS integration
- ✅ Retry timestamp in error messages

## 🗂️ Database Schema

### Table: `user_otps`

```sql
CREATE TABLE `user_otps` (
  `id` INT PRIMARY KEY AUTO_INCREMENT,
  `userId` VARCHAR(255) NULL,
  `email` VARCHAR(255) NULL,
  `phoneNumber` VARCHAR(20) NULL,
  `otpCode` VARCHAR(6) NOT NULL,
  `otpType` ENUM('EMAIL', 'PHONE') NOT NULL,
  `otpPurpose` ENUM('VERIFICATION', 'PASSWORD_RESET', 'LOGIN') NOT NULL,
  `expiresAt` DATETIME NOT NULL,
  `createdDate` VARCHAR(10) NOT NULL COMMENT 'YYYY-MM-DD format for daily limits',
  `attempts` INT DEFAULT 0,
  `isVerified` BOOLEAN DEFAULT FALSE,
  `verifiedAt` DATETIME NULL,
  `ipAddress` VARCHAR(45) NULL,
  `createdAt` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  INDEX `idx_userId_otpType` (`userId`, `otpType`),
  INDEX `idx_createdDate` (`createdDate`)
);
```

### Key Fields

| Field | Type | Purpose |
|-------|------|---------|
| `email` | VARCHAR(255) | Email identifier for email OTPs |
| `phoneNumber` | VARCHAR(20) | Normalized phone (+94XXXXXXXXX) |
| `otpCode` | VARCHAR(6) | 6-digit verification code |
| `otpType` | ENUM | EMAIL or PHONE |
| `expiresAt` | DATETIME | Expiry timestamp (1 min from creation) |
| `createdDate` | VARCHAR(10) | Date string (YYYY-MM-DD) for daily counting |
| `attempts` | INT | Retry counter |
| `isVerified` | BOOLEAN | Verification status |
| `ipAddress` | VARCHAR(45) | Client IP for security audit |

## 🔌 API Endpoints

### 🔐 Authentication Required

All OTP endpoints require authentication using the `SPECIAL_API_KEY`:

```bash
Authorization: Bearer wvIcy1X3xreEL9CkT6KzFGqbsaHUZPVBYN0oiSDQR5pM2tudOl84gnjW7mJfhA
```

### 1. Request Email OTP

**Endpoint:** `POST /users/create-email-otp/request`  
**Authentication:** API Key required (`SPECIAL_API_KEY`)

**Request Body:**
```json
{
  "email": "user@example.com"
}
```

**Response:**
```json
{
  "success": true,
  "message": "OTP sent to user@example.com. Valid for 1 minute(s). 4 requests remaining today.",
  "expiresAt": "2024-01-20T10:35:00.000Z",
  "remainingAttempts": 4,
  "totalRequests": 1
}
```

**Rate Limit:** 5 requests per day per email (2 initial requests + 3 re-requests)

---

### 2. Verify Email OTP

**Endpoint:** `POST /users/create-email-otp/verify`  
**Authentication:** API Key required

**Request Body:**
```json
{
  "email": "user@example.com",
  "otpCode": "123456"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Email verified successfully"
}
```

**Error Response:**
```json
{
  "statusCode": 400,
  "message": "Invalid or expired OTP code",
  "error": "Bad Request"
}
```

---

### 3. Re-request Email OTP

**Endpoint:** `POST /users/create-email-otp/re-request`  
**Authentication:** API Key required

**Request Body:**
```json
{
  "email": "user@example.com"
}
```

**Response:** Same as Request Email OTP

**Note:** Counts towards the daily limit of 2 requests

---

### 4. Request Phone OTP

**Endpoint:** `POST /users/create-phone-number-otp/request`  
**Authentication:** Public

**Request Body:**
```json
{
  "phoneNumber": "0771234567"
}
```

**Phone Number Formats Accepted:**
- `0771234567` (local format)
- `771234567` (without leading zero)
- `+94771234567` (international)
- `94771234567` (international without +)

**Response:**
```json
{
  "success": true,
  "message": "OTP sent to +94771234567. Valid for 1 minute(s).",
  "expiresAt": "2024-01-20T10:35:00.000Z",
  "remainingAttempts": 1
}
```

---

### 5. Verify Phone OTP

**Endpoint:** `POST /users/create-phone-number-otp/verify`  
**Authentication:** Public

**Request Body:**
```json
{
  "phoneNumber": "0771234567",
  "otpCode": "123456"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Phone number verified successfully"
}
```

---

### 6. Re-request Phone OTP

**Endpoint:** `POST /users/create-phone-number-otp/re-request`  
**Authentication:** Public

**Request Body:**
```json
{
  "phoneNumber": "0771234567"
}
```

**Response:** Same as Request Phone OTP

## 🔒 Security Features

### Rate Limiting
- **Daily Limit:** 5 OTP requests per day per identifier (email/phone)
  - First 2 requests: Initial OTP requests
  - Next 3 requests: Re-requests only
- **Tracking:** Uses `createdDate` field (YYYY-MM-DD) for daily counting
- **Reset:** Automatically resets at midnight UTC
- **Error Messages:** Include exact retry timestamp when limit is reached

### OTP Expiry
- **TTL:** 1 minute from creation
- **Auto-invalidation:** Previous unexpired OTPs are invalidated when new OTP is requested

### Phone Number Normalization
- All phone numbers stored in format: `+94XXXXXXXXX`
- Prevents duplicate entries with different formats
- Uses `normalizeSriLankanPhone()` utility

### IP Logging
- Client IP addresses logged for security audit
- Helps detect abuse patterns
- Can be used for IP-based rate limiting (future enhancement)

## 🛠️ Implementation Details

### File Structure
```
src/modules/user/
├── entities/
│   └── user-otp.entity.ts           # OTP database entity
├── dto/
│   └── otp.dto.ts                   # Request/Response DTOs
├── services/
│   └── user-otp.service.ts          # OTP business logic
├── user.service.ts                  # Delegates to OTP service
├── user.controller.ts               # 6 OTP endpoints
└── user.module.ts                   # Module registration
```

### Service Layer: `UserOtpService`

**Key Methods:**
- `requestEmailOtp(email, ipAddress)` - Generate and send email OTP
- `verifyEmailOtp(email, otpCode)` - Verify email OTP
- `requestPhoneOtp(phoneNumber, ipAddress)` - Generate and send phone OTP
- `verifyPhoneOtp(phoneNumber, otpCode)` - Verify phone OTP
- `checkDailyLimit(identifier, otpType)` - Check rate limits

**Private Helpers:**
- `generateOtpCode()` - Generate 6-digit random code
- `getTodayDate()` - Get YYYY-MM-DD formatted date string

### Daily Limit Logic

```typescript
const today = this.getTodayDate(); // "2024-01-20"
const count = await this.otpRepository.count({
  where: {
    email: identifier,
    createdDate: today
  }
});

if (count >= this.MAX_REQUESTS_PER_DAY) {
  const tomorrowDate = this.getTomorrowDate();
  throw new BadRequestException(
    `Daily OTP limit reached. Maximum 5 requests per day allowed. Please try again after ${tomorrowDate}.`
  );
}

// Check re-request limit (after 2nd request)
if (totalToday >= 2 && totalToday > 2) {
  const reRequestsUsed = totalToday - 2;
  if (reRequestsUsed >= 3) {
    const tomorrowDate = this.getTomorrowDate();
    throw new BadRequestException(
      `Re-request limit reached. Maximum 3 re-requests allowed. Please try again after ${tomorrowDate}.`
    );
  }
}
```

### OTP Invalidation

```typescript
// Invalidate previous OTPs before creating new one
await this.otpRepository.update(
  {
    email,
    isVerified: false,
    expiresAt: MoreThan(new Date()),
  },
  {
    expiresAt: new Date(), // Expire immediately
  },
);
```

## 📝 Logging Examples

### Request Email OTP
```
[req_1705750000123_abc123] 📧 Request Email OTP - Email: user@example.com, IP: 192.168.1.100
[req_1705750000123_abc123] ✅ Email OTP sent successfully - Remaining: 1
```

### Verify Email OTP
```
[req_1705750060456_def456] 🔍 Verify Email OTP - Email: user@example.com
[req_1705750060456_def456] ✅ Email verified successfully
```

### Daily Limit Reached
```
[req_1705750120789_ghi789] 📧 Request Email OTP - Email: user@example.com, IP: 192.168.1.100
❌ Daily OTP limit reached. Maximum 5 requests per day allowed. Please try again after 2024-11-22T00:00:00.000Z.
```

### Re-request Limit Reached
```
[req_1705750140456_mno345] 📧 Re-request Email OTP - Email: user@example.com, IP: 192.168.1.100
❌ Re-request limit reached. Maximum 3 re-requests allowed per day. Please try again after 2024-11-22T00:00:00.000Z.
```

## 🔧 Configuration

### Constants in `UserOtpService`
```typescript
private readonly OTP_EXPIRY_MINUTES = 1;        // 1 minute TTL
private readonly MAX_REQUESTS_PER_DAY = 5;      // Total requests per day
private readonly MAX_REREQUESTS_PER_DAY = 3;    // Re-request limit
```

### Environment Variables
No additional env variables required. Uses existing:
- Database connection from TypeORM
- SMS service credentials (for phone OTP sending)
- Email service credentials (for email OTP sending)

## 🚀 Testing

### Test Scenarios

#### 1. Successful Email OTP Flow
```bash
# Request OTP (with API Key)
curl -X POST http://localhost:8080/users/create-email-otp/request \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer wvIcy1X3xreEL9CkT6KzFGqbsaHUZPVBYN0oiSDQR5pM2tudOl84gnjW7mJfhA" \
  -d '{"email":"test@example.com"}'

# Verify OTP (with API Key)
curl -X POST http://localhost:8080/users/create-email-otp/verify \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer wvIcy1X3xreEL9CkT6KzFGqbsaHUZPVBYN0oiSDQR5pM2tudOl84gnjW7mJfhA" \
  -d '{"email":"test@example.com","otpCode":"123456"}'
```

#### 2. Daily Limit Test (5 requests, 3 re-requests)
```bash
# Request 1 (with API Key) - Initial request
curl -X POST http://localhost:8080/users/create-email-otp/request \
  -H "Authorization: Bearer wvIcy1X3xreEL9CkT6KzFGqbsaHUZPVBYN0oiSDQR5pM2tudOl84gnjW7mJfhA" \
  -d '{"email":"test@example.com"}'

# Request 2 (with API Key) - Second initial request
curl -X POST http://localhost:8080/users/create-email-otp/request \
  -H "Authorization: Bearer wvIcy1X3xreEL9CkT6KzFGqbsaHUZPVBYN0oiSDQR5pM2tudOl84gnjW7mJfhA" \
  -d '{"email":"test@example.com"}'

# Request 3 (with API Key) - Re-request 1
curl -X POST http://localhost:8080/users/create-email-otp/re-request \
  -H "Authorization: Bearer wvIcy1X3xreEL9CkT6KzFGqbsaHUZPVBYN0oiSDQR5pM2tudOl84gnjW7mJfhA" \
  -d '{"email":"test@example.com"}'

# Request 4 (with API Key) - Re-request 2
curl -X POST http://localhost:8080/users/create-email-otp/re-request \
  -H "Authorization: Bearer wvIcy1X3xreEL9CkT6KzFGqbsaHUZPVBYN0oiSDQR5pM2tudOl84gnjW7mJfhA" \
  -d '{"email":"test@example.com"}'

# Request 5 (with API Key) - Re-request 3 (last allowed)
curl -X POST http://localhost:8080/users/create-email-otp/re-request \
  -H "Authorization: Bearer wvIcy1X3xreEL9CkT6KzFGqbsaHUZPVBYN0oiSDQR5pM2tudOl84gnjW7mJfhA" \
  -d '{"email":"test@example.com"}'

# Request 6 (should fail - daily limit with timestamp)
curl -X POST http://localhost:8080/users/create-email-otp/re-request \
  -H "Authorization: Bearer wvIcy1X3xreEL9CkT6KzFGqbsaHUZPVBYN0oiSDQR5pM2tudOl84gnjW7mJfhA" \
  -d '{"email":"test@example.com"}'
# Expected: "Daily OTP limit reached... Please try again after 2024-11-22T00:00:00.000Z"
```

#### 3. Expired OTP Test
```bash
# Request OTP (with API Key)
curl -X POST http://localhost:8080/users/create-email-otp/request \
  -H "Authorization: Bearer wvIcy1X3xreEL9CkT6KzFGqbsaHUZPVBYN0oiSDQR5pM2tudOl84gnjW7mJfhA" \
  -d '{"email":"test@example.com"}'

# Wait 61 seconds

# Verify OTP (should fail - expired)
curl -X POST http://localhost:8080/users/create-email-otp/verify \
  -H "Authorization: Bearer wvIcy1X3xreEL9CkT6KzFGqbsaHUZPVBYN0oiSDQR5pM2tudOl84gnjW7mJfhA" \
  -d '{"email":"test@example.com","otpCode":"123456"}'
```

#### 4. Phone Number Normalization Test
```bash
# All these should normalize to +94771234567 (with API Key)
curl -X POST http://localhost:8080/users/create-phone-number-otp/request \
  -H "Authorization: Bearer wvIcy1X3xreEL9CkT6KzFGqbsaHUZPVBYN0oiSDQR5pM2tudOl84gnjW7mJfhA" \
  -d '{"phoneNumber":"0771234567"}'

curl -X POST http://localhost:8080/users/create-phone-number-otp/request \
  -H "Authorization: Bearer wvIcy1X3xreEL9CkT6KzFGqbsaHUZPVBYN0oiSDQR5pM2tudOl84gnjW7mJfhA" \
  -d '{"phoneNumber":"771234567"}'

curl -X POST http://localhost:8080/users/create-phone-number-otp/request \
  -H "Authorization: Bearer wvIcy1X3xreEL9CkT6KzFGqbsaHUZPVBYN0oiSDQR5pM2tudOl84gnjW7mJfhA" \
  -d '{"phoneNumber":"+94771234567"}'
```

## 📊 Database Queries

### Check Daily Usage
```sql
SELECT email, COUNT(*) as requests
FROM user_otps
WHERE createdDate = CURDATE()
GROUP BY email
HAVING requests >= 5;
```

### Check Re-request Usage
```sql
SELECT 
  email,
  COUNT(*) as total_requests,
  CASE 
    WHEN COUNT(*) > 2 THEN COUNT(*) - 2
    ELSE 0
  END as rerequests_used
FROM user_otps
WHERE createdDate = CURDATE()
GROUP BY email
ORDER BY total_requests DESC;
```

### Find Unverified OTPs
```sql
SELECT * FROM user_otps
WHERE isVerified = FALSE
  AND expiresAt > NOW()
ORDER BY createdAt DESC;
```

### Audit Log by IP
```sql
SELECT ipAddress, COUNT(*) as requests, DATE(createdAt) as date
FROM user_otps
WHERE createdDate >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)
GROUP BY ipAddress, date
ORDER BY requests DESC;
```

## ⚠️ Known Limitations & Future Enhancements

### Current Limitations
1. ✅ **SMS Integration:** Phone OTP sending implemented via SMSlenz provider
2. ✅ **Email Integration:** Email OTP sending implemented via AWS Lambda email server
3. ✅ **Rate Limiting:** 5 requests per day with 3 re-requests enforced
4. ✅ **Retry Timestamps:** Error messages include exact retry time
5. **IP Rate Limiting:** IP logging exists but no IP-based throttling yet

### Planned Enhancements
1. ✅ **SMS Service Integration:** COMPLETED
   ```typescript
   const smsResult = await this.smsProvider.sendSms({
     contact: normalizedPhone,
     message: `Your Suraksha LMS verification code is: ${otpCode}...`,
     senderId: 'SurakshaLMS',
   });
   ```

2. ✅ **Email Service Integration:** COMPLETED
   ```typescript
   await this.enhancedEmailService.sendOTP({
     email,
     otp: otpCode,
     userName: email.split('@')[0],
     expiryMinutes: '1',
     requestType: 'Email Verification',
     ipAddress,
   });
   ```

3. **Retry Limit Enforcement:**
   ```typescript
   if (otp.attempts >= this.MAX_RETRIES_PER_DAY) {
     throw new BadRequestException('Maximum retry attempts reached');
   }
   ```

4. **IP-based Rate Limiting:**
   - Add Redis-based IP throttling
   - Block suspicious IP patterns

5. **OTP Templates:**
   - Customizable email templates
   - SMS templates with branding

6. **Analytics Dashboard:**
   - OTP success rates
   - Failed verification tracking
   - Abuse detection metrics

## 🎨 Frontend Integration Example

### React/Next.js Example
```typescript
// API Key from environment
const API_KEY = 'wvIcy1X3xreEL9CkT6KzFGqbsaHUZPVBYN0oiSDQR5pM2tudOl84gnjW7mJfhA';

// Request OTP
const requestOtp = async (email: string) => {
  const response = await fetch('/users/create-email-otp/request', {
    method: 'POST',
    headers: { 
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${API_KEY}`
    },
    body: JSON.stringify({ email })
  });
  
  const data = await response.json();
  
  if (data.success) {
    setOtpExpiry(data.expiresAt);
    setRemainingAttempts(data.remainingAttempts);
  }
};

// Verify OTP
const verifyOtp = async (email: string, otpCode: string) => {
  const response = await fetch('/users/create-email-otp/verify', {
    method: 'POST',
    headers: { 
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${API_KEY}`
    },
    body: JSON.stringify({ email, otpCode })
  });
  
  const data = await response.json();
  return data.success;
};
```

## 📚 Related Documentation

- [COMPREHENSIVE_USER_CREATION_COMPLETE_GUIDE.md](./COMPREHENSIVE_USER_CREATION_COMPLETE_GUIDE.md) - User creation flow
- [COMPREHENSIVE_USER_VALIDATION_GUIDE.md](./COMPREHENSIVE_USER_VALIDATION_GUIDE.md) - Validation rules
- [API_DOCUMENTATION.md](./API_DOCUMENTATION.md) - Complete API reference
- [SECURITY_FIXES_COMPLETE_2024.md](./SECURITY_FIXES_COMPLETE_2024.md) - Security measures

## ✅ Completion Checklist

- [x] OTP entity created with daily tracking
- [x] OTP DTOs defined (request/verify for email/phone)
- [x] OTP service implemented with rate limiting
- [x] Daily limit: 5 requests per day (2 initial + 3 re-requests)
- [x] Retry timestamps in error messages (ISO 8601 format)
- [x] 6 controller endpoints added
- [x] Service layer delegation
- [x] Module registration (entity + service)
- [x] Phone number normalization
- [x] IP address logging
- [x] Comprehensive logging with request IDs
- [x] Swagger/OpenAPI documentation
- [x] SMS service integration (SMSlenz provider)
- [x] Email service integration (AWS Lambda email server)
- [x] API key authentication (SPECIAL_API_KEY)
- [ ] Frontend integration testing
- [ ] Load testing (1000+ concurrent OTP requests)

## 📧📱 Integration Details

### Email Service (AWS Lambda)
- **Service:** EnhancedEmailService
- **Provider:** AWS Lambda email server
- **Endpoint:** https://oinc1jwcog.execute-api.us-east-1.amazonaws.com/default/email
- **Template:** 'otp' template with expiry time
- **Features:**
  - Professional email template
  - Shows OTP code, expiry time, and request IP
  - Branded with Suraksha LMS styling
  - Includes security warning

### SMS Service (SMSlenz)
- **Service:** SmslenzProvider
- **Provider:** SMSlenz API (https://smslenz.lk/api)
- **Sender ID:** SurakshaLMS (configurable)
- **Message Format:** "Your Suraksha LMS verification code is: {CODE}. Valid for 1 minute(s). Do not share this code."
- **Features:**
  - Instant SMS delivery
  - Credit balance tracking
  - Campaign ID for tracking
  - Error handling with fallback

### Error Handling
Both email and SMS sending failures are logged but **do not fail the request**:
- OTP is still saved in database
- User receives success response
- Background logs show delivery status
- Allows system to continue even if external services fail

### Rate Limiting Details

**Request Structure:**
- **Requests 1-2:** Initial OTP requests
- **Requests 3-5:** Re-requests only (3 re-requests allowed)
- **Total:** Maximum 5 OTPs per day per identifier

**Error Messages:**
- Include ISO 8601 timestamp for next retry (e.g., `2024-11-22T00:00:00.000Z`)
- Clear indication of when user can try again (after midnight UTC)

**Example Flow:**
```
Request 1 (Initial)    → Success - "4 requests remaining today"
Request 2 (Initial)    → Success - "3 requests remaining today"
Request 3 (Re-request) → Success - "2 requests remaining today" (1/3 re-requests)
Request 4 (Re-request) → Success - "1 request remaining today" (2/3 re-requests)
Request 5 (Re-request) → Success - "0 requests remaining today" (3/3 re-requests)
Request 6 (Re-request) → ❌ Error: "Daily OTP limit reached... Please try again after 2024-11-22T00:00:00.000Z"
```

## 📞 Support

For issues or questions:
- Check logs with request ID: `[req_timestamp_random]`
- Review database: `SELECT * FROM user_otps WHERE email = 'user@example.com'`
- Monitor rate limits: `SELECT COUNT(*) FROM user_otps WHERE createdDate = CURDATE()`

---

**Last Updated:** 2024-11-21  
**Version:** 1.3.0  
**Status:** ✅ Fully Implemented (No Throttling + Retry Timestamps)
