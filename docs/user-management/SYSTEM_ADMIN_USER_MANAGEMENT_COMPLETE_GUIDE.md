# 🎯 System Admin User Management - Complete Guide

**Complete API & Frontend Implementation Guide**  
**Last Updated:** January 23, 2026  
**Based on:** Actual Entity Definitions from Codebase

---

## 📋 Table of Contents

1. [Overview](#overview)
2. [Database Schema Reference](#database-schema-reference)
3. [API Endpoints](#api-endpoints)
4. [Validation Logic & Business Rules](#validation-logic--business-rules)
5. [Frontend Implementation](#frontend-implementation)
6. [Complete Examples](#complete-examples)

---

## 🎨 Overview

### Purpose
System administrators can create users with **1% to 100% data flexibility** and optionally assign them to institutes with nested class/subject enrollments in a single API call.

### Key Features
- ✅ **Flexible Data Requirements**: From minimal (email/phone only) to complete (all fields + RFID)
- ✅ **Institute Assignment**: Assign to institute → class → subject in one request
- ✅ **Auto-Activation**: System admin created = auto ACTIVE + verified (no approval needed)
- ✅ **Family Units**: Create student + parents in one API call
- ✅ **Smart Matching**: Reuses existing parents by email/phone
- ✅ **RFID Support**: Include RFID cards during creation

---

## 🗄️ Database Schema Reference

### Actual Entity Structure (From Codebase)

#### 1️⃣ UserEntity (`users` table)
```typescript
// File: src/modules/user/entities/user.entity.ts
{
  id: string;                    // bigint, auto-generated
  firstName: string;             // varchar(50), REQUIRED
  lastName: string;              // varchar(50), REQUIRED
  nameWithInitials: string;      // varchar(100), REQUIRED
  email: string;                 // varchar(60), UNIQUE, REQUIRED
  password?: string;             // varchar(120), nullable (for admin-created users)
  phoneNumber?: string;          // varchar(15), nullable
  userType: UserType;            // enum, REQUIRED
  dateOfBirth?: Date;            // date, nullable
  gender?: Gender;               // enum: MALE | FEMALE | OTHER
  nic?: string;                  // varchar(12), UNIQUE, nullable
  birthCertificateNo?: string;   // varchar(50), UNIQUE, nullable
  addressLine1?: string;         // varchar(200), nullable
  addressLine2?: string;         // varchar(200), nullable
  city?: string;                 // varchar(50), nullable
  district?: District;           // enum
  province?: Province;           // enum
  postalCode?: string;           // varchar(6), nullable
  country: Country;              // enum, default: SRI_LANKA
  isActive: boolean;             // default: true
  imageUrl?: string;             // varchar(255), nullable
  rfid?: string;                 // varchar(20), UNIQUE, nullable
  language: Language;            // enum, default: ENGLISH
  isPhoneVerified: boolean;      // default: false
  isEmailVerified: boolean;      // default: false
  profileCompletionStatus: ProfileCompletionStatus;  // INCOMPLETE | BASIC | COMPLETE
  profileCompletionPercentage: number;  // 0-100
  firstLoginCompleted: boolean;  // default: false
  passwordSetAt?: Date;          // nullable
  createdAt: Date;
  updatedAt: Date;
}
```

#### 2️⃣ StudentEntity (`students` table)
```typescript
// File: src/modules/student/entities/student.entity.ts
{
  userId: string;              // PK, FK to users.id
  fatherId?: string;           // FK to parents.user_id
  motherId?: string;           // FK to parents.user_id
  guardianId?: string;         // FK to parents.user_id
  studentId?: string;          // varchar(15), UNIQUE, nullable (auto-generated)
  emergencyContact?: string;   // varchar(15), nullable
  medicalConditions?: string;  // text, nullable
  allergies?: string;          // text, nullable
  bloodGroup?: BloodGroup;     // enum: A_POSITIVE | A_NEGATIVE | B_POSITIVE | etc.
  isActive: boolean;           // default: true
  createdAt: Date;
  updatedAt: Date;
}
```

#### 3️⃣ ParentEntity (`parents` table)
```typescript
// File: src/modules/parent/entities/parent.entity.ts
{
  id: string;                  // PK, auto-generated
  userId: string;              // FK to users.id, UNIQUE
  occupation?: Occupation;     // enum, nullable
  workplace?: string;          // varchar(100), nullable
  workPhone?: string;          // varchar(15), nullable
  educationLevel?: string;     // varchar(100), nullable
  isActive: boolean;           // default: true
  createdAt: Date;
  updatedAt: Date;
}
```

#### 4️⃣ InstituteUserEntity (`institute_user` table)
```typescript
// File: src/modules/institute_mudules/institue_user/entities/institue_user.entity.ts
{
  instituteId: string;              // PK, FK to institutes.id
  userId: string;                   // PK, FK to users.id
  userIdByInstitute?: string;       // varchar(50), nullable (institute's internal ID)
  status: InstituteUserStatus;      // ACTIVE | INACTIVE | SUSPENDED | PENDING | FORMER | INVITED
  instituteUserType: InstituteUserType;  // INSTITUTE_ADMIN | TEACHER | STUDENT | ATTENDANCE_MARKER | PARENT
  verifiedBy?: string;              // FK to users.id
  verifiedAt?: Date;                // nullable
  instituteUserImageUrl?: string;   // varchar(255), nullable
  instituteCardId?: string;         // varchar(100), nullable (institute RFID card)
  imageVerificationStatus: ImageVerificationStatus;  // PENDING | VERIFIED | REJECTED
  imageVerifiedBy?: string;         // FK to users.id
  createdAt: Date;
  updatedAt: Date;
}
```

#### 5️⃣ InstituteClassStudentEntity (`institute_class_students` table)
```typescript
// File: src/modules/institute_class_modules/institute_class_student/entities/institute_class_student.entity.ts
{
  instituteId: string;         // PK, FK to institutes.id
  classId: string;             // PK, FK to institute_classes.id
  studentUserId: string;       // PK, FK to users.id
  isActive: boolean;           // default: true
  isVerified: boolean;         // default: false
  enrollmentMethod: string;    // 'manual' | 'self_enrollment' | 'teacher_assigned'
  enrollmentReason?: string;   // text, nullable
  verifiedBy?: string;         // FK to users.id
  verifiedAt?: Date;           // nullable
  createdAt: Date;
  updatedAt: Date;
}
```

#### 6️⃣ InstituteClassSubjectStudent (`institute_class_subject_students` table)
```typescript
// File: src/modules/institute_class_subject_modules/institute_class_subject_students/entities/institute_class_subject_student.entity.ts
{
  instituteId: string;         // PK, FK to institutes.id
  classId: string;             // PK, FK to institute_classes.id
  subjectId: string;           // PK, FK to subjects.id
  studentId: string;           // PK, FK to users.id
  isActive: boolean;           // default: true
  enrollmentMethod: 'teacher_assigned' | 'self_enrolled';
  enrolledBy?: string;         // FK to users.id (teacher who enrolled)
  createdAt: Date;
  updatedAt: Date;
}
```

### Enums Reference

```typescript
// UserType (Global User Type)
enum UserType {
  SUPER_ADMIN = 'SUPER_ADMIN',
  ORGANIZATION_MANAGER = 'ORGANIZATION_MANAGER',
  USER = 'USER',                      // Can be student + parent
  USER_WITHOUT_PARENT = 'USER_WITHOUT_PARENT',  // Cannot be parent
  USER_WITHOUT_STUDENT = 'USER_WITHOUT_STUDENT' // Cannot be student
}

// InstituteUserType (Role within Institute)
enum InstituteUserType {
  INSTITUTE_ADMIN = 'INSTITUTE_ADMIN',
  TEACHER = 'TEACHER',
  STUDENT = 'STUDENT',
  ATTENDANCE_MARKER = 'ATTENDANCE_MARKER',
  PARENT = 'PARENT'
}

// InstituteUserStatus
enum InstituteUserStatus {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
  SUSPENDED = 'SUSPENDED',
  PENDING = 'PENDING',
  FORMER = 'FORMER',
  INVITED = 'INVITED'
}

// ProfileCompletionStatus
enum ProfileCompletionStatus {
  INCOMPLETE = 'INCOMPLETE',  // Cannot login
  BASIC = 'BASIC',            // Limited access
  COMPLETE = 'COMPLETE'       // Full access
}

// ImageVerificationStatus
enum ImageVerificationStatus {
  PENDING = 'PENDING',
  VERIFIED = 'VERIFIED',
  REJECTED = 'REJECTED'
}

// Gender
enum Gender {
  MALE = 'MALE',
  FEMALE = 'FEMALE',
  OTHER = 'OTHER'
}

// BloodGroup
enum BloodGroup {
  A_POSITIVE = 'A+',
  A_NEGATIVE = 'A-',
  B_POSITIVE = 'B+',
  B_NEGATIVE = 'B-',
  O_POSITIVE = 'O+',
  O_NEGATIVE = 'O-',
  AB_POSITIVE = 'AB+',
  AB_NEGATIVE = 'AB-'
}
```

---

## 🔌 API Endpoints

### Base URL
```
Production: https://lmsapi.suraksha.lk
Development: http://localhost:3000
```

### Authentication
```
Authorization: Bearer <JWT_TOKEN>
Role: SUPER_ADMIN only
```

---

## 📡 1. Create Single Family Unit with Institute Enrollment

### Endpoint
```http
POST /admin/users/family-unit
```

### Request Body (Complete Structure)
```typescript
{
  // =====================================
  // 👨‍🎓 STUDENT (Required)
  // =====================================
  student: {
    // 🔴 MINIMUM REQUIRED: At least ONE of these
    email?: string;              // varchar(60), unique, lowercase
    phoneNumber?: string;        // varchar(15), auto-normalized to +94XXXXXXXXX
    
    // � AUTHENTICATION (maps to `users` table)
    password?: string;           // varchar(120), auto-hashed (bcrypt)
                                 // ✅ If provided: user can login immediately
                                 // ✅ If provided: firstLoginCompleted = true
                                 // ✅ If provided: passwordSetAt = current timestamp
    
    // �🟡 BASIC USER INFO (maps to `users` table)
    firstName?: string;          // varchar(50) - auto-generated "Unknown" if not provided
    lastName?: string;           // varchar(50) - auto-generated "User" if not provided
    nameWithInitials?: string;   // varchar(100) - auto-generated from first+last if not provided
    gender?: 'MALE' | 'FEMALE' | 'OTHER';
    dateOfBirth?: string;        // YYYY-MM-DD format
    nic?: string;                // varchar(12), unique (10 or 12 chars)
    birthCertificateNo?: string; // varchar(50), unique
    imageUrl?: string;           // varchar(255), profile image URL
    rfid?: string;               // varchar(20), unique, physical access card
    language?: 'SINHALA' | 'ENGLISH' | 'TAMIL';
    
    // 🔵 ADDRESS INFO (maps to `users` table)
    addressLine1?: string;       // varchar(200)
    addressLine2?: string;       // varchar(200)
    city?: string;               // varchar(50)
    province?: string;           // Province enum value
    district?: string;           // District enum value
    postalCode?: string;         // varchar(6)
    country?: string;            // Country enum, default: 'LK'
    
    // 🟣 STUDENT-SPECIFIC (maps to `students` table)
    studentId?: string;          // varchar(15), unique - auto-generated if not provided
    emergencyContact?: string;   // varchar(15)
    medicalConditions?: string;  // text
    allergies?: string;          // text
    bloodGroup?: 'A+' | 'A-' | 'B+' | 'B-' | 'O+' | 'O-' | 'AB+' | 'AB-';
  },

  // =====================================
  // 👨 FATHER (Optional)
  // =====================================
  father?: {
    // 🔴 MINIMUM: At least ONE required
    email?: string;
    phoneNumber?: string;
    
    // 🟢 AUTHENTICATION
    password?: string;           // If provided, father can login immediately
    
    // 🟡 USER INFO (maps to `users` table)
    firstName?: string;
    lastName?: string;
    nameWithInitials?: string;
    gender?: 'MALE' | 'FEMALE' | 'OTHER';
    dateOfBirth?: string;
    nic?: string;
    imageUrl?: string;
    rfid?: string;
    language?: 'SINHALA' | 'ENGLISH' | 'TAMIL';
    
    // 🔵 ADDRESS INFO
    addressLine1?: string;
    addressLine2?: string;
    city?: string;
    province?: string;
    district?: string;
    postalCode?: string;
    
    // 🟣 PARENT-SPECIFIC (maps to `parents` table)
    occupation?: string;         // Occupation enum value
    workplace?: string;          // varchar(100)
    workPhone?: string;          // varchar(15)
    educationLevel?: string;     // varchar(100)
  },

  // =====================================
  // 👩 MOTHER (Optional)
  // =====================================
  mother?: {
    // Same structure as father
    email?: string;
    phoneNumber?: string;
    password?: string;           // If provided, mother can login immediately
    firstName?: string;
    lastName?: string;
    nameWithInitials?: string;
    gender?: 'MALE' | 'FEMALE' | 'OTHER';
    dateOfBirth?: string;
    nic?: string;
    imageUrl?: string;
    rfid?: string;
    language?: 'SINHALA' | 'ENGLISH' | 'TAMIL';
    addressLine1?: string;
    addressLine2?: string;
    city?: string;
    province?: string;
    district?: string;
    postalCode?: string;
    occupation?: string;
    workplace?: string;
    workPhone?: string;
    educationLevel?: string;
  },

  // =====================================
  // 👤 GUARDIAN (Optional)
  // =====================================
  guardian?: {
    // Same structure as father/mother
    // ... all fields ...
    relationshipToStudent?: string;  // e.g., "Uncle", "Grandfather"
  },

  // =====================================
  // 🏫 INSTITUTE ENROLLMENTS (Optional)
  // Nested structure: Institute > Class > Subject
  // =====================================
  instituteEnrollments?: [
    {
      // 📍 INSTITUTE LEVEL (maps to `institute_user` table)
      instituteId: string;                    // REQUIRED - Institute ID
      
      // Institute User Settings
      instituteUserType?: 'STUDENT' | 'TEACHER' | 'PARENT' | 'INSTITUTE_ADMIN' | 'ATTENDANCE_MARKER';  // default: STUDENT
      userIdByInstitute?: string;             // Institute's internal ID for this user
      instituteUserImageUrl?: string;         // Photo for this institute's ID card
      instituteCardId?: string;               // Institute-specific RFID/barcode
      
      // ✅ AUTO-SET BY SYSTEM (for system admin created users):
      // status: 'ACTIVE'                     // Not PENDING - instant activation
      // verifiedBy: <admin_user_id>          // Auto-verified by system admin
      // verifiedAt: <current_timestamp>      // Verification timestamp
      // imageVerificationStatus: 'VERIFIED'  // If image provided
      
      // 📚 CLASS ENROLLMENTS (maps to `institute_class_students` table)
      classEnrollments?: [
        {
          classId: string;                    // REQUIRED - Class ID
          
          // ✅ AUTO-SET BY SYSTEM:
          // isActive: true
          // isVerified: true                 // Auto-verified
          // enrollmentMethod: 'manual'
          // verifiedBy: <admin_user_id>
          // verifiedAt: <current_timestamp>
          
          // 📖 SUBJECT ENROLLMENTS (maps to `institute_class_subject_students` table)
          subjectEnrollments?: [
            {
              subjectId: string;              // REQUIRED - Subject ID
              
              // ✅ AUTO-SET BY SYSTEM:
              // isActive: true
              // enrollmentMethod: 'teacher_assigned'
              // enrolledBy: <admin_user_id>
            }
          ];
        }
      ];
    }
  ];

  // =====================================
  // ⚙️ OPTIONS
  // =====================================
  sendWelcomeNotifications?: boolean;  // Default: true - send SMS/email with login link
  autoActivateEnrollments?: boolean;   // Default: true - auto-verify all enrollments
}
```

### Response (201 Created)
```typescript
{
  success: true,
  
  // 👨‍🎓 CREATED STUDENT
  student: {
    id: "500365",                           // users.id
    email: "student@example.com",
    phoneNumber: "+94771234567",
    firstName: "Kasun",
    lastName: "Silva",
    nameWithInitials: "K.M. Silva",
    studentId: "STU-20260123-001",          // students.student_id (auto-generated)
    userType: "USER",
    profileCompletionStatus: "INCOMPLETE",  // or "BASIC" or "COMPLETE"
    profileCompletionPercentage: 30,        // Higher if password provided
    isActive: true,
    firstLoginCompleted: false,             // ✅ true if password was provided
    hasPassword: true,                      // ✅ Indicates user can login
    needsWelcomeFlow: true                  // true if profile incomplete
  },
  
  // 👨 CREATED/MATCHED FATHER
  father: {
    id: "500366",
    parentId: "1001",                       // parents.id
    email: "father@example.com",
    phoneNumber: "+94772345678",
    firstName: "Nimal",
    userType: "USER",
    profileCompletionStatus: "INCOMPLETE",
    isExisting: false                       // false = newly created, true = existing matched
  },
  
  // 👩 CREATED/MATCHED MOTHER
  mother: {
    id: "500367",
    parentId: "1002",
    phoneNumber: "+94773456789",
    firstName: "Kamala",
    profileCompletionStatus: "INCOMPLETE",
    isExisting: false
  },
  
  // 👤 GUARDIAN
  guardian: null,
  
  // 🏫 INSTITUTE ENROLLMENTS CREATED
  instituteEnrollments: [
    {
      // Institute User Record
      instituteId: "100",
      instituteName: "Royal College",
      userId: "500365",
      instituteUserType: "STUDENT",
      status: "ACTIVE",                     // ✅ Auto-activated
      userIdByInstitute: "RC-2026-001",
      instituteUserImageUrl: "https://...",
      verifiedAt: "2026-01-23T10:30:00Z",   // ✅ Auto-verified
      verifiedBy: "1",                      // System admin ID
      
      // Class Enrollments
      classEnrollments: [
        {
          instituteId: "100",
          classId: "201",
          className: "Grade 10A",
          studentUserId: "500365",
          isActive: true,
          isVerified: true,                 // ✅ Auto-verified
          enrollmentMethod: "manual",
          verifiedAt: "2026-01-23T10:30:00Z",
          
          // Subject Enrollments
          subjectEnrollments: [
            {
              instituteId: "100",
              classId: "201",
              subjectId: "301",
              subjectName: "Mathematics",
              studentId: "500365",
              isActive: true,
              enrollmentMethod: "teacher_assigned",
              enrolledBy: "1"               // System admin ID
            },
            {
              subjectId: "302",
              subjectName: "Science",
              isActive: true
            }
          ]
        }
      ]
    }
  ],
  
  // 📧 NOTIFICATIONS SENT
  notificationsSent: {
    student: true,
    father: true,
    mother: false                           // No email for SMS-only
  },
  
  // 📊 SUMMARY
  summary: {
    usersCreated: 3,
    parentsReused: 0,
    institutesEnrolled: 1,
    classesEnrolled: 1,
    subjectsEnrolled: 2,
    allEnrollmentsActive: true,
    allEnrollmentsVerified: true
  }
}
```

---

## ✅ Validation Logic & Business Rules

### 1️⃣ User Creation Validations

#### Minimum Requirements
```typescript
// VALIDATION: At least email OR phoneNumber required per person
✅ student.email OR student.phoneNumber → REQUIRED (at least one)
✅ father.email OR father.phoneNumber → REQUIRED if father provided
✅ mother.email OR mother.phoneNumber → REQUIRED if mother provided
✅ guardian.email OR guardian.phoneNumber → REQUIRED if guardian provided
```

#### Email Validations
```typescript
// Email field validations (users.email)
✅ Format: Valid email format (regex validation)
✅ Length: Max 60 characters
✅ Unique: Must not exist in users table
✅ Transform: Auto-converted to lowercase
❌ Error: "Email already exists" (409 Conflict)
```

#### Phone Validations
```typescript
// Phone field validations (users.phone_number)
✅ Format: Sri Lankan format (0XXXXXXXXX or +94XXXXXXXXX)
✅ Normalization: Auto-converted to +94XXXXXXXXX format
✅ Length: Max 15 characters
✅ Unique: Must not exist in users table (if checking uniqueness)
❌ Error: "Phone number already exists" (409 Conflict)
```

#### NIC Validations
```typescript
// NIC field validations (users.nic)
✅ Format: 10 characters (old) OR 12 characters (new)
✅ Unique: Must not exist in users table
❌ Error: "NIC already exists" (409 Conflict)
```

#### RFID Validations
```typescript
// RFID field validations (users.rfid)
✅ Length: Max 20 characters
✅ Unique: Must not exist in users table
❌ Error: "RFID card already registered" (409 Conflict)
```

### 2️⃣ Auto-Generation Rules

```typescript
// When fields are not provided, system generates them:

// users.first_name
if (!firstName) → "Unknown"

// users.last_name
if (!lastName) → "User"

// users.name_with_initials
if (!nameWithInitials) → `${firstName.charAt(0)}. ${lastName}`

// students.student_id
if (!studentId) → `STU-YYYYMMDD-XXX` (auto-increment per day)

// users.user_type
For student → UserType.USER (can be both student & parent)
For father/mother/guardian → UserType.USER

// users.profile_completion_percentage
Calculated based on filled fields (see below)

// users.profile_completion_status
0-30% → INCOMPLETE
31-70% → BASIC
71-100% → COMPLETE
```

### 3️⃣ Profile Completion Calculation

```typescript
// Required fields for 100% completion (users table)
const PROFILE_FIELDS = {
  // Contact (20 points)
  email: 10,
  phoneNumber: 10,
  
  // Basic Info (30 points)
  firstName: 10,
  lastName: 10,
  gender: 5,
  dateOfBirth: 5,
  
  // Identification (20 points)
  nic: 10,           // OR birthCertificateNo
  birthCertificateNo: 10,
  
  // Address (20 points)
  addressLine1: 5,
  city: 5,
  district: 5,
  province: 5,
  
  // Additional (10 points)
  imageUrl: 5,
  rfid: 5
};

// Profile Status Logic
profileCompletionPercentage = sum(filled_field_points)
profileCompletionStatus = 
  percentage < 30 ? 'INCOMPLETE' :
  percentage < 70 ? 'BASIC' : 
  'COMPLETE'
```

### 4️⃣ Parent Matching Logic (Existing Parent Detection)

```typescript
// When creating father/mother/guardian:

1. CHECK BY EMAIL:
   SELECT * FROM users WHERE email = :providedEmail AND user_type IN ('USER', 'USER_WITHOUT_STUDENT')
   
2. IF NOT FOUND, CHECK BY PHONE:
   SELECT * FROM users WHERE phone_number = :normalizedPhone AND user_type IN ('USER', 'USER_WITHOUT_STUDENT')

3. IF EXISTING PARENT FOUND:
   ✅ Reuse existing user (don't create new)
   ✅ Link to student (students.father_id, mother_id, or guardian_id)
   ✅ Merge any NEW fields provided (non-destructive update)
   ✅ Response includes: isExisting: true

4. IF NO EXISTING PARENT:
   ✅ Create new user record
   ✅ Create new parent record
   ✅ Link to student
   ✅ Response includes: isExisting: false
```

### 5️⃣ Institute Enrollment Validations

```typescript
// Institute Level Validation (institute_user table)
✅ instituteId: Must exist in institutes table
❌ Error: "Institute not found" (404 Not Found)

✅ Duplicate Check: 
   SELECT * FROM institute_user 
   WHERE institute_id = :instituteId AND user_id = :userId
❌ Error: "User already enrolled in this institute" (409 Conflict)
```

```typescript
// Class Level Validation (institute_class_students table)
✅ classId: Must exist in institute_classes table
❌ Error: "Class not found" (404 Not Found)

✅ Class must belong to institute:
   SELECT * FROM institute_classes 
   WHERE id = :classId AND institute_id = :instituteId
❌ Error: "Class does not belong to specified institute" (400 Bad Request)

✅ Duplicate Check:
   SELECT * FROM institute_class_students 
   WHERE institute_id = :instituteId AND institute_class_id = :classId AND student_user_id = :userId
❌ Error: "Student already enrolled in this class" (409 Conflict)
```

```typescript
// Subject Level Validation (institute_class_subject_students table)
✅ subjectId: Must exist in subjects table
❌ Error: "Subject not found" (404 Not Found)

✅ Subject must be assigned to class:
   SELECT * FROM institute_class_subjects 
   WHERE institute_id = :instituteId AND class_id = :classId AND subject_id = :subjectId
❌ Error: "Subject not assigned to this class" (400 Bad Request)

✅ Duplicate Check:
   SELECT * FROM institute_class_subject_students 
   WHERE institute_id = :instituteId AND class_id = :classId AND subject_id = :subjectId AND student_id = :userId
❌ Error: "Student already enrolled in this subject" (409 Conflict)
```

### 6️⃣ Auto-Activation Rules (System Admin Created)

```typescript
// When autoActivateEnrollments: true (default for system admin)

// Institute User (institute_user table)
SET status = 'ACTIVE'           // Not PENDING
SET verified_by = :adminUserId
SET verified_at = NOW()
SET image_verification_status = 'VERIFIED' // If image provided

// Class Student (institute_class_students table)
SET is_active = true
SET is_verified = true          // Auto-verified
SET enrollment_method = 'manual'
SET verified_by = :adminUserId
SET verified_at = NOW()

// Subject Student (institute_class_subject_students table)
SET is_active = true
SET enrollment_method = 'teacher_assigned'
SET enrolled_by = :adminUserId
```

### 7️⃣ Error Response Format

```typescript
// Standard error response structure
{
  success: false,
  error: {
    code: "VALIDATION_ERROR" | "DUPLICATE_ERROR" | "NOT_FOUND" | "UNAUTHORIZED",
    message: "Human readable error message",
    field?: "student.email",  // Optional: which field caused error
    details?: {}              // Optional: additional error details
  }
}

// HTTP Status Codes
400 Bad Request    → Validation errors, missing required fields
401 Unauthorized   → Invalid/missing token
403 Forbidden      → Not SUPER_ADMIN role
404 Not Found      → Institute/Class/Subject not found
409 Conflict       → Duplicate email/phone/NIC/RFID
500 Server Error   → Internal error
```

---

## 💡 Complete Example Requests

### Example 1: Minimal (1% - Just Phone)
```json
{
  "student": {
    "phoneNumber": "0771234567"
  }
}
```
**Result:** Creates user with auto-generated names, profileCompletionStatus = "INCOMPLETE"

### Example 2: Basic (30% - Contact + Name)
```json
{
  "student": {
    "email": "kasun@example.com",
    "phoneNumber": "+94771234567",
    "firstName": "Kasun",
    "lastName": "Silva",
    "gender": "MALE"
  },
  "father": {
    "phoneNumber": "0772345678",
    "firstName": "Nimal"
  }
}
```

### Example 3: With Institute Enrollment (Nested Structure)
```json
{
  "student": {
    "email": "kasun@example.com",
    "phoneNumber": "+94771234567",
    "firstName": "Kasun",
    "lastName": "Silva",
    "gender": "MALE",
    "dateOfBirth": "2010-05-15",
    "rfid": "STU-RFID-001"
  },
  "father": {
    "phoneNumber": "+94772345678",
    "firstName": "Nimal",
    "lastName": "Silva",
    "rfid": "PARENT-RFID-001"
  },
  "instituteEnrollments": [
    {
      "instituteId": "100",
      "instituteUserType": "STUDENT",
      "userIdByInstitute": "RC-2026-001",
      "instituteUserImageUrl": "https://example.com/photos/kasun.jpg",
      "instituteCardId": "RC-CARD-001",
      "classEnrollments": [
        {
          "classId": "201",
          "subjectEnrollments": [
            { "subjectId": "301" },
            { "subjectId": "302" },
            { "subjectId": "303" }
          ]
        }
      ]
    }
  ],
  "sendWelcomeNotifications": true,
  "autoActivateEnrollments": true
}
```

### Example 4: Multiple Institutes
```json
{
  "student": {
    "email": "multi@example.com",
    "firstName": "Multi",
    "lastName": "Student",
    "rfid": "MULTI-001"
  },
  "instituteEnrollments": [
    {
      "instituteId": "100",
      "instituteUserType": "STUDENT",
      "userIdByInstitute": "SCHOOL-A-001",
      "classEnrollments": [
        {
          "classId": "201",
          "subjectEnrollments": [
            { "subjectId": "301" },
            { "subjectId": "302" }
          ]
        }
      ]
    },
    {
      "instituteId": "101",
      "instituteUserType": "STUDENT",
      "userIdByInstitute": "TUITION-B-001",
      "classEnrollments": [
        {
          "classId": "250",
          "subjectEnrollments": [
            { "subjectId": "350" }
          ]
        }
      ]
    }
  ]
}
```

### Example 5: Complete (100% Data)
```json
{
  "student": {
    "email": "complete.student@example.com",
    "phoneNumber": "+94771234567",
    "firstName": "Kasun",
    "lastName": "Silva",
    "nameWithInitials": "K.M. Silva",
    "gender": "MALE",
    "dateOfBirth": "2010-05-15",
    "nic": "201012345678",
    "birthCertificateNo": "BC-123456",
    "addressLine1": "123 Main Street",
    "addressLine2": "Colombo 07",
    "city": "Colombo",
    "province": "WESTERN",
    "district": "COLOMBO",
    "postalCode": "00700",
    "country": "LK",
    "imageUrl": "https://example.com/photos/kasun.jpg",
    "rfid": "STU-RFID-COMPLETE",
    "language": "ENGLISH",
    "studentId": "STU-2026-001",
    "emergencyContact": "+94772345678",
    "medicalConditions": "Asthma - mild",
    "allergies": "Peanuts",
    "bloodGroup": "A+"
  },
  "father": {
    "email": "nimal.silva@example.com",
    "phoneNumber": "+94772345678",
    "firstName": "Nimal",
    "lastName": "Silva",
    "nameWithInitials": "N.K. Silva",
    "gender": "MALE",
    "dateOfBirth": "1975-08-20",
    "nic": "197512345678",
    "addressLine1": "123 Main Street",
    "city": "Colombo",
    "province": "WESTERN",
    "district": "COLOMBO",
    "imageUrl": "https://example.com/photos/nimal.jpg",
    "rfid": "PARENT-RFID-001",
    "occupation": "ENGINEER",
    "workplace": "Tech Solutions Pvt Ltd",
    "workPhone": "+94112345678"
  },
  "mother": {
    "email": "kamala.silva@example.com",
    "phoneNumber": "+94773456789",
    "firstName": "Kamala",
    "lastName": "Silva",
    "gender": "FEMALE",
    "nic": "197812345678",
    "occupation": "TEACHER",
    "workplace": "Royal College"
  },
  "instituteEnrollments": [
    {
      "instituteId": "100",
      "instituteUserType": "STUDENT",
      "userIdByInstitute": "RC-2026-001",
      "instituteUserImageUrl": "https://example.com/id-photos/kasun.jpg",
      "instituteCardId": "RC-CARD-001",
      "classEnrollments": [
        {
          "classId": "201",
          "subjectEnrollments": [
            { "subjectId": "301" },
            { "subjectId": "302" },
            { "subjectId": "303" },
            { "subjectId": "304" },
            { "subjectId": "305" }
          ]
        }
      ]
    }
  ],
  "sendWelcomeNotifications": true,
  "autoActivateEnrollments": true
}
```

---

## 📡 2. Bulk Create Family Units

### Endpoint
```http
POST /admin/users/family-units/bulk
```

### Request Body
```typescript
{
  families: [
    {
      student: { /* ... */ },
      father?: { /* ... */ },
      mother?: { /* ... */ },
      guardian?: { /* ... */ },
      instituteEnrollments?: [ /* ... */ ]
    },
    // ... more families
  ],
  continueOnError: boolean,           // Default: true
  sendWelcomeNotifications: boolean   // Default: true
}
```

### Response (201 Created)
```typescript
{
  success: true,
  totalFamilies: 10,
  successCount: 8,
  failureCount: 2,
  results: [
    {
      index: 0,
      success: true,
      student: { id: "500365", studentId: "STU-20260123-001" },
      father: { id: "500366", isExisting: false },
      instituteEnrollments: [ /* ... */ ]
    },
    {
      index: 5,
      success: false,
      error: {
        code: "DUPLICATE_ERROR",
        message: "Student email already exists",
        field: "student.email"
      }
    }
  ]
}
```

---

## 📡 3. Get Incomplete Profiles

### Endpoint
```http
GET /admin/users/incomplete-profiles
```

### Query Parameters
```
?page=1
&limit=20
&profileStatus=INCOMPLETE,BASIC
&createdByAdminId=1
```

### Response
```typescript
{
  data: [
    {
      id: "500365",
      firstName: "Kasun",
      lastName: "Silva",
      email: "student@example.com",
      phoneNumber: "+94771234567",
      profileCompletionStatus: "INCOMPLETE",
      profileCompletionPercentage: 30,
      firstLoginCompleted: false,
      createdAt: "2026-01-23T10:30:00Z"
    }
  ],
  total: 15,
  page: 1,
  limit: 20,
  totalPages: 1
}
```

---

## 💻 Frontend Implementation

### TypeScript Types (Based on Real Entities)

```typescript
// src/types/user-management.types.ts

// ========================================
// ENUMS (Match backend exactly)
// ========================================
export enum UserType {
  SUPER_ADMIN = 'SUPER_ADMIN',
  ORGANIZATION_MANAGER = 'ORGANIZATION_MANAGER',
  USER = 'USER',
  USER_WITHOUT_PARENT = 'USER_WITHOUT_PARENT',
  USER_WITHOUT_STUDENT = 'USER_WITHOUT_STUDENT'
}

export enum InstituteUserType {
  INSTITUTE_ADMIN = 'INSTITUTE_ADMIN',
  TEACHER = 'TEACHER',
  STUDENT = 'STUDENT',
  ATTENDANCE_MARKER = 'ATTENDANCE_MARKER',
  PARENT = 'PARENT'
}

export enum InstituteUserStatus {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
  SUSPENDED = 'SUSPENDED',
  PENDING = 'PENDING',
  FORMER = 'FORMER',
  INVITED = 'INVITED'
}

export enum ProfileCompletionStatus {
  INCOMPLETE = 'INCOMPLETE',
  BASIC = 'BASIC',
  COMPLETE = 'COMPLETE'
}

export enum Gender {
  MALE = 'MALE',
  FEMALE = 'FEMALE',
  OTHER = 'OTHER'
}

export enum BloodGroup {
  A_POSITIVE = 'A+',
  A_NEGATIVE = 'A-',
  B_POSITIVE = 'B+',
  B_NEGATIVE = 'B-',
  O_POSITIVE = 'O+',
  O_NEGATIVE = 'O-',
  AB_POSITIVE = 'AB+',
  AB_NEGATIVE = 'AB-'
}

// ========================================
// REQUEST TYPES
// ========================================

/**
 * Flexible User Data - Maps to users table
 * Minimum required: email OR phoneNumber
 */
export interface FlexibleUserData {
  // 🔴 MINIMUM REQUIRED (at least ONE)
  email?: string;
  phoneNumber?: string;
  
  // 🟡 BASIC INFO (users table)
  firstName?: string;
  lastName?: string;
  nameWithInitials?: string;
  gender?: Gender;
  dateOfBirth?: string;  // YYYY-MM-DD
  nic?: string;
  birthCertificateNo?: string;
  imageUrl?: string;
  rfid?: string;
  language?: 'SINHALA' | 'ENGLISH' | 'TAMIL';
  
  // 🔵 ADDRESS (users table)
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  province?: string;
  district?: string;
  postalCode?: string;
  country?: string;
}

/**
 * Student Data - Maps to users + students tables
 */
export interface StudentData extends FlexibleUserData {
  // 🟣 STUDENT SPECIFIC (students table)
  studentId?: string;
  emergencyContact?: string;
  medicalConditions?: string;
  allergies?: string;
  bloodGroup?: BloodGroup;
}

/**
 * Parent Data - Maps to users + parents tables
 */
export interface ParentData extends FlexibleUserData {
  // 🟣 PARENT SPECIFIC (parents table)
  occupation?: string;
  workplace?: string;
  workPhone?: string;
  educationLevel?: string;
  relationshipToStudent?: string;  // For guardian only
}

/**
 * Subject Enrollment - Maps to institute_class_subject_students
 */
export interface SubjectEnrollmentRequest {
  subjectId: string;              // REQUIRED
}

/**
 * Class Enrollment - Maps to institute_class_students
 */
export interface ClassEnrollmentRequest {
  classId: string;                // REQUIRED
  subjectEnrollments?: SubjectEnrollmentRequest[];
}

/**
 * Institute Enrollment - Maps to institute_user
 */
export interface InstituteEnrollmentRequest {
  instituteId: string;            // REQUIRED
  instituteUserType?: InstituteUserType;
  userIdByInstitute?: string;
  instituteUserImageUrl?: string;
  instituteCardId?: string;
  classEnrollments?: ClassEnrollmentRequest[];
}

/**
 * Create Family Unit Request
 */
export interface CreateFamilyUnitRequest {
  student: StudentData;
  father?: ParentData;
  mother?: ParentData;
  guardian?: ParentData;
  instituteEnrollments?: InstituteEnrollmentRequest[];
  sendWelcomeNotifications?: boolean;
  autoActivateEnrollments?: boolean;
}

// ========================================
// RESPONSE TYPES
// ========================================

export interface CreatedUserResponse {
  id: string;
  email?: string;
  phoneNumber?: string;
  firstName?: string;
  lastName?: string;
  nameWithInitials?: string;
  userType: UserType;
  profileCompletionStatus: ProfileCompletionStatus;
  profileCompletionPercentage: number;
  isActive: boolean;
  firstLoginCompleted: boolean;
}

export interface CreatedStudentResponse extends CreatedUserResponse {
  studentId: string;
  needsWelcomeFlow: boolean;
}

export interface CreatedParentResponse extends CreatedUserResponse {
  parentId: string;
  isExisting: boolean;
}

export interface CreatedSubjectEnrollmentResponse {
  instituteId: string;
  classId: string;
  subjectId: string;
  subjectName?: string;
  studentId: string;
  isActive: boolean;
  enrollmentMethod: string;
  enrolledBy?: string;
}

export interface CreatedClassEnrollmentResponse {
  instituteId: string;
  classId: string;
  className?: string;
  studentUserId: string;
  isActive: boolean;
  isVerified: boolean;
  enrollmentMethod: string;
  verifiedBy?: string;
  verifiedAt?: string;
  subjectEnrollments: CreatedSubjectEnrollmentResponse[];
}

export interface CreatedInstituteEnrollmentResponse {
  instituteId: string;
  instituteName?: string;
  userId: string;
  instituteUserType: InstituteUserType;
  status: InstituteUserStatus;
  userIdByInstitute?: string;
  instituteUserImageUrl?: string;
  instituteCardId?: string;
  verifiedAt?: string;
  verifiedBy?: string;
  classEnrollments: CreatedClassEnrollmentResponse[];
}

export interface CreateFamilyUnitResponse {
  success: boolean;
  student: CreatedStudentResponse;
  father?: CreatedParentResponse;
  mother?: CreatedParentResponse;
  guardian?: CreatedParentResponse;
  instituteEnrollments: CreatedInstituteEnrollmentResponse[];
  notificationsSent: {
    student: boolean;
    father?: boolean;
    mother?: boolean;
    guardian?: boolean;
  };
  summary: {
    usersCreated: number;
    parentsReused: number;
    institutesEnrolled: number;
    classesEnrolled: number;
    subjectsEnrolled: number;
    allEnrollmentsActive: boolean;
    allEnrollmentsVerified: boolean;
  };
}

// ========================================
// ERROR TYPES
// ========================================

export interface ApiError {
  success: false;
  error: {
    code: 'VALIDATION_ERROR' | 'DUPLICATE_ERROR' | 'NOT_FOUND' | 'UNAUTHORIZED';
    message: string;
    field?: string;
    details?: Record<string, any>;
  };
}
```

### API Service

```typescript
// src/services/systemAdminUserService.ts
import api from '../api/axios';
import { 
  CreateFamilyUnitRequest, 
  CreateFamilyUnitResponse 
} from '../types/user-management.types';

class SystemAdminUserService {
  /**
   * Create a single family unit with optional institute enrollment
   */
  async createFamilyUnit(data: CreateFamilyUnitRequest): Promise<CreateFamilyUnitResponse> {
    const response = await api.post('/admin/users/family-unit', data);
    return response.data;
  }

  /**
   * Bulk create family units
   */
  async bulkCreateFamilyUnits(
    families: CreateFamilyUnitRequest[],
    options?: {
      continueOnError?: boolean;
      sendWelcomeNotifications?: boolean;
    }
  ) {
    const response = await api.post('/admin/users/family-units/bulk', {
      families,
      continueOnError: options?.continueOnError ?? true,
      sendWelcomeNotifications: options?.sendWelcomeNotifications ?? true,
    });
    return response.data;
  }

  /**
   * Get incomplete profiles
   */
  async getIncompleteProfiles(params?: {
    page?: number;
    limit?: number;
    profileStatus?: string[];
    createdByAdminId?: string;
  }) {
    const response = await api.get('/admin/users/incomplete-profiles', { params });
    return response.data;
  }

  /**
   * Resend welcome notification
   */
  async resendWelcomeNotification(userId: string) {
    const response = await api.post(`/admin/users/${userId}/resend-welcome`);
    return response.data;
  }
}

export default new SystemAdminUserService();
```

### Validation Helper

```typescript
// src/utils/familyUnitValidation.ts
import { CreateFamilyUnitRequest, ParentData } from '../types/user-management.types';

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
}

/**
 * Validate family unit request before submission
 */
export function validateFamilyUnitRequest(data: CreateFamilyUnitRequest): ValidationResult {
  const errors: string[] = [];

  // 1. Validate student (required)
  if (!data.student) {
    errors.push('Student data is required');
  } else {
    if (!data.student.email && !data.student.phoneNumber) {
      errors.push('Student must have either email or phone number');
    }
    if (data.student.email && !isValidEmail(data.student.email)) {
      errors.push('Invalid student email format');
    }
    if (data.student.phoneNumber && !isValidPhone(data.student.phoneNumber)) {
      errors.push('Invalid student phone format (use 0XXXXXXXXX or +94XXXXXXXXX)');
    }
    if (data.student.nic && !isValidNIC(data.student.nic)) {
      errors.push('Invalid NIC format (10 or 12 characters)');
    }
    if (data.student.dateOfBirth && !isValidDate(data.student.dateOfBirth)) {
      errors.push('Invalid date of birth format (use YYYY-MM-DD)');
    }
  }

  // 2. Validate father (if provided)
  if (data.father) {
    const fatherErrors = validateParent(data.father, 'Father');
    errors.push(...fatherErrors);
  }

  // 3. Validate mother (if provided)
  if (data.mother) {
    const motherErrors = validateParent(data.mother, 'Mother');
    errors.push(...motherErrors);
  }

  // 4. Validate guardian (if provided)
  if (data.guardian) {
    const guardianErrors = validateParent(data.guardian, 'Guardian');
    errors.push(...guardianErrors);
  }

  // 5. Validate institute enrollments (if provided)
  if (data.instituteEnrollments) {
    data.instituteEnrollments.forEach((enrollment, idx) => {
      if (!enrollment.instituteId) {
        errors.push(`Institute enrollment [${idx}]: instituteId is required`);
      }
      if (enrollment.classEnrollments) {
        enrollment.classEnrollments.forEach((classEnr, classIdx) => {
          if (!classEnr.classId) {
            errors.push(`Institute [${idx}] Class [${classIdx}]: classId is required`);
          }
          if (classEnr.subjectEnrollments) {
            classEnr.subjectEnrollments.forEach((subjectEnr, subjectIdx) => {
              if (!subjectEnr.subjectId) {
                errors.push(`Institute [${idx}] Class [${classIdx}] Subject [${subjectIdx}]: subjectId is required`);
              }
            });
          }
        });
      }
    });
  }

  return {
    isValid: errors.length === 0,
    errors
  };
}

function validateParent(parent: ParentData, label: string): string[] {
  const errors: string[] = [];
  
  if (!parent.email && !parent.phoneNumber) {
    errors.push(`${label} must have either email or phone number`);
  }
  if (parent.email && !isValidEmail(parent.email)) {
    errors.push(`Invalid ${label.toLowerCase()} email format`);
  }
  if (parent.phoneNumber && !isValidPhone(parent.phoneNumber)) {
    errors.push(`Invalid ${label.toLowerCase()} phone format`);
  }
  if (parent.nic && !isValidNIC(parent.nic)) {
    errors.push(`Invalid ${label.toLowerCase()} NIC format`);
  }
  
  return errors;
}

// Helper functions
function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function isValidPhone(phone: string): boolean {
  // Sri Lankan format: 0XXXXXXXXX or +94XXXXXXXXX
  return /^(\+94|0)\d{9}$/.test(phone.replace(/\s/g, ''));
}

function isValidNIC(nic: string): boolean {
  // Old format: 10 chars, New format: 12 chars
  return /^(\d{9}[VvXx]|\d{12})$/.test(nic);
}

function isValidDate(date: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(date) && !isNaN(Date.parse(date));
}
```

---

## 📊 Quick Reference

### Data Completion Levels
| Level | Data | Profile Status | Can Login |
|-------|------|----------------|-----------|
| 1% (Minimal) | Just phone OR email | INCOMPLETE | ❌ No (no password) |
| 30% (Basic) | + Name + Gender | INCOMPLETE | ❌ No (no password) |
| 50% (Partial) | + DOB + NIC + Address | BASIC | ✅ If password set |
| 70%+ (Good) | + All fields | BASIC | ✅ If password set |
| 100% (Complete) | + RFID + Image + Password + All | COMPLETE | ✅ Full |

### Password Behavior
| Password Provided | Result |
|-------------------|--------|
| ❌ No | `firstLoginCompleted: false`, user must set password via OTP |
| ✅ Yes | `firstLoginCompleted: true`, user can login immediately |
| ✅ Yes | `passwordSetAt: <timestamp>`, recorded when password was set |
| ✅ Yes | Higher `profileCompletionPercentage` (password counts toward completion) |

### Institute Enrollment Hierarchy
```
📁 Institute (institute_user)
   ├── status: ACTIVE (auto for system admin)
   ├── verifiedAt: timestamp (auto)
   │
   └── 📁 Class (institute_class_students)
       ├── isActive: true (auto)
       ├── isVerified: true (auto for system admin)
       │
       └── 📁 Subject (institute_class_subject_students)
           ├── isActive: true (auto)
           └── enrollmentMethod: 'teacher_assigned' (auto)
```

### Auto-Generated Fields
| Field | Auto-Generation Rule |
|-------|---------------------|
| `firstName` | "Unknown" if not provided |
| `lastName` | "User" if not provided |
| `nameWithInitials` | `${firstName.charAt(0)}. ${lastName}` |
| `studentId` | `STU-YYYYMMDD-XXX` |
| `profileCompletionPercentage` | Calculated from filled fields |
| `profileCompletionStatus` | Based on percentage |

---

## 🔐 Security Notes

1. **SUPER_ADMIN Only**: This API requires SUPER_ADMIN role
2. **Auto-Verification**: System admin bypasses normal verification workflows
3. **Password Optional**: Admin-created users can login immediately if password provided
4. **Password Hashing**: Passwords are automatically hashed using bcrypt (10 rounds)
5. **Welcome Flow**: Users without password complete profile on first login via OTP
6. **Audit Trail**: All actions logged with admin user ID

---

## 📝 Complete Example: Student + Parents + Institute Enrollment with Password

```json
POST /admin/users/family-unit
Authorization: Bearer <JWT_TOKEN>

{
  "student": {
    "email": "kasun.silva@example.com",
    "phoneNumber": "0771234567",
    "password": "SecurePass123!",
    "firstName": "Kasun",
    "lastName": "Silva",
    "nameWithInitials": "K.M. Silva",
    "gender": "MALE",
    "dateOfBirth": "2010-05-15",
    "nic": "201012345678",
    "rfid": "RFID001234",
    "language": "SINHALA",
    "addressLine1": "123 Main Street",
    "city": "Colombo",
    "district": "COLOMBO",
    "province": "WESTERN",
    "studentId": "RC-2026-001",
    "emergencyContact": "0777123456",
    "bloodGroup": "O+"
  },
  "father": {
    "email": "nimal.silva@example.com",
    "phoneNumber": "0772345678",
    "password": "FatherPass123!",
    "firstName": "Nimal",
    "lastName": "Silva",
    "nameWithInitials": "N.K. Silva",
    "nic": "198512345678",
    "occupation": "ENGINEER",
    "workplace": "ABC Company"
  },
  "mother": {
    "email": "kamala.silva@example.com",
    "phoneNumber": "0773456789",
    "firstName": "Kamala",
    "lastName": "Silva"
  },
  "instituteEnrollments": [
    {
      "instituteId": "100",
      "userIdByInstitute": "RC-2026-001",
      "instituteCardId": "CARD001234",
      "classEnrollments": [
        {
          "classId": "201",
          "subjectEnrollments": [
            { "subjectId": "301" },
            { "subjectId": "302" },
            { "subjectId": "303" }
          ]
        }
      ]
    }
  ],
  "sendWelcomeNotifications": true,
  "autoActivateEnrollments": true
}
```

### Response
```json
{
  "success": true,
  "student": {
    "id": "500365",
    "email": "kasun.silva@example.com",
    "firstName": "Kasun",
    "lastName": "Silva",
    "studentId": "RC-2026-001",
    "firstLoginCompleted": true,
    "hasPassword": true,
    "profileCompletionPercentage": 85
  },
  "father": {
    "id": "500366",
    "parentId": "1001",
    "email": "nimal.silva@example.com",
    "firstLoginCompleted": true,
    "isExisting": false
  },
  "mother": {
    "id": "500367",
    "parentId": "1002",
    "email": "kamala.silva@example.com",
    "firstLoginCompleted": false,
    "isExisting": false
  },
  "instituteEnrollments": [
    {
      "instituteId": "100",
      "status": "ACTIVE",
      "classEnrollments": [
        {
          "classId": "201",
          "isVerified": true,
          "subjectEnrollments": [
            { "subjectId": "301", "isActive": true },
            { "subjectId": "302", "isActive": true },
            { "subjectId": "303", "isActive": true }
          ]
        }
      ]
    }
  ],
  "summary": {
    "usersCreated": 3,
    "institutesEnrolled": 1,
    "classesEnrolled": 1,
    "subjectsEnrolled": 3
  }
}
```

---

**End of Guide**
