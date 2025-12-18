# Comprehensive User Creation Validation Guide

## Overview
The `POST /user/comprehensive` endpoint creates users across multiple tables with strict validation rules based on the `userType`.

## User Types Supported
- ✅ `USER` - Student with parent (creates: users + students + parents)
- ✅ `USER_WITHOUT_PARENT` - Student only (creates: users + students)
- ✅ `USER_WITHOUT_STUDENT` - Parent only (creates: users + parents)
- ❌ `SUPERADMIN` - Not allowed through this endpoint
- ❌ `ORGANIZATION_MANAGER` - Not allowed through this endpoint

---

## Required Fields (All User Types)

### Basic User Information
| Field | Type | Validation | Example |
|-------|------|-----------|---------|
| `firstName` | string | Required, 1-50 chars, trimmed | `"John"` |
| `lastName` | string | Required, 1-50 chars, trimmed | `"Doe"` |
| `email` | string | Required, valid email, 5-60 chars, lowercase | `"john.doe@example.com"` |
| `phoneNumber` | string | Required, 10-15 chars, format: `+?[0-9]{10,15}` | `"+94771234567"` |
| `userType` | enum | Required, only USER/USER_WITHOUT_PARENT/USER_WITHOUT_STUDENT | `"USER"` |
| `gender` | enum | Required, MALE/FEMALE/OTHER | `"MALE"` |
| `district` | enum | Required, valid Sri Lankan district | `"COLOMBO"` |
| `province` | enum | Required, valid Sri Lankan province | `"WESTERN"` |
| `country` | enum | Required, must be "Sri Lanka" | `"Sri Lanka"` |

### Optional User Information
| Field | Type | Validation | Example |
|-------|------|-----------|---------|
| `dateOfBirth` | date | Optional, YYYY-MM-DD format | `"1995-05-15"` |
| `nic` | string | Optional, valid NIC format | `"199512345678"` |
| `birthCertificateNo` | string | Optional, 1-20 chars | `"BC-123456789"` |
| `addressLine1` | string | Optional, 1-100 chars | `"123 Main Street"` |
| `addressLine2` | string | Optional, 1-100 chars | `"Apartment 4B"` |
| `city` | string | Optional, 1-50 chars | `"Colombo"` |
| `postalCode` | string | Optional, exactly 5 digits | `"00100"` |
| `idUrl` | string | Optional, valid URL | `"https://..."` |
| `isActive` | boolean | Optional, default: true | `true` |

---

## Student Data (Required for USER & USER_WITHOUT_PARENT)

### Conditional Requirement
```typescript
// studentData is REQUIRED when:
userType === 'USER' || userType === 'USER_WITHOUT_PARENT'
```

### Student Fields
| Field | Type | Validation | Example |
|-------|------|-----------|---------|
| `studentId` | string | Optional, 1-15 chars | `"STU-2024-001"` |
| `emergencyContact` | string | Optional, 10-15 chars, phone format | `"+94771234567"` |
| `medicalConditions` | string | Optional, max 500 chars | `"Asthma, requires inhaler"` |
| `allergies` | string | Optional, max 500 chars | `"Peanuts, Penicillin"` |
| `bloodGroup` | enum | Optional, valid blood group | `"O_POSITIVE"` |

### Parent Linking (All Optional)
| Field | Type | Description | Example |
|-------|------|------------|---------|
| `fatherId` | string | Existing parent user ID | `"123"` |
| `fatherPhoneNumber` | string | Phone to lookup father | `"+94771234567"` |
| `motherId` | string | Existing parent user ID | `"456"` |
| `motherPhoneNumber` | string | Phone to lookup mother | `"+94777654321"` |
| `guardianId` | string | Existing parent user ID | `"789"` |
| `guardianPhoneNumber` | string | Phone to lookup guardian | `"+94773333333"` |

**Note:** Provide either `fatherId` OR `fatherPhoneNumber`, not both. System will fetch user by phone if phone is provided.

---

## Parent Data (Required for USER & USER_WITHOUT_STUDENT)

### Conditional Requirement
```typescript
// parentData is REQUIRED when:
userType === 'USER' || userType === 'USER_WITHOUT_STUDENT'
```

### Parent Fields
| Field | Type | Validation | Example |
|-------|------|-----------|---------|
| `occupation` | enum | Optional, valid occupation type | `"ENGINEER"` |
| `workplace` | string | Optional, 1-100 chars | `"ABC Corporation"` |
| `workPhone` | string | Optional, 10-15 chars, phone format | `"+94112345678"` |
| `educationLevel` | string | Optional, 1-100 chars | `"Bachelor of Engineering"` |

---

## Validation Error Messages

### Common Validation Errors

#### Missing Required Fields
```json
{
  "statusCode": 400,
  "message": "Validation failed",
  "errors": [
    {
      "field": "firstName",
      "errors": ["First name is required"]
    }
  ]
}
```

#### Invalid User Type
```json
{
  "statusCode": 400,
  "message": "Validation failed",
  "errors": [
    {
      "field": "userType",
      "errors": [
        "Invalid user type. Only USER, USER_WITHOUT_PARENT, USER_WITHOUT_STUDENT allowed for user creation."
      ]
    }
  ]
}
```

#### Missing Student Data
```json
{
  "statusCode": 400,
  "message": "Validation failed",
  "errors": [
    {
      "field": "studentData",
      "errors": ["studentData is required when userType is USER or USER_WITHOUT_PARENT"]
    }
  ]
}
```

#### Missing Parent Data
```json
{
  "statusCode": 400,
  "message": "Validation failed",
  "errors": [
    {
      "field": "parentData",
      "errors": ["parentData is required when userType is USER or USER_WITHOUT_STUDENT"]
    }
  ]
}
```

#### Invalid Email Format
```json
{
  "statusCode": 400,
  "errors": [
    {
      "field": "email",
      "errors": ["Please provide a valid email address"]
    }
  ]
}
```

#### Invalid Phone Number
```json
{
  "statusCode": 400,
  "errors": [
    {
      "field": "phoneNumber",
      "errors": ["Phone number must be a valid format with optional + prefix and 10-15 digits"]
    }
  ]
}
```

---

## Example Requests

### 1. Create Student with Parent (USER)
```json
{
  "firstName": "John",
  "lastName": "Doe",
  "email": "john.doe@example.com",
  "phoneNumber": "+94771234567",
  "userType": "USER",
  "gender": "MALE",
  "dateOfBirth": "2010-05-15",
  "district": "COLOMBO",
  "province": "WESTERN",
  "country": "Sri Lanka",
  "studentData": {
    "emergencyContact": "+94771234567",
    "bloodGroup": "O_POSITIVE",
    "fatherPhoneNumber": "+94771111111",
    "motherPhoneNumber": "+94772222222"
  },
  "parentData": {
    "occupation": "ENGINEER",
    "workplace": "ABC Corp",
    "workPhone": "+94112345678"
  }
}
```

### 2. Create Student Only (USER_WITHOUT_PARENT)
```json
{
  "firstName": "Jane",
  "lastName": "Smith",
  "email": "jane.smith@example.com",
  "phoneNumber": "+94773456789",
  "userType": "USER_WITHOUT_PARENT",
  "gender": "FEMALE",
  "district": "GAMPAHA",
  "province": "WESTERN",
  "country": "Sri Lanka",
  "studentData": {
    "emergencyContact": "+94773456789",
    "bloodGroup": "A_POSITIVE"
  }
}
```

### 3. Create Parent Only (USER_WITHOUT_STUDENT)
```json
{
  "firstName": "Robert",
  "lastName": "Johnson",
  "email": "robert.j@example.com",
  "phoneNumber": "+94774567890",
  "userType": "USER_WITHOUT_STUDENT",
  "gender": "MALE",
  "district": "KANDY",
  "province": "CENTRAL",
  "country": "Sri Lanka",
  "parentData": {
    "occupation": "DOCTOR",
    "workplace": "City Hospital",
    "educationLevel": "MBBS"
  }
}
```

---

## Validation Rules Summary

### ✅ All Fields Have:
- Type validation (string, boolean, enum, etc.)
- Custom error messages
- Length constraints where applicable
- Format validation (email, phone, URL, etc.)
- Trimming for string fields
- Lowercase conversion for emails

### ✅ Conditional Validation:
- `studentData` required only when `userType` is `USER` or `USER_WITHOUT_PARENT`
- `parentData` required only when `userType` is `USER` or `USER_WITHOUT_STUDENT`

### ✅ Enhanced Features:
- Phone number regex validation: `/^\+?[0-9]{10,15}$/`
- Postal code regex: `/^[0-9]{5}$/`
- Email automatic lowercase conversion
- String fields automatically trimmed
- Nested object validation for studentData and parentData

---

## Best Practices

1. **Always include studentData** when creating students (USER or USER_WITHOUT_PARENT)
2. **Always include parentData** when creating parents (USER or USER_WITHOUT_STUDENT)
3. **Use phone numbers for parent linking** when you don't know the parent's user ID
4. **Provide valid enums** in uppercase (MALE, COLOMBO, WESTERN, etc.)
5. **Use proper date format** (YYYY-MM-DD) for dateOfBirth
6. **Include country code** in phone numbers (+94 for Sri Lanka)
7. **Test with validation** before sending to production

---

## Migration from Old Endpoints

### Before (Deprecated):
```
POST /students - ❌ REMOVED
POST /parents - ❌ REMOVED
```

### After (Comprehensive):
```
POST /user/comprehensive - ✅ USE THIS
```

**Benefits:**
- Single transaction across multiple tables
- Better data consistency
- Comprehensive validation
- Automatic parent-child linking
- Cleaner codebase
