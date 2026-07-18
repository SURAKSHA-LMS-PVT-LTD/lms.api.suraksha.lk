# 🔑 Multi-Identifier First Login — Frontend Implementation Guide

> **Version:** 2.0
> **Base URL:** `{{API_BASE}}/auth`
> **Auth:** Steps 1–2 are public. Steps 3+ require `Authorization: Bearer <token>` (received from Step 2).

---

## Identifier Types

Users can initiate first login using **any** of these identifiers:

| Type | Example | Auto-detected by |
|------|---------|------------------|
| Phone | `0771234567`, `+94771234567` | Starts with `0`, `94`, or `+94`, digits only |
| Email | `student@school.lk` | Contains `@` |
| User ID | `a1b2c3d4-uuid-format` | Anything else (UUID format) |

The backend auto-detects the type — the frontend just sends the raw string.

**Note:** This is a **global registration** flow, not institute-specific. Users should primarily use their **email** or **phone number**. User ID lookup is available but less common.

---

## Flow Overview

### **Phone/Email Login** (requires OTP):

```
┌──────────────────────────────┐
│  1. Enter Identifier         │  POST /auth/first-login/initiate
│     (phone or email)         │  → OTP sent via best channel
│     → Returns verification   │    (phone SMS or email)
│       requirements           │
└──────────────┬───────────────┘
               ▼
┌──────────────────────────────┐
│  2. Verify OTP               │  POST /auth/first-login/verify-otp
│     (phone or email)         │  → JWT + annotated profile
│     → Returns remaining      │    + remaining verifications
│       verifications          │
└──────────────┬───────────────┘
               ▼
    ┌──── Has more verifications? ────┐
    │ YES                              │ NO
    ▼                                  ▼
┌──────────────────────────┐   ┌────────────────────────────┐
│  3a. Add/Verify missing  │   │  3b. Go straight to        │
│      contact method      │   │      profile completion     │
│  (phone or email OTP)    │   │                             │
└──────────┬───────────────┘   └────────────┬────────────────┘
           ▼                                ▼
┌──────────────────────────────────────────────────┐
│  4. Complete Profile + Set Password              │  POST /auth/first-login/complete
│     → Real login tokens (access + refresh)       │
└──────────────────────────────────────────────────┘
```

### **User ID Login** (NO OTP required):

```
┌──────────────────────────────┐
│  1. Enter User ID            │  POST /auth/first-login/initiate
│     (UUID format)            │  → JWT issued immediately
│                              │    (no OTP sent)
└──────────────┬───────────────┘
               ▼
    ┌────── Contact Status? ──────┐
    │                              │
    ▼                              ▼
  No Contacts                Has Unverified Contacts
    │                              │
    ▼                              ▼
┌──────────────┐           ┌──────────────┐
│ Add Phone/   │           │ Verify       │
│ Email        │           │ Existing     │
│ → Verify     │           │ Contacts     │
└──────┬───────┘           └──────┬───────┘
       ▼                          ▼
┌──────────────────────────────────────┐
│  Complete Profile + Set Password     │
│  → Real login tokens                 │
└──────────────────────────────────────┘
```

---

## Scenarios by User Data

### **Phone/Email Login:**

| User Has | OTP sent via | After Step 2, still needs | In-flow add needed? |
|----------|-------------|---------------------------|---------------------|
| Phone only | SMS | Email verification | Yes — add email → verify email |
| Email only | Email | Phone verification | Yes — add phone → verify phone |
| Phone + Email | SMS (priority) | Email verification | No — request email OTP → verify |
| Neither | ❌ Error: Use User ID | N/A | Must use User ID login |

### **User ID Login:**

| User Has | OTP sent? | Response includes | Action needed |
|----------|-----------|-------------------|---------------|
| No contacts | ❌ No | `accessToken`, `requiresContactInfo: true` | Add phone/email → verify |
| Unverified contacts | ❌ No | `accessToken`, verification requirements | Verify existing contacts |
| Verified contacts | ❌ No | `accessToken` | Complete profile only |

**Note:** User ID login **skips OTP verification** because the User ID itself proves identity. Frontend receives `accessToken` immediately in Step 1.

---

## Step 1: Initiate First Login (Unified)

Send any identifier. Backend finds the user, determines required verifications, and sends OTP to the best available channel.

### Request

```
POST /auth/first-login/initiate
Content-Type: application/json

{
  "identifier": "0771234567"       // or "student@school.lk" or "user-uuid-id"
}
```

### Success Response (200)

#### **Phone/Email Login Response:**
```json
{
  "success": true,
  "message": "OTP sent via SMS to 077***4567. Valid for 15 minutes.",
  "otpSentVia": "phone",
  "maskedDestination": "077***4567",
  "expiresInMinutes": 15,
  "verificationsRequired": {
    "phone": true,
    "email": true
  },
  "userHasPhone": true,
  "userHasEmail": true,
  "userId": "uuid-here"
}
```

#### **User ID Login Response (No Contacts):**
```json
{
  "success": true,
  "message": "Please add your phone number or email to continue registration.",
  "otpSentVia": null,
  "maskedDestination": null,
  "expiresInMinutes": 0,
  "verificationsRequired": {
    "phone": false,
    "email": false
  },
  "userHasPhone": false,
  "userHasEmail": false,
  "userId": "uuid-here",
  "accessToken": "eyJhbG...",
  "requiresContactInfo": true
}
```

#### **User ID Login Response (Unverified Contacts):**
```json
{
  "success": true,
  "message": "Please verify your phone number (077***4567) and email (k***@school.lk) to continue.",
  "otpSentVia": null,
  "maskedDestination": null,
  "expiresInMinutes": 0,
  "verificationsRequired": {
    "phone": true,
    "email": true
  },
  "userHasPhone": true,
  "userHasEmail": true,
  "userId": "uuid-here",
  "accessToken": "eyJhbG...",
  "requiresContactInfo": false
}
```

#### **User ID Login Response (Verified Contacts):**
```json
{
  "success": true,
  "message": "User ID verified. Please complete your profile.",
  "otpSentVia": null,
  "maskedDestination": null,
  "expiresInMinutes": 0,
  "verificationsRequired": {
    "phone": false,
    "email": false
  },
  "userHasPhone": true,
  "userHasEmail": true,
  "userId": "uuid-here",
  "accessToken": "eyJhbG...",
  "requiresContactInfo": false
}
```

### Response Fields

| Field | Type | Description |
|-------|------|-------------|
| `otpSentVia` | `"phone"` \| `"email"` \| `null` | Channel OTP was sent (null for User ID login) |
| `maskedDestination` | `string` \| `null` | Masked phone/email for display |
| `verificationsRequired.phone` | `boolean` | Whether phone verification is needed |
| `verificationsRequired.email` | `boolean` | Whether email verification is needed |
| `userHasPhone` | `boolean` | Whether user has a phone number on file |
| `userHasEmail` | `boolean` | Whether user has an email on file |
| `accessToken` | `string?` | **Only present for User ID login** - JWT for subsequent steps |
| `requiresContactInfo` | `boolean?` | **Only present for User ID login** - Whether user needs to add contacts |

### Error Responses

| Status | Scenario |
|--------|----------|
| 400 | **(Phone/Email only)** No contact info — tell user to use User ID |
| 400 | First login already completed — redirect to regular login |
| 404 | No user found with this identifier |
| 429 | Rate limited (3 requests per 15 minutes) |

### Frontend Logic

```typescript
const res = await fetch(`${API_BASE}/auth/first-login/initiate`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ identifier: userInput.trim() })
});

const data = await res.json();

if (data.success) {
  // Check if User ID login (has accessToken)
  if (data.accessToken) {
    // User ID login - store token and skip OTP
    localStorage.setItem('firstLoginToken', data.accessToken);
    setUserId(data.userId);
    setVerificationsRequired(data.verificationsRequired);
    
    if (data.requiresContactInfo) {
      // No contacts - show add contact form
      navigateTo('add-contact');
    } else if (data.verificationsRequired.phone || data.verificationsRequired.email) {
      // Has unverified contacts - show verify contact form
      navigateTo('verify-contacts');
    } else {
      // All verified - go to profile completion
      navigateTo('complete-profile');
    }
  } else {
    // Phone/Email login - OTP sent
    setOtpChannel(data.otpSentVia);
    setIdentifier(userInput.trim());
    setVerificationsRequired(data.verificationsRequired);
    setUserHasPhone(data.userHasPhone);
    setUserHasEmail(data.userHasEmail);
    
    showMessage(`OTP sent via ${data.otpSentVia === 'phone' ? 'SMS' : 'email'} to ${data.maskedDestination}`);
    navigateTo('verify-otp');
  }
}
```

---

## Step 2: Verify OTP (Phone or Email)

Verify the OTP received in Step 1. On success, returns a JWT for subsequent steps plus the annotated profile.

### Request

```
POST /auth/first-login/verify-otp
Content-Type: application/json

{
  "identifier": "0771234567",
  "otp": "123456",
  "channel": "phone"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `identifier` | `string` | ✅ | Same identifier used in Step 1 |
| `otp` | `string` | ✅ | 6-digit OTP code |
| `channel` | `"phone"` \| `"email"` | ✅ | Must match `otpSentVia` from Step 1 |

### Success Response (200)

```json
{
  "success": true,
  "message": "Phone verified successfully. Complete your profile.",
  "access_token": "eyJhb...",
  "userId": "uuid-here",
  "isPhoneVerified": true,
  "isEmailVerified": false,
  "hasPassword": false,
  "verificationsStillRequired": {
    "phone": false,
    "email": true
  },
  "userHasPhone": true,
  "userHasEmail": true,
  "profile": {
    "id": { "value": "uuid", "editable": false, "required": false },
    "firstName": { "value": "Kasun", "editable": true, "required": true },
    "lastName": { "value": null, "editable": true, "required": true },
    "nameWithInitials": { "value": null, "editable": true, "required": false },
    "email": {
      "value": "kasun@school.lk",
      "editable": false,
      "required": true,
      "needsVerification": true,
      "isVerified": false
    },
    "phoneNumber": {
      "value": "+94771234567",
      "editable": false,
      "required": true,
      "needsVerification": false,
      "isVerified": true
    },
    "userType": {
      "value": "USER",
      "editable": true,
      "required": true,
      "options": ["USER", "USER_WITHOUT_PARENT", "USER_WITHOUT_STUDENT"]
    },
    "dateOfBirth": { "value": null, "editable": true, "required": false },
    "gender": { "value": null, "editable": true, "required": false, "options": ["MALE","FEMALE","OTHER"] },
    "nic": { "value": null, "editable": true, "required": false },
    "birthCertificateNo": { "value": null, "editable": false, "required": false },
    "addressLine1": { "value": null, "editable": true, "required": false },
    "addressLine2": { "value": null, "editable": true, "required": false },
    "city": { "value": null, "editable": true, "required": false },
    "district": { "value": null, "editable": true, "required": false },
    "province": { "value": null, "editable": true, "required": false },
    "country": { "value": "SRI_LANKA", "editable": true, "required": false },
    "imageUrl": { "value": null, "editable": true, "required": false }
  },
  "studentFields": {
    "studentId": { "value": "STU-0001", "editable": false, "required": false },
    "emergencyContact": { "value": null, "editable": true, "required": false },
    "medicalConditions": { "value": null, "editable": true, "required": false },
    "allergies": { "value": null, "editable": true, "required": false },
    "bloodGroup": {
      "value": null, "editable": true, "required": false,
      "options": ["A+","A-","B+","B-","AB+","AB-","O+","O-"]
    }
  },
  "parentFields": {
    "occupation": { "value": null, "editable": true, "required": false },
    "workplace": { "value": null, "editable": true, "required": false },
    "workPhone": { "value": null, "editable": true, "required": false },
    "educationLevel": { "value": null, "editable": true, "required": false }
  }
}
```

### Key Response Fields

| Field | Description |
|-------|-------------|
| `access_token` | JWT for all subsequent steps (30-day expiry) |
| `verificationsStillRequired` | What else needs verifying before profile completion |
| `profile.email.needsVerification` | `true` if email exists but isn't verified yet |
| `profile.email.isVerified` | Current verification status |
| `profile.phoneNumber.needsVerification` | `true` if phone exists but isn't verified yet |
| `profile.phoneNumber.isVerified` | Current verification status |
| `profile.*.editable` | Whether frontend should show this as an editable field |
| `profile.*.required` | Whether this field must be filled to complete profile |
| `studentFields` | Present only if user has a student record |
| `parentFields` | Present only if user has a parent record |

### Frontend Logic After Step 2

```typescript
const res = await fetch(`${API_BASE}/auth/first-login/verify-otp`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    identifier: storedIdentifier,
    otp: otpInput,
    channel: storedOtpChannel  // 'phone' or 'email'
  })
});

const data = await res.json();

if (data.success) {
  // Store JWT for all subsequent requests
  localStorage.setItem('firstLoginToken', data.access_token);

  // Store annotated profile for form rendering
  setProfile(data.profile);
  setStudentFields(data.studentFields);
  setParentFields(data.parentFields);

  // Check what's still required
  const { phone, email } = data.verificationsStillRequired;

  if (phone || email) {
    // Need more verifications — show verification step
    navigateTo('additional-verification', {
      needsPhone: phone,
      needsEmail: email,
      userHasPhone: data.userHasPhone,
      userHasEmail: data.userHasEmail
    });
  } else {
    // All verifications done — go straight to profile form
    navigateTo('complete-profile');
  }
}
```

---

## Step 3: Additional Verification (If Needed)

After Step 2, if `verificationsStillRequired.phone` or `verificationsStillRequired.email` is `true`, the user must complete those verifications before profile completion.

All endpoints in this step require `Authorization: Bearer <token>` from Step 2.

### 3A. Phone Verification (In-Flow)

Use when user needs to add/verify a phone number (e.g., initiated by email or systemId, phone not yet verified).

#### Request Phone OTP

```
POST /auth/first-login/phone/request-otp
Authorization: Bearer <token>
Content-Type: application/json

{
  "phoneNumber": "0771234567"
}
```

**Response (200):**
```json
{
  "success": true,
  "message": "OTP sent to 077***4567 via SMS. Valid for 15 minutes.",
  "expiresInMinutes": 15
}
```

> If the user has no phone on file, this endpoint also saves the phone number to their account. If the phone is already registered by another user, returns 400.

#### Verify Phone OTP

```
POST /auth/first-login/phone/verify-in-flow
Authorization: Bearer <token>
Content-Type: application/json

{
  "phoneNumber": "0771234567",
  "otp": "123456"
}
```

**Response (200):**
```json
{
  "success": true,
  "message": "Phone number verified successfully.",
  "phoneNumber": "+94771234567"
}
```

### 3B. Email Verification (In-Flow)

Use when user needs to add/verify an email (e.g., initiated by phone, email not yet verified, or user needs to provide email).

#### Request Email OTP

```
POST /auth/first-login/email/request-otp
Authorization: Bearer <token>
Content-Type: application/json

{
  "email": "student@school.lk"
}
```

**Response (200):**
```json
{
  "success": true,
  "message": "OTP sent to stu***@school.lk. Valid for 15 minutes.",
  "expiresInMinutes": 15
}
```

> If the email is already registered by another user, returns 400.

#### Verify Email OTP

```
POST /auth/first-login/email/verify
Authorization: Bearer <token>
Content-Type: application/json

{
  "email": "student@school.lk",
  "otpCode": "654321"
}
```

**Response (200):**
```json
{
  "success": true,
  "message": "Email verified successfully.",
  "email": "student@school.lk"
}
```

### Frontend Logic for Additional Verification

```typescript
const token = localStorage.getItem('firstLoginToken');
const headers = {
  'Content-Type': 'application/json',
  'Authorization': `Bearer ${token}`
};

// ── SCENARIO A: Email needs verification (user has email on file) ──
if (verificationsStillRequired.email && userHasEmail) {
  // Request OTP to existing email
  await fetch(`${API_BASE}/auth/first-login/email/request-otp`, {
    method: 'POST', headers,
    body: JSON.stringify({ email: profile.email.value })
  });
  // Show OTP input → verify
  const verifyRes = await fetch(`${API_BASE}/auth/first-login/email/verify`, {
    method: 'POST', headers,
    body: JSON.stringify({ email: profile.email.value, otpCode: otpInput })
  });
}

// ── SCENARIO B: Email needs verification (user has NO email) ──
if (verificationsStillRequired.email && !userHasEmail) {
  // Show email input field, then send OTP
  await fetch(`${API_BASE}/auth/first-login/email/request-otp`, {
    method: 'POST', headers,
    body: JSON.stringify({ email: newEmailInput })
  });
  // Show OTP input → verify
}

// ── SCENARIO C: Phone needs verification (user has NO phone) ──
if (verificationsStillRequired.phone && !userHasPhone) {
  // Show phone input field, then send OTP
  await fetch(`${API_BASE}/auth/first-login/phone/request-otp`, {
    method: 'POST', headers,
    body: JSON.stringify({ phoneNumber: newPhoneInput })
  });
  // Show OTP input → verify
  const verifyRes = await fetch(`${API_BASE}/auth/first-login/phone/verify-in-flow`, {
    method: 'POST', headers,
    body: JSON.stringify({ phoneNumber: newPhoneInput, otp: otpInput })
  });
}

// After all verifications are done → navigate to profile completion
navigateTo('complete-profile');
```

---

## Step 4: Complete Profile + Set Password

Send all profile data and password. Backend enforces that all required verifications are done.

### Request

```
POST /auth/first-login/complete
Authorization: Bearer <token>
Content-Type: application/json

{
  "firstName": "Kasun",
  "lastName": "Perera",
  "password": "MyStr0ng!Pass",
  "confirmPassword": "MyStr0ng!Pass",

  "nameWithInitials": "K. Perera",
  "userType": "USER",
  "dateOfBirth": "2005-03-15",
  "gender": "MALE",
  "nic": "200512345678",
  "addressLine1": "123 Main St",
  "addressLine2": "Colombo 05",
  "city": "Colombo",
  "district": "COLOMBO",
  "province": "WESTERN",
  "country": "SRI_LANKA",

  "emergencyContact": "0112345678",
  "medicalConditions": "None",
  "allergies": "None",
  "bloodGroup": "O+",

  "occupation": "Engineer",
  "workplace": "ABC Ltd",
  "workPhone": "0112345679",
  "educationLevel": "Bachelor's Degree"
}
```

### Required Fields

| Field | Required | Notes |
|-------|----------|-------|
| `firstName` | ✅ | |
| `lastName` | ✅ | |
| `password` | ✅ | Must be strong (min 8 chars, upper, lower, number, special) |
| `confirmPassword` | ✅ | Must match `password` |
| All other fields | Optional | Send only what the user filled in |

### Backend Validation Before Save

The backend rejects the request if:
- User has phone → phone **must** be verified (`isPhoneVerified = true`)
- User has email → email **must** be verified (`isEmailVerified = true`)
- User has neither phone nor email → error (contact admin)
- Passwords don't match

### Success Response (200)

```json
{
  "success": true,
  "message": "Profile completed and logged in successfully.",
  "access_token": "eyJhb...",
  "refresh_token": "eyJhb...",
  "expires_in": "24h",
  "refresh_expires_in": "7d",
  "user": {
    "id": "uuid",
    "email": "kasun@school.lk",
    "firstName": "Kasun",
    "lastName": "Perera",
    "userType": "USER",
    "role": "user",
    "imageUrl": null,
    "phoneNumber": "+94771234567"
  }
}
```

> **After this response**, discard the first-login JWT and use `access_token` / `refresh_token` for all normal app operations.

---

## Complete Flow Examples

### Example A: User has Phone + Email, initiates with Phone

```
1. POST /auth/first-login/initiate  { identifier: "0771234567" }
   → otpSentVia: "phone", verificationsRequired: { phone: true, email: true }

2. POST /auth/first-login/verify-otp  { identifier: "0771234567", otp: "123456", channel: "phone" }
   → JWT + profile, verificationsStillRequired: { phone: false, email: true }

3. POST /auth/first-login/email/request-otp  { email: "kasun@school.lk" }
   → Email OTP sent

4. POST /auth/first-login/email/verify  { email: "kasun@school.lk", otpCode: "654321" }
   → Email verified

5. POST /auth/first-login/complete  { firstName, lastName, password, ... }
   → Real login tokens
```

### Example B: User has Email Only, initiates with Email

```
1. POST /auth/first-login/initiate  { identifier: "kasun@school.lk" }
   → otpSentVia: "email", verificationsRequired: { phone: false, email: true }

2. POST /auth/first-login/verify-otp  { identifier: "kasun@school.lk", otp: "123456", channel: "email" }
   → JWT + profile, verificationsStillRequired: { phone: false, email: false }

3. POST /auth/first-login/complete  { firstName, lastName, password, ... }
   → Real login tokens
```

### Example C: User has Phone Only, initiates with User ID

**NEW: User ID login skips OTP!**

```
1. POST /auth/first-login/initiate  { identifier: "a1b2-c3d4-uuid" }
   → accessToken: "eyJhb...", message: "Please verify your phone number (077***4567) to continue."
   → verificationsRequired: { phone: true, email: false }

2. POST /auth/first-login/phone/request-otp  (use accessToken from step 1)
   → SMS OTP sent

3. POST /auth/first-login/phone/verify-in-flow  { phoneNumber: "0771234567", otp: "123456" }
   → Phone verified

4. (Optional) Add email if required:
   POST /auth/first-login/email/request-otp  { email: "newmail@school.lk" }
   POST /auth/first-login/email/verify  { email: "newmail@school.lk", otpCode: "654321" }

5. POST /auth/first-login/complete  { firstName, lastName, password, ... }
   → Real login tokens
```

### Example D: User has NO Contacts, initiates with User ID

**NEW: Must add contacts first!**

```
1. POST /auth/first-login/initiate  { identifier: "a1b2-c3d4-uuid" }
   → accessToken: "eyJhb...", message: "Please add your phone number or email to continue registration."
   → requiresContactInfo: true
   → verificationsRequired: { phone: false, email: false }

2. POST /auth/first-login/phone/request-otp  { phoneNumber: "0771234567" }
   → SMS OTP sent (user adds new phone)

3. POST /auth/first-login/phone/verify-in-flow  { phoneNumber: "0771234567", otp: "789012" }
   → Phone verified and added

4. POST /auth/first-login/email/request-otp  { email: "kasun@school.lk" }
   → Email OTP sent (user adds email)

5. POST /auth/first-login/email/verify  { email: "kasun@school.lk", otpCode: "654321" }
   → Email verified

6. POST /auth/first-login/complete  { firstName, lastName, password, ... }
   → Real login tokens
```

### Example E: User has Verified Contacts, initiates with User ID

**NEW: Skip straight to profile!**

```
1. POST /auth/first-login/initiate  { identifier: "a1b2-c3d4-uuid" }
   → accessToken: "eyJhb...", message: "User ID verified. Please complete your profile."
   → verificationsRequired: { phone: false, email: false }

2. POST /auth/first-login/complete  { firstName, lastName, password, ... }
   → Real login tokens
```

---

## Annotated Profile Field Reference

Each field in `profile`, `studentFields`, and `parentFields` follows this schema:

```typescript
interface AnnotatedField {
  value: any;              // Current value (null if not set)
  editable: boolean;       // Can the user change this?
  required: boolean;       // Must be filled to complete profile?
  options?: string[];      // Allowed values (for selects/dropdowns)
  needsVerification?: boolean;  // Does this field need OTP verification? (phone, email only)
  isVerified?: boolean;    // Is this field currently verified? (phone, email only)
}
```

### Rendering Rules

```typescript
function renderField(name: string, field: AnnotatedField) {
  if (!field.editable) {
    // Read-only display (e.g., studentId, birthCertificateNo)
    return <ReadOnlyField label={name} value={field.value} />;
  }

  if (field.options) {
    // Dropdown/select
    return <Select label={name} value={field.value} options={field.options} required={field.required} />;
  }

  if (field.needsVerification !== undefined) {
    // Phone or Email — show verification badge
    return (
      <VerifiableField
        label={name}
        value={field.value}
        isVerified={field.isVerified}
        needsVerification={field.needsVerification}
        onRequestOtp={() => requestVerificationOtp(name)}
      />
    );
  }

  // Regular text input
  return <TextInput label={name} value={field.value} required={field.required} />;
}
```

---

## Backward-Compatible Endpoints

These endpoints still work for existing phone-only integrations:

| Endpoint | Delegates to |
|----------|-------------|
| `POST /auth/first-login/phone/initiate` | `initiateFirstLoginUnified({ identifier: phoneNumber })` |
| `POST /auth/first-login/phone/verify` | `verifyFirstLoginOtp({ identifier: phoneNumber, otp, channel: 'phone' })` |

### Phone Initiate (Legacy)

```
POST /auth/first-login/phone/initiate
{ "phoneNumber": "0771234567" }

→ { success, message, expiresInMinutes }
```

### Phone Verify (Legacy)

```
POST /auth/first-login/phone/verify
{ "phoneNumber": "0771234567", "otp": "123456" }

→ Same response as /auth/first-login/verify-otp
```

---

## All Endpoints Summary

| # | Method | Endpoint | Auth | Body DTO | Purpose |
|---|--------|----------|------|----------|---------|
| 1 | POST | `/auth/first-login/initiate` | Public | `{ identifier }` | Find user, send OTP |
| 2 | POST | `/auth/first-login/verify-otp` | Public | `{ identifier, otp, channel }` | Verify initial OTP → JWT + profile |
| 3 | POST | `/auth/first-login/phone/request-otp` | Bearer | `{ phoneNumber }` | Send SMS OTP (in-flow) |
| 4 | POST | `/auth/first-login/phone/verify-in-flow` | Bearer | `{ phoneNumber, otp }` | Verify phone OTP (in-flow) |
| 5 | POST | `/auth/first-login/email/request-otp` | Bearer | `{ email }` | Send email OTP |
| 6 | POST | `/auth/first-login/email/verify` | Bearer | `{ email, otpCode }` | Verify email OTP |
| 7 | POST | `/auth/first-login/complete` | Bearer | Profile + password | Complete profile → real tokens |
| L1 | POST | `/auth/first-login/phone/initiate` | Public | `{ phoneNumber }` | Legacy phone initiate |
| L2 | POST | `/auth/first-login/phone/verify` | Public | `{ phoneNumber, otp }` | Legacy phone verify |

---

## Error Handling

### Common Error Responses

```json
{
  "statusCode": 400,
  "message": "Error description here",
  "error": "Bad Request"
}
```

| Status | Scenario | Frontend Action |
|--------|----------|-----------------|
| 400 | No contact info on account | Show "Contact your institute admin" |
| 400 | Already completed first login | Redirect to regular login page |
| 400 | Invalid/expired OTP | Show "Invalid code. Try again." |
| 400 | Too many OTP attempts (5+) | Show "Too many attempts. Request new code." |
| 400 | Phone/email taken by another user | Show "Already registered. Use different." |
| 400 | Verification incomplete (on /complete) | Show which verifications remain |
| 400 | Passwords don't match | Show password mismatch error |
| 404 | No user found | Show "No account found. Check your details." |
| 429 | Rate limited | Show "Too many requests. Wait 15 minutes." |

---

## Rate Limits

| Endpoint | Limit |
|----------|-------|
| `/first-login/initiate` | 3 requests / 15 min |
| `/first-login/verify-otp` | 5 attempts / 15 min |
| `/first-login/phone/initiate` | 3 requests / 15 min |
| `/first-login/phone/verify` | 5 attempts / 15 min |
| `/first-login/phone/request-otp` | 3 requests / 15 min |
| `/first-login/phone/verify-in-flow` | 5 attempts / 15 min |
| `/first-login/email/request-otp` | 3 requests / 15 min |
| `/first-login/email/verify` | 5 attempts / 15 min |

---

## Complete React Example

```tsx
import { useState } from 'react';

const API_BASE = process.env.REACT_APP_API_URL;

type Step = 'identifier' | 'verify-otp' | 'additional-verification' | 'complete-profile';

export function FirstLoginFlow() {
  const [step, setStep] = useState<Step>('identifier');
  const [identifier, setIdentifier] = useState('');
  const [otpChannel, setOtpChannel] = useState<'phone' | 'email'>('phone');
  const [maskedDest, setMaskedDest] = useState('');
  const [token, setToken] = useState('');
  const [profile, setProfile] = useState<any>(null);
  const [studentFields, setStudentFields] = useState<any>(null);
  const [parentFields, setParentFields] = useState<any>(null);
  const [verifications, setVerifications] = useState({ phone: false, email: false });
  const [userHas, setUserHas] = useState({ phone: false, email: false });
  const [otp, setOtp] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const headers = (withAuth = false) => ({
    'Content-Type': 'application/json',
    ...(withAuth && token ? { Authorization: `Bearer ${token}` } : {})
  });

  // ── Step 1: Initiate ──
  async function handleInitiate() {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${API_BASE}/auth/first-login/initiate`, {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({ identifier: identifier.trim() })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message);

      setOtpChannel(data.otpSentVia);
      setMaskedDest(data.maskedDestination);
      setVerifications(data.verificationsRequired);
      setUserHas({ phone: data.userHasPhone, email: data.userHasEmail });
      setStep('verify-otp');
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  // ── Step 2: Verify Initial OTP ──
  async function handleVerifyOtp() {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${API_BASE}/auth/first-login/verify-otp`, {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({
          identifier: identifier.trim(),
          otp,
          channel: otpChannel
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message);

      setToken(data.access_token);
      setProfile(data.profile);
      setStudentFields(data.studentFields);
      setParentFields(data.parentFields);

      const still = data.verificationsStillRequired;
      setVerifications(still);

      if (still.phone || still.email) {
        setStep('additional-verification');
      } else {
        setStep('complete-profile');
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  // ── Step 3: Additional Verification ──
  // Show email or phone verification forms based on what's needed
  // (Use the individual /email/request-otp, /email/verify,
  //  /phone/request-otp, /phone/verify-in-flow endpoints)

  // ── Step 4: Complete Profile ──
  async function handleComplete(formData: Record<string, any>) {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${API_BASE}/auth/first-login/complete`, {
        method: 'POST',
        headers: headers(true),
        body: JSON.stringify(formData)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message);

      // Save real tokens — done!
      localStorage.setItem('access_token', data.access_token);
      localStorage.setItem('refresh_token', data.refresh_token);
      window.location.href = '/dashboard';
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  // ... render based on `step`
}
```

---

## Token Lifecycle

| Token | Source | Expiry | Usage |
|-------|--------|--------|-------|
| First-login JWT | Step 2 verify-otp response | 30 days | Steps 3–4 (additional verifications + complete profile) |
| Access token | Step 4 complete response | 24 hours | Normal app API calls |
| Refresh token | Step 4 complete response | 7 days (30d with rememberMe) | Refresh access token |

---

## Migration Notes (v1 → v2)

If you were using the phone-only flow (v1):

| v1 Endpoint | v2 Equivalent | Change |
|-------------|---------------|--------|
| `POST /auth/first-login/phone/initiate` | Still works (backward compat) | No change needed |
| `POST /auth/first-login/phone/verify` | Still works (backward compat) | No change needed |
| N/A | `POST /auth/first-login/initiate` | **New** — accepts any identifier |
| N/A | `POST /auth/first-login/verify-otp` | **New** — verifies phone or email OTP |
| N/A | `POST /auth/first-login/phone/request-otp` | **New** — in-flow phone add |
| N/A | `POST /auth/first-login/phone/verify-in-flow` | **New** — in-flow phone verify |

The v1 legacy endpoints internally delegate to the v2 unified logic, so behavior is consistent.
