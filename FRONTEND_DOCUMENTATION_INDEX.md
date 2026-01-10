# 📚 Frontend Documentation Index

Complete guide for frontend developers integrating with the LMS API

---

## 📄 Available Documentation

### 1. **Authentication Changes - Name with Initials**
   - **File:** [FRONTEND_API_CHANGES_NAME_WITH_INITIALS.md](./FRONTEND_API_CHANGES_NAME_WITH_INITIALS.md)
   - **Topic:** Breaking change in authentication responses
   - **Status:** ⚠️ **BREAKING CHANGE** - Immediate action required
   - **Summary:**
     - All login endpoints now return `nameWithInitials` instead of `firstName` and `lastName`
     - Affects: `/v2/auth/login`, `/v2/auth/refresh`, and all first-login endpoints
     - Migration guide with TypeScript examples included

### 2. **User Profile Management**
   - **File:** [USER_PROFILE_FRONTEND_GUIDE.md](./USER_PROFILE_FRONTEND_GUIDE.md)
   - **Topic:** Complete guide for user profile pages (GET/UPDATE)
   - **Status:** ✅ Production Ready
   - **Summary:**
     - GET profile: `GET /users/profile`
     - UPDATE profile: `PATCH /users/profile`
     - Field visibility rules based on user type
     - Email/phone are masked and cannot be updated via profile
     - addressLine2 is optional, don't send if empty
     - Type-specific fields for STUDENT and PARENT users

### 3. **Authentication Implementation Summary**
   - **File:** [AUTH_UPDATE_SUMMARY.md](./AUTH_UPDATE_SUMMARY.md)
   - **Topic:** Technical summary of authentication changes
   - **Status:** ✅ Completed
   - **Summary:**
     - All changed files listed
     - Before/after comparison
     - Testing status
     - Security benefits

---

## 🚀 Quick Start for Frontend Developers

### Step 1: Review Breaking Changes
1. Read [FRONTEND_API_CHANGES_NAME_WITH_INITIALS.md](./FRONTEND_API_CHANGES_NAME_WITH_INITIALS.md)
2. Update all authentication-related interfaces to use `nameWithInitials`
3. Remove references to `firstName` and `lastName` in login responses

### Step 2: Implement User Profile
1. Read [USER_PROFILE_FRONTEND_GUIDE.md](./USER_PROFILE_FRONTEND_GUIDE.md)
2. Create profile page with GET endpoint
3. Implement profile update with PATCH endpoint
4. Follow field visibility rules based on user type
5. **Never send** `email` or `phoneNumber` in update requests (they are masked)
6. **Don't send** `addressLine2` if it's empty

### Step 3: Test Everything
- [ ] Login returns `nameWithInitials` instead of `firstName`/`lastName`
- [ ] Profile page displays all fields correctly
- [ ] Profile update doesn't send `email` or `phoneNumber`
- [ ] Profile update doesn't send empty `addressLine2`
- [ ] Type-specific fields show only for matching user types
- [ ] Masked email shows as "j***@example.com"
- [ ] Masked phone shows as "+94****567"

---

## 📋 API Endpoint Summary

### Authentication Endpoints
| Endpoint | Method | Changes | Documentation |
|----------|--------|---------|---------------|
| `/v2/auth/login` | POST | ✅ Returns `nameWithInitials` | [Link](./FRONTEND_API_CHANGES_NAME_WITH_INITIALS.md#1-post-v2authlogin) |
| `/v2/auth/refresh` | POST | ✅ Returns `nameWithInitials` | [Link](./FRONTEND_API_CHANGES_NAME_WITH_INITIALS.md#2-post-v2authrefresh) |
| `/auth/first-login/*` | POST | ✅ Returns `nameWithInitials` | [Link](./FRONTEND_API_CHANGES_NAME_WITH_INITIALS.md#3-post-authfirst-loginverify-otp-enhanced) |

### User Profile Endpoints
| Endpoint | Method | Purpose | Documentation |
|----------|--------|---------|---------------|
| `/users/profile` | GET | Get current user profile | [Link](./USER_PROFILE_FRONTEND_GUIDE.md#-get-profile-response) |
| `/users/profile` | PATCH | Update current user profile | [Link](./USER_PROFILE_FRONTEND_GUIDE.md#-update-profile-request) |

---

## ⚠️ Critical Rules for Frontend

### 1. **Login Response Structure**
```typescript
// ✅ NEW FORMAT
interface LoginResponse {
  access_token: string;
  refresh_token: string;
  user: {
    id: string;
    email: string;
    nameWithInitials: string;  // ✅ Use this
    userType: string;
    imageUrl?: string;
  };
}

// ❌ OLD FORMAT (Don't use)
interface LoginResponse {
  user: {
    firstName: string;   // ❌ No longer exists
    lastName: string;    // ❌ No longer exists
  };
}
```

### 2. **Profile Update Request**
```typescript
// ✅ CORRECT
const updateData = {
  nic: "200012345678",
  dateOfBirth: "2000-05-15",
  addressLine1: "123 Main St",
  // addressLine2 omitted if empty
  city: "Colombo"
};

// ❌ WRONG
const updateData = {
  email: "j***@example.com",      // ❌ Don't send (masked)
  phoneNumber: "+94****567",      // ❌ Don't send (masked)
  addressLine2: "",               // ❌ Don't send if empty
  addressLine1: "123 Main St"
};
```

### 3. **Field Visibility by User Type**
```typescript
// Only show if user type matches
if (userType === 'STUDENT') {
  // Show: studentId, emergencyContact, bloodGroup
}

if (userType === 'PARENT') {
  // Show: occupation, workplace, educationLevel
}

// All types show: personal info, address, settings
```

---

## 🎯 Implementation Priorities

### **Priority 1: High - Breaking Changes**
- [ ] Update all login response interfaces to use `nameWithInitials`
- [ ] Remove all references to `firstName` and `lastName` in auth responses
- [ ] Update state management (Redux/Context) to use `nameWithInitials`

### **Priority 2: Medium - Profile Management**
- [ ] Implement GET profile endpoint
- [ ] Implement UPDATE profile endpoint with correct field filtering
- [ ] Add validation for all editable fields
- [ ] Implement conditional field visibility based on user type

### **Priority 3: Low - Polish**
- [ ] Add loading states
- [ ] Add error handling
- [ ] Add success messages
- [ ] Improve UI/UX for masked fields

---

## 🔗 Additional Resources

- **Swagger API Documentation:** `/api/docs` (available when backend is running)
- **Postman Collection:** Request from backend team
- **Backend Source Code:** Check `src/auth` and `src/modules/user` directories

---

## 📞 Support & Questions

### For Authentication Changes
- Review: [FRONTEND_API_CHANGES_NAME_WITH_INITIALS.md](./FRONTEND_API_CHANGES_NAME_WITH_INITIALS.md)
- Test endpoint: `POST /v2/auth/login`

### For Profile Management
- Review: [USER_PROFILE_FRONTEND_GUIDE.md](./USER_PROFILE_FRONTEND_GUIDE.md)
- Test endpoints: `GET /users/profile` and `PATCH /users/profile`

### General Support
1. Check Swagger documentation at `/api/docs`
2. Review error responses for validation messages
3. Contact backend team for clarification

---

## 📅 Timeline

- **January 10, 2026:** Authentication changes deployed
- **Immediate Action Required:** Update frontend to use `nameWithInitials`
- **No Backward Compatibility:** Old `firstName`/`lastName` format no longer available

---

**Documentation Version:** 1.0  
**Last Updated:** January 10, 2026  
**Status:** ✅ Complete and Ready for Implementation
