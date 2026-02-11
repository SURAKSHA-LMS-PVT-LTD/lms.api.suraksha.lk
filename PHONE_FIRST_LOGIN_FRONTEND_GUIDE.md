# 📱 Phone-Based First Login — Frontend Implementation Guide

> **Version:** 1.0  
> **Base URL:** `{{API_BASE}}/auth`  
> **Auth:** Steps 1–2 are public. Steps 3–5 require `Authorization: Bearer <token>` (received from Step 2).

---

## Flow Overview

```
┌──────────────────────┐
│  1. Enter Phone      │  POST /auth/first-login/phone/initiate
│     → SMS OTP sent   │
└──────────┬───────────┘
           ▼
┌──────────────────────┐
│  2. Verify Phone OTP │  POST /auth/first-login/phone/verify
│     → JWT + Profile  │  ← Returns annotated profile fields
│       (annotated)    │     + temporary JWT (30d)
└──────────┬───────────┘
           ▼
┌──────────────────────┐
│  3. Enter Email      │  POST /auth/first-login/email/request-otp
│     → Email OTP sent │  (Authorization: Bearer <JWT>)
└──────────┬───────────┘
           ▼
┌──────────────────────┐
│  4. Verify Email OTP │  POST /auth/first-login/email/verify
│     → Email verified │  (Authorization: Bearer <JWT>)
└──────────┬───────────┘
           ▼
┌──────────────────────┐
│  5. Complete Profile │  POST /auth/first-login/complete
│     + Set Password   │  (Authorization: Bearer <JWT>)
│     → Real login     │  ← Returns access_token + refresh_token
│       tokens         │     (use for normal app access)
└──────────────────────┘
```

---

## Step 1: Initiate First Login by Phone

Send phone number. Backend finds the admin-created user and sends SMS OTP.

### Request

```
POST /auth/first-login/phone/initiate
Content-Type: application/json
```

```json
{
  "phoneNumber": "0771234567"
}
```

Accepted formats: `077XXXXXXX`, `94XXXXXXXXX`, `+94XXXXXXXXX`

### Response (200)

```json
{
  "success": true,
  "message": "OTP sent to 077***4567 via SMS. Valid for 15 minutes.",
  "expiresInMinutes": 15
}
```

### Errors

| Status | Condition | Message |
|--------|-----------|---------|
| 400 | Invalid phone format | `Invalid phone number format. Use Sri Lankan format: 077X, 94X, +94X` |
| 400 | Already completed first login | `First login already completed. Please use regular login.` |
| 404 | No user with this phone | `No user found with this phone number. Please contact your institute admin.` |
| 429 | Rate limit (3 per 15 min) | Throttle error |

### Frontend Implementation

```tsx
const [phone, setPhone] = useState('');
const [loading, setLoading] = useState(false);
const [error, setError] = useState('');

const handleInitiate = async () => {
  setLoading(true);
  setError('');
  try {
    const res = await fetch(`${API_BASE}/auth/first-login/phone/initiate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phoneNumber: phone }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message);
    // Navigate to OTP verification screen
    navigate('/first-login/verify-otp', { state: { phone } });
  } catch (err) {
    setError(err.message);
  } finally {
    setLoading(false);
  }
};
```

---

## Step 2: Verify Phone OTP → Get Annotated Profile

Verify the SMS OTP. On success, the phone is marked verified, and the backend returns:
- A **temporary JWT** (`access_token`) for subsequent steps
- The user's **annotated profile** — every field has metadata (value, editable, required, options)

### Request

```
POST /auth/first-login/phone/verify
Content-Type: application/json
```

```json
{
  "phoneNumber": "0771234567",
  "otp": "123456"
}
```

### Response (200)

```json
{
  "success": true,
  "message": "Phone verified successfully. Complete your profile.",
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "userId": "uuid-here",
  "isPhoneVerified": true,
  "isEmailVerified": false,
  "hasPassword": false,
  "profile": {
    "id":               { "value": "uuid-here",    "editable": false, "required": false },
    "firstName":        { "value": "Sugath",        "editable": true,  "required": true },
    "lastName":         { "value": null,            "editable": true,  "required": true },
    "nameWithInitials": { "value": null,            "editable": true,  "required": false },
    "email":            { "value": null,            "editable": true,  "required": true, "needsVerification": true },
    "phoneNumber":      { "value": "94771234567",   "editable": false, "required": true },
    "userType":         { "value": "USER",          "editable": true,  "required": true,
                          "options": ["USER", "USER_WITHOUT_PARENT", "USER_WITHOUT_STUDENT"] },
    "dateOfBirth":      { "value": null,            "editable": true,  "required": false },
    "gender":           { "value": null,            "editable": true,  "required": false,
                          "options": ["MALE", "FEMALE", "OTHER"] },
    "nic":              { "value": null,            "editable": true,  "required": false },
    "birthCertificateNo": { "value": "BC12345",    "editable": false, "required": false },
    "addressLine1":     { "value": null,            "editable": true,  "required": false },
    "addressLine2":     { "value": null,            "editable": true,  "required": false },
    "city":             { "value": null,            "editable": true,  "required": false },
    "district":         { "value": null,            "editable": true,  "required": false },
    "province":         { "value": null,            "editable": true,  "required": false },
    "country":          { "value": "SRI_LANKA",    "editable": true,  "required": false },
    "imageUrl":         { "value": null,            "editable": true,  "required": false }
  },
  "studentFields": {
    "emergencyContact":  { "value": null, "editable": true, "required": false },
    "medicalConditions": { "value": null, "editable": true, "required": false },
    "allergies":         { "value": null, "editable": true, "required": false },
    "bloodGroup":        { "value": null, "editable": true, "required": false,
                           "options": ["A+","A-","B+","B-","AB+","AB-","O+","O-"] }
  },
  "parentFields": {
    "occupation":      { "value": null, "editable": true, "required": false },
    "workplace":       { "value": null, "editable": true, "required": false },
    "workPhone":       { "value": null, "editable": true, "required": false },
    "educationLevel":  { "value": null, "editable": true, "required": false }
  }
}
```

> **Notes:**
> - `studentFields` and `parentFields` may be `undefined` if no student/parent record exists for this user.
> - If field has `"editable": false`, render it as **read-only** (greyed out / disabled).
> - If field has `"needsVerification": true`, the user must verify it via OTP (Steps 3–4).
> - If field has `"options"`, render as a **dropdown/select**.
> - `imageUrl` is editable only if `value` is `null` (no existing image). If admin already set an image, user cannot change it.
> - `email`: if admin pre-set it, `editable` will be `false`; user still needs to verify it.

### Field Annotation Schema

```typescript
interface FieldAnnotation {
  value: any;           // Current value (null if empty)
  editable: boolean;    // Can the user change this?
  required: boolean;    // Must be filled before completing profile?
  needsVerification?: boolean;  // Requires OTP verification (email)
  options?: string[];   // If present, render as dropdown/select
}
```

### Errors

| Status | Condition | Message |
|--------|-----------|---------|
| 400 | Invalid OTP | `Invalid or expired OTP` |
| 400 | OTP expired | `OTP has expired. Please request a new one.` |
| 400 | Too many attempts | `Too many failed attempts. Please request a new OTP.` |
| 404 | User not found | `User not found` |

### Frontend Implementation

```tsx
const [otp, setOtp] = useState('');

const handleVerifyOtp = async () => {
  const res = await fetch(`${API_BASE}/auth/first-login/phone/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phoneNumber: phone, otp }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message);

  // ✅ IMPORTANT: Store the JWT for subsequent requests
  sessionStorage.setItem('firstLoginToken', data.access_token);

  // Store annotated profile for form rendering
  setProfile(data.profile);
  setStudentFields(data.studentFields);
  setParentFields(data.parentFields);
  setIsEmailVerified(data.isEmailVerified);

  // Navigate to profile completion screen
  navigate('/first-login/complete-profile');
};
```

---

## Step 3: Request Email OTP (During Profile Completion)

User enters email. Backend checks it's not taken by another user, then sends OTP.

### Request

```
POST /auth/first-login/email/request-otp
Content-Type: application/json
Authorization: Bearer <access_token from Step 2>
```

```json
{
  "email": "sugath@example.com"
}
```

### Response (200)

```json
{
  "success": true,
  "message": "OTP sent to sug***@example.com. Valid for 15 minutes.",
  "expiresInMinutes": 15
}
```

### Errors

| Status | Condition | Message |
|--------|-----------|---------|
| 400 | Email taken by another user | `This email is already registered by another user. Please use a different email.` |
| 400 | Invalid/expired token | `Invalid or expired token. Please verify your phone again.` |
| 429 | Rate limit | Throttle error |

### Frontend Implementation

```tsx
const handleRequestEmailOtp = async (email: string) => {
  const token = sessionStorage.getItem('firstLoginToken');
  const res = await fetch(`${API_BASE}/auth/first-login/email/request-otp`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({ email }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message);
  // Show email OTP input field
  setShowEmailOtpInput(true);
};
```

---

## Step 4: Verify Email OTP

Verify the email OTP. On success, user's email is saved and marked verified.

### Request

```
POST /auth/first-login/email/verify
Content-Type: application/json
Authorization: Bearer <access_token from Step 2>
```

```json
{
  "email": "sugath@example.com",
  "otpCode": "654321"
}
```

### Response (200)

```json
{
  "success": true,
  "message": "Email verified successfully.",
  "email": "sugath@example.com"
}
```

### Errors

| Status | Condition | Message |
|--------|-----------|---------|
| 400 | Invalid OTP | `Invalid or expired OTP code` |
| 400 | OTP expired | `OTP has expired. Please request a new one.` |
| 400 | Invalid token | `Invalid or expired token. Please verify your phone again.` |

### Frontend Implementation

```tsx
const handleVerifyEmail = async (email: string, otpCode: string) => {
  const token = sessionStorage.getItem('firstLoginToken');
  const res = await fetch(`${API_BASE}/auth/first-login/email/verify`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({ email, otpCode }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message);
  // ✅ Email is now verified — update UI
  setIsEmailVerified(true);
  setVerifiedEmail(data.email);
};
```

---

## Step 5: Complete Profile (Final Step)

Submit all profile fields + password. Backend saves everything, marks `firstLoginCompleted = true`, and returns **real login tokens** (access + refresh).

### Request

```
POST /auth/first-login/complete
Content-Type: application/json
Authorization: Bearer <access_token from Step 2>
```

```json
{
  "firstName": "Sugath",
  "lastName": "Perera",
  "password": "MySecurePassword123!",
  "confirmPassword": "MySecurePassword123!",
  "userType": "USER",
  "nameWithInitials": "S. Perera",
  "dateOfBirth": "2005-03-15",
  "gender": "MALE",
  "nic": "200512345678",
  "addressLine1": "123 Main Street",
  "addressLine2": "Dehiwala",
  "city": "Colombo",
  "district": "COLOMBO",
  "province": "WESTERN",
  "country": "SRI_LANKA",
  "imageUrl": "https://storage.example.com/profile/img.jpg",
  "emergencyContact": "0771234568",
  "medicalConditions": "None",
  "allergies": "None",
  "bloodGroup": "O+",
  "occupation": "Teacher",
  "workplace": "ABC School",
  "workPhone": "0112345678",
  "educationLevel": "Bachelors"
}
```

#### Required Fields
| Field | Type | Notes |
|-------|------|-------|
| `firstName` | string | Required |
| `lastName` | string | Required |
| `password` | string | Min 6 chars |
| `confirmPassword` | string | Must match `password` |

#### Optional Fields (User Profile)
| Field | Type | Notes |
|-------|------|-------|
| `userType` | string | `USER` / `USER_WITHOUT_PARENT` / `USER_WITHOUT_STUDENT` |
| `nameWithInitials` | string | Auto-generated as "F. LastName" if not provided |
| `dateOfBirth` | string | Format: `YYYY-MM-DD` |
| `gender` | string | `MALE` / `FEMALE` / `OTHER` |
| `nic` | string | NIC number |
| `addressLine1` | string | |
| `addressLine2` | string | |
| `city` | string | |
| `district` | string | Must match District enum |
| `province` | string | Must match Province enum |
| `country` | string | Must match Country enum |
| `imageUrl` | string | Only accepted if no existing image from admin |

#### Optional Fields (Student — if student record exists)
| Field | Type | Notes |
|-------|------|-------|
| `emergencyContact` | string | Emergency contact number |
| `medicalConditions` | string | |
| `allergies` | string | |
| `bloodGroup` | string | `A+`/`A-`/`B+`/`B-`/`AB+`/`AB-`/`O+`/`O-` |

#### Optional Fields (Parent — if parent record exists)
| Field | Type | Notes |
|-------|------|-------|
| `occupation` | string | |
| `workplace` | string | |
| `workPhone` | string | |
| `educationLevel` | string | |

### Response (200)

```json
{
  "success": true,
  "message": "Profile completed and logged in successfully.",
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refresh_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "expires_in": "24h",
  "refresh_expires_in": "7d",
  "user": {
    "id": "uuid",
    "email": "sugath@example.com",
    "firstName": "Sugath",
    "lastName": "Perera",
    "userType": "USER",
    "phoneNumber": "94771234567",
    "isPhoneVerified": true,
    "isEmailVerified": true,
    "firstLoginCompleted": true,
    "profileCompletionStatus": "COMPLETE",
    "profileCompletionPercentage": 85,
    "institutes": [...]
  }
}
```

### Errors

| Status | Condition | Message |
|--------|-----------|---------|
| 400 | Passwords don't match | `Passwords do not match` |
| 400 | Invalid/expired token | `Invalid or expired token. Please verify your phone again.` |
| 404 | User not found | `User not found` |

### Frontend Implementation

```tsx
const handleCompleteProfile = async (formData: any) => {
  const token = sessionStorage.getItem('firstLoginToken');
  const res = await fetch(`${API_BASE}/auth/first-login/complete`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify(formData),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message);

  // ✅ IMPORTANT: Replace temporary token with real login tokens
  sessionStorage.removeItem('firstLoginToken');
  localStorage.setItem('access_token', data.access_token);
  localStorage.setItem('refresh_token', data.refresh_token);

  // Navigate to dashboard
  navigate('/dashboard');
};
```

---

## Complete React Component Example

```tsx
import React, { useState } from 'react';

const API_BASE = process.env.REACT_APP_API_BASE || 'https://api.example.com';

type FieldAnnotation = {
  value: any;
  editable: boolean;
  required: boolean;
  needsVerification?: boolean;
  options?: string[];
};

type Step = 'phone' | 'verify-otp' | 'complete-profile';

export const FirstLoginFlow: React.FC = () => {
  const [step, setStep] = useState<Step>('phone');
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [token, setToken] = useState('');
  const [profile, setProfile] = useState<Record<string, FieldAnnotation>>({});
  const [studentFields, setStudentFields] = useState<Record<string, FieldAnnotation> | null>(null);
  const [parentFields, setParentFields] = useState<Record<string, FieldAnnotation> | null>(null);
  const [isEmailVerified, setIsEmailVerified] = useState(false);
  const [email, setEmail] = useState('');
  const [emailOtp, setEmailOtp] = useState('');
  const [showEmailOtp, setShowEmailOtp] = useState(false);
  const [formData, setFormData] = useState<Record<string, any>>({});
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // ────── STEP 1: Initiate ──────
  const handleInitiate = async () => {
    setLoading(true); setError('');
    try {
      const res = await fetch(`${API_BASE}/auth/first-login/phone/initiate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phoneNumber: phone }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message);
      setStep('verify-otp');
    } catch (err: any) {
      setError(err.message);
    } finally { setLoading(false); }
  };

  // ────── STEP 2: Verify Phone OTP ──────
  const handleVerifyOtp = async () => {
    setLoading(true); setError('');
    try {
      const res = await fetch(`${API_BASE}/auth/first-login/phone/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phoneNumber: phone, otp }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message);

      setToken(data.access_token);
      setProfile(data.profile);
      setStudentFields(data.studentFields || null);
      setParentFields(data.parentFields || null);
      setIsEmailVerified(data.isEmailVerified);

      // Pre-fill form with existing values
      const initial: Record<string, any> = {};
      Object.entries(data.profile).forEach(([key, field]: [string, any]) => {
        if (field.value !== null) initial[key] = field.value;
      });
      if (data.studentFields) {
        Object.entries(data.studentFields).forEach(([key, field]: [string, any]) => {
          if (field.value !== null) initial[key] = field.value;
        });
      }
      if (data.parentFields) {
        Object.entries(data.parentFields).forEach(([key, field]: [string, any]) => {
          if (field.value !== null) initial[key] = field.value;
        });
      }
      setFormData(initial);

      setStep('complete-profile');
    } catch (err: any) {
      setError(err.message);
    } finally { setLoading(false); }
  };

  // ────── STEP 3: Request Email OTP ──────
  const handleRequestEmailOtp = async () => {
    setLoading(true); setError('');
    try {
      const res = await fetch(`${API_BASE}/auth/first-login/email/request-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message);
      setShowEmailOtp(true);
    } catch (err: any) {
      setError(err.message);
    } finally { setLoading(false); }
  };

  // ────── STEP 4: Verify Email OTP ──────
  const handleVerifyEmail = async () => {
    setLoading(true); setError('');
    try {
      const res = await fetch(`${API_BASE}/auth/first-login/email/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ email, otpCode: emailOtp }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message);
      setIsEmailVerified(true);
      setFormData(prev => ({ ...prev, email }));
    } catch (err: any) {
      setError(err.message);
    } finally { setLoading(false); }
  };

  // ────── STEP 5: Complete Profile ──────
  const handleComplete = async () => {
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    setLoading(true); setError('');
    try {
      const res = await fetch(`${API_BASE}/auth/first-login/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ ...formData, password, confirmPassword }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message);

      // ✅ Store real tokens
      localStorage.setItem('access_token', data.access_token);
      localStorage.setItem('refresh_token', data.refresh_token);

      // Navigate to app
      window.location.href = '/dashboard';
    } catch (err: any) {
      setError(err.message);
    } finally { setLoading(false); }
  };

  // ────── Dynamic Field Renderer ──────
  const renderField = (
    key: string,
    field: FieldAnnotation,
    section: 'profile' | 'student' | 'parent'
  ) => {
    const label = key
      .replace(/([A-Z])/g, ' $1')
      .replace(/^./, s => s.toUpperCase());

    // Non-editable fields
    if (!field.editable) {
      return (
        <div key={key} className="form-group disabled">
          <label>{label} {field.value ? '🔒' : ''}</label>
          <input value={field.value ?? '—'} disabled />
        </div>
      );
    }

    // Email field (needs verification)
    if (key === 'email' && field.needsVerification) {
      return (
        <div key={key} className="form-group email-verify">
          <label>{label} * (requires verification)</label>
          {isEmailVerified ? (
            <div className="verified">
              ✅ {formData.email || email} — Verified
            </div>
          ) : (
            <>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="Enter your email"
              />
              {!showEmailOtp ? (
                <button onClick={handleRequestEmailOtp} disabled={!email || loading}>
                  Send Verification Code
                </button>
              ) : (
                <>
                  <input
                    value={emailOtp}
                    onChange={e => setEmailOtp(e.target.value)}
                    placeholder="Enter 6-digit code"
                    maxLength={6}
                  />
                  <button onClick={handleVerifyEmail} disabled={emailOtp.length !== 6 || loading}>
                    Verify Email
                  </button>
                </>
              )}
            </>
          )}
        </div>
      );
    }

    // Dropdown field
    if (field.options) {
      return (
        <div key={key} className="form-group">
          <label>{label} {field.required ? '*' : ''}</label>
          <select
            value={formData[key] ?? ''}
            onChange={e => setFormData(prev => ({ ...prev, [key]: e.target.value }))}
          >
            <option value="">Select...</option>
            {field.options.map(opt => (
              <option key={opt} value={opt}>{opt.replace(/_/g, ' ')}</option>
            ))}
          </select>
        </div>
      );
    }

    // Date field
    if (key === 'dateOfBirth') {
      return (
        <div key={key} className="form-group">
          <label>{label}</label>
          <input
            type="date"
            value={formData[key] ?? ''}
            onChange={e => setFormData(prev => ({ ...prev, [key]: e.target.value }))}
          />
        </div>
      );
    }

    // Regular text field
    return (
      <div key={key} className="form-group">
        <label>{label} {field.required ? '*' : ''}</label>
        <input
          value={formData[key] ?? ''}
          onChange={e => setFormData(prev => ({ ...prev, [key]: e.target.value }))}
          placeholder={`Enter ${label.toLowerCase()}`}
        />
      </div>
    );
  };

  return (
    <div className="first-login-container">
      {error && <div className="error-banner">{error}</div>}

      {/* ────── STEP 1: Phone Input ────── */}
      {step === 'phone' && (
        <div className="step-card">
          <h2>Welcome! First Login</h2>
          <p>Enter your phone number to get started.</p>
          <input
            type="tel"
            value={phone}
            onChange={e => setPhone(e.target.value)}
            placeholder="077XXXXXXX"
          />
          <button onClick={handleInitiate} disabled={!phone || loading}>
            {loading ? 'Sending...' : 'Send OTP'}
          </button>
        </div>
      )}

      {/* ────── STEP 2: OTP Verification ────── */}
      {step === 'verify-otp' && (
        <div className="step-card">
          <h2>Verify Phone</h2>
          <p>Enter the 6-digit code sent to {phone}</p>
          <input
            value={otp}
            onChange={e => setOtp(e.target.value)}
            placeholder="000000"
            maxLength={6}
          />
          <button onClick={handleVerifyOtp} disabled={otp.length !== 6 || loading}>
            {loading ? 'Verifying...' : 'Verify OTP'}
          </button>
          <button onClick={handleInitiate} disabled={loading} className="link-btn">
            Resend OTP
          </button>
        </div>
      )}

      {/* ────── STEPS 3-5: Profile Completion ────── */}
      {step === 'complete-profile' && (
        <div className="step-card profile-form">
          <h2>Complete Your Profile</h2>

          {/* Profile fields */}
          <h3>Personal Information</h3>
          {Object.entries(profile).map(([key, field]) =>
            renderField(key, field, 'profile')
          )}

          {/* Student fields */}
          {studentFields && (
            <>
              <h3>Student Information</h3>
              {Object.entries(studentFields).map(([key, field]) =>
                renderField(key, field, 'student')
              )}
            </>
          )}

          {/* Parent fields */}
          {parentFields && (
            <>
              <h3>Parent Information</h3>
              {Object.entries(parentFields).map(([key, field]) =>
                renderField(key, field, 'parent')
              )}
            </>
          )}

          {/* Password */}
          <h3>Set Password *</h3>
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="Password (min 6 chars)"
          />
          <input
            type="password"
            value={confirmPassword}
            onChange={e => setConfirmPassword(e.target.value)}
            placeholder="Confirm Password"
          />

          <button
            onClick={handleComplete}
            disabled={
              loading ||
              !formData.firstName ||
              !formData.lastName ||
              !password ||
              password !== confirmPassword ||
              password.length < 6 ||
              !isEmailVerified
            }
          >
            {loading ? 'Saving...' : 'Complete Registration'}
          </button>
        </div>
      )}
    </div>
  );
};
```

---

## User Type Definitions

| Value | Description |
|-------|-------------|
| `USER` | Both student AND parent (default) |
| `USER_WITHOUT_PARENT` | Student only — no parent profile |
| `USER_WITHOUT_STUDENT` | Parent only — no student profile |

When user changes `userType`, show/hide the relevant fields:
- `USER` → Show both student + parent fields
- `USER_WITHOUT_PARENT` → Show only student fields, hide parent fields
- `USER_WITHOUT_STUDENT` → Show only parent fields, hide student fields

---

## Token Lifecycle

| Token | Source | Expiry | Purpose |
|-------|--------|--------|---------|
| First-login JWT | Step 2 (phone verify) | 30 days | Profile completion (steps 3–5) |
| Access token | Step 5 (complete profile) | 24 hours | Normal app access |
| Refresh token | Step 5 (complete profile) | 7 days (30d with rememberMe) | Refresh access token |

> After Step 5, **discard** the first-login JWT and use the real access + refresh tokens.

---

## Resending OTPs

| OTP Type | How to resend |
|----------|---------------|
| Phone SMS OTP | Call Step 1 again: `POST /auth/first-login/phone/initiate` with same phone |
| Email OTP | Call Step 3 again: `POST /auth/first-login/email/request-otp` with same email + JWT |

---

## Error Handling Best Practices

```tsx
// Centralized error handler
const handleApiError = (status: number, message: string) => {
  switch (status) {
    case 404:
      // User not found — contact admin
      showAlert('Your account was not found. Please contact your institute administrator.');
      break;
    case 400:
      if (message.includes('already completed')) {
        // Redirect to normal login
        navigate('/login');
      } else {
        showError(message);
      }
      break;
    case 429:
      showError('Too many requests. Please wait a few minutes and try again.');
      break;
    default:
      showError(message || 'An unexpected error occurred.');
  }
};
```

---

## API Reference Summary

| Step | Method | Endpoint | Auth | Rate Limit |
|------|--------|----------|------|------------|
| 1 | POST | `/auth/first-login/phone/initiate` | None | 3/15min |
| 2 | POST | `/auth/first-login/phone/verify` | None | 5/15min |
| 3 | POST | `/auth/first-login/email/request-otp` | Bearer JWT | 3/15min |
| 4 | POST | `/auth/first-login/email/verify` | Bearer JWT | 5/15min |
| 5 | POST | `/auth/first-login/complete` | Bearer JWT | — |

---

## Mobile (React Native / Flutter) Notes

- All endpoints work identically for mobile.
- Store the first-login JWT in secure storage (not AsyncStorage).
- For SMS auto-read on Android, the OTP message format is: `Your Suraksha LMS first login code is: XXXXXX. Valid for 15 minutes. Do not share this code.`
- After Step 5, store tokens using `expo-secure-store` or `flutter_secure_storage`.
