# 🚀 COMPREHENSIVE USER CREATION - Complete System Documentation

**Version:** 2.0.0  
**Last Updated:** November 11, 2025  
**API Endpoint:** `POST /users/comprehensive`

---

## 📋 Table of Contents

1. [Overview](#overview)
2. [UserType System](#usertype-system)
3. [API Endpoint Details](#api-endpoint-details)
4. [Complete Field Reference](#complete-field-reference)
5. [All Enum Values Reference](#all-enum-values-reference)
6. [Database Tables & Flow](#database-tables--flow)
7. [Authentication Methods](#authentication-methods)
8. [File Upload System](#file-upload-system)
9. [Update Profile Image URL](#update-profile-image-url)
10. [Complete Request Examples](#complete-request-examples)
11. [Validation Rules](#validation-rules)
12. [Error Handling](#error-handling)
13. [Parent Linking System](#parent-linking-system)
14. [Best Practices](#best-practices)
15. [Troubleshooting Guide](#troubleshooting-guide)

---

## 📖 Overview

The **Comprehensive User Creation** system is an advanced multi-table user creation API that automatically creates records across multiple database tables in a single atomic transaction based on the `userType` field.

### 🎯 Key Features

- ✅ **Multi-table atomic transactions** - All-or-nothing database operations
- ✅ **Smart parent linking** - Link via phone numbers or direct IDs
- ✅ **Signed URL file uploads** - Secure direct-to-cloud uploads
- ✅ **Empty string normalization** - Converts empty strings to `null`
- ✅ **URL path handling** - Stores relative paths, returns full URLs
- ✅ **Cache integration** - Automatic cache warming after creation
- ✅ **Comprehensive validation** - Multi-layer validation system
- ✅ **Dual authentication** - JWT Bearer or Special API Key
- ✅ **Transaction rollback** - Automatic cleanup on errors
- ✅ **Graceful notification failures** - Email/SMS failures don't block user creation

### 🏗️ System Architecture

```
┌───────────────────────────────────────────────────────────┐
│          POST /users/comprehensive                         │
│      (JWT Bearer Token OR Special API Key)                │
└───────────────────────────────────────────────────────────┘
                          │
                          ▼
            ┌──────────────────────────┐
            │  Validate DTO & UserType  │
            └──────────────────────────┘
                          │
                          ▼
            ┌──────────────────────────┐
            │  Start Database Transaction│
            └──────────────────────────┘
                          │
         ┌────────────────┼────────────────────┐
         │                │                    │
         ▼                ▼                    ▼
   ┌─────────┐      ┌──────────┐       ┌──────────┐
   │  USER   │      │  USER_   │       │  USER_   │
   │         │      │ WITHOUT_ │       │ WITHOUT_ │
   │         │      │  PARENT  │       │ STUDENT  │
   └─────────┘      └──────────┘       └──────────┘
         │                │                    │
         ▼                ▼                    ▼
   Creates 3 tables  Creates 2 tables  Creates 2 tables
   users + students  users + students  users + parents
   + parents
         │                │                    │
         └────────────────┼────────────────────┘
                          │
                          ▼
            ┌──────────────────────────┐
            │  Verify & Link Images     │
            └──────────────────────────┘
                          │
                          ▼
            ┌──────────────────────────┐
            │  Cache User Data          │
            └──────────────────────────┘
                          │
                          ▼
            ┌──────────────────────────┐
            │  Commit Transaction       │
            └──────────────────────────┘
                          │
                          ▼
            ┌──────────────────────────┐
            │  Return Success Response  │
            └──────────────────────────┘
```

---

## 🎭 UserType System

### UserType Enum Values

```typescript
export enum UserType {
  SUPERADMIN = 'SUPER_ADMIN',
  ORGANIZATION_MANAGER = 'ORGANIZATION_MANAGER',
  USER = 'USER',
  USER_WITHOUT_PARENT = 'USER_WITHOUT_PARENT',
  USER_WITHOUT_STUDENT = 'USER_WITHOUT_STUDENT'
}
```

### ⚠️ Important: Only 3 UserTypes Allowed for Creation

**❌ CANNOT Create via `/users/comprehensive`:**
- `SUPERADMIN` - System administrators (security restriction)
- `ORGANIZATION_MANAGER` - Organization managers (security restriction)

**✅ CAN Create via `/users/comprehensive`:**
- `USER` - Full flexibility user
- `USER_WITHOUT_PARENT` - Student-only user
- `USER_WITHOUT_STUDENT` - Parent-only user

---

### 1️⃣ USER (Full Flexibility)

**Description:** Can be both student AND parent to other students

**Database Tables Created:**
- ✅ `users` table (base user record)
- ✅ `students` table (student record)
- ✅ `parents` table (parent record)

**Capabilities:**
```typescript
{
  canPlayAnyInstituteRole: true,
  canBeAssignedAsParent: true,
  canPlayStudentRole: true,
  canPlayParentRole: true,
  description: 'Full flexibility - any institute role + parent assignment capabilities'
}
```

**Use Cases:**
- University students who are also parents
- Adult learners with children
- Teachers enrolled in professional development who have kids
- Working parents pursuing education

**Required Data Objects:**
- ✅ `studentData` (required)
- ✅ `parentData` (required)

**Example JSON:**
```json
{
  "userType": "USER",
  "firstName": "Sarah",
  "lastName": "Williams",
  "email": "sarah.williams@example.com",
  "phoneNumber": "+94774567890",
  "gender": "FEMALE",
  "district": "COLOMBO",
  "province": "WESTERN",
  "country": "Sri Lanka",
  "studentData": {
    "emergencyContact": "+94774567890",
    "bloodGroup": "B_POSITIVE",
    "fatherId": "parent-uuid-123",
    "motherId": "parent-uuid-456"
  },
  "parentData": {
    "occupation": "TEACHER",
    "workplace": "Royal College",
    "workPhone": "+94112234567",
    "educationLevel": "Master of Education"
  }
}
```

---

### 2️⃣ USER_WITHOUT_PARENT (Student Only)

**Description:** Can be student but CANNOT be assigned as parent to other students

**Database Tables Created:**
- ✅ `users` table (base user record)
- ✅ `students` table (student record)
- ❌ `parents` table (NOT created)

**Capabilities:**
```typescript
{
  canPlayAnyInstituteRole: true,
  canBeAssignedAsParent: false,  // ⚠️ Cannot be parent
  canPlayStudentRole: true,
  canPlayParentRole: false,
  description: 'Flexible institute role user - can be student but cannot be assigned as parent'
}
```

**Use Cases:**
- School children (primary/secondary students)
- College students without children
- Young adults in education
- Any student who will never be a parent in the system

**Required Data Objects:**
- ✅ `studentData` (required)
- ❌ `parentData` (NOT allowed - will be ignored)

**Example JSON:**
```json
{
  "userType": "USER_WITHOUT_PARENT",
  "firstName": "Michael",
  "lastName": "Brown",
  "email": "michael.brown@example.com",
  "phoneNumber": "+94775678901",
  "gender": "MALE",
  "dateOfBirth": "2010-03-15",
  "district": "KANDY",
  "province": "CENTRAL",
  "country": "Sri Lanka",
  "studentData": {
    "emergencyContact": "+94775678901",
    "medicalConditions": "Asthma - requires inhaler",
    "allergies": "Peanuts, Shellfish",
    "bloodGroup": "A_POSITIVE",
    "fatherPhoneNumber": "+94771234567",
    "motherPhoneNumber": "+94777654321"
  }
}
```

---

### 3️⃣ USER_WITHOUT_STUDENT (Parent Only)

**Description:** Can be parent to students but CANNOT be enrolled as student themselves

**Database Tables Created:**
- ✅ `users` table (base user record)
- ❌ `students` table (NOT created)
- ✅ `parents` table (parent record)

**Capabilities:**
```typescript
{
  canPlayAnyInstituteRole: false,
  canBeAssignedAsParent: true,
  canPlayStudentRole: false,  // ⚠️ Cannot be student
  canPlayParentRole: true,
  description: 'Parent-only user - can only play parent role, cannot be student'
}
```

**Use Cases:**
- Parents who only need parent account (not students themselves)
- Guardians managing student accounts
- Family members with parental responsibilities
- Sponsors or guardians

**Required Data Objects:**
- ❌ `studentData` (NOT allowed - will be ignored)
- ✅ `parentData` (required)

**Example JSON:**
```json
{
  "userType": "USER_WITHOUT_STUDENT",
  "firstName": "David",
  "lastName": "Miller",
  "email": "david.miller@example.com",
  "phoneNumber": "+94776789012",
  "gender": "MALE",
  "district": "GALLE",
  "province": "SOUTHERN",
  "country": "Sri Lanka",
  "parentData": {
    "occupation": "BUSINESS_OWNER",
    "workplace": "Miller & Sons Pvt Ltd",
    "workPhone": "+94912234567",
    "educationLevel": "Bachelor of Business Administration"
  }
}
```

---

## 🌐 API Endpoint Details

### Endpoint Information

```
POST /users/comprehensive
Content-Type: application/json
Authorization: Bearer <JWT_TOKEN> OR Bearer <SPECIAL_API_KEY>
```

### Response Format

**Success Response (201 Created):**
```json
{
  "success": true,
  "message": "User created successfully",
  "userId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
}
```

**Error Response (400 Bad Request):**
```json
{
  "statusCode": 400,
  "message": [
    "firstName must be between 1 and 50 characters",
    "email must be a valid email address",
    "studentData is required when userType is USER"
  ],
  "error": "Bad Request"
}
```

---

## 📊 Complete Field Reference

### Base User Fields (Required for ALL userTypes)

| Field | Type | Required | Length | Description | Example |
|-------|------|----------|--------|-------------|---------|
| `firstName` | string | ✅ Yes | 1-50 | First name | `"John"` |
| `lastName` | string | ✅ Yes | 1-50 | Last name | `"Doe"` |
| `email` | string | ✅ Yes | 5-60 | Email (unique, lowercase) | `"john@example.com"` |
| `phoneNumber` | string | ✅ Yes | 10-15 | Phone with country code | `"+94771234567"` |
| `userType` | UserType enum | ✅ Yes | - | User type | `"USER"` |
| `gender` | Gender enum | ✅ Yes | - | Gender | `"MALE"` |
| `district` | District enum | ✅ Yes | - | District | `"COLOMBO"` |
| `province` | Province enum | ✅ Yes | - | Province | `"WESTERN"` |
| `country` | Country enum | ✅ Yes | - | Country | `"Sri Lanka"` |

### Base User Fields (Optional)

| Field | Type | Required | Length | Description | Example |
|-------|------|----------|--------|-------------|---------|
| `dateOfBirth` | date | ❌ No | - | Birth date (YYYY-MM-DD) | `"1995-05-15"` |
| `nic` | string | ❌ No | max 12 | National ID (unique) | `"199512345678"` |
| `birthCertificateNo` | string | ❌ No | max 50 | Birth certificate (unique) | `"BC-123456789"` |
| `addressLine1` | string | ❌ No | max 50 | Address line 1 | `"123 Main Street"` |
| `addressLine2` | string | ❌ No | max 50 | Address line 2 | `"Apartment 4B"` |
| `city` | string | ❌ No | 1-50 | City name | `"Colombo"` |
| `postalCode` | string | ❌ No | exactly 5 | Postal code (digits only) | `"00100"` |
| `language` | Language enum | ❌ No | - | Preferred language | `"E"` |
| `imageUrl` | string | ❌ No | max 255 | Profile image relative path | `"profile-images/user.jpg"` |
| `idUrl` | string | ❌ No | max 255 | ID document relative path | `"id-documents/nic.pdf"` |
| `isActive` | boolean | ❌ No | - | Account status | `true` |
| `instituteId` | string | ❌ No | - | Institute ID (for SMS) | `"123"` |

---

### Student Data Fields (Required when userType = USER or USER_WITHOUT_PARENT)

| Field | Type | Required | Length | Description | Example |
|-------|------|----------|--------|-------------|---------|
| `studentId` | string | ❌ No | max 15 | Student ID (auto-generated if not provided) | `"STU-2024-001"` |
| `emergencyContact` | string | ❌ No | max 15 | Emergency phone number | `"+94771234567"` |
| `medicalConditions` | string (TEXT) | ❌ No | unlimited | Medical conditions | `"Asthma, requires inhaler"` |
| `allergies` | string (TEXT) | ❌ No | unlimited | Known allergies | `"Peanuts, Penicillin"` |
| `bloodGroup` | BloodGroup enum | ❌ No | - | Blood group | `"O_POSITIVE"` |
| `fatherId` | string (UUID) | ❌ No | - | Father's user ID | `"uuid-123"` |
| `fatherPhoneNumber` | string | ❌ No | max 15 | Father's phone (auto-fetch ID) | `"+94771234567"` |
| `motherId` | string (UUID) | ❌ No | - | Mother's user ID | `"uuid-456"` |
| `motherPhoneNumber` | string | ❌ No | max 15 | Mother's phone (auto-fetch ID) | `"+94777654321"` |
| `guardianId` | string (UUID) | ❌ No | - | Guardian's user ID | `"uuid-789"` |
| `guardianPhoneNumber` | string | ❌ No | max 15 | Guardian's phone (auto-fetch ID) | `"+94773333333"` |

**⚠️ Important Notes:**
- Either provide ID or phone number for each parent (not both)
- Phone number will be used to automatically fetch the parent's user ID
- All parent fields are optional
- Parents must have `userType = USER` or `USER_WITHOUT_STUDENT` to be linkable

---

### Parent Data Fields (Required when userType = USER or USER_WITHOUT_STUDENT)

| Field | Type | Required | Length | Description | Example |
|-------|------|----------|--------|-------------|---------|
| `occupation` | Occupation enum | ❌ No | - | Parent occupation | `"ENGINEER"` |
| `workplace` | string | ❌ No | max 100 | Workplace name | `"ABC Corporation"` |
| `workPhone` | string | ❌ No | max 15 | Work phone number | `"+94112345678"` |
| `educationLevel` | string | ❌ No | max 100 | Education level | `"Bachelor of Engineering"` |

**⚠️ Important:** All fields in `parentData` are optional.

---

## 🏷️ All Enum Values Reference

### Gender Enum
```typescript
enum Gender {
  MALE = 'MALE',
  FEMALE = 'FEMALE',
  OTHER = 'OTHER'
}
```

**Valid Values:** `"MALE"`, `"FEMALE"`, `"OTHER"`

---

### Province Enum
```typescript
enum Province {
  WESTERN = "WESTERN",
  CENTRAL = "CENTRAL",
  SOUTHERN = "SOUTHERN",
  NORTHERN = "NORTHERN",
  EASTERN = "EASTERN",
  NORTH_WESTERN = "NORTH_WESTERN",
  NORTH_CENTRAL = "NORTH_CENTRAL",
  UVA = "UVA",
  SABARAGAMUWA = "SABARAGAMUWA"
}
```

**Valid Values:**
- `"WESTERN"`
- `"CENTRAL"`
- `"SOUTHERN"`
- `"NORTHERN"`
- `"EASTERN"`
- `"NORTH_WESTERN"` (use underscore, not space)
- `"NORTH_CENTRAL"` (use underscore, not space)
- `"UVA"`
- `"SABARAGAMUWA"`

---

### District Enum (Organized by Province)

```typescript
// Western Province
"COLOMBO", "GAMPAHA", "KALUTARA"

// Central Province  
"KANDY", "MATALE", "NUWARA_ELIYA"

// Southern Province
"GALLE", "MATARA", "HAMBANTOTA"

// Northern Province
"JAFFNA", "KILINOCHCHI", "MANNAR", "MULLAITIVU", "VAVUNIYA"

// Eastern Province
"TRINCOMALEE", "BATTICALOA", "AMPARA"

// North Western Province
"KURUNEGALA", "PUTTALAM"

// North Central Province
"ANURADHAPURA", "POLONNARUWA"

// Uva Province
"BADULLA", "MONARAGALA"

// Sabaragamuwa Province
"RATNAPURA", "KEGALLE"
```

**⚠️ Important:** Use `"NUWARA_ELIYA"` with underscore, not space!

---

### Blood Group Enum
```typescript
enum BloodGroup {
  A_POSITIVE = 'A+',
  A_NEGATIVE = 'A-',
  B_POSITIVE = 'B+',
  B_NEGATIVE = 'B-',
  AB_POSITIVE = 'AB+',
  AB_NEGATIVE = 'AB-',
  O_POSITIVE = 'O+',
  O_NEGATIVE = 'O-'
}
```

**Valid Values:**
- `"A_POSITIVE"` (stored as `A+`)
- `"A_NEGATIVE"` (stored as `A-`)
- `"B_POSITIVE"` (stored as `B+`)
- `"B_NEGATIVE"` (stored as `B-`)
- `"AB_POSITIVE"` (stored as `AB+`)
- `"AB_NEGATIVE"` (stored as `AB-`)
- `"O_POSITIVE"` (stored as `O+`)
- `"O_NEGATIVE"` (stored as `O-`)

---

### Occupation Enum (Comprehensive List)

**Education & Training:**
```
TEACHER, LECTURER, PRINCIPAL, TUITION_TEACHER, SCHOOL_COUNSELOR,
TUITION_INSTITUTE_OWNER, LIBRARIAN
```

**Healthcare & Medical:**
```
NURSE, DOCTOR, PHARMACIST, LABORATORY_TECHNICIAN, MIDWIFE, DENTIST,
VETERINARY_DOCTOR, PHARMACIST_ASSISTANT, MEDICAL_REPRESENTATIVE
```

**Engineering & Technical:**
```
ENGINEER, CIVIL_ENGINEER, ARCHITECT, QUANTITY_SURVEYOR, SURVEYOR,
DRAFTSMAN, TECHNICIAN, AIR_CONDITIONING_TECHNICIAN, AUTO_ELECTRICIAN,
MOBILE_TECHNICIAN, COMPUTER_TECHNICIAN, CCTV_INSTALLER
```

**IT & Technology:**
```
IT_OFFICER, SOFTWARE_DEVELOPER, WEB_DEVELOPER, GRAPHIC_DESIGNER,
CONTENT_CREATOR, YOUTUBER, DATA_ENTRY_OPERATOR, SOCIAL_MEDIA_MARKETER
```

**Business & Finance:**
```
ACCOUNTANT, BANK_OFFICER, INSURANCE_AGENT, MARKETING_EXECUTIVE,
ENTREPRENEUR, BUSINESS_OWNER, SHOP_OWNER, BOUTIQUE_OWNER,
GROCERY_SHOP_OWNER, TAILORING_SHOP_OWNER, BEAUTY_SALON_OWNER,
BARBER_SHOP_OWNER, CONSULTANT, MANAGER, SUPERVISOR, HR_OFFICER,
HR_EXECUTIVE, PROCUREMENT_OFFICER
```

**Administrative & Clerical:**
```
CLERK, CASHIER, RECEPTIONIST, CASH_COLLECTOR, STORE_KEEPER,
STORE_MANAGER, WAREHOUSE_ASSISTANT
```

**Sales & Customer Service:**
```
SALES_EXECUTIVE, SALESMAN, SHOP_ASSISTANT, CALL_CENTER_AGENT,
CALL_CENTER_SUPERVISOR
```

**Transportation & Logistics:**
```
DRIVER, BUS_DRIVER, TUK_TUK_DRIVER, TAXI_DRIVER, HEAVY_VEHICLE_DRIVER,
DELIVERY_RIDER, DELIVERY_PARTNER, DELIVERY_HELPER, DELIVERY_DISPATCHER,
BUS_CONDUCTOR, DRIVER_ASSISTANT, CRANE_OPERATOR, FORKLIFT_OPERATOR,
BUS_OWNER, VEHICLE_INSPECTOR, BOATMAN, FERRY_OPERATOR
```

**Agriculture & Farming:**
```
FARMER, TEA_ESTATE_WORKER, RUBBER_TAPPER, COCONUT_FARMER, PADDY_FARMER,
SPICE_CULTIVATOR, VEGETABLE_CULTIVATOR, POULTRY_FARMER, LIVESTOCK_FARMER,
DAIRY_FARMER
```

**Fishing & Marine:**
```
FISHERMAN, FISHER, NET_REPAIRER, FISH_SELLER
```

**Security & Defense:**
```
POLICE_OFFICER, SOLDIER, NAVY, AIR_FORCE, SECURITY_GUARD,
SECURITY_SUPERVISOR, WATCHMAN
```

**Construction & Skilled Trades:**
```
MECHANIC, BUS_MECHANIC, LIGHT_VEHICLE_MECHANIC, ELECTRICIAN, PLUMBER,
CARPENTER, MASON, WELDER, PAINTER_BUILDING, PAINTER_VEHICLE,
CONSTRUCTION_WORKER
```

**Fashion & Beauty:**
```
TAILOR, DRESSMAKER, FASHION_DESIGNER, TAILORING_ASSISTANT, HAIRDRESSER,
BEAUTICIAN, BARBER
```

**Food & Hospitality:**
```
CHEF, COOK, BAKER, PASTRY_CHEF, WAITER, WAITRESS, HOTEL_STAFF, TOUR_GUIDE
```

**Arts & Entertainment:**
```
ARTIST, MUSICIAN, DANCER, PHOTOGRAPHER, VIDEOGRAPHER,
PHOTOGRAPHER_ASSISTANT, CAMERAMAN, ACTOR, ACTRESS, SINGER,
MUSIC_TEACHER, PAINTER_ARTIST
```

**Fitness & Sports:**
```
GYM_INSTRUCTOR, SPORTS_COACH, FITNESS_TRAINER
```

**Domestic & Personal Services:**
```
HOUSEWIFE, HOUSEMAID, DOMESTIC_WORKER, GARDENER, CLEANER, JANITOR
```

**Manual Labor & General Work:**
```
FACTORY_WORKER, LABOURER, FRUIT_SELLER, STREET_VENDOR,
SMALL_BUSINESS_VENDOR
```

**Government & Public Service:**
```
CIVIL_SERVANT, GOVERNMENT_OFFICER, GRAMA_NILADHARI, POSTMAN
```

**Legal & Professional Services:**
```
LAWYER, LEGAL_OFFICER
```

**Research & Academia:**
```
RESEARCHER, SCIENTIST
```

**Social & Community Services:**
```
SOCIAL_WORKER, NGO_WORKER, NGO_FIELD_OFFICER, VOLUNTEER_WORKER
```

**Religious & Spiritual:**
```
PRIEST, MONK, IMAM, RELIGIOUS_LEADER
```

**Media & Communication:**
```
JOURNALIST, REPORTER
```

**Property & Real Estate:**
```
LANDLORD, LANDLADY
```

**Student & Employment Status:**
```
STUDENT_SCHOOL, STUDENT_UNIVERSITY, RETIRED_PERSON, UNEMPLOYED
```

---

### Language Enum
```typescript
enum Language {
  SINHALA = 'S',
  ENGLISH = 'E',
  TAMIL = 'T'
}
```

**Valid Values:**
- `"S"` (Sinhala)
- `"E"` (English) - **Default**
- `"T"` (Tamil)

---

### Country Enum
```typescript
enum Country {
  SRI_LANKA = "Sri Lanka"
}
```

**Valid Value:** `"Sri Lanka"` (exact match required with space and capital letters)

---

## 🗄️ Database Tables & Flow

### Tables Overview

```
┌─────────────────────────────────────────────────────────────┐
│                     users (Base Table)                       │
│  Always created for all userTypes                           │
│  Fields: id, firstName, lastName, email, phoneNumber, etc.  │
└─────────────────────────────────────────────────────────────┘
                          │
         ┌────────────────┼────────────────────┐
         │                │                    │
         ▼                ▼                    ▼
┌───────────────┐  ┌───────────────┐  ┌───────────────┐
│   students    │  │   students    │  │   parents     │
│   (USER)      │  │   (USER_      │  │   (USER_      │
│               │  │   WITHOUT_    │  │   WITHOUT_    │
│               │  │   PARENT)     │  │   STUDENT)    │
└───────────────┘  └───────────────┘  └───────────────┘
         │
         ▼
┌───────────────┐
│   parents     │
│   (USER)      │
└───────────────┘
```

### Users Table Structure

```sql
CREATE TABLE users (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  first_name VARCHAR(50) NOT NULL,
  last_name VARCHAR(50) NOT NULL,
  email VARCHAR(60) NOT NULL UNIQUE,
  password VARCHAR(120) NULL,  -- Bcrypt hash, NULL for new users
  phone_number VARCHAR(15) NULL,
  user_type ENUM('SUPER_ADMIN', 'ORGANIZATION_MANAGER', 'USER', 
                 'USER_WITHOUT_PARENT', 'USER_WITHOUT_STUDENT') NOT NULL,
  date_of_birth DATE NULL,
  gender ENUM('MALE', 'FEMALE', 'OTHER') NULL,
  nic VARCHAR(12) NULL UNIQUE,
  birth_certificate_no VARCHAR(50) NULL UNIQUE,
  address_line1 VARCHAR(50) NULL,
  address_line2 VARCHAR(50) NULL,
  city VARCHAR(50) NULL,
  district ENUM(...) NULL,  -- 25 districts
  province ENUM(...) NULL,  -- 9 provinces
  postal_code VARCHAR(6) NULL,
  country ENUM('Sri Lanka') DEFAULT 'Sri Lanka',
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  image_url VARCHAR(255) NULL,  -- Relative path
  id_url VARCHAR(255) NULL,     -- Relative path
  subscription_plan ENUM('FREE', 'BASIC', 'PREMIUM') DEFAULT 'FREE',
  payment_expires_at TIMESTAMP NULL,
  telegram_id VARCHAR(20) NULL,
  rfid VARCHAR(20) NULL UNIQUE,
  language ENUM('S', 'E', 'T') DEFAULT 'E',
  
  -- Indexes
  INDEX idx_users_email_login (email),
  INDEX idx_users_phone_number (phone_number),
  INDEX idx_users_type_active (user_type, is_active),
  INDEX idx_users_gender_type (gender, user_type),
  INDEX idx_users_province (province),
  INDEX idx_users_district (district),
  INDEX idx_users_city (city),
  INDEX idx_users_nic (nic),
  INDEX idx_users_is_active (is_active)
);
```

### Students Table Structure

```sql
CREATE TABLE students (
  user_id BIGINT PRIMARY KEY,
  student_id VARCHAR(15) NULL,
  emergency_contact VARCHAR(15) NULL,
  medical_conditions TEXT NULL,
  allergies TEXT NULL,
  blood_group ENUM('A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-') NULL,
  father_id BIGINT NULL,
  mother_id BIGINT NULL,
  guardian_id BIGINT NULL,
  
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (father_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (mother_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (guardian_id) REFERENCES users(id) ON DELETE SET NULL
);
```

### Parents Table Structure

```sql
CREATE TABLE parents (
  user_id BIGINT PRIMARY KEY,
  occupation ENUM(...) NULL,  -- 200+ occupation values
  workplace VARCHAR(100) NULL,
  work_phone VARCHAR(15) NULL,
  education_level VARCHAR(100) NULL,
  
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
```

---

## 🔐 Authentication Methods

### Method 1: JWT Bearer Token (Standard)

**Use Case:** Regular API access with role-based permissions

**Header:**
```
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**Access Control:**
- ✅ `SUPERADMIN`: Can create any user type
- ✅ `ORGANIZATION_MANAGER`: Can create users in their organization
- ✅ `INSTITUTE_ADMIN`: Can create users in their institute
- ✅ `TEACHER`: Can create users in their institute

**How to Get JWT Token:**
```bash
POST /auth/login
Content-Type: application/json

{
  "email": "admin@example.com",
  "password": "your-password"
}

# Response:
{
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": { ... }
}
```

---

### Method 2: Special API Key (External Systems)

**Use Case:** External integrations (Google Apps Script, webhooks, automation)

**Header:**
```
Authorization: Bearer your-special-api-key-here
```

**Features:**
- ✅ **Bypasses all role-based access control**
- ✅ **Full access to create any user type**
- ✅ **No user context required**
- ✅ **Ideal for external integrations**

**Setup:**

1. **Generate Secure API Key:**
```bash
# Method 1: Using Node.js
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Method 2: Using OpenSSL
openssl rand -hex 32

# Output example:
# a1b2c3d4e5f67890abcdef1234567890a1b2c3d4e5f67890abcdef12345678
```

2. **Add to Environment Variables:**
```env
# .env file
SPECIAL_API_KEY=a1b2c3d4e5f67890abcdef1234567890a1b2c3d4e5f67890abcdef12345678
```

3. **Use in Requests:**
```bash
curl -X POST https://your-api.com/users/comprehensive \
  -H "Authorization: Bearer a1b2c3d4e5f67890abcdef1234567890a1b2c3d4e5f67890abcdef12345678" \
  -H "Content-Type: application/json" \
  -d '{ "firstName": "John", ... }'
```

**⚠️ Security Warning:** Keep API key secret! Never commit to version control.

---

## 📁 File Upload System

### Two-Phase Upload Process

The system uses **signed URLs** for secure, direct-to-cloud uploads without routing files through the backend server.

#### Phase 1: Get Signed URL and Upload to Cloud

**Step 1: Request Signed Upload URL**

```bash
GET /upload/get-signed-url
  ?fileName=profile.jpg
  &contentType=image/jpeg
  &maxFileSize=5
Authorization: Bearer <JWT_TOKEN>
```

**Response:**
```json
{
  "uploadUrl": "https://storage.googleapis.com/suraksha-lms/profile-images/avatar-uuid.jpg?X-Goog-Algorithm=...",
  "publicUrl": "https://storage.googleapis.com/suraksha-lms/profile-images/avatar-uuid.jpg",
  "relativePath": "profile-images/avatar-uuid.jpg",
  "expiresAt": "2024-01-15T10:40:00.000Z",
  "maxFileSize": 5242880,
  "contentType": "image/jpeg"
}
```

**Step 2: Upload File Directly to GCS**

```bash
PUT <uploadUrl>
Content-Type: image/jpeg
Content-Length: 1234567
x-goog-content-length-range: 0,5242880

[Binary file data]
```

**Important:** Must send exact `Content-Type` header that was signed.

---

#### Phase 2: Verify Upload and Create User

**Step 3: Verify File Exists**

```bash
POST /upload/verify-and-publish
Content-Type: application/json
Authorization: Bearer <JWT_TOKEN>

{
  "relativePath": "profile-images/avatar-uuid.jpg"
}
```

**Response:**
```json
{
  "success": true,
  "publicUrl": "https://storage.googleapis.com/suraksha-lms/profile-images/avatar-uuid.jpg",
  "relativePath": "profile-images/avatar-uuid.jpg"
}
```

**Step 4: Create User with Verified Image**

```bash
POST /users/comprehensive
Content-Type: application/json
Authorization: Bearer <JWT_TOKEN>

{
  "firstName": "John",
  "lastName": "Doe",
  ...
  "imageUrl": "profile-images/avatar-uuid.jpg",
  "idUrl": "id-documents/nic-uuid.pdf"
}
```

---

### File Type & Size Limits

**Profile Images:**
- **Allowed Types:** `.jpg`, `.jpeg`, `.png`
- **Max Size:** 5MB (5,242,880 bytes)
- **Folder:** `profile-images/`

**ID Documents:**
- **Allowed Types:** `.pdf`, `.jpg`, `.jpeg`, `.png`
- **Max Size:** 10MB (10,485,760 bytes)
- **Folder:** `id-documents/`

**Student Images:**
- **Allowed Types:** `.jpg`, `.jpeg`, `.png`
- **Max Size:** 3MB (3,145,728 bytes)
- **Folder:** `student-images/`

---

### URL Storage Pattern

**Database Storage:** Relative paths only
```
"profile-images/avatar-uuid.jpg"
"id-documents/nic-uuid.pdf"
```

**API Response:** Full URLs automatically
```
"https://storage.googleapis.com/suraksha-lms/profile-images/avatar-uuid.jpg"
"https://storage.googleapis.com/suraksha-lms/id-documents/nic-uuid.pdf"
```

**Transformation happens automatically via `CloudStorageService.getFullUrl()`**

---

## �️ Update Profile Image URL

After creating a user, you can update their profile image URL using the dedicated update endpoint.

### Endpoint Information

```
PATCH /users/profile/image-url
Content-Type: application/json
Authorization: Bearer <JWT_TOKEN> (SUPERADMIN only)
```

### Use Cases

- ✅ **Update existing user image** - Change profile picture after creation
- ✅ **Use external images** - Link to images hosted on other services
- ✅ **Import from external systems** - Migrate user data with existing images
- ✅ **Correct upload mistakes** - Fix wrong image paths
- ✅ **No file upload needed** - Instant update using URL/path only

---

### Method 1: Update with Relative Path (Recommended)

**Use this method when image is already uploaded to your cloud storage.**

**Request Body:**
```json
{
  "userId": "12345",
  "imageUrl": "profile-images/user-12345-uuid.jpg"
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Profile image URL updated successfully",
  "data": {
    "userId": "12345",
    "imageUrl": "https://storage.googleapis.com/suraksha-lms/profile-images/user-12345-uuid.jpg",
    "updatedAt": "2025-11-11T10:30:00.000Z"
  }
}
```

**✅ Advantages:**
- Consistent with creation flow
- Works with signed URL upload system
- Automatic URL transformation

---

### Method 2: Update with Full URL (External Images)

**Use this method for images hosted externally or already uploaded.**

**Request Body:**
```json
{
  "userId": "12345",
  "imageUrl": "https://example.com/images/profile.jpg"
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Profile image URL updated successfully",
  "data": {
    "userId": "12345",
    "imageUrl": "https://example.com/images/profile.jpg",
    "updatedAt": "2025-11-11T10:30:00.000Z"
  }
}
```

---

### Complete Update Flow

#### Option A: Update with New Upload

```
Step 1: Get Signed URL
GET /upload/get-signed-url
  ?fileName=new-profile.jpg
  &contentType=image/jpeg
  &maxFileSize=5

Step 2: Upload to Cloud Storage
PUT <uploadUrl>
[Binary file data]

Step 3: Verify Upload
POST /upload/verify-and-publish
{
  "relativePath": "profile-images/new-profile-uuid.jpg"
}

Step 4: Update User Profile
PATCH /users/profile/image-url
{
  "userId": "12345",
  "imageUrl": "profile-images/new-profile-uuid.jpg"
}
```

#### Option B: Update with External URL

```
Step 1: Update User Profile Directly
PATCH /users/profile/image-url
{
  "userId": "12345",
  "imageUrl": "https://cdn.example.com/images/user-photo.jpg"
}
```

---

### Authentication & Permissions

**Required Role:** `SUPERADMIN` only

**Why SUPERADMIN only?**
- Prevents unauthorized image changes
- Protects against malicious URL injection
- Maintains data integrity
- Centralized control over profile updates

**Authentication Header:**
```
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

---

### Validation Rules

**userId:**
- ✅ Must be a valid string
- ✅ Must not be empty
- ✅ User must exist in database
- ❌ Cannot be null or undefined

**imageUrl:**
- ✅ Must be a string
- ✅ Must not be empty
- ✅ Max length: 500 characters
- ✅ Can be relative path: `profile-images/photo.jpg`
- ✅ Can be full URL: `https://example.com/photo.jpg`
- ❌ Cannot be null or empty string

---

### Error Responses

**Error 1: User Not Found**
```json
{
  "statusCode": 404,
  "message": "User not found",
  "error": "Not Found"
}
```

**Error 2: Unauthorized (Not SUPERADMIN)**
```json
{
  "statusCode": 403,
  "message": "Insufficient permissions. SUPERADMIN role required.",
  "error": "Forbidden"
}
```

**Error 3: Invalid Request**
```json
{
  "statusCode": 400,
  "message": [
    "userId is required",
    "imageUrl must be a string",
    "imageUrl cannot exceed 500 characters"
  ],
  "error": "Bad Request"
}
```

**Error 4: Update Failed**
```json
{
  "success": false,
  "message": "Failed to update profile image URL",
  "error": "UPDATE_FAILED"
}
```

---

### Cache Behavior

**Automatic Cache Refresh:**
- ✅ User cache automatically refreshed after update
- ✅ New image URL immediately available in cached data
- ✅ If cache refresh fails, update still succeeds (non-blocking)

**Cache Key:** `user:${userId}`

---

### Complete cURL Examples

**Example 1: Update with Relative Path**
```bash
curl -X PATCH https://your-api.com/users/profile/image-url \
  -H "Authorization: Bearer YOUR_SUPERADMIN_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "12345",
    "imageUrl": "profile-images/user-12345-new.jpg"
  }'
```

**Example 2: Update with External URL**
```bash
curl -X PATCH https://your-api.com/users/profile/image-url \
  -H "Authorization: Bearer YOUR_SUPERADMIN_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "12345",
    "imageUrl": "https://cdn.example.com/avatars/user-photo.jpg"
  }'
```

**Example 3: Update Multiple Users (Loop)**
```bash
# Update multiple users with new images
for userId in "123" "456" "789"; do
  curl -X PATCH https://your-api.com/users/profile/image-url \
    -H "Authorization: Bearer YOUR_SUPERADMIN_JWT_TOKEN" \
    -H "Content-Type: application/json" \
    -d "{
      \"userId\": \"$userId\",
      \"imageUrl\": \"profile-images/user-$userId-updated.jpg\"
    }"
  echo "Updated user $userId"
done
```

---

### Google Apps Script Example

```javascript
/**
 * Update user profile image URL
 * @param {string} userId - User ID to update
 * @param {string} imageUrl - New image URL (relative path or full URL)
 */
function updateUserProfileImage(userId, imageUrl) {
  const API_URL = 'https://your-api.com/users/profile/image-url';
  const SUPERADMIN_TOKEN = 'your-superadmin-jwt-token';
  
  const payload = {
    userId: userId,
    imageUrl: imageUrl
  };
  
  const options = {
    method: 'patch',
    contentType: 'application/json',
    headers: {
      'Authorization': 'Bearer ' + SUPERADMIN_TOKEN
    },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };
  
  try {
    const response = UrlFetchApp.fetch(API_URL, options);
    const result = JSON.parse(response.getContentText());
    
    if (result.success) {
      Logger.log('✅ Image updated for user ' + userId);
      Logger.log('New image URL: ' + result.data.imageUrl);
      return result.data;
    } else {
      Logger.log('❌ Update failed: ' + result.message);
      return null;
    }
  } catch (error) {
    Logger.log('❌ Error: ' + error.message);
    return null;
  }
}

// Example usage
function updateUserImages() {
  // Update single user
  updateUserProfileImage('12345', 'profile-images/user-12345-new.jpg');
  
  // Update with external URL
  updateUserProfileImage('67890', 'https://cdn.example.com/avatars/user.jpg');
}

// Batch update from spreadsheet
function batchUpdateImages() {
  const sheet = SpreadsheetApp.getActiveSheet();
  const data = sheet.getDataRange().getValues();
  
  // Skip header row
  for (let i = 1; i < data.length; i++) {
    const userId = data[i][0];      // Column A: User ID
    const imageUrl = data[i][1];    // Column B: New Image URL
    
    if (userId && imageUrl) {
      const result = updateUserProfileImage(userId.toString(), imageUrl);
      
      // Write status to column C
      if (result) {
        sheet.getRange(i + 1, 3).setValue('✅ Updated');
        sheet.getRange(i + 1, 4).setValue(result.imageUrl);
      } else {
        sheet.getRange(i + 1, 3).setValue('❌ Failed');
      }
      
      // Avoid rate limiting
      Utilities.sleep(500);
    }
  }
}
```

---

### Node.js/TypeScript Example

```typescript
import axios from 'axios';

interface UpdateImageResponse {
  success: boolean;
  message: string;
  data: {
    userId: string;
    imageUrl: string;
    updatedAt: string;
  };
}

async function updateUserProfileImage(
  userId: string,
  imageUrl: string,
  superadminToken: string
): Promise<UpdateImageResponse> {
  try {
    const response = await axios.patch<UpdateImageResponse>(
      'https://your-api.com/users/profile/image-url',
      {
        userId,
        imageUrl
      },
      {
        headers: {
          'Authorization': `Bearer ${superadminToken}`,
          'Content-Type': 'application/json'
        }
      }
    );
    
    console.log('✅ Image updated:', response.data);
    return response.data;
    
  } catch (error) {
    if (axios.isAxiosError(error)) {
      console.error('❌ Update failed:', error.response?.data);
      throw new Error(error.response?.data?.message || 'Update failed');
    }
    throw error;
  }
}

// Example usage
async function main() {
  const token = process.env.SUPERADMIN_TOKEN!;
  
  // Update single user
  await updateUserProfileImage(
    '12345',
    'profile-images/user-12345-new.jpg',
    token
  );
  
  // Batch update
  const updates = [
    { userId: '123', imageUrl: 'profile-images/user-123.jpg' },
    { userId: '456', imageUrl: 'profile-images/user-456.jpg' },
    { userId: '789', imageUrl: 'https://cdn.example.com/user-789.jpg' }
  ];
  
  for (const update of updates) {
    await updateUserProfileImage(update.userId, update.imageUrl, token);
    await new Promise(resolve => setTimeout(resolve, 500)); // Rate limiting
  }
}

main();
```

---

### Performance Metrics

**Update Speed:**
- ⚡ Database update: ~3-5ms
- ⚡ Cache refresh: ~10-20ms
- ⚡ Total time: ~15-30ms per update

**Comparison with File Upload:**
- 📁 Full upload flow: ~2-5 seconds (get signed URL + upload + verify + update)
- 🚀 Direct URL update: ~15-30ms
- 💡 **100-200x faster** when image already exists!

---

### Important Notes

**✅ When to Use:**
- Updating existing user's image
- Migrating data from external systems
- Correcting upload mistakes
- Linking to externally hosted images

**❌ When NOT to Use:**
- Creating new users (use `POST /users/comprehensive` with `imageUrl` field)
- Regular users updating their own images (use file upload endpoints)
- Bulk creation (include `imageUrl` in creation payload)

**🔐 Security Considerations:**
- Only SUPERADMIN can update image URLs
- URL validation prevents malicious inputs
- Cache automatically refreshed to prevent stale data
- Transaction-safe updates with rollback on failure

---

## �📝 Complete Request Examples

### Example 1: USER (Student who is also a parent)

```json
{
  "firstName": "Sarah",
  "lastName": "Williams",
  "email": "sarah.williams@example.com",
  "phoneNumber": "+94774567890",
  "userType": "USER",
  "gender": "FEMALE",
  "dateOfBirth": "1992-08-20",
  "nic": "199223456789",
  "addressLine1": "45 Lake Road",
  "addressLine2": "Apartment 3B",
  "city": "Colombo",
  "district": "COLOMBO",
  "province": "WESTERN",
  "postalCode": "00300",
  "country": "Sri Lanka",
  "language": "E",
  "imageUrl": "profile-images/sarah-williams-uuid.jpg",
  "isActive": true,
  "studentData": {
    "studentId": "STU-2024-100",
    "emergencyContact": "+94774567890",
    "medicalConditions": "None",
    "allergies": "None",
    "bloodGroup": "B_POSITIVE",
    "fatherPhoneNumber": "+94771111111",
    "motherPhoneNumber": "+94772222222"
  },
  "parentData": {
    "occupation": "TEACHER",
    "workplace": "Royal College",
    "workPhone": "+94112234567",
    "educationLevel": "Master of Education"
  }
}
```

**Result:**
- ✅ Creates user in `users` table
- ✅ Creates student in `students` table (Sarah is a student)
- ✅ Creates parent in `parents` table (Sarah can be parent to other students)
- ✅ Links Sarah's parents using phone numbers

---

### Example 2: USER_WITHOUT_PARENT (Regular student)

```json
{
  "firstName": "Michael",
  "lastName": "Brown",
  "email": "michael.brown@example.com",
  "phoneNumber": "+94775678901",
  "userType": "USER_WITHOUT_PARENT",
  "gender": "MALE",
  "dateOfBirth": "2010-03-15",
  "birthCertificateNo": "BC-2010-12345",
  "addressLine1": "123 School Lane",
  "city": "Kandy",
  "district": "KANDY",
  "province": "CENTRAL",
  "postalCode": "20000",
  "country": "Sri Lanka",
  "language": "S",
  "studentData": {
    "emergencyContact": "+94775678901",
    "medicalConditions": "Asthma - requires inhaler during PE class",
    "allergies": "Peanuts, Shellfish, Penicillin",
    "bloodGroup": "A_POSITIVE",
    "fatherId": "existing-parent-uuid-123",
    "motherId": "existing-parent-uuid-456"
  }
}
```

**Result:**
- ✅ Creates user in `users` table
- ✅ Creates student in `students` table
- ❌ Does NOT create parent record (USER_WITHOUT_PARENT)
- ✅ Links to existing parents by ID

---

### Example 3: USER_WITHOUT_STUDENT (Parent only)

```json
{
  "firstName": "David",
  "lastName": "Miller",
  "email": "david.miller@example.com",
  "phoneNumber": "+94776789012",
  "userType": "USER_WITHOUT_STUDENT",
  "gender": "MALE",
  "dateOfBirth": "1975-11-30",
  "nic": "197534567890",
  "addressLine1": "78 Park Avenue",
  "addressLine2": "Apartment 5C",
  "city": "Galle",
  "district": "GALLE",
  "province": "SOUTHERN",
  "postalCode": "80000",
  "country": "Sri Lanka",
  "language": "E",
  "idUrl": "id-documents/david-miller-nic-uuid.pdf",
  "isActive": true,
  "parentData": {
    "occupation": "BUSINESS_OWNER",
    "workplace": "Miller & Sons Pvt Ltd",
    "workPhone": "+94912234567",
    "educationLevel": "Bachelor of Business Administration"
  }
}
```

**Result:**
- ✅ Creates user in `users` table
- ❌ Does NOT create student record (USER_WITHOUT_STUDENT)
- ✅ Creates parent in `parents` table
- ✅ David can now be linked as father/guardian to students

---

### Example 4: Minimal Request (USER_WITHOUT_PARENT with minimal data)

```json
{
  "firstName": "John",
  "lastName": "Doe",
  "email": "john.doe@example.com",
  "phoneNumber": "+94771234567",
  "userType": "USER_WITHOUT_PARENT",
  "gender": "MALE",
  "district": "COLOMBO",
  "province": "WESTERN",
  "country": "Sri Lanka",
  "studentData": {
    "emergencyContact": "+94771234567"
  }
}
```

**Result:** Creates user with minimal required fields.

---

## ✅ Validation Rules

### Email Validation

- ✅ Must be valid email format (`user@domain.com`)
- ✅ Automatically converted to **lowercase**
- ✅ **Unique constraint** (one email per account)
- ✅ Length: 5-60 characters
- ❌ Cannot be empty string

**Valid Examples:**
```
"john.doe@example.com"
"student123@school.edu.lk"
"parent_2024@gmail.com"
```

**Invalid Examples:**
```
"invalid.email"          ❌ Missing @domain
"@example.com"           ❌ Missing username
"user@"                  ❌ Missing domain
""                       ❌ Empty string
```

---

### Phone Number Validation

- ✅ Format: `+94771234567` (country code recommended)
- ✅ Length: 10-15 characters
- ✅ Must contain only digits (and optional `+` prefix)
- ✅ Pattern: `^\+?[0-9]{10,15}$`

**Valid Examples:**
```
"+94771234567"   ✅ With country code
"0771234567"     ✅ Local format
"94771234567"    ✅ Without + sign
```

**Invalid Examples:**
```
"077-123-4567"   ❌ Contains dashes
"+94 77 123 4567" ❌ Contains spaces
"771234567"      ❌ Only 9 digits
```

---

### NIC Validation

- ✅ Old format: `123456789V` (9 digits + V/X)
- ✅ New format: `200012345678` (12 digits)
- ✅ Optional field
- ✅ **Unique constraint** if provided
- ✅ Max length: 12 characters

**Valid Examples:**
```
"952345678V"     ✅ Old format
"199512345678"   ✅ New format (12 digits)
null             ✅ Optional - can be null
```

**Invalid Examples:**
```
"12345678"       ❌ Too short
"952345678v"     ❌ Lowercase 'v' (must be uppercase)
"95234567890V"   ❌ Too many digits
```

---

### District/Province Validation

- ✅ Must be exact **ENUM values**
- ✅ Use **underscores** for spaces: `NUWARA_ELIYA`, `NORTH_WESTERN`
- ✅ Case-sensitive (**must be UPPERCASE**)
- ❌ Cannot be empty string (converts to `null`)

**Valid Examples:**
```
"COLOMBO"          ✅
"NUWARA_ELIYA"     ✅ Use underscore
"NORTH_WESTERN"    ✅ Use underscore
```

**Invalid Examples:**
```
"colombo"          ❌ Lowercase
"Colombo"          ❌ Mixed case
"Nuwara Eliya"     ❌ Space instead of underscore
"North Western"    ❌ Space instead of underscore
""                 ⚠️ Converts to null (may cause error if column NOT NULL)
```

---

### Date Format Validation

- ✅ Format: `YYYY-MM-DD`
- ✅ Examples: `1995-05-15`, `2010-12-31`
- ❌ Not accepted: `DD/MM/YYYY`, `MM-DD-YYYY`

**Valid Examples:**
```
"1995-05-15"    ✅
"2010-12-31"    ✅
"2000-01-01"    ✅
```

**Invalid Examples:**
```
"15/05/1995"    ❌ DD/MM/YYYY format
"05-15-1995"    ❌ MM-DD-YYYY format
"1995/05/15"    ❌ Uses slashes
"15-5-1995"     ❌ No leading zeros
```

---

### Empty String Handling

**Automatic Conversion:** Empty strings (`""`) are automatically converted to `null` for these fields:

- `nic`
- `birthCertificateNo`
- `addressLine1`
- `addressLine2`
- `city`
- `district`
- `province`
- `idUrl`
- `imageUrl`

**Why?** MySQL unique indexes treat empty strings as duplicate values. Converting to `null` prevents false duplicates.

**Example:**
```json
{
  "nic": "",           // Becomes null
  "district": "",      // Becomes null
  "imageUrl": ""       // Becomes null
}
```

---

## ⚠️ Error Handling

### Common Errors & Solutions

#### Error 1: "Column 'district' cannot be null"

**Error Response:**
```json
{
  "statusCode": 500,
  "message": "Failed to create comprehensive user. Please try again.",
  "error": "Internal Server Error"
}
```

**Root Cause:** Database column `district` is `NOT NULL` but empty string was sent.

**Solution 1:** Provide valid district value
```json
{
  "district": "COLOMBO"  // ✅ Valid enum value
}
```

**Solution 2:** Update database schema to allow NULL
```sql
ALTER TABLE users MODIFY COLUMN district ENUM(...) NULL;
```

---

#### Error 2: "studentData is required when userType is USER"

**Error Response:**
```json
{
  "statusCode": 400,
  "message": [
    "studentData is required when userType is USER"
  ],
  "error": "Bad Request"
}
```

**Root Cause:** `userType` is `USER` but `studentData` object is missing.

**Solution:**
```json
{
  "userType": "USER",
  "studentData": {
    "emergencyContact": "+94771234567"
  }
}
```

---

#### Error 3: "Invalid parent reference. One or more parent IDs do not exist."

**Error Response:**
```json
{
  "statusCode": 400,
  "message": "Invalid parent reference. One or more parent IDs do not exist.",
  "error": "Bad Request"
}
```

**Database Error (Behind the Scenes):**
```
QueryFailedError: Cannot add or update a child row: a foreign key constraint fails 
(`suraksha-lms-db`.`students`, CONSTRAINT `FK_bb4d7666efc93915ddb84745244` 
FOREIGN KEY (`guardian_id`) REFERENCES `parents` (`user_id`) ON DELETE SET NULL)
```

**Root Cause:** Parent ID points to a user that either:
1. **Doesn't exist at all** in the `users` table
2. **Exists in `users` but NOT in `parents` table** ⚠️ **Most Common Issue!**

**Why This Happens:**
The `students` table has foreign key constraints that reference the `parents` table (not `users` table). If you provide a user ID that exists but doesn't have a corresponding record in the `parents` table, the database will reject it.

**Example of Wrong Parent ID:**
```json
{
  "studentData": {
    "fatherId": 1,      // User ID 1 exists BUT no record in parents table
    "motherId": 1,      // ❌ Foreign key constraint violation!
    "guardianId": 1     // ❌ Will fail!
  }
}
```

---

**✅ Solution 1: Only Use IDs of Users with Parent Records**

To be a valid parent, the user must:
- ✅ Exist in `users` table
- ✅ Have `userType = USER` or `USER_WITHOUT_STUDENT`
- ✅ Have a record in `parents` table

**Check if user has parent record:**
```sql
-- Query to check if user can be parent
SELECT u.id, u.first_name, u.user_type, 
       CASE WHEN p.user_id IS NOT NULL THEN 'YES' ELSE 'NO' END as has_parent_record
FROM users u
LEFT JOIN parents p ON u.id = p.user_id
WHERE u.id = 1;
```

**Valid parent ID example:**
```json
{
  "studentData": {
    "fatherId": 123,   // ✅ User 123 exists AND has parent record
    "motherId": 456    // ✅ User 456 exists AND has parent record
  }
}
```

---

**✅ Solution 2: Use Phone Number Lookup (Recommended)**

Let the system find valid parents automatically:

```json
{
  "studentData": {
    "fatherPhoneNumber": "+94771234567",  // System validates parent exists
    "motherPhoneNumber": "+94777654321"   // System validates parent exists
  }
}
```

**Advantages:**
- System automatically verifies parent exists
- System automatically checks parent has valid userType
- System automatically validates parent has record in parents table
- Clearer error messages if parent not found

---

**✅ Solution 3: Set Parent IDs to NULL (No Parents)**

If student has no parents or you'll add them later:

```json
{
  "studentData": {
    "fatherId": null,     // ✅ No father
    "motherId": null,     // ✅ No mother
    "guardianId": null    // ✅ No guardian
  }
}
```

**Or simply omit the fields:**
```json
{
  "studentData": {
    "emergencyContact": "+94771234567",
    "medicalConditions": "None",
    "allergies": "None"
    // No parent IDs - defaults to null
  }
}
```

---

**✅ Solution 4: Create Parents First**

If you need specific parents, create them first:

**Step 1: Create father as USER_WITHOUT_STUDENT**
```bash
POST /users/comprehensive
{
  "firstName": "John",
  "lastName": "Doe",
  "email": "john.father@example.com",
  "phoneNumber": "+94771234567",
  "userType": "USER_WITHOUT_STUDENT",  // Creates parent record
  "gender": "MALE",
  "district": "COLOMBO",
  "province": "WESTERN",
  "country": "Sri Lanka",
  "parentData": {
    "occupation": "ENGINEER",
    "workplace": "ABC Corp"
  }
}
# Response: { "userId": "123" }
```

**Step 2: Create mother as USER_WITHOUT_STUDENT**
```bash
POST /users/comprehensive
{
  "firstName": "Jane",
  "lastName": "Doe",
  "email": "jane.mother@example.com",
  "phoneNumber": "+94777654321",
  "userType": "USER_WITHOUT_STUDENT",  // Creates parent record
  "gender": "FEMALE",
  "district": "COLOMBO",
  "province": "WESTERN",
  "country": "Sri Lanka",
  "parentData": {
    "occupation": "TEACHER",
    "workplace": "XYZ School"
  }
}
# Response: { "userId": "456" }
```

**Step 3: Create student with parent IDs**
```bash
POST /users/comprehensive
{
  "firstName": "Child",
  "lastName": "Doe",
  "email": "child@example.com",
  "phoneNumber": "+94775555555",
  "userType": "USER_WITHOUT_PARENT",
  "gender": "MALE",
  "district": "COLOMBO",
  "province": "WESTERN",
  "country": "Sri Lanka",
  "studentData": {
    "fatherId": 123,  // ✅ Now exists in parents table
    "motherId": 456   // ✅ Now exists in parents table
  }
}
```

---

**🔍 Debugging Steps:**

**1. Check if user exists:**
```sql
SELECT id, first_name, last_name, user_type 
FROM users 
WHERE id IN (1, 2, 3);
```

**2. Check if user has parent record:**
```sql
SELECT u.id, u.first_name, u.user_type, p.user_id as parent_record
FROM users u
LEFT JOIN parents p ON u.id = p.user_id
WHERE u.id IN (1, 2, 3);
```

**3. Find all valid parent IDs:**
```sql
SELECT u.id, u.first_name, u.last_name, u.phone_number, u.user_type
FROM users u
INNER JOIN parents p ON u.id = p.user_id
WHERE u.user_type IN ('USER', 'USER_WITHOUT_STUDENT')
ORDER BY u.id;
```

---

**⚠️ Common Mistakes:**

**Mistake #1: Using SUPERADMIN as parent**
```json
{
  "studentData": {
    "fatherId": 1  // ❌ User 1 is SUPERADMIN (no parent record)
  }
}
```

**Mistake #2: Using USER_WITHOUT_PARENT as parent**
```json
{
  "studentData": {
    "fatherId": 5  // ❌ User 5 is USER_WITHOUT_PARENT (cannot be parent)
  }
}
```

**Mistake #3: Assuming user ID exists in parents table**
```json
{
  "studentData": {
    "fatherId": 10  // ❌ User 10 exists but has no parent record
  }
}
```

---

#### Error 4: "Email is already registered"

**Error Response:**
```json
{
  "statusCode": 409,
  "message": "Email sarah@example.com is already registered. Please use a different email.",
  "error": "Conflict"
}
```

**Root Cause:** Email already exists in `users` table (unique constraint).

**Solution:** Use different email
```json
{
  "email": "sarah.williams.2024@example.com"  // ✅ New unique email
}
```

---

#### Error 5: "Data truncated for column 'user_type'"

**Error Response:**
```json
{
  "statusCode": 500,
  "message": "Failed to create comprehensive user. Please try again."
}
```

**Root Cause:** Invalid `userType` value sent (doesn't match enum).

**Solution:** Use exact enum value
```json
{
  "userType": "USER"  // ✅ Must be exact: "USER", "USER_WITHOUT_PARENT", or "USER_WITHOUT_STUDENT"
}
```

**Common mistakes:**
```json
"userType": "STUDENT"      ❌ Doesn't exist
"userType": "user"         ❌ Must be uppercase
"userType": "User"         ❌ Must be all caps
```

---

#### Error 6: "Image file not found"

**Error Response:**
```json
{
  "statusCode": 400,
  "message": "Image file not found. Please upload the file using the signed URL first, then call this endpoint.",
  "error": "Bad Request"
}
```

**Root Cause:** `imageUrl` provided but file doesn't exist in cloud storage.

**Solution:** Follow 3-step upload process:
```
1. GET /upload/get-signed-url
2. PUT to signed URL (upload file)
3. POST /upload/verify-and-publish
4. POST /users/comprehensive with verified path
```

---

## 👨‍👩‍👧 Parent Linking System

### Two Methods to Link Parents

#### Method 1: Direct ID Linking (Fast)

Use when you already know the parent's user ID:

```json
{
  "studentData": {
    "fatherId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "motherId": "b2c3d4e5-f6a7-8901-bcde-f1234567890a",
    "guardianId": "c3d4e5f6-a7b8-9012-cdef-1234567890ab"
  }
}
```

**Advantages:**
- ✅ Fastest method
- ✅ No database lookup needed
- ✅ Direct foreign key assignment

**Requirements:**
- Parent user must already exist
- Parent must have `userType = USER` or `USER_WITHOUT_STUDENT`

---

#### Method 2: Phone Number Linking (Convenient)

Use when you only know the parent's phone number:

```json
{
  "studentData": {
    "fatherPhoneNumber": "+94771234567",
    "motherPhoneNumber": "+94777654321",
    "guardianPhoneNumber": "+94773333333"
  }
}
```

**How it works:**
1. System searches `users` table for phone number
2. If found, extracts user ID
3. Links student to that parent
4. If not found, sets parent ID to `null`

**Advantages:**
- ✅ More convenient (no need to query for IDs first)
- ✅ Human-readable
- ✅ Easier for manual data entry

**Requirements:**
- Phone number must match exactly (including country code)
- Parent user must already exist

---

### Important Rules for Parent Linking

**✅ Valid Parent UserTypes:**
- `USER` (can be both student and parent)
- `USER_WITHOUT_STUDENT` (parent-only)

**❌ Invalid Parent UserTypes:**
- `USER_WITHOUT_PARENT` (cannot be parent)
- `SUPERADMIN` (admin, not parent)
- `ORGANIZATION_MANAGER` (manager, not parent)

**⚠️ Self-Reference Prevention:**

When `userType = USER` (student + parent capabilities), the system does NOT automatically link the student record to their own parent record. This would create an invalid self-reference:

```
❌ WRONG (automatic self-link):
student.userId = 123
student.fatherId = 123  // Self-reference!

✅ CORRECT (explicit parent IDs):
student.userId = 123
student.fatherId = 456  // Different person
student.motherId = 789  // Different person
```

---

## 💡 Best Practices

### 1. Always Upload Images First (Creation) or Update Later

**During Creation:**
```javascript
// ❌ WRONG: Create user with image before uploading
const user = await createUser({
  imageUrl: "profile-images/user.jpg"  // File doesn't exist yet!
});

// ✅ CORRECT: Upload first, then create user
const signedUrl = await getSignedUploadUrl('profile.jpg', 'image/jpeg', 5);
await uploadToGCS(signedUrl.uploadUrl, fileData);
const verified = await verifyUpload(signedUrl.relativePath);

const user = await createUser({
  imageUrl: verified.relativePath  // File exists and verified
});
```

**After Creation:**
```javascript
// ✅ ALSO CORRECT: Create user first, add image later
const user = await createUser({
  firstName: "John",
  lastName: "Doe",
  // ... other fields (no imageUrl)
});

// Later: Upload and update image
const signedUrl = await getSignedUploadUrl('profile.jpg', 'image/jpeg', 5);
await uploadToGCS(signedUrl.uploadUrl, fileData);
const verified = await verifyUpload(signedUrl.relativePath);

await updateUserImage(user.userId, verified.relativePath);
```

---

### 2. Use Phone Numbers for Convenient Parent Linking

```json
// ❌ HARDER: Need to query parent IDs first
{
  "studentData": {
    "fatherId": "need-to-query-database-for-this",
    "motherId": "need-to-query-database-for-this"
  }
}

// ✅ EASIER: System handles ID lookup
{
  "studentData": {
    "fatherPhoneNumber": "+94771234567",
    "motherPhoneNumber": "+94777654321"
  }
}
```

---

### 3. Clean Data Before Sending

```javascript
// Clean empty strings to prevent database errors
const cleanData = {
  ...userData,
  district: userData.district || null,
  province: userData.province || null,
  nic: userData.nic || null,
  birthCertificateNo: userData.birthCertificateNo || null
};
```

---

### 4. Validate Data Client-Side First

```javascript
// Validate before sending to API
function validateUserData(data) {
  const errors = [];
  
  if (!data.firstName || data.firstName.length > 50) {
    errors.push('First name must be 1-50 characters');
  }
  
  if (!data.email || !data.email.includes('@')) {
    errors.push('Valid email required');
  }
  
  if (!['USER', 'USER_WITHOUT_PARENT', 'USER_WITHOUT_STUDENT'].includes(data.userType)) {
    errors.push('Invalid user type');
  }
  
  if (data.userType === 'USER' && !data.studentData) {
    errors.push('studentData required for USER type');
  }
  
  return errors;
}
```

---

### 5. Handle Errors Gracefully

```javascript
try {
  const result = await createComprehensive(userData);
  console.log('✅ User created:', result.userId);
} catch (error) {
  if (error.status === 409) {
    // Duplicate email/phone/NIC
    console.error('❌ User already exists:', error.message);
  } else if (error.status === 400) {
    // Validation errors
    console.error('❌ Validation errors:', error.message);
  } else if (error.status === 500) {
    // Server error
    console.error('❌ Server error:', error.message);
  } else {
    console.error('❌ Unexpected error:', error);
  }
}
```

---

### 6. Use Correct Enum Values

```json
// ❌ WRONG: Common mistakes
{
  "userType": "STUDENT",        // Doesn't exist
  "gender": "Male",             // Must be "MALE"
  "district": "Nuwara Eliya",   // Must be "NUWARA_ELIYA"
  "province": "North Western",  // Must be "NORTH_WESTERN"
  "bloodGroup": "O+"            // Must be "O_POSITIVE"
}

// ✅ CORRECT: Exact enum values
{
  "userType": "USER",
  "gender": "MALE",
  "district": "NUWARA_ELIYA",
  "province": "NORTH_WESTERN",
  "bloodGroup": "O_POSITIVE"
}
```

---

### 7. Store Relative Paths, Display Full URLs

```javascript
// Database stores relative path
await createUser({
  imageUrl: "profile-images/user-uuid.jpg"  // Relative path
});

// API returns full URL automatically
const user = await getUser(userId);
console.log(user.imageUrl);
// "https://storage.googleapis.com/suraksha-lms/profile-images/user-uuid.jpg"
```

---

## 🔧 Troubleshooting Guide

### Issue: "Request timeout" or slow response

**Possible Causes:**
- Large image files being processed
- Database transaction taking too long
- Network connectivity issues

**Solutions:**
- ✅ Ensure images are uploaded via signed URLs (not in request body)
- ✅ Keep request payload under 1MB
- ✅ Check database performance
- ✅ Verify network connectivity

---

### Issue: "Transaction rolled back"

**Possible Causes:**
- Database constraint violation (unique, foreign key, NOT NULL)
- Invalid enum value
- Missing required fields

**Solutions:**
- ✅ Check error message for specific constraint violation
- ✅ Verify all required fields are provided
- ✅ Ensure enum values are exact matches
- ✅ Validate parent IDs exist before linking

---

### Issue: Parent linking not working

**Error Message:**
```
Invalid parent reference. One or more parent IDs do not exist.
Foreign key constraint fails: guardian_id references parents(user_id)
```

**Possible Causes:**
1. **Parent user doesn't exist** - User ID not in database
2. **Parent exists but no parent record** - User exists in `users` but not in `parents` table (most common!)
3. **Parent has wrong `userType`** - User is SUPERADMIN or USER_WITHOUT_PARENT
4. **Phone number doesn't match** - When using phone number lookup

**Solutions:**

**1. Verify parent exists AND has parent record:**
```sql
SELECT u.id, u.first_name, u.user_type, 
       CASE WHEN p.user_id IS NOT NULL THEN 'YES' ELSE 'NO' END as has_parent_record
FROM users u
LEFT JOIN parents p ON u.id = p.user_id
WHERE u.id = YOUR_PARENT_ID;

-- Result must show has_parent_record = 'YES'
```

**2. Check parent has correct userType:**
```sql
SELECT id, first_name, last_name, user_type, phone_number
FROM users
WHERE id = YOUR_PARENT_ID
  AND user_type IN ('USER', 'USER_WITHOUT_STUDENT');
```

**3. Find all valid parent IDs:**
```sql
SELECT u.id, u.first_name, u.last_name, u.phone_number, u.user_type
FROM users u
INNER JOIN parents p ON u.id = p.user_id
WHERE u.user_type IN ('USER', 'USER_WITHOUT_STUDENT')
ORDER BY u.id;
```

**4. Use phone number lookup instead (safer):**
```json
{
  "studentData": {
    "fatherPhoneNumber": "+94771234567",
    "motherPhoneNumber": "+94777654321"
  }
}
```

**5. Create parents first if they don't exist:**
```bash
# Create father
POST /users/comprehensive
{
  "userType": "USER_WITHOUT_STUDENT",
  "parentData": { "occupation": "ENGINEER" }
}

# Then use returned userId for student
```

**6. Set to null if no parents:**
```json
{
  "studentData": {
    "fatherId": null,
    "motherId": null,
    "guardianId": null
  }
}
```

---

### Issue: Image URL not displaying

**Possible Causes:**
- Relative path stored but not transformed to full URL
- File doesn't exist in cloud storage
- CORS issues (browser blocking request)
- Wrong image path or typo

**Solutions:**
- ✅ Verify file exists: Check GCS bucket
- ✅ API automatically transforms to full URL - no action needed
- ✅ Check bucket CORS configuration if accessing from browser
- ✅ Use update endpoint to correct wrong paths: `PATCH /users/profile/image-url`

---

### Issue: Need to change user's profile image

**Solution:** Use the dedicated update endpoint

```bash
PATCH /users/profile/image-url
Authorization: Bearer <SUPERADMIN_TOKEN>
Content-Type: application/json

{
  "userId": "12345",
  "imageUrl": "profile-images/new-image.jpg"
}
```

**Requirements:**
- ✅ Must be SUPERADMIN
- ✅ User must exist
- ✅ Image URL max 500 characters
- ✅ Can be relative path or full URL

---

## 📚 Related Documentation

- [API Authentication Guide](./API_KEY_AUTHENTICATION_GUIDE.md)
- [File Upload System](./MULTER_TO_SIGNED_URL_MIGRATION.md)
- [User Validation Guide](./COMPREHENSIVE_USER_VALIDATION_GUIDE.md)
- [Security Audit](./COMPLETE_SYSTEM_SECURITY_AUDIT_2024.md)
- [JWT System](./JWT_ARCHITECTURE_GUIDE.md)

---

## 🎯 Quick Reference Card

### Minimum Required Fields

```json
{
  "firstName": "John",
  "lastName": "Doe",
  "email": "john@example.com",
  "phoneNumber": "+94771234567",
  "userType": "USER_WITHOUT_PARENT",
  "gender": "MALE",
  "district": "COLOMBO",
  "province": "WESTERN",
  "country": "Sri Lanka",
  "studentData": {
    "emergencyContact": "+94771234567"
  }
}
```

### UserType Decision Tree

```
Need student AND parent capabilities?
├─ YES → Use "USER"
│         (Creates 3 tables: users + students + parents)
└─ NO
   ├─ Need student only?
   │  └─ YES → Use "USER_WITHOUT_PARENT"
   │            (Creates 2 tables: users + students)
   └─ NO
      └─ Need parent only?
         └─ YES → Use "USER_WITHOUT_STUDENT"
                   (Creates 2 tables: users + parents)
```

### HTTP Status Codes

| Code | Meaning | Description |
|------|---------|-------------|
| 201 | Created | User successfully created |
| 400 | Bad Request | Validation error or missing required fields |
| 401 | Unauthorized | Missing or invalid authentication token |
| 403 | Forbidden | Insufficient permissions |
| 409 | Conflict | Duplicate email, phone, NIC, etc. |
| 500 | Server Error | Internal server error (check logs) |

---

## 🔄 Changelog

**Version 2.0.0 (November 11, 2025)**
- Added comprehensive enum documentation
- Added parent linking via phone numbers
- Added signed URL upload system
- Enhanced error handling
- Added dual authentication (JWT + API Key)

---

## 📞 Support

For technical support or questions:
- **Documentation:** [/docs](../docs)
- **API Endpoint:** `POST /users/comprehensive`
- **GitHub Issues:** [Create an issue](https://github.com/your-repo/issues)

---

**End of Documentation**
