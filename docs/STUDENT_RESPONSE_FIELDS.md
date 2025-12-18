# Student Response Fields Reference

**Date:** November 8, 2025  
**Endpoint:** `GET /institute-users/institute/{instituteId}/users/STUDENT`

## ✅ All Available Fields in Student Response

### Basic User Information (Inherited from SecureUserResponseDto)

| Field | Type | Description | Example |
|-------|------|-------------|---------|
| `id` | string | User ID | `"123"` |
| `name` | string | Full name | `"John Doe"` |
| `email` | string | Email address (unmasked for admins) | `"john.doe@example.com"` |
| `phoneNumber` | string | Phone number | `"+94771234567"` |
| `addressLine1` | string | Address line 1 | `"123 Main Street"` |
| `addressLine2` | string | Address line 2 | `"Colombo 03"` |
| `imageUrl` | string | Profile image URL | `"https://storage.googleapis.com/..."` |
| `gender` | enum | Gender | `"MALE"` / `"FEMALE"` / `"OTHER"` |
| `dateOfBirth` | string | Date of birth | `"2005-05-15"` |
| `userIdByInstitute` | string | **Institute-assigned student ID** | `"STU2024001"` |
| `status` | string | Enrollment status | `"ACTIVE"` |
| `verifiedAt` | Date | Verification date | `"2024-08-18T10:30:00Z"` |
| `verifiedBy` | string | Verifier name | `"Admin User"` |

### Student-Specific Information

| Field | Type | Description | Example |
|-------|------|-------------|---------|
| `studentId` | string | **Birth certificate or student ID** | `"BC2024001234"` |
| `emergencyContact` | string | **Emergency contact number** | `"+94771234567"` |
| `medicalConditions` | string | **Medical conditions and special needs** | `"Asthma, requires inhaler"` |
| `allergies` | string | **Known allergies** | `"Peanuts, Shellfish"` |
| `fatherId` | string | Father's user ID (legacy) | `"456"` |
| `motherId` | string | Mother's user ID (legacy) | `"789"` |
| `guardianId` | string | Guardian's user ID (legacy) | `"101"` |

### Parent Details (When `parent=true` query parameter is used)

| Field | Type | Description | Example |
|-------|------|-------------|---------|
| `father` | object | Father details (see below) | `{ ... }` |
| `mother` | object | Mother details (see below) | `{ ... }` |
| `guardian` | object | Guardian details (see below) | `{ ... }` |

#### Parent Details Object Structure

```json
{
  "id": "456",
  "name": "Robert Doe",
  "email": "robert.doe@example.com",
  "phoneNumber": "+94771234567",
  "imageUrl": "https://storage.googleapis.com/...",
  "occupation": "Software Engineer",
  "workPlace": "Tech Company Ltd",
  "children": [
    {
      "userId": "123",
      "studentId": "STU2024001",
      "name": "John Doe",
      "relationship": "FATHER"
    }
  ]
}
```

## 📋 Sample Student Response

### Without Parent Details
```json
{
  "data": [
    {
      "id": "123",
      "name": "John Doe",
      "email": "john.doe@example.com",
      "phoneNumber": "+94771234567",
      "addressLine1": "123 Main Street",
      "addressLine2": "Colombo 03",
      "imageUrl": "https://storage.googleapis.com/suraksha-lms/profile-images/student-123.jpg",
      "gender": "MALE",
      "dateOfBirth": "2005-05-15",
      "userIdByInstitute": "STU2024001",
      "status": "ACTIVE",
      "verifiedAt": "2024-08-18T10:30:00.000Z",
      "verifiedBy": "Admin User",
      "studentId": "BC2024001234",
      "emergencyContact": "+94771234999",
      "medicalConditions": "Asthma, requires inhaler",
      "allergies": "Peanuts, Shellfish",
      "fatherId": "456",
      "motherId": "789",
      "guardianId": null
    }
  ],
  "meta": {
    "total": 150,
    "page": 1,
    "limit": 50,
    "totalPages": 3
  }
}
```

### With Parent Details (`?parent=true`)
```json
{
  "data": [
    {
      "id": "123",
      "name": "John Doe",
      "email": "john.doe@example.com",
      "phoneNumber": "+94771234567",
      "addressLine1": "123 Main Street",
      "addressLine2": "Colombo 03",
      "imageUrl": "https://storage.googleapis.com/suraksha-lms/profile-images/student-123.jpg",
      "gender": "MALE",
      "dateOfBirth": "2005-05-15",
      "userIdByInstitute": "STU2024001",
      "status": "ACTIVE",
      "verifiedAt": "2024-08-18T10:30:00.000Z",
      "verifiedBy": "Admin User",
      "studentId": "BC2024001234",
      "emergencyContact": "+94771234999",
      "medicalConditions": "Asthma, requires inhaler",
      "allergies": "Peanuts, Shellfish",
      "fatherId": "456",
      "motherId": "789",
      "guardianId": null,
      "father": {
        "id": "456",
        "name": "Robert Doe",
        "email": "robert.doe@example.com",
        "phoneNumber": "+94771234567",
        "imageUrl": "https://storage.googleapis.com/suraksha-lms/profile-images/parent-456.jpg",
        "occupation": "Software Engineer",
        "workPlace": "Tech Company Ltd",
        "children": [
          {
            "userId": "123",
            "studentId": "STU2024001",
            "name": "John Doe",
            "relationship": "FATHER"
          }
        ]
      },
      "mother": {
        "id": "789",
        "name": "Jane Doe",
        "email": "jane.doe@example.com",
        "phoneNumber": "+94771234568",
        "imageUrl": "https://storage.googleapis.com/suraksha-lms/profile-images/parent-789.jpg",
        "occupation": "Teacher",
        "workPlace": "ABC School",
        "children": [
          {
            "userId": "123",
            "studentId": "STU2024001",
            "name": "John Doe",
            "relationship": "MOTHER"
          }
        ]
      },
      "guardian": null
    }
  ],
  "meta": {
    "total": 150,
    "page": 1,
    "limit": 50,
    "totalPages": 3
  }
}
```

## 🔍 Important Field Clarifications

### Institute Student ID vs Birth Certificate ID

The system provides **TWO** different ID fields:

1. **`userIdByInstitute`** (Institute-assigned ID)
   - This is the ID assigned by the institute to the student
   - Example: `STU2024001`, `2024/GRADE10/001`
   - Set when assigning user to institute
   - **This is the primary institute identifier**

2. **`studentId`** (Birth Certificate or National ID)
   - This is the birth certificate number or other official ID
   - Example: `BC2024001234`, `200512345678`
   - Optional field
   - Can be used for official records

### Medical Information

**`medicalConditions`** - Free text field for any medical conditions:
- Asthma
- Diabetes
- Heart conditions
- Special needs
- Medication requirements
- Any other medical information relevant to the institute

**`allergies`** - Free text field for allergies:
- Food allergies (peanuts, shellfish, dairy, etc.)
- Medicine allergies
- Environmental allergies
- Other allergic reactions

**`emergencyContact`** - Emergency contact phone number:
- Can be different from parent phone
- Used in case of emergencies
- Should be someone who can be reached quickly

## 📝 API Usage Examples

### Get All Students
```bash
GET /institute-users/institute/1/users/STUDENT?page=1&limit=50
```

### Get Students with Medical Conditions
```bash
GET /institute-users/institute/1/users/STUDENT?hasMedicalConditions=true
```

### Get Students with Allergies
```bash
GET /institute-users/institute/1/users/STUDENT?hasAllergies=true
```

### Search by Institute Student ID
```bash
GET /institute-users/institute/1/users/STUDENT?search=STU2024001
```

### Get Student with Parent Details
```bash
GET /institute-users/institute/1/users/STUDENT?studentId=BC2024&parent=true
```

### Filter by Age and Get Medical Info
```bash
GET /institute-users/institute/1/users/STUDENT?minAge=15&maxAge=18&hasMedicalConditions=true
```

## ✅ Confirmed: All Fields Are Already in Response

The student response **already includes** all the requested fields:
- ✅ Institute student ID (`userIdByInstitute`)
- ✅ Birth certificate/student ID (`studentId`)
- ✅ Medical conditions (`medicalConditions`)
- ✅ Allergies (`allergies`)
- ✅ Emergency contact (`emergencyContact`)

**No additional implementation needed** - these fields are already being returned by the API!

---

**Implementation Status:** ✅ COMPLETE (Already Implemented)  
**API Version:** Current  
**Last Updated:** November 8, 2025
