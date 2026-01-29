# V2 Authentication APIs - Multi-Identifier Support Guide

## 🎯 Overview

The V2 authentication system now supports **multiple identifier types** for all authentication operations:
- ✅ **Email** (user@example.com)
- ✅ **Phone Number** (various formats)
- ✅ **System Registration Number** (6-digit ID)
- ✅ **Birth Certificate Number**

**Supported Operations:**
1. **Login** - `/v2/auth/login`
2. **Password Reset** - `/auth/forgot-password` + `/auth/reset-password`
3. **First Login Completion** - Uses userId directly

## 📡 API Endpoints

### 1. Login API
```
POST /v2/auth/login
```

### 2. Password Reset APIs
```
POST /auth/forgot-password    (Step 1: Request OTP)
POST /auth/reset-password      (Step 2: Reset with OTP)
```

### 3. First Login Completion
```
PATCH /system-admin/users/first-login/:userId
```

---

## 🔐 1. Login API

### Endpoint
```
POST /v2/auth/login
```

### Request Body

```typescript
{
  "identifier": string,  // Email, Phone, System ID, or Birth Certificate
  "password": string
}
```

## 🔍 Identifier Detection Logic

The system automatically detects the identifier type based on patterns:

### 1. Email Detection
- **Pattern**: Contains `@` and `.`
- **Examples**: 
  - `user@example.com`
  - `student@school.lk`
  - `ADMIN@DOMAIN.COM` (case-insensitive)

### 2. Phone Number Detection
- **Supported Formats**:
  - `+94771234567` (International with +)
  - `94771234567` (International without +)
  - `0771234567` (Local with 0)
  - `771234567` (Without prefix)
  
- **Supported Prefixes**: 70, 71, 72, 75, 76, 77, 78
- **Normalization**: All formats normalized to `0771234567` format
- **Length**: 9-10 digits (excluding country code)

### 3. System Registration Number
- **Pattern**: Exactly 6 digits
- **Examples**: 
  - `500423`
  - `100001`
  - `999999`
- **Note**: System IDs are stored in the `id` field

### 4. Birth Certificate Number
- **Pattern**: Numeric, but NOT 6 digits
- **Examples**: 
  - `12345` (5 digits)
  - `1234567890` (10+ digits)
  - `98765432` (8 digits)
- **Field**: `birth_certificate_no` in database

## 📊 Database Query Strategy

The system queries different fields based on identifier type:

| Identifier Type | Database Field | Example Query |
|----------------|----------------|---------------|
| Email | `email` | `WHERE email = 'user@example.com'` |
| Phone | `phone_number` | `WHERE phone_number = '0771234567'` |
| System ID | `id` | `WHERE id = '500423'` |
| Birth Certificate | `birth_certificate_no` | `WHERE birth_certificate_no = '12345'` |

## 🚀 Examples

### Example 1: Login with Email
```bash
curl -X POST https://api.example.com/v2/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "identifier": "student@school.lk",
    "password": "mypassword123"
  }'
```

### Example 2: Login with Phone (International)
```bash
curl -X POST https://api.example.com/v2/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "identifier": "+94771234567",
    "password": "mypassword123"
  }'
```

### Example 3: Login with Phone (Local)
```bash
curl -X POST https://api.example.com/v2/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "identifier": "0771234567",
    "password": "mypassword123"
  }'
```

### Example 4: Login with Phone (Short Format)
```bash
curl -X POST https://api.example.com/v2/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "identifier": "771234567",
    "password": "mypassword123"
  }'
```

### Example 5: Login with System Registration Number
```bash
curl -X POST https://api.example.com/v2/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "identifier": "500423",
    "password": "mypassword123"
  }'
```

### Example 6: Login with Birth Certificate Number
```bash
curl -X POST https://api.example.com/v2/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "identifier": "1234567890",
    "password": "mypassword123"
  }'
```

## 📥 Response Format

### Success Response (200 OK)
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refresh_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "payload": {
    "s": "12345",
    "u": "STUDENT",
    "i": [1, 2],
    "c": [101, 102]
  },
  "user": {
    "id": "12345",
    "email": "student@example.com",
    "phoneNumber": "0771234567",
    "nameWithInitials": "J. Doe",
    "userType": "STUDENT",
    "imageUrl": "https://storage.googleapis.com/..."
  }
}
```

### Error Responses

#### 401 Unauthorized - Invalid Credentials
```json
{
  "statusCode": 401,
  "message": "Invalid credentials",
  "error": "Unauthorized"
}
```

#### 429 Too Many Requests
```json
{
  "statusCode": 429,
  "message": "Too many login attempts. Try again in 15 minutes.",
  "error": "Too Many Requests"
}
```

---

## 🔑 2. Password Reset API (Forgot Password Flow)

### Step 1: Request OTP

#### Endpoint
```
POST /auth/forgot-password
```

#### Request Body
```json
{
  "identifier": "user@example.com"  // Email, Phone, System ID, or Birth Certificate
}
```

#### Examples

**Email:**
```bash
curl -X POST https://api.example.com/auth/forgot-password \
  -H "Content-Type: application/json" \
  -d '{
    "identifier": "student@school.lk"
  }'
```

**Phone Number:**
```bash
curl -X POST https://api.example.com/auth/forgot-password \
  -H "Content-Type: application/json" \
  -d '{
    "identifier": "+94771234567"
  }'
```

**System Registration Number:**
```bash
curl -X POST https://api.example.com/auth/forgot-password \
  -H "Content-Type: application/json" \
  -d '{
    "identifier": "500423"
  }'
```

**Birth Certificate:**
```bash
curl -X POST https://api.example.com/auth/forgot-password \
  -H "Content-Type: application/json" \
  -d '{
    "identifier": "1234567890"
  }'
```

#### Success Response (200 OK)
```json
{
  "success": true,
  "message": "Password reset code sent to your email address. Please check your inbox.",
  "data": {
    "identifier": "+94771234567",
    "email": "user@example.com",
    "expiresInMinutes": 15
  }
}
```

**Important Notes:**
- OTP is sent to the **registered email address** regardless of identifier type
- For security, the API doesn't reveal if the identifier exists
- Rate limit: 3 requests per 15 minutes per identifier
- OTP expires in 15 minutes

---

### Step 2: Reset Password with OTP

#### Endpoint
```
POST /auth/reset-password
```

#### Request Body
```json
{
  "identifier": "user@example.com",  // Same identifier used in Step 1
  "otp": "123456",                   // 6-digit OTP from email
  "newPassword": "NewSecure123!",    // Min 8 chars, must include uppercase, lowercase, number, special char
  "confirmPassword": "NewSecure123!" // Must match newPassword
}
```

#### Example
```bash
curl -X POST https://api.example.com/auth/reset-password \
  -H "Content-Type: application/json" \
  -d '{
    "identifier": "+94771234567",
    "otp": "123456",
    "newPassword": "NewSecure123!",
    "confirmPassword": "NewSecure123!"
  }'
```

#### Success Response (200 OK)
```json
{
  "success": true,
  "message": "Password reset successfully. You can now login with your new password."
}
```

#### Error Responses

**Invalid OTP (400):**
```json
{
  "statusCode": 400,
  "message": "Invalid or expired OTP code",
  "error": "Bad Request"
}
```

**Password Mismatch (400):**
```json
{
  "statusCode": 400,
  "message": "New password and confirmation do not match",
  "error": "Bad Request"
}
```

**Weak Password (400):**
```json
{
  "statusCode": 400,
  "message": "Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character",
  "error": "Bad Request"
}
```

### Password Requirements
- **Minimum Length**: 8 characters
- **Must Include**:
  - At least one uppercase letter (A-Z)
  - At least one lowercase letter (a-z)
  - At least one number (0-9)
  - At least one special character (@$!%*?&)

### Security Features
- **Rate Limiting**: 3 OTP requests per 15 minutes
- **OTP Expiry**: 15 minutes after generation
- **One-Time Use**: OTP is invalidated after successful password reset
- **Failed Attempt Tracking**: Failed OTP verifications are logged
- **Email Notification**: OTP sent only to registered email address

---

## 👤 3. First Login Completion

For users created by administrators who haven't set their password yet.

### Endpoint
```
PATCH /system-admin/users/first-login/:userId
```

### Request Body
```json
{
  "password": "NewSecure123!",
  "firstName": "John",       // Optional: if not provided during creation
  "lastName": "Doe",         // Optional: if not provided during creation
  "dateOfBirth": "2000-01-15", // Optional: YYYY-MM-DD format
  "gender": "MALE"           // Optional: MALE, FEMALE, OTHER
}
```

### Example
```bash
curl -X PATCH https://api.example.com/system-admin/users/first-login/500423 \
  -H "Content-Type: application/json" \
  -d '{
    "password": "MySecure123!",
    "firstName": "John",
    "lastName": "Doe"
  }'
```

### Success Response (200 OK)
```json
{
  "success": true,
  "message": "First login completed successfully. You can now access the system.",
  "canLogin": true
}
```

**Note**: If you only know your identifier (not userId), use the forgot-password flow to get access.

---

## ⚡ Performance Optimization

### Cache Strategy (Email Only)
- **Email logins** use Redis cache for ultra-fast authentication
- **Cache Hit**: ~15ms response time (0 database queries)
- **Cache Miss**: ~200ms response time (1-2 database queries)

### Non-Email Logins
- Phone, System ID, and Birth Certificate logins query database directly
- Single optimized query with selected fields only
- Response time: ~100-200ms

## 🔐 Security Features

### Rate Limiting
- **Login Endpoint**: 5 attempts per 15 minutes
- **Refresh Endpoint**: 10 attempts per minute
- Protection against brute force attacks

### Password Security
- Bcrypt hashing with salt rounds (12)
- Optional pepper for additional security
- Passwords never returned in response

### Token Security
- **Access Token**: 15-minute expiry
- **Refresh Token**: 7-day expiry
- Refresh token stored in httpOnly cookie (browsers)
- Refresh token also in response body (mobile/SSO)

## 🧪 Testing Different Identifier Types

### Test Email Login
```javascript
const response = await fetch('/v2/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    identifier: 'test@example.com',
    password: 'testpassword'
  })
});
```

### Test Phone Login (Multiple Formats)
```javascript
// Test 1: International with +
await testLogin('+94771234567', 'password');

// Test 2: International without +
await testLogin('94771234567', 'password');

// Test 3: Local with 0
await testLogin('0771234567', 'password');

// Test 4: Short format
await testLogin('771234567', 'password');

function testLogin(identifier, password) {
  return fetch('/v2/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier, password })
  });
}
```

### Test System ID Login
```javascript
const response = await fetch('/v2/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    identifier: '500423',  // 6-digit system ID
    password: 'password'
  })
});
```

### Test Birth Certificate Login
```javascript
const response = await fetch('/v2/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    identifier: '1234567890',  // Birth certificate number
    password: 'password'
  })
});
```

## 📱 Frontend Integration

### React Example
```typescript
import { useState } from 'react';

interface LoginForm {
  identifier: string;
  password: string;
}

function LoginComponent() {
  const [form, setForm] = useState<LoginForm>({
    identifier: '',
    password: ''
  });
  const [error, setError] = useState('');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      const response = await fetch('/v2/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form)
      });

      if (!response.ok) {
        throw new Error('Login failed');
      }

      const data = await response.json();
      
      // Store tokens
      localStorage.setItem('access_token', data.access_token);
      localStorage.setItem('refresh_token', data.refresh_token);
      
      // Redirect to dashboard
      window.location.href = '/dashboard';
      
    } catch (err) {
      setError('Invalid credentials. Please try again.');
    }
  };

  return (
    <form onSubmit={handleLogin}>
      <input
        type="text"
        placeholder="Email, Phone, System ID, or Birth Certificate"
        value={form.identifier}
        onChange={(e) => setForm({ ...form, identifier: e.target.value })}
      />
      <input
        type="password"
        placeholder="Password"
        value={form.password}
        onChange={(e) => setForm({ ...form, password: e.target.value })}
      />
      {error && <p className="error">{error}</p>}
      <button type="submit">Login</button>
    </form>
  );
}
```

### Angular Example
```typescript
import { Component } from '@angular/core';
import { HttpClient } from '@angular/common/http';

@Component({
  selector: 'app-login',
  template: `
    <form (ngSubmit)="onLogin()">
      <input 
        type="text" 
        [(ngModel)]="identifier" 
        name="identifier"
        placeholder="Email, Phone, System ID, or Birth Certificate"
      />
      <input 
        type="password" 
        [(ngModel)]="password" 
        name="password"
        placeholder="Password"
      />
      <button type="submit">Login</button>
      <p *ngIf="error" class="error">{{ error }}</p>
    </form>
  `
})
export class LoginComponent {
  identifier = '';
  password = '';
  error = '';

  constructor(private http: HttpClient) {}

  onLogin() {
    this.http.post('/v2/auth/login', {
      identifier: this.identifier,
      password: this.password
    }).subscribe({
      next: (response: any) => {
        localStorage.setItem('access_token', response.access_token);
        localStorage.setItem('refresh_token', response.refresh_token);
        // Navigate to dashboard
      },
      error: (err) => {
        this.error = 'Invalid credentials. Please try again.';
      }
    });
  }
}
```

## 🔄 Migration from Old Login

### Old API (Email Only)
```json
{
  "email": "user@example.com",
  "password": "password123"
}
```

### New API (Multi-Identifier)
```json
{
  "identifier": "user@example.com",
  "password": "password123"
}
```

### Migration Steps
1. **Update frontend forms**: Change `email` field to `identifier`
2. **Update placeholder text**: "Email, Phone, System ID, or Birth Certificate"
3. **Remove email validation**: The API now accepts any string
4. **Test all identifier types**: Email, Phone, System ID, Birth Certificate

## ❓ FAQ

### Q: Can users login with multiple identifiers?
**A:** Yes! Users can login with ANY of their identifiers:
- Email
- Phone number (in any format)
- System registration number (if they know it)
- Birth certificate number

### Q: What happens if phone number format is wrong?
**A:** The system normalizes phone numbers. All these formats work:
- `+94771234567`
- `94771234567`
- `0771234567`
- `771234567`

All are normalized to `0771234567` format before database query.

### Q: Is email login still cached for performance?
**A:** Yes! Email logins still use Redis cache for optimal performance (~15ms response time). Other identifier types query the database directly.

### Q: What if a user doesn't have email/phone?
**A:** Users can login with:
- System registration number (6-digit user ID)
- Birth certificate number (if stored in profile)

### Q: How secure is this approach?
**A:** Very secure:
- Rate limiting prevents brute force (5 attempts per 15 min)
- Bcrypt password hashing
- JWT tokens with short expiry
- httpOnly cookies prevent XSS attacks

## 🐛 Troubleshooting

### Issue: "Invalid credentials" with phone number
**Solution**: Ensure phone number is in correct format:
- Valid prefixes: 70, 71, 72, 75, 76, 77, 78
- Valid lengths: 9-10 digits
- Example: `0771234567` or `+94771234567`

### Issue: System ID not working
**Solution**: System IDs must be exactly 6 digits:
- ✅ Valid: `500423`, `100001`
- ❌ Invalid: `12345` (5 digits), `1234567` (7 digits)

### Issue: Birth certificate not working
**Solution**: Check if birth certificate number is stored in database:
```sql
SELECT birth_certificate_no FROM users WHERE id = 'user_id';
```

## 📊 Logging & Monitoring

The system logs login attempts with identifier type:
```
🔐 Login attempt with email: user@example.com
🔐 Login attempt with phone: 0771234567
🔐 Login attempt with system_id: 500423
🔐 Login attempt with birth_certificate: 1234567890
🔐 Password reset request with phone: 0771234567
🔐 Password reset request with system_id: 500423
```

Monitor these logs for:
- Popular login methods
- Failed login attempts
- Password reset patterns
- System ID usage patterns
- Birth certificate login frequency

## ✅ Summary

The V2 Authentication APIs now provide a **universal authentication experience**:

### Login API (`/v2/auth/login`)
- ✅ **4 identifier types** supported (email, phone, system ID, birth certificate)
- ✅ **Automatic detection** of identifier type
- ✅ **Phone number normalization** for flexibility
- ✅ **Cache optimization** for email logins (~15ms response time)
- ✅ **Rate limiting**: 5 attempts per 15 minutes

### Password Reset APIs (`/auth/forgot-password`, `/auth/reset-password`)
- ✅ **Multi-identifier support** (email, phone, system ID, birth certificate)
- ✅ **OTP sent to registered email** regardless of identifier type
- ✅ **15-minute OTP expiry** for security
- ✅ **Rate limiting**: 3 OTP requests per 15 minutes
- ✅ **Password strength validation** (uppercase, lowercase, number, special char)
- ✅ **One-time use OTP** invalidated after successful reset

### First Login Completion (`/system-admin/users/first-login/:userId`)
- ✅ **Admin-created user onboarding** flow
- ✅ **Optional profile completion** during first login
- ✅ **Password strength validation**
- ✅ **Fallback to forgot-password flow** if userId unknown

### Security Features Across All APIs
- ✅ **Rate limiting** to prevent brute force attacks
- ✅ **Bcrypt password hashing** with salt rounds (12)
- ✅ **JWT tokens** with short expiry (15 min access, 7 day refresh)
- ✅ **httpOnly cookies** for browser security
- ✅ **Identifier detection** with normalization
- ✅ **Failed attempt tracking** for monitoring

**Users can now authenticate using any identifier that's convenient for them!**
