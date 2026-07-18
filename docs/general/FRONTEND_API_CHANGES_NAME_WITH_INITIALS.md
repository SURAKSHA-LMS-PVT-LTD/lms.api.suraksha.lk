# Frontend Integration Guide: Name with Initials Update

## 🔄 Breaking Change - Login Response Updated

**Date:** January 10, 2026  
**Priority:** High - Breaking Change  
**Impact:** All authentication endpoints

---

## 📋 Summary

All authentication endpoints now return `nameWithInitials` instead of `firstName` and `lastName` in the user object. This change improves security and reduces data exposure in API responses.

**Before:**
```json
{
  "user": {
    "id": "12345",
    "email": "john.doe@example.com",
    "firstName": "John",
    "lastName": "Doe",
    "userType": "STUDENT"
  }
}
```

**After:**
```json
{
  "user": {
    "id": "12345",
    "email": "john.doe@example.com",
    "nameWithInitials": "J. Doe",
    "userType": "STUDENT",
    "imageUrl": "https://storage.googleapis.com/..."
  }
}
```

---

## 🎯 Affected Endpoints

### 1. **POST /v2/auth/login**
   - **Response Changes:** User object now contains `nameWithInitials` instead of `firstName` and `lastName`
   - **Status:** Updated ✅

### 2. **POST /v2/auth/refresh**
   - **Response Changes:** User object now contains `nameWithInitials` instead of `firstName` and `lastName`
   - **Status:** Updated ✅

### 3. **POST /auth/first-login/verify-otp-enhanced**
   - **Response Changes:** User object now contains `nameWithInitials` instead of `firstName` and `lastName`
   - **Status:** Updated ✅

### 4. **POST /auth/first-login/verify-otp-complete**
   - **Response Changes:** User object now contains `nameWithInitials` instead of `firstName` and `lastName`
   - **Status:** Updated ✅

### 5. **POST /auth/first-login/set-password**
   - **Response Changes:** User object now contains `nameWithInitials` instead of `firstName` and `lastName`
   - **Status:** Updated ✅

### 6. **POST /auth/first-login/complete-profile**
   - **Response Changes:** User object now contains `nameWithInitials` instead of `firstName` and `lastName`
   - **Status:** Updated ✅

### 7. **GET /auth/me**
   - **Response Changes:** User profile now includes `nameWithInitials`
   - **Status:** Updated ✅

---

## 🔧 Frontend Migration Guide

### Step 1: Update TypeScript Interfaces/Types

#### Old Interface (❌ Remove)
```typescript
interface LoginResponse {
  access_token: string;
  refresh_token: string;
  payload: any;
  user: {
    id: string;
    email: string;
    firstName: string;     // ❌ Remove
    lastName: string;      // ❌ Remove
    userType: string;
    imageUrl?: string;
  };
}
```

#### New Interface (✅ Use This)
```typescript
interface LoginResponse {
  access_token: string;
  refresh_token: string;
  payload: any;
  user: {
    id: string;
    email: string;
    nameWithInitials: string;  // ✅ New field
    userType: string;
    imageUrl?: string;
  };
}
```

### Step 2: Update State Management

#### Redux Example
```typescript
// Old reducer (❌)
const userSlice = createSlice({
  name: 'user',
  initialState: {
    id: '',
    email: '',
    firstName: '',    // ❌ Remove
    lastName: '',     // ❌ Remove
    userType: '',
  },
  // ...
});

// New reducer (✅)
const userSlice = createSlice({
  name: 'user',
  initialState: {
    id: '',
    email: '',
    nameWithInitials: '',  // ✅ Add this
    userType: '',
    imageUrl: '',
  },
  // ...
});
```

#### Context API Example
```typescript
// Old (❌)
interface UserContextType {
  user: {
    id: string;
    email: string;
    firstName: string;    // ❌ Remove
    lastName: string;     // ❌ Remove
    userType: string;
  };
}

// New (✅)
interface UserContextType {
  user: {
    id: string;
    email: string;
    nameWithInitials: string;  // ✅ Add this
    userType: string;
    imageUrl?: string;
  };
}
```

### Step 3: Update UI Components

#### Display User Name
```typescript
// Old (❌)
const UserProfile = ({ user }) => {
  return (
    <div>
      <h1>Welcome, {user.firstName} {user.lastName}</h1>
    </div>
  );
};

// New (✅)
const UserProfile = ({ user }) => {
  return (
    <div>
      <h1>Welcome, {user.nameWithInitials}</h1>
    </div>
  );
};
```

#### Avatar Component
```typescript
// New component utilizing nameWithInitials (✅)
const UserAvatar = ({ user }) => {
  // Extract first initial from nameWithInitials (e.g., "J. Doe" -> "J")
  const initial = user.nameWithInitials?.charAt(0) || '?';
  
  return (
    <div className="avatar">
      {user.imageUrl ? (
        <img src={user.imageUrl} alt={user.nameWithInitials} />
      ) : (
        <div className="avatar-initials">{initial}</div>
      )}
      <span>{user.nameWithInitials}</span>
    </div>
  );
};
```

### Step 4: Update API Service Calls

```typescript
// api/auth.service.ts
import axios from 'axios';

interface LoginRequest {
  email: string;
  password: string;
}

interface LoginResponse {
  access_token: string;
  refresh_token: string;
  user: {
    id: string;
    email: string;
    nameWithInitials: string;  // ✅ Updated
    userType: string;
    imageUrl?: string;
  };
}

export const authService = {
  async login(credentials: LoginRequest): Promise<LoginResponse> {
    const response = await axios.post('/v2/auth/login', credentials);
    return response.data;
  },
  
  async refreshToken(refreshToken: string): Promise<LoginResponse> {
    const response = await axios.post('/v2/auth/refresh', { 
      refresh_token: refreshToken 
    });
    return response.data;
  }
};
```

### Step 5: Update Local Storage / Session Storage

```typescript
// Old (❌)
const saveUserToStorage = (user) => {
  localStorage.setItem('user', JSON.stringify({
    id: user.id,
    email: user.email,
    firstName: user.firstName,    // ❌ Remove
    lastName: user.lastName,      // ❌ Remove
    userType: user.userType
  }));
};

// New (✅)
const saveUserToStorage = (user) => {
  localStorage.setItem('user', JSON.stringify({
    id: user.id,
    email: user.email,
    nameWithInitials: user.nameWithInitials,  // ✅ Updated
    userType: user.userType,
    imageUrl: user.imageUrl
  }));
};
```

---

## 📝 Example Responses

### Login Response
```json
POST /v2/auth/login

Response 200:
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refresh_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "payload": {
    "s": "12345",
    "u": 2,
    "t": 1704931200,
    "i": [...]
  },
  "user": {
    "id": "12345",
    "email": "student@example.com",
    "nameWithInitials": "J. Doe",
    "userType": "STUDENT",
    "imageUrl": "https://storage.googleapis.com/bucket/profile.jpg"
  }
}
```

### Refresh Token Response
```json
POST /v2/auth/refresh

Response 200:
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refresh_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "12345",
    "email": "student@example.com",
    "nameWithInitials": "J. Doe",
    "userType": "STUDENT",
    "imageUrl": "https://storage.googleapis.com/bucket/profile.jpg"
  }
}
```

### First Login - Set Password Response
```json
POST /auth/first-login/set-password

Response 200:
{
  "success": true,
  "message": "Password set successfully. You can now login with your email and password.",
  "user": {
    "id": "12345",
    "email": "student@example.com",
    "nameWithInitials": "J. Doe",
    "userType": "STUDENT"
  }
}
```

---

## 🚨 Common Issues & Solutions

### Issue 1: Undefined `firstName` or `lastName`
**Problem:** `user.firstName` or `user.lastName` returns undefined  
**Solution:** Replace with `user.nameWithInitials`

```typescript
// ❌ Will be undefined
console.log(user.firstName); // undefined
console.log(user.lastName);  // undefined

// ✅ Correct
console.log(user.nameWithInitials); // "J. Doe"
```

### Issue 2: Full Name Display
**Problem:** Need to show full name but only have initials  
**Solution:** The `nameWithInitials` field (e.g., "J. Doe") is designed for display purposes. If you need the full first name and last name separately, you'll need to fetch it from the user profile endpoint or store it during registration.

```typescript
// If you need full name details, fetch from user profile endpoint
const getUserFullProfile = async (userId: string) => {
  // This endpoint might still return full firstName/lastName for profile pages
  const response = await axios.get(`/api/users/${userId}/profile`);
  return response.data; // May include firstName, lastName for editing
};
```

### Issue 3: Migration Period
**Problem:** Need to support both old and new format temporarily  
**Solution:** Use a helper function with fallback

```typescript
// Helper function for gradual migration
const getDisplayName = (user: any): string => {
  // New format
  if (user.nameWithInitials) {
    return user.nameWithInitials;
  }
  
  // Old format fallback (during migration only)
  if (user.firstName && user.lastName) {
    return `${user.firstName.charAt(0)}. ${user.lastName}`;
  }
  
  if (user.firstName) {
    return user.firstName;
  }
  
  return 'User';
};
```

---

## ✅ Testing Checklist

- [ ] Update all TypeScript interfaces/types for authentication responses
- [ ] Update state management (Redux/Context/etc.) user state structure
- [ ] Update all UI components displaying user names
- [ ] Update local storage / session storage schema
- [ ] Test login flow with new response format
- [ ] Test refresh token flow with new response format
- [ ] Test first-time login flows (OTP, set password, complete profile)
- [ ] Update any user profile display components
- [ ] Update user avatar components
- [ ] Test data masking interceptor with nameWithInitials field
- [ ] Verify no console errors related to `firstName` or `lastName`
- [ ] Update any analytics/tracking code using user names

---

## 📞 Support

If you encounter any issues during migration:

1. Check this documentation first
2. Review the example responses above
3. Test your API calls using Postman/Swagger to verify response format
4. Contact the backend team for clarification

---

## 🔗 Related Documentation

- User Entity Structure: Check database schema for `name_with_initials` field
- Data Masking: Email and phone numbers are still masked based on environment variables
- API Security: JWT tokens remain unchanged, only user object format updated

---

## 📅 Migration Timeline

- **January 10, 2026:** API updated with new response format
- **Action Required:** Frontend teams must update their code immediately
- **Backward Compatibility:** ❌ None - This is a breaking change
- **Rollback Plan:** Not recommended - database already stores `nameWithInitials`

---

## 💡 Benefits of This Change

1. **Enhanced Security:** Less personal information exposed in API responses
2. **Privacy Compliance:** Reduced PII (Personally Identifiable Information) in logs
3. **Consistent Display:** Standardized name format across all endpoints
4. **Database Alignment:** Uses existing `name_with_initials` column in database
5. **Simpler UI:** Single field for display instead of string concatenation

---

**Last Updated:** January 10, 2026  
**API Version:** v2  
**Status:** Production Ready ✅
