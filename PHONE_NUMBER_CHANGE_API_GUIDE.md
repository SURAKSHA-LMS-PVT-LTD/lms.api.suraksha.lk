# ðŸ“±ðŸ“§ Contact Details Change API Guide

## Overview

Authenticated users can change their own **phone number** or **email address** through a **2-step OTP verification flow**.

- Requires a valid **JWT token** â€” unauthenticated requests return `401`.
- Users can only change **their own** contact details â€” no admin override.
- The new contact point receives a 6-digit OTP (SMS for phone, email for email) before any change is committed.
- Built on the same OTP infrastructure used for registration verification.

---

## Phone Number Change

### Flow

```
User (authenticated)
        â”‚
        â–¼
POST /users/phone/change/request-otp
  { "phoneNumber": "0771234567" }
        â”‚
        â”œâ”€ Validates JWT â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ 401 if missing/invalid
        â”œâ”€ Normalizes phone (+94771234567)
        â”œâ”€ Rejects if same as current number â”€â”€â”€â”€ 400
        â”œâ”€ Rejects if taken by another user â”€â”€â”€â”€â”€ 400
        â”œâ”€ Enforces daily rate limit (max 5) â”€â”€â”€â”€â”€ 400 if exceeded
        â””â”€ Sends 6-digit OTP via SMS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ 200 âœ…
                â”‚
                â–¼
        User receives OTP via SMS: 482931
                â”‚
                â–¼
POST /users/phone/change/verify-otp
  { "phoneNumber": "0771234567", "otpCode": "482931" }
        â”‚
        â”œâ”€ Validates JWT â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ 401 if missing/invalid
        â”œâ”€ Finds matching unexpired OTP â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ 400 if not found
        â”œâ”€ Re-checks number not taken (race guard) â”€ 400 if conflict
        â”œâ”€ Marks OTP as verified
        â””â”€ Updates user.phoneNumber â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ 200 âœ…
```

### Step 1 â€“ Request Phone OTP

```
POST /users/phone/change/request-otp
```

**Headers**

| Header | Value |
|---|---|
| `Authorization` | `Bearer <JWT_TOKEN>` |
| `Content-Type` | `application/json` |

**Request Body**

```json
{
  "phoneNumber": "0771234567"
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `phoneNumber` | string | âœ… | New Sri Lankan phone number. Accepts `077XXXXXXX`, `+94XXXXXXXXX`, `94XXXXXXXXX` formats. |

**Success Response â€“ 200 OK**

```json
{
  "success": true,
  "message": "OTP sent to +94771234567. Valid for 30 minute(s). 4 requests remaining today.",
  "expiresAt": "2026-03-04T10:30:00.000Z",
  "remainingAttempts": 4,
  "totalRequests": 1
}
```

**Error Responses**

| Status | Scenario | Example Message |
|---|---|---|
| `400` | Invalid phone number format | `"Invalid phone number format. Use Sri Lankan format e.g. 0771234567 or +94771234567."` |
| `400` | Same as current number | `"The new phone number is the same as your current phone number."` |
| `400` | Daily limit reached | `"Daily OTP limit reached. Maximum 5 requests per day. Retry after 2026-03-05T..."` |
| `400` | New number taken by another user | `"This phone number is already registered to another account. Please use a different number."` |
| `401` | Missing or invalid JWT | *(NestJS default 401 Unauthorized)* |

---

### Step 2 â€“ Verify Phone OTP & Commit

```
POST /users/phone/change/verify-otp
```

**Headers**

| Header | Value |
|---|---|
| `Authorization` | `Bearer <JWT_TOKEN>` |
| `Content-Type` | `application/json` |

**Request Body**

```json
{
  "phoneNumber": "0771234567",
  "otpCode": "482931"
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `phoneNumber` | string | âœ… | The **same** new phone number submitted in Step 1. |
| `otpCode` | string | âœ… | 6-digit numeric OTP received via SMS. |

**Success Response â€“ 200 OK**

```json
{
  "success": true,
  "message": "Phone number updated successfully.",
  "newPhoneNumber": "+94771234567"
}
```

**Error Responses**

| Status | Scenario | Example Message |
|---|---|---|
| `400` | Invalid or expired OTP | `"Invalid or expired OTP code. Please request a new OTP."` |
| `400` | Number just taken by another user (race) | `"This phone number has just been registered by another account."` |
| `401` | Missing or invalid JWT | *(NestJS default 401 Unauthorized)* |

---

## Email Address Change

### Flow

```
User (authenticated)
        â”‚
        â–¼
POST /users/email/change/request-otp
  { "email": "newaddress@example.com" }
        â”‚
        â”œâ”€ Validates JWT â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ 401 if missing/invalid
        â”œâ”€ Normalizes email (lowercase + trim)
        â”œâ”€ Rejects if same as current email â”€â”€â”€â”€â”€â”€ 400
        â”œâ”€ Rejects if taken by another user â”€â”€â”€â”€â”€â”€ 400
        â”œâ”€ Enforces daily rate limit (max 5) â”€â”€â”€â”€â”€ 400 if exceeded
        â””â”€ Sends 6-digit OTP via email â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ 200 âœ…
                â”‚
                â–¼
        User receives OTP in email inbox: 391847
                â”‚
                â–¼
POST /users/email/change/verify-otp
  { "email": "newaddress@example.com", "otpCode": "391847" }
        â”‚
        â”œâ”€ Validates JWT â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ 401 if missing/invalid
        â”œâ”€ Finds matching unexpired OTP â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ 400 if not found
        â”œâ”€ Re-checks email not taken (race guard) â”€â”€ 400 if conflict
        â”œâ”€ Marks OTP as verified
        â””â”€ Updates user.email â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ 200 âœ…
```

### Step 1 â€“ Request Email OTP

```
POST /users/email/change/request-otp
```

**Headers**

| Header | Value |
|---|---|
| `Authorization` | `Bearer <JWT_TOKEN>` |
| `Content-Type` | `application/json` |

**Request Body**

```json
{
  "email": "newaddress@example.com"
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `email` | string (email) | âœ… | New email address to verify. |

**Success Response â€“ 200 OK**

```json
{
  "success": true,
  "message": "OTP sent to newaddress@example.com. Valid for 30 minute(s). 4 requests remaining today.",
  "expiresAt": "2026-03-04T10:30:00.000Z",
  "remainingAttempts": 4,
  "totalRequests": 1
}
```

**Error Responses**

| Status | Scenario | Example Message |
|---|---|---|
| `400` | Same as current email | `"The new email address is the same as your current email address."` |
| `400` | Daily limit reached | `"Daily OTP limit reached. Maximum 5 requests per day. Retry after 2026-03-05T..."` |
| `400` | Email taken by another user | `"This email address is already registered to another account. Please use a different email."` |
| `401` | Missing or invalid JWT | *(NestJS default 401 Unauthorized)* |

---

### Step 2 â€“ Verify Email OTP & Commit

```
POST /users/email/change/verify-otp
```

**Headers**

| Header | Value |
|---|---|
| `Authorization` | `Bearer <JWT_TOKEN>` |
| `Content-Type` | `application/json` |

**Request Body**

```json
{
  "email": "newaddress@example.com",
  "otpCode": "391847"
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `email` | string (email) | âœ… | The **same** new email submitted in Step 1. |
| `otpCode` | string | âœ… | 6-digit numeric OTP received via email. |

**Success Response â€“ 200 OK**

```json
{
  "success": true,
  "message": "Email address updated successfully.",
  "newEmail": "newaddress@example.com"
}
```

**Error Responses**

| Status | Scenario | Example Message |
|---|---|---|
| `400` | Invalid or expired OTP | `"Invalid or expired OTP code. Please request a new OTP."` |
| `400` | Email just taken by another user (race) | `"This email address has just been registered by another account."` |
| `401` | Missing or invalid JWT | *(NestJS default 401 Unauthorized)* |

---

## Frontend Implementation

### React / Axios Example

```typescript
import axios from 'axios';

const API_BASE = 'https://api.suraksha.lk';

// â”€â”€â”€ Phone change â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

async function requestPhoneChangeOtp(newPhoneNumber: string, token: string) {
  const { data } = await axios.post(
    `${API_BASE}/users/phone/change/request-otp`,
    { phoneNumber: newPhoneNumber },
    { headers: { Authorization: `Bearer ${token}` } }
  );
  return data; // { success, message, expiresAt, remainingAttempts, totalRequests }
}

async function verifyPhoneChange(newPhoneNumber: string, otpCode: string, token: string) {
  const { data } = await axios.post(
    `${API_BASE}/users/phone/change/verify-otp`,
    { phoneNumber: newPhoneNumber, otpCode },
    { headers: { Authorization: `Bearer ${token}` } }
  );
  return data; // { success, message, newPhoneNumber }
}

// â”€â”€â”€ Email change â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

async function requestEmailChangeOtp(newEmail: string, token: string) {
  const { data } = await axios.post(
    `${API_BASE}/users/email/change/request-otp`,
    { email: newEmail },
    { headers: { Authorization: `Bearer ${token}` } }
  );
  return data; // { success, message, expiresAt, remainingAttempts, totalRequests }
}

async function verifyEmailChange(newEmail: string, otpCode: string, token: string) {
  const { data } = await axios.post(
    `${API_BASE}/users/email/change/verify-otp`,
    { email: newEmail, otpCode },
    { headers: { Authorization: `Bearer ${token}` } }
  );
  return data; // { success, message, newEmail }
}
```

### Recommended UI Flow (same pattern for both)

```
1. User fills in "New Phone / New Email" field
2. User clicks "Send OTP"
   â†’ Call requestPhoneChangeOtp() or requestEmailChangeOtp()
   â†’ Show countdown timer (OTP valid for 30 min)
   â†’ Show "Resend OTP" button (re-enabled after 60 s)

3. User enters 6-digit OTP
4. User clicks "Confirm Change"
   â†’ Call verifyPhoneChange() or verifyEmailChange()
   â†’ On success: update displayed value in profile UI
   â†’ On error: show error message, allow retry
```

### Error Handling

```typescript
try {
  await requestEmailChangeOtp(newEmail, token);
} catch (err) {
  if (err.response?.status === 400) {
    alert(err.response.data.message); // Show server message to user
  } else if (err.response?.status === 401) {
    // Token expired â€“ redirect to login
  }
}
```

---

## Security Design

| Concern | How it is handled |
|---|---|
| **Authentication** | Both sets of endpoints require `JwtAuthGuard` â€” unauthenticated requests fail with `401`. |
| **Self-only** | The `userId` is extracted from the JWT payload (`req.user.s`) and never accepted as a request parameter. A user cannot change another user's contact details. |
| **OTP binding** | The OTP is stored with `(userId, contact, otpCode, purpose=PHONE_CHANGE / EMAIL_CHANGE)`. All four must match at verify time. |
| **No skip** | The update only runs inside the verify method; it is impossible to update without a valid OTP. |
| **Race condition** | The new contact is checked for conflicts both at OTP request time and again at verify time. |
| **Rate limiting** | Maximum 5 OTP requests per day per contact value. Exceeding this returns `400`. |
| **OTP expiry** | OTPs expire after 30 minutes. A new request immediately invalidates any pending OTP for the same contact. |
| **OTP one-time use** | OTPs are marked `isVerified = true` on first use and cannot be replayed. |

---

## Phone Number Formats Accepted

| Input | Normalised |
|---|---|
| `0771234567` | `+94771234567` |
| `94771234567` | `+94771234567` |
| `+94771234567` | `+94771234567` |
| `0751234567` | `+94751234567` |

All Sri Lankan mobile prefixes are supported: `070`, `071`, `072`, `074`, `075`, `076`, `077`, `078`.

---

## Rate Limits (shared across phone & email change)

| Limit | Value |
|---|---|
| OTP requests per contact per day | **5** |
| Re-requests per day | **3** (within the 5 total) |
| OTP validity window | **30 minutes** |
| OTP digits | **6** |
| Maximum verify attempts per OTP | **1** (one-time use) |

> Daily limit resets at midnight Sri Lanka time (UTC+5:30).

